-- Empty namespace only: PostgREST requires configured schemas to exist at startup.
-- Inventory migrations and the draft-only seed are applied by integration.ts.
create schema if not exists shagun;
create schema if not exists shagun_test_control;
create table if not exists shagun_test_control.owner (id text primary key);
insert into shagun_test_control.owner (id) values ('shagun-integration') on conflict do nothing;
revoke all on schema shagun_test_control from public, anon, authenticated, service_role;