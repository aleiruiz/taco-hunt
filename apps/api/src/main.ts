import Fastify from "fastify";
import cors from "@fastify/cors";
import pg from "pg";
import { z } from "zod";

const { Pool } = pg;
const app = Fastify({ logger: true, trustProxy: true });
const port = Number(process.env.PORT ?? 3001);
const pool = new Pool({ connectionString: process.env.DATABASE_URL ?? "postgresql://taco_hunt_api:local-api-only-change-before-deploy@127.0.0.1:55422/postgres", max: 5, connectionTimeoutMillis: 3000 });
await app.register(cors, { origin: true });
app.get("/healthz", async (_request, reply) => { try { await pool.query("select 1"); return { status: "ok" }; } catch { return reply.code(503).send({ status: "unavailable" }); } });
const querySchema = z.object({ north: z.coerce.number().min(25).max(27).optional(), south: z.coerce.number().min(25).max(27).optional(), east: z.coerce.number().min(-101.5).max(-99).optional(), west: z.coerce.number().min(-101.5).max(-99).optional(), q: z.string().trim().max(100).optional(), tacoType: z.string().trim().max(80).optional(), limit: z.coerce.number().int().min(1).max(50).default(20), cursor: z.string().uuid().optional() });
app.get("/v1/taco-types", async (_request, reply) => { try { const { rows } = await pool.query("select id,slug,name_es as \"nameEs\" from app_private.taco_types where active order by name_es"); return { items: rows }; } catch (error) { app.log.error(error); return reply.code(503).send({ error: { code: "SERVICE_UNAVAILABLE", message: "Servicio temporalmente no disponible" } }); } });
app.get("/v1/spots", async (request, reply) => {
  const parsed = querySchema.safeParse(request.query); if (!parsed.success) return reply.code(400).send({ error: { code: "VALIDATION_ERROR", message: "Parámetros inválidos" } });
  const p = parsed.data; const values: unknown[] = []; const where = ["s.status='approved'"];
  const add = (sql: string, value: unknown) => { values.push(value); where.push(sql.replace("?", `$${values.length}`)); };
  add("s.latitude <= ?", p.north ?? 26.1); add("s.latitude >= ?", p.south ?? 25.4); add("s.longitude <= ?", p.east ?? -99.8); add("s.longitude >= ?", p.west ?? -100.9);
  if (p.q) {
    const pattern = "%" + p.q.toLocaleLowerCase("es-MX").replace(/[\\%_]/g, "\\$&") + "%";
    const nameParam = values.push(pattern);
    const neighborhoodParam = values.push(pattern);
    where.push("(s.normalized_name like $" + nameParam + " or lower(s.neighborhood) like $" + neighborhoodParam + ")");
  }
  if (p.tacoType) add("exists (select 1 from app_private.spot_tacos st join app_private.taco_types tt on tt.id=st.taco_type_id where st.spot_id=s.id and st.status='approved' and tt.slug=?)", p.tacoType);
  if (p.cursor) add("s.id > ?::uuid", p.cursor);
  values.push(p.limit + 1);
  const sql = `select s.id,s.name,s.neighborhood,s.latitude::float8 as latitude,s.longitude::float8 as longitude,s.last_verified_at as \"lastVerifiedAt\", count(distinct r.id)::int as \"reviewCount\", (select jsonb_build_object('id',st.id,'tacoTypeId',tt.id,'name',coalesce(st.display_name,tt.name_es),'score',round(avg((r2.tortilla+r2.filling+r2.salsa+r2.value)/4.0)::numeric,1),'reviewCount',count(r2.id)::int) from app_private.spot_tacos st join app_private.taco_types tt on tt.id=st.taco_type_id left join app_private.reviews r2 on r2.spot_taco_id=st.id and r2.status='visible' where st.spot_id=s.id and st.status='approved' group by st.id,tt.id order by count(r2.id) desc, avg((r2.tortilla+r2.filling+r2.salsa+r2.value)/4.0) desc nulls last limit 1) as \"bestTaco\" from app_private.spots s left join app_private.spot_tacos st0 on st0.spot_id=s.id and st0.status='approved' left join app_private.reviews r on r.spot_taco_id=st0.id and r.status='visible' where ${where.join(" and ")} group by s.id order by s.normalized_name,s.id limit $${values.length}`;
  try { const { rows } = await pool.query(sql, values); const more = rows.length > p.limit; const items = rows.slice(0,p.limit); return { items, nextCursor: more ? items.at(-1)?.id ?? null : null }; } catch (error) { request.log.error(error); return reply.code(503).send({ error: { code: "SERVICE_UNAVAILABLE", message: "Servicio temporalmente no disponible" } }); }
});
app.get<{ Params: { id: string } }>("/v1/spots/:id", async (request, reply) => {
  const id = z.string().uuid().safeParse(request.params.id); if (!id.success) return reply.code(400).send({ error: { code: "VALIDATION_ERROR", message: "Identificador inválido" } });
  try { const spot = await pool.query("select id,name,neighborhood,latitude::float8 as latitude,longitude::float8 as longitude,last_verified_at as \"lastVerifiedAt\" from app_private.spots where id=$1 and status='approved'", [id.data]); if (!spot.rowCount) return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Puesto no encontrado" } }); const tacos = await pool.query("select st.id,tt.id as \"tacoTypeId\",coalesce(st.display_name,tt.name_es) as name, round(avg((r.tortilla+r.filling+r.salsa+r.value)/4.0)::numeric,1)::float8 as score,count(r.id)::int as \"reviewCount\" from app_private.spot_tacos st join app_private.taco_types tt on tt.id=st.taco_type_id left join app_private.reviews r on r.spot_taco_id=st.id and r.status='visible' where st.spot_id=$1 and st.status='approved' group by st.id,tt.id order by tt.name_es", [id.data]); return { ...spot.rows[0], tacos: tacos.rows }; } catch (error) { request.log.error(error); return reply.code(503).send({ error: { code: "SERVICE_UNAVAILABLE", message: "Servicio temporalmente no disponible" } }); }
});
await app.listen({ port, host: "0.0.0.0" });
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, async () => { await app.close(); await pool.end(); process.exit(0); });
