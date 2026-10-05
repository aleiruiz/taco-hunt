import { Platform } from "react-native";

/**
 * Spots fixtures: stand list, detail, viewport pins, search suggest
 *
 * Implements the shapes that Phase A tasks need:
 * - T46: minimized header, bottom controls, sparkle pins
 * - T34 (Phase B): map viewport pins with server clusters
 * - T35/T52 (Phase B): search suggest endpoint
 */

export interface Spot {
  id: string;
  name: string;
  neighborhood: string;
  municipality: string;
  latitude: number;
  longitude: number;
  bestTaco?: string;
  reviewCount: number;
  favoriteCount: number;
  photoCount: number;
}

export function getFixtureSpots(): Spot[] {
  return [];
}

export function getFixtureSpot(id: string): Spot | null {
  return null;
}

// --- T35/T52: search suggest ---
//
// Shape mirrors the real GET /v1/search/suggest endpoint T52 will add (see that
// task's "Data needs" in its PR). Colonia and puesto rows are searched by a
// case-insensitive substring match on `name`.

export interface ColoniaSuggestion {
  id: string;
  name: string;
  municipality: string;
  spotCount: number;
}

export interface PuestoSuggestion {
  id: string;
  name: string;
  neighborhood: string;
  bestTaco?: string;
  reviewCount: number;
}

export interface SearchSuggestResult {
  colonias: ColoniaSuggestion[];
  puestos: PuestoSuggestion[];
}

const API =
  process.env.EXPO_PUBLIC_API_URL?.trim() ||
  (Platform.OS === "android" ? "http://10.0.2.2:3001/v1" : "http://localhost:3001/v1");

export async function fetchSearchSuggest(query: string): Promise<SearchSuggestResult> {
  const response = await fetch(`${API}/search/suggest?q=${encodeURIComponent(query.trim())}`);
  if (!response.ok) throw new Error("No pudimos buscar sugerencias.");
  const result = (await response.json()) as SearchSuggestResult;
  return {
    colonias: result.colonias,
    puestos: result.puestos.map((puesto) => ({
      ...puesto,
      bestTaco: puesto.bestTaco ?? undefined,
    })),
  };
}

const FIXTURE_COLONIAS: ColoniaSuggestion[] = [
  { id: "col-1", name: "Obispado", municipality: "Monterrey", spotCount: 4 },
  { id: "col-2", name: "Centro", municipality: "Monterrey", spotCount: 7 },
  { id: "col-3", name: "Contry", municipality: "Monterrey", spotCount: 2 },
  { id: "col-4", name: "Cumbres", municipality: "Monterrey", spotCount: 0 },
  { id: "col-5", name: "Del Valle", municipality: "San Pedro Garza García", spotCount: 3 },
  { id: "col-6", name: "Mitras Centro", municipality: "Monterrey", spotCount: 1 },
  {
    id: "col-7",
    name: "Residencial San Agustín",
    municipality: "San Pedro Garza García",
    spotCount: 5,
  },
];

const FIXTURE_PUESTOS: PuestoSuggestion[] = [
  {
    id: "spot-1",
    name: "Tacos El Trompo de Don Beto",
    neighborhood: "Obispado",
    bestTaco: "Al pastor",
    reviewCount: 38,
  },
  {
    id: "spot-2",
    name: "Tacos Doña Chelo",
    neighborhood: "Centro",
    bestTaco: "Barbacoa",
    reviewCount: 21,
  },
  {
    id: "spot-3",
    name: "Taquería La Norteñita",
    neighborhood: "Contry",
    bestTaco: "Asada",
    reviewCount: 12,
  },
  {
    id: "spot-4",
    name: "Tacos de Canasta Güicho",
    neighborhood: "Centro",
    bestTaco: "Frijol con chicharrón",
    reviewCount: 9,
  },
  {
    id: "spot-5",
    name: "Taquería El Regio",
    neighborhood: "Mitras Centro",
    reviewCount: 0,
  },
];

/**
 * Simulates GET /v1/search/suggest with fixture data. Resolves after a short
 * delay to exercise the loading state; typing "error" as the whole query
 * simulates the offline/failure state for manual QA until T52 wires the real
 * endpoint and its real failure modes.
 */
export function searchSuggestFixture(query: string): Promise<SearchSuggestResult> {
  const trimmed = query.trim().toLowerCase();
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (trimmed === "error") {
        reject(new Error("simulated offline error"));
        return;
      }
      resolve({
        colonias: FIXTURE_COLONIAS.filter((c) => c.name.toLowerCase().includes(trimmed)),
        puestos: FIXTURE_PUESTOS.filter((p) => p.name.toLowerCase().includes(trimmed)),
      });
    }, 400);
  });
}
