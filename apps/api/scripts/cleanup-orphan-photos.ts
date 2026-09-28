import pg from "pg";
import { createClient } from "@supabase/supabase-js";

const { Pool } = pg;
const pool = new Pool({ connectionString: required("DATABASE_URL"), max: 1 });
const storage = createClient(required("SUPABASE_URL"), storageKey(), {
  auth: { autoRefreshToken: false, persistSession: false },
}).storage.from(process.env.REVIEW_PHOTOS_BUCKET?.trim() || "review-photos");
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
  const orphanKeys = await listObjects().then((objects) =>
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

  for (let offset = 0; offset < removeKeys.length; offset += 100) {
    const chunk = removeKeys.slice(offset, offset + 100);
    const { error } = await storage.remove(chunk);
    if (error) throw new Error(`Storage deletion failed: ${error.message}`);
  }
}

async function listObjects(): Promise<Array<{ key: string; createdAt: string | null }>> {
  const objects: Array<{ key: string; createdAt: string | null }> = [];
  const directories = [""];
  while (directories.length > 0) {
    const prefix = directories.pop()!;
    for (let offset = 0; ; offset += 100) {
      const page = await listStoragePage(prefix, offset);
      for (const item of page) {
        const key = prefix ? `${prefix}/${item.name}` : item.name;
        if (item.id === null) directories.push(key);
        else objects.push({ key, createdAt: item.created_at });
      }
      if (page.length < 100) break;
    }
  }
  return objects;
}

async function listStoragePage(
  prefix: string,
  offset: number,
): Promise<Array<{ name: string; id: string | null; created_at: string | null }>> {
  const { data, error } = await storage.list(prefix, {
    limit: 100,
    offset,
    sortBy: { column: "created_at", order: "asc" },
  });
  if (error) throw new Error(`Storage listing failed: ${error.message}`);
  const result = (data ?? []).map((item) => ({
    name: item.name,
    id: item.id ?? null,
    created_at: item.created_at ?? null,
  }));
  return result;
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function storageKey(): string {
  return process.env.SUPABASE_SECRET_KEY?.trim() || required("SUPABASE_SERVICE_ROLE_KEY");
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Photo cleanup failed");
    process.exitCode = 1;
  })
  .finally(() => pool.end());
