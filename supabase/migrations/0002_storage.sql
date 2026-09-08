-- Requires Supabase Storage (or the minimal test storage schema). The application
-- uploads pre-encoded derivatives before inserting the corresponding media row.
-- The executor owns the transaction. Use the explicit migration runner together
-- with the other migrations and its SQL/checksum ledger, not standalone autocommit.
-- Managed Storage owns its tables, RLS and base grants. Validate, never alter them.
do $shagun_storage_preflight$
begin
  if not exists (
    select 1 from pg_catalog.pg_class
    where oid = pg_catalog.to_regclass('storage.objects') and relkind in ('r', 'p')
  ) then
    raise exception using errcode = '55000', message = 'shagun_requires_managed_storage_objects';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_class
    where oid = pg_catalog.to_regclass('storage.objects') and relrowsecurity
  ) then
    raise exception using errcode = '55000', message = 'shagun_requires_storage_rls';
  end if;
  -- A comma-separated privilege list means ANY privilege, not ALL. Check each.
  if not pg_catalog.has_schema_privilege('authenticated', 'storage', 'USAGE')
     or not pg_catalog.has_table_privilege('authenticated', 'storage.objects', 'SELECT')
     or not pg_catalog.has_table_privilege('authenticated', 'storage.objects', 'INSERT')
     or not pg_catalog.has_table_privilege('authenticated', 'storage.objects', 'DELETE') then
    raise exception using errcode = '42501', message = 'shagun_requires_storage_authenticated_privileges';
  end if;
end;
$shagun_storage_preflight$;

-- This is a NEW bucket. A collision must fail rather than adopt or change an
-- existing application's bucket, metadata or objects. The runner rolls back all.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('shagun-media', 'shagun-media', false, 3145728, array['image/webp']);

-- Restrictive guards also protect this bucket if an older, unrelated permissive
-- policy grants access to all buckets. Outside this bucket (including NULL),
-- these guards are neutral; unrelated policies and existing ACLs still decide.
create policy shagun_media_anon_guard on storage.objects as restrictive for all to anon
  using (bucket_id is distinct from 'shagun-media') with check (bucket_id is distinct from 'shagun-media');
create policy shagun_media_auth_guard on storage.objects as restrictive for all to authenticated
  using (bucket_id is distinct from 'shagun-media' or (select shagun.is_admin()))
  with check (bucket_id is distinct from 'shagun-media' or ((select shagun.is_admin())
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/(480|960|1600)\.webp$'));
-- Uploads must use upsert:false. A new immutable UUID is required for replacement.
create policy shagun_media_no_overwrite on storage.objects as restrictive for update to authenticated
  using (bucket_id is distinct from 'shagun-media') with check (bucket_id is distinct from 'shagun-media');

create policy shagun_media_admin_read on storage.objects for select to authenticated
  using (bucket_id = 'shagun-media' and (select shagun.is_admin()));
create policy shagun_media_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'shagun-media' and (select shagun.is_admin())
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/(480|960|1600)\.webp$');
create policy shagun_media_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'shagun-media' and (select shagun.is_admin()));