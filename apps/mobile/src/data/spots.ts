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
