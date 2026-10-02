#!/usr/bin/env node
/* global console, process */

import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { TextDecoder } from "node:util";

const REQUIRED_COLUMNS = [
  "name",
  "latitude",
  "longitude",
  "neighborhood",
  "source_type",
  "source_ref",
  "license",
  "last_verified_at",
  "notes",
];
const ALLOWED_SOURCE_TYPES = new Set(["owner", "licensed", "user", "fictional"]);
const MONTERREY_BOUNDS = { minLat: 24.0, maxLat: 26.2, minLng: -101.5, maxLng: -99.5 };

function usage() {
  console.error(
    "Usage: node supabase/scripts/import-candidates.mjs --csv <file> [--batch-id <uuid>] [--report <file>] [--dry-run] [--maintenance-only]",
  );
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--dry-run") args.dryRun = true;
    else if (token === "--maintenance-only") args["maintenance-only"] = true;
    else if (token.startsWith("--")) {
      const key = token.slice(2);
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`Missing value for --${key}`);
      args[key] = value;
      index += 1;
    } else throw new Error(`Unknown argument: ${token}`);
  }
  if (!args.csv) throw new Error("--csv is required");
  return args;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];
    if (quoted && character === '"' && next === '"') {
      field += '"';
      index += 1;
    } else if (character === '"') quoted = !quoted;
    else if (!quoted && character === ",") {
      row.push(field);
      field = "";
    } else if (!quoted && (character === "\n" || character === "\r")) {
      if (character === "\r" && next === "\n") index += 1;
      row.push(field);
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
      field = "";
    } else field += character;
  }
  if (quoted) throw new Error("CSV contains an unterminated quoted field");
  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.some((value) => value.trim() !== "")) rows.push(row);
  }
  if (rows.length < 2) throw new Error("CSV must contain a header and at least one data row");
  const headers = rows[0].map((value, index) =>
    (index === 0 ? value.replace(/^\uFEFF/, "") : value).trim(),
  );
  if (
    headers.length !== REQUIRED_COLUMNS.length ||
    headers.some((value, index) => value !== REQUIRED_COLUMNS[index])
  ) {
    throw new Error(`CSV header must be exactly: ${REQUIRED_COLUMNS.join(",")}`);
  }
  return rows.slice(1).map((values, index) => {
    if (values.length !== headers.length)
      throw new Error(`Row ${index + 2} has ${values.length} columns; expected ${headers.length}`);
    return Object.fromEntries(headers.map((header, column) => [header, values[column].trim()]));
  });
}

function normalizeName(name) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-MX")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function uuidFromHash(value) {
  const hex = createHash("sha256").update(value).digest("hex").slice(0, 32).split("");
  hex[12] = "5";
  hex[16] = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8).join("")}-${hex.slice(8, 12).join("")}-${hex.slice(12, 16).join("")}-${hex.slice(16, 20).join("")}-${hex.slice(20).join("")}`;
}

function quoteSql(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function validate(rows) {
  const seen = new Set();
  return rows.map((row, index) => {
    const line = index + 2;
    const name = row.name.trim();
    const neighborhood = row.neighborhood.trim();
    const normalizedName = normalizeName(name);
    const latitude = Number(row.latitude);
    const longitude = Number(row.longitude);
    if (!name || name.length > 120) throw new Error(`Row ${line}: name must be 1-120 characters`);
    if (!neighborhood || neighborhood.length > 120)
      throw new Error(`Row ${line}: neighborhood must be 1-120 characters`);
    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < MONTERREY_BOUNDS.minLat ||
      latitude > MONTERREY_BOUNDS.maxLat ||
      longitude < MONTERREY_BOUNDS.minLng ||
      longitude > MONTERREY_BOUNDS.maxLng
    ) {
      throw new Error(
        `Row ${line}: coordinates must be inside the documented Monterrey contribution bounds`,
      );
    }
    if (!ALLOWED_SOURCE_TYPES.has(row.source_type))
      throw new Error(
        `Row ${line}: source_type must be one of ${[...ALLOWED_SOURCE_TYPES].join(", ")}`,
      );
    if (!row.source_ref || !row.license)
      throw new Error(`Row ${line}: source_ref and license are required`);
    if (row.notes.length > 1000)
      throw new Error(`Row ${line}: notes must be at most 1000 characters`);
    if (row.last_verified_at && Number.isNaN(Date.parse(row.last_verified_at)))
      throw new Error(`Row ${line}: last_verified_at is not a valid date`);
    const duplicateKey = `${normalizedName}|${latitude.toFixed(6)}|${longitude.toFixed(6)}`;
    if (seen.has(duplicateKey)) throw new Error(`Row ${line}: duplicate input key ${duplicateKey}`);
    seen.add(duplicateKey);
    return { ...row, name, neighborhood, normalizedName, latitude, longitude };
  });
}

function buildSql(rows, batchId) {
  const values = rows.map((row) => {
    const candidateId = uuidFromHash(
      `${batchId}:${row.normalizedName}:${row.latitude.toFixed(6)}:${row.longitude.toFixed(6)}`,
    );
    const originalPayload = JSON.stringify(row);
    return `(${quoteSql(candidateId)}::uuid, ${quoteSql(originalPayload)}::jsonb, ${quoteSql(row.normalizedName)}, ${row.latitude.toFixed(6)}, ${row.longitude.toFixed(6)}, ${quoteSql(row.source_type)}, ${quoteSql(row.license)}, ${row.last_verified_at ? `${quoteSql(row.last_verified_at)}::timestamptz` : "null"}, ${quoteSql(row.source_ref)})`;
  });
  return `begin;
