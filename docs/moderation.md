# Moderation, reports, and duplicates

The private moderation API is available at `/v1/admin` and is protected by the verified profile role. A non-admin user gets `403`; queues and audit logs are never public.

Queues are available at `GET /v1/admin/queue?kind=spots|tacos|reports|photos|duplicates`. Every mutation runs in a transaction and appends an immutable row to `app_private.moderation_audit`. History is available to admins at `GET /v1/admin/audit`.

Actions include approving or rejecting proposals, requesting changes, closing reports, hiding or unhiding reviews, removing a photo's reference, and merging a pending duplicate into an approved canonical stand. A merge only rejects the pending duplicate; it never overwrites the canonical stand or silently moves user content.

The mobile moderation panel is available from an authenticated account's settings. The API remains the authorization boundary, so a normal user cannot expose queue data.

Reports accept only the reasons `inaccurate`, `abusive`, `spam`, `closed`, and `other`, with an optional note up to 500 characters. Each user can keep only one open report per piece of content. Creating a report validates that the target exists, but does not reveal private information about the target or change its visibility.

The admin queue is queried with `/v1/admin/queue?kind=reports`. Moderation actions require a profile with the `admin` role, are logged in `moderation_audit`, and must never copy the reporter's note into a public response.

Duplicate checking uses a normalized name (lowercase, no accents, compacted whitespace) and Haversine distance. `/v1/admin/duplicate-candidates` lets a moderator review a name and pin before approving a proposal. Proposals also run this check on creation: a name match within 100 meters produces `409`; nearby candidates don't block the proposal but are returned for review. No record is published or merged automatically.
