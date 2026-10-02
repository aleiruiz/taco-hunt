# Google Places cost and safety controls (T24)

The API is the only component allowed to call Google Places (see `docs/build-spec.md`'s
Mapping row): admin candidate discovery (T17), mobile autocomplete (T21), and periodic
re-verification of Google-sourced spots (T23). This page covers the controls that keep
that usage bounded and reversible in an emergency. Nothing here is enforced by mobile
code — the app never calls Google Places directly.

## 1. Restricted API key

Provision a separate Google Cloud API key for server-side Places calls (do not reuse the
Android Google Maps SDK key from section 12 of `docs/build-spec.md`, which is restricted
to the app's package name and signing certificate and must never get Places enabled).

In the Google Cloud Console, on the Places key:

- **Application restriction:** IP addresses — the Cloud Run service's static/NAT egress
  IP(s) if available, otherwise leave unrestricted at the application level but rely on
  the API restriction and the controls below.
- **API restriction:** limit to `Places API (New)` only (the endpoints this codebase
  uses: `places:searchText`, `places:autocomplete`, `places/{placeId}`). Do not enable
  any other Google Maps Platform API on this key.
- Store the key as `GOOGLE_PLACES_API_KEY` in the deployment's secret manager, never in
  the repository or logs.
- Rotate the key if it is ever exposed in a log, error message, or client response —
  none of the code paths below should echo it, but rotation is cheap insurance.

## 2. Quotas

Set an explicit daily quota on the key in the Cloud Console (Quotas & System Limits) in
addition to the application-level budget below, so a bug can't exceed Google's own
billing tier unnoticed. Start conservatively (for example 500-1,000 requests/day) and
raise it deliberately as real usage data comes in.

Two layers enforce quotas in code, independent of the Cloud Console setting:

- **Per-user, per-minute** (`RequestLimitService`, already in place for T21):
  30 autocomplete requests and 20 resolve requests per user per minute
  (`apps/api/src/places/places.service.ts`). This stops a single client from hammering
  the endpoint; it does not bound total daily spend.
- **Global daily call budget** (`GOOGLE_PLACES_DAILY_CALL_LIMIT`, added by this task):
  every outbound Google Places request from the API — discovery, autocomplete, and
  place-details resolution — consumes one unit of a single shared 24-hour counter via
  `RequestLimitService`. Once the limit is reached, further calls fail closed
  (autocomplete degrades to local-only results; discovery and resolve return `503`)
  until the window resets. Default is 2,000 calls/day if the env var is unset or
  invalid; set it below whatever the Cloud Console quota allows, so the application
  degrades gracefully before Google starts rejecting requests outright.
  This counter is in-process and per-instance — with `max-instances` above 1 the
  effective ceiling is `GOOGLE_PLACES_DAILY_CALL_LIMIT × instance count`. Keep
  `max-instances` low (see `docs/build-spec.md` section 12) or move to a shared store
  (e.g. a Postgres counter) if that stops being acceptable.
- **Batch job** (`apps/api/scripts/refresh-place-candidates.ts`, T23): bounded per run
  by `PLACES_REFRESH_LIMIT` (max 200, default 25) plus a per-call delay
  (`PLACES_REFRESH_DELAY_MS`). Run it on a schedule you control (cron/manual), not
  continuously, so its calls stay a known, small addition to the daily budget above.

## 3. Deduplication

- The retired Google discovery-to-`import_candidates` path is no longer available. The
  historical unique index on Google place IDs remains for existing rows, but no live
  route or maintenance importer creates new Google payload candidates.
- The refresh job dedupes its own findings by tagging reports with `[places-refresh]`
  and checking for an existing untagged report before filing a new one, so repeated
  scheduled runs don't spam the moderation queue for the same spot.
- Autocomplete and resolve are read-only lookups with no server-side storage to
  deduplicate against; their per-user rate limits above are the relevant control.

## 4. Alerts

Configure Google Cloud Billing budget alerts on the project (Billing → Budgets &
alerts) at, for example, 50%/90%/100% of the expected monthly Places spend, emailing
the owner. This is informational, not a hard cap (Google Cloud budgets never stop
billing on their own) — the daily call budget and Cloud Console quota above are what
actually stop calls; the billing alert is the early-warning signal that either of them
needs adjusting.

Application-level signal: `PlacesService` logs (via its `Logger`) an unexpected
discovery or details failure (a network error, timeout, or anything other than a
handled non-2xx/404 response) and a failed autocomplete attempt, including when it's
Google that failed. It does **not** currently log budget/kill-switch rejections from
`assertGoogleCallAllowed()`, nor the handled non-2xx cases in discovery and resolve
(`BadGatewayException`, `NotFoundException`) — those surface only as the HTTP response
to the caller. If you need those in your alerting pipeline too, add explicit logging
at the rejection sites before wiring alerts to them; as shipped, wire your log sink's
alerting (Cloud Logging, or whatever the deployment uses) to the failures above, which
usually mean either a real outage on Google's side or a bug generating duplicate calls.

## 5. Emergency shutoff

Set `GOOGLE_PLACES_KILL_SWITCH=true` in the API's environment (and redeploy, or restart
the process if your platform doesn't hot-reload env vars) to immediately stop every
outbound Google Places call:

- `PlacesService.assertGoogleCallAllowed()` throws before any `fetch` to Google —
  discovery and resolve return `503`, autocomplete silently degrades to local-only
  results (same behavior as when `GOOGLE_PLACES_API_KEY` is unset).
- `apps/api/scripts/refresh-place-candidates.ts` refuses to run at all when the switch
  is set.

Use this when Google reports an incident, when a billing alert fires and you need time
to investigate before the next automatic charge, or when a bug is suspected in one of
the call sites above. Unset the variable (or remove it) to resume normal operation.

## Environment variables added by this task

| Variable                         | Default | Effect                                                                          |
| -------------------------------- | ------- | ------------------------------------------------------------------------------- |
| `GOOGLE_PLACES_KILL_SWITCH`      | unset   | `"true"` disables all outbound Google Places calls immediately.                 |
| `GOOGLE_PLACES_DAILY_CALL_LIMIT` | `2000`  | Shared 24h budget across discovery, autocomplete and resolve, per API instance. |
