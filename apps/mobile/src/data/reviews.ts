/**
 * Reviews fixtures: rating states, favorite states, review listing
 *
 * Implements the shapes that Phase A tasks need:
 * - T48: stand page ratings and "be the first" state
 * - T41: review tab in profile
 */

export interface Review {
  id: string;
  spotId: string;
  authorId: string;
  authorName: string;
  rating: number;
  body?: string;
  tacoType?: string;
  createdAt: string;
}

export function getFixtureReviews(): Review[] {
  return [];
}
