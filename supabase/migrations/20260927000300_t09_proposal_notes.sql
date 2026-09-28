-- Proposal notes are private moderator/submitter data, never part of public spot reads.
alter table app_private.spots
  add column proposal_note varchar(500);
