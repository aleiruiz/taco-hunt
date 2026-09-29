/**
 * Auth fixtures: user session, profile, display name, avatar
 *
 * Implements the shapes that Phase A tasks need:
 * - T32: success screen with assigned avatar and first steps
 * - T40 (Phase B): GET/PATCH /v1/me for display name, avatar; persist sign-up display name
 * - T41: profile screen with stats, badges, avatar
 */

export interface AuthUser {
  id: string;
  email: string;
  displayName?: string;
  avatarPreset:
    "pastor" | "masa" | "cilantro" | "tortilla" | "salsa" | "comal" | "aguacate" | "horchata";
  avatarPhotoUrl?: string;
}

export function getFixtureUser(): AuthUser {
  return {
    id: "user-123",
    email: "user@example.com",
    displayName: "Explorer",
    avatarPreset: "pastor",
    avatarPhotoUrl: undefined,
  };
}

export function getFixtureUserAfterSignUp(displayName: string): AuthUser {
  const user = getFixtureUser();
  return { ...user, displayName };
}
