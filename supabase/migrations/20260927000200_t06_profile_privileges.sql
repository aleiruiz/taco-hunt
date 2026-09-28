-- T06: profiles may be created by the API, but role and status are operator-managed.
-- Remove table-wide write grants inherited from the initial T01 migration, including
-- INSERT/UPDATE privileges that could otherwise set protected profile columns.
revoke insert, update on table app_private.profiles from taco_hunt_api;

-- The API only needs the authenticated subject id when bootstrapping a new profile.
grant insert (id) on table app_private.profiles to taco_hunt_api;

-- Keep the user-editable profile field narrow for later self-service settings.
grant update (display_name) on table app_private.profiles to taco_hunt_api;
