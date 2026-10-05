import pg from "pg";
import { createMediaStorageDriver } from "../src/media/storage-drivers.js";

const { Pool } = pg;
const pool = new Pool({ connectionString: required("DATABASE_URL"), max: 1 });
// Same S3 / Supabase selection as the API (MEDIA_STORAGE_DRIVER).
const storage =
  createMediaStorageDriver() ??
  (() => {
    throw new Error("Media storage is not configured");
  })();
const olderThanHours = Number(process.env.MEDIA_ORPHAN_AGE_HOURS ?? 24);
const dryRun = !process.argv.includes("--delete");

if (!Number.isFinite(olderThanHours) || olderThanHours < 1 || olderThanHours > 8760) {
  throw new Error("MEDIA_ORPHAN_AGE_HOURS must be between 1 and 8760");
}

async function main(): Promise<void> {
  const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);
  const stalePending = dryRun
    ? await pool.query<{ object_key: string }>(
        "select object_key from app_private.media_uploads where state='pending' and created_at < $1",
        [cutoff],
      )
    : await pool.query<{ object_key: string }>(
        "update app_private.media_uploads set state='deleted' where state='pending' and created_at < $1 returning object_key",
        [cutoff],
      );
  const alreadyDeleted = await pool.query<{ object_key: string }>(
    "select object_key from app_private.media_uploads where state='deleted' and created_at < $1",
    [cutoff],
  );
  const known = new Set(
    (
      await pool.query<{ object_key: string }>(
        "select object_key from app_private.media_uploads where state = 'claimed'",
      )
    ).rows.map((row) => row.object_key),
  );
  const staleKeys = [
    ...stalePending.rows.map((row) => row.object_key),
    ...alreadyDeleted.rows.map((row) => row.object_key),
  ];
  const staleSet = new Set(staleKeys);
  const orphanKeys = await storage.listObjects().then((objects) =>
    objects
      .filter((object) => object.createdAt && new Date(object.createdAt) < cutoff)
      .map((object) => object.key)
      .filter((key) => !known.has(key) && !staleSet.has(key)),
  );
  const removeKeys = [...staleKeys, ...orphanKeys];

  console.log(
    JSON.stringify(
      {
        mode: dryRun ? "dry-run" : "delete",
        olderThan: cutoff.toISOString(),
        stalePendingRecords: staleKeys.length,
        unregisteredObjects: orphanKeys.length,
        objectKeys: removeKeys,
      },
      null,
      2,
    ),
  );
  if (dryRun) return;

  await storage.remove(removeKeys);
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Photo cleanup failed");
    process.exitCode = 1;
  })
  .finally(() => pool.end());