with incoming(id, original_payload, normalized_name, latitude, longitude, source, license_ref, last_verified_at, source_ref) as (values
  ${values.join(",\n  ")}
), candidates as (
  select incoming.*,
    coalesce(array_agg(spots.id) filter (where spots.id is not null), '{}') as matched_spot_ids
  from incoming
  left join app_private.spots spots on spots.status = 'approved'
    and (2 * 6371000 * asin(sqrt(least(1, greatest(0,
      sin(radians(spots.latitude - incoming.latitude) / 2) ^ 2
      + cos(radians(incoming.latitude)) * cos(radians(spots.latitude))
      * sin(radians(spots.longitude - incoming.longitude) / 2) ^ 2
    ))))) < 100)
  group by incoming.id, incoming.original_payload, incoming.normalized_name, incoming.latitude,
    incoming.longitude, incoming.source, incoming.license_ref, incoming.last_verified_at, incoming.source_ref
)
insert into app_private.import_candidates(id, original_payload, normalized_name, latitude, longitude, source, license_ref, matched_spot_ids, import_batch_id)
select id, original_payload || jsonb_build_object('source_ref', source_ref, 'last_verified_at', last_verified_at), normalized_name, latitude, longitude, source, license_ref, matched_spot_ids, ${quoteSql(batchId)}::uuid
from candidates
on conflict (id) do update set original_payload = excluded.original_payload, normalized_name = excluded.normalized_name,
  latitude = excluded.latitude, longitude = excluded.longitude, source = excluded.source, license_ref = excluded.license_ref,
  matched_spot_ids = excluded.matched_spot_ids, import_batch_id = excluded.import_batch_id;
commit;`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const csvBytes = await readFile(resolve(args.csv));
  const csv = new TextDecoder("utf-8", { fatal: true }).decode(csvBytes);
  const rows = validate(parseCsv(csv));
  if (!args.dryRun && !args["maintenance-only"]) {
    throw new Error("Applying candidates requires the explicit --maintenance-only flag");
  }
  const batchId =
    args["batch-id"] ??
    uuidFromHash(
      rows
        .map((row) => JSON.stringify(row))
        .sort()
        .join("\n"),
    );
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(batchId))
    throw new Error("--batch-id must be a UUID");
  const sql = buildSql(rows, batchId);
  const report = [
    `batch_id: ${batchId}`,
    `rows: ${rows.length}`,
    "mode: staging candidates only",
    "",
    "Validated rows:",
    ...rows.map(
      (row, index) =>
        `${index + 1}. ${row.name} (${row.latitude.toFixed(6)}, ${row.longitude.toFixed(6)}) · source=${row.source_type} · license=${row.license}`,
    ),
  ].join("\n");
  if (args.report) await writeFile(resolve(args.report), `${report}\n`, "utf8");
  if (args.dryRun) {
    console.log(`${report}\n\nDry run: no database changes made.`);
    return;
  }
  const tempDir = await mkdtemp(join(tmpdir(), "taco-hunt-import-"));
  const sqlFile = join(tempDir, "import.sql");
  try {
    await writeFile(sqlFile, sql, "utf8");
    const result = spawnSync(
      "pnpm",
      ["exec", "supabase", "db", "query", "--local", "--file", sqlFile],
      { encoding: "utf8", stdio: "inherit" },
    );
    if (result.status !== 0)
      throw new Error(`Supabase local query failed with exit code ${result.status}`);
    console.log(
      `${report}\n\nImported ${rows.length} private candidate(s) for moderator review. No spots were published.`,
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  usage();
  console.error(`Import failed: ${error.message}`);
  process.exitCode = 1;
});
