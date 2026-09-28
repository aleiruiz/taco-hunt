-- Explicit one-use state enforcement for processed review photo uploads.
create index media_uploads_pending_created_idx
  on app_private.media_uploads(created_at, id)
  where state in ('pending','deleted');

create unique index media_uploads_one_per_review_idx
  on app_private.media_uploads(claimed_review_id)
  where claimed_review_id is not null;

alter table app_private.media_uploads
  add constraint media_uploads_claim_consistency_check
  check (
    (state = 'claimed' and claimed_review_id is not null)
    or (state in ('pending','deleted') and claimed_review_id is null)
  );
