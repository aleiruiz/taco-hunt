import { Global, Module } from "@nestjs/common";
import { MEDIA_STORAGE_DRIVER, MediaStorageService } from "./storage.service.js";
import { createMediaStorageDriver } from "./storage-drivers.js";
import { ReviewPhotoProcessor } from "./review-photo.processor.js";
import { ReviewPhotosController } from "./review-photos.controller.js";
import { ReviewMediaController } from "./review-media.controller.js";
import { SpotPhotosController } from "./spot-photos.controller.js";

@Global()
@Module({
  providers: [
    { provide: MEDIA_STORAGE_DRIVER, useFactory: createMediaStorageDriver },
    MediaStorageService,
    ReviewPhotoProcessor,
  ],
  controllers: [ReviewPhotosController, ReviewMediaController, SpotPhotosController],
  exports: [MediaStorageService],
})
export class MediaModule {}
