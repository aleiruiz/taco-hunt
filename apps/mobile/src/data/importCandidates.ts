/**
 * Import-candidate fixtures: admin review queue for CSV-staged taquerías
 * awaiting approval into `spots` (T13's importer writes to
 * `app_private.import_candidates`; see supabase/migrations/20260927000100
 * and docs/build-spec.md §"import_candidates").
 *
 * Implements the shapes T50 needs; T42 (Phase B) replaces this with
 * GET/POST /v1/admin/import-candidates.
 */

export interface ImportCandidateMatch {
  spotId: string;
  spotName: string;
  distanceMeters: number;
}

export interface ImportCandidate {
  id: string;
  normalizedName: string;
  originalName: string;
  address: string;
  latitude: number;
  longitude: number;
  source: string;
  sourceRef: string;
  licenseRef: string;
  importBatchId: string;
  matches: ImportCandidateMatch[];
  state: "pending" | "approved" | "rejected";
  reviewNotes?: string;
  createdAt: string;
}

export function getFixtureImportCandidates(): ImportCandidate[] {
  return [
    {
      id: "cand-1",
      normalizedName: "Tacos La Güera",
      originalName: "TACOS  LA GUERA",
      address: "Av. Universidad 1250, Mitras Centro, Monterrey",
      latitude: 25.6866,
      longitude: -100.3423,
      source: "web_research",
      sourceRef: "https://example.com/guia-tacos-monterrey-2026",
      licenseRef: "facts-only, no copied text/photos",
      importBatchId: "batch-2026-09-25",
      matches: [],
      state: "pending",
      createdAt: "2026-09-25T10:00:00Z",
    },
    {
      id: "cand-2",
      normalizedName: "Tacos El Compadre",
      originalName: "Tacos El Compadre - Sucursal Centro",
      address: "Calle Morelos 480, Centro, Monterrey",
      latitude: 25.6702,
      longitude: -100.3098,
      source: "web_research",
      sourceRef: "https://example.com/blog-tacos-centro-mty",
      licenseRef: "facts-only, no copied text/photos",
      importBatchId: "batch-2026-09-25",
      matches: [{ spotId: "spot-2", spotName: "Tacos Doña Chelo", distanceMeters: 62 }],
      state: "pending",
      createdAt: "2026-09-25T10:00:00Z",
    },
    {
      id: "cand-3",
      normalizedName: "Taquería Los Primos",
      originalName: "taqueria los primos",
      address: "Av. Eugenio Garza Sada 1200, Contry, Monterrey",
      latitude: 25.6491,
      longitude: -100.2739,
      source: "web_research",
      sourceRef: "https://example.com/mejores-taquerias-contry",
      licenseRef: "facts-only, no copied text/photos",
      importBatchId: "batch-2026-09-25",
      matches: [],
      state: "pending",
      createdAt: "2026-09-25T10:00:00Z",
    },
  ];
}
