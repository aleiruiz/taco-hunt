/**
 * T40: real GET/PATCH /v1/me, replacing the Phase A fixtures in auth.ts and
 * auth-onboarding.ts for the signed-in user's own profile (display name,
 * avatar preset, avatar photo). Follows the same request()/session-auth
 * convention as src/features/contributions/api.ts.
 */
import type { Session } from "@supabase/supabase-js";

const API = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3001/v1";

function assertSecureApiUrl() {
  const url = new URL(API);
  const localHost = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !localHost) {
    throw new Error("La conexión segura con el API no está configurada.");
  }
}

export type AvatarPreset =
  "pastor" | "masa" | "cilantro" | "tortilla" | "salsa" | "comal" | "aguacate" | "horchata";

export type Profile = {
  id: string;
  displayName: string | null;
  avatarPreset: AvatarPreset;
  avatarPhotoUrl: string | null;
  avatarPhotoStatus: "pending" | "approved" | "rejected" | null;
};

export type ProfilePatch = {
  displayName?: string | null;
  avatarPreset?: AvatarPreset;
  avatarPhotoUploadId?: string | null;
};

export type AvatarPhotoUpload = { id: string; contentType: string; sizeBytes: number };

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

async function request<T>(path: string, session: Session, init?: RequestInit): Promise<T> {
  assertSecureApiUrl();
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      ...init?.headers,
    },
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
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function getProfile(session: Session): Promise<Profile> {
  return request<Profile>("/me", session);
}

export function updateProfile(session: Session, patch: ProfilePatch): Promise<Profile> {
  return request<Profile>("/me", session, { method: "PATCH", body: JSON.stringify(patch) });
}

/**
 * Uploads a profile photo asset. Reuses the existing review-photo processing
 * pipeline (EXIF strip/resize/compress) via POST /v1/review-photos — the
 * endpoint isn't review-specific, it just processes and stores an image and
 * returns a one-use upload id. Pass the returned id as `avatarPhotoUploadId`
 * to updateProfile() to claim it as the new avatar photo.
 */
export async function uploadAvatarPhoto(
  session: Session,
  asset: { uri: string; fileName?: string | null; mimeType?: string | null },
): Promise<AvatarPhotoUpload> {
  assertSecureApiUrl();
  const form = new FormData();
  form.append("file", {
    uri: asset.uri,
    name: asset.fileName ?? "avatar-photo.jpg",
    type: asset.mimeType ?? "image/jpeg",
  } as unknown as Blob);
  const response = await fetch(`${API}/review-photos`, {
    method: "POST",
    headers: { Authorization: `Bearer ${session.access_token}` },
    body: form,
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
  return (await response.json()) as AvatarPhotoUpload;
}
