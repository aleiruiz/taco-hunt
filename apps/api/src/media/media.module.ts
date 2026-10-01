import { Global, Module } from "@nestjs/common";
import { MediaStorageService, REVIEW_PHOTO_BUCKET } from "./storage.service.js";
import { ReviewPhotoProcessor } from "./review-photo.processor.js";
import { ReviewPhotosController } from "./review-photos.controller.js";
import { ReviewMediaController } from "./review-media.controller.js";
import { SpotPhotosController } from "./spot-photos.controller.js";

const MEDIA_STORAGE_CONFIG = "MEDIA_STORAGE_CONFIG";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} must be configured before the API handles review photos`);
  return value;
}

@Global()
@Module({
  providers: [
    {
      provide: MEDIA_STORAGE_CONFIG,
      useFactory: () => {
        const key =
          process.env.SUPABASE_SECRET_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
        if (!key) return null;
        return {
          url: required("SUPABASE_URL"),
          key,
          bucket: process.env.REVIEW_PHOTOS_BUCKET?.trim() || "review-photos",
        };
      },
    },
    {
      provide: REVIEW_PHOTO_BUCKET,
      useFactory: (config: { url: string; key: string; bucket: string } | null) => {
        if (!config) return null;
        return config;
      },
      inject: [MEDIA_STORAGE_CONFIG],
    },
    MediaStorageService,
    ReviewPhotoProcessor,
  ],
  controllers: [ReviewPhotosController, ReviewMediaController, SpotPhotosController],
  exports: [MediaStorageService],
})
export class MediaModule {}
