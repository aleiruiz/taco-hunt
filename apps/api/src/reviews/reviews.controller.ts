import {
  BadRequestException,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Logger,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  ServiceUnavailableException,
  UseGuards,
  Body,
} from "@nestjs/common";
import type { Pool, PoolClient } from "pg";
import {
  personalPageQuerySchema,
  reviewCreateSchema,
  reviewPatchSchema,
  uuidSchema,
} from "@taco-hunt/contracts";
import { z } from "zod";
import { AuthRequiredGuard } from "../auth/auth-required.guard.js";
import { CurrentProfile } from "../auth/current-profile.decorator.js";
import type { AuthenticatedProfile } from "../auth/auth.types.js";
import { DATABASE_POOL } from "../database/database.module.js";
import { MediaStorageService } from "../media/storage.service.js";

const reviewCreateRequestSchema = reviewCreateSchema.strict();

const reviewCursorSchema = z.object({
  createdAt: z.string().datetime({ offset: true, precision: 6 }),
  id: uuidSchema,
});

function encodeCursor(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function decodeCursor<T>(value: string | undefined, schema: z.ZodType<T>): T | undefined {
  if (!value) return undefined;
  try {
    return schema.parse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
  } catch {
    throw new BadRequestException({ message: "Cursor inválido" });
  }
}

@Controller()
@UseGuards(AuthRequiredGuard)
export class ReviewsController {
  private readonly logger = new Logger(ReviewsController.name);

  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly media: MediaStorageService,
  ) {}

  @Post("/reviews")
  async createReview(@CurrentProfile() profile: AuthenticatedProfile, @Body() body: unknown) {
    const parsed = reviewCreateRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Datos de reseña inválidos",
        details: { issues: parsed.error.issues },
      });
    }
    const client = await this.connect();
    try {
      await client.query("begin");
      const target = await client.query(
        "select st.id from app_private.spot_tacos st join app_private.spots s on s.id=st.spot_id join app_private.taco_types tt on tt.id=st.taco_type_id where st.id=$1 and st.status='approved' and s.status='approved' and tt.active for share of st,s,tt",
        [parsed.data.spotTacoId],
      );
      if (!target.rowCount) throw new NotFoundException("Taco no encontrado");
      if (parsed.data.photoUploadId && !this.media.enabled) {
        throw new ServiceUnavailableException("El almacenamiento de fotos no está configurado");
      }

      const upload = parsed.data.photoUploadId
        ? await this.claimUpload(client, profile.id, parsed.data.photoUploadId)
        : null;

      const result = await client.query(
        'insert into app_private.reviews (user_id,spot_taco_id,tortilla,filling,salsa,value,price_paid_mxn,body,photo_key) values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id,spot_taco_id as "spotTacoId",tortilla,filling,salsa,value,round((tortilla+filling+salsa+value)/4.0::numeric,1)::float8 as score,price_paid_mxn::float8 as "pricePaidMxn",body,status,created_at as "createdAt",updated_at as "updatedAt"',
        [
          profile.id,
          parsed.data.spotTacoId,
          parsed.data.tortilla,
          parsed.data.filling,
          parsed.data.salsa,
          parsed.data.value,
          parsed.data.pricePaidMxn ?? null,
          parsed.data.body ?? null,
          upload?.objectKey ?? null,
        ],
      );
      if (upload) {
        await client.query(
          "update app_private.media_uploads set state='claimed',claimed_review_id=$1 where id=$2 and state='pending'",
          [result.rows[0].id, upload.id],
        );
      }
      await client.query("commit");
      return result.rows[0];
    } catch (error) {
      await this.rollback(client);
      if (error instanceof NotFoundException) throw error;
      if (isUniqueViolation(error)) {
        const existing = await this.pool.query(
          'select id as "reviewId" from app_private.reviews where user_id=$1 and spot_taco_id=$2',
          [profile.id, parsed.data.spotTacoId],
        );
        throw new ConflictException({
          message: "Ya tienes una reseña para este taco",
          details: existing.rows[0] ?? {},
        });
      }
      this.logQueryFailure("Review create query failed", error);
      throw new ServiceUnavailableException("Servicio temporalmente no disponible");
    } finally {
      client.release();
    }
  }

  @Patch("/reviews/:id")
  async updateReview(
    @CurrentProfile() profile: AuthenticatedProfile,
    @Param("id") rawId: string,
    @Body() body: unknown,
  ) {
    const id = this.parseId(rawId);
    const parsed = reviewPatchSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Datos de reseña inválidos",
        details: { issues: parsed.error.issues },
      });
    }

    const fields: Record<string, string> = {
      tortilla: "tortilla",
      filling: "filling",
      salsa: "salsa",
      value: "value",
      pricePaidMxn: "price_paid_mxn",
      body: "body",
      photoUploadId: "photo_key",
    };
    const client = await this.connect();
    try {
      await client.query("begin");
      const current = await client.query(
        "select photo_key from app_private.reviews where id=$1 and user_id=$2 for update",
        [id, profile.id],
      );
      if (!current.rowCount) throw new NotFoundException("Reseña no encontrada");
      if (parsed.data.photoUploadId && !this.media.enabled) {
        throw new ServiceUnavailableException("El almacenamiento de fotos no está configurado");
      }

      let photoKey = current.rows[0].photo_key as string | null;
      const oldPhotoKey = photoKey;
      let upload: { id: string; objectKey: string } | null = null;
      if (Object.hasOwn(parsed.data, "photoUploadId")) {
        if (parsed.data.photoUploadId === null) photoKey = null;
        else if (parsed.data.photoUploadId) {
          upload = await this.claimUpload(client, profile.id, parsed.data.photoUploadId);
          photoKey = upload.objectKey;
        }
      }

      const values: unknown[] = [];
      const updates: string[] = [];
      for (const [key, value] of Object.entries(parsed.data)) {
        if (key === "photoUploadId") continue;
        values.push(value);
        updates.push(`${fields[key]}=$${values.length}`);
      }
      if (Object.hasOwn(parsed.data, "photoUploadId")) {
        values.push(photoKey);
        updates.push(`photo_key=$${values.length}`);
      }
      updates.push("updated_at=now()");
      values.push(id, profile.id);
      const result = await client.query(
        `update app_private.reviews set ${updates.join(",")} where id=$${values.length - 1} and user_id=$${values.length} returning id,spot_taco_id as "spotTacoId",tortilla,filling,salsa,value,round((tortilla+filling+salsa+value)/4.0::numeric,1)::float8 as score,price_paid_mxn::float8 as "pricePaidMxn",body,status,created_at as "createdAt",updated_at as "updatedAt"`,
        values,
      );
      if (upload) {
        await client.query(
          "update app_private.media_uploads set state='claimed',claimed_review_id=$1 where id=$2 and state='pending'",
          [id, upload.id],
        );
      }
      if (oldPhotoKey && oldPhotoKey !== photoKey) {
        await client.query(
          "update app_private.media_uploads set state='deleted',claimed_review_id=null,created_at=now() where object_key=$1",
          [oldPhotoKey],
        );
      }
      await client.query("commit");
      if (oldPhotoKey && oldPhotoKey !== photoKey) {
        await this.deletePhotoObject(oldPhotoKey);
      }
      return result.rows[0];
    } catch (error) {
      await this.rollback(client);
      if (error instanceof NotFoundException) throw error;
      if (error instanceof ConflictException) throw error;
      if (error instanceof BadRequestException) throw error;
      this.logQueryFailure("Review update query failed", error);
      throw new ServiceUnavailableException("Servicio temporalmente no disponible");
    } finally {
      client.release();
    }
  }

  @Delete("/reviews/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteReview(@CurrentProfile() profile: AuthenticatedProfile, @Param("id") rawId: string) {
    const id = this.parseId(rawId);
    const client = await this.connect();
    try {
      await client.query("begin");
      const row = await client.query(
        "delete from app_private.reviews where id=$1 and user_id=$2 returning photo_key",
        [id, profile.id],
      );
      await client.query("commit");
      if (row.rows[0]?.photo_key) {
        await this.pool.query(
          "update app_private.media_uploads set state='deleted',claimed_review_id=null,created_at=now() where claimed_review_id=$1",
          [id],
        );
        await this.deletePhotoObject(row.rows[0].photo_key);
      }
    } catch (error) {
      await this.rollback(client);
      this.logQueryFailure("Review delete query failed", error);
      throw new ServiceUnavailableException("Servicio temporalmente no disponible");
    } finally {
      client.release();
    }
  }

  @Get("/me/reviews")
  async listMyReviews(
    @CurrentProfile() profile: AuthenticatedProfile,
    @Query() query: Record<string, unknown>,
  ) {
    const parsed = personalPageQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Parámetros inválidos",
        details: { issues: parsed.error.issues },
      });
    }
    const after = decodeCursor(parsed.data.cursor, reviewCursorSchema);
    const values: unknown[] = [profile.id];
    const filters = ["r.user_id=$1"];
    if (after) {
      values.push(after.createdAt, after.id);
      filters.push(`(r.created_at,r.id) < ($${values.length - 1},$${values.length}::uuid)`);
    }
    values.push(parsed.data.limit + 1);

    try {
      const { rows } = await this.pool.query(
        `select r.id,r.spot_taco_id as "spotTacoId",case when s.status='approved' then s.id else null end as "spotId",case when s.status='approved' then s.name else 'Puesto no disponible' end as "spotName",case when s.status='approved' then s.neighborhood else 'No disponible' end as neighborhood,case when s.status='approved' and st.status='approved' and tt.active then tt.id else null end as "tacoTypeId",case when s.status='approved' and st.status='approved' and tt.active then coalesce(st.display_name,tt.name_es) else 'Taco no disponible' end as "tacoName",r.tortilla,r.filling,r.salsa,r.value,round((r.tortilla+r.filling+r.salsa+r.value)/4.0::numeric,1)::float8 as score,r.price_paid_mxn::float8 as "pricePaidMxn",r.body,r.status,to_char(r.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as "createdAt",to_char(r.updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as "updatedAt" from app_private.reviews r join app_private.spot_tacos st on st.id=r.spot_taco_id join app_private.spots s on s.id=st.spot_id join app_private.taco_types tt on tt.id=st.taco_type_id where ${filters.join(" and ")} order by r.created_at desc,r.id desc limit $${values.length}`,
        values,
      );
      const more = rows.length > parsed.data.limit;
      const items = rows.slice(0, parsed.data.limit);
      const last = items.at(-1);
      return {
        items,
        nextCursor: more && last ? encodeCursor({ createdAt: last.createdAt, id: last.id }) : null,
      };
    } catch (error) {
      this.logQueryFailure("Own review history query failed", error);
      throw new ServiceUnavailableException("Servicio temporalmente no disponible");
    }
  }

  private parseId(rawId: string): string {
    const parsed = uuidSchema.safeParse(rawId);
    if (!parsed.success) throw new BadRequestException("Identificador inválido");
    return parsed.data;
  }

  private async connect(): Promise<PoolClient> {
    try {
      return await this.pool.connect();
    } catch (error) {
      this.logQueryFailure("Review database connection failed", error);
      throw new ServiceUnavailableException("Servicio temporalmente no disponible");
    }
  }

  private async rollback(client: PoolClient): Promise<void> {
    try {
      await client.query("rollback");
    } catch (error) {
      this.logQueryFailure("Review transaction rollback failed", error);
    }
  }

  private async claimUpload(
    client: PoolClient,
    ownerId: string,
    uploadId: string,
  ): Promise<{ id: string; objectKey: string }> {
    const upload = await client.query<{ id: string; object_key: string }>(
      "select id,object_key from app_private.media_uploads where id=$1 and owner_id=$2 and state='pending' for update",
      [uploadId, ownerId],
    );
    if (!upload.rowCount) {
      throw new ConflictException("La carga no existe, pertenece a otra cuenta o ya fue usada");
    }
    return { id: upload.rows[0].id, objectKey: upload.rows[0].object_key };
  }

  private async deletePhotoObject(objectKey: string): Promise<void> {
    try {
      await this.media.remove([objectKey]);
    } catch (error) {
      this.logger.error("Review photo cleanup failed; use pnpm media:cleanup to retry", error);
    }
  }

  private logQueryFailure(message: string, error: unknown): void {
    this.logger.error(message, error instanceof Error ? error.stack : undefined);
  }
}

function isUniqueViolation(error: unknown): error is { code: string } {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}
