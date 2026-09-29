/**
 * Progress fixtures: challenge/badge progress
 *
 * Implements the shapes that Phase A tasks need:
 * - T48: retos/insignias screen with progress bars
 * - T49 (Phase B): GET /v1/me/progress endpoint
 */

export interface Badge {
  id: string;
  label: string;
  icon: string;
  earned: boolean;
  progress?: string;
}

export interface Progress {
  badges: Badge[];
  nextChallenge?: {
    label: string;
    progress: number;
  };
}

export function getFixtureProgress(): Progress {
  return {
    badges: [],
  };
}
