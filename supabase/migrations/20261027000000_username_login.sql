-- Enables case-insensitive, unique usernames for secure Supabase Auth login.
-- Password verification remains exclusively in Supabase Auth.
begin;

alter table public.app_user_profiles
  add column if not exists username_normalized text
  generated always as (lower(btrim(username))) stored;

create unique index if not exists app_user_profiles_username_normalized_uidx
  on public.app_user_profiles (username_normalized);

create table if not exists public.username_login_limits (
  subject_hash text primary key check (subject_hash ~ '^[0-9a-f]{64}$'),
  attempts integer not null default 0 check (attempts >= 0),
  window_started_at timestamptz not null default now(),
  blocked_until timestamptz
);
alter table public.username_login_limits enable row level security;
revoke all on public.username_login_limits from public, anon, authenticated;
grant all on public.username_login_limits to service_role;

create or replace function public.username_login_rate_limit(p_subject_hashes text[], p_action text)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare
  v_subject_hash text;
  current_attempts integer;
  current_window timestamptz;
  current_block timestamptz;
begin
  if p_action not in ('consume', 'clear') or cardinality(p_subject_hashes) < 1 or cardinality(p_subject_hashes) > 2 then
    return false;
  end if;
  if exists (select 1 from unnest(p_subject_hashes) as t(h) where t.h !~ '^[0-9a-f]{64}$') then
    return false;
  end if;

  for v_subject_hash in select distinct h from unnest(p_subject_hashes) as t(h) order by h loop
    perform pg_advisory_xact_lock(hashtextextended(v_subject_hash, 24019));
  end loop;

  if p_action = 'clear' then
    delete from public.username_login_limits where subject_hash = any(p_subject_hashes);
    return true;
  end if;

  for v_subject_hash in select distinct h from unnest(p_subject_hashes) as t(h) order by h loop
    select attempts, window_started_at, blocked_until
      into current_attempts, current_window, current_block
      from public.username_login_limits l where l.subject_hash = v_subject_hash for update;
    if found and ((current_block is not null and current_block > now())
      or (current_window > now() - interval '15 minutes' and current_attempts >= 10)) then
      return false;
    end if;
  end loop;

  for v_subject_hash in select distinct h from unnest(p_subject_hashes) as t(h) order by h loop
    insert into public.username_login_limits (subject_hash, attempts, window_started_at, blocked_until)
    values (v_subject_hash, 1, now(), null)
    on conflict (subject_hash) do update set
      attempts = case when public.username_login_limits.window_started_at <= now() - interval '15 minutes'
        then 1 else public.username_login_limits.attempts + 1 end,
      window_started_at = case when public.username_login_limits.window_started_at <= now() - interval '15 minutes'
        then now() else public.username_login_limits.window_started_at end,
      blocked_until = null;
  end loop;

  if random() < 0.01 then
    delete from public.username_login_limits where window_started_at < now() - interval '2 days';
  end if;
  return true;
end;
$$;

revoke all on function public.username_login_rate_limit(text[], text) from public, anon, authenticated;
grant execute on function public.username_login_rate_limit(text[], text) to service_role;

commit;
