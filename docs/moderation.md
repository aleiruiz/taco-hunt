# Moderation

The private moderation API is available under `/v1/admin` and is protected by the verified profile role. A non-admin receives `403`; queue results and audit entries are never public.

Queues are available with `GET /v1/admin/queue?kind=spots|tacos|reports|photos|duplicates`. Every mutation runs in a database transaction and appends an immutable row to `app_private.moderation_audit`. The audit history is available to administrators at `GET /v1/admin/audit`.

Supported actions include approving or rejecting proposals, recording a request for changes, closing reports, hiding or unhiding reviews, removing a review photo reference, and merging a pending duplicate into an approved canonical spot. A merge rejects only the pending duplicate; it does not overwrite the canonical spot or silently move user content.

The mobile moderator panel is reachable from a signed-in account's settings screen. The API remains the authorization boundary, so opening the route as a normal user does not reveal queue data.
