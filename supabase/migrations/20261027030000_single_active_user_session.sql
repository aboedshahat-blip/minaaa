-- Allow only one active Supabase Auth session per application user.
-- A short renewable lease lets a user recover after a browser crash or device loss.

begin;

create table if not exists public.app_user_session_leases (
  user_id uuid primary key references auth.users(id) on delete cascade,
  session_id text not null,
  lease_until timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table public.app_user_session_leases enable row level security;
revoke all on public.app_user_session_leases from anon, authenticated;

create or replace function public.claim_app_user_session()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_session_id text := nullif(auth.jwt()->>'session_id', '');
  v_claimed boolean := false;
begin
  if v_user_id is null or v_session_id is null then
    return false;
  end if;
  if not exists (
    select 1 from public.app_user_profiles
    where user_id = v_user_id and is_active
  ) then
    return false;
  end if;

  insert into public.app_user_session_leases (user_id, session_id, lease_until, updated_at)
  values (v_user_id, v_session_id, now() + interval '5 minutes', now())
  on conflict (user_id) do update
    set session_id = excluded.session_id,
        lease_until = excluded.lease_until,
        updated_at = now()
    where public.app_user_session_leases.session_id = excluded.session_id
       or public.app_user_session_leases.lease_until <= now()
  returning true into v_claimed;

  return coalesce(v_claimed, false);
end;
$$;

create or replace function public.heartbeat_app_user_session()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_session_id text := nullif(auth.jwt()->>'session_id', '');
begin
  if v_user_id is null or v_session_id is null then
    return false;
  end if;

  update public.app_user_session_leases
     set lease_until = now() + interval '5 minutes', updated_at = now()
   where user_id = v_user_id and session_id = v_session_id;
  return found;
end;
$$;

create or replace function public.release_app_user_session()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_session_id text := nullif(auth.jwt()->>'session_id', '');
begin
  if v_user_id is not null and v_session_id is not null then
    delete from public.app_user_session_leases
     where user_id = v_user_id and session_id = v_session_id;
  end if;
end;
$$;

revoke all on function public.claim_app_user_session() from public, anon;
revoke all on function public.heartbeat_app_user_session() from public, anon;
revoke all on function public.release_app_user_session() from public, anon;
grant execute on function public.claim_app_user_session() to authenticated;
grant execute on function public.heartbeat_app_user_session() to authenticated;
grant execute on function public.release_app_user_session() to authenticated;

commit;
