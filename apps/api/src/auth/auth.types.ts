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
}
