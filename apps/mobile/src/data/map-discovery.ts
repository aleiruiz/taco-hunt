/**
 * Viewport discovery fixtures for the Phase A map foundation.
 *
 * These are intentionally smaller than a Google Places response. The mobile
 * UI only needs a display label, a coordinate, and an attribution/source link
 * for a transient candidate. Ratings, reviews, photos, and raw provider
 * payloads do not belong in this adapter or in durable app state.
 */

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

const FIXTURE_GOOGLE_RESULTS: GoogleDiscoveryResult[] = [
  {
    id: "google-fixture-1",
    name: "Taco Fixture Centro",
    neighborhood: "Centro",
    latitude: 25.6718,
    longitude: -100.3099,
    sourceUrl: "https://www.google.com/maps/search/?api=1&query=Taco%20Fixture%20Centro%2C%20Monterrey",
    attributionLabel: "Resultados de Google",
  },
  {
    id: "google-fixture-2",
    name: "Puesto de Prueba Obispado",
    neighborhood: "Obispado",
    latitude: 25.6785,
    longitude: -100.3451,
    sourceUrl:
      "https://www.google.com/maps/search/?api=1&query=Puesto%20de%20Prueba%20Obispado%2C%20Monterrey",
    attributionLabel: "Resultados de Google",
  },
];

const FIXTURE_LOCAL_PROPOSALS: TacoHuntProposalPin[] = [
  {
    id: "proposal-fixture-1",
    name: "Propuesta Taco Hunt Norte",
    neighborhood: "Mitras Centro",
    latitude: 25.6865,
    longitude: -100.3372,
    status: "pending",
    ownershipLabel: "Propuesta de Taco Hunt",
  },
];

function isInsideViewport(item: { latitude: number; longitude: number }, viewport: DiscoveryViewport) {
  return (
    item.latitude <= viewport.north &&
    item.latitude >= viewport.south &&
    item.longitude <= viewport.east &&
    item.longitude >= viewport.west
  );
}

function configuredFixtureState(): Exclude<MapDiscoveryState, "loading" | "ready"> | null {
  const value = process.env.EXPO_PUBLIC_MAP_DISCOVERY_STATE?.trim().toLowerCase();
  if (value === "empty" || value === "unavailable" || value === "offline" || value === "error") {
    return value;
  }
  return null;
}

/**
 * Simulates the future viewport discovery call. Set
 * EXPO_PUBLIC_MAP_DISCOVERY_STATE to empty, unavailable, offline, or error
 * during manual QA to exercise those UI states without a provider call.
 */
export function getFixtureMapDiscovery(viewport: DiscoveryViewport): Promise<MapDiscoverySnapshot> {
  return new Promise((resolve) => {
    setTimeout(() => {
      const forcedState = configuredFixtureState();
      if (forcedState === "empty") {
        resolve({
          state: "empty",
          googleResults: [],
          localProposals: [],
          attribution: MAP_DISCOVERY_ATTRIBUTION,
          message: "No hay resultados de Google en esta vista.",
        });
        return;
      }
      if (forcedState === "unavailable") {
        resolve({
          state: "unavailable",
          googleResults: [],
          localProposals: FIXTURE_LOCAL_PROPOSALS.filter((item) => isInsideViewport(item, viewport)),
          attribution: MAP_DISCOVERY_ATTRIBUTION,
          message: "La búsqueda de Google no está disponible por ahora.",
        });
        return;
      }
      if (forcedState === "offline") {
        resolve({
          state: "offline",
          googleResults: [],
          localProposals: FIXTURE_LOCAL_PROPOSALS.filter((item) => isInsideViewport(item, viewport)),
          attribution: MAP_DISCOVERY_ATTRIBUTION,
          message: "Sin conexión. Las propuestas de Taco Hunt siguen visibles.",
        });
        return;
      }
      if (forcedState === "error") {
        resolve({
          state: "error",
          googleResults: [],
          localProposals: FIXTURE_LOCAL_PROPOSALS.filter((item) => isInsideViewport(item, viewport)),
          attribution: MAP_DISCOVERY_ATTRIBUTION,
          message: "No pudimos actualizar los resultados de Google.",
        });
        return;
      }

      const googleResults = FIXTURE_GOOGLE_RESULTS.filter((item) => isInsideViewport(item, viewport));
      const localProposals = FIXTURE_LOCAL_PROPOSALS.filter((item) => isInsideViewport(item, viewport));
      resolve({
        state: googleResults.length > 0 ? "ready" : "empty",
        googleResults,
        localProposals,
        attribution: MAP_DISCOVERY_ATTRIBUTION,
        message: googleResults.length > 0 ? undefined : "No hay resultados de Google en esta vista.",
      });
    }, 250);
  });
}
