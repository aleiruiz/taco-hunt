-- Taco Hunt v1 schema. Product data stays outside the Supabase Data API.
create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;

create table app_private.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role text not null default 'user' check (role in ('user','admin')),
  status text not null default 'active' check (status in ('active','blocked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table app_private.spots (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  normalized_name text not null,
  neighborhood text not null check (length(trim(neighborhood)) between 1 and 120),
  latitude numeric(9,6) not null check (latitude between 14.0 and 33.0),
  longitude numeric(9,6) not null check (longitude between -119.0 and -86.0),
  hours_json jsonb,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_by uuid references app_private.profiles(id) on delete set null,
  source_type text not null check (source_type in ('user','owner','licensed','fictional')),
  source_ref text,
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Approved public rows must have useful names and valid Mexican coordinates.
alter table app_private.spots add constraint spots_approved_name_nonempty
  check (status <> 'approved' or length(trim(name)) > 0);
create index spots_status_normalized_name_idx on app_private.spots(status, normalized_name);
create index spots_status_neighborhood_idx on app_private.spots(status, neighborhood);

create table app_private.taco_types (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name_es text not null,
  active boolean not null default true
);

create table app_private.spot_tacos (
  id uuid primary key default gen_random_uuid(),
  spot_id uuid not null references app_private.spots(id) on delete cascade,
  taco_type_id uuid not null references app_private.taco_types(id),
  display_name text,
  price_hint_mxn numeric(8,2) check (price_hint_mxn is null or price_hint_mxn >= 0),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  unique (spot_id, taco_type_id)
);
create index spot_tacos_spot_status_idx on app_private.spot_tacos(spot_id, status);

create table app_private.reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_private.profiles(id) on delete cascade,
  spot_taco_id uuid not null references app_private.spot_tacos(id),
  tortilla smallint not null check (tortilla between 1 and 5),
  filling smallint not null check (filling between 1 and 5),
  salsa smallint not null check (salsa between 1 and 5),
  value smallint not null check (value between 1 and 5),
  price_paid_mxn numeric(8,2) check (price_paid_mxn is null or price_paid_mxn >= 0),
  body varchar(500),
  photo_key text,
  status text not null default 'visible' check (status in ('visible','hidden')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, spot_taco_id)
);
create index reviews_taco_status_created_idx on app_private.reviews(spot_taco_id,status,created_at desc);
create index reviews_user_idx on app_private.reviews(user_id);

create table app_private.favorites (
  user_id uuid not null references app_private.profiles(id) on delete cascade,
  spot_id uuid not null references app_private.spots(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, spot_id)
);

create table app_private.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references app_private.profiles(id) on delete set null,
  target_type text not null check (target_type in ('spot','review')),
  target_id uuid not null,
  reason text not null check (reason in ('inaccurate','abusive','spam','closed','other')),
  note varchar(500),
  status text not null default 'open' check (status in ('open','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index reports_one_open_per_user_target_idx on app_private.reports(reporter_id,target_type,target_id) where status='open';
create index reports_status_created_idx on app_private.reports(status,created_at);

create table app_private.media_uploads (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references app_private.profiles(id) on delete cascade,
  object_key text not null unique,
  state text not null default 'pending' check (state in ('pending','claimed','deleted')),
  created_at timestamptz not null default now(),
  claimed_review_id uuid references app_private.reviews(id) on delete set null
);

create table app_private.moderation_audit (
  id uuid primary key default gen_random_uuid(),
  moderator_id uuid references app_private.profiles(id) on delete set null,
  target_type text not null,
  target_id uuid not null,
  action text not null,
  created_at timestamptz not null default now(),
  internal_reason varchar(500)
);

create table app_private.import_candidates (
  id uuid primary key default gen_random_uuid(),
  original_payload jsonb not null,
  normalized_name text not null,
  latitude numeric(9,6) not null,
  longitude numeric(9,6) not null,
  source text not null,
  license_ref text not null,
  matched_spot_ids uuid[] not null default '{}',
  state text not null default 'pending' check (state in ('pending','approved','rejected')),
  review_notes varchar(1000),
  import_batch_id uuid not null,
  created_at timestamptz not null default now()
);

-- The local API password is provisioned out of band by `supabase/dev-role.ps1`.
-- No runtime secret is generated or stored in migration history.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'taco_hunt_api') then
    create role taco_hunt_api login;
  end if;
end $$;

grant usage on schema app_private to taco_hunt_api;
grant select on app_private.taco_types to taco_hunt_api;
grant select, insert, update, delete on
  app_private.profiles,
  app_private.spots,
  app_private.spot_tacos,
  app_private.reviews,
  app_private.favorites,
  app_private.reports,
  app_private.media_uploads,
  app_private.moderation_audit
to taco_hunt_api;
grant usage, select on all sequences in schema app_private to taco_hunt_api;

-- The Data API roles cannot access product tables, even if the schema is exposed later.
revoke all on all tables in schema app_private from public, anon, authenticated, service_role;
revoke all on all sequences in schema app_private from public, anon, authenticated, service_role;
revoke all on schema app_private from public, anon, authenticated, service_role;

insert into app_private.taco_types(id,slug,name_es) values
 ('10000000-0000-4000-8000-000000000001','pastor','Pastor'),
 ('10000000-0000-4000-8000-000000000002','trompo','Trompo'),
 ('10000000-0000-4000-8000-000000000003','barbacoa','Barbacoa'),
 ('10000000-0000-4000-8000-000000000004','bistec','Bistec'),
 ('10000000-0000-4000-8000-000000000005','carne-asada','Carne asada'),
 ('10000000-0000-4000-8000-000000000006','chicharron','Chicharrón'),
 ('10000000-0000-4000-8000-000000000007','lengua','Lengua'),
 ('10000000-0000-4000-8000-000000000008','suadero','Suadero'),
 ('10000000-0000-4000-8000-000000000009','tripita','Tripita'),
 ('10000000-0000-4000-8000-000000000010','discada','Discada')
on conflict (slug) do nothing;
