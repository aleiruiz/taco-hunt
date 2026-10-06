import type { Session } from "@supabase/supabase-js";

/**
 * Proposal API adapters.
 *
 * Google-owned discovery data is display-only. The future Google submission
 * shape intentionally contains only a placeId; it must not persist Google's
 * name, address, coordinates, ratings, reviews, or photos in Taco Hunt.
 * Local proposals are Taco Hunt-owned and use a map pin as their location.
 */

export type ProposalSource = "google" | "local";
export type ProposalStatus = "pending" | "approved" | "rejected";

export type SpotProposal = {
  id: string;
  source: ProposalSource;
  name?: string;
  note?: string;
  latitude: number;
  longitude: number;
  status: ProposalStatus;
  createdAt: string;
};

export type TacoTypeProposal = {
  id: string;
  spotId: string;
  tacoType: string;
  status: ProposalStatus;
  createdAt: string;
};

export type GoogleProposalSuggestion = {
  placeId: string;
  displayName: string;
  secondaryText: string;
};

export type RegisteredPlaceMatch = {
  spotId: string;
  displayName: string;
  neighborhood: string;
};

export type ProposalSearchResult = {
  suggestions: GoogleProposalSuggestion[];
  registeredMatch?: RegisteredPlaceMatch;
  attribution: string | null;
};

export type GoogleProposalSubmission = {
  source: "google";
  placeId: string;
};

export type LocalProposalSubmission = {
  source: "local";
  latitude: number;
  longitude: number;
  name?: string;
  note?: string;
};

export type ProposalSubmission = GoogleProposalSubmission | LocalProposalSubmission;

export type ProposalSubmissionResult = {
  id: string;
  source: ProposalSource;
  status: "pending";
  createdAt: string;
};

export class ProposalDuplicateError extends Error {
  constructor(
    readonly duplicate: RegisteredPlaceMatch,
    message = "Este lugar ya está registrado en Taco Hunt",
  ) {
    super(message);
    this.name = "ProposalDuplicateError";
  }
}

const API = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3001/v1";

type ApiPlaceSuggestion =
  | {
      kind: "spot";
      id: string;
      name: string;
      neighborhood: string;
    }
  | {
      kind: "google";
      placeId: string;
      text: string;
      secondaryText: string | null;
    };

type ApiAutocompleteResponse = {
  items: ApiPlaceSuggestion[];
  attribution: string | null;
  registeredMatch?: RegisteredPlaceMatch;
};

function messageFromResponse(value: unknown, fallback: string): string {
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
  return fallback;
}

function authHeaders(session: Session) {
  return { Accept: "application/json", Authorization: `Bearer ${session.access_token}` };
}

/** T67 live adapter for the authenticated Google/local autocomplete endpoint. */
export async function searchProposalPlaces(
  session: Session,
  query: string,
): Promise<ProposalSearchResult> {
  const response = await fetch(`${API}/places/autocomplete?q=${encodeURIComponent(query.trim())}`, {
    headers: authHeaders(session),
  });
  const payload = (await response.json().catch(() => undefined)) as
    | ApiAutocompleteResponse
    | { error?: unknown }
    | undefined;
  if (!response.ok) {
    throw new Error(
      messageFromResponse(
        payload,
        "No pudimos cargar sugerencias. Intenta de nuevo o coloca un pin en el mapa.",
      ),
    );
  }

  const items = payload && Array.isArray((payload as ApiAutocompleteResponse).items)
    ? (payload as ApiAutocompleteResponse).items
    : [];
  const localMatch = items.find((item): item is Extract<ApiPlaceSuggestion, { kind: "spot" }> =>
    item.kind === "spot",
  );
  const registeredMatch =
    (payload as ApiAutocompleteResponse).registeredMatch ??
    (localMatch
      ? {
          spotId: localMatch.id,
          displayName: localMatch.name,
          neighborhood: localMatch.neighborhood,
        }
      : undefined);
  const suggestions = items
    .filter((item): item is Extract<ApiPlaceSuggestion, { kind: "google" }> => item.kind === "google")
    .map((item) => ({
      placeId: item.placeId,
      displayName: item.text,
      secondaryText: item.secondaryText ?? "Resultados de Google",
    }));

  return {
    suggestions,
    registeredMatch,
    attribution: payload ? (payload as ApiAutocompleteResponse).attribution ?? null : null,
  };
}

/** T67 live adapter for the moderation-safe place proposal endpoint. */
export async function submitProposal(
  session: Session,
  submission: ProposalSubmission,
): Promise<ProposalSubmissionResult> {
  const response = await fetch(`${API}/place-proposals`, {
    method: "POST",
    headers: { ...authHeaders(session), "Content-Type": "application/json" },
    body: JSON.stringify(submission),
  });
  const payload = (await response.json().catch(() => undefined)) as
    | (ProposalSubmissionResult & {
        error?: {
          message?: unknown;
          details?: {
            reason?: unknown;
            existingSpotId?: unknown;
            redirect?: { spotId?: unknown };
            displayName?: unknown;
            neighborhood?: unknown;
          };
        };
      })
    | undefined;
  if (!response.ok) {
    const details = payload?.error?.details;
    if (
      response.status === 409 &&
      details?.reason === "already_registered" &&
      typeof details.existingSpotId === "string" &&
      typeof details.displayName === "string" &&
      typeof details.neighborhood === "string"
    ) {
      throw new ProposalDuplicateError({
        spotId: details.existingSpotId,
        displayName: details.displayName,
        neighborhood: details.neighborhood,
      });
    }
    throw new Error(messageFromResponse(payload, "No se pudo enviar la propuesta."));
  }
  return payload as ProposalSubmissionResult;
}

export async function listMySpotProposals(session: Session): Promise<SpotProposal[]> {
  const response = await fetch(`${API}/me/proposals`, { headers: authHeaders(session) });
  const payload = (await response.json().catch(() => undefined)) as
    | { spotProposals?: SpotProposal[] }
    | { error?: unknown }
    | undefined;
  if (!response.ok) throw new Error(messageFromResponse(payload, "No pudimos cargar tus propuestas."));
  return payload && Array.isArray((payload as { spotProposals?: SpotProposal[] }).spotProposals)
    ? (payload as { spotProposals: SpotProposal[] }).spotProposals
    : [];
}

export function getFixtureTacoProposals(): TacoTypeProposal[] {
  return [];
}
