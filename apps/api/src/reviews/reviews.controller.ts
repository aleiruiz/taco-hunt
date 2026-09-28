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

const reviewCreateRequestSchema = reviewCreateSchema.strict();

const reviewCursorSchema = z.object({
  createdAt: z.string().datetime({ offset: true }),
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

  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  @Post("/reviews")
  async createReview(@CurrentProfile() profile: AuthenticatedProfile, @Body() body: unknown) {
    const parsed = reviewCreateRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Datos de reseña inválidos",
        details: { issues: parsed.error.issues },
      });
    }
    if (parsed.data.photoUploadId) {
      throw new BadRequestException("La carga de fotos aún no está disponible");
    }

    const client = await this.connect();
    try {
      await client.query("begin");
      const target = await client.query(
        "select st.id from app_private.spot_tacos st join app_private.spots s on s.id=st.spot_id join app_private.taco_types tt on tt.id=st.taco_type_id where st.id=$1 and st.status='approved' and s.status='approved' and tt.active for share of st,s,tt",
        [parsed.data.spotTacoId],
      );
      if (!target.rowCount) throw new NotFoundException("Taco no encontrado");

      const result = await client.query(
        'insert into app_private.reviews (user_id,spot_taco_id,tortilla,filling,salsa,value,price_paid_mxn,body) values ($1,$2,$3,$4,$5,$6,$7,$8) returning id,spot_taco_id as "spotTacoId",tortilla,filling,salsa,value,round((tortilla+filling+salsa+value)/4.0::numeric,1)::float8 as score,price_paid_mxn::float8 as "pricePaidMxn",body,status,created_at as "createdAt",updated_at as "updatedAt"',
        [
          profile.id,
          parsed.data.spotTacoId,
          parsed.data.tortilla,
          parsed.data.filling,
          parsed.data.salsa,
          parsed.data.value,
          parsed.data.pricePaidMxn ?? null,
          parsed.data.body ?? null,
        ],
      );
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
    };
    const values: unknown[] = [];
    const updates = Object.entries(parsed.data).map(([key, value]) => {
      values.push(value);
      return `${fields[key]}=$${values.length}`;
    });
    updates.push("updated_at=now()");
    values.push(id, profile.id);

    try {
      const result = await this.pool.query(
        `update app_private.reviews set ${updates.join(",")} where id=$${values.length - 1} and user_id=$${values.length} returning id,spot_taco_id as "spotTacoId",tortilla,filling,salsa,value,round((tortilla+filling+salsa+value)/4.0::numeric,1)::float8 as score,price_paid_mxn::float8 as "pricePaidMxn",body,status,created_at as "createdAt",updated_at as "updatedAt"`,
        values,
      );
      if (!result.rowCount) throw new NotFoundException("Reseña no encontrada");
      return result.rows[0];
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.logQueryFailure("Review update query failed", error);
      throw new ServiceUnavailableException("Servicio temporalmente no disponible");
    }
  }

  @Delete("/reviews/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteReview(@CurrentProfile() profile: AuthenticatedProfile, @Param("id") rawId: string) {
    const id = this.parseId(rawId);
    try {
      // Ownership is part of the DELETE predicate, and an absent row is already in the desired state.
      await this.pool.query("delete from app_private.reviews where id=$1 and user_id=$2", [
        id,
        profile.id,
      ]);
    } catch (error) {
      this.logQueryFailure("Review delete query failed", error);
      throw new ServiceUnavailableException("Servicio temporalmente no disponible");
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
        `select r.id,r.spot_taco_id as "spotTacoId",s.id as "spotId",s.name as "spotName",s.neighborhood,tt.id as "tacoTypeId",coalesce(st.display_name,tt.name_es) as "tacoName",r.tortilla,r.filling,r.salsa,r.value,round((r.tortilla+r.filling+r.salsa+r.value)/4.0::numeric,1)::float8 as score,r.price_paid_mxn::float8 as "pricePaidMxn",r.body,r.status,to_char(r.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as "createdAt",to_char(r.updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as "updatedAt" from app_private.reviews r join app_private.spot_tacos st on st.id=r.spot_taco_id join app_private.spots s on s.id=st.spot_id join app_private.taco_types tt on tt.id=st.taco_type_id where ${filters.join(" and ")} order by r.created_at desc,r.id desc limit $${values.length}`,
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

  private logQueryFailure(message: string, error: unknown): void {
    this.logger.error(message, error instanceof Error ? error.stack : undefined);
  }
}

function isUniqueViolation(error: unknown): error is { code: string } {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}
