import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Logger,
  ServiceUnavailableException,
  UseGuards,
} from "@nestjs/common";
import type { Pool } from "pg";
import type { BadgeId, ProgressResponse } from "@taco-hunt/contracts";
import { AuthRequiredGuard } from "../auth/auth-required.guard.js";
import { CurrentProfile } from "../auth/current-profile.decorator.js";
import type { AuthenticatedProfile } from "../auth/auth.types.js";
import { DATABASE_POOL } from "../database/database.module.js";
import { MediaStorageService } from "../media/storage.service.js";
import { SupabaseAdminService } from "./supabase-admin.service.js";

type ProgressCounts = {
  reviewCount: number;
  coloniaCount: number;
  pioneerEarned: boolean;
  publishedCount: number;
  photoCount: number;
};

// Order matches design §4's badge grid; "recien-llegado" is earned the
// moment an account exists, so it's never a candidate for nextChallenge.
const BADGE_LABELS: Record<Exclude<BadgeId, "recien-llegado">, string> = {
  "primera-mordida": "Califica tu primer taco",
  pionero: "Sé el primero en calificar un puesto",
  explorador: "Reseña puestos en 3 colonias distintas",
  cazador: "Logra que se publique una taquería que propongas",
  fotografo: "Sube 3 fotos aprobadas",
};

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

  /**
   * Challenge/badge progress computed from the user's own reviews, spot
   * proposals, and review photos — never other users' counts, per the
   * owner's "incentives use only real data" rule (design §4).
   *
   * "fotografo" (3 approved photos) still counts review photos with photo_key
   * set, not app_private.spot_photos' real approved/pending/rejected status:
   * T37 added that table (pre-moderated stand photos) but switching this
   * badge's count to it is a separate change, left as future work rather than
   * done as a side effect of T37. Review photos are post-moderated (hidden
   * after the fact, not pre-approved), so this still slightly over-counts.
   * Documented here rather than hardcoding 0.
   */
  @Get("/me/progress")
  async getProgress(@CurrentProfile() profile: AuthenticatedProfile): Promise<ProgressResponse> {
    try {
      const counts = await this.loadProgressCounts(profile.id);
      const badges: ProgressResponse["badges"] = [
        { id: "recien-llegado", earned: true, current: 1, target: 1 },
        {
          id: "primera-mordida",
          earned: counts.reviewCount >= 1,
          current: Math.min(counts.reviewCount, 1),
          target: 1,
        },
        {
          id: "pionero",
          earned: counts.pioneerEarned,
          current: counts.pioneerEarned ? 1 : 0,
          target: 1,
        },
        {
          id: "explorador",
          earned: counts.coloniaCount >= 3,
          current: Math.min(counts.coloniaCount, 3),
          target: 3,
        },
        {
          id: "cazador",
          earned: counts.publishedCount >= 1,
          current: Math.min(counts.publishedCount, 1),
          target: 1,
        },
        {
          id: "fotografo",
          earned: counts.photoCount >= 3,
          current: Math.min(counts.photoCount, 3),
          target: 3,
        },
      ];
      const next = badges.find((badge) => !badge.earned && badge.id !== "recien-llegado");
      const nextChallenge = next
        ? {
            badgeId: next.id,
            label: BADGE_LABELS[next.id as Exclude<BadgeId, "recien-llegado">],
            current: next.current,
            target: next.target,
          }
        : null;
      return { badges, nextChallenge };
    } catch (error) {
      this.logger.error(
        "Progress computation failed",
        error instanceof Error ? error.stack : undefined,
      );
      throw new ServiceUnavailableException("Servicio temporalmente no disponible");
    }
  }

  private async loadProgressCounts(userId: string): Promise<ProgressCounts> {
    const { rows } = await this.pool.query<{
      reviewCount: number;
      coloniaCount: number;
      pioneerEarned: boolean;
      publishedCount: number;
      photoCount: number;
    }>(
      `with my_reviews as (
         select r.id,r.created_at,s.id as spot_id,s.neighborhood
         from app_private.reviews r
         join app_private.spot_tacos st on st.id=r.spot_taco_id
         join app_private.spots s on s.id=st.spot_id
         where r.user_id=$1 and r.status='visible'
       )
       select
         (select count(*)::int from my_reviews) as "reviewCount",
         (select count(distinct neighborhood)::int from my_reviews) as "coloniaCount",
         exists(
           select 1 from my_reviews mr
           where mr.created_at = (
             select min(r2.created_at) from app_private.reviews r2
             join app_private.spot_tacos st2 on st2.id=r2.spot_taco_id
             where st2.spot_id=mr.spot_id and r2.status='visible'
           )
         ) as "pioneerEarned",
         (select count(*)::int from app_private.spots where created_by=$1 and status='approved') as "publishedCount",
         (select count(*)::int from app_private.reviews where user_id=$1 and status='visible' and photo_key is not null) as "photoCount"`,
      [userId],
    );
    return (
      rows[0] ?? {
        reviewCount: 0,
        coloniaCount: 0,
        pioneerEarned: false,
        publishedCount: 0,
        photoCount: 0,
      }
    );
  }

  private async ownedPhotoKeys(userId: string): Promise<string[]> {
    try {
      const [reviewPhotos, spotPhotos] = await Promise.all([
        this.pool.query<{ photo_key: string }>(
          "select photo_key from app_private.reviews where user_id=$1 and photo_key is not null",
          [userId],
        ),
        this.pool.query<{ object_key: string }>(
          "select object_key from app_private.spot_photos where uploader_id=$1",
          [userId],
        ),
      ]);
      return [
        ...reviewPhotos.rows.map((row) => row.photo_key),
        ...spotPhotos.rows.map((row) => row.object_key),
      ];
    } catch (error) {
      this.logger.error(
        "Could not list owned photos before account deletion",
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
