import {
  BadGatewayException,
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import {
  googlePlaceIdSchema,
  googleReviewTargetCreateSchema,
  placeAutocompleteQuerySchema,
  placesViewportQuerySchema,
  type PlacesViewportQuery,
} from "@taco-hunt/contracts";
import { DATABASE_POOL } from "../database/database.module.js";
import { RequestLimitService } from "../auth/request-limit.service.js";
import { MediaStorageService } from "../media/storage.service.js";

const GOOGLE_ATTRIBUTION = "Con la tecnología de Google";
const GOOGLE_MAPS_ATTRIBUTION = {
  label: "Google Maps",
  sourceUrl: "https://www.google.com/maps",
} as const;
const GOOGLE_CALLS_SCOPE = "places-google-calls-global";
const GOOGLE_CALLS_WINDOW_MS = 24 * 60 * 60 * 1000;
const DEFAULT_DAILY_CALL_LIMIT = 2_000;
const PUBLIC_GOOGLE_READ_SCOPE = "places-google-reads-client";
const PUBLIC_GOOGLE_READ_LIMIT = 30;
const PUBLIC_GOOGLE_READ_WINDOW_MS = 60_000;
const VIEWPORT_SEARCH_INSET = 0.15;

const monterreyBounds = z.object({
  latitude: z.number().min(25.3).max(26.1),
  longitude: z.number().min(-101).max(-99.7),
});

type GooglePlace = {
  id?: unknown;
  displayName?: { text?: unknown };
  formattedAddress?: unknown;
  location?: { latitude?: unknown; longitude?: unknown };
  addressComponents?: Array<{ longText?: unknown; types?: unknown }>;
  googleMapsUri?: unknown;
  photos?: Array<{ name?: unknown }>;
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
    private readonly storage: MediaStorageService,
  ) {}

  /**
   * Hydrates only the visible viewport. Google display data is returned to the
   * caller and never inserted into Taco Hunt tables.
   */
  async discoverViewport(rawInput: unknown, viewerId: string | undefined, clientIp: string) {
    const parsed = placesViewportQuerySchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Parámetros de viewport inválidos",
        details: { issues: parsed.error.issues },
      });
    }

    const input = parsed.data;
    this.consumePublicGoogleReadLimit(viewerId, clientIp);
    const localProposals = await this.findLocalProposals(input, viewerId);
    if (this.googlePlacesUnavailable()) {
      return {
        state: "unavailable" as const,
        googleResults: [],
        localProposals,
        attribution: GOOGLE_MAPS_ATTRIBUTION,
        message: "La búsqueda de Google no está disponible por ahora.",
      };
    }

    try {
      const places = await this.searchGoogleViewport(input);
      const googleResults = places
        .map((place) => toViewportResult(place))
        .filter((place): place is NonNullable<typeof place> => place !== null)
        .filter(
          (place) =>
            place.latitude >= input.south &&
            place.latitude <= input.north &&
            place.longitude >= input.west &&
            place.longitude <= input.east,
        );
      return {
        state: googleResults.length > 0 ? ("ready" as const) : ("empty" as const),
        googleResults,
        localProposals,
        attribution: GOOGLE_MAPS_ATTRIBUTION,
        ...(googleResults.length === 0
          ? { message: "No hay resultados de Google en esta vista." }
          : {}),
      };
    } catch (error) {
      if (error instanceof GooglePlacesGuardRejectedException) {
        return {
          state: "unavailable" as const,
          googleResults: [],
          localProposals,
          attribution: GOOGLE_MAPS_ATTRIBUTION,
          message: error.message,
        };
      }
      if (
        error instanceof BadGatewayException ||
        error instanceof BadRequestException ||
        error instanceof ServiceUnavailableException
      ) {
        throw error;
      }
      this.logger.error(
        "Google Places viewport discovery failed",
        error instanceof Error ? error.stack : undefined,
      );
      throw new ServiceUnavailableException("Google Places no está disponible");
    }
  }

  /**
   * Fetches attribution-safe place details on demand. Google photos are
   * proxied transiently; persistent Taco Hunt photos come only from the
   * moderated gallery.
   */
  async getPlaceDetails(placeId: string, viewerId: string | undefined, clientIp: string) {
    const parsedPlaceId = googlePlaceIdSchema.safeParse(placeId);
    if (!parsedPlaceId.success) throw new BadRequestException("placeId inválido");

    this.consumePublicGoogleReadLimit(viewerId, clientIp);
    if (this.googlePlacesUnavailable()) {
      return {
        state: "unavailable" as const,
        message: "Los datos de Google no están disponibles por ahora.",
      };
    }

    const apiKey = process.env.GOOGLE_PLACES_API_KEY?.trim();
    if (!apiKey) {
      return {
        state: "unavailable" as const,
        message: "Google Places no está configurado.",
      };
    }

    this.assertGoogleCallAllowed();
    try {
      const endpoint =
        process.env.GOOGLE_PLACES_DETAILS_URL?.trim() ||
        `https://places.googleapis.com/v1/places/${encodeURIComponent(parsedPlaceId.data)}`;
      const response = await fetch(endpoint, {
        headers: {
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": [
            "id",
            "displayName",
            "formattedAddress",
            "photos",
            "googleMapsUri",
          ].join(","),
        },
        signal: AbortSignal.timeout(5_000),
      });
      if (response.status === 404) throw new NotFoundException("Lugar no encontrado");
      if (!response.ok) throw new BadGatewayException("Google Places no respondió correctamente");

      const place = (await response.json()) as GooglePlace;
      const name = stringValue(place.displayName?.text);
      if (!name) throw new BadGatewayException("Google Places devolvió datos incompletos");

      const googleMapsUrl = safeGoogleMapsUrl(place.googleMapsUri, parsedPlaceId.data);
      return {
        state: "ready" as const,
        details: {
          source: "google" as const,
          placeId: parsedPlaceId.data,
          name,
          formattedAddress: stringValue(place.formattedAddress),
          ...(stringValue(place.photos?.[0]?.name)
            ? { photoName: stringValue(place.photos?.[0]?.name) as string }
            : {}),
          googleMapsUrl,
          attribution: GOOGLE_MAPS_ATTRIBUTION,
        },
      };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadGatewayException ||
        error instanceof GooglePlacesGuardRejectedException
      ) {
        throw error;
      }
      this.logger.error(
        "Google Places on-demand details failed",
        error instanceof Error ? error.stack : undefined,
      );
      throw new ServiceUnavailableException("Google Places no está disponible");
    }
  }

  /**
   * Registers a Google place at the moment an authenticated user starts a
   * review. The Google place ID is retained as provenance; the selected Taco
   * Hunt taco type becomes the first reviewable taco for that spot.
   */
  async createGoogleReviewTarget(rawInput: unknown, profileId: string, clientIp: string) {
    const parsed = googleReviewTargetCreateSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Datos del lugar para reseña inválidos",
        details: { issues: parsed.error.issues },
      });
    }

    const placeId = parsed.data.placeId;
    const tacoTypeId = parsed.data.tacoTypeId;
    const existingSpot = await this.pool.query<{
      id: string;
      name: string;
      neighborhood: string;
      latitude: number;
      longitude: number;
    }>(
      `select id,name,neighborhood,latitude::float8 as latitude,longitude::float8 as longitude
       from app_private.spots where google_place_id=$1 limit 1`,
      [placeId],
    );

    let name: string;
    let latitude: number;
    let longitude: number;
    let neighborhood: string;
    if (existingSpot.rows[0]) {
      ({ name, latitude, longitude, neighborhood } = existingSpot.rows[0]);
    } else {
      this.consumePublicGoogleReadLimit(profileId, clientIp);
      if (this.googlePlacesUnavailable()) {
        throw new ServiceUnavailableException("Google Places no está disponible por ahora");
      }

      const apiKey = process.env.GOOGLE_PLACES_API_KEY?.trim();
      if (!apiKey) throw new ServiceUnavailableException("Google Places no está configurado");
      this.assertGoogleCallAllowed();

      let place: GooglePlace;
      try {
        const endpoint =
          process.env.GOOGLE_PLACES_DETAILS_URL?.trim() ||
          `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`;
        const response = await fetch(endpoint, {
          headers: {
            "X-Goog-Api-Key": apiKey,
            "X-Goog-FieldMask": ["id", "displayName", "location", "addressComponents"].join(","),
          },
          signal: AbortSignal.timeout(5_000),
        });
        if (response.status === 404) throw new NotFoundException("Lugar no encontrado");
        if (!response.ok) throw new BadGatewayException("Google Places no respondió correctamente");
        place = (await response.json()) as GooglePlace;
      } catch (error) {
        if (error instanceof NotFoundException || error instanceof BadGatewayException) throw error;
        this.logger.error(
          "Google Places review target lookup failed",
          error instanceof Error ? error.stack : undefined,
        );
        throw new ServiceUnavailableException("Google Places no está disponible");
      }

      name = stringValue(place.displayName?.text) ?? "";
      latitude = numberValue(place.location?.latitude) ?? Number.NaN;
      longitude = numberValue(place.location?.longitude) ?? Number.NaN;
      neighborhood = neighborhoodFromComponents(place.addressComponents) ?? "Zona no confirmada";
    }

    if (!name || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      throw new BadGatewayException("Google Places devolvió datos incompletos");
    }
    if (!monterreyBounds.safeParse({ latitude, longitude }).success) {
      throw new BadRequestException("El lugar está fuera de la cobertura de Taco Hunt");
    }
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const tacoType = await client.query<{ id: string; name_es: string }>(
        "select id,name_es from app_private.taco_types where id=$1 and active",
        [tacoTypeId],
      );
      if (!tacoType.rowCount) throw new NotFoundException("Tipo de taco no encontrado");

      const spot = await client.query<{ id: string; name: string }>(
        `insert into app_private.spots
           (name,normalized_name,neighborhood,latitude,longitude,status,created_by,source_type,source_ref,google_place_id)
         values ($1,$2,$3,$4,$5,'approved',$6,'user',$7,$8)
         on conflict (google_place_id) where google_place_id is not null
         do update set status='approved',updated_at=now()
         returning id,name`,
        [
          name,
          normalizeName(name),
          neighborhood,
          latitude,
          longitude,
          profileId,
          `google_places:${placeId}`,
          placeId,
        ],
      );
      const spotId = spot.rows[0]?.id;
      if (!spotId) throw new ServiceUnavailableException("No se pudo registrar el lugar");

      const target = await client.query<{ id: string; taco_name: string }>(
        `insert into app_private.spot_tacos (spot_id,taco_type_id,display_name,status,created_by)
         values ($1,$2,null,'approved',$3)
         on conflict (spot_id,taco_type_id)
         do update set status='approved'
         returning id,coalesce(display_name,$4) as taco_name`,
        [spotId, tacoTypeId, profileId, tacoType.rows[0].name_es],
      );
      const row = target.rows[0];
      if (!row) throw new ServiceUnavailableException("No se pudo preparar la reseña");

      await client.query("commit");
      return {
        spotTacoId: row.id,
        spotId,
        spotName: spot.rows[0].name,
        tacoName: row.taco_name,
      };
    } catch (error) {
      await this.rollback(client);
      if (error instanceof NotFoundException || error instanceof ServiceUnavailableException) {
        throw error;
      }
      this.logger.error(
        "Google review target registration failed",
        error instanceof Error ? error.stack : undefined,
      );
      throw new ServiceUnavailableException("No se pudo preparar la reseña");
    } finally {
      client.release();
    }
  }

  private async findLocalProposals(input: PlacesViewportQuery, viewerId: string | undefined) {
    if (!viewerId) return [];
    try {
      const { rows } = await this.pool.query(
        `select s.id,s.name,s.neighborhood,s.latitude::float8 as latitude,s.longitude::float8 as longitude,s.status,
           (select sp.object_key from app_private.spot_photos sp
            where sp.spot_id=s.id
              and (sp.status='approved' or (sp.status='pending' and sp.uploader_id=$1))
            order by case when sp.status='approved' then 0 else 1 end,sp.created_at desc
            limit 1) as photo_key
         from app_private.spots s
         where s.status='pending' and s.created_by=$1
           and s.latitude between $2 and $3 and s.longitude between $4 and $5
           order by s.created_at desc limit $6`,
        [viewerId, input.south, input.north, input.west, input.east, input.limit],
      );
      return await Promise.all(
        rows.map(async (row) => ({
          source: "taco-hunt" as const,
          id: row.id as string,
          name: (row.name as string | null) ?? null,
          neighborhood: (row.neighborhood as string | null) ?? null,
          latitude: row.latitude as number,
          longitude: row.longitude as number,
          status: row.status as "pending",
          photoUrl:
            row.photo_key && this.storage.enabled
              ? await this.storage.createSignedUrl(row.photo_key as string)
              : null,
        })),
      );
    } catch (error) {
      this.logger.error(
        "Viewport proposal query failed",
        error instanceof Error ? error.stack : undefined,
      );
      throw new ServiceUnavailableException("Servicio temporalmente no disponible");
    }
  }

  private async searchGoogleViewport(input: PlacesViewportQuery): Promise<GooglePlace[]> {
    const longitudeSpan = input.east - input.west;
    if (longitudeSpan > 180) {
      throw new BadRequestException("Viewport demasiado amplio");
    }
    const searchBounds = centeredViewportBounds(input);
    const results = await this.searchGoogleViewportArea(searchBounds);
    const placesById = new Map<string, GooglePlace>();
    for (const place of results) {
      const placeId = stringValue(place.id);
      const latitude = numberValue(place.location?.latitude);
      const longitude = numberValue(place.location?.longitude);
      if (
        !placeId ||
        latitude === null ||
        longitude === null ||
        latitude < searchBounds.south ||
        latitude > searchBounds.north ||
        longitude < searchBounds.west ||
        longitude > searchBounds.east
      ) {
        continue;
      }
      placesById.set(placeId, place);
    }
    return [...placesById.values()];
  }

  private async searchGoogleViewportArea(input: PlacesViewportQuery): Promise<GooglePlace[]> {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY?.trim();
    if (!apiKey) throw new ServiceUnavailableException("Google Places no está configurado");
    this.assertGoogleCallAllowed();

    const endpoint =
      process.env.GOOGLE_PLACES_TEXT_SEARCH_URL?.trim() ||
      "https://places.googleapis.com/v1/places:searchText";
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": [
          "places.id",
          "places.displayName",
          "places.shortFormattedAddress",
          "places.location",
          "places.addressComponents",
          "places.photos",
          "places.googleMapsUri",
        ].join(","),
      },
      body: JSON.stringify({
        textQuery: "tacos",
        pageSize: 20,
        languageCode: "es",
        regionCode: "MX",
        rankPreference: "DISTANCE",
        locationRestriction: {
          rectangle: {
            low: { latitude: input.south, longitude: input.west },
            high: { latitude: input.north, longitude: input.east },
          },
        },
      }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new BadGatewayException("Google Places no respondió correctamente");

    const payload = (await response.json()) as GooglePlacesResponse;
    return Array.isArray(payload.places) ? payload.places : [];
  }

  /**
   * Proxies a transient Google photo so the Places API key never reaches the
   * mobile client and the Google display payload is never persisted.
   */
  async getPlacePhoto(rawName: string, viewerId: string | undefined, clientIp: string) {
    const photoName = typeof rawName === "string" ? rawName.trim() : "";
    if (!photoName || photoName.length > 500 || !/^places\/[^/]+\/photos\/[^/]+$/.test(photoName)) {
      throw new BadRequestException("Recurso de foto inválido");
    }

    this.consumePublicGoogleReadLimit(viewerId, clientIp);
    if (this.googlePlacesUnavailable()) {
      throw new ServiceUnavailableException("Google Places no está disponible por ahora");
    }

    const apiKey = process.env.GOOGLE_PLACES_API_KEY?.trim();
    if (!apiKey) throw new ServiceUnavailableException("Google Places no está configurado");
    this.assertGoogleCallAllowed();

    const endpoint = new URL(`https://places.googleapis.com/v1/${photoName}/media`);
    endpoint.searchParams.set("maxWidthPx", "800");
    endpoint.searchParams.set("skipHttpRedirect", "true");
    const response = await fetch(endpoint, {
      headers: { "X-Goog-Api-Key": apiKey },
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new BadGatewayException("Google Places no devolvió la foto");

    const payload = (await response.json()) as { photoUri?: unknown };
    const photoUri = stringValue(payload.photoUri);
    if (!photoUri) throw new BadGatewayException("Google Places devolvió una foto incompleta");

    let imageUrl: URL;
    try {
      imageUrl = new URL(photoUri);
    } catch {
      throw new BadGatewayException("Google Places devolvió una URL de foto inválida");
    }
    if (
      imageUrl.protocol !== "https:" ||
      !(
        imageUrl.hostname === "googleusercontent.com" ||
        imageUrl.hostname.endsWith(".googleusercontent.com")
      )
    ) {
      throw new BadGatewayException("Google Places devolvió una URL de foto no permitida");
    }

    const imageResponse = await fetch(imageUrl, { signal: AbortSignal.timeout(5_000) });
    if (!imageResponse.ok) throw new BadGatewayException("No se pudo descargar la foto de Google");
    const contentType = imageResponse.headers.get("content-type")?.split(";", 1)[0];
    if (!contentType?.startsWith("image/")) {
      throw new BadGatewayException("Google Places devolvió un formato de imagen inválido");
    }
    return { body: Buffer.from(await imageResponse.arrayBuffer()), contentType };
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

    const apiKey = process.env.GOOGLE_PLACES_API_KEY?.trim();
    if (!apiKey) throw new ServiceUnavailableException("Google Places no está configurado");

    this.assertGoogleCallAllowed();

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
    if (this.googlePlacesKillSwitchEnabled()) {
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

  private googlePlacesKillSwitchEnabled(): boolean {
    return process.env.GOOGLE_PLACES_KILL_SWITCH?.trim().toLowerCase() === "true";
  }

  private googlePlacesUnavailable(): boolean {
    return this.googlePlacesKillSwitchEnabled() || !process.env.GOOGLE_PLACES_API_KEY?.trim();
  }

  private consumePublicGoogleReadLimit(viewerId: string | undefined, clientIp: string): void {
    const key = viewerId ? `user:${viewerId}` : `ip:${clientIp || "unknown"}`;
    this.limits.consume(
      PUBLIC_GOOGLE_READ_SCOPE,
      key,
      PUBLIC_GOOGLE_READ_LIMIT,
      PUBLIC_GOOGLE_READ_WINDOW_MS,
    );
  }

  private async rollback(client: PoolClient): Promise<void> {
    try {
      await client.query("rollback");
    } catch {
      // Preserve the original application error if rollback itself fails.
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
}

function toViewportResult(place: GooglePlace) {
  const placeId = stringValue(place.id);
  const name = stringValue(place.displayName?.text);
  const latitude = numberValue(place.location?.latitude);
  const longitude = numberValue(place.location?.longitude);
  if (!placeId || !name || latitude === null || longitude === null) return null;

  return {
    source: "google" as const,
    placeId,
    name,
    neighborhood: neighborhoodFromComponents(place.addressComponents),
    latitude,
    longitude,
    googleMapsUrl: safeGoogleMapsUrl(place.googleMapsUri, placeId),
    attribution: GOOGLE_MAPS_ATTRIBUTION,
    ...(stringValue(place.photos?.[0]?.name)
      ? { photoName: stringValue(place.photos?.[0]?.name) as string }
      : {}),
  };
}

function safeGoogleMapsUrl(value: unknown, placeId: string): string {
  try {
    const url = new URL(stringValue(value) ?? "");
    if (
      url.protocol === "https:" &&
      (url.hostname === "google.com" || url.hostname.endsWith(".google.com"))
    ) {
      return url.toString();
    }
  } catch {
    // Fall back to Google's canonical map URL below.
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(placeId)}`;
}

function centeredViewportBounds(input: PlacesViewportQuery): PlacesViewportQuery {
  const latitudeInset = (input.north - input.south) * VIEWPORT_SEARCH_INSET;
  const longitudeInset = (input.east - input.west) * VIEWPORT_SEARCH_INSET;
  return {
    ...input,
    south: input.south + latitudeInset,
    north: input.north - latitudeInset,
    west: input.west + longitudeInset,
    east: input.east - longitudeInset,
  };
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
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
