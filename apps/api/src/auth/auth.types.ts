export type ProfileRole = "user" | "admin";
export type ProfileStatus = "active" | "blocked";

export interface AuthenticatedProfile {
  id: string;
  displayName: string | null;
  role: ProfileRole;
  status: ProfileStatus;
}

export interface ApiRequest {
  headers: Record<string, string | string[] | undefined>;
  ip: string;
  method: string;
  user?: AuthenticatedProfile;
}
