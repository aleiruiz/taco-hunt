/**
 * Import-candidate client: admin review queue for staged taquerías awaiting
 * approval into `spots` (`app_private.import_candidates`; see
 * supabase/migrations/20260927000100 and docs/data-provenance.md).
 *
 * This is a maintenance-only queue for offline, permissioned imports. Live
 * Google discovery never writes to or publishes from import_candidates.
 */

const API = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3001/v1";

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
  reviewNotes: string | null;
  createdAt: string;
}

async function parseOrThrow(response: Response, fallback: string): Promise<unknown> {
  if (!response.ok) {
    if (response.status === 403) throw new Error("No tienes permisos de moderación.");
    throw new Error(fallback);
  }
  return response.json();
}

export async function fetchImportCandidates(
  headers: Record<string, string>,
): Promise<ImportCandidate[]> {
  const response = await fetch(`${API}/admin/import-candidates`, { headers });
  const data = (await parseOrThrow(response, "No pudimos cargar los candidatos.")) as {
    items?: ImportCandidate[];
  };
  return data.items ?? [];
}

export async function approveImportCandidate(
  headers: Record<string, string>,
  candidateId: string,
  coordinates: { latitude: number; longitude: number },
): Promise<void> {
  const response = await fetch(`${API}/admin/import-candidates/${candidateId}/approve`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(coordinates),
  });
  await parseOrThrow(response, "No pudimos aprobar el candidato.");
}

export async function rejectImportCandidate(
  headers: Record<string, string>,
  candidateId: string,
  reason: string,
): Promise<void> {
  const response = await fetch(`${API}/admin/import-candidates/${candidateId}/reject`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ reason }),
  });
  await parseOrThrow(response, "No pudimos rechazar el candidato.");
}

export async function mergeImportCandidate(
  headers: Record<string, string>,
  candidateId: string,
  canonicalSpotId: string,
  reason?: string,
): Promise<void> {
  const response = await fetch(`${API}/admin/import-candidates/${candidateId}/merge`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ canonicalSpotId, reason }),
  });
  await parseOrThrow(response, "No pudimos fusionar el candidato.");
}
