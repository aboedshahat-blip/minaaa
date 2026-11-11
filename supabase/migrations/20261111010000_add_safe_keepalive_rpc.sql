begin;

-- A no-data RPC for the scheduled availability check. It does not read or
-- modify operational tables, so the public check does not weaken table RLS.
create or replace function public.keepalive_ping()
returns integer
language sql
security definer
set search_path = pg_catalog, public
as $$
  select 1;
$$;

revoke all on function public.keepalive_ping() from public, anon, authenticated;
grant execute on function public.keepalive_ping() to anon;

commit;
