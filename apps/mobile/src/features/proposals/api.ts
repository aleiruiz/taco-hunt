import type { Session } from "@supabase/supabase-js";
import { Platform } from "react-native";

const API =
  process.env.EXPO_PUBLIC_API_URL?.trim() ||
  (Platform.OS === "android" ? "http://10.0.2.2:3001/v1" : "http://localhost:3001/v1");

export type TacoType = { id: string; slug: string; nameEs: string };
export type ProposalStatus = "pending" | "approved" | "rejected";
export type TacoProposal = {
  id: string;
  spotId: string;
  spotName: string;
  tacoTypeId: string;
  name: string;
  status: ProposalStatus;
  createdAt: string;
};
// Matches proposals.service.ts#createTaco's returning clause: it has no spotName
// (the caller already has the spot in hand) and displayName, not name.
export type CreatedTacoProposal = {
  id: string;
  spotId: string;
  tacoTypeId: string;
  displayName: string | null;
  status: ProposalStatus;
  createdAt: string;
};

export type GoogleReviewTarget = {
  spotTacoId: string;
  spotId: string;
  spotName: string;
  tacoName: string;
};

export class TacoProposalConflictError extends Error {}

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
  return "No pudimos enviar la propuesta.";
}

export async function listTacoTypes(): Promise<TacoType[]> {
  const response = await fetch(`${API}/taco-types`);
  if (!response.ok) throw new Error("No pudimos cargar los tipos de taco.");
  const data = (await response.json()) as { items: TacoType[] };
  return data.items;
}

export async function listMyTacoProposals(session: Session): Promise<TacoProposal[]> {
  const response = await fetch(`${API}/me/proposals`, {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (!response.ok) throw new Error("No pudimos cargar tus propuestas.");
  const data = (await response.json()) as { tacoProposals: TacoProposal[] };
  return data.tacoProposals;
}

export async function createTacoProposal(
  session: Session,
  input: { spotId: string; tacoTypeId: string; displayName?: string },
): Promise<CreatedTacoProposal> {
  const response = await fetch(`${API}/taco-proposals`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      payload = undefined;
    }
    if (response.status === 409) throw new TacoProposalConflictError(messageFromResponse(payload));
    throw new Error(messageFromResponse(payload));
  }
  return (await response.json()) as CreatedTacoProposal;
}

export async function createGoogleReviewTarget(
  session: Session,
  input: { placeId: string; tacoTypeId: string },
): Promise<GoogleReviewTarget> {
  const response = await fetch(`${API}/places/review-target`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(input),
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
  return (await response.json()) as GoogleReviewTarget;
}
