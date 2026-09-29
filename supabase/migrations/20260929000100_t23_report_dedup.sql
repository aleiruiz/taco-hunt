-- reporter_id is set null both for a genuine system-filed report (this job's
-- own reports) and, via ON DELETE SET NULL, for a user report whose author
-- later deleted their account (T14). "reporter_id is null" alone cannot tell
-- those apart, so a system report needs its own explicit marker.
alter table app_private.reports
  add column is_system boolean not null default false;

-- Backfill: the only system reports that could already exist were filed by
-- this same refresh job, always tagged with the [places-refresh] note prefix.
-- This is the one place matching on that tag is appropriate — a one-time,
-- historical backfill, not the ongoing discriminator.
update app_private.reports
set is_system = true
where reporter_id is null and note like '[places-refresh]%';

-- Deterministically close any pre-existing duplicate open system reports for the
-- same target before the unique index below can be created. Nothing enforced
-- this until now, so a database that already ran refresh-place-candidates.ts a
-- few times without this migration could have more than one; keep the oldest.
with duplicates as (
  select id,
    row_number() over (
      partition by target_type, target_id
      order by created_at asc, id asc
    ) as rank
  from app_private.reports
  where status = 'open' and is_system
)
update app_private.reports
set status = 'closed'
where id in (select id from duplicates where rank > 1);

-- One open system-filed report per target: concurrent refresh-place-candidates.ts
-- runs (or any other system actor) must not create duplicate open reports for
-- the same spot. Scoped to is_system, not reporter_id is null, so an
-- anonymized former user's report is never mistaken for a system report.
create unique index reports_one_open_system_target_idx
  on app_private.reports(target_type, target_id)
  where status = 'open' and is_system;
