-- Shagun inventory. PostgreSQL 15+ / Supabase. No optional search extensions.
-- Apply as the database migration owner, never as an application JWT role.
-- The executor owns the transaction. Use an explicit migration runner to apply
-- all four migrations and record their SQL/checksums in its ledger atomically.

create schema shagun;
create schema shagun_private;
revoke all on schema shagun, shagun_private from public, anon, authenticated, service_role;
grant usage on schema shagun, shagun_private to anon, authenticated, service_role;

-- Metadata is deliberately PUBLIC editorial metadata, not a place for sources.
create function shagun_private.valid_metadata(p_value jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(p_value) <> 'object' then false else
    octet_length(p_value::text) <= 3000 and not exists (
      select 1 from jsonb_each(p_value) e
      where char_length(e.key) > 100
        or jsonb_typeof(e.value) not in ('string', 'number', 'boolean', 'null')
        or (jsonb_typeof(e.value) = 'string' and char_length(e.value #>> '{}') > 500)
    ) end;
$$;

create table shagun.cities (
  id uuid primary key default gen_random_uuid(),
  name text not null check (name = btrim(name) and char_length(name) between 2 and 100),
  slug text not null unique check (char_length(slug) between 2 and 90 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  state text not null check (state = btrim(state) and char_length(state) between 2 and 100),
  country text not null default 'India' check (country = btrim(country) and char_length(country) between 2 and 100),
  description text check (char_length(description) <= 2000),
  status text not null default 'draft' check (status in ('draft', 'active', 'inactive', 'archived')),
  seo_title text check (char_length(seo_title) <= 70),
  seo_description text check (char_length(seo_description) <= 180),
  metadata jsonb not null default '{}'::jsonb check (shagun_private.valid_metadata(metadata)),
  launched_at timestamptz,
  created_at timestamptz not null default transaction_timestamp(),
  updated_at timestamptz not null default transaction_timestamp()
);

create table shagun.venues (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references shagun.cities(id) on delete restrict,
  name text not null check (name = btrim(name) and char_length(name) between 2 and 180),
  slug text not null check (char_length(slug) between 2 and 90 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description text check (char_length(description) <= 8000),
  venue_type text not null check (venue_type in ('vivah_bhawan', 'banquet_hall', 'community_hall', 'wedding_lawn', 'hotel', 'resort')),
  address text check (char_length(address) <= 600),
  locality text check (char_length(locality) <= 150),
  phone text check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  alternate_phone text check (alternate_phone ~ '^\+[1-9][0-9]{7,14}$'),
  whatsapp text check (whatsapp ~ '^\+[1-9][0-9]{7,14}$'),
  email text check (char_length(email) <= 254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  capacity_min integer check (capacity_min between 1 and 100000),
  capacity_max integer check (capacity_max between 1 and 100000),
  price_min numeric check (price_min between 1 and 100000000),
  price_max numeric check (price_max between 1 and 100000000),
  price_type text check (price_type in ('per_day', 'per_event', 'per_plate')),
  latitude numeric check (latitude between -90 and 90),
  longitude numeric check (longitude between -180 and 180),
  status text not null default 'draft' check (status in ('draft', 'published', 'unpublished', 'archived')),
  verification_status text not null default 'unverified' check (verification_status in ('unverified', 'verified', 'needs_review')),
  verified_at timestamptz check (verified_at is null or (isfinite(verified_at) and verified_at <= transaction_timestamp())),
  published_at timestamptz,
  seo_title text check (char_length(seo_title) <= 70),
  seo_description text check (char_length(seo_description) <= 180),
  created_at timestamptz not null default transaction_timestamp(),
  updated_at timestamptz not null default transaction_timestamp(),
  search_document tsvector generated always as (
    setweight(to_tsvector('pg_catalog.simple'::regconfig, coalesce(name, '')), 'A') ||
    setweight(to_tsvector('pg_catalog.simple'::regconfig, coalesce(locality, '')), 'B') ||
    setweight(to_tsvector('pg_catalog.simple'::regconfig, coalesce(address, '')), 'C')
  ) stored,
  unique (city_id, slug),
  check (capacity_min is null or capacity_max is null or capacity_min <= capacity_max),
  check (price_min is null or price_max is null or price_min <= price_max),
  check ((price_min is null and price_max is null) or price_type is not null),
  check ((latitude is null) = (longitude is null)),
  check (status <> 'published' or nullif(btrim(address), '') is not null),
  check (verification_status <> 'verified' or verified_at is not null)
);

create index cities_status_name_idx on shagun.cities (status, name, id);
create index cities_search_idx on shagun.cities using gin (to_tsvector('pg_catalog.simple'::regconfig, name || ' ' || state));
create index venues_search_idx on shagun.venues using gin (search_document);
create index venues_city_status_updated_idx on shagun.venues (city_id, status, updated_at desc, id);
create index venues_status_updated_idx on shagun.venues (status, updated_at desc, id);
create index venues_updated_idx on shagun.venues (updated_at desc, id);
create index venues_capacity_idx on shagun.venues (city_id, capacity_max, id) where status = 'published';
create index venues_price_idx on shagun.venues (city_id, price_type, (coalesce(price_min, price_max)), id) where status = 'published';

create table shagun.facilities (
  code text primary key check (code in ('ac', 'parking', 'rooms', 'catering', 'decoration', 'kitchen', 'power_backup', 'lift', 'accessible_entry')),
  label text not null check (char_length(btrim(label)) between 1 and 100),
  sort_order integer not null default 0 check (sort_order between 0 and 1000)
);
insert into shagun.facilities (code, label, sort_order) values
  ('ac', 'Air conditioning', 0), ('parking', 'Parking', 1), ('rooms', 'Guest rooms', 2),
  ('catering', 'Catering', 3), ('decoration', 'Decoration', 4), ('kitchen', 'Kitchen', 5),
  ('power_backup', 'Power backup', 6), ('lift', 'Lift', 7), ('accessible_entry', 'Accessible entry', 8);

create table shagun.venue_facilities (
  venue_id uuid not null references shagun.venues(id) on delete cascade,
  facility_code text not null references shagun.facilities(code) on delete restrict,
  primary key (venue_id, facility_code)
);
create index venue_facilities_code_idx on shagun.venue_facilities (facility_code, venue_id);

create table shagun.admin_users (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 100),
  is_active boolean not null default true,
  created_at timestamptz not null default transaction_timestamp()
);

create table shagun.venue_research (
  venue_id uuid primary key references shagun.venues(id) on delete cascade,
  source_notes text not null default '' check (source_notes = btrim(source_notes) and char_length(source_notes) <= 8000),
  reviewed_at timestamptz,
  reviewed_by uuid references shagun.admin_users(id) on delete restrict,
  updated_at timestamptz not null default transaction_timestamp(),
  check ((reviewed_at is null) = (reviewed_by is null)),
  check (reviewed_at is null or (isfinite(reviewed_at) and reviewed_at <= transaction_timestamp() and char_length(btrim(source_notes)) > 0))
);

create table shagun.media_assets (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid references shagun.venues(id) on delete cascade,
  city_id uuid references shagun.cities(id) on delete cascade,
  storage_key text not null unique check (storage_key ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  alt_text text not null check (char_length(btrim(alt_text)) between 5 and 250),
  credit text not null check (char_length(btrim(credit)) between 5 and 300),
  width integer not null check (width between 1 and 20000),
  height integer not null check (height between 1 and 20000),
  sort_order integer not null default 0 check (sort_order between 0 and 1000000),
  is_cover boolean not null default false,
  created_at timestamptz not null default transaction_timestamp(),
  check ((venue_id is not null) <> (city_id is not null))
);
create unique index media_venue_cover_idx on shagun.media_assets (venue_id) where is_cover and venue_id is not null;
create unique index media_city_cover_idx on shagun.media_assets (city_id) where is_cover and city_id is not null;
create index media_venue_order_idx on shagun.media_assets (venue_id, sort_order, id);
create index media_city_order_idx on shagun.media_assets (city_id, sort_order, id);

create table shagun.storage_cleanup_jobs (
  id uuid primary key default gen_random_uuid(),
  storage_key text not null unique check (storage_key ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  created_at timestamptz not null default transaction_timestamp()
);
create index storage_cleanup_created_idx on shagun.storage_cleanup_jobs (created_at, id);

create table shagun.rate_limits (
  key text primary key check (key ~ '^[A-Za-z0-9:_-]{1,200}$'),
  hits integer not null check (hits between 1 and 10001),
  resets_at timestamptz not null check (isfinite(resets_at))
);
create index rate_limits_expiry_idx on shagun.rate_limits (resets_at, key);

create table shagun.analytics_daily (
  day date not null,
  event text not null check (event in ('city_viewed', 'venue_viewed', 'search_performed', 'filter_used', 'phone_clicked', 'whatsapp_clicked')),
  city_id uuid not null references shagun.cities(id) on delete cascade,
  venue_key text not null default '' check (venue_key = '' or venue_key ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  count bigint not null default 1 check (count > 0),
  primary key (day, event, city_id, venue_key),
  check (event not in ('venue_viewed', 'phone_clicked', 'whatsapp_clicked') or venue_key <> '')
);
create index analytics_city_day_idx on shagun.analytics_daily (city_id, day desc);

-- The owner bypasses admin_users RLS here. Never query the allowlist through its
-- own self-only policy to decide membership (that creates recursive policies).
create function shagun.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from shagun.admin_users a where a.id = auth.uid() and a.is_active);
$$;

create function shagun_private.require_admin()
returns void language plpgsql stable security invoker set search_path = '' as $$
begin
  if not shagun.is_admin() then
    raise exception using errcode = '42501', message = 'admin_required';
  end if;
end;
$$;

-- Trigger-only functions are not executable by JWT roles. Definer privileges
-- are confined to row invariants, review invalidation and the deletion outbox.
create function shagun_private.enforce_city()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'active' then
      raise exception using errcode = '23514', message = 'deactivate_before_delete';
    end if;
    return old;
  end if;
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id then
      raise exception using errcode = '23514', message = 'immutable_id';
    end if;
    if old.launched_at is not null and new.slug is distinct from old.slug then
      raise exception using errcode = '23514', message = 'city_slug_locked';
    end if;
    new.created_at := old.created_at;
    new.launched_at := old.launched_at;
  else
    new.created_at := transaction_timestamp();
    new.launched_at := null;
  end if;
  new.updated_at := transaction_timestamp();
  if new.status = 'active' and (tg_op = 'INSERT' or old.status <> 'active') then
    if not exists (select 1 from shagun.venues v where v.city_id = new.id and v.status = 'published') then
      raise exception using errcode = '23514', message = 'city_requires_published_venue';
    end if;
  end if;
  if new.status = 'active' then
    new.launched_at := coalesce(new.launched_at, transaction_timestamp());
  end if;
  return new;
end;
$$;
create trigger cities_invariants before insert or update or delete on shagun.cities
  for each row execute function shagun_private.enforce_city();

create function shagun_private.enforce_venue()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  review_time timestamptz;
  reviewer uuid;
begin
  if tg_op = 'DELETE' then
    if old.status = 'published' then
      raise exception using errcode = '23514', message = 'unpublish_before_delete';
    end if;
    return old;
  end if;
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id then
      raise exception using errcode = '23514', message = 'immutable_id';
    end if;
    if old.published_at is not null and (new.slug is distinct from old.slug or new.city_id is distinct from old.city_id) then
      raise exception using errcode = '23514', message = 'venue_url_locked';
    end if;
    new.created_at := old.created_at;
    new.published_at := old.published_at;
    if row(new.city_id, new.name, new.slug, new.description, new.venue_type, new.address, new.locality,
           new.phone, new.alternate_phone, new.whatsapp, new.email, new.capacity_min, new.capacity_max,
           new.price_min, new.price_max, new.price_type, new.latitude, new.longitude)
       is distinct from
       row(old.city_id, old.name, old.slug, old.description, old.venue_type, old.address, old.locality,
           old.phone, old.alternate_phone, old.whatsapp, old.email, old.capacity_min, old.capacity_max,
           old.price_min, old.price_max, old.price_type, old.latitude, old.longitude) then
      update shagun.venue_research set reviewed_at = null, reviewed_by = null where venue_id = old.id;
    end if;
  else
    new.created_at := transaction_timestamp();
    new.published_at := null;
  end if;
  new.updated_at := transaction_timestamp();
  if new.status = 'published' or new.verification_status = 'verified' then
    select r.reviewed_at, r.reviewed_by into review_time, reviewer
    from shagun.venue_research r join shagun.admin_users a on a.id = r.reviewed_by and a.is_active
    where r.venue_id = new.id and nullif(btrim(r.source_notes), '') is not null;
    if review_time is null then
      raise exception using errcode = '23514', message = 'editorial_review_required';
    end if;
    if new.verification_status = 'verified'
       and (tg_op = 'INSERT' or new.verification_status is distinct from old.verification_status or new.verified_at is distinct from old.verified_at)
       and (review_time is distinct from transaction_timestamp() or reviewer is distinct from auth.uid()) then
      raise exception using errcode = '23514', message = 'verification_requires_fresh_review';
    end if;
  end if;
  if new.status = 'published' then
    new.published_at := coalesce(new.published_at, transaction_timestamp());
  end if;
  return new;
end;
$$;
create trigger venues_invariants before insert or update or delete on shagun.venues
  for each row execute function shagun_private.enforce_venue();

create function shagun_private.enforce_research()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.venue_id is distinct from old.venue_id then
      raise exception using errcode = '23514', message = 'immutable_owner';
    end if;
    -- Changing notes alone is not an assertion of a new editorial review.
    if new.source_notes is distinct from old.source_notes
       and new.reviewed_at is not distinct from old.reviewed_at
       and new.reviewed_by is not distinct from old.reviewed_by then
      new.reviewed_at := null;
      new.reviewed_by := null;
    end if;
  end if;
  if new.reviewed_at is not null and
     (tg_op = 'INSERT' or new.reviewed_at is distinct from old.reviewed_at or new.reviewed_by is distinct from old.reviewed_by) then
    if not shagun.is_admin() or new.reviewed_by is distinct from auth.uid() then
      raise exception using errcode = '42501', message = 'reviewer_must_be_current_admin';
    end if;
    new.reviewed_at := transaction_timestamp();
  end if;
  new.updated_at := transaction_timestamp();
  return new;
end;
$$;
create trigger research_invariants before insert or update on shagun.venue_research
  for each row execute function shagun_private.enforce_research();

create function shagun_private.research_changed()
returns trigger language plpgsql security definer set search_path = '' as $$
declare owner_id uuid;
begin
  owner_id := case when tg_op = 'DELETE' then old.venue_id else new.venue_id end;
  -- Nested invalidation originates in the venue guard; it checks the NEW venue
  -- state itself. Updating that same row here would recurse. FK cascade deletion
  -- also has no surviving parent to touch.
  if pg_trigger_depth() = 1 then
    update shagun.venues set updated_at = transaction_timestamp() where id = owner_id;
  end if;
  return null;
end;
$$;
create trigger research_parent_changed after insert or update or delete on shagun.venue_research
  for each row execute function shagun_private.research_changed();

create function shagun_private.facilities_changing()
returns trigger language plpgsql security definer set search_path = '' as $$
declare owner_id uuid; parent shagun.venues;
begin
  owner_id := case when tg_op = 'DELETE' then old.venue_id else new.venue_id end;
  if tg_op = 'UPDATE' then
    if new.venue_id is distinct from old.venue_id then
      raise exception using errcode = '23514', message = 'immutable_owner';
    end if;
    if new.facility_code is not distinct from old.facility_code then return new; end if;
  end if;
  select * into parent from shagun.venues where id = owner_id for update;
  if found then
    if parent.status = 'published' or parent.verification_status = 'verified' then
      raise exception using errcode = '23514', message = 'save_facilities_with_editorial_review';
    end if;
    update shagun.venue_research set reviewed_at = null, reviewed_by = null where venue_id = owner_id;
    update shagun.venues set updated_at = transaction_timestamp() where id = owner_id;
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;
create trigger facilities_parent_changing before insert or update or delete on shagun.venue_facilities
  for each row execute function shagun_private.facilities_changing();

create function shagun_private.media_changing()
returns trigger language plpgsql security definer set search_path = '' as $$
declare owner_venue uuid; owner_city uuid; photo_count integer;
begin
  owner_venue := case when tg_op = 'DELETE' then old.venue_id else new.venue_id end;
  owner_city := case when tg_op = 'DELETE' then old.city_id else new.city_id end;
  if tg_op = 'UPDATE' then
    if row(new.id, new.venue_id, new.city_id, new.storage_key) is distinct from row(old.id, old.venue_id, old.city_id, old.storage_key) then
      raise exception using errcode = '23514', message = 'immutable_media_identity';
    end if;
    new.created_at := old.created_at;
  end if;
  -- All photo writes, including direct REST inserts, serialize on the owner.
  if owner_venue is not null then
    perform 1 from shagun.venues where id = owner_venue for update;
  elsif owner_city is not null then
    perform 1 from shagun.cities where id = owner_city for update;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  if tg_op = 'INSERT' then
    if exists (select 1 from shagun.storage_cleanup_jobs where storage_key = new.storage_key) then
      raise exception using errcode = '23514', message = 'storage_key_pending_cleanup';
    end if;
    select count(*)::integer into photo_count from shagun.media_assets m
    where (owner_venue is not null and m.venue_id = owner_venue) or (owner_city is not null and m.city_id = owner_city);
    if photo_count >= (case when owner_venue is not null then 24 else 1 end) then
      raise exception using errcode = '23514', message = 'photo_limit';
    end if;
    new.created_at := transaction_timestamp();
    new.sort_order := coalesce((select max(m.sort_order) + 1 from shagun.media_assets m
      where (owner_venue is not null and m.venue_id = owner_venue) or (owner_city is not null and m.city_id = owner_city)), 0);
    if photo_count = 0 then new.is_cover := true; end if;
  end if;
  if new.is_cover then
    update shagun.media_assets m set is_cover = false
    where m.id <> new.id and m.is_cover
      and ((owner_venue is not null and m.venue_id = owner_venue) or (owner_city is not null and m.city_id = owner_city));
  end if;
  return new;
end;
$$;
create trigger media_parent_lock before insert or update or delete on shagun.media_assets
  for each row execute function shagun_private.media_changing();

create function shagun_private.media_changed()
returns trigger language plpgsql security definer set search_path = '' as $$
declare owner_venue uuid; owner_city uuid; replacement uuid;
begin
  owner_venue := case when tg_op = 'DELETE' then old.venue_id else new.venue_id end;
  owner_city := case when tg_op = 'DELETE' then old.city_id else new.city_id end;
  if tg_op = 'DELETE' then
    insert into shagun.storage_cleanup_jobs (storage_key) values (old.storage_key) on conflict (storage_key) do nothing;
    if old.is_cover then
      select m.id into replacement from shagun.media_assets m
      where (owner_venue is not null and m.venue_id = owner_venue) or (owner_city is not null and m.city_id = owner_city)
      order by m.sort_order, m.id limit 1;
      if replacement is not null then update shagun.media_assets set is_cover = true where id = replacement; end if;
    end if;
  end if;
  if owner_venue is not null then
    update shagun.venues set updated_at = transaction_timestamp() where id = owner_venue;
  else
    update shagun.cities set updated_at = transaction_timestamp() where id = owner_city;
  end if;
  return null;
end;
$$;
create trigger media_parent_changed after insert or update or delete on shagun.media_assets
  for each row execute function shagun_private.media_changed();

-- Explicit table ACLs first: do not inherit Supabase's broad default grants.
revoke all on table shagun.cities, shagun.venues, shagun.facilities, shagun.venue_facilities,
  shagun.venue_research, shagun.media_assets, shagun.admin_users, shagun.storage_cleanup_jobs,
  shagun.rate_limits, shagun.analytics_daily from public, anon, authenticated, service_role;
grant select on shagun.cities, shagun.venues, shagun.facilities, shagun.venue_facilities, shagun.media_assets to anon, authenticated;
grant insert, update, delete on shagun.cities, shagun.venues, shagun.venue_facilities, shagun.media_assets to authenticated;
grant select, insert, update, delete on shagun.venue_research to authenticated;
grant select on shagun.admin_users, shagun.analytics_daily to authenticated;
grant select, delete on shagun.storage_cleanup_jobs to authenticated;
grant all on shagun.cities, shagun.venues, shagun.facilities, shagun.venue_facilities, shagun.venue_research,
  shagun.media_assets, shagun.admin_users, shagun.storage_cleanup_jobs, shagun.rate_limits, shagun.analytics_daily to service_role;

alter table shagun.cities enable row level security;
alter table shagun.venues enable row level security;
alter table shagun.facilities enable row level security;
alter table shagun.venue_facilities enable row level security;
alter table shagun.venue_research enable row level security;
alter table shagun.media_assets enable row level security;
alter table shagun.admin_users enable row level security;
alter table shagun.storage_cleanup_jobs enable row level security;
alter table shagun.rate_limits enable row level security;
alter table shagun.analytics_daily enable row level security;

create policy cities_public_read on shagun.cities for select to anon, authenticated using (status = 'active');
create policy cities_admin on shagun.cities for all to authenticated using ((select shagun.is_admin())) with check ((select shagun.is_admin()));
create policy venues_public_read on shagun.venues for select to anon, authenticated using (
  status = 'published' and exists (select 1 from shagun.cities c where c.id = city_id and c.status = 'active')
);
create policy venues_admin on shagun.venues for all to authenticated using ((select shagun.is_admin())) with check ((select shagun.is_admin()));
create policy venue_facilities_public_read on shagun.venue_facilities for select to anon, authenticated using (
  exists (select 1 from shagun.venues v join shagun.cities c on c.id = v.city_id
    where v.id = venue_id and v.status = 'published' and c.status = 'active')
);
create policy venue_facilities_admin on shagun.venue_facilities for all to authenticated using ((select shagun.is_admin())) with check ((select shagun.is_admin()));
create policy facilities_public_read on shagun.facilities for select to anon, authenticated using (
  exists (select 1 from shagun.venue_facilities vf where vf.facility_code = code)
);
create policy facilities_admin_read on shagun.facilities for select to authenticated using ((select shagun.is_admin()));
create policy media_public_read on shagun.media_assets for select to anon, authenticated using (
  (venue_id is not null and exists (select 1 from shagun.venues v join shagun.cities c on c.id = v.city_id
    where v.id = venue_id and v.status = 'published' and c.status = 'active'))
  or (city_id is not null and exists (select 1 from shagun.cities c where c.id = city_id and c.status = 'active'))
);
create policy media_admin on shagun.media_assets for all to authenticated using ((select shagun.is_admin())) with check ((select shagun.is_admin()));
create policy research_admin on shagun.venue_research for all to authenticated using ((select shagun.is_admin())) with check ((select shagun.is_admin()));
create policy admin_self_read on shagun.admin_users for select to authenticated using (id = (select auth.uid()));
create policy cleanup_admin_read on shagun.storage_cleanup_jobs for select to authenticated using ((select shagun.is_admin()));
create policy cleanup_admin_delete on shagun.storage_cleanup_jobs for delete to authenticated using ((select shagun.is_admin()));
create policy analytics_admin_read on shagun.analytics_daily for select to authenticated using ((select shagun.is_admin()));
-- rate_limits intentionally has NO JWT policy; service_role is the only caller.

-- RPCs and their narrowly scoped grants share the executor-owned transaction.

create function shagun_private.check_page(p_query text, p_page integer, p_limit integer)
returns void language plpgsql immutable security invoker set search_path = '' as $$
begin
  if p_query is null or char_length(p_query) > 100
     or p_page is null or p_page not between 1 and 1000
     or p_limit is null or p_limit not between 1 and 25 then
    raise exception using errcode = '22023', message = 'invalid_pagination_or_query';
  end if;
end;
$$;

-- Lexemes, not user tsquery syntax, form the query. Apostrophes/operators never
-- become SQL, tsquery operators supplied by the user, or wildcard LIKE patterns.
create function shagun_private.prefix_query(p_query text)
returns tsquery language sql immutable security invoker set search_path = '' as $$
  select to_tsquery('pg_catalog.simple'::regconfig,
    string_agg(quote_literal(term) || ':*', ' & ' order by term))
  from unnest(tsvector_to_array(to_tsvector('pg_catalog.simple'::regconfig, p_query))) terms(term);
$$;

create function shagun_private.needs_review(p_venue shagun.venues)
returns boolean language sql stable security invoker set search_path = '' as $$
  select p_venue.status <> 'archived' and (p_venue.verification_status <> 'verified'
    or p_venue.verified_at is null or p_venue.verified_at < transaction_timestamp() - interval '90 days');
$$;

create function shagun.venue_document(p_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select (to_jsonb(v) - 'search_document') || jsonb_build_object(
    'city', (select to_jsonb(c) from shagun.cities c where c.id = v.city_id),
    'photos', coalesce((select jsonb_agg(to_jsonb(m) order by m.is_cover desc, m.sort_order, m.id)
      from shagun.media_assets m where m.venue_id = v.id), '[]'::jsonb),
    'facilities', coalesce((select jsonb_agg(vf.facility_code order by vf.facility_code)
      from shagun.venue_facilities vf where vf.venue_id = v.id), '[]'::jsonb)
  ) from shagun.venues v where v.id = p_id;
$$;

create function shagun_private.city_summary(p_city shagun.cities, p_public boolean)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select to_jsonb(p_city) || jsonb_build_object(
    'published_count', count(*) filter (where v.status = 'published'),
    'total_count', count(*),
    'draft_count', case when p_public then 0 else count(*) filter (where v.status = 'draft') end,
    'review_count', case when p_public then 0 else count(*) filter (where shagun_private.needs_review(v)) end,
    'cover', case when p_public and p_city.status <> 'active' then null else
      (select to_jsonb(m) from shagun.media_assets m where m.city_id = p_city.id
       order by m.is_cover desc, m.sort_order, m.id limit 1) end
  ) from shagun.venues v where v.city_id = p_city.id
    and (not p_public or (v.status = 'published' and p_city.status = 'active'));
$$;

create function shagun.public_cities(p_query text default '', p_page integer default 1, p_limit integer default 24)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare query_terms tsquery; result jsonb;
begin
  perform shagun_private.check_page(p_query, p_page, p_limit);
  query_terms := shagun_private.prefix_query(p_query);
  with matching as materialized (
    select c.* from shagun.cities c where c.status = 'active'
      and (btrim(p_query) = '' or to_tsvector('pg_catalog.simple'::regconfig, c.name || ' ' || c.state) @@ query_terms)
  ), page_rows as (
    select c.id, lower(c.name) as name, shagun_private.city_summary(c, true) as document
    from shagun.cities c join matching m on m.id = c.id
    order by lower(c.name), c.id limit p_limit offset (p_page - 1) * p_limit
  )
  select jsonb_build_object('total', (select count(*) from matching),
    'items', coalesce((select jsonb_agg(p.document order by p.name, p.id) from page_rows p), '[]'::jsonb)) into result;
  return result;
end;
$$;

create function shagun.search_venues(
  p_city uuid default null, p_query text default '', p_capacity integer default null,
  p_budget numeric default null, p_price_type text default null, p_facilities text[] default '{}',
  p_type text default null, p_sort text default 'recent', p_page integer default 1, p_limit integer default 12
)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare query_terms tsquery; result jsonb;
begin
  perform shagun_private.check_page(p_query, p_page, p_limit);
  if p_sort is null or p_sort not in ('recent', 'name', 'capacity', 'price')
    or (p_type is not null and p_type not in ('vivah_bhawan', 'banquet_hall', 'community_hall', 'wedding_lawn', 'hotel', 'resort'))
    or (p_price_type is not null and p_price_type not in ('per_day', 'per_event', 'per_plate'))
    or (p_capacity is not null and p_capacity not between 1 and 100000)
    or (p_budget is not null and p_budget not between 1 and 100000000)
    or ((p_budget is not null or p_sort = 'price') and p_price_type is null)
    or p_facilities is null or cardinality(p_facilities) > 9
    or exists (select 1 from unnest(p_facilities) f(code) where f.code is null or f.code not in
      ('ac', 'parking', 'rooms', 'catering', 'decoration', 'kitchen', 'power_backup', 'lift', 'accessible_entry')) then
    raise exception using errcode = '22023', message = 'invalid_search_filters';
  end if;
  query_terms := shagun_private.prefix_query(p_query);
  -- This explicit public predicate is NOT widened for admin JWTs or BYPASSRLS.
  -- Count and page consume the exact same statement-snapshot candidate set.
  with matching as materialized (
    select v.* from shagun.venues v join shagun.cities c on c.id = v.city_id
    where v.status = 'published' and c.status = 'active'
      and (p_city is null or v.city_id = p_city)
      and (btrim(p_query) = '' or v.search_document @@ query_terms
        or to_tsvector('pg_catalog.simple'::regconfig, c.name || ' ' || c.state) @@ query_terms)
      and (p_capacity is null or v.capacity_max >= p_capacity)
      and (p_price_type is null or v.price_type = p_price_type)
      and (p_budget is null or coalesce(v.price_min, v.price_max) <= p_budget)
      and (p_type is null or v.venue_type = p_type)
      and not exists (select 1 from unnest(p_facilities) requested(code)
        where not exists (select 1 from shagun.venue_facilities vf where vf.venue_id = v.id and vf.facility_code = requested.code))
  ), ordered as (
    select m.id, row_number() over (order by
      case when p_sort = 'name' then lower(m.name) end asc nulls last,
      case when p_sort = 'capacity' then m.capacity_max end asc nulls last,
      case when p_sort = 'price' then coalesce(m.price_min, m.price_max) end asc nulls last,
      case when p_sort = 'recent' then m.updated_at end desc nulls last, m.id) as ordinal
    from matching m
  ), page_rows as (
    select * from ordered order by ordinal limit p_limit offset (p_page - 1) * p_limit
  )
  select jsonb_build_object('total', (select count(*) from matching), 'page', p_page, 'pageSize', p_limit,
    'items', coalesce((select jsonb_agg(shagun.venue_document(p.id) order by p.ordinal) from page_rows p), '[]'::jsonb)) into result;
  return result;
end;
$$;

create function shagun.city_facets(p_city uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with visible as materialized (
    select v.* from shagun.venues v join shagun.cities c on c.id = v.city_id
    where v.city_id = p_city and v.status = 'published' and c.status = 'active'
  )
  select jsonb_build_object(
    'facilities', coalesce((select jsonb_agg(f.code order by f.code) from (
      select distinct vf.facility_code as code from shagun.venue_facilities vf join visible v on v.id = vf.venue_id
    ) f), '[]'::jsonb),
    'venueTypes', coalesce((select jsonb_agg(t.venue_type order by t.venue_type) from (select distinct venue_type from visible) t), '[]'::jsonb),
    'hasCapacity', exists (select 1 from visible where capacity_max > 0),
    'priceTypes', coalesce((select jsonb_agg(p.price_type order by p.price_type) from (
      select distinct price_type from visible where price_type is not null and coalesce(price_min, price_max) > 0
    ) p), '[]'::jsonb)
  );
$$;

create function shagun.admin_city_summaries(p_query text default '', p_page integer default 1, p_limit integer default 25)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare query_terms tsquery; result jsonb;
begin
  perform shagun_private.require_admin();
  perform shagun_private.check_page(p_query, p_page, p_limit);
  query_terms := shagun_private.prefix_query(p_query);
  with matching as materialized (
    select c.id from shagun.cities c where btrim(p_query) = ''
      or to_tsvector('pg_catalog.simple'::regconfig, c.name || ' ' || c.state) @@ query_terms
  ), page_rows as (
    select c.id, lower(c.name) as name, shagun_private.city_summary(c, false) as document
    from shagun.cities c join matching m on m.id = c.id
    order by lower(c.name), c.id limit p_limit offset (p_page - 1) * p_limit
  )
  select jsonb_build_object('total', (select count(*) from matching),
    'items', coalesce((select jsonb_agg(p.document order by p.name, p.id) from page_rows p), '[]'::jsonb)) into result;
  return result;
end;
$$;

create function shagun.admin_venues(p_city uuid default null, p_query text default '', p_status text default '', p_page integer default 1)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare query_terms tsquery; result jsonb;
begin
  perform shagun_private.require_admin();
  perform shagun_private.check_page(p_query, p_page, 25);
  if p_status is null or p_status not in ('', 'draft', 'published', 'unpublished', 'archived', 'needs_review') then
    raise exception using errcode = '22023', message = 'invalid_venue_status';
  end if;
  query_terms := shagun_private.prefix_query(p_query);
  with matching as materialized (
    select v.* from shagun.venues v join shagun.cities c on c.id = v.city_id
    where (p_city is null or v.city_id = p_city)
      and (p_status = '' or (p_status = 'needs_review' and shagun_private.needs_review(v)) or v.status = p_status)
      and (btrim(p_query) = '' or v.search_document @@ query_terms
        or to_tsvector('pg_catalog.simple'::regconfig, c.name || ' ' || c.state) @@ query_terms)
  ), page_rows as (
    select id, updated_at from matching order by updated_at desc, id limit 25 offset (p_page - 1) * 25
  )
  select jsonb_build_object('total', (select count(*) from matching), 'page', p_page, 'pageSize', 25,
    'items', coalesce((select jsonb_agg(shagun.venue_document(p.id) order by p.updated_at desc, p.id) from page_rows p), '[]'::jsonb)) into result;
  return result;
end;
$$;

create function shagun.admin_dashboard()
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare result jsonb;
begin
  perform shagun_private.require_admin();
  select jsonb_build_object(
    'totalCities', (select count(*) from shagun.cities),
    'activeCities', (select count(*) from shagun.cities where status = 'active'),
    'totalVenues', count(*),
    'publishedVenues', count(*) filter (where v.status = 'published'),
    'draftVenues', count(*) filter (where v.status = 'draft'),
    'reviewVenues', count(*) filter (where shagun_private.needs_review(v)),
    'cities', (shagun.admin_city_summaries('', 1, 25) -> 'items'),
    'recentVenues', coalesce((select jsonb_agg(shagun.venue_document(r.id) order by r.updated_at desc, r.id)
      from (select id, updated_at from shagun.venues order by updated_at desc, id limit 8) r), '[]'::jsonb),
    'cleanupCount', (select count(*) from shagun.storage_cleanup_jobs)
  ) into result from shagun.venues v;
  return result;
end;
$$;

create function shagun_private.iso_timestamp(p_value text)
returns timestamptz language plpgsql stable security invoker set search_path = '' as $$
begin
  if p_value is null or p_value = '' then return null; end if;
  if p_value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}(T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2}))?$' then
    raise exception using errcode = '22007', message = 'iso_date_required';
  end if;
  if char_length(p_value) = 10 then return p_value::date::timestamp at time zone 'UTC'; end if;
  return p_value::timestamptz;
end;
$$;

create function shagun.save_city(p_data jsonb, p_id uuid default null, p_expected timestamptz default null)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare previous shagun.cities; result uuid;
begin
  perform shagun_private.require_admin();
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception using errcode = '22023', message = 'object_required';
  end if;
  if p_id is null then
    insert into shagun.cities (name, slug, state, country, description, status, seo_title, seo_description, metadata)
    values (btrim(p_data ->> 'name'), p_data ->> 'slug', btrim(p_data ->> 'state'), coalesce(btrim(p_data ->> 'country'), 'India'),
      nullif(btrim(p_data ->> 'description'), ''), coalesce(p_data ->> 'status', 'draft'),
      nullif(btrim(p_data ->> 'seo_title'), ''), nullif(btrim(p_data ->> 'seo_description'), ''), coalesce(p_data -> 'metadata', '{}'::jsonb))
    returning id into result;
  else
    select * into previous from shagun.cities where id = p_id for update;
    if not found then raise exception using errcode = 'P0002', message = 'not_found'; end if;
    if p_expected is null or previous.updated_at is distinct from p_expected then
      raise exception using errcode = 'P0001', message = 'conflict';
    end if;
    update shagun.cities set name = btrim(p_data ->> 'name'), slug = p_data ->> 'slug', state = btrim(p_data ->> 'state'),
      country = coalesce(btrim(p_data ->> 'country'), 'India'), description = nullif(btrim(p_data ->> 'description'), ''),
      status = coalesce(p_data ->> 'status', 'draft'), seo_title = nullif(btrim(p_data ->> 'seo_title'), ''),
      seo_description = nullif(btrim(p_data ->> 'seo_description'), ''), metadata = coalesce(p_data -> 'metadata', '{}'::jsonb)
    where id = p_id returning id into result;
  end if;
  return result;
end;
$$;

create function shagun.save_venue(p_data jsonb, p_id uuid default null, p_expected timestamptz default null)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  previous shagun.venues;
  result uuid;
  target_status text;
  target_verification text;
  check_date timestamptz;
  is_reviewed boolean;
  notes text;
  facility_list text[];
begin
  perform shagun_private.require_admin();
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception using errcode = '22023', message = 'object_required';
  end if;
  if p_id is not null then
    select * into previous from shagun.venues where id = p_id for update;
    if not found then raise exception using errcode = 'P0002', message = 'not_found'; end if;
    if p_expected is null or previous.updated_at is distinct from p_expected then
      raise exception using errcode = 'P0001', message = 'conflict';
    end if;
  end if;
  if (p_data ? 'reviewed' and jsonb_typeof(p_data -> 'reviewed') <> 'boolean')
     or (p_data ? 'verified_at' and jsonb_typeof(p_data -> 'verified_at') not in ('string', 'null'))
     or jsonb_typeof(coalesce(p_data -> 'facilities', '[]'::jsonb)) <> 'array' then
    raise exception using errcode = '22023', message = 'invalid_review_or_facilities';
  end if;
  if jsonb_array_length(coalesce(p_data -> 'facilities', '[]'::jsonb)) > 9
     or exists (select 1 from jsonb_array_elements(coalesce(p_data -> 'facilities', '[]'::jsonb)) f(value)
       where jsonb_typeof(f.value) <> 'string' or f.value #>> '{}' not in
         ('ac', 'parking', 'rooms', 'catering', 'decoration', 'kitchen', 'power_backup', 'lift', 'accessible_entry')) then
    raise exception using errcode = '22023', message = 'invalid_facilities';
  end if;
  select coalesce(array_agg(distinct f.code order by f.code), '{}'::text[]) into facility_list
  from jsonb_array_elements_text(coalesce(p_data -> 'facilities', '[]'::jsonb)) f(code);
  target_status := coalesce(p_data ->> 'status', 'draft');
  target_verification := coalesce(p_data ->> 'verification_status', 'unverified');
  check_date := shagun_private.iso_timestamp(p_data ->> 'verified_at');
  is_reviewed := coalesce((p_data ->> 'reviewed')::boolean, false);
  notes := btrim(coalesce(p_data ->> 'source_notes', ''));
  if (target_status = 'published' or target_verification = 'verified') and (not is_reviewed or notes = '') then
    raise exception using errcode = '23514', message = 'editorial_review_required';
  end if;
  -- No supplied ID, generated column, first-publication stamp, audit timestamp or
  -- reviewer is assigned from p_data. The whitelist below is intentionally explicit.
  if p_id is null then
    insert into shagun.venues (city_id, name, slug, description, venue_type, address, locality, phone, alternate_phone,
      whatsapp, email, capacity_min, capacity_max, price_min, price_max, price_type, latitude, longitude,
      status, verification_status, verified_at, seo_title, seo_description)
    values ((p_data ->> 'city_id')::uuid, btrim(p_data ->> 'name'), p_data ->> 'slug', nullif(btrim(p_data ->> 'description'), ''),
      p_data ->> 'venue_type', nullif(btrim(p_data ->> 'address'), ''), nullif(btrim(p_data ->> 'locality'), ''),
      nullif(p_data ->> 'phone', ''), nullif(p_data ->> 'alternate_phone', ''), nullif(p_data ->> 'whatsapp', ''), nullif(p_data ->> 'email', ''),
      nullif(p_data ->> 'capacity_min', '')::integer, nullif(p_data ->> 'capacity_max', '')::integer,
      nullif(p_data ->> 'price_min', '')::numeric, nullif(p_data ->> 'price_max', '')::numeric, nullif(p_data ->> 'price_type', ''),
      nullif(p_data ->> 'latitude', '')::numeric, nullif(p_data ->> 'longitude', '')::numeric,
      'draft', 'unverified', check_date, nullif(btrim(p_data ->> 'seo_title'), ''), nullif(btrim(p_data ->> 'seo_description'), ''))
    returning id into result;
  else
    result := p_id;
    -- The temporary draft is invisible outside this transaction and NEVER clears
    -- published_at. It allows multi-table review/facility changes before validation.
    update shagun.venues set city_id = (p_data ->> 'city_id')::uuid, name = btrim(p_data ->> 'name'), slug = p_data ->> 'slug',
      description = nullif(btrim(p_data ->> 'description'), ''), venue_type = p_data ->> 'venue_type',
      address = nullif(btrim(p_data ->> 'address'), ''), locality = nullif(btrim(p_data ->> 'locality'), ''),
      phone = nullif(p_data ->> 'phone', ''), alternate_phone = nullif(p_data ->> 'alternate_phone', ''),
      whatsapp = nullif(p_data ->> 'whatsapp', ''), email = nullif(p_data ->> 'email', ''),
      capacity_min = nullif(p_data ->> 'capacity_min', '')::integer, capacity_max = nullif(p_data ->> 'capacity_max', '')::integer,
      price_min = nullif(p_data ->> 'price_min', '')::numeric, price_max = nullif(p_data ->> 'price_max', '')::numeric,
      price_type = nullif(p_data ->> 'price_type', ''), latitude = nullif(p_data ->> 'latitude', '')::numeric,
      longitude = nullif(p_data ->> 'longitude', '')::numeric, status = 'draft', verification_status = 'unverified', verified_at = check_date,
      seo_title = nullif(btrim(p_data ->> 'seo_title'), ''), seo_description = nullif(btrim(p_data ->> 'seo_description'), '')
    where id = result;
  end if;
  delete from shagun.venue_facilities vf where vf.venue_id = result and not (vf.facility_code = any(facility_list));
  insert into shagun.venue_facilities (venue_id, facility_code)
    select result, f.code from unnest(facility_list) f(code)
    where not exists (select 1 from shagun.venue_facilities vf where vf.venue_id = result and vf.facility_code = f.code);
  -- Review follows facilities: facility changes deliberately invalidate old review.
  insert into shagun.venue_research (venue_id, source_notes, reviewed_at, reviewed_by)
    values (result, notes, case when is_reviewed then transaction_timestamp() else null end, case when is_reviewed then auth.uid() else null end)
  on conflict (venue_id) do update set source_notes = excluded.source_notes,
    reviewed_at = excluded.reviewed_at, reviewed_by = excluded.reviewed_by;
  update shagun.venues set status = target_status, verification_status = target_verification, verified_at = check_date where id = result;
  return result;
end;
$$;

create function shagun.delete_record(p_kind text, p_id uuid, p_name text, p_expected timestamptz)
returns void language plpgsql security invoker set search_path = '' as $$
declare record_name text; record_time timestamptz; record_status text;
begin
  perform shagun_private.require_admin();
  if p_kind = 'city' then
    select name, updated_at, status into record_name, record_time, record_status from shagun.cities where id = p_id for update;
  elsif p_kind = 'venue' then
    select name, updated_at, status into record_name, record_time, record_status from shagun.venues where id = p_id for update;
  else
    raise exception using errcode = '22023', message = 'invalid_record_kind';
  end if;
  if record_name is null then raise exception using errcode = 'P0002', message = 'not_found'; end if;
  if p_expected is null or p_expected is distinct from record_time then
    raise exception using errcode = 'P0001', message = 'conflict';
  end if;
  if p_name is distinct from record_name then raise exception using errcode = '23514', message = 'name_mismatch'; end if;
  if record_status in ('active', 'published') then raise exception using errcode = '23514', message = 'unpublish_before_delete'; end if;
  if p_kind = 'city' then
    delete from shagun.cities where id = p_id; -- FK RESTRICT, including draft venues.
  else
    delete from shagun.venues where id = p_id; -- Cascades transactionally queue media.
  end if;
end;
$$;

create function shagun.update_photo(p_id uuid, p_operation text, p_alt text default '', p_credit text default '')
returns void language plpgsql security invoker set search_path = '' as $$
declare photo shagun.media_assets; adjacent_id uuid; adjacent_order integer;
begin
  perform shagun_private.require_admin();
  if p_operation is null or p_operation not in ('cover', 'up', 'down', 'metadata') then
    raise exception using errcode = '22023', message = 'invalid_photo_operation';
  end if;
  select * into photo from shagun.media_assets where id = p_id;
  if not found then raise exception using errcode = 'P0002', message = 'not_found'; end if;
  if photo.venue_id is not null then
    perform 1 from shagun.venues where id = photo.venue_id for update;
  else
    perform 1 from shagun.cities where id = photo.city_id for update;
  end if;
  select * into photo from shagun.media_assets where id = p_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'not_found'; end if;
  if p_operation = 'metadata' then
    update shagun.media_assets set alt_text = btrim(p_alt), credit = btrim(p_credit) where id = p_id;
  elsif p_operation = 'cover' then
    update shagun.media_assets set is_cover = true where id = p_id;
  else
    -- Normalize duplicate/gapped orders using an ID tie-break before swapping.
    -- The owner lock prevents another upload/reorder/save from racing this array.
    with positions as (
      select m.id, (row_number() over (order by m.sort_order, m.id) - 1)::integer as position
      from shagun.media_assets m where (photo.venue_id is not null and m.venue_id = photo.venue_id)
        or (photo.city_id is not null and m.city_id = photo.city_id)
    ) update shagun.media_assets m set sort_order = p.position from positions p where m.id = p.id and m.sort_order <> p.position;
    select * into photo from shagun.media_assets where id = p_id;
    select m.id, m.sort_order into adjacent_id, adjacent_order from shagun.media_assets m
    where ((photo.venue_id is not null and m.venue_id = photo.venue_id) or (photo.city_id is not null and m.city_id = photo.city_id))
      and ((p_operation = 'up' and m.sort_order < photo.sort_order) or (p_operation = 'down' and m.sort_order > photo.sort_order))
    order by case when p_operation = 'up' then m.sort_order end desc,
      case when p_operation = 'down' then m.sort_order end asc, m.id limit 1;
    if adjacent_id is not null then
      update shagun.media_assets set sort_order = case when id = p_id then adjacent_order else photo.sort_order end
      where id in (p_id, adjacent_id);
    end if;
  end if;
end;
$$;

create function shagun.consume_rate_limit(p_key text, p_limit integer, p_seconds integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare allowed boolean;
begin
  if p_key is null or p_key !~ '^[A-Za-z0-9:_-]{1,200}$'
     or p_limit is null or p_limit not between 1 and 10000
     or p_seconds is null or p_seconds not between 1 and 86400 then
    raise exception using errcode = '22023', message = 'invalid_rate_limit';
  end if;
  insert into shagun.rate_limits as bucket (key, hits, resets_at)
    values (p_key, 1, transaction_timestamp() + make_interval(secs => p_seconds))
  on conflict (key) do update set
    hits = case when bucket.resets_at <= transaction_timestamp() then 1 else least(bucket.hits + 1, 10001) end,
    resets_at = case when bucket.resets_at <= transaction_timestamp() then excluded.resets_at else bucket.resets_at end
  returning hits <= p_limit into allowed;
  delete from shagun.rate_limits where key in (
    select r.key from shagun.rate_limits r where r.resets_at <= transaction_timestamp() and r.key <> p_key
    order by r.resets_at, r.key limit 100 for update skip locked
  );
  return allowed;
end;
$$;

create function shagun.record_event(p_event text, p_city uuid, p_venue uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare today date := (transaction_timestamp() at time zone 'UTC')::date;
begin
  if p_event is null or p_event not in ('city_viewed', 'venue_viewed', 'search_performed', 'filter_used', 'phone_clicked', 'whatsapp_clicked')
     or (p_event in ('venue_viewed', 'phone_clicked', 'whatsapp_clicked') and p_venue is null) then
    raise exception using errcode = '22023', message = 'invalid_event';
  end if;
  -- Invalid/nonpublic contexts are quietly ignored, including stale browser events.
  if not exists (select 1 from shagun.cities where id = p_city and status = 'active') then return; end if;
  if p_venue is not null and not exists (
    select 1 from shagun.venues where id = p_venue and city_id = p_city and status = 'published'
  ) then return; end if;
  insert into shagun.analytics_daily as aggregate (day, event, city_id, venue_key, count)
    values (today, p_event, p_city, coalesce(p_venue::text, ''), 1)
  on conflict (day, event, city_id, venue_key) do update set count = aggregate.count + 1;
  delete from shagun.analytics_daily where (day, event, city_id, venue_key) in (
    select a.day, a.event, a.city_id, a.venue_key from shagun.analytics_daily a where a.day < today - 90
    order by a.day, a.event, a.city_id, a.venue_key limit 500 for update skip locked
  );
end;
$$;

-- PostgreSQL normally grants function EXECUTE to PUBLIC; Supabase may also have
-- role-specific defaults. Revoke BOTH, including every trigger-only helper.
revoke all on all functions in schema shagun_private from public, anon, authenticated, service_role;
revoke all on function shagun.is_admin(), shagun.venue_document(uuid), shagun.public_cities(text, integer, integer),
  shagun.search_venues(uuid, text, integer, numeric, text, text[], text, text, integer, integer), shagun.city_facets(uuid),
  shagun.admin_city_summaries(text, integer, integer), shagun.admin_venues(uuid, text, text, integer), shagun.admin_dashboard(),
  shagun.save_city(jsonb, uuid, timestamptz), shagun.save_venue(jsonb, uuid, timestamptz),
  shagun.delete_record(text, uuid, text, timestamptz), shagun.update_photo(uuid, text, text, text),
  shagun.consume_rate_limit(text, integer, integer), shagun.record_event(text, uuid, uuid)
from public, anon, authenticated, service_role;

grant execute on function shagun_private.valid_metadata(jsonb), shagun_private.check_page(text, integer, integer),
  shagun_private.prefix_query(text), shagun_private.needs_review(shagun.venues), shagun_private.city_summary(shagun.cities, boolean)
to anon, authenticated, service_role;
grant execute on function shagun_private.require_admin(), shagun_private.iso_timestamp(text), shagun.is_admin() to authenticated, service_role;
grant execute on function shagun.venue_document(uuid), shagun.public_cities(text, integer, integer),
  shagun.search_venues(uuid, text, integer, numeric, text, text[], text, text, integer, integer), shagun.city_facets(uuid)
to anon, authenticated, service_role;
grant execute on function shagun.admin_city_summaries(text, integer, integer), shagun.admin_venues(uuid, text, text, integer),
  shagun.admin_dashboard(), shagun.save_city(jsonb, uuid, timestamptz), shagun.save_venue(jsonb, uuid, timestamptz),
  shagun.delete_record(text, uuid, text, timestamptz), shagun.update_photo(uuid, text, text, text)
to authenticated;
grant execute on function shagun.consume_rate_limit(text, integer, integer), shagun.record_event(text, uuid, uuid) to service_role;

comment on table shagun.venue_research is 'Private editorial provenance. Never join into public documents.';
comment on column shagun.cities.metadata is 'Public scalar editorial metadata. Do not store research, credentials or private contact details here.';
comment on column shagun.venues.updated_at is 'Database transaction timestamp. Round-trip the exact returned string for optimistic writes; do not convert via JavaScript Date.';
comment on column shagun.cities.updated_at is 'Database transaction timestamp. Round-trip the exact returned string for optimistic writes; do not convert via JavaScript Date.';
comment on table shagun.storage_cleanup_jobs is 'Durable transactional outbox. Remove all 480/960/1600 WebP variants before acknowledging a job.';