import {
  BadRequestException,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Logger,
  Post,
  Req,
  ServiceUnavailableException,
  UseGuards,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { FastifyRequest } from "fastify";
import type { Pool } from "pg";
import { AuthRequiredGuard } from "../auth/auth-required.guard.js";
import { CurrentProfile } from "../auth/current-profile.decorator.js";
import type { AuthenticatedProfile } from "../auth/auth.types.js";
import { DATABASE_POOL } from "../database/database.module.js";
import { ReviewPhotoProcessor } from "./review-photo.processor.js";
import { MediaStorageService } from "./storage.service.js";

type MultipartRequest = FastifyRequest & {
  file: (options?: { limits?: { fileSize?: number } }) => Promise<
    | {
        file: NodeJS.ReadableStream;
        mimetype: string;
        filename: string;
        toBuffer: () => Promise<Buffer>;
      }
    | undefined
  >;
};

@Controller()
@UseGuards(AuthRequiredGuard)
export class ReviewPhotosController {
  private readonly logger = new Logger(ReviewPhotosController.name);

  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly storage: MediaStorageService,
    private readonly processor: ReviewPhotoProcessor,
  ) {}

  @Post("review-photos")
  @HttpCode(HttpStatus.CREATED)
  async uploadPhoto(
    @CurrentProfile() profile: AuthenticatedProfile,
    @Req() request: MultipartRequest,
  ) {
    if (!this.storage.enabled)
      throw new ServiceUnavailableException("El almacenamiento de fotos no está configurado");
    let file: Awaited<ReturnType<MultipartRequest["file"]>>;
    try {
      file = await request.file({ limits: { fileSize: 2 * 1024 * 1024 } });
    } catch {
      throw new BadRequestException("La foto debe pesar como máximo 2 MB");
    }
    if (!file) throw new BadRequestException("Falta el archivo de foto");

    let input: Buffer;
    try {
      input = await file.toBuffer();
    } catch {
      throw new BadRequestException("La foto debe pesar como máximo 2 MB");
    }
    const processed = await this.processor.process(input);
    const uploadId = randomUUID();
    const objectKey = this.storage.newObjectKey(profile.id);

    try {
      await this.storage.upload(objectKey, processed);
      await this.pool.query(
        "insert into app_private.media_uploads (id,owner_id,object_key,state) values ($1,$2,$3,'pending')",
        [uploadId, profile.id, objectKey],
      );
      return { id: uploadId, contentType: "image/webp", sizeBytes: processed.length };
    } catch (error) {
      try {
        await this.storage.remove([objectKey]);
      } catch (cleanupError) {
        this.logger.error("Failed to remove unregistered uploaded photo", cleanupError);
      }
      if (error instanceof BadRequestException || error instanceof ServiceUnavailableException) {
        throw error;
      }
      this.logger.error("Review photo upload persistence failed", error);
      throw new ServiceUnavailableException("No se pudo guardar la foto");
    }
  }
}
