import { Inject, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

export const REVIEW_PHOTO_BUCKET = "REVIEW_PHOTO_BUCKET";
export const REVIEW_PHOTO_TTL_SECONDS = 300;

@Injectable()
export class MediaStorageService {
  private readonly client: SupabaseClient;
  private readonly bucket: string;

  constructor(
    @Inject(REVIEW_PHOTO_BUCKET)
    config: { url: string; key: string; bucket: string } | null,
  ) {
    if (!config) {
      this.client = null as unknown as SupabaseClient;
      this.bucket = "review-photos";
      return;
    }
    this.client = createClient(config.url, config.key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    this.bucket = config.bucket;
  }

  newObjectKey(ownerId: string): string {
    return `${ownerId}/${randomUUID()}.webp`;
  }

  get enabled(): boolean {
    return this.client !== (null as unknown as SupabaseClient);
  }

  private ensureEnabled(): SupabaseClient {
    if (!this.enabled)
      throw new ServiceUnavailableException("El almacenamiento de fotos no está configurado");
    return this.client;
  }

  async upload(objectKey: string, bytes: Buffer): Promise<void> {
    const { error } = await this.ensureEnabled()
      .storage.from(this.bucket)
      .upload(objectKey, bytes, {
        contentType: "image/webp",
        cacheControl: "300",
        upsert: false,
      });
    if (error) throw new ServiceUnavailableException("No se pudo guardar la foto");
  }

  async remove(objectKeys: string[]): Promise<void> {
    if (objectKeys.length === 0) return;
    const { error } = await this.ensureEnabled().storage.from(this.bucket).remove(objectKeys);
    if (error) throw new Error(`Storage object cleanup failed: ${error.message}`);
  }

  async createSignedUrl(objectKey: string): Promise<string | null> {
    const { data, error } = await this.ensureEnabled()
      .storage.from(this.bucket)
      .createSignedUrl(objectKey, REVIEW_PHOTO_TTL_SECONDS);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  }

  async list(prefix?: string): Promise<Array<{ name: string; id: string | null }>> {
    const { data, error } = await this.ensureEnabled()
      .storage.from(this.bucket)
      .list(prefix, { limit: 100, sortBy: { column: "created_at", order: "asc" } });
    if (error) throw new Error(`Storage object listing failed: ${error.message}`);
    return (data ?? []).map((item) => ({ name: item.name, id: item.id ?? null }));
  }
}
