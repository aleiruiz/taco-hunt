/**
 * Challenge/badge progress for the profile and retos screens.
 *
 * T75 swaps T48's fixture for the real GET /v1/me/progress (T49), which counts
 * only the signed-in user's own reviews, proposals and photos. Labels and icons
 * stay client-side; the API only returns badge IDs and counts.
 */
import type { Session } from "@supabase/supabase-js";

const API = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3001/v1";

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

type BadgeId =
  "recien-llegado" | "primera-mordida" | "pionero" | "explorador" | "cazador" | "fotografo";

/** Mirrors `ProgressResponse` in packages/contracts (T49). */
type ProgressResponse = {
  badges: { id: BadgeId; earned: boolean; current: number; target: number }[];
  nextChallenge: { badgeId: BadgeId; label: string; current: number; target: number } | null;
};

const BADGES: { id: BadgeId; label: string; icon: string; target: number }[] = [
  { id: "recien-llegado", label: "Recién llegado", icon: "sparkles", target: 1 },
  { id: "primera-mordida", label: "Primera mordida", icon: "star", target: 1 },
  { id: "pionero", label: "Pionero", icon: "flag", target: 1 },
  { id: "explorador", label: "Explorador", icon: "compass", target: 3 },
  { id: "cazador", label: "Cazador", icon: "add-circle", target: 1 },
  { id: "fotografo", label: "Fotógrafo", icon: "camera", target: 3 },
];

function toProgress(response: ProgressResponse): Progress {
  const byId = new Map(response.badges.map((badge) => [badge.id, badge]));
  return {
    badges: BADGES.map((meta) => {
      const badge = byId.get(meta.id);
      const earned = badge?.earned ?? false;
      return {
        id: meta.id,
        label: meta.label,
        icon: meta.icon,
        earned,
        progress: earned ? undefined : `${badge?.current ?? 0} de ${badge?.target ?? meta.target}`,
      };
    }),
    nextChallenge: response.nextChallenge
      ? {
          label: response.nextChallenge.label,
          progress: response.nextChallenge.current / response.nextChallenge.target,
        }
      : undefined,
  };
}

/** Starting point shown to guests and while the real progress loads: only "Recién llegado". */
export const INITIAL_PROGRESS: Progress = toProgress({
  badges: [{ id: "recien-llegado", earned: true, current: 1, target: 1 }],
  nextChallenge: {
    badgeId: "primera-mordida",
    label: "Primera mordida: califica tu primer taco",
    current: 0,
    target: 1,
  },
});

export async function getProgress(session: Session): Promise<Progress> {
  let response: Response;
  try {
    response = await fetch(`${API}/me/progress`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${session.access_token}` },
    });
  } catch {
    throw new Error("No pudimos conectar con Taco Hunt. Revisa tu conexión e inténtalo de nuevo.");
  }
  if (!response.ok) throw new Error("No pudimos cargar tu progreso.");
  return toProgress((await response.json()) as ProgressResponse);
}
