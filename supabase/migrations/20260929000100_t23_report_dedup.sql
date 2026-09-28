-- One open system-filed report per target: concurrent refresh-place-candidates.ts
-- runs (or any other system actor) must not create duplicate open reports for the
-- same spot. System reports have no reporter (reporter_id is null), so the
-- existing reports_one_open_per_user_target_idx (scoped to a real reporter_id)
-- does not cover this case.
create unique index reports_one_open_system_target_idx
  on app_private.reports(target_type, target_id)
  where status = 'open' and reporter_id is null;
