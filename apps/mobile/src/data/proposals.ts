/**
 * Proposals fixtures: spot proposal states, taco type proposals
 *
 * Implements the shapes that Phase A tasks need:
 * - T47: spot proposal 3-step flow and in-review state
 * - T44: taco type proposals on stand page
 */

export interface SpotProposal {
  id: string;
  name: string;
  neighborhood: string;
  latitude: number;
  longitude: number;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
}

export interface TacoTypeProposal {
  id: string;
  spotId: string;
  tacoType: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
}

export function getFixtureSpotProposals(): SpotProposal[] {
  return [];
}

export function getFixtureTacoProposals(): TacoTypeProposal[] {
  return [];
}
