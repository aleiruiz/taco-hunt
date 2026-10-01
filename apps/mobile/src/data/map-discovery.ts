/**
 * Live viewport discovery adapter for the map foundation.
 *
 * Google display data is transient and deliberately kept separate from
 * Taco Hunt-owned proposal pins. The API is the only component that calls
 * Google Places and includes the attribution required by the response.
 */

import { supabase } from "@/auth/client";

export type MapDiscoveryState = "loading" | "ready" | "empty" | "unavailable" | "offline" | "error";

export interface DiscoveryViewport {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface GoogleDiscoveryResult {
  id: string;
  name: string;
  neighborhood: string;
  latitude: number;
  longitude: number;
  sourceUrl: string;
  attributionLabel: "Resultados de Google";
}

export interface TacoHuntProposalPin {
  id: string;
  name: string;
  neighborhood: string;
  latitude: number;
  longitude: number;
  status: "pending";
  ownershipLabel: "Propuesta de Taco Hunt";
}

export interface MapDiscoverySnapshot {
  state: Exclude<MapDiscoveryState, "loading">;
  googleResults: GoogleDiscoveryResult[];
  localProposals: TacoHuntProposalPin[];
  attribution: {
    label: "Google Maps";
    sourceUrl: string;
  };
  message?: string;
}

export const MAP_DISCOVERY_ATTRIBUTION: MapDiscoverySnapshot["attribution"] = {
  label: "Google Maps",
  sourceUrl: "https://www.google.com/maps",
};

const API = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3001/v1";

type PlacesViewportResponse = {
  state: "ready" | "empty" | "unavailable";
  googleResults: Array<{
    source: "google";
    placeId: string;
    name: string;
    neighborhood: string | null;
    latitude: number;
    longitude: number;
    googleMapsUrl: string;
    attribution: { label: string; sourceUrl: string };
  }>;
  localProposals: Array<{
    source: "taco-hunt";
    id: string;
    name: string | null;
    neighborhood: string | null;
    latitude: number;
    longitude: number;
    status: "pending" | "approved";
  }>;
  attribution: { label: string; sourceUrl: string };
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
  return "No pudimos actualizar los resultados de Google.";
}

/** Loads the current visible viewport; no Google payload is cached or persisted on mobile. */
export async function getFixtureMapDiscovery(
  viewport: DiscoveryViewport,
): Promise<MapDiscoverySnapshot> {
  const params = new URLSearchParams({
    north: String(viewport.north),
    south: String(viewport.south),
    east: String(viewport.east),
    west: String(viewport.west),
  });
  const { data: sessionData } = await supabase.auth.getSession();
  const response = await fetch(`${API}/places/viewport?${params}`, {
    headers: sessionData.session
      ? { Authorization: `Bearer ${sessionData.session.access_token}` }
      : undefined,
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

  const data = (await response.json()) as PlacesViewportResponse;
  return {
    state: data.state,
    googleResults: data.googleResults.map((result) => ({
      id: result.placeId,
      name: result.name,
      neighborhood: result.neighborhood ?? "Zona no confirmada",
      latitude: result.latitude,
      longitude: result.longitude,
      sourceUrl: result.googleMapsUrl,
      attributionLabel: "Resultados de Google",
    })),
    localProposals: data.localProposals
      .filter((proposal) => proposal.status === "pending")
      .map((proposal) => ({
        id: proposal.id,
        name: proposal.name ?? "Puesto propuesto",
        neighborhood: proposal.neighborhood ?? "Zona no confirmada",
        latitude: proposal.latitude,
        longitude: proposal.longitude,
        status: "pending",
        ownershipLabel: "Propuesta de Taco Hunt",
      })),
    attribution: {
      label: "Google Maps",
      sourceUrl: data.attribution.sourceUrl,
    },
    message: data.message,
  };
}
