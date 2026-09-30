import type { AuthUser } from "./auth";

export type OnboardingProfile = Pick<AuthUser, "id" | "avatarPreset"> & { displayName: string };

export const avatarNames: Record<AuthUser["avatarPreset"], string> = {
  pastor: "El Trompo",
  masa: "La Tortilla",
  cilantro: "La Cebollita",
  tortilla: "El Limón",
  salsa: "El Chile",
  comal: "El Molcajete",
  aguacate: "El Aguacate",
  horchata: "La Horchata",
};

/** Phase A adapter. T40 replaces this with the persisted GET /v1/me profile.
 * Never derive a public display name from the private email address.
 */
export function getOnboardingProfile(userId: string, displayName?: unknown): OnboardingProfile {
  const presets = Object.keys(avatarNames) as AuthUser["avatarPreset"][];
  let hash = 0;
  for (const character of userId) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return {
    id: userId,
    displayName:
      typeof displayName === "string" && displayName.trim() ? displayName.trim() : "taquero",
    avatarPreset: presets[hash % presets.length],
  };
}
