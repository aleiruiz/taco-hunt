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
import { MediaStorageService } from "../media/storage.service.js";
import {
  classifyDuplicate,
  duplicateCandidateSql,
  type DuplicateCandidate,
} from "../proposals/duplicate-detector.js";

export type QueueKind = "spots" | "tacos" | "reports" | "photos" | "duplicates" | "spot-photos";
type ModerationAction =
  | "approve"
  | "reject"
  | "request_changes"
  | "hide"
  | "unhide"
  | "hide_photo"
  | "close"
  | "merge"
  | "approve_spot_photo"
  | "reject_spot_photo";
type SpotApproval = {
  confirmOwnFields?: boolean;
  name?: string;
  neighborhood?: string;
  latitude?: number;
  longitude?: number;
  sourceType?: "user" | "owner" | "licensed" | "fictional";
  sourceRef?: string;
  verifiedAt?: string;
  verificationNote?: string;
};

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly media: MediaStorageService,
  ) {}

  /** Returns up to 100 moderation items; report items omit the reporter's identity. */
  async queue(kind: QueueKind) {
    try {
      if (kind === "spots") {
        const { rows } = await this.pool.query(
          `select s.id,s.name,s.neighborhood,s.latitude::float8 as latitude,
             s.longitude::float8 as longitude,s.proposal_note as note,s.created_by as "createdBy",
             s.created_at as "createdAt",
             s.status,s.source_type as "sourceType",s.source_ref as "sourceRef",
             s.last_verified_at as "lastVerifiedAt",s.approved_by as "approvedBy",
             s.approved_at as "approvedAt",s.verified_by as "verifiedBy",
             s.verification_note as "verificationNote",
             latest.internal_reason as "moderationReason"
           from app_private.spots s
           left join lateral (
             select action,internal_reason from app_private.moderation_audit
             where target_type='spot' and target_id=s.id and action='request_changes'
             order by created_at desc,id desc limit 1
           ) latest on true
           where s.status in ('pending','changes_requested') order by s.created_at asc limit 100`,
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
      if (kind === "photos") {
        const { rows } = await this.pool.query(
          `select r.id,r.photo_key as "photoKey",r.body,r.created_at as "createdAt",
             r.user_id as "userId",s.id as "spotId",s.name as "spotName",
             coalesce(st.display_name,tt.name_es) as "tacoName"
           from app_private.reviews r
           join app_private.spot_tacos st on st.id=r.spot_taco_id
           join app_private.spots s on s.id=st.spot_id
           join app_private.taco_types tt on tt.id=st.taco_type_id
           where r.photo_key is not null and r.status='visible'
           order by r.created_at asc limit 100`,
        );
        return { items: rows };
      }
      if (kind === "spot-photos") {
        const { rows } = await this.pool.query(
          `select sp.id,sp.spot_id as "spotId",s.name as "spotName",sp.uploader_id as "uploaderId",
             coalesce(p.display_name,'Vecino de la comunidad') as "uploaderName",sp.object_key as "objectKey",
             sp.kind,sp.status,sp.rejection_reason as "rejectionReason",sp.created_at as "createdAt"
           from app_private.spot_photos sp
           join app_private.spots s on s.id=sp.spot_id
           join app_private.profiles p on p.id=sp.uploader_id
           where sp.status='pending' order by sp.created_at asc limit 100`,
        );
        const items = [];
        for (const row of rows) {
          const { objectKey, ...rest } = row as typeof row & { objectKey: string };
          const url = this.media.enabled ? await this.media.createSignedUrl(objectKey) : null;
          items.push({ ...rest, url: url ?? "", urlError: this.media.enabled && url === null });
        }
        return { items };
      }
      if (kind === "duplicates") {
        const { rows } = await this.pool.query(
          `select pending.id,pending.name,pending.neighborhood,
             pending.latitude::float8 as latitude,pending.longitude::float8 as longitude,
             pending.created_by as "createdBy",pending.created_at as "createdAt",
             approved.id as "candidateId",approved.name as "candidateName",
             (6371000 * 2 * asin(sqrt(least(1,
               power(sin(radians(pending.latitude::float8-approved.latitude::float8)/2),2) +
               cos(radians(pending.latitude::float8))*cos(radians(approved.latitude::float8))*
               power(sin(radians(pending.longitude::float8-approved.longitude::float8)/2),2)
             ))))::int as "distanceMeters"
           from app_private.spots pending join app_private.spots approved on approved.status='approved'
           where pending.status in ('pending','changes_requested') and pending.id <> approved.id
             and pending.latitude between approved.latitude - 0.002 and approved.latitude + 0.002
             and pending.longitude between approved.longitude - 0.002 and approved.longitude + 0.002
             and 6371000 * 2 * asin(sqrt(least(1,
               power(sin(radians(pending.latitude::float8-approved.latitude::float8)/2),2) +
               cos(radians(pending.latitude::float8))*cos(radians(approved.latitude::float8))*
               power(sin(radians(pending.longitude::float8-approved.longitude::float8)/2),2)
             ))) <= 100
           order by pending.created_at asc,"distanceMeters" asc limit 100`,
        );
        return { items: rows };
      }
      const { rows } = await this.pool.query(
        `select r.id,r.target_type as "targetType",r.target_id as "targetId",r.reason,r.note,
           r.created_at as "createdAt",
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

  /**
   * Returns up to ten approved spots within 100 meters, classified by normalized name.
   * @param name - Proposed spot name to compare with existing names.
   * @param latitude - Search center latitude in degrees.
   * @param longitude - Search center longitude in degrees.
   * @throws {ServiceUnavailableException} If the database query fails.
   */
  async findDuplicates(
    name: string,
    latitude: number,
    longitude: number,
  ): Promise<DuplicateCandidate[]> {
    try {
      const { rows } = await this.pool.query(duplicateCandidateSql(), [
        normalizeName(name),
        latitude,
        longitude,
      ]);
      return rows.map((candidate) => ({
        ...candidate,
        match: classifyDuplicate(name, candidate.name),
      }));
    } catch (error) {
      this.fail("Duplicate candidate query failed", error);
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

  approveSpot(id: string, moderator: string, approval: SpotApproval) {
    return this.mutate("spot", id, moderator, "approve", null, undefined, approval);
  }

  rejectSpot(id: string, moderator: string, reason: string) {
    return this.mutate("spot", id, moderator, "reject", reason);
  }

  requestSpotChanges(id: string, moderator: string, reason: string) {
    return this.mutate("spot", id, moderator, "request_changes", reason);
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

  hidePhoto(id: string, moderator: string, reason: string) {
    return this.mutate("review", id, moderator, "hide_photo", reason);
  }

  mergeDuplicate(id: string, canonicalId: string, moderator: string, reason: string) {
    return this.mutate("spot", id, moderator, "merge", reason, canonicalId);
  }

  approveSpotPhoto(id: string, moderator: string) {
    return this.mutate("spot_photo", id, moderator, "approve_spot_photo", null);
  }

  rejectSpotPhoto(id: string, moderator: string, reason: string) {
    return this.mutate("spot_photo", id, moderator, "reject_spot_photo", reason);
  }

  private async mutate(
    targetType: "spot" | "taco" | "review" | "report" | "spot_photo",
    id: string,
    moderator: string,
    action: ModerationAction,
    reason: string | null,
    canonicalId?: string,
    approval?: SpotApproval,
  ) {
    let client: PoolClient | undefined;
    try {
      client = await this.pool.connect();
      await client.query("begin");
      const updated = await this.applyAction(
        client,
        targetType,
        id,
        action,
        canonicalId,
        moderator,
        approval,
        reason,
      );
      if (!updated.rowCount) throw new NotFoundException("Elemento pendiente no encontrado");
      await client.query(
        `insert into app_private.moderation_audit(moderator_id,target_type,target_id,action,internal_reason)
         values($1,$2,$3,$4,$5)`,
        [moderator, targetType, id, action, reason],
      );
      await client.query("commit");
      return { ...(updated.rows[0] ?? {}), id, status: statusFor(action) };
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
    canonicalId?: string,
    moderator?: string,
    approval?: SpotApproval,
    reason?: string | null,
  ) {
    if (type === "spot" && action === "approve") {
      const canonicalFields = approval?.name !== undefined;
      const sourceTypeChanged = approval?.sourceType !== undefined;
      return client.query(
        `update app_private.spots
           set status='approved',
               name=case when $2 then $3 else name end,
               normalized_name=case when $2 then $4 else normalized_name end,
               neighborhood=case when $2 then $5 else neighborhood end,
               latitude=case when $2 then $6 else latitude end,
               longitude=case when $2 then $7 else longitude end,
               source_type=case when $8 then $9 else source_type end,
               source_ref=case when $8 then $10 else source_ref end,
               last_verified_at=coalesce($11::timestamptz,now()),
               approved_by=$12,approved_at=now(),verified_by=$12,
               verification_note=coalesce($13,verification_note),updated_at=now()
         where id=$1 and status in ('pending','changes_requested')
         returning id,status,source_type as "sourceType",source_ref as "sourceRef",
           last_verified_at as "lastVerifiedAt",approved_by as "approvedBy",approved_at as "approvedAt",
           verified_by as "verifiedBy",verification_note as "verificationNote"`,
        [
          id,
          canonicalFields,
          approval?.name ?? null,
          canonicalFields ? normalizeName(approval?.name ?? "") : null,
          approval?.neighborhood ?? null,
          approval?.latitude ?? null,
          approval?.longitude ?? null,
          sourceTypeChanged,
          approval?.sourceType ?? null,
          sourceTypeChanged ? (approval?.sourceRef ?? null) : null,
          approval?.verifiedAt ?? null,
          moderator,
          approval?.verificationNote ?? null,
        ],
      );
    }
    if (type === "spot" && action === "reject") {
      return client.query(
        "update app_private.spots set status='rejected',updated_at=now() where id=$1 and status in ('pending','changes_requested')",
        [id],
      );
    }
    if (type === "spot" && action === "request_changes") {
      return client.query(
        "update app_private.spots set status='changes_requested',updated_at=now() where id=$1 and status='pending'",
        [id],
      );
    }
    if (type === "spot" && action === "merge") {
      if (!canonicalId || canonicalId === id)
        throw new BadRequestException("Puesto canónico inválido");
      return client.query(
        "update app_private.spots set status='rejected',updated_at=now() where id=$1 and status in ('pending','changes_requested') and exists (select 1 from app_private.spots where id=$2 and status='approved')",
        [id, canonicalId],
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
    if (type === "review" && action === "hide_photo") {
      return client.query(
        "update app_private.reviews set photo_key=null,updated_at=now() where id=$1 and photo_key is not null",
        [id],
      );
    }
    if (type === "spot_photo" && action === "approve_spot_photo") {
      return client.query(
        "update app_private.spot_photos set status='approved',rejection_reason=null where id=$1 and status='pending'",
        [id],
      );
    }
    if (type === "spot_photo" && action === "reject_spot_photo") {
      return client.query(
        "update app_private.spot_photos set status='rejected',rejection_reason=$2 where id=$1 and status='pending'",
        [id, reason],
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
    if (
      error instanceof NotFoundException ||
      error instanceof ConflictException ||
      error instanceof BadRequestException
    )
      throw error;
    this.logger.error(message, error instanceof Error ? error.stack : undefined);
    throw new ServiceUnavailableException("Servicio temporalmente no disponible");
  }
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
    case "request_changes":
      return "changes_requested";
    case "hide":
      return "hidden";
    case "unhide":
      return "visible";
    case "close":
      return "closed";
    case "hide_photo":
      return "photo_hidden";
    case "merge":
      return "merged";
    case "approve_spot_photo":
      return "approved";
    case "reject_spot_photo":
      return "rejected";
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
