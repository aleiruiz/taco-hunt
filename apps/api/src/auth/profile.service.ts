import { ForbiddenException, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import type { Pool } from "pg";
import { DATABASE_POOL } from "../database/database.module.js";
import { derivePresetForUser } from "./avatar.js";
import type { AuthenticatedProfile } from "./auth.types.js";

@Injectable()
export class ProfileService {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  /**
   * @throws {UnauthorizedException} If the token verifies but its subject's Supabase Auth user
   * no longer exists — a previously issued access token is still cryptographically valid for a
   * while after account deletion, and profiles.id references auth.users(id), so the insert below
   * would otherwise fail with an unhandled foreign-key violation instead of a clean rejection.
   *
   * Idempotent first-login provisioning (build-spec.md §7): the insert only takes effect the
   * first time this subject is seen (`on conflict do nothing`), so a returning user's own edits
   * to display_name/avatar_preset are never overwritten by a later sign-in. `signupDisplayName`,
   * when given, comes from the Supabase Auth user_metadata captured at sign-up (see
   * JwtVerifierService) — this is what persists it (T40; previously dropped, see
   * plan-delegacion.md P2.7). avatar_preset is assigned deterministically from the user id so it
   * never changes across logins even though it's computed here rather than stored as a DB default.
   */
  async findOrCreate(userId: string, signupDisplayName?: string): Promise<AuthenticatedProfile> {
    const preset = derivePresetForUser(userId);
    try {
      await this.pool.query(
        "insert into app_private.profiles (id, display_name, avatar_preset) values ($1,$2,$3) on conflict (id) do nothing",
        [userId, signupDisplayName ?? null, preset],
      );
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        throw new UnauthorizedException("Esta cuenta ya no existe");
      }
      throw error;
    }
    const result = await this.pool.query<AuthenticatedProfile>(
      `select id, display_name as "displayName", role, status,
              avatar_preset as "avatarPreset", avatar_photo_key as "avatarPhotoKey",
              avatar_photo_status as "avatarPhotoStatus"
       from app_private.profiles where id = $1`,
      [userId],
    );
    const profile = result.rows[0];
    if (!profile) throw new ForbiddenException("Perfil no disponible");
    if (profile.status !== "active") throw new ForbiddenException("La cuenta está bloqueada");
    return profile;
  }
}

function isForeignKeyViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23503";
}
