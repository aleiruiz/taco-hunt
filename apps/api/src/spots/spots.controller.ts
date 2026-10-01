import { createHash } from "node:crypto";
import {
  BadRequestException,
  Controller,
  Get,
  Header,
  Inject,
  Logger,
  NotFoundException,
  Param,
  Query,
  Req,
  Res,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Pool } from "pg";
import {
  mapPinsQuerySchema,
  reviewListQuerySchema,
  searchSuggestQuerySchema,
  spotListQuerySchema,
  uuidSchema,
  type MapCluster,
  type MapPin,
  type SearchColoniaSuggestion,
  type SearchPuestoSuggestion,
} from "@taco-hunt/contracts";
import { z } from "zod";
import { DATABASE_POOL } from "../database/database.module.js";

const SEARCH_SUGGEST_LIMIT = 8;
// No municipality column exists on app_private.spots yet (only free-text
// neighborhood); every seeded/approved stand today is within the Monterrey
// metro area per docs/build-spec.md's coverage, matching the fixed string
// already shown elsewhere (e.g. spot/[id].tsx's pin card). Revisit if/when
// a real municipality column lands (see docs/data-provenance.md).
const DEFAULT_MUNICIPALITY = "Monterrey y área metropolitana";

// Per-request limit, not an area cap: the viewport can be anywhere in (and
// around) the Monterrey metro area with no maximum size. When more approved
// stands than this fall inside it, they're returned as grid clusters instead
// of truncating results silently.
const MAP_PIN_LIMIT = 300;

// RFC 9110 §13.1.2: If-None-Match is a comma-separated list of entity tags
// (or "*"), compared weakly even against a strong ETag; a plain `=== etag`
// check misses every case but a single matching strong tag with nothing
// else in the header. Splits only on commas outside quoted tags.
function ifNoneMatchHas(headerValue: string | string[] | undefined, etag: string): boolean {
  if (!headerValue) return false;
  const header = Array.isArray(headerValue) ? headerValue.join(",") : headerValue;
  if (header.trim() === "*") return true;
  const tags = header.match(/(?:W\/)?"(?:[^"\\]|\\.)*"/g) ?? [];
  const normalize = (tag: string) => tag.replace(/^W\//, "");
  const target = normalize(etag);
  return tags.some((tag) => normalize(tag) === target);
}

