import {
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Inject,
  Logger,
  ServiceUnavailableException,
  UseGuards,
} from "@nestjs/common";
import type { Pool } from "pg";
import { AuthRequiredGuard } from "../auth/auth-required.guard.js";
import { CurrentProfile } from "../auth/current-profile.decorator.js";
import type { AuthenticatedProfile } from "../auth/auth.types.js";
import { DATABASE_POOL } from "../database/database.module.js";
import { MediaStorageService } from "../media/storage.service.js";
import { SupabaseAdminService } from "./supabase-admin.service.js";

@Controller()
@UseGuards(AuthRequiredGuard)
export class AccountController {
  private readonly logger = new Logger(AccountController.name);

  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly media: MediaStorageService,
    private readonly supabaseAdmin: SupabaseAdminService,
  ) {}

  /**
   * Deletes the caller's account. Reviews, favorites, the profile row and media uploads are
   * hard-deleted; spot/taco proposal authorship, moderation audit entries and report authorship
   * are anonymized rather than removed, so moderation queues and public spots stay intact — both
   * outcomes come from each table's own on-delete rule in the schema, triggered by deleting the
   * Supabase Auth user. Safe to retry: nothing is destroyed until that deletion call, and an
   * already-deleted user is treated as success.
   */
  @Delete("/me")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAccount(@CurrentProfile() profile: AuthenticatedProfile): Promise<void> {
    const photoKeys = await this.ownedPhotoKeys(profile.id);
    await this.supabaseAdmin.deleteUser(profile.id);
    if (photoKeys.length > 0) await this.deletePhotoObjects(photoKeys);
  }

  private async ownedPhotoKeys(userId: string): Promise<string[]> {
    try {
      const { rows } = await this.pool.query<{ photo_key: string }>(
        "select photo_key from app_private.reviews where user_id=$1 and photo_key is not null",
        [userId],
      );
      return rows.map((row) => row.photo_key);
    } catch (error) {
      this.logger.error(
        "Could not list owned review photos before account deletion",
        error instanceof Error ? error.stack : undefined,
      );
      throw new ServiceUnavailableException("Servicio temporalmente no disponible");
    }
  }

  private async deletePhotoObjects(objectKeys: string[]): Promise<void> {
    const STORAGE_BATCH_SIZE = 1_000;
    for (let offset = 0; offset < objectKeys.length; offset += STORAGE_BATCH_SIZE) {
      const batch = objectKeys.slice(offset, offset + STORAGE_BATCH_SIZE);
      try {
        await this.media.remove(batch);
      } catch (error) {
        this.logger.error(
          "Account deletion succeeded but review photo cleanup failed for a batch; use pnpm media:cleanup to retry",
          error instanceof Error ? error.stack : undefined,
        );
      }
    }
  }
}
