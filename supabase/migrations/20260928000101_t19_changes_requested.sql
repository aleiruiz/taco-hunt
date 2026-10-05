-- A moderator request for changes is a durable proposal state, not only an audit event.
do $$ begin
  alter table app_private.spots drop constraint if exists spots_status_check;
  alter table app_private.spots add constraint spots_status_check
    check (status in ('pending','changes_requested','approved','rejected'));
end $$;
