import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Logger,
  NotFoundException,
  Param,
  Query,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { Pool } from "pg";
import { z } from "zod";
import { DATABASE_POOL } from "../database/database.module.js";

const spotQuerySchema = z.object({
  north: z.coerce.number().min(25).max(27).optional(),
  south: z.coerce.number().min(25).max(27).optional(),
  east: z.coerce.number().min(-101.5).max(-99).optional(),
  west: z.coerce.number().min(-101.5).max(-99).optional(),
  q: z.string().trim().max(100).optional(),
  tacoType: z.string().trim().max(80).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().uuid().optional(),
}).superRefine((query, context) => {
  if (query.north !== undefined && query.south !== undefined && query.south > query.north) {
    context.addIssue({ code: "custom", path: ["south"], message: "south debe ser menor o igual a north" });
  }
  if (query.east !== undefined && query.west !== undefined && query.west > query.east) {
    context.addIssue({ code: "custom", path: ["west"], message: "west debe ser menor o igual a east" });
  }
});

@Controller()
export class SpotsController {
  private readonly logger = new Logger(SpotsController.name);

  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  @Get("/taco-types")
  async tacoTypes() {
    try {
      const { rows } = await this.pool.query(
        'select id,slug,name_es as "nameEs" from app_private.taco_types where active order by name_es',
      );
      return { items: rows };
    } catch {
      throw new ServiceUnavailableException("Servicio temporalmente no disponible");
    }
  }

  @Get("/spots")
  async listSpots(@Query() query: Record<string, unknown>) {
    const parsed = spotQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException({ message: "Parámetros inválidos", details: { issues: parsed.error.issues } });
    }

    const p = parsed.data;
    const values: unknown[] = [];
    const where = ["s.status='approved'"];
    const add = (sql: string, value: unknown) => {
      values.push(value);
      where.push(sql.replace("?", `$${values.length}`));
    };
    add("s.latitude <= ?", p.north ?? 26.1);
    add("s.latitude >= ?", p.south ?? 25.4);
    add("s.longitude <= ?", p.east ?? -99.8);
    add("s.longitude >= ?", p.west ?? -100.9);
    if (p.q) {
      const pattern = `%${p.q.toLocaleLowerCase("es-MX").replace(/[\\%_]/g, "\\$&")}%`;
      const nameParam = values.push(pattern);
      const neighborhoodParam = values.push(pattern);
      where.push(`(s.normalized_name like $${nameParam} or lower(s.neighborhood) like $${neighborhoodParam})`);
    }
    if (p.tacoType) {
      add("exists (select 1 from app_private.spot_tacos st join app_private.taco_types tt on tt.id=st.taco_type_id where st.spot_id=s.id and st.status='approved' and tt.slug=?)", p.tacoType);
    }
    if (p.cursor) add("s.id > ?::uuid", p.cursor);
    values.push(p.limit + 1);
    const sql = `select s.id,s.name,s.neighborhood,s.latitude::float8 as latitude,s.longitude::float8 as longitude,s.last_verified_at as "lastVerifiedAt", count(distinct r.id)::int as "reviewCount", (select jsonb_build_object('id',st.id,'tacoTypeId',tt.id,'name',coalesce(st.display_name,tt.name_es),'score',round(avg((r2.tortilla+r2.filling+r2.salsa+r2.value)/4.0)::numeric,1),'reviewCount',count(r2.id)::int) from app_private.spot_tacos st join app_private.taco_types tt on tt.id=st.taco_type_id left join app_private.reviews r2 on r2.spot_taco_id=st.id and r2.status='visible' where st.spot_id=s.id and st.status='approved' group by st.id,tt.id order by count(r2.id) desc, avg((r2.tortilla+r2.filling+r2.salsa+r2.value)/4.0) desc nulls last limit 1) as "bestTaco" from app_private.spots s left join app_private.spot_tacos st0 on st0.spot_id=s.id and st0.status='approved' left join app_private.reviews r on r.spot_taco_id=st0.id and r.status='visible' where ${where.join(" and ")} group by s.id order by s.normalized_name,s.id limit $${values.length}`;
    try {
      const { rows } = await this.pool.query(sql, values);
      const more = rows.length > p.limit;
      const items = rows.slice(0, p.limit);
      return { items, nextCursor: more ? items.at(-1)?.id ?? null : null };
    } catch (error) {
      this.logger.error("Spot list query failed", error instanceof Error ? error.stack : undefined);
      throw new ServiceUnavailableException("Servicio temporalmente no disponible");
    }
  }

  @Get("/spots/:id")
  async getSpot(@Param("id") rawId: string) {
    const parsed = z.string().uuid().safeParse(rawId);
    if (!parsed.success) throw new BadRequestException({ message: "Identificador inválido" });
    try {
      const spot = await this.pool.query(
        'select id,name,neighborhood,latitude::float8 as latitude,longitude::float8 as longitude,last_verified_at as "lastVerifiedAt" from app_private.spots where id=$1 and status=\'approved\'',
        [parsed.data],
      );
      if (!spot.rowCount) throw new NotFoundException("Puesto no encontrado");
      const tacos = await this.pool.query(
        'select st.id,tt.id as "tacoTypeId",coalesce(st.display_name,tt.name_es) as name, round(avg((r.tortilla+r.filling+r.salsa+r.value)/4.0)::numeric,1)::float8 as score,count(r.id)::int as "reviewCount" from app_private.spot_tacos st join app_private.taco_types tt on tt.id=st.taco_type_id left join app_private.reviews r on r.spot_taco_id=st.id and r.status=\'visible\' where st.spot_id=$1 and st.status=\'approved\' group by st.id,tt.id order by tt.name_es',
        [parsed.data],
      );
      return { ...spot.rows[0], tacos: tacos.rows };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.logger.error("Spot detail query failed", error instanceof Error ? error.stack : undefined);
      throw new ServiceUnavailableException("Servicio temporalmente no disponible");
    }
  }
}