const spotCursorSchema = z.object({
  distanceKm: z.number().finite().nonnegative(),
  normalizedName: z.string().max(120),
  id: uuidSchema,
});

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
    } catch (error) {
      this.logQueryFailure("Taco type list query failed", error);
      throw new ServiceUnavailableException("Servicio temporalmente no disponible");
    }
  }

  @Get("/search/suggest")
  async searchSuggest(@Query() query: Record<string, unknown>) {
    const parsed = searchSuggestQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Parámetros inválidos",
        details: { issues: parsed.error.issues },
      });
    }
    const { q, near } = parsed.data;
    const pattern = `%${q.toLocaleLowerCase("es-MX").replace(/[\\%_]/g, "\\$&")}%`;
    let nearLat: number | undefined;
    let nearLon: number | undefined;
    if (near) {
      const [latRaw, lonRaw] = near.split(",");
      const parsedLat = Number(latRaw);
      const parsedLon = Number(lonRaw);
      if (
        !Number.isFinite(parsedLat) ||
        !Number.isFinite(parsedLon) ||
        parsedLat < -90 ||
        parsedLat > 90 ||
        parsedLon < -180 ||
        parsedLon > 180
      ) {
        throw new BadRequestException({ message: "El parámetro near es inválido" });
      }
      nearLat = parsedLat;
      nearLon = parsedLon;
    }

    try {
      const puestoOrder =
        nearLat !== undefined && nearLon !== undefined ? '"distanceKm"' : "s.normalized_name";
      const puestoValues: unknown[] = [pattern];
      let distanceSelect = "null::float8";
      if (nearLat !== undefined && nearLon !== undefined) {
        puestoValues.push(nearLat, nearLon);
        distanceSelect = `(6371 * 2 * asin(sqrt(least(1, power(sin(radians(s.latitude::float8 - $2) / 2), 2) + cos(radians($2)) * cos(radians(s.latitude::float8)) * power(sin(radians(s.longitude::float8 - $3) / 2), 2)))))`;
      }
      const puestosResult = await this.pool.query<
        SearchPuestoSuggestion & { distanceKm: number | null }
      >(
        `select s.id,s.name,s.neighborhood,count(distinct r.id)::int as "reviewCount",(select coalesce(st.display_name,tt.name_es) from app_private.spot_tacos st join app_private.taco_types tt on tt.id=st.taco_type_id and tt.active left join app_private.reviews r2 on r2.spot_taco_id=st.id and r2.status='visible' where st.spot_id=s.id and st.status='approved' group by st.id,tt.id order by count(r2.id) desc,avg((r2.tortilla+r2.filling+r2.salsa+r2.value)/4.0) desc nulls last limit 1) as "bestTaco",${distanceSelect} as "distanceKm" from app_private.spots s left join app_private.spot_tacos st0 on st0.spot_id=s.id and st0.status='approved' left join app_private.taco_types tt0 on tt0.id=st0.taco_type_id and tt0.active left join app_private.reviews r on r.spot_taco_id=st0.id and r.status='visible' and tt0.id is not null where s.status='approved' and s.normalized_name like $1 group by s.id order by ${puestoOrder} limit ${SEARCH_SUGGEST_LIMIT}`,
        puestoValues,
      );
      const puestos: SearchPuestoSuggestion[] = puestosResult.rows.map(
        ({ distanceKm: _distanceKm, ...row }) => row,
      );

      const coloniasResult = await this.pool.query<{ name: string; spotCount: number }>(
        `select s.neighborhood as name,count(*)::int as "spotCount" from app_private.spots s where s.status='approved' and lower(s.neighborhood) like $1 group by s.neighborhood order by "spotCount" desc,s.neighborhood limit ${SEARCH_SUGGEST_LIMIT}`,
        [pattern],
      );
      const colonias: SearchColoniaSuggestion[] = coloniasResult.rows.map((row) => ({
        id: row.name,
        name: row.name,
        municipality: DEFAULT_MUNICIPALITY,
        spotCount: row.spotCount,
      }));

      return { colonias, puestos };
    } catch (error) {
      this.logQueryFailure("Search suggest query failed", error);
      throw new ServiceUnavailableException("Servicio temporalmente no disponible");
    }
  }

  @Get("/spots")
  async listSpots(@Query() query: Record<string, unknown>) {
    const parsed = spotListQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Parámetros inválidos",
        details: { issues: parsed.error.issues },
      });
    }

    const p = parsed.data;
    const after = decodeCursor(p.cursor, spotCursorSchema);
    const north = p.north ?? 26.1;
    const south = p.south ?? 25.4;
    const east = p.east ?? -99.8;
    const west = p.west ?? -100.9;
    if (south > north || west > east) {
      throw new BadRequestException({ message: "Los límites del área son inválidos" });
    }
    const areaKm2 =
      (north - south) *
      (east - west) *
      Math.cos((((north + south) / 2) * Math.PI) / 180) *
      111.32 ** 2;
    if (areaKm2 > 9_000) {
      throw new BadRequestException({ message: "El área de búsqueda es demasiado grande" });
    }

    const values: unknown[] = [];
    const where = ["s.status='approved'"];
    const add = (sql: string, value: unknown) => {
      values.push(value);
      where.push(sql.replace("?", `$${values.length}`));
    };
    add("s.latitude <= ?", north);
    add("s.latitude >= ?", south);
    add("s.longitude <= ?", east);
    add("s.longitude >= ?", west);
    if (p.q) {
      const pattern = `%${p.q.toLocaleLowerCase("es-MX").replace(/[\\%_]/g, "\\$&")}%`;
      const nameParam = values.push(pattern);
      const neighborhoodParam = values.push(pattern);
      where.push(
        `(s.normalized_name like $${nameParam} or lower(s.neighborhood) like $${neighborhoodParam})`,
      );
    }
    if (p.tacoType) {
      add(
        "exists (select 1 from app_private.spot_tacos st join app_private.taco_types tt on tt.id=st.taco_type_id where st.spot_id=s.id and st.status='approved' and tt.active and tt.slug=?)",
        p.tacoType,
      );
    }
    values.push((north + south) / 2);
    const centerLat = `$${values.length}`;
    values.push((east + west) / 2);
    const centerLon = `$${values.length}`;
    const distanceExpression = `(6371 * 2 * asin(sqrt(least(1, power(sin(radians(s.latitude::float8 - ${centerLat}) / 2), 2) + cos(radians(${centerLat})) * cos(radians(s.latitude::float8)) * power(sin(radians(s.longitude::float8 - ${centerLon}) / 2), 2)))))`;
    if (after) {
      values.push(after.distanceKm, after.normalizedName, after.id);
      where.push(
        `(${distanceExpression},s.normalized_name,s.id) > ($${values.length - 2},$${values.length - 1},$${values.length}::uuid)`,
      );
    }
    values.push(p.limit + 1);
    const sql = `select s.id,s.name,s.neighborhood,s.latitude::float8 as latitude,s.longitude::float8 as longitude,s.google_place_id as "googlePlaceId",s.last_verified_at as "lastVerifiedAt",s.normalized_name as "cursorName",${distanceExpression} as "distanceKm",count(distinct r.id)::int as "reviewCount",(select jsonb_build_object('id',st.id,'tacoTypeId',tt.id,'name',coalesce(st.display_name,tt.name_es),'score',round(avg((r2.tortilla+r2.filling+r2.salsa+r2.value)/4.0)::numeric,1),'reviewCount',count(r2.id)::int) from app_private.spot_tacos st join app_private.taco_types tt on tt.id=st.taco_type_id and tt.active left join app_private.reviews r2 on r2.spot_taco_id=st.id and r2.status='visible' where st.spot_id=s.id and st.status='approved' group by st.id,tt.id order by count(r2.id) desc,avg((r2.tortilla+r2.filling+r2.salsa+r2.value)/4.0) desc nulls last limit 1) as "bestTaco" from app_private.spots s left join app_private.spot_tacos st0 on st0.spot_id=s.id and st0.status='approved' left join app_private.taco_types tt0 on tt0.id=st0.taco_type_id and tt0.active left join app_private.reviews r on r.spot_taco_id=st0.id and r.status='visible' and tt0.id is not null where ${where.join(" and ")} group by s.id order by "distanceKm",s.normalized_name,s.id limit $${values.length}`;
    try {
      const { rows } = await this.pool.query(sql, values);
      const more = rows.length > p.limit;
      const page = rows.slice(0, p.limit);
      const items = page.map(
        ({ cursorName: _cursorName, distanceKm: _distanceKm, googlePlaceId, ...row }) => ({
          ...row,
          ...(googlePlaceId ? { googlePlaceId } : {}),
          photoUrl: null,
        }),
      );
      const last = page.at(-1);
      return {
        items,
        nextCursor:
          more && last
            ? encodeCursor({
                distanceKm: last.distanceKm,
                normalizedName: last.cursorName,
                id: last.id,
              })
            : null,
      };
    } catch (error) {
      this.logQueryFailure("Spot list query failed", error);
      throw new ServiceUnavailableException("Servicio temporalmente no disponible");
    }
  }

  @Get("/spots/map")
  @Header("Cache-Control", "public, max-age=30")
  async getSpotMapPins(
    @Query() query: Record<string, unknown>,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const parsed = mapPinsQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Parámetros inválidos",
        details: { issues: parsed.error.issues },
      });
    }
    const { north, south, east, west, tacoType } = parsed.data;
    if (south > north || west > east) {
      throw new BadRequestException({ message: "Los límites del área son inválidos" });
    }

    const values: unknown[] = [north, south, east, west];
    const where = [
      "s.status='approved'",
      "s.latitude <= $1",
      "s.latitude >= $2",
      "s.longitude <= $3",
      "s.longitude >= $4",
    ];
    if (tacoType) {
      values.push(tacoType);
      where.push(
        `exists (select 1 from app_private.spot_tacos st join app_private.taco_types tt on tt.id=st.taco_type_id where st.spot_id=s.id and st.status='approved' and tt.active and tt.slug=$${values.length})`,
      );
    }
    const whereClause = where.join(" and ");

    try {
      const bestTacoExpr =
        "(select coalesce(st.display_name,tt.name_es) from app_private.spot_tacos st join app_private.taco_types tt on tt.id=st.taco_type_id and tt.active left join app_private.reviews r on r.spot_taco_id=st.id and r.status='visible' where st.spot_id=s.id and st.status='approved' group by st.id,tt.id order by count(r.id) desc,avg((r.tortilla+r.filling+r.salsa+r.value)/4.0) desc nulls last limit 1)";
      const probe = await this.pool.query(
        `select s.id,s.name,s.neighborhood,s.latitude::float8 as latitude,s.longitude::float8 as longitude,${bestTacoExpr} as "bestTaco" from app_private.spots s where ${whereClause} order by s.id limit ${MAP_PIN_LIMIT + 1}`,
        values,
      );

      const body: { pins: MapPin[]; clusters: MapCluster[] } =
        probe.rowCount !== null && probe.rowCount <= MAP_PIN_LIMIT
          ? { pins: probe.rows, clusters: [] }
          : await this.clusterSpotsInViewport(whereClause, values, north, south, east, west);

      // Derived from the actual response, not just the viewport, so a 304
      // can never serve stale data if an approved spot, its status,
      // coordinates, or visible taco data changed since the client's copy.
      const etag = `"${createHash("sha1").update(JSON.stringify(body)).digest("hex")}"`;
      reply.header("ETag", etag);
      if (ifNoneMatchHas(request.headers["if-none-match"], etag)) {
        reply.code(304);
        return undefined;
      }
      return body;
    } catch (error) {
      this.logQueryFailure("Spot map pins query failed", error);
      throw new ServiceUnavailableException("Servicio temporalmente no disponible");
    }
  }

  private async clusterSpotsInViewport(
    whereClause: string,
    filterValues: unknown[],
    north: number,
    south: number,
    east: number,
    west: number,
  ): Promise<{ pins: MapPin[]; clusters: MapCluster[] }> {
    const countResult = await this.pool.query<{ total: string }>(
      `select count(*)::text as total from app_private.spots s where ${whereClause}`,
      filterValues,
    );
    const total = Number(countResult.rows[0]?.total ?? 0);
    const divisions = Math.min(20, Math.max(2, Math.ceil(Math.sqrt(total / MAP_PIN_LIMIT))));
    const latStep = (north - south) / divisions || 1;
    const lonStep = (east - west) / divisions || 1;

    const values = [...filterValues, south, latStep, west, lonStep];
    const southIdx = filterValues.length + 1;
    const latStepIdx = filterValues.length + 2;
    const westIdx = filterValues.length + 3;
    const lonStepIdx = filterValues.length + 4;
    const { rows } = await this.pool.query<{
      cnt: number;
      centroidLat: number;
      centroidLon: number;
      minLat: number;
      maxLat: number;
      minLon: number;
      maxLon: number;
      ids: string[];
    }>(
      `select count(*)::int as cnt,avg(s.latitude)::float8 as "centroidLat",avg(s.longitude)::float8 as "centroidLon",min(s.latitude)::float8 as "minLat",max(s.latitude)::float8 as "maxLat",min(s.longitude)::float8 as "minLon",max(s.longitude)::float8 as "maxLon",array_agg(s.id) as ids from app_private.spots s where ${whereClause} group by floor((s.latitude - $${southIdx}) / $${latStepIdx}),floor((s.longitude - $${westIdx}) / $${lonStepIdx})`,
      values,
    );

    const clusters: MapCluster[] = [];
    const singletonIds: string[] = [];
    for (const row of rows) {
      if (row.cnt === 1) {
        singletonIds.push(row.ids[0]);
      } else {
        clusters.push({
          count: row.cnt,
          latitude: row.centroidLat,
          longitude: row.centroidLon,
          bounds: { north: row.maxLat, south: row.minLat, east: row.maxLon, west: row.minLon },
        });
      }
    }

    let pins: MapPin[] = [];
    if (singletonIds.length > 0) {
      const bestTacoExpr =
        "(select coalesce(st.display_name,tt.name_es) from app_private.spot_tacos st join app_private.taco_types tt on tt.id=st.taco_type_id and tt.active left join app_private.reviews r on r.spot_taco_id=st.id and r.status='visible' where st.spot_id=s.id and st.status='approved' group by st.id,tt.id order by count(r.id) desc,avg((r.tortilla+r.filling+r.salsa+r.value)/4.0) desc nulls last limit 1)";
      const pinRows = await this.pool.query<MapPin>(
        `select s.id,s.name,s.neighborhood,s.latitude::float8 as latitude,s.longitude::float8 as longitude,${bestTacoExpr} as "bestTaco" from app_private.spots s where s.id = any($1::uuid[])`,
        [singletonIds],
      );
      pins = pinRows.rows;
    }

    return { pins, clusters };
  }

  @Get("/spots/:id/reviews")
  async listSpotReviews(@Param("id") rawId: string, @Query() query: Record<string, unknown>) {
    const parsedId = uuidSchema.safeParse(rawId);
    if (!parsedId.success) throw new BadRequestException({ message: "Identificador inválido" });
    const parsedQuery = reviewListQuerySchema.safeParse(query);
    if (!parsedQuery.success) {
      throw new BadRequestException({
        message: "Parámetros inválidos",
        details: { issues: parsedQuery.error.issues },
      });
    }
    const p = parsedQuery.data;
    const after = decodeCursor(p.cursor, reviewCursorSchema);
    try {
      const spot = await this.pool.query(
        "select id from app_private.spots where id=$1 and status='approved'",
        [parsedId.data],
      );
      if (!spot.rowCount) throw new NotFoundException("Puesto no encontrado");

      const values: unknown[] = [parsedId.data];
      const filters = [
        "s.id=$1",
        "s.status='approved'",
        "st.status='approved'",
        "tt.active",
        "r.status='visible'",
      ];
      if (p.tacoType) {
        values.push(p.tacoType);
        filters.push(`tt.slug=$${values.length}`);
      }
      if (after) {
        values.push(after.createdAt, after.id);
        filters.push(`(r.created_at,r.id) < ($${values.length - 1},$${values.length}::uuid)`);
      }
      values.push(p.limit + 1);
      const { rows } = await this.pool.query(
        `select r.id,tt.id as "tacoTypeId",coalesce(st.display_name,tt.name_es) as "tacoName",p.display_name as "displayName",r.tortilla,r.filling,r.salsa,r.value,round((r.tortilla+r.filling+r.salsa+r.value)/4.0::numeric,1)::float8 as score,r.price_paid_mxn::float8 as "pricePaidMxn",r.body,to_char(r.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as "createdAt" from app_private.reviews r join app_private.spot_tacos st on st.id=r.spot_taco_id join app_private.taco_types tt on tt.id=st.taco_type_id join app_private.spots s on s.id=st.spot_id join app_private.profiles p on p.id=r.user_id where ${filters.join(" and ")} order by r.created_at desc,r.id desc limit $${values.length}`,
        values,
      );
      const more = rows.length > p.limit;
      const items = rows.slice(0, p.limit);
      const last = items.at(-1);
      return {
        items,
        nextCursor: more && last ? encodeCursor({ createdAt: last.createdAt, id: last.id }) : null,
      };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.logQueryFailure("Spot review list query failed", error);
      throw new ServiceUnavailableException("Servicio temporalmente no disponible");
    }
  }

  @Get("/spots/:id")
  async getSpot(@Param("id") rawId: string) {
    const parsed = uuidSchema.safeParse(rawId);
    if (!parsed.success) throw new BadRequestException({ message: "Identificador inválido" });
    try {
      const spot = await this.pool.query(
        "select s.id,s.name,s.neighborhood,s.latitude::float8 as latitude,s.longitude::float8 as longitude,s.google_place_id as \"googlePlaceId\",s.last_verified_at as \"lastVerifiedAt\",count(distinct r.id)::int as \"reviewCount\" from app_private.spots s left join app_private.spot_tacos st on st.spot_id=s.id and st.status='approved' left join app_private.taco_types tt on tt.id=st.taco_type_id and tt.active left join app_private.reviews r on r.spot_taco_id=st.id and r.status='visible' and tt.id is not null where s.id=$1 and s.status='approved' group by s.id",
        [parsed.data],
      );
      if (!spot.rowCount) throw new NotFoundException("Puesto no encontrado");
      const tacos = await this.pool.query(
        "select st.id,tt.id as \"tacoTypeId\",coalesce(st.display_name,tt.name_es) as name, round(avg((r.tortilla+r.filling+r.salsa+r.value)/4.0)::numeric,1)::float8 as score,count(r.id)::int as \"reviewCount\" from app_private.spot_tacos st join app_private.taco_types tt on tt.id=st.taco_type_id and tt.active left join app_private.reviews r on r.spot_taco_id=st.id and r.status='visible' where st.spot_id=$1 and st.status='approved' group by st.id,tt.id order by tt.name_es",
        [parsed.data],
      );
      const reviews = await this.pool.query(
        'select r.id,tt.id as "tacoTypeId",coalesce(st.display_name,tt.name_es) as "tacoName",p.display_name as "displayName",r.tortilla,r.filling,r.salsa,r.value,round((r.tortilla+r.filling+r.salsa+r.value)/4.0::numeric,1)::float8 as score,r.price_paid_mxn::float8 as "pricePaidMxn",r.body,to_char(r.created_at at time zone \'UTC\',\'YYYY-MM-DD"T"HH24:MI:SS.US"Z"\') as "createdAt" from app_private.reviews r join app_private.spot_tacos st on st.id=r.spot_taco_id join app_private.taco_types tt on tt.id=st.taco_type_id and tt.active join app_private.profiles p on p.id=r.user_id where st.spot_id=$1 and st.status=\'approved\' and r.status=\'visible\' order by r.created_at desc,r.id desc limit 5',
        [parsed.data],
      );
      const { googlePlaceId, ...spotRow } = spot.rows[0];
      return {
        ...spotRow,
        ...(googlePlaceId ? { googlePlaceId } : {}),
        photoUrl: null,
        tacos: tacos.rows,
        reviews: reviews.rows,
      };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.logQueryFailure("Spot detail query failed", error);
      throw new ServiceUnavailableException("Servicio temporalmente no disponible");
    }
  }

  private logQueryFailure(message: string, error: unknown): void {
    this.logger.error(message, error instanceof Error ? error.stack : undefined);
  }
}
