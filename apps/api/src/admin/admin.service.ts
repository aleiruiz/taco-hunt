import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { Pool, PoolClient } from "pg";
import { uuidSchema } from "@taco-hunt/contracts";
import { z } from "zod";
import { DATABASE_POOL } from "../database/database.module.js";

export type QueueKind = "spots" | "tacos" | "reports";
type ModerationAction = "approve" | "reject" | "hide" | "unhide" | "close";
type SpotApproval = {
  sourceType?: "user" | "owner" | "licensed" | "fictional";
  sourceRef?: string;
  sourceLicenseRef?: string;
  verificationNote?: string;
  name?: string;
  neighborhood?: string;
  latitude?: number;
  longitude?: number;
};

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async queue(kind: QueueKind) {
    try {
      if (kind === "spots") {
        const { rows } = await this.pool.query(
          `select s.id,s.name,s.neighborhood,s.latitude::float8 as latitude,
             s.longitude::float8 as longitude,s.proposal_note as note,s.created_by as "createdBy",
             s.created_at as "createdAt"
           from app_private.spots s where s.status='pending' order by s.created_at asc limit 100`,
        );
        return { items: rows };
      }
      if (kind === "tacos") {
        const { rows } = await this.pool.query(
          `select st.id,st.spot_id as "spotId",s.name as "spotName",st.taco_type_id as "tacoTypeId",
             st.created_by as "createdBy",
             coalesce(st.display_name,tt.name_es) as name,st.created_at as "createdAt"
           from app_private.spot_tacos st join app_private.spots s on s.id=st.spot_id
           join app_private.taco_types tt on tt.id=st.taco_type_id
           where st.status='pending' order by st.created_at asc limit 100`,
        );
        return { items: rows };
      }
      const { rows } = await this.pool.query(
        `select r.id,r.target_type as "targetType",r.target_id as "targetId",r.reason,r.note,
           r.reporter_id as "reporterId",r.created_at as "createdAt",
           case when r.target_type='spot' then s.name else st.name end as "targetName"
         from app_private.reports r
         left join app_private.spots s on r.target_type='spot' and s.id=r.target_id
         left join (select rv.id,sp.name from app_private.reviews rv
           join app_private.spot_tacos st0 on st0.id=rv.spot_taco_id
           join app_private.spots sp on sp.id=st0.spot_id) st
           on r.target_type='review' and st.id=r.target_id
         where r.status='open' order by r.created_at asc limit 100`,
      );
      return { items: rows };
    } catch (error) {
      this.fail("Moderation queue query failed", error);
    }
  }

  async auditHistory(limit = 50, before?: string) {
    try {
      const cursor = decodeAuditCursor(before);
      const values: unknown[] = [];
      const filter = cursor
        ? `where (created_at,id) < ($${values.push(cursor.createdAt)},$${values.push(cursor.id)}::uuid)`
        : "";
      values.push(limit + 1);
      const { rows } = await this.pool.query(
        `select id,moderator_id as "moderatorId",target_type as "targetType",
           target_id as "targetId",action,created_at as "createdAt",internal_reason as reason
         from app_private.moderation_audit ${filter}
         order by created_at desc,id desc limit $${values.length}`,
        values,
      );
      const hasMore = rows.length > limit;
      const items = rows.slice(0, limit);
      const last = items.at(-1);
      return {
        items,
        nextBefore:
          hasMore && last
            ? Buffer.from(
                JSON.stringify({ createdAt: last.createdAt.toISOString(), id: last.id }),
              ).toString("base64url")
            : null,
      };
    } catch (error) {
      this.fail("Moderation audit query failed", error);
    }
  }

  approveSpot(id: string, moderator: string, approval: SpotApproval = {}) {
    return this.mutate("spot", id, moderator, "approve", null, approval);
  }

  rejectSpot(id: string, moderator: string, reason: string) {
    return this.mutate("spot", id, moderator, "reject", reason);
  }

  approveTaco(id: string, moderator: string) {
    return this.mutate("taco", id, moderator, "approve", null);
  }

  rejectTaco(id: string, moderator: string, reason: string) {
    return this.mutate("taco", id, moderator, "reject", reason);
  }

  hideReview(id: string, moderator: string, reason: string) {
    return this.mutate("review", id, moderator, "hide", reason);
  }

  unhideReview(id: string, moderator: string, reason: string) {
    return this.mutate("review", id, moderator, "unhide", reason);
  }

  closeReport(id: string, moderator: string, reason: string) {
    return this.mutate("report", id, moderator, "close", reason);
  }

  private async mutate(
    targetType: "spot" | "taco" | "review" | "report",
    id: string,
    moderator: string,
    action: ModerationAction,
    reason: string | null,
    approval: SpotApproval = {},
  ) {
    let client: PoolClient | undefined;
    try {
      client = await this.pool.connect();
      await client.query("begin");
      const updated = await this.applyAction(client, targetType, id, action, approval, moderator);
      if (!updated.rowCount) throw new NotFoundException("Elemento pendiente no encontrado");
      await client.query(
        `insert into app_private.moderation_audit(moderator_id,target_type,target_id,action,internal_reason)
         values($1,$2,$3,$4,$5)`,
        [moderator, targetType, id, action, reason],
      );
      await client.query("commit");
      if (targetType === "spot" && action === "approve") {
        const { rows } = await client.query(
          `select id,name,neighborhood,latitude::float8 as latitude,longitude::float8 as longitude,
             status,source_type as "sourceType",source_ref as "sourceRef",
             source_license_ref as "sourceLicenseRef",verified_by as "verifiedBy",
             verified_at as "verifiedAt",verification_note as "verificationNote",
             approved_by as "approvedBy",approved_at as "approvedAt"
           from app_private.spots where id=$1`,
          [id],
        );
        return { ...rows[0], status: statusFor(action) };
      }
      return { id, status: statusFor(action) };
    } catch (error) {
      if (client) await client.query("rollback").catch(() => undefined);
      if (error instanceof NotFoundException) throw error;
      this.fail("Moderation action failed", error);
    } finally {
      client?.release();
    }
  }

  private applyAction(
    client: PoolClient,
    type: string,
    id: string,
    action: ModerationAction,
    approval: SpotApproval,
    moderator: string,
  ) {
    if (type === "spot" && action === "approve") {
      return client.query(
        `update app_private.spots set status='approved',
           source_type=coalesce($2,source_type),source_ref=coalesce($3,source_ref),
           source_license_ref=coalesce($4,source_license_ref),verified_by=$5,verified_at=now(),
           verification_note=coalesce($6,verification_note),approved_by=$5,approved_at=now(),
           name=coalesce($7,name),normalized_name=coalesce($8,normalized_name),
           neighborhood=coalesce($9,neighborhood),latitude=coalesce($10,latitude),
           longitude=coalesce($11,longitude),updated_at=now()
         where id=$1 and status in ('pending','changes_requested')`,
        [
          id,
          approval.sourceType ?? null,
          approval.sourceRef ?? null,
          approval.sourceLicenseRef ?? null,
          moderator,
          approval.verificationNote ?? null,
          approval.name ?? null,
          approval.name ? normalizeName(approval.name) : null,
          approval.neighborhood ?? null,
          approval.latitude ?? null,
          approval.longitude ?? null,
        ],
      );
    }
    if (type === "spot" && action === "reject") {
      return client.query(
        "update app_private.spots set status='rejected',updated_at=now() where id=$1 and status='pending'",
        [id],
      );
    }
    if (type === "taco" && action === "approve") {
      return client.query(
        "update app_private.spot_tacos set status='approved' where id=$1 and status='pending'",
        [id],
      );
    }
    if (type === "taco" && action === "reject") {
      return client.query(
        "update app_private.spot_tacos set status='rejected' where id=$1 and status='pending'",
        [id],
      );
    }
    if (type === "review" && action === "hide") {
      return client.query(
        "update app_private.reviews set status='hidden',updated_at=now() where id=$1 and status='visible'",
        [id],
      );
    }
    if (type === "review" && action === "unhide") {
      return client.query(
        "update app_private.reviews set status='visible',updated_at=now() where id=$1 and status='hidden'",
        [id],
      );
    }
    if (type === "report" && action === "close") {
      return client.query(
        "update app_private.reports set status='closed',updated_at=now() where id=$1 and status='open'",
        [id],
      );
    }
    throw new ConflictException("Acción de moderación no válida");
  }

  private fail(message: string, error: unknown): never {
    if (error instanceof NotFoundException || error instanceof ConflictException) throw error;
    this.logger.error(message, error instanceof Error ? error.stack : undefined);
    throw new ServiceUnavailableException("Servicio temporalmente no disponible");
  }
}

function normalizeName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-MX")
    .trim()
    .replace(/\s+/g, " ");
}

function decodeAuditCursor(value: string | undefined) {
  if (!value) return undefined;
  try {
    const raw: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    const schema = z.object({ createdAt: z.string().datetime({ offset: true }), id: uuidSchema });
    const parsed = schema.safeParse(raw);
    if (parsed.success) return parsed.data;
  } catch {
    // Invalid opaque cursors are returned as a request validation error below.
  }
  throw new BadRequestException("Cursor de auditoría inválido");
}

function statusFor(action: ModerationAction): string {
  switch (action) {
    case "approve":
      return "approved";
    case "reject":
      return "rejected";
    case "hide":
      return "hidden";
    case "unhide":
      return "visible";
    case "close":
      return "closed";
  }
}
