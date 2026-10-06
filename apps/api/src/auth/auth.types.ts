import type { AvatarPresetValue } from "./avatar.js";

export type ProfileRole = "user" | "admin";
export type ProfileStatus = "active" | "blocked";
export type AvatarPhotoStatus = "pending" | "approved" | "rejected";

export interface AuthenticatedProfile {
  id: string;
  displayName: string | null;
  role: ProfileRole;
  status: ProfileStatus;
  avatarPreset: AvatarPresetValue;
  avatarPhotoKey: string | null;
  avatarPhotoStatus: AvatarPhotoStatus | null;
}

export interface ApiRequest {
  headers: Record<string, string | string[] | undefined>;
  ip: string;
  method: string;
  user?: AuthenticatedProfile;
  /**
   * Why a presented bearer token was not accepted (malformed, invalid, expired, or its account
   * was deleted). Public routes ignore it and serve the request anonymously; AuthRequiredGuard
   * rethrows it so protected routes keep the precise 401.
   */
  authRejection?: Error;
}
