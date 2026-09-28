-- Proposal notes are private moderator/submitter data, never part of public spot reads.
alter table app_private.spots
  add column proposal_note varchar(500);

-- Retain proposer identity for private status tracking; anonymize on account deletion.
alter table app_private.spot_tacos
  add column created_by uuid references app_private.profiles(id) on delete set null;
create index spot_tacos_created_by_created_idx
  on app_private.spot_tacos(created_by,created_at desc)
  where created_by is not null;

-- A rejected proposal can be resubmitted, but only one pending or approved type is allowed per spot.
alter table app_private.spot_tacos
  drop constraint spot_tacos_spot_id_taco_type_id_key;
create unique index spot_tacos_active_type_unique_idx
  on app_private.spot_tacos(spot_id,taco_type_id)
  where status in ('pending','approved');
