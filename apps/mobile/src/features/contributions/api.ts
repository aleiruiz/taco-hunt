import type { Session } from "@supabase/supabase-js";

const API = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3001/v1";

export type OwnReview = {
  id: string;
  spotTacoId: string;
  spotId: string | null;
  spotName: string;
  neighborhood: string;
  tacoTypeId: string | null;
  tacoName: string;
  tortilla: number;
  filling: number;
  salsa: number;
  value: number;
  score: number;
  pricePaidMxn: number | null;
  body: string | null;
  status: "visible" | "hidden";
  createdAt: string;
  updatedAt: string;
};

export type Favorite = {
  id: string;
  name: string;
  neighborhood: string;
  latitude: number;
  longitude: number;
  photoUrl: string | null;
  lastVerifiedAt: string | null;
  reviewCount: number;
  bestTaco: {
    id: string;
    tacoTypeId: string;
    name: string;
    score: number | null;
    reviewCount: number;
  } | null;
  favoritedAt: string;
};

export type ReviewInput = {
  spotTacoId: string;
  tortilla: number;
  filling: number;
  salsa: number;
  value: number;
  pricePaidMxn?: number;
  body?: string;
  photoUploadId?: string;
};

export type ReviewPatch = Partial<Omit<ReviewInput, "spotTacoId" | "pricePaidMxn" | "body">> & {
  pricePaidMxn?: number | null;
  body?: string | null;
  photoUploadId?: string | null;
};

export type ReviewPhotoUpload = {
  id: string;
  contentType: string;
  sizeBytes: number;
};

export async function uploadReviewPhoto(
  session: Session,
  asset: { uri: string; fileName?: string | null; mimeType?: string | null },
): Promise<ReviewPhotoUpload> {
  const form = new FormData();
  form.append("file", {
    uri: asset.uri,
    name: asset.fileName ?? "review-photo.jpg",
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
  return (await response.json()) as ReviewPhotoUpload;
}

function messageFromResponse(value: unknown) {
  if (typeof value === "object" && value !== null && "error" in value) {
    const error = value.error;
    if (
      typeof error === "object" &&
      error !== null &&
      "message" in error &&
      typeof error.message === "string"
    ) {
      return error.message;
    }
  }
  return "No pudimos completar la solicitud.";
}

async function request<T>(path: string, session: Session, init?: RequestInit): Promise<T> {
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

export async function listOwnReviews(session: Session) {
  const items: OwnReview[] = [];
  let cursor: string | null = null;
  do {
    const page: { items: OwnReview[]; nextCursor: string | null } = await request(
      `/me/reviews?limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
      session,
    );
    items.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor);
  return { items, nextCursor: null };
}

export async function createReview(session: Session, input: ReviewInput) {
  return request<OwnReview>("/reviews", session, { method: "POST", body: JSON.stringify(input) });
}

export async function updateReview(session: Session, id: string, input: ReviewPatch) {
  return request<OwnReview>(`/reviews/${encodeURIComponent(id)}`, session, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function deleteReview(session: Session, id: string) {
  await request<void>(`/reviews/${encodeURIComponent(id)}`, session, { method: "DELETE" });
}

export async function listFavorites(session: Session) {
  const items: Favorite[] = [];
  let cursor: string | null = null;
  do {
    const page: { items: Favorite[]; nextCursor: string | null } = await request(
      `/me/favorites?limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
      session,
    );
    items.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor);
  return { items, nextCursor: null };
}

export async function setFavorite(session: Session, spotId: string, favorite: boolean) {
  await request<void>(`/me/favorites/${encodeURIComponent(spotId)}`, session, {
    method: favorite ? "PUT" : "DELETE",
  });
}

export async function deleteAccount(session: Session) {
  await request<void>("/me", session, { method: "DELETE" });
}
