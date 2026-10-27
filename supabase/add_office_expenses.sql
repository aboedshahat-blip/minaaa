-- Deprecated unsafe standalone migration. This script previously granted anon
-- users unrestricted access. Run secure_auth_and_rls.sql instead; it creates
-- this table and installs authenticated, active-user policies.
-- Refuse to create an insecure partial setup when the security migration has
-- not been applied.

do $$ begin
  if to_regprocedure('public.app_user_is_active()') is null then
    raise exception 'Apply secure_auth_and_rls.sql first; this legacy script is not safe to run alone.';
  end if;
end $$;

create table if not exists public.office_expenses (
  id text primary key,
  expense_date date not null,
  amount numeric(12, 2) not null check (amount > 0),
  category text not null check (length(trim(category)) > 0),
  payee text,
  payment_method text not null default 'cash'
    check (payment_method in ('cash', 'bank_transfer', 'check', 'other')),
  description text,
  receipt_path text,
  receipt_name text,
  created_at timestamptz not null default now(),
  created_by text not null,
  created_by_name text not null
);

create index if not exists office_expenses_date_idx
  on public.office_expenses (expense_date desc);
create index if not exists office_expenses_category_idx
  on public.office_expenses (category);

alter table public.office_expenses enable row level security;
drop policy if exists office_expenses_app_access on public.office_expenses;
drop policy if exists "office_expenses_app_access" on public.office_expenses;
create policy office_expenses_app_access
  on public.office_expenses
  for all
  to authenticated
  using (public.app_user_is_active())
  with check (public.app_user_is_active());
revoke all on public.office_expenses from anon;
grant select, insert, update, delete on public.office_expenses to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'office-expense-receipts',
  'office-expense-receipts',
  false,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists office_expense_receipts_app_access on storage.objects;
drop policy if exists "office_expense_receipts_app_access" on storage.objects;
create policy office_expense_receipts_app_access
  on storage.objects
  for all
  to authenticated
  using (bucket_id = 'office-expense-receipts' and public.app_user_is_active())
  with check (bucket_id = 'office-expense-receipts' and public.app_user_is_active());
