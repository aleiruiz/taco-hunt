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
    nextChallenge: {
      label: "Primera mordida: califica tu primer taco",
      progress: 0,
    },
    badges: [
      { id: "recien-llegado", label: "Recién llegado", icon: "sparkles", earned: true },
      {
        id: "primera-mordida",
        label: "Primera mordida",
        icon: "star",
        earned: false,
        progress: "0 de 1",
      },
      {
        id: "pionero",
        label: "Pionero",
        icon: "flag",
        earned: false,
        progress: "0 de 1",
      },
      {
        id: "explorador",
        label: "Explorador",
        icon: "compass",
        earned: false,
        progress: "0 de 3",
      },
      {
        id: "cazador",
        label: "Cazador",
        icon: "add-circle",
        earned: false,
        progress: "0 de 1",
      },
      {
        id: "fotografo",
        label: "Fotógrafo",
        icon: "camera",
        earned: false,
        progress: "0 de 3",
      },
    ],
  };
}
