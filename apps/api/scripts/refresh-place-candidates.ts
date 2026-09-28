import pg from "pg";
import { normalizeName } from "../src/proposals/duplicate-detector.js";

const { Pool } = pg;
const pool = new Pool({ connectionString: required("DATABASE_URL"), max: 1 });
const apiKey = required("GOOGLE_PLACES_API_KEY");
const detailsEndpoint =
  process.env.GOOGLE_PLACES_DETAILS_URL?.trim() || "https://places.googleapis.com/v1/places";
const limit = Number(process.env.PLACES_REFRESH_LIMIT ?? 25);
const delayMs = Number(process.env.PLACES_REFRESH_DELAY_MS ?? 200);
const movedThresholdMeters = 150;
const apply = process.argv.includes("--apply");
const REPORT_TAG = "[places-refresh]";

type EligibleSpot = {
  id: string;
  name: string;
  neighborhood: string;
  latitude: number;
  longitude: number;
  sourceRef: string;
};

type GoogleDetails = {
  status: "ok" | "not_found";
  name?: string;
  formattedAddress?: string;
  latitude?: number;
  longitude?: number;
  businessStatus?: string;
};

type Finding = { spot: EligibleSpot; placeId: string; issues: string[] };

if (!Number.isFinite(limit) || limit < 1 || limit > 200) {
  throw new Error("PLACES_REFRESH_LIMIT must be between 1 and 200");
}

async function main(): Promise<void> {
  const spots = await eligibleSpots(limit);
  const findings: Finding[] = [];
  let confirmed = 0;
  let skippedNoPlaceId = 0;

  for (const spot of spots) {
    const placeId = extractPlaceId(spot.sourceRef);
    if (!placeId) {
      skippedNoPlaceId += 1;
      continue;
    }

    const details = await fetchDetails(placeId);
    const issues = compare(spot, details);
    if (issues.length === 0) {
      confirmed += 1;
      if (apply) {
        await pool.query("update app_private.spots set last_verified_at=now() where id=$1", [
          spot.id,
        ]);
      }
    } else {
      findings.push({ spot, placeId, issues });
    }
    if (delayMs > 0) await sleep(delayMs);
  }

  let reportsCreated = 0;
  let reportsSkippedExisting = 0;
  if (apply) {
    for (const finding of findings) {
      const created = await fileReport(finding);
      if (created) reportsCreated += 1;
      else reportsSkippedExisting += 1;
    }
  }

  console.log(
    JSON.stringify(
      {
        mode: apply ? "apply" : "dry-run",
        checked: spots.length,
        skippedNoPlaceId,
        confirmedFresh: confirmed,
        findings: findings.map((finding) => ({
          spotId: finding.spot.id,
          name: finding.spot.name,
          placeId: finding.placeId,
          issues: finding.issues,
        })),
        reportsCreated: apply ? reportsCreated : undefined,
        reportsSkippedExisting: apply ? reportsSkippedExisting : undefined,
      },
      null,
      2,
    ),
  );
  if (!apply && findings.length > 0) {
    console.log(
      `\nDry run: no database changes made. Re-run with --apply to send ${findings.length} finding(s) to moderation and refresh last_verified_at on the rest.`,
    );
  }
}

async function eligibleSpots(max: number): Promise<EligibleSpot[]> {
  const { rows } = await pool.query<{
    id: string;
    name: string;
    neighborhood: string;
    latitude: number;
    longitude: number;
    sourceRef: string;
  }>(
    `select id, name, neighborhood, latitude::float8 as latitude, longitude::float8 as longitude,
       source_ref as "sourceRef"
     from app_private.spots
     where status='approved' and source_ref like 'autocomplete:%'
     order by coalesce(last_verified_at, created_at) asc
     limit $1`,
    [max],
  );
  return rows;
}

function extractPlaceId(sourceRef: string): string | null {
  const match = /^autocomplete:(.+)$/.exec(sourceRef);
  const placeId = match?.[1]?.trim();
  return placeId ? placeId : null;
}

async function fetchDetails(placeId: string): Promise<GoogleDetails> {
  const response = await fetch(`${detailsEndpoint}/${encodeURIComponent(placeId)}`, {
    headers: {
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": [
        "id",
        "displayName",
        "formattedAddress",
        "location",
        "businessStatus",
      ].join(","),
    },
  });
  if (response.status === 404) return { status: "not_found" };
  if (!response.ok) throw new Error(`Google Places details returned ${response.status}`);

  const payload = (await response.json()) as {
    displayName?: { text?: unknown };
    formattedAddress?: unknown;
    location?: { latitude?: unknown; longitude?: unknown };
    businessStatus?: unknown;
  };
  return {
    status: "ok",
    name: typeof payload.displayName?.text === "string" ? payload.displayName.text : undefined,
    formattedAddress:
      typeof payload.formattedAddress === "string" ? payload.formattedAddress : undefined,
    latitude:
      typeof payload.location?.latitude === "number" ? payload.location.latitude : undefined,
    longitude:
      typeof payload.location?.longitude === "number" ? payload.location.longitude : undefined,
    businessStatus: typeof payload.businessStatus === "string" ? payload.businessStatus : undefined,
  };
}

function compare(spot: EligibleSpot, details: GoogleDetails): string[] {
  if (details.status === "not_found") {
    return ["El place_id de Google ya no resuelve (posiblemente fusionado o eliminado)."];
  }

  const issues: string[] = [];
  if (details.businessStatus === "CLOSED_PERMANENTLY") {
    issues.push("Google lo marca como cerrado permanentemente.");
  } else if (details.businessStatus === "CLOSED_TEMPORARILY") {
    issues.push("Google lo marca como cerrado temporalmente.");
  }
  if (details.name && normalizeName(details.name) !== normalizeName(spot.name)) {
    issues.push(
      `Google reporta un nombre distinto: "${details.name}" (Taco Hunt: "${spot.name}").`,
    );
  }
  if (typeof details.latitude === "number" && typeof details.longitude === "number") {
    const distance = distanceMeters(
      spot.latitude,
      spot.longitude,
      details.latitude,
      details.longitude,
    );
    if (distance > movedThresholdMeters) {
      issues.push(`Google ubica el lugar a ${Math.round(distance)} m de la posición guardada.`);
    }
  }
  return issues;
}

function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const radians = (value: number) => (value * Math.PI) / 180;
  const sinLat = Math.sin(radians(lat2 - lat1) / 2);
  const sinLng = Math.sin(radians(lng2 - lng1) / 2);
  const a = sinLat ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * sinLng ** 2;
  return 6_371_000 * 2 * Math.asin(Math.sqrt(Math.min(1, a)));
}

async function fileReport(finding: Finding): Promise<boolean> {
  const existing = await pool.query(
    `select 1 from app_private.reports
     where target_type='spot' and target_id=$1 and status='open' and note like $2 limit 1`,
    [finding.spot.id, `${REPORT_TAG}%`],
  );
  if (existing.rowCount) return false;

  const isClosed = finding.issues.some((issue) => issue.includes("cerrado"));
  const note = `${REPORT_TAG} place_id ${finding.placeId}: ${finding.issues.join(" ")}`.slice(
    0,
    500,
  );
  await pool.query(
    `insert into app_private.reports (reporter_id, target_type, target_id, reason, note)
     values (null, 'spot', $1, $2, $3)`,
    [finding.spot.id, isClosed ? "closed" : "inaccurate", note],
  );
  return true;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Place refresh failed");
    process.exitCode = 1;
  })
  .finally(() => pool.end());
