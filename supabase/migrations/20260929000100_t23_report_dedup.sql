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
  where status = 'open' and reporter_id is null
)
update app_private.reports
set status = 'closed'
where id in (select id from duplicates where rank > 1);

-- One open system-filed report per target: concurrent refresh-place-candidates.ts
-- runs (or any other system actor) must not create duplicate open reports for the
-- same spot. System reports have no reporter (reporter_id is null), so the
-- existing reports_one_open_per_user_target_idx (scoped to a real reporter_id)
-- does not cover this case.
create unique index reports_one_open_system_target_idx
  on app_private.reports(target_type, target_id)
  where status = 'open' and reporter_id is null;
