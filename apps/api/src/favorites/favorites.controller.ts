import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Logger,
  NotFoundException,
  Param,
  Put,
  Query,
  ServiceUnavailableException,
  UseGuards,
} from "@nestjs/common";
import type { Pool } from "pg";
import { personalPageQuerySchema, uuidSchema } from "@taco-hunt/contracts";
import { z } from "zod";
import { AuthRequiredGuard } from "../auth/auth-required.guard.js";
import { CurrentProfile } from "../auth/current-profile.decorator.js";
import type { AuthenticatedProfile } from "../auth/auth.types.js";
import { DATABASE_POOL } from "../database/database.module.js";

const favoriteCursorSchema = z.object({
  createdAt: z.string().datetime({ offset: true }),
  spotId: uuidSchema,
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

@Controller("/me/favorites")
@UseGuards(AuthRequiredGuard)
export class FavoritesController {
  private readonly logger = new Logger(FavoritesController.name);

  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  @Get()
  async listFavorites(
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
    const after = decodeCursor(parsed.data.cursor, favoriteCursorSchema);
    const values: unknown[] = [profile.id];
    const filters = ["f.user_id=$1", "s.status='approved'"];
    if (after) {
      values.push(after.createdAt, after.spotId);
      filters.push(`(f.created_at,f.spot_id) < ($${values.length - 1},$${values.length}::uuid)`);
    }
    values.push(parsed.data.limit + 1);

    try {
      const { rows } = await this.pool.query(
        `select s.id,s.name,s.neighborhood,s.latitude::float8 as latitude,s.longitude::float8 as longitude,s.last_verified_at as "lastVerifiedAt",f.created_at as "favoritedAt",count(distinct r.id)::int as "reviewCount",(select jsonb_build_object('id',st.id,'tacoTypeId',tt.id,'name',coalesce(st.display_name,tt.name_es),'score',round(avg((r2.tortilla+r2.filling+r2.salsa+r2.value)/4.0)::numeric,1),'reviewCount',count(r2.id)::int) from app_private.spot_tacos st join app_private.taco_types tt on tt.id=st.taco_type_id and tt.active left join app_private.reviews r2 on r2.spot_taco_id=st.id and r2.status='visible' where st.spot_id=s.id and st.status='approved' group by st.id,tt.id order by count(r2.id) desc,avg((r2.tortilla+r2.filling+r2.salsa+r2.value)/4.0) desc nulls last limit 1) as "bestTaco" from app_private.favorites f join app_private.spots s on s.id=f.spot_id left join app_private.spot_tacos st0 on st0.spot_id=s.id and st0.status='approved' left join app_private.taco_types tt0 on tt0.id=st0.taco_type_id and tt0.active left join app_private.reviews r on r.spot_taco_id=st0.id and r.status='visible' and tt0.id is not null where ${filters.join(" and ")} group by s.id,f.created_at order by f.created_at desc,f.spot_id desc limit $${values.length}`,
        values,
      );
      const more = rows.length > parsed.data.limit;
      const items = rows.slice(0, parsed.data.limit).map(({ favoritedAt, ...spot }) => ({
        ...spot,
        photoUrl: null,
        favoritedAt,
      }));
      const last = rows[parsed.data.limit - 1];
      return {
        items,
        nextCursor:
          more && last ? encodeCursor({ createdAt: last.favoritedAt, spotId: last.id }) : null,
      };
    } catch (error) {
      this.logQueryFailure("Favorites list query failed", error);
      throw new ServiceUnavailableException("Servicio temporalmente no disponible");
    }
  }

  @Put(":spotId")
  @HttpCode(HttpStatus.NO_CONTENT)
  async addFavorite(
    @CurrentProfile() profile: AuthenticatedProfile,
    @Param("spotId") rawSpotId: string,
  ): Promise<void> {
    const spotId = this.parseId(rawSpotId);
    try {
      const result = await this.pool.query(
        "insert into app_private.favorites(user_id,spot_id) select $1,s.id from app_private.spots s where s.id=$2 and s.status='approved' on conflict(user_id,spot_id) do nothing returning spot_id",
        [profile.id, spotId],
      );
      if (result.rowCount) return;

      const existing = await this.pool.query(
        "select 1 from app_private.favorites f join app_private.spots s on s.id=f.spot_id where f.user_id=$1 and f.spot_id=$2 and s.status='approved'",
        [profile.id, spotId],
      );
      if (existing.rowCount) return;
      throw new NotFoundException("Puesto no encontrado");
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.logQueryFailure("Favorite create query failed", error);
      throw new ServiceUnavailableException("Servicio temporalmente no disponible");
    }
  }

  @Delete(":spotId")
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeFavorite(
    @CurrentProfile() profile: AuthenticatedProfile,
    @Param("spotId") rawSpotId: string,
  ): Promise<void> {
    const spotId = this.parseId(rawSpotId);
    try {
      await this.pool.query("delete from app_private.favorites where user_id=$1 and spot_id=$2", [
        profile.id,
        spotId,
      ]);
    } catch (error) {
      this.logQueryFailure("Favorite delete query failed", error);
      throw new ServiceUnavailableException("Servicio temporalmente no disponible");
    }
  }

  private parseId(rawId: string): string {
    const parsed = uuidSchema.safeParse(rawId);
    if (!parsed.success) throw new BadRequestException("Identificador inválido");
    return parsed.data;
  }

  private logQueryFailure(message: string, error: unknown): void {
    this.logger.error(message, error instanceof Error ? error.stack : undefined);
  }
}
