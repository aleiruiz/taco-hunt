-- T65: retain only the Google place ID as a durable relationship.
-- Google display fields remain transient and are not copied into this column.

alter table app_private.spots
  add column google_place_id text;

-- A provider ID is opaque, but it must be a trimmed, non-empty value when
-- present. The source-ref check below keeps legacy provenance and this
-- relationship from silently disagreeing during the migration window.
alter table app_private.spots
  add constraint spots_google_place_id_value_check
  check (
    google_place_id is null
    or (
      google_place_id = btrim(google_place_id)
      and length(google_place_id) between 1 and 300
    )
  );

-- Existing user proposals and Google import approvals encoded the provider ID
-- in source_ref. Promote only that opaque ID; do not copy any display payload.
-- Fail rather than choosing an arbitrary owner if history contains a duplicate
-- provider link, because the unique relationship is an integrity boundary.
do $$
begin
  if exists (
    select 1
    from app_private.spots
    where source_ref ~ '^(autocomplete|google_places):.+'
    group by btrim(substring(source_ref from '^(?:autocomplete|google_places):(.+)$'))
    having count(*) > 1
  ) then
    raise exception 'T65 cannot backfill duplicate Google place links';
  end if;
end
$$;

update app_private.spots
set google_place_id = btrim(substring(source_ref from '^(?:autocomplete|google_places):(.+)$'))
where source_ref ~ '^(autocomplete|google_places):.+';

-- A provenance reference that identifies Google must always have the dedicated
-- relationship. Rejected proposals retain the link for moderation history and
-- duplicate prevention, so the invariant is intentionally status-independent.
alter table app_private.spots
  add constraint spots_google_provenance_link_check
  check (
    source_ref !~ '^(autocomplete|google_places):.+'
    or google_place_id is not null
  );

alter table app_private.spots
  add constraint spots_google_provenance_match_check
  check (
    source_ref !~ '^(autocomplete|google_places):.+'
    or btrim(substring(source_ref from '^(?:autocomplete|google_places):(.+)$')) = google_place_id
  );

create unique index spots_google_place_id_unique_idx
  on app_private.spots(google_place_id)
  where google_place_id is not null;

-- google_place_id is Taco Hunt-owned moderation/provenance metadata, not
-- personal data. It intentionally survives created_by ON DELETE SET NULL when
-- an account is deleted. Proposal, refresh, and moderation paths only need
-- INSERT/SELECT/UPDATE on spots; no API path deletes a spot directly.
revoke delete on app_private.spots from taco_hunt_api;
