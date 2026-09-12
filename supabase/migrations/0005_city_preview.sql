-- Saved-city preview only. Apply after 0004 through the explicit runner; it
-- owns the transaction and records this fifth migration in the private ledger.
-- Share preview eligibility without replacing any existing public RPC. Page
-- validation, prefix tokenization and research-free documents reuse 0001 helpers.
create function shagun_private.city_preview_inventory(p_city uuid)
returns setof shagun.venues language plpgsql stable security invoker set search_path = '' as $$
begin
  perform shagun_private.require_admin();
  if p_city is null then
    raise exception using errcode = '22023', message = 'city_required';
  end if;
  return query select v.* from shagun.venues v
    where v.city_id = p_city and v.status in ('draft', 'published');
end;
$$;

create function shagun.preview_city_venues(
  p_city uuid, p_query text default '', p_capacity integer default null,
  p_budget numeric default null, p_price_type text default null, p_facilities text[] default '{}',
  p_type text default null, p_sort text default 'recent', p_page integer default 1, p_limit integer default 12
)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare query_terms tsquery; result jsonb;
begin
  perform shagun_private.require_admin();
  if p_city is null then
    raise exception using errcode = '22023', message = 'city_required';
  end if;
  perform shagun_private.check_page(p_query, p_page, p_limit);
  -- Keep the public search contract, including comparable price bases and
  -- ALL requested facilities. Only eligibility differs from search_venues.
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
  -- No active-city requirement. Count and page share one statement snapshot;
  -- never fetch an admin_venues page and filter that truncated result locally.
  with matching as materialized (
    select v.* from shagun_private.city_preview_inventory(p_city) v join shagun.cities c on c.id = v.city_id
    where (btrim(p_query) = '' or v.search_document @@ query_terms
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

create function shagun.preview_city_facets(p_city uuid)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare result jsonb;
begin
  perform shagun_private.require_admin();
  if p_city is null then
    raise exception using errcode = '22023', message = 'city_required';
  end if;
  -- All eligible city inventory, not the requested search/page's rows. Unknown
  -- capacity and a price basis without a recorded amount are not positive facts.
  with visible as materialized (
    select v.* from shagun_private.city_preview_inventory(p_city) v
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
  ) into result;
  return result;
end;
$$;

-- Explicitly remove PostgreSQL PUBLIC and provider role-specific defaults.
-- BYPASSRLS is not permission to execute previews; the helper is equally private.
revoke all on function shagun_private.city_preview_inventory(uuid),
  shagun.preview_city_venues(uuid, text, integer, numeric, text, text[], text, text, integer, integer),
  shagun.preview_city_facets(uuid) from public, anon, authenticated, service_role;
grant execute on function shagun_private.city_preview_inventory(uuid),
  shagun.preview_city_venues(uuid, text, integer, numeric, text, text[], text, text, integer, integer),
  shagun.preview_city_facets(uuid) to authenticated;