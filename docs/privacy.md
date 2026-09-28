# Privacy of contributions and moderation

Taco Hunt uses the API as the only path to product data. The mobile app never receives database credentials and never queries private tables directly.

Reports are private. A report's author can only receive the identifier, target, reason, status, and date of their own request; their email, name, internal note, and the moderator's identity are never published. The admin queue also does not expose the reporter's identifier to normal clients. Reports do not hide content automatically, and per-user and per-network-address write limits apply.

Pending proposals are visible to their author and to admins. Duplicate suggestions only query approved stands within 100 meters and return name, neighborhood, public coordinates, distance, and a match classification. Pending proposals, private notes, or data about the user who proposed the stand are never included.

No user location history is stored. A stand's coordinates are stand data and must not be confused with a personal location. Review text is never sent to telemetry; analytics must keep only aggregated counts. Version 1 does not ship a telemetry or analytics pipeline; if one is added later, it must follow this aggregate-only rule and be covered by the deletion guarantees below before it can retain anything per-user.

## Account deletion

`DELETE /v1/me` (mobile: Settings → "Eliminar cuenta") deletes the caller's Supabase Auth user through a privileged server action. Every other effect comes from the database schema's own `on delete` rule on the deleted profile, not from bespoke deletion code, so it is consistent no matter which task later touches these tables:

- **Hard-deleted:** the profile row, all of the user's reviews (and their photos, best-effort, from Storage — the existing orphan-cleanup job at `apps/api/scripts/cleanup-orphan-photos.ts` sweeps anything that best-effort step misses), favorites, and media upload records.
- **Anonymized, not deleted:** authorship of spot and taco proposals, moderation audit entries, and report authorship — the moderator- or public-facing content (a pending stand, an audit log, an open report) is retained for moderation integrity, but the link back to the deleted person is set to null. A stand proposed by a deleted account is not removed or unpublished by that fact alone.

The endpoint is safe to retry: nothing is destroyed until the Supabase Auth user is deleted, that call treats an already-deleted user as success, and best-effort photo cleanup after it never blocks or reverses the deletion. Once the account is deleted, the client's access token stops working (Supabase revokes it), so a retry with the same token correctly fails closed rather than silently doing nothing.
