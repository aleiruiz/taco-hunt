// Deterministic avatar preset assignment, shared conceptually with the mobile
// fixture hash in apps/mobile/src/data/auth-onboarding.ts (same algorithm and
// preset order) so a user's assigned avatar is stable once persisted server-side.
export const AVATAR_PRESETS = [
  "pastor",
  "masa",
  "cilantro",
  "tortilla",
  "salsa",
  "comal",
  "aguacate",
  "horchata",
] as const;

export type AvatarPresetValue = (typeof AVATAR_PRESETS)[number];

export function derivePresetForUser(userId: string): AvatarPresetValue {
  let hash = 0;
  for (const character of userId) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return AVATAR_PRESETS[hash % AVATAR_PRESETS.length]!;
}
