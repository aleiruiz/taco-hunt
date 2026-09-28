-- T20: retain moderation provenance while allowing Taco Hunt to curate canonical fields.
alter table app_private.spots
  add column source_license_ref text,
  add column verified_by uuid references app_private.profiles(id) on delete set null,
  add column verified_at timestamptz,
  add column verification_note varchar(500),
  add column approved_by uuid references app_private.profiles(id) on delete set null,
  add column approved_at timestamptz;

create index spots_verified_by_verified_at_idx
  on app_private.spots(verified_by, verified_at desc)
  where verified_by is not null;

grant select, update on app_private.spots to taco_hunt_api;
