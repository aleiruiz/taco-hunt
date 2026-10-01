/**
 * Phase A proposal adapters.
 *
 * Google-owned discovery data is display-only. The future Google submission
 * shape intentionally contains only a place_id; it must not persist Google's
 * name, address, coordinates, ratings, reviews, or photos in Taco Hunt.
 * Local proposals are Taco Hunt-owned and use a map pin as their location.
 */

export type ProposalSource = "google" | "local";
export type ProposalStatus = "pending" | "approved" | "rejected";

export type SpotProposal = {
  id: string;
  source: "local";
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
  attribution: "Resultados de Google";
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

const GOOGLE_SUGGESTIONS: GoogleProposalSuggestion[] = [
  {
    placeId: "ChIJtrompoFixture",
    displayName: "Tacos El Trompo",
    secondaryText: "Mitras Centro · Monterrey",
  },
  {
    placeId: "ChIJplazaFixture",
    displayName: "Tacos de la Plaza",
    secondaryText: "Centro · Monterrey",
  },
  {
    placeId: "ChIJnorteFixture",
    displayName: "Taquería La Norteñita",
    secondaryText: "Cumbres · Monterrey",
  },
];

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/** Future-shaped autocomplete adapter for T67. */
export async function searchProposalPlaces(query: string): Promise<ProposalSearchResult> {
  await wait(350);
  const normalized = query.trim().toLocaleLowerCase("es-MX");

  if (normalized.includes("error")) {
    throw new Error("No pudimos cargar sugerencias. Intenta de nuevo o coloca un pin en el mapa.");
  }

  const registeredMatch = normalized.includes("trompo")
    ? {
        spotId: "spot-1",
        displayName: "Tacos El Trompo de Don Beto",
        neighborhood: "Mitras Centro · Monterrey",
      }
    : undefined;

  const suggestions = GOOGLE_SUGGESTIONS.filter((item) =>
    `${item.displayName} ${item.secondaryText}`.toLocaleLowerCase("es-MX").includes(normalized),
  );

  return {
    suggestions: suggestions.length > 0 ? suggestions : GOOGLE_SUGGESTIONS.slice(0, 2),
    registeredMatch,
    attribution: "Resultados de Google",
  };
}

/** Future-shaped submission adapter for T67. */
export async function submitProposalFixture(
  submission: ProposalSubmission,
): Promise<ProposalSubmissionResult> {
  await wait(500);

  if (
    submission.source === "local" &&
    `${submission.name ?? ""} ${submission.note ?? ""}`.toLocaleLowerCase("es-MX").includes("error")
  ) {
    throw new Error("No se pudo enviar la propuesta. Lo que llenaste sigue aquí.");
  }

  return {
    id: `proposal-fixture-${Date.now()}`,
    source: submission.source,
    status: "pending",
    createdAt: new Date().toISOString(),
  };
}

/** Taco Hunt-owned local proposals only; Google display data is not persisted here. */
export function getFixtureSpotProposals(): SpotProposal[] {
  return [
    {
      id: "proposal-local-fixture",
      source: "local",
      name: "Tacos de la esquina",
      note: "Junto al parque",
      latitude: 25.6866,
      longitude: -100.3161,
      status: "pending",
      createdAt: "2026-09-30T18:00:00.000Z",
    },
  ];
}

export function getFixtureTacoProposals(): TacoTypeProposal[] {
  return [];
}
