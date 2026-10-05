-- T40 (20260930000101_t40_profile_avatars.sql) replaced
-- media_uploads_claim_consistency_check to add claimed_profile_id but dropped
-- T37's claimed_spot_photo_id, so claiming an upload for a stand photo
-- (POST /v1/spots/:id/photos) violates the check. Restore it: a claimed upload
-- has exactly one owner among the three claim columns; a pending or deleted
-- upload has none.
alter table app_private.media_uploads
  drop constraint media_uploads_claim_consistency_check;

alter table app_private.media_uploads
  add constraint media_uploads_claim_consistency_check
  check (
    (state = 'claimed'
      and num_nonnulls(claimed_review_id, claimed_spot_photo_id, claimed_profile_id) = 1)
    or (state in ('pending','deleted')
      and claimed_review_id is null
      and claimed_spot_photo_id is null
      and claimed_profile_id is null)
  );
