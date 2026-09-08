-- Reserve cleanup BEFORE any Storage write so crashes leave a durable job.
-- Apply after 0001_inventory.sql, 0002_storage.sql and 0003_sitemap.sql.
-- The executor owns the transaction. Use the explicit migration runner so all
-- four migrations and their SQL/checksum ledger records commit or roll back together.

alter table shagun.storage_cleanup_jobs
  add column ready_at timestamptz not null default transaction_timestamp();
create index storage_cleanup_ready_idx on shagun.storage_cleanup_jobs (ready_at, id);

-- Deletion triggers omit ready_at, so deleted assets remain eligible immediately.
-- SELECT ... FOR UPDATE needs an UPDATE grant and an UPDATE USING policy even
-- though finalization only deletes the locked job. No actual UPDATE is allowed:
-- id is the only granted column and WITH CHECK (false) rejects every new row.
grant update (id) on shagun.storage_cleanup_jobs to authenticated;
create policy cleanup_admin_lock on shagun.storage_cleanup_jobs for update to authenticated
  using ((select shagun.is_admin())) with check (false);

create function shagun.begin_media_upload(p_key text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform shagun_private.require_admin();
  if p_key is null or p_key !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception using errcode = '22023', message = 'invalid_storage_key';
  end if;
  if exists (select 1 from shagun.media_assets where storage_key = p_key) then
    raise exception using errcode = '23514', message = 'storage_key_in_use';
  end if;
  -- A duplicate must fail, never renew a pending upload or a deletion job.
  insert into shagun.storage_cleanup_jobs (storage_key, ready_at)
    values (p_key, transaction_timestamp() + interval '15 minutes');
end;
$$;

create function shagun.finalize_media_upload(p_data jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare reservation shagun.storage_cleanup_jobs; photo shagun.media_assets;
begin
  perform shagun_private.require_admin();
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception using errcode = '22023', message = 'object_required';
  end if;
  select * into reservation from shagun.storage_cleanup_jobs
    where storage_key = p_data ->> 'storage_key' for update;
  -- Check wall time AFTER the lock: an old transaction timestamp must not extend
  -- the upload window while waiting. Immediate deletion jobs are not uploads.
  if not found or reservation.ready_at <= clock_timestamp()
     or reservation.ready_at <= reservation.created_at then
    raise exception using errcode = 'P0001', message = 'upload_expired';
  end if;
  -- The media trigger rejects any key still queued for cleanup. Both statements
  -- roll back together if ownership, limits or any metadata constraint fails.
  delete from shagun.storage_cleanup_jobs where id = reservation.id;
  -- Metadata only: the route verifies Storage HTTP writes using the admin session.
  -- Do not accept IDs, audit stamps, sort order or cover state from the caller.
  insert into shagun.media_assets (storage_key, venue_id, city_id, alt_text, credit, width, height)
    values (reservation.storage_key, (p_data ->> 'venue_id')::uuid, (p_data ->> 'city_id')::uuid,
      btrim(p_data ->> 'alt_text'), btrim(p_data ->> 'credit'),
      (p_data ->> 'width')::integer, (p_data ->> 'height')::integer)
    returning * into photo;
  -- The media trigger also takes an owner-row lock. If that wait exhausted the
  -- window, roll the metadata and reservation deletion back together.
  if reservation.ready_at <= clock_timestamp() then
    raise exception using errcode = 'P0001', message = 'upload_expired';
  end if;
  return to_jsonb(photo);
end;
$$;

-- Revoke both PostgreSQL PUBLIC and Supabase role-specific default grants.
revoke all on function shagun.begin_media_upload(text), shagun.finalize_media_upload(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function shagun.begin_media_upload(text), shagun.finalize_media_upload(jsonb) to authenticated;

comment on column shagun.storage_cleanup_jobs.ready_at is 'Earliest cleanup time. Deleted assets default to immediate; incomplete uploads have a nonrenewable 15-minute finalization window.';
comment on table shagun.storage_cleanup_jobs is 'Durable deletion outbox and pre-upload reservations. Process ready jobs only, recheck that no media row references the root, then remove all 480/960/1600 WebP variants before acknowledging.';