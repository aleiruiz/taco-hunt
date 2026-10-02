import type { Session } from "@supabase/supabase-js";
import { Platform } from "react-native";
import { uploadReviewPhoto } from "@/features/contributions/api";

const API =
  process.env.EXPO_PUBLIC_API_URL?.trim() ||
  (Platform.OS === "android" ? "http://10.0.2.2:3001/v1" : "http://localhost:3001/v1");

export type SpotPhotoKind = "tacos" | "puesto" | "menu";

// Public shape (GET /v1/spots/:id/photos): never carries uploaderId, status,
// or rejectionReason — see packages/contracts' publicSpotPhotoSchema.
export type PublicSpotPhoto = {
  id: string;
  url: string;
  uploaderName: string;
  kind: SpotPhotoKind;
  createdAt: string;
};

// Uploader's own view (POST /v1/spots/:id/photos response).
export type SpotPhoto = {
  id: string;
  url: string;
  uploaderId: string;
  uploaderName: string;
  kind: SpotPhotoKind;
  status: "pending" | "approved" | "rejected";
  rejectionReason: string | null;
  createdAt: string;
};

function messageFromResponse(value: unknown) {
  if (typeof value === "object" && value !== null && "error" in value) {
    const error = (value as { error: unknown }).error;
    if (
      typeof error === "object" &&
      error !== null &&
      "message" in error &&
      typeof (error as { message: unknown }).message === "string"
    ) {
      return (error as { message: string }).message;
    }
  }
  return "No pudimos completar la solicitud.";
}

export async function listSpotPhotos(spotId: string): Promise<PublicSpotPhoto[]> {
  const response = await fetch(`${API}/spots/${encodeURIComponent(spotId)}/photos`);
  if (!response.ok) throw new Error("No pudimos cargar las fotos del puesto.");
  const data = (await response.json()) as { items: PublicSpotPhoto[] };
  return data.items;
}

/**
 * Uploads the picked asset via the shared review-photo pipeline, then claims
 * it for this spot as a pending photo. Two network calls because the upload
 * endpoint (POST /v1/review-photos) is reused as-is rather than duplicated.
 */
export async function uploadSpotPhoto(
  session: Session,
  spotId: string,
  asset: { uri: string; fileName?: string | null; mimeType?: string | null },
  kind: SpotPhotoKind,
): Promise<SpotPhoto> {
  const upload = await uploadReviewPhoto(session, asset);
  const response = await fetch(`${API}/spots/${encodeURIComponent(spotId)}/photos`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ photoUploadId: upload.id, kind }),
  });
  if (!response.ok) {
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      payload = undefined;
    }
    throw new Error(messageFromResponse(payload));
  }
  return (await response.json()) as SpotPhoto;
}
