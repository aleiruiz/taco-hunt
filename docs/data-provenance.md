# Data provenance and candidate imports

Taco Hunt treats every location as a moderated record, not as automatically publishable imported data. The maintenance-only offline importer stages CSV rows in the private `app_private.import_candidates` table. It accepts only original, permissioned, licensed, user, owner, or fictional source rows; live Google reads never write Google payloads to this table. A user-selected Google place follows the separate moderated proposal flow and retains only a durable `place_id` link plus Taco Hunt-owned fields. The importer never inserts into `app_private.spots`, never publishes a candidate, and never imports reviews, ratings, or photos.

## Accepted input

The CSV header must be exactly:

```text
name,latitude,longitude,neighborhood,source_type,source_ref,license,last_verified_at,notes
```

`name` and `neighborhood` retain the original human-readable values. `source_type`, `source_ref`, and `license` are required for attribution and rights review. Coordinates are limited to the documented Monterrey contribution bounds. Names are normalized only for matching; the original row remains in `original_payload`.

Allowed source material is original, permissioned, or properly licensed location data. Do not copy Google Maps or competitor reviews, ratings, or photos. The importer rejects `google_places` as a source type. If OpenStreetMap data is used, keep its attribution and ODbL obligations attached to the candidate and review the resulting database obligations before approval. User submissions remain private until moderation.

## Run a staging import

From the repository root, preview and validate a file without touching the database:

```powershell
node supabase/scripts/import-candidates.mjs --csv .\path\to\candidates.csv --dry-run --report .\candidate-report.txt
```

With the local Supabase stack running, stage the validated rows:

```powershell
node supabase/scripts/import-candidates.mjs --csv .\path\to\candidates.csv --report .\candidate-report.txt --maintenance-only
```

The script uses a deterministic candidate ID, so rerunning the same batch updates the same private candidates rather than creating duplicates. Use `--batch-id <uuid>` when a source owner needs a stable batch identifier. The script computes approved-spot matches within 100 meters and stores only the candidate IDs in `matched_spot_ids`; it does not choose a match or merge records.

The report is safe to share when it contains no private notes or user identifiers. Do not commit source CSVs, reports containing personal data, database URLs, or credentials.

## Review before approval

A moderator must verify the source and license, inspect the proposed match list, check the name, neighborhood, pin, and current status, and record the decision in the moderation workflow. Approval is an explicit action that creates or updates a Taco Hunt spot with `source_type`, `source_ref`, and verification metadata. A candidate with an uncertain license, weak location evidence, or a likely duplicate stays pending or is rejected.

No importer flag bypasses this review. There is no automatic publication path.

## Periodic candidate refresh

Spots proposed through the mobile autocomplete flow carry a Google `place_id` in `source_ref` (`autocomplete:<place_id>`). `apps/api/scripts/refresh-place-candidates.ts` periodically re-checks those approved spots against Google Place Details: closures (`CLOSED_TEMPORARILY`/`CLOSED_PERMANENTLY`), a place_id that no longer resolves, a materially different name, or a location that drifted more than 150 m.

It never overwrites a spot directly. A finding — including an incomplete Google response, which is treated as inconclusive rather than confirmed — is filed as an open report (`reports.reason` `closed` or `inaccurate`, tagged `[places-refresh]`) for a moderator to review through the existing moderation queue. A spot with no finding only gets its `last_verified_at` timestamp refreshed, and only if it still matches the name/coordinates that were just checked (a moderator edit or unapproval in the meantime is not overwritten). A spot with any open report — from this job or a user — is skipped on later runs until that report is closed, so a stuck spot can't monopolize the per-run limit and starve newer spots from ever being checked.

Defaults to a dry run (prints what it would do, changes nothing). Requires `GOOGLE_PLACES_API_KEY`:

```powershell
pnpm --filter @taco-hunt/api run places:refresh
```

Add `-- --apply` to write (refresh timestamps and file reports): `pnpm --filter @taco-hunt/api run places:refresh -- --apply`. `PLACES_REFRESH_LIMIT` (default 25, max 200) bounds how many spots — and therefore how many Google Places calls — a single run makes; `PLACES_REFRESH_DELAY_MS` (default 200, must be non-negative) paces calls between spots. `GOOGLE_PLACES_DETAILS_URL` can override the Place Details endpoint. It must use `https://` for non-loopback hosts. An `http://` loopback URL is supported for trusted local mocks; in that configuration, `GOOGLE_PLACES_API_KEY` is sent without transport encryption. Run this from a scheduler (cron, a Cloud Run job, etc.) the owner configures outside this repository — there is no in-process scheduler, consistent with the rest of this codebase's CLI-based maintenance jobs (`pnpm --filter @taco-hunt/api run media:cleanup`).

## Privacy and retention

Candidate payloads are private operational data. Do not put email addresses, home addresses, user GPS history, or access tokens in the CSV. A user proposal should use `source_type=user` and must remain private to the submitter and moderators until approved. Remove or redact unnecessary notes during moderation, and follow the account-deletion and retention rules in the privacy documentation.
