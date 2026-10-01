-- T37: stand photos API. Pre-moderated photos attached to an approved spot,
-- reusing the existing review-photo upload pipeline (processor, storage,
-- media_uploads claim pattern) rather than a separate upload path.
create table app_private.spot_photos (
  id uuid primary key default gen_random_uuid(),
  spot_id uuid not null references app_private.spots(id) on delete cascade,
  uploader_id uuid not null references app_private.profiles(id) on delete cascade,
  object_key text not null,
  kind text not null check (kind in ('tacos','puesto','menu')),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  rejection_reason varchar(500),
  created_at timestamptz not null default now()
);
-- Public gallery (GET /v1/spots/:id/photos) lists approved photos for one
-- spot ordered by created_at; the admin queue lists pending photos globally.
create index spot_photos_spot_status_created_idx
  on app_private.spot_photos(spot_id, status, created_at);
create index spot_photos_status_created_idx
  on app_private.spot_photos(status, created_at);
create index spot_photos_uploader_idx on app_private.spot_photos(uploader_id);

-- Reuse media_uploads' one-use claim pattern (see
-- 20260927000200_media_upload_claims.sql for the review-photo equivalent)
-- instead of making claimed_review_id polymorphic: a nullable sibling column
-- keeps the existing review-photo claim/unclaim queries untouched.
-- on delete cascade (not set null): account deletion cascades
-- profiles -> spot_photos (uploader_id), and the claim-consistency check
-- below requires a claimed upload to keep exactly one owner. Deleting the
-- now-orphaned media_uploads row satisfies that invariant; set null would
-- instead leave a claimed row with zero owners and fail the check.
alter table app_private.media_uploads
  add column claimed_spot_photo_id uuid references app_private.spot_photos(id) on delete cascade;

create unique index media_uploads_one_per_spot_photo_idx
  on app_private.media_uploads(claimed_spot_photo_id)
  where claimed_spot_photo_id is not null;

alter table app_private.media_uploads
  drop constraint media_uploads_claim_consistency_check;
alter table app_private.media_uploads
  add constraint media_uploads_claim_consistency_check
  check (
    (state = 'claimed' and num_nonnulls(claimed_review_id, claimed_spot_photo_id) = 1)
    or (state in ('pending','deleted') and claimed_review_id is null and claimed_spot_photo_id is null)
  );

grant select, insert, update, delete on app_private.spot_photos to taco_hunt_api;
