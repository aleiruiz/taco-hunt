-- Approval provenance is private moderation metadata. Taco Hunt-owned fields
-- (name, neighborhood and coordinates) remain the values submitted by the proposer.
alter table app_private.spots
  add column approved_by uuid references app_private.profiles(id) on delete set null,
  add column approved_at timestamptz,
  add column verified_by uuid references app_private.profiles(id) on delete set null,
  add column verification_note varchar(500);

create index spots_approved_by_idx on app_private.spots(approved_by, approved_at desc);
