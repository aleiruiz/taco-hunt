import {
  BadRequestException,
  ConflictException,
  Controller,
  Get,
  Inject,
  Logger,
  Patch,
  ServiceUnavailableException,
  UseGuards,
  Body,
} from "@nestjs/common";
import type { Pool, PoolClient } from "pg";
import { profilePatchSchema, type Profile } from "@taco-hunt/contracts";
import { AuthRequiredGuard } from "../auth/auth-required.guard.js";
import { CurrentProfile } from "../auth/current-profile.decorator.js";
import type { AuthenticatedProfile } from "../auth/auth.types.js";
import { DATABASE_POOL } from "../database/database.module.js";
import { MediaStorageService } from "../media/storage.service.js";
import { AvatarReviewService } from "./avatar-review.service.js";

interface ProfileRow {
  displayName: string | null;
  avatarPreset: AuthenticatedProfile["avatarPreset"];
  avatarPhotoKey: string | null;
  avatarPhotoStatus: AuthenticatedProfile["avatarPhotoStatus"];
}

@Controller()
@UseGuards(AuthRequiredGuard)
export class ProfileController {
  private readonly logger = new Logger(ProfileController.name);

  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly storage: MediaStorageService,
    private readonly avatarReview: AvatarReviewService,
  ) {}

  @Get("/me")
  async getMe(@CurrentProfile() profile: AuthenticatedProfile): Promise<Profile> {
    const row = await this.loadRow(profile.id);
    return this.toResponse(profile.id, row);
  }

  /**
   * Partial profile update. `avatarPhotoUploadId` claims a pending upload from
   * the shared media_uploads table (same one-use claim pattern T11 uses for
   * review photos), swaps it in immediately as the profile's photo, then runs
   * the automated review (AvatarReviewService) before responding: on
   * rejection the photo is reverted to the preset in the same request and an
   * audit row records why. `null` clears an existing photo back to the preset.
   */
  @Patch("/me")
  async patchMe(
    @CurrentProfile() profile: AuthenticatedProfile,
    @Body() body: unknown,
  ): Promise<Profile> {
    const parsed = profilePatchSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException("Datos de perfil inválidos");
    const patch = parsed.data;

    const client = await this.connect();
    let previousPhotoKey: string | null = null;
    let claimedNewKey: string | null = null;
    try {
      await client.query("begin");
      const current = await client.query<{ avatar_photo_key: string | null }>(
        "select avatar_photo_key from app_private.profiles where id=$1 for update",
        [profile.id],
      );
      previousPhotoKey = current.rows[0]?.avatar_photo_key ?? null;

      const updates: string[] = [];
      const values: unknown[] = [];
      if (Object.hasOwn(patch, "displayName")) {
        values.push(patch.displayName ?? null);
        updates.push(`display_name=$${values.length}`);
      }
      if (Object.hasOwn(patch, "avatarPreset")) {
        values.push(patch.avatarPreset);
        updates.push(`avatar_preset=$${values.length}`);
      }
      if (Object.hasOwn(patch, "avatarPhotoUploadId")) {
        if (patch.avatarPhotoUploadId === null) {
          values.push(null);
          updates.push(`avatar_photo_key=$${values.length}`);
          values.push(null);
          updates.push(`avatar_photo_status=$${values.length}`);
        } else if (patch.avatarPhotoUploadId) {
          const upload = await this.claimUpload(client, profile.id, patch.avatarPhotoUploadId);
          claimedNewKey = upload.objectKey;
          values.push(upload.objectKey);
          updates.push(`avatar_photo_key=$${values.length}`);
          values.push("pending");
          updates.push(`avatar_photo_status=$${values.length}`);
        }
      }

      if (updates.length > 0) {
        values.push(profile.id);
        await client.query(
          `update app_private.profiles set ${updates.join(",")}, updated_at=now() where id=$${values.length}`,
          values,
        );
      }
      // Free the replaced/cleared upload's claim so media_uploads_one_per_profile_idx doesn't
      // permanently block this profile from ever claiming another avatar photo upload.
      if (
        previousPhotoKey &&
        previousPhotoKey !== claimedNewKey &&
        Object.hasOwn(patch, "avatarPhotoUploadId")
      ) {
        await client.query(
          "update app_private.media_uploads set state='deleted',claimed_profile_id=null,created_at=now() where object_key=$1",
          [previousPhotoKey],
        );
      }
      await client.query("commit");
    } catch (error) {
      await this.rollback(client);
      if (error instanceof BadRequestException || error instanceof ConflictException) throw error;
      this.logger.error("Profile update failed", error instanceof Error ? error.stack : undefined);
      throw new ServiceUnavailableException("Servicio temporalmente no disponible");
    } finally {
      client.release();
    }

    // The previous photo (replaced or cleared) is no longer referenced; best-effort cleanup.
    if (previousPhotoKey && previousPhotoKey !== claimedNewKey) {
      await this.deletePhotoObject(previousPhotoKey);
    }

    if (claimedNewKey) {
      await this.runAutomatedReview(profile.id, claimedNewKey);
    }

    const row = await this.loadRow(profile.id);
    return this.toResponse(profile.id, row);
  }

  /**
   * Runs the automated check and finalizes the photo's status. On rejection,
   * reverts to the preset (clears avatar_photo_key/status) and writes an
   * audit row so there's a record of why, per build-spec's moderation-audit
   * pattern (moderator_id is null here: this action has no human moderator).
   */
  private async runAutomatedReview(profileId: string, objectKey: string): Promise<void> {
    let result: { status: "approved" | "rejected"; reason?: string };
    try {
      const bytes = await this.storage.download(objectKey);
      result = await this.avatarReview.review(bytes);
    } catch (error) {
      this.logger.error(
        "Avatar automated review failed; leaving photo pending",
        error instanceof Error ? error.stack : undefined,
      );
      return;
    }

    if (result.status === "approved") {
      await this.pool.query(
        "update app_private.profiles set avatar_photo_status='approved' where id=$1 and avatar_photo_key=$2",
        [profileId, objectKey],
      );
      return;
    }

    await this.pool.query(
      "update app_private.profiles set avatar_photo_key=null, avatar_photo_status=null where id=$1 and avatar_photo_key=$2",
      [profileId, objectKey],
    );
    await this.pool.query(
      "update app_private.media_uploads set state='deleted',claimed_profile_id=null,created_at=now() where object_key=$1",
      [objectKey],
    );
    await this.pool.query(
      "insert into app_private.moderation_audit (moderator_id,target_type,target_id,action,internal_reason) values (null,'profile_avatar',$1,'auto_reject',$2)",
      [profileId, result.reason ?? null],
    );
    await this.deletePhotoObject(objectKey);
  }

  private async loadRow(userId: string): Promise<ProfileRow> {
    const { rows } = await this.pool.query<ProfileRow>(
      `select display_name as "displayName", avatar_preset as "avatarPreset",
              avatar_photo_key as "avatarPhotoKey", avatar_photo_status as "avatarPhotoStatus"
       from app_private.profiles where id=$1`,
      [userId],
    );
    const row = rows[0];
    if (!row) throw new ServiceUnavailableException("Servicio temporalmente no disponible");
    return row;
  }

  private async toResponse(userId: string, row: ProfileRow): Promise<Profile> {
    let avatarPhotoUrl: string | null = null;
    // Shown only to the owner here, so a pending/approved photo is fine to preview;
    // a rejected one is already cleared back to null by runAutomatedReview.
    if (row.avatarPhotoKey && this.storage.enabled) {
      avatarPhotoUrl = await this.storage.createSignedUrl(row.avatarPhotoKey);
    }
    return {
      id: userId,
      displayName: row.displayName,
      avatarPreset: row.avatarPreset,
      avatarPhotoUrl,
      avatarPhotoStatus: row.avatarPhotoStatus,
    };
  }

  private async claimUpload(
    client: PoolClient,
    ownerId: string,
    uploadId: string,
  ): Promise<{ id: string; objectKey: string }> {
    const upload = await client.query<{ id: string; object_key: string }>(
      "select id,object_key from app_private.media_uploads where id=$1 and owner_id=$2 and state='pending' for update",
      [uploadId, ownerId],
    );
    if (!upload.rowCount) {
      throw new ConflictException("La carga no existe, pertenece a otra cuenta o ya fue usada");
    }
    await client.query(
      "update app_private.media_uploads set state='claimed',claimed_profile_id=$1 where id=$2",
      [ownerId, upload.rows[0]!.id],
    );
    return { id: upload.rows[0]!.id, objectKey: upload.rows[0]!.object_key };
  }

  private async deletePhotoObject(objectKey: string): Promise<void> {
    try {
      await this.storage.remove([objectKey]);
    } catch (error) {
      this.logger.error("Avatar photo cleanup failed; use pnpm media:cleanup to retry", error);
    }
  }

  private async connect(): Promise<PoolClient> {
    try {
      return await this.pool.connect();
    } catch (error) {
      this.logger.error(
        "Profile database connection failed",
        error instanceof Error ? error.stack : undefined,
      );
      throw new ServiceUnavailableException("Servicio temporalmente no disponible");
    }
  }

  private async rollback(client: PoolClient): Promise<void> {
    try {
      await client.query("rollback");
    } catch (error) {
      this.logger.error(
        "Profile transaction rollback failed",
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
