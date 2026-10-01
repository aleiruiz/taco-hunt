/**
 * T63 fixture adapters for the stand page.
 *
 * Google-owned details and photos are transient display data. They stay in a
 * separate type from Taco Hunt-owned photos so the Phase B adapter can replace
 * each source without changing the screen or accidentally persisting Google
 * media in the community gallery.
 */

export type GooglePlaceDetailsResultState = "ready" | "unavailable" | "error";
export type GooglePlacePhotosState = "available" | "unavailable";

export interface GooglePlacePhoto {
  source: "google";
  id: string;
  url: string;
  authorAttribution: string;
  sourceUrl: string;
}

export interface GooglePlaceDetails {
  source: "google";
  placeId: string;
  name: string;
  address: string;
  googleMapsUrl: string;
  attributionLabel: "Google Maps";
  photosState: GooglePlacePhotosState;
  photos: GooglePlacePhoto[];
}

export interface GooglePlaceDetailsResult {
  state: GooglePlaceDetailsResultState;
  details?: GooglePlaceDetails;
  message?: string;
}

const GOOGLE_PHOTO_FIXTURES: GooglePlacePhoto[] = [
  {
    source: "google",
    id: "google-photo-fixture-1",
    url: "https://placehold.co/720x480/302723/FFFAF1?text=Google+Place+Photo",
    authorAttribution: "Atribución de foto de Google (fixture)",
    sourceUrl: "https://www.google.com/maps",
  },
  {
    source: "google",
    id: "google-photo-fixture-2",
    url: "https://placehold.co/720x480/C23A1E/FFFAF1?text=Google+Place+Photo",
    authorAttribution: "Atribución de foto de Google (fixture)",
    sourceUrl: "https://www.google.com/maps",
  },
];

function configuredGoogleDetailsState(): GooglePlaceDetailsResultState {
  const value = process.env.EXPO_PUBLIC_T63_GOOGLE_DETAILS_STATE?.trim().toLowerCase();
  if (value === "unavailable" || value === "error") return value;
  return "ready";
}

function configuredGooglePhotosState(): GooglePlacePhotosState {
  const value = process.env.EXPO_PUBLIC_T63_GOOGLE_PHOTOS_STATE?.trim().toLowerCase();
  return value === "unavailable" ? "unavailable" : "available";
}

/**
 * Simulates the future authenticated API call for on-demand Google details.
 * The API, not the mobile app, will call Google Places in Phase B.
 *
 * Manual QA can set EXPO_PUBLIC_T63_GOOGLE_DETAILS_STATE to `unavailable` or
 * `error`, and EXPO_PUBLIC_T63_GOOGLE_PHOTOS_STATE to `unavailable`.
 */
