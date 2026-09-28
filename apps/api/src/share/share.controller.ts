import {
  Controller,
  Get,
  Header,
  Inject,
  NotFoundException,
  Param,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { Pool } from "pg";
import { uuidSchema } from "@taco-hunt/contracts";
import { DATABASE_POOL } from "../database/database.module.js";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character] ?? character;
  });
}

function publicBaseUrl(): string {
  const configured = process.env.PUBLIC_BASE_URL?.trim() || "https://taco-hunt.example";
  return configured.replace(/\/+$/, "");
}

@Controller("s")
export class ShareController {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  @Get(":id")
  @Header("Content-Type", "text/html; charset=utf-8")
  async preview(@Param("id") rawId: string): Promise<string> {
    const parsedId = uuidSchema.safeParse(rawId);
    if (!parsedId.success) throw new NotFoundException("Puesto no encontrado");

    try {
      const { rows } = await this.pool.query<{
        id: string;
        name: string;
        neighborhood: string;
        lastVerifiedAt: string | null;
        tacoNames: string | null;
      }>(
        `select s.id,s.name,s.neighborhood,s.last_verified_at as "lastVerifiedAt",
          string_agg(coalesce(st.display_name,tt.name_es), ', ' order by tt.name_es)
            filter (where tt.id is not null) as "tacoNames"
         from app_private.spots s
         left join app_private.spot_tacos st on st.spot_id=s.id and st.status='approved'
         left join app_private.taco_types tt on tt.id=st.taco_type_id and tt.active
         where s.id=$1 and s.status='approved'
         group by s.id`,
        [parsedId.data],
      );
      if (!rows[0]) throw new NotFoundException("Puesto no encontrado");

      const spot = rows[0];
      const baseUrl = publicBaseUrl();
      const shareUrl = `${baseUrl}/s/${encodeURIComponent(spot.id)}`;
      const appUrl = `tacohunt://spot/${encodeURIComponent(spot.id)}`;
      const title = `${spot.name} · Taco Hunt`;
      const description = [
        spot.neighborhood,
        spot.tacoNames ? `Tacos: ${spot.tacoNames}` : undefined,
      ]
        .filter(Boolean)
        .join(" · ");
      const safeTitle = escapeHtml(title);
      const safeDescription = escapeHtml(description || "Descubre este puesto en Taco Hunt");
      const safeName = escapeHtml(spot.name);
      const safeNeighborhood = escapeHtml(spot.neighborhood);

      return `<!doctype html>
<html lang="es-MX"><head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${safeTitle}</title>
  <meta name="description" content="${safeDescription}">
  <meta property="og:type" content="place">
  <meta property="og:title" content="${safeTitle}">
  <meta property="og:description" content="${safeDescription}">
  <meta property="og:url" content="${escapeHtml(shareUrl)}">
</head><body>
  <main>
    <h1>${safeName}</h1>
    <p>${safeNeighborhood}</p>
    ${spot.tacoNames ? `<p>Tacos: ${escapeHtml(spot.tacoNames)}</p>` : ""}
    <a href="${escapeHtml(appUrl)}">Abrir en Taco Hunt</a>
  </main>
</body></html>`;
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new ServiceUnavailableException("Servicio temporalmente no disponible");
    }
  }
}
