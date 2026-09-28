import { ForbiddenException, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import type { Pool } from "pg";
import { DATABASE_POOL } from "../database/database.module.js";
import type { AuthenticatedProfile } from "./auth.types.js";

@Injectable()
export class ProfileService {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  /**
   * @throws {UnauthorizedException} If the token verifies but its subject's Supabase Auth user
   * no longer exists — a previously issued access token is still cryptographically valid for a
   * while after account deletion, and profiles.id references auth.users(id), so the insert below
   * would otherwise fail with an unhandled foreign-key violation instead of a clean rejection.
   */
  async findOrCreate(userId: string): Promise<AuthenticatedProfile> {
    try {
      await this.pool.query(
        "insert into app_private.profiles (id) values ($1) on conflict (id) do nothing",
        [userId],
      );
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        throw new UnauthorizedException("Esta cuenta ya no existe");
      }
      throw error;
    }
    const result = await this.pool.query<AuthenticatedProfile>(
      'select id, display_name as "displayName", role, status from app_private.profiles where id = $1',
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
