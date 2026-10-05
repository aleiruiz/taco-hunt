import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Inject,
  Logger,
  NotFoundException,
  Param,
  Post,
  Query,
  ServiceUnavailableException,
  UseGuards,
} from "@nestjs/common";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import {
  personalPageQuerySchema,
  spotPhotoCreateSchema,
  uuidSchema,
  type OwnSpotPhoto,
  type OwnSpotPhotoPage,
  type PublicSpotPhoto,
  type SpotPhoto,
} from "@taco-hunt/contracts";
import { AuthRequiredGuard } from "../auth/auth-required.guard.js";
import { CurrentProfile } from "../auth/current-profile.decorator.js";
import type { AuthenticatedProfile } from "../auth/auth.types.js";
import { DATABASE_POOL } from "../database/database.module.js";
import { MediaStorageService } from "./storage.service.js";

const spotPhotoCreateRequestSchema = spotPhotoCreateSchema.strict();

const ownSpotPhotoCursorSchema = z.object({
  createdAt: z.string().datetime({ offset: true, precision: 6 }),
  id: uuidSchema,
});

function encodeCursor(value: z.infer<typeof ownSpotPhotoCursorSchema>): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function decodeCursor(
  value: string | undefined,
): z.infer<typeof ownSpotPhotoCursorSchema> | undefined {
  if (!value) return undefined;
  try {
    return ownSpotPhotoCursorSchema.parse(
      JSON.parse(Buffer.from(value, "base64url").toString("utf8")),
    );
  } catch {
    throw new BadRequestException({ message: "Cursor inválido" });
  }
}

// No display name on file is a valid, if plain, public identity: the
// gallery still needs *some* uploader label.
const FALLBACK_UPLOADER_NAME = "Vecino de la comunidad";

