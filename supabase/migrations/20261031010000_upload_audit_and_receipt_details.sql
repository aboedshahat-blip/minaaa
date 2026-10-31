begin;

alter table public.movements
  add column if not exists created_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists created_by_email text,
  add column if not exists created_by_name text,
  add column if not exists updated_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists updated_by_email text,
  add column if not exists updated_by_name text,
  add column if not exists updated_at timestamptz;

alter table public.movement_financials
  add column if not exists cashier_receipt_details jsonb not null default '[]'::jsonb;

create or replace function public.stamp_movement_actor()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  profile_email text;
  profile_name text;
begin
  if auth.uid() is null then
    raise exception 'An authenticated user is required to change movements.';
  end if;

  select lower(p.email), p.display_name into profile_email, profile_name
    from public.app_user_profiles p where p.user_id = auth.uid() and p.is_active;
  if profile_email is null then
    raise exception 'An active user profile is required to change movements.';
  end if;

  if tg_op = 'INSERT' then
    new.created_by_user_id := auth.uid();
    new.created_by_email := profile_email;
    new.created_by_name := profile_name;
  end if;
  new.updated_by_user_id := auth.uid();
  new.updated_by_email := profile_email;
  new.updated_by_name := profile_name;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists movements_stamp_actor on public.movements;
create trigger movements_stamp_actor before insert or update on public.movements
for each row execute function public.stamp_movement_actor();
revoke all on function public.stamp_movement_actor() from public, anon, authenticated;

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null,
  actor_email text not null,
  actor_name text not null,
  action text not null,
  entity_type text not null check (entity_type in ('sheet', 'cashier_invoice', 'movement')),
  entity_id text not null,
  entity_name text not null default '',
  summary text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists activity_logs_created_at_idx on public.activity_logs (created_at desc);
create index if not exists activity_logs_actor_idx on public.activity_logs (actor_user_id, created_at desc);
alter table public.activity_logs enable row level security;

create or replace function public.stamp_activity_log_actor()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  profile_name text;
  session_email text;
begin
  if auth.uid() is null then
    raise exception 'An authenticated user is required to record activity.';
  end if;

  select p.display_name, lower(p.email)
    into profile_name, session_email
    from public.app_user_profiles p
   where p.user_id = auth.uid() and p.is_active;

  if profile_name is null then
    raise exception 'An active user profile is required to record activity.';
  end if;

  new.actor_user_id := auth.uid();
  new.actor_email := coalesce(session_email, lower(auth.jwt()->>'email'), '');
  new.actor_name := profile_name;
  return new;
end;
$$;

drop trigger if exists activity_logs_stamp_actor on public.activity_logs;
create trigger activity_logs_stamp_actor before insert on public.activity_logs
for each row execute function public.stamp_activity_log_actor();

drop policy if exists activity_logs_admin_read on public.activity_logs;
create policy activity_logs_admin_read on public.activity_logs for select to authenticated
  using (public.app_has_permission('is_admin'));

drop policy if exists activity_logs_authenticated_insert on public.activity_logs;
create policy activity_logs_authenticated_insert on public.activity_logs for insert to authenticated
  with check (actor_user_id = auth.uid() and public.app_user_is_active());

revoke all on public.activity_logs from anon;
grant select, insert on public.activity_logs to authenticated;
revoke update, delete on public.activity_logs from authenticated;
revoke all on function public.stamp_activity_log_actor() from public, anon, authenticated;

drop policy if exists movements_delete on public.movements;
create policy movements_delete on public.movements for delete to authenticated
  using (
    public.app_has_permission('can_delete_movements')
    or (
      created_by_user_id = auth.uid()
      and (public.app_has_permission('can_upload_sheets') or public.app_has_permission('can_add_movements'))
    )
  );

commit;
