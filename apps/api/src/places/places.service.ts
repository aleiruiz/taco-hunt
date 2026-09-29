import {
  BadGatewayException,
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import { placeAutocompleteQuerySchema } from "@taco-hunt/contracts";
import { DATABASE_POOL } from "../database/database.module.js";
import { RequestLimitService } from "../auth/request-limit.service.js";

const GOOGLE_ATTRIBUTION = "Con la tecnología de Google";
const GOOGLE_CALLS_SCOPE = "places-google-calls-global";
const GOOGLE_CALLS_WINDOW_MS = 24 * 60 * 60 * 1000;
const DEFAULT_DAILY_CALL_LIMIT = 2_000;

const monterreyBounds = z.object({
  latitude: z.number().min(25.3).max(26.1),
  longitude: z.number().min(-101).max(-99.7),
});

export const placesDiscoverySchema = z.object({
  query: z.string().trim().min(2).max(100),
  latitude: z.coerce.number().min(25.3).max(26.1).default(25.6866),
  longitude: z.coerce.number().min(-101).max(-99.7).default(-100.3161),
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

/** Expected kill-switch/budget rejection from assertGoogleCallAllowed(); never logged as a failure. */
class GooglePlacesGuardRejectedException extends ServiceUnavailableException {}

@Injectable()
export class PlacesService {
  private readonly logger = new Logger(PlacesService.name);

  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly limits: RequestLimitService,
  ) {}

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

  /**
   * Combines local approved-spot matches with Google Places predictions for neighborhoods,
   * municipalities and addresses. Only place_id + display text are fetched here (no ratings,
   * reviews or photos); coordinates are resolved separately in {@link resolvePlace}, once the
   * user picks a suggestion, to keep Google call volume bounded per keystroke.
   */
  async autocomplete(rawQuery: string, profileId: string) {
    const parsed = placeAutocompleteQuerySchema.safeParse({ q: rawQuery });
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Parámetros de autocompletado inválidos",
        details: { issues: parsed.error.issues },
      });
    }
    this.limits.consume("places-autocomplete-user", profileId, 30, 60_000);

    const query = parsed.data.q;
    const [localMatches, googleMatches] = await Promise.all([
      this.searchLocalSpots(query),
      this.googleAutocomplete(query).catch((error) => {
        if (!(error instanceof GooglePlacesGuardRejectedException)) {
          this.logger.warn(
            `Google Places autocomplete unavailable: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
        return [];
      }),
    ]);

    return {
      items: [...localMatches, ...googleMatches],
      attribution: googleMatches.length > 0 ? GOOGLE_ATTRIBUTION : null,
    };
  }

  /** Resolves a Google place_id into coordinates and a display neighborhood, called once on selection. */
  async resolvePlace(placeId: string, profileId: string) {
    const trimmed = placeId.trim();
    if (!trimmed) throw new BadRequestException("placeId requerido");
    this.limits.consume("places-resolve-user", profileId, 20, 60_000);

    this.assertGoogleCallAllowed();

    const apiKey = process.env.GOOGLE_PLACES_API_KEY?.trim();
    if (!apiKey) throw new ServiceUnavailableException("Google Places no está configurado");

    try {
      const endpoint =
        process.env.GOOGLE_PLACES_DETAILS_URL?.trim() ||
        `https://places.googleapis.com/v1/places/${encodeURIComponent(trimmed)}`;
      const response = await fetch(endpoint, {
        headers: {
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": [
            "id",
            "displayName",
            "formattedAddress",
            "location",
            "addressComponents",
          ].join(","),
        },
        signal: AbortSignal.timeout(5_000),
      });
      if (response.status === 404) throw new NotFoundException("Lugar no encontrado");
      if (!response.ok) throw new BadGatewayException("Google Places no respondió correctamente");

      const place = (await response.json()) as GooglePlace & {
        addressComponents?: Array<{ longText?: unknown; types?: unknown }>;
      };
      const latitude = numberValue(place.location?.latitude);
      const longitude = numberValue(place.location?.longitude);
      const name = stringValue(place.displayName?.text);
      if (latitude === null || longitude === null || !name) {
        throw new BadGatewayException("Google Places devolvió datos incompletos");
      }
      if (
        !monterreyBounds.shape.latitude.safeParse(latitude).success ||
        !monterreyBounds.shape.longitude.safeParse(longitude).success
      ) {
        throw new BadRequestException(
          "Ese lugar queda fuera de la cobertura de Monterrey y su área metropolitana",
        );
      }

      return {
        placeId: trimmed,
        name,
        neighborhood: neighborhoodFromComponents(place.addressComponents) ?? name,
        formattedAddress: stringValue(place.formattedAddress),
        latitude,
        longitude,
        attribution: GOOGLE_ATTRIBUTION,
      };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException ||
        error instanceof BadGatewayException
      ) {
        throw error;
      }
      this.logger.error(
        "Google Places details failed",
        error instanceof Error ? error.stack : undefined,
      );
      throw new ServiceUnavailableException("Google Places no está disponible");
    }
  }

  /**
   * Emergency shutoff (GOOGLE_PLACES_KILL_SWITCH) and a global daily call budget
   * (GOOGLE_PLACES_DAILY_CALL_LIMIT), enforced before every outbound Google Places
   * request regardless of caller, to bound billing exposure independent of the
   * per-user rate limits above. See docs/google-places-controls.md.
   */
  private assertGoogleCallAllowed(): void {
    if (process.env.GOOGLE_PLACES_KILL_SWITCH?.trim().toLowerCase() === "true") {
      throw new GooglePlacesGuardRejectedException(
        "Google Places está deshabilitado temporalmente",
      );
    }

    const configuredLimit = Number(process.env.GOOGLE_PLACES_DAILY_CALL_LIMIT);
    const dailyLimit =
      Number.isFinite(configuredLimit) && configuredLimit > 0
        ? configuredLimit
        : DEFAULT_DAILY_CALL_LIMIT;

    try {
      this.limits.consume(GOOGLE_CALLS_SCOPE, "all", dailyLimit, GOOGLE_CALLS_WINDOW_MS);
    } catch {
      throw new GooglePlacesGuardRejectedException(
        "Se alcanzó el límite diario de solicitudes a Google Places",
      );
    }
  }

  private async searchLocalSpots(query: string) {
    const { rows } = await this.pool.query(
      `select id, name, neighborhood, latitude::float8 as latitude, longitude::float8 as longitude
       from app_private.spots
       where status='approved' and (normalized_name ilike $1 or neighborhood ilike $1)
       order by name asc
       limit 5`,
      [`%${escapeLikePattern(normalizeName(query))}%`],
    );
    return rows.map((row) => ({
      kind: "spot" as const,
      id: row.id as string,
      name: row.name as string,
      neighborhood: row.neighborhood as string,
      latitude: row.latitude as number,
      longitude: row.longitude as number,
    }));
  }

  private async googleAutocomplete(query: string) {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY?.trim();
    if (!apiKey) return [];

    this.assertGoogleCallAllowed();

    const endpoint =
      process.env.GOOGLE_PLACES_AUTOCOMPLETE_URL?.trim() ||
      "https://places.googleapis.com/v1/places:autocomplete";
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey },
      body: JSON.stringify({
        input: query,
        languageCode: "es",
        includedRegionCodes: ["mx"],
        locationBias: {
          circle: {
            center: { latitude: 25.6866, longitude: -100.3161 },
            radius: 25_000,
          },
        },
      }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new Error(`Google Places autocomplete returned ${response.status}`);

    const payload = (await response.json()) as {
      suggestions?: Array<{
        placePrediction?: {
          placeId?: unknown;
          text?: { text?: unknown };
          structuredFormat?: { secondaryText?: { text?: unknown } };
        };
      }>;
    };
    const suggestions = Array.isArray(payload.suggestions) ? payload.suggestions : [];
    return suggestions
      .map((suggestion) => suggestion.placePrediction)
      .filter((prediction): prediction is NonNullable<typeof prediction> => Boolean(prediction))
      .map((prediction) => ({
        kind: "google" as const,
        placeId: stringValue(prediction.placeId) ?? "",
        text: stringValue(prediction.text?.text) ?? "",
        secondaryText: stringValue(prediction.structuredFormat?.secondaryText?.text),
      }))
      .filter((item) => item.placeId && item.text);
  }

  private async searchGooglePlaces(input: PlacesSearchInput): Promise<GooglePlace[]> {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY?.trim();
    if (!apiKey) throw new ServiceUnavailableException("Google Places no está configurado");

    this.assertGoogleCallAllowed();

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
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function neighborhoodFromComponents(
  components: Array<{ longText?: unknown; types?: unknown }> | undefined,
): string | null {
  if (!Array.isArray(components)) return null;
  const priority = ["sublocality", "neighborhood", "locality", "administrative_area_level_2"];
  for (const type of priority) {
    const match = components.find(
      (component) => Array.isArray(component.types) && component.types.includes(type),
    );
    const text = match && stringValue(match.longText);
    if (text) return text;
  }
  return null;
}

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

function normalizeName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-MX")
    .trim()
    .replace(/\s+/g, " ");
}
