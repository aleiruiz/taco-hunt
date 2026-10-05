import { Inject, Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { MediaStorageDriver } from "./storage-drivers.js";

export const MEDIA_STORAGE_DRIVER = "MEDIA_STORAGE_DRIVER";
export const REVIEW_PHOTO_TTL_SECONDS = 300;

/**
 * Private storage for user-uploaded photos. The backing store (S3 or Supabase
 * Storage) is chosen by MEDIA_STORAGE_DRIVER; see createMediaStorageDriver.
 */
@Injectable()
export class MediaStorageService {
  private readonly logger = new Logger(MediaStorageService.name);

  constructor(@Inject(MEDIA_STORAGE_DRIVER) private readonly driver: MediaStorageDriver | null) {}

  newObjectKey(ownerId: string): string {
    return `${ownerId}/${randomUUID()}.webp`;
  }

  get enabled(): boolean {
    return this.driver !== null;
  }

  private ensureEnabled(): MediaStorageDriver {
    if (!this.driver)
      throw new ServiceUnavailableException("El almacenamiento de fotos no está configurado");
    return this.driver;
  }

  async upload(objectKey: string, bytes: Buffer): Promise<void> {
    const driver = this.ensureEnabled();
    try {
      await driver.upload(objectKey, bytes, "image/webp");
    } catch (error) {
      this.logger.error(`Photo upload failed: ${errorMessage(error)}`);
      throw new ServiceUnavailableException("No se pudo guardar la foto");
    }
  }

  async download(objectKey: string): Promise<Buffer> {
    const driver = this.ensureEnabled();
    try {
      return await driver.download(objectKey);
    } catch (error) {
      this.logger.error(`Photo download failed: ${errorMessage(error)}`);
      throw new ServiceUnavailableException("No se pudo leer la foto");
    }
  }

  async remove(objectKeys: string[]): Promise<void> {
    if (objectKeys.length === 0) return;
    await this.ensureEnabled().remove(objectKeys);
  }

  async createSignedUrl(objectKey: string): Promise<string | null> {
    const driver = this.ensureEnabled();
    try {
      return await driver.createSignedUrl(objectKey, REVIEW_PHOTO_TTL_SECONDS);
    } catch (error) {
      this.logger.warn(`Signed URL creation failed: ${errorMessage(error)}`);
      return null;
    }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
