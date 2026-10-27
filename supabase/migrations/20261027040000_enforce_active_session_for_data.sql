-- Require the active session lease for all policies that use the shared access helpers.
-- Apply this after the client-side session claim is available in the deployed app.

begin;

create or replace function public.app_user_has_active_session()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.app_user_session_leases lease
    where lease.user_id = auth.uid()
      and lease.session_id = nullif(auth.jwt()->>'session_id', '')
      and lease.lease_until > now()
  );
$$;

create or replace function public.app_has_permission(permission_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.app_user_profiles p
    where p.user_id = auth.uid() and p.is_active
      and public.app_user_has_active_session()
      and (p.role = 'admin' or p.permissions->>permission_name = 'true')
  );
$$;

create or replace function public.app_user_is_active()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.app_user_profiles p
    where p.user_id = auth.uid() and p.is_active
      and public.app_user_has_active_session()
  );
$$;

revoke all on function public.app_user_has_active_session() from public, anon;
revoke all on function public.app_has_permission(text) from public, anon;
revoke all on function public.app_user_is_active() from public, anon;
grant execute on function public.app_user_has_active_session() to authenticated;
grant execute on function public.app_has_permission(text) to authenticated;
grant execute on function public.app_user_is_active() to authenticated;

commit;