export function getFixtureGooglePlaceDetails(spotId: string): Promise<GooglePlaceDetailsResult> {
  return new Promise((resolve) => {
    setTimeout(() => {
      const state = configuredGoogleDetailsState();
      if (state === "unavailable") {
        resolve({
          state,
          message: "Los datos de Google no están disponibles por ahora.",
        });
        return;
      }
      if (state === "error") {
        resolve({
          state,
          message: "No pudimos actualizar los datos de Google.",
        });
        return;
      }

      const photosState = configuredGooglePhotosState();
      const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(spotId)}`;
      resolve({
        state,
        details: {
          source: "google",
          placeId: `google-place-${spotId}`,
          name: "Puesto de Prueba Google",
          address: "Dirección disponible al consultar Google Maps",
          googleMapsUrl,
          attributionLabel: "Google Maps",
          photosState,
          photos: photosState === "available" ? GOOGLE_PHOTO_FIXTURES : [],
        },
      });
    }, 300);
  });
}

export type TacoHuntPhotoModerationStatus = "pending" | "approved" | "rejected";
export type TacoHuntPhotoKind = "tacos" | "puesto" | "menu";
export type TacoHuntPhotoFixtureMode =
  "empty" | "pending" | "rejected" | "published" | "uploading" | "error";

export interface TacoHuntPhoto {
  source: "taco-hunt";
  id: string;
  url: string;
  uploaderId: string;
  uploaderName: string;
  spotId: string;
  spotName: string;
  kind: TacoHuntPhotoKind;
  status: TacoHuntPhotoModerationStatus;
  rejectionReason?: string;
  createdAt: string;
}

export interface TacoHuntPhotoGalleryFixture {
  source: "taco-hunt";
  mode: TacoHuntPhotoFixtureMode;
  approved: TacoHuntPhoto[];
  mine: TacoHuntPhoto[];
  uploadMessage?: string;
}

function configuredTacoHuntPhotoMode(): TacoHuntPhotoFixtureMode | null {
  const value = process.env.EXPO_PUBLIC_T63_TACO_HUNT_PHOTO_MODE?.trim().toLowerCase();
  if (
    value === "empty" ||
    value === "pending" ||
    value === "rejected" ||
    value === "published" ||
    value === "uploading" ||
    value === "error"
  ) {
    return value;
  }
  return null;
}

export function getFixtureTacoHuntPhotoMode(): TacoHuntPhotoFixtureMode {
  return configuredTacoHuntPhotoMode() ?? "empty";
}

/**
 * Phase A fixture adapter for the Taco Hunt-owned gallery. Setting the env var
 * lets QA exercise empty, pending, rejected, published, uploading, and error
 * moderation states without any API or Storage data.
 */
export function getFixtureTacoHuntPhotoGallery(
  spotId: string,
  spotName: string,
  uploaderId = "user-123",
): Promise<TacoHuntPhotoGalleryFixture> {
  return new Promise((resolve) => {
    setTimeout(() => {
      const mode = configuredTacoHuntPhotoMode() ?? "empty";
      const base = {
        source: "taco-hunt" as const,
        spotId,
        spotName,
        uploaderId,
        uploaderName: "Tú",
        kind: "tacos" as const,
        createdAt: "2026-10-01T12:00:00.000Z",
      };
      const approved: TacoHuntPhoto[] =
        mode === "published"
          ? [
              {
                ...base,
                id: `${spotId}-taco-hunt-approved`,
                url: "https://placehold.co/480x480/276C4F/FFFAF1?text=Taco+Hunt",
                status: "approved",
              },
            ]
          : [];
      const mineStatus: TacoHuntPhotoModerationStatus =
        mode === "published" ? "approved" : mode === "rejected" ? "rejected" : "pending";
      const mine: TacoHuntPhoto[] =
        mode === "pending" || mode === "rejected" || mode === "published"
          ? [
              {
                ...base,
                id: `${spotId}-taco-hunt-${mode}`,
                url: "https://placehold.co/480x480/FCEBC8/302723?text=Mi+foto",
                status: mineStatus,
                rejectionReason:
                  mode === "rejected"
                    ? "La foto necesita mostrar mejor el puesto o la comida."
                    : undefined,
              },
            ]
          : [];

      resolve({
        source: "taco-hunt",
        mode,
        approved,
        mine,
        uploadMessage:
          mode === "error" ? "No pudimos preparar la foto. Inténtalo de nuevo." : undefined,
      });
    }, 150);
  });
}

export function createFixtureTacoHuntPhoto(
  spotId: string,
  spotName: string,
  uploaderId: string,
  localUri: string,
  kind: TacoHuntPhotoKind,
): Promise<TacoHuntPhoto> {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      const mode = configuredTacoHuntPhotoMode();
      if (mode === "error") {
        reject(new Error("No pudimos subir la foto. Inténtalo de nuevo."));
        return;
      }
      const status: TacoHuntPhotoModerationStatus = mode === "rejected" ? "rejected" : "pending";
      resolve({
        source: "taco-hunt",
        id: `${spotId}-taco-hunt-uploaded`,
        url: localUri,
        uploaderId,
        uploaderName: "Tú",
        spotId,
        spotName,
        kind,
        status,
        rejectionReason:
          status === "rejected"
            ? "La foto necesita mostrar mejor el puesto o la comida."
            : undefined,
        createdAt: new Date().toISOString(),
      });
    }, 450);
  });
}