@Controller()
export class SpotPhotosController {
  private readonly logger = new Logger(SpotPhotosController.name);

  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    @Inject(MediaStorageService) private readonly storage: MediaStorageService,
  ) {}

  /**
   * Public, unauthenticated gallery: only ever returns status='approved'
   * photos, each as a PublicSpotPhoto (no uploaderId/status/rejectionReason)
   * with a short-lived signed URL. Never widen this to SpotPhoto's full
   * shape — see packages/contracts/src/index.ts's note on publicSpotPhotoSchema.
   */
  @Get("/spots/:id/photos")
  async listSpotPhotos(@Param("id") rawId: string): Promise<{ items: PublicSpotPhoto[] }> {
    const id = this.parseId(rawId);
    try {
      const { rows } = await this.pool.query<{
        id: string;
        object_key: string;
        uploaderName: string;
        kind: PublicSpotPhoto["kind"];
        createdAt: Date;
      }>(
        `select sp.id,sp.object_key,coalesce(p.display_name,$2) as "uploaderName",sp.kind,sp.created_at as "createdAt"
         from app_private.spot_photos sp
         join app_private.profiles p on p.id = sp.uploader_id
         where sp.spot_id=$1 and sp.status='approved'
         order by sp.created_at desc`,
        [id, FALLBACK_UPLOADER_NAME],
      );
      const items: PublicSpotPhoto[] = [];
      for (const row of rows) {
        const url = this.storage.enabled
          ? await this.storage.createSignedUrl(row.object_key)
          : null;
        if (!url) continue;
        items.push({
          id: row.id,
          url,
          uploaderName: row.uploaderName,
          kind: row.kind,
          createdAt: row.createdAt.toISOString(),
        });
      }
      return { items };
    } catch (error) {
      this.logQueryFailure("Public spot photo gallery query failed", error);
      throw new ServiceUnavailableException("Servicio temporalmente no disponible");
    }
  }

  /**
   * The signed-in uploader's own stand photos in every moderation state, newest
   * first, for the profile's "Fotos" tab. Each item carries a short-lived signed
   * URL; photos whose URL cannot be signed are skipped, like the public gallery.
   */
  @Get("/me/spot-photos")
  @UseGuards(AuthRequiredGuard)
  async listOwnSpotPhotos(
    @CurrentProfile() profile: AuthenticatedProfile,
    @Query() query: Record<string, unknown>,
  ): Promise<OwnSpotPhotoPage> {
    const parsed = personalPageQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Parámetros inválidos",
        details: { issues: parsed.error.issues },
      });
    }
    const after = decodeCursor(parsed.data.cursor);
    const values: unknown[] = [profile.id, FALLBACK_UPLOADER_NAME];
    let pageFilter = "";
    if (after) {
      values.push(after.createdAt, after.id);
      pageFilter = "and (sp.created_at,sp.id) < ($3::timestamptz,$4::uuid)";
    }
    values.push(parsed.data.limit + 1);

    try {
      const { rows } = await this.pool.query<{
        id: string;
        object_key: string;
        uploaderName: string;
        kind: OwnSpotPhoto["kind"];
        status: OwnSpotPhoto["status"];
        rejectionReason: string | null;
        createdAt: string;
        spotId: string;
        spotName: string;
      }>(
        `select sp.id,sp.object_key,coalesce(p.display_name,$2) as "uploaderName",sp.kind,sp.status,
                sp.rejection_reason as "rejectionReason",
                to_char(sp.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as "createdAt",
                s.id as "spotId",s.name as "spotName"
         from app_private.spot_photos sp
         join app_private.profiles p on p.id = sp.uploader_id
         join app_private.spots s on s.id = sp.spot_id
         where sp.uploader_id=$1 ${pageFilter}
         order by sp.created_at desc, sp.id desc
         limit $${values.length}`,
        values,
      );
      const more = rows.length > parsed.data.limit;
      const page = rows.slice(0, parsed.data.limit);
      const items: OwnSpotPhoto[] = [];
      for (const row of page) {
        const url = this.storage.enabled
          ? await this.storage.createSignedUrl(row.object_key)
          : null;
        if (!url) continue;
        items.push({
          id: row.id,
          url,
          uploaderId: profile.id,
          uploaderName: row.uploaderName,
          kind: row.kind,
          status: row.status,
          rejectionReason: row.rejectionReason,
          createdAt: row.createdAt,
          spotId: row.spotId,
          spotName: row.spotName,
        });
      }
      const last = page.at(-1);
      return {
        items,
        nextCursor: more && last ? encodeCursor({ createdAt: last.createdAt, id: last.id }) : null,
      };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      this.logQueryFailure("Own spot photos query failed", error);
      throw new ServiceUnavailableException("Servicio temporalmente no disponible");
    }
  }

  /**
   * Claims an already-uploaded photo (POST /v1/review-photos — the processor
   * and storage pipeline are shared, not spot-photo specific) and attaches it
   * to this spot as a pending photo. Returns the uploader's own full view
   * (SpotPhoto), never the public shape.
   */
  @Post("/spots/:id/photos")
  @UseGuards(AuthRequiredGuard)
  async createSpotPhoto(
    @Param("id") rawId: string,
    @CurrentProfile() profile: AuthenticatedProfile,
    @Body() body: unknown,
  ): Promise<SpotPhoto> {
    const spotId = this.parseId(rawId);
    const parsed = spotPhotoCreateRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Datos de foto inválidos",
        details: { issues: parsed.error.issues },
      });
    }
    if (!this.storage.enabled) {
      throw new ServiceUnavailableException("El almacenamiento de fotos no está configurado");
    }

    const client = await this.connect();
    try {
      await client.query("begin");
      const spot = await client.query(
        "select id from app_private.spots where id=$1 and status='approved' for share",
        [spotId],
      );
      if (!spot.rowCount) throw new NotFoundException("Puesto no encontrado");

      const upload = await this.claimUpload(client, profile.id, parsed.data.photoUploadId);
      const inserted = await client.query<{
        id: string;
        kind: SpotPhoto["kind"];
        status: SpotPhoto["status"];
        rejection_reason: string | null;
        createdAt: Date;
      }>(
        `insert into app_private.spot_photos (spot_id,uploader_id,object_key,kind,status)
         values ($1,$2,$3,$4,'pending')
         returning id,kind,status,rejection_reason,created_at as "createdAt"`,
        [spotId, profile.id, upload.objectKey, parsed.data.kind],
      );
      const photo = inserted.rows[0];
      await client.query(
        "update app_private.media_uploads set state='claimed',claimed_spot_photo_id=$1 where id=$2 and state='pending'",
        [photo.id, upload.id],
      );
      await client.query("commit");

      const url = await this.storage.createSignedUrl(upload.objectKey);
      if (!url) {
        this.logger.error("Spot photo created but signed URL generation failed");
      }
      return {
        id: photo.id,
        url: url ?? "",
        uploaderId: profile.id,
        uploaderName: profile.displayName ?? FALLBACK_UPLOADER_NAME,
        kind: photo.kind,
        status: photo.status,
        rejectionReason: photo.rejection_reason,
        createdAt: photo.createdAt.toISOString(),
      };
    } catch (error) {
      await this.rollback(client);
      if (error instanceof NotFoundException || error instanceof ConflictException) throw error;
      this.logQueryFailure("Spot photo create query failed", error);
      throw new ServiceUnavailableException("Servicio temporalmente no disponible");
    } finally {
      client.release();
    }
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
    return { id: upload.rows[0].id, objectKey: upload.rows[0].object_key };
  }

  private parseId(value: string): string {
    const parsed = uuidSchema.safeParse(value);
    if (!parsed.success) throw new NotFoundException("Puesto no encontrado");
    return parsed.data;
  }

  private async connect(): Promise<PoolClient> {
    try {
      return await this.pool.connect();
    } catch (error) {
      this.logQueryFailure("Spot photo database connection failed", error);
      throw new ServiceUnavailableException("Servicio temporalmente no disponible");
    }
  }

  private async rollback(client: PoolClient): Promise<void> {
    try {
      await client.query("rollback");
    } catch (error) {
      this.logQueryFailure("Spot photo transaction rollback failed", error);
    }
  }

  private logQueryFailure(message: string, error: unknown): void {
    this.logger.error(message, error instanceof Error ? error.stack : undefined);
  }
}
