import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createClient } from "@supabase/supabase-js";

/** A stored media object, as listed by the orphan-cleanup script. */
export type StoredObject = { key: string; createdAt: string | null };

/**
 * Private object storage for user-uploaded media (review, avatar and stand photos).
 * Objects are never public: reads go through short-lived signed URLs.
 */
export interface MediaStorageDriver {
  readonly name: "s3" | "supabase";
  upload(objectKey: string, bytes: Buffer, contentType: string): Promise<void>;
  download(objectKey: string): Promise<Buffer>;
  remove(objectKeys: string[]): Promise<void>;
  createSignedUrl(objectKey: string, ttlSeconds: number): Promise<string | null>;
  listObjects(): Promise<StoredObject[]>;
}

export type S3DriverConfig = {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Set only for S3-compatible services (e.g. local Supabase Storage or R2). */
  endpoint?: string;
  forcePathStyle?: boolean;
};

export class S3MediaStorageDriver implements MediaStorageDriver {
  readonly name = "s3" as const;
  private readonly client: S3Client;

  constructor(private readonly config: S3DriverConfig) {
    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: config.forcePathStyle,
      // Explicit, dedicated credentials only: never fall back to the machine's default
      // AWS profile, which may belong to a far more privileged identity.
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    });
  }

  async upload(objectKey: string, bytes: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: objectKey,
        Body: bytes,
        ContentType: contentType,
        CacheControl: "private, max-age=300",
        // AWS encrypts with SSE-S3 by default; request it explicitly there. Compatible
        // services may reject the header, so it is omitted when a custom endpoint is set.
        ...(this.config.endpoint ? {} : { ServerSideEncryption: "AES256" as const }),
      }),
    );
  }

  async download(objectKey: string): Promise<Buffer> {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.config.bucket, Key: objectKey }),
    );
    if (!response.Body) throw new Error("Empty object body");
    return Buffer.from(await response.Body.transformToByteArray());
  }

  async remove(objectKeys: string[]): Promise<void> {
    for (let offset = 0; offset < objectKeys.length; offset += 1000) {
      const chunk = objectKeys.slice(offset, offset + 1000);
      const response = await this.client.send(
        new DeleteObjectsCommand({
          Bucket: this.config.bucket,
          Delete: { Objects: chunk.map((Key) => ({ Key })), Quiet: true },
        }),
      );
      if (response.Errors?.length) {
        throw new Error(`Storage object cleanup failed for ${response.Errors.length} objects`);
      }
    }
  }

  async createSignedUrl(objectKey: string, ttlSeconds: number): Promise<string | null> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.config.bucket, Key: objectKey }),
      { expiresIn: ttlSeconds },
    );
  }

  async listObjects(): Promise<StoredObject[]> {
    const objects: StoredObject[] = [];
    let continuationToken: string | undefined;
    do {
      const page = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.config.bucket,
          ContinuationToken: continuationToken,
        }),
      );
      for (const item of page.Contents ?? []) {
        if (item.Key) {
          objects.push({ key: item.Key, createdAt: item.LastModified?.toISOString() ?? null });
        }
      }
      continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (continuationToken);
    return objects;
  }
}

export type SupabaseDriverConfig = { url: string; key: string; bucket: string };

export class SupabaseMediaStorageDriver implements MediaStorageDriver {
  readonly name = "supabase" as const;
  private readonly storage;

  constructor(config: SupabaseDriverConfig) {
    this.storage = createClient(config.url, config.key, {
      auth: { autoRefreshToken: false, persistSession: false },
    }).storage.from(config.bucket);
  }

  async upload(objectKey: string, bytes: Buffer, contentType: string): Promise<void> {
    const { error } = await this.storage.upload(objectKey, bytes, {
      contentType,
      cacheControl: "300",
      upsert: false,
    });
    if (error) throw new Error(`Storage upload failed: ${error.message}`);
  }

  async download(objectKey: string): Promise<Buffer> {
    const { data, error } = await this.storage.download(objectKey);
    if (error || !data) throw new Error("Storage download failed");
    return Buffer.from(await data.arrayBuffer());
  }

  async remove(objectKeys: string[]): Promise<void> {
    for (let offset = 0; offset < objectKeys.length; offset += 100) {
      const { error } = await this.storage.remove(objectKeys.slice(offset, offset + 100));
      if (error) throw new Error(`Storage object cleanup failed: ${error.message}`);
    }
  }

  async createSignedUrl(objectKey: string, ttlSeconds: number): Promise<string | null> {
    const { data, error } = await this.storage.createSignedUrl(objectKey, ttlSeconds);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  }

  async listObjects(): Promise<StoredObject[]> {
    const objects: StoredObject[] = [];
    const directories = [""];
    while (directories.length > 0) {
      const prefix = directories.pop()!;
      for (let offset = 0; ; offset += 100) {
        const { data, error } = await this.storage.list(prefix, {
          limit: 100,
          offset,
          sortBy: { column: "created_at", order: "asc" },
        });
        if (error) throw new Error(`Storage object listing failed: ${error.message}`);
        const page = data ?? [];
        for (const item of page) {
          const key = prefix ? `${prefix}/${item.name}` : item.name;
          // Supabase lists "folders" as entries without an id.
          if (!item.id) directories.push(key);
          else objects.push({ key, createdAt: item.created_at ?? null });
        }
        if (page.length < 100) break;
      }
    }
    return objects;
  }
}

function env(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}

function required(name: string): string {
  const value = env(name);
  if (!value) throw new Error(`${name} must be configured for the S3 media storage driver`);
  return value;
}

/**
 * Builds the configured driver, or null when media storage is not configured.
 *
 * MEDIA_STORAGE_DRIVER=s3 needs S3_MEDIA_BUCKET, S3_MEDIA_REGION, S3_MEDIA_ACCESS_KEY_ID and
 * S3_MEDIA_SECRET_ACCESS_KEY (plus S3_MEDIA_ENDPOINT / S3_MEDIA_FORCE_PATH_STYLE for
 * S3-compatible services). MEDIA_STORAGE_DRIVER=supabase (the default when unset) uses
 * SUPABASE_URL, SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) and REVIEW_PHOTOS_BUCKET.
 */
export function createMediaStorageDriver(): MediaStorageDriver | null {
  const driver = env("MEDIA_STORAGE_DRIVER") ?? "supabase";
  if (driver === "s3") {
    return new S3MediaStorageDriver({
      bucket: required("S3_MEDIA_BUCKET"),
      region: required("S3_MEDIA_REGION"),
      accessKeyId: required("S3_MEDIA_ACCESS_KEY_ID"),
      secretAccessKey: required("S3_MEDIA_SECRET_ACCESS_KEY"),
      endpoint: env("S3_MEDIA_ENDPOINT"),
      forcePathStyle: env("S3_MEDIA_FORCE_PATH_STYLE") === "true",
    });
  }
  if (driver !== "supabase") {
    throw new Error('MEDIA_STORAGE_DRIVER must be "s3" or "supabase"');
  }
  const key = env("SUPABASE_SECRET_KEY") ?? env("SUPABASE_SERVICE_ROLE_KEY");
  if (!key) return null;
  const url = env("SUPABASE_URL");
  if (!url) throw new Error("SUPABASE_URL must be configured before the API handles media");
  return new SupabaseMediaStorageDriver({
    url,
    key,
    bucket: env("REVIEW_PHOTOS_BUCKET") ?? "review-photos",
  });
}
