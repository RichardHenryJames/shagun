-- Bounded sitemap partitions without the PostgREST table row cap. Public predicates
-- are explicit even for an admin caller. Empty cities are intentionally omitted.
create function shagun.sitemap_entries(p_offset integer default 0, p_limit integer default 1000)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare result jsonb;
begin
  if p_offset is null or p_limit is null
     or p_offset < 0 or p_offset > 10000000 or p_limit < 0 or p_limit > 10000 then
    raise exception using errcode = '22023', message = 'invalid_page';
  end if;
  with routes as materialized (
    select '/city/' || c.slug as path, c.updated_at as updated_at
    from shagun.cities c where c.status = 'active'
      and exists (select 1 from shagun.venues v where v.city_id = c.id and v.status = 'published')
    union all
    select '/city/' || c.slug || '/vivah-bhawan/' || v.slug, greatest(c.updated_at, v.updated_at)
    from shagun.venues v join shagun.cities c on c.id = v.city_id
    where c.status = 'active' and v.status = 'published'
  ), page as (select * from routes order by path offset p_offset limit p_limit)
  select jsonb_build_object('total', (select count(*) from routes), 'items',
    coalesce((select jsonb_agg(jsonb_build_object('path', path, 'updatedAt', updated_at) order by path) from page), '[]'::jsonb)) into result;
  return result;
end;
$$;
revoke all on function shagun.sitemap_entries(integer, integer) from public, anon, authenticated;
grant execute on function shagun.sitemap_entries(integer, integer) to anon, authenticated, service_role;