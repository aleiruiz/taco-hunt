import type { Session } from "@supabase/supabase-js";

const API = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3001/v1";

export type PlaceSuggestion =
  | {
      kind: "spot";
      id: string;
      name: string;
      neighborhood: string;
      latitude: number;
      longitude: number;
    }
  | { kind: "google"; placeId: string; text: string; secondaryText: string | null };

export type AutocompleteResult = { items: PlaceSuggestion[]; attribution: string | null };

export type ResolvedPlace = {
  placeId: string;
  name: string;
  neighborhood: string;
  formattedAddress: string | null;
  latitude: number;
  longitude: number;
  attribution: string | null;
};

function messageFromResponse(value: unknown) {
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
  return "No pudimos completar la solicitud.";
}

async function request<T>(path: string, session: Session): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${session.access_token}` },
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
  return (await response.json()) as T;
}

export async function fetchAutocomplete(
  session: Session,
  query: string,
): Promise<AutocompleteResult> {
  return request(`/places/autocomplete?q=${encodeURIComponent(query)}`, session);
}

export async function resolvePlace(session: Session, placeId: string): Promise<ResolvedPlace> {
  return request(`/places/${encodeURIComponent(placeId)}/resolve`, session);
}
