/**
 * T63 data adapters for the stand page.
 *
 * Google-owned details/photos remain transient and separate from the
 * Taco Hunt-owned moderated gallery. The API performs all Google calls.
 */

import { supabase } from "@/auth/client";
import { listSpotPhotos, uploadSpotPhoto, type SpotPhotoKind } from "@/features/spotPhotos/api";

const API = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3001/v1";

export type GooglePlaceDetailsResultState = "ready" | "unavailable" | "error";

export interface GooglePlaceDetails {
  source: "google";
  placeId: string;
  name: string;
  address: string;
  googleMapsUrl: string;
  attributionLabel: "Google Maps";
}

export interface GooglePlaceDetailsResult {
  state: GooglePlaceDetailsResultState;
  details?: GooglePlaceDetails;
  message?: string;
}

type PlaceDetailsResponse = {
  state: GooglePlaceDetailsResultState;
  details?: {
    source: "google";
    placeId: string;
    name: string;
    formattedAddress: string | null;
    googleMapsUrl: string;
    attribution: { label: string; sourceUrl: string };
  };
  message?: string;
};

function messageFromResponse(value: unknown): string {
  if (typeof value === "object" && value !== null && "error" in value) {
    const error = (value as { error?: unknown }).error;
    if (
      typeof error === "object" &&
      error !== null &&
      "message" in error &&
      typeof (error as { message?: unknown }).message === "string"
    ) {
      return (error as { message: string }).message;
    }
  }
  return "No pudimos actualizar los datos de Google.";
}

/** Fetches the durable place link, then hydrates Google details on demand. */
export async function getFixtureGooglePlaceDetails(
  spotId: string,
): Promise<GooglePlaceDetailsResult> {
  const spotResponse = await fetch(`${API}/spots/${encodeURIComponent(spotId)}`);
  if (!spotResponse.ok) {
    let payload: unknown;
    try {
      payload = await spotResponse.json();
    } catch {
      payload = undefined;
    }
    throw new Error(messageFromResponse(payload));
  }
  const spot = (await spotResponse.json()) as { googlePlaceId?: unknown };
  if (typeof spot.googlePlaceId !== "string" || !spot.googlePlaceId.trim()) {
    return {
      state: "unavailable",
      message: "Este puesto todavía no tiene datos de Google vinculados.",
    };
  }

  const response = await fetch(`${API}/places/${encodeURIComponent(spot.googlePlaceId)}/details`);
  if (!response.ok) {
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      payload = undefined;
    }
    throw new Error(messageFromResponse(payload));
  }
  const data = (await response.json()) as PlaceDetailsResponse;
  if (!data.details) return { state: data.state, message: data.message };
  return {
    state: data.state,
    message: data.message,
    details: {
      source: "google",
      placeId: data.details.placeId,
      name: data.details.name,
      address: data.details.formattedAddress ?? "Dirección no confirmada",
      googleMapsUrl: data.details.googleMapsUrl,
      attributionLabel: "Google Maps",
    },
  };
}

export type TacoHuntPhotoModerationStatus = "pending" | "approved" | "rejected";
export type TacoHuntPhotoKind = SpotPhotoKind;
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

/** Loads only the public, approved Taco Hunt gallery. Pending photos stay uploader-only. */
export async function getFixtureTacoHuntPhotoGallery(
  spotId: string,
  spotName: string,
  _uploaderId = "user-123",
): Promise<TacoHuntPhotoGalleryFixture> {
  const photos = await listSpotPhotos(spotId);
  const approved = photos.map((photo) => ({
    source: "taco-hunt" as const,
    id: photo.id,
    url: photo.url,
    uploaderId: "",
    uploaderName: photo.uploaderName,
    spotId,
    spotName,
    kind: photo.kind,
    status: "approved" as const,
    createdAt: photo.createdAt,
  }));
  return {
    source: "taco-hunt",
    mode: approved.length > 0 ? "published" : "empty",
    approved,
    mine: [],
  };
}

/** Uploads through the existing processed-photo pipeline and claims the upload for the spot. */
export async function createFixtureTacoHuntPhoto(
  spotId: string,
  spotName: string,
  _uploaderId: string,
  localUri: string,
  kind: TacoHuntPhotoKind,
): Promise<TacoHuntPhoto> {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error("Se requiere iniciar sesión para subir una foto.");
  const photo = await uploadSpotPhoto(data.session, spotId, { uri: localUri }, kind);
  return {
    source: "taco-hunt",
    id: photo.id,
    url: photo.url,
    uploaderId: photo.uploaderId,
    uploaderName: photo.uploaderName,
    spotId,
    spotName,
    kind: photo.kind,
    status: photo.status,
    ...(photo.rejectionReason ? { rejectionReason: photo.rejectionReason } : {}),
    createdAt: photo.createdAt,
  };
}
