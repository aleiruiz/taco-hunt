import { ForbiddenException, Inject, Injectable } from "@nestjs/common";
import type { Pool } from "pg";
import { DATABASE_POOL } from "../database/database.module.js";
import type { AuthenticatedProfile } from "./auth.types.js";

@Injectable()
export class ProfileService {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async findOrCreate(userId: string): Promise<AuthenticatedProfile> {
    await this.pool.query(
      "insert into app_private.profiles (id) values ($1) on conflict (id) do nothing",
      [userId],
    );
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
