-- T40: profile avatars (app preset + optional own photo with automated review).
-- avatar_preset is computed application-side at profile creation, deterministically
-- from the user id (see apps/api/src/auth/avatar.ts), matching the mobile fixture
-- hash in apps/mobile/src/data/auth-onboarding.ts so a signed-up user's assigned
-- avatar never changes if this column is later recomputed.
alter table app_private.profiles
  add column avatar_preset text not null default 'pastor'
    check (avatar_preset in
      ('pastor','masa','cilantro','tortilla','salsa','comal','aguacate','horchata')),
  add column avatar_photo_key text,
  add column avatar_photo_status text
    check (avatar_photo_status in ('pending','approved','rejected'));

-- Existing profiles were created before avatar_preset existed, so the column
-- defaulted them all to pastor. Recompute the same 31-based unsigned hash used
-- by derivePresetForUser() for each existing id instead of using a fixture id.
do $$
declare
  profile record;
  hash bigint;
  preset_index integer;
  character_index integer;
begin
  for profile in select id from app_private.profiles loop
    hash := 0;
    for character_index in 1..length(profile.id::text) loop
      hash := (hash * 31 + ascii(substr(profile.id::text, character_index, 1))) % 4294967296;
    end loop;
    preset_index := (hash % 8) + 1;
    update app_private.profiles
      set avatar_preset = (array['pastor','masa','cilantro','tortilla','salsa','comal','aguacate','horchata'])[preset_index]
      where id = profile.id;
  end loop;
end;
$$;

-- A photo and its review status always travel together: both set, or both null
-- (null means "no own photo, show the preset").
alter table app_private.profiles
  add constraint profiles_avatar_photo_consistency_check
  check ((avatar_photo_key is null) = (avatar_photo_status is null));

-- Reuse the existing media_uploads one-use claim table (T11) for avatar photo
-- uploads too, mirroring claimed_review_id's pattern instead of a parallel table.
-- on delete cascade (not set null) to match owner_id's cascade: Postgres doesn't
-- guarantee ordering between the two referential actions on profile deletion, so
-- set null here could leave a 'claimed' row with both claim ids null, violating
-- media_uploads_claim_consistency_check below and failing DELETE /v1/me.
alter table app_private.media_uploads
  add column claimed_profile_id uuid references app_private.profiles(id) on delete cascade;

create unique index media_uploads_one_per_profile_idx
  on app_private.media_uploads(claimed_profile_id)
  where claimed_profile_id is not null;

alter table app_private.media_uploads
  drop constraint media_uploads_claim_consistency_check;

alter table app_private.media_uploads
  add constraint media_uploads_claim_consistency_check
  check (
    (state = 'claimed' and (claimed_review_id is not null or claimed_profile_id is not null))
    or (state in ('pending','deleted') and claimed_review_id is null and claimed_profile_id is null)
  );

-- T06 narrowed profiles to column-level grants only; extend that narrow surface
-- for the new self-service avatar fields and for persisting the sign-up display
-- name at profile-creation time (previously insert-only on "id").
grant insert (display_name, avatar_preset) on table app_private.profiles to taco_hunt_api;
grant update (display_name, avatar_preset, avatar_photo_key, avatar_photo_status, updated_at)
  on table app_private.profiles to taco_hunt_api;
