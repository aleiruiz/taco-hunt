import {
  BadGatewayException,
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import { DATABASE_POOL } from "../database/database.module.js";

const monterreyBounds = z.object({
  latitude: z.number().min(24).max(27),
  longitude: z.number().min(-102).max(-99),
});

export const placesDiscoverySchema = z.object({
  query: z.string().trim().min(2).max(100),
  latitude: z.coerce.number().min(24).max(27).default(25.6866),
  longitude: z.coerce.number().min(-102).max(-99).default(-100.3161),
  radiusMeters: z.coerce.number().int().min(100).max(50_000).default(25_000),
});

type PlacesSearchInput = z.infer<typeof placesDiscoverySchema>;

type GooglePlace = {
  id?: unknown;
  displayName?: { text?: unknown };
  formattedAddress?: unknown;
  shortFormattedAddress?: unknown;
  location?: { latitude?: unknown; longitude?: unknown };
  types?: unknown;
  businessStatus?: unknown;
  googleMapsUri?: unknown;
};

type GooglePlacesResponse = { places?: GooglePlace[] };

@Injectable()
export class PlacesService {
  private readonly logger = new Logger(PlacesService.name);

  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async discover(input: PlacesSearchInput) {
    const parsed = placesDiscoverySchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Parámetros de descubrimiento inválidos",
        details: { issues: parsed.error.issues },
      });
    }

    const request = parsed.data;
    monterreyBounds.parse(request);
    const places = await this.searchGooglePlaces(request);
    const batchId = randomUUID();
    const candidates = [];

    for (const place of places) {
      const candidate = toCandidate(place);
      if (!candidate) continue;

      const result = await this.pool.query(
        `insert into app_private.import_candidates
          (original_payload,normalized_name,latitude,longitude,source,license_ref,import_batch_id)
         values ($1::jsonb,$2,$3,$4,'google_places',$5,$6)
         on conflict do nothing
         returning id,original_payload as "originalPayload",normalized_name as "normalizedName",
           latitude::float8 as latitude,longitude::float8 as longitude,source,state,
           import_batch_id as "importBatchId",created_at as "createdAt"`,
        [
          JSON.stringify(candidate.payload),
          normalizeName(candidate.name),
          candidate.latitude,
          candidate.longitude,
          "Google Places API; administrative discovery metadata only",
          batchId,
        ],
      );

      if (result.rows[0]) candidates.push(result.rows[0]);
    }

    return { batchId, discovered: places.length, inserted: candidates.length, candidates };
  }

  async queue(limit = 100) {
    try {
      const { rows } = await this.pool.query(
        `select id,
           original_payload->>'place_id' as "placeId",
           original_payload->>'name' as name,
           original_payload->>'formatted_address' as "formattedAddress",
           normalized_name as "normalizedName",latitude::float8 as latitude,
           longitude::float8 as longitude,source,state,
           import_batch_id as "importBatchId",created_at as "createdAt"
         from app_private.import_candidates
         where source='google_places' and state='pending'
         order by created_at asc limit $1`,
        [limit],
      );
      return { items: rows };
    } catch (error) {
      this.logger.error(
        "Places candidate queue query failed",
        error instanceof Error ? error.stack : undefined,
      );
      throw new ServiceUnavailableException("Servicio temporalmente no disponible");
    }
  }

  private async searchGooglePlaces(input: PlacesSearchInput): Promise<GooglePlace[]> {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY?.trim();
    if (!apiKey) throw new ServiceUnavailableException("Google Places no está configurado");

    try {
      const endpoint =
        process.env.GOOGLE_PLACES_API_URL?.trim() ||
        "https://places.googleapis.com/v1/places:searchText";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": [
            "places.id",
            "places.displayName",
            "places.formattedAddress",
            "places.shortFormattedAddress",
            "places.location",
            "places.types",
            "places.businessStatus",
            "places.googleMapsUri",
          ].join(","),
        },
        body: JSON.stringify({
          textQuery: `${input.query}, Monterrey, Nuevo León`,
          maxResultCount: 20,
          locationBias: {
            circle: {
              center: { latitude: input.latitude, longitude: input.longitude },
              radius: input.radiusMeters,
            },
          },
        }),
      });

      if (!response.ok) {
        throw new BadGatewayException("Google Places no respondió correctamente");
      }
      const payload = (await response.json()) as GooglePlacesResponse;
      return Array.isArray(payload.places) ? payload.places : [];
    } catch (error) {
      if (error instanceof BadGatewayException) throw error;
      this.logger.error(
        "Google Places discovery failed",
        error instanceof Error ? error.stack : undefined,
      );
      throw new ServiceUnavailableException("Google Places no está disponible");
    }
  }
}

function toCandidate(place: GooglePlace) {
  const placeId = stringValue(place.id);
  const name = stringValue(place.displayName?.text);
  const latitude = numberValue(place.location?.latitude);
  const longitude = numberValue(place.location?.longitude);
  if (!placeId || !name || latitude === null || longitude === null) return null;
  if (
    !monterreyBounds.shape.latitude.safeParse(latitude).success ||
    !monterreyBounds.shape.longitude.safeParse(longitude).success
  ) {
    return null;
  }

  return {
    name,
    latitude,
    longitude,
    payload: {
      place_id: placeId,
      name,
      formatted_address: stringValue(place.formattedAddress),
      short_formatted_address: stringValue(place.shortFormattedAddress),
      latitude,
      longitude,
      types: stringArray(place.types),
      business_status: stringValue(place.businessStatus),
      google_maps_uri: stringValue(place.googleMapsUri),
    },
  };
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function normalizeName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-MX")
    .trim()
    .replace(/\s+/g, " ");
}
