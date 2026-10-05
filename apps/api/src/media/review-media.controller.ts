import {
  Controller,
  Get,
  Inject,
  Logger,
  NotFoundException,
  Param,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { Pool } from "pg";
import { uuidSchema } from "@taco-hunt/contracts";
import { DATABASE_POOL } from "../database/database.module.js";
import { MediaStorageService } from "./storage.service.js";

@Controller("media")
export class ReviewMediaController {
  private readonly logger = new Logger(ReviewMediaController.name);

  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    @Inject(MediaStorageService) private readonly storage: MediaStorageService,
  ) {}

  @Get(":id")
  async getVisibleReviewPhoto(
    @Param("id") rawId: string,
  ): Promise<{ url: string; expiresIn: number }> {
    const parsed = uuidSchema.safeParse(rawId);
    if (!parsed.success) throw new NotFoundException("Foto no disponible");

    try {
      const result = await this.pool.query<{ photo_key: string }>(
        "select r.photo_key from app_private.reviews r join app_private.spot_tacos st on st.id=r.spot_taco_id join app_private.spots s on s.id=st.spot_id join app_private.taco_types tt on tt.id=st.taco_type_id where r.id=$1 and r.status='visible' and r.photo_key is not null and st.status='approved' and s.status='approved' and tt.active",
        [parsed.data],
      );
      const photoKey = result.rows[0]?.photo_key;
      if (!photoKey) throw new NotFoundException("Foto no disponible");

      const url = await this.storage.createSignedUrl(photoKey);
      if (!url)
        throw new ServiceUnavailableException("No se pudo generar acceso temporal a la foto");
      return { url, expiresIn: 300 };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ServiceUnavailableException) {
        throw error;
      }
      this.logger.error("Visible review photo lookup failed", error);
      throw new ServiceUnavailableException("Servicio temporalmente no disponible");
    }
  }
}
