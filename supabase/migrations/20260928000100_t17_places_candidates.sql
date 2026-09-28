-- T17: administrative Google Places discovery only.
-- The provider place ID is retained inside original_payload for moderation and
-- later refreshes; no public route reads this table.
create unique index if not exists import_candidates_google_place_id_idx
  on app_private.import_candidates ((original_payload->>'place_id'))
  where source = 'google_places';

grant select, insert, update on app_private.import_candidates to taco_hunt_api;
