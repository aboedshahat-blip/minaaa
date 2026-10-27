-- Secure existing VIB data before production use.
-- Run only after confirming a Supabase project backup exists.
-- Moves financial columns out of movements so data-entry accounts cannot read them.

begin;

create table if not exists public.app_user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  username text not null,
  display_name text not null,
  role text not null default 'data_entry' check (role in ('admin', 'accountant', 'data_entry')),
  permissions jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.app_user_profiles (user_id, email, username, display_name)
  values (
    new.id, lower(new.email),
    coalesce(nullif(new.raw_user_meta_data->>'username', ''), split_part(lower(new.email), '@', 1)),
    coalesce(nullif(new.raw_user_meta_data->>'display_name', ''), split_part(lower(new.email), '@', 1))
  )
  on conflict (user_id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_vib_profile on auth.users;
create trigger on_auth_user_created_vib_profile after insert on auth.users
for each row execute function public.handle_new_auth_user();

insert into public.app_user_profiles (user_id, email, username, display_name)
select id, lower(email), coalesce(nullif(raw_user_meta_data->>'username', ''), split_part(lower(email), '@', 1)),
       coalesce(nullif(raw_user_meta_data->>'display_name', ''), split_part(lower(email), '@', 1))
from auth.users where email is not null
on conflict (user_id) do nothing;

create or replace function public.app_has_permission(permission_name text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.app_user_profiles p
    where p.user_id = auth.uid() and p.is_active
      and (p.role = 'admin' or p.permissions->>permission_name = 'true')
  );
$$;

create or replace function public.app_user_is_active()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.app_user_profiles p where p.user_id = auth.uid() and p.is_active);
$$;

create table if not exists public.system_settings (
  key text primary key,
  value jsonb not null
);
insert into public.system_settings (key, value) values (
  'commissions',
  '{"default_system_commission":200,"default_nafez_commission":0,"default_truck_axles":20,"default_truck_weight":7.5,"default_trailer_axles":30,"default_trailer_weight":11.5}'::jsonb
) on conflict (key) do nothing;

create table if not exists public.movement_financials (
  movement_id text primary key references public.movements(id) on delete cascade,
  cashier_invoice numeric not null default 0,
  cashier_receipt_no text,
  system_commission numeric not null default 200,
  nafez_commission numeric not null default 0,
  discount numeric not null default 0,
  total_amount numeric not null default 200,
  payment_status text not null default 'unpaid' check (payment_status in ('paid', 'unpaid', 'partial')),
  paid_amount numeric not null default 0,
  remaining_amount numeric not null default 200,
  customer_paid_amount numeric
);

do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'movements' and column_name = 'cashier_invoice'
  ) then
    execute $migration$
      insert into public.movement_financials (
        movement_id, cashier_invoice, cashier_receipt_no, system_commission, nafez_commission,
        discount, total_amount, payment_status, paid_amount, remaining_amount, customer_paid_amount
      )
      select id, coalesce(cashier_invoice, 0), cashier_receipt_no, coalesce(system_commission, 200),
             coalesce(nafez_commission, 0), coalesce(discount, 0), coalesce(total_amount, 200),
             coalesce(payment_status, 'unpaid'), coalesce(paid_amount, 0), coalesce(remaining_amount, 200), null
      from public.movements on conflict (movement_id) do nothing
    $migration$;
  end if;
end $$;

create or replace function public.initialize_movement_financials()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  commission_settings jsonb;
  customer_fee_marker text;
  customer_commissions jsonb;
  base_system numeric;
  base_nafez numeric;
begin
  select value into commission_settings from public.system_settings where key = 'commissions';
  select substring(notes from '\[\[VIB_CUSTOMER_FEES:(\{.*?\})\]\]')
    into customer_fee_marker from public.customers where id = new.customer_id;
  if customer_fee_marker is not null then customer_commissions := customer_fee_marker::jsonb; end if;
  base_system := coalesce((customer_commissions->>'system_commission')::numeric, (commission_settings->>'default_system_commission')::numeric, 200);
  base_nafez := coalesce((customer_commissions->>'nafez_commission')::numeric, (commission_settings->>'default_nafez_commission')::numeric, 0);
  insert into public.movement_financials (
    movement_id, cashier_invoice, system_commission, nafez_commission,
    total_amount, payment_status, paid_amount, remaining_amount
  ) values (
    new.id, 0, base_system, base_nafez, base_system + base_nafez, 'unpaid', 0, base_system + base_nafez
  ) on conflict (movement_id) do nothing;
  return new;
end;
$$;

drop trigger if exists initialize_vib_movement_financials on public.movements;
create trigger initialize_vib_movement_financials after insert on public.movements
for each row execute function public.initialize_movement_financials();

alter table public.movements drop column if exists cashier_invoice;
alter table public.movements drop column if exists cashier_receipt_no;
alter table public.movements drop column if exists system_commission;
alter table public.movements drop column if exists nafez_commission;
alter table public.movements drop column if exists discount;
alter table public.movements drop column if exists total_amount;
alter table public.movements drop column if exists payment_status;
alter table public.movements drop column if exists paid_amount;
alter table public.movements drop column if exists remaining_amount;
alter table public.movements drop column if exists customer_paid_amount;

create table if not exists public.office_expenses (
  id text primary key,
  expense_date date not null,
  amount numeric(12,2) not null check (amount > 0),
  category text not null check (length(trim(category)) > 0),
  payee text,
  payment_method text not null default 'cash' check (payment_method in ('cash','bank_transfer','check','other')),
  description text,
  receipt_path text,
  receipt_name text,
  created_at timestamptz not null default now(),
  created_by text not null,
  created_by_name text not null
);
create index if not exists office_expenses_date_idx on public.office_expenses (expense_date desc);
create index if not exists office_expenses_category_idx on public.office_expenses (category);

do $$
declare policy_row record;
begin
  for policy_row in
    select schemaname, tablename, policyname from pg_policies
    where schemaname = 'public'
      and tablename = any (array['app_user_profiles','customers','movements','movement_financials','payments','berths','system_settings','office_expenses'])
  loop
    execute format('drop policy %I on %I.%I', policy_row.policyname, policy_row.schemaname, policy_row.tablename);
  end loop;
end;
$$;

alter table public.app_user_profiles enable row level security;
alter table public.customers enable row level security;
alter table public.movements enable row level security;
alter table public.movement_financials enable row level security;
alter table public.payments enable row level security;
alter table public.berths enable row level security;
alter table public.system_settings enable row level security;
alter table public.office_expenses enable row level security;

create policy app_user_profile_read on public.app_user_profiles for select to authenticated
  using (user_id = auth.uid() or public.app_has_permission('is_admin'));

create policy customers_read on public.customers for select to authenticated using (public.app_user_is_active());
create policy customers_insert on public.customers for insert to authenticated
  with check (public.app_has_permission('can_manage_customers') or public.app_has_permission('can_upload_sheets'));
create policy customers_update on public.customers for update to authenticated
  using (public.app_has_permission('can_manage_customers') or public.app_has_permission('can_upload_sheets'))
  with check (public.app_has_permission('can_manage_customers') or public.app_has_permission('can_upload_sheets'));
create policy customers_delete on public.customers for delete to authenticated using (public.app_has_permission('can_delete_customers'));

create policy movements_read on public.movements for select to authenticated using (public.app_user_is_active());
create policy movements_insert on public.movements for insert to authenticated with check (public.app_has_permission('can_add_movements'));
create policy movements_update on public.movements for update to authenticated
  using (public.app_has_permission('can_edit_movements')) with check (public.app_has_permission('can_edit_movements'));
create policy movements_delete on public.movements for delete to authenticated using (public.app_has_permission('can_delete_movements'));

create policy movement_financials_read on public.movement_financials for select to authenticated
  using (public.app_has_permission('can_view_financials'));
create policy movement_financials_insert on public.movement_financials for insert to authenticated
  with check (public.app_has_permission('can_manage_payments') or public.app_has_permission('can_edit_commissions'));
create policy movement_financials_update on public.movement_financials for update to authenticated
  using (public.app_has_permission('can_manage_payments') or public.app_has_permission('can_edit_commissions'))
  with check (public.app_has_permission('can_manage_payments') or public.app_has_permission('can_edit_commissions'));
create policy movement_financials_delete on public.movement_financials for delete to authenticated
  using (public.app_has_permission('can_manage_payments'));

create policy payments_read on public.payments for select to authenticated using (public.app_has_permission('can_view_financials'));
create policy payments_insert on public.payments for insert to authenticated with check (public.app_has_permission('can_manage_payments'));
create policy payments_update on public.payments for update to authenticated
  using (public.app_has_permission('can_manage_payments')) with check (public.app_has_permission('can_manage_payments'));
create policy payments_delete on public.payments for delete to authenticated using (public.app_has_permission('can_manage_payments'));

create policy berths_read on public.berths for select to authenticated using (public.app_user_is_active());
create policy berths_insert on public.berths for insert to authenticated with check (public.app_has_permission('can_manage_berths'));
create policy berths_update on public.berths for update to authenticated
  using (public.app_has_permission('can_manage_berths')) with check (public.app_has_permission('can_manage_berths'));
create policy berths_delete on public.berths for delete to authenticated using (public.app_has_permission('can_manage_berths'));

create policy system_settings_read on public.system_settings for select to authenticated
  using (public.app_has_permission('can_view_financials'));
create policy system_settings_write on public.system_settings for all to authenticated
  using (public.app_has_permission('can_edit_commissions')) with check (public.app_has_permission('can_edit_commissions'));

create policy office_expenses_all_staff on public.office_expenses for all to authenticated
  using (public.app_user_is_active()) with check (public.app_user_is_active());

revoke all on public.app_user_profiles, public.customers, public.movements, public.movement_financials,
  public.payments, public.berths, public.system_settings, public.office_expenses from anon;
grant select on public.app_user_profiles, public.customers, public.movements, public.movement_financials,
  public.payments, public.berths, public.system_settings, public.office_expenses to authenticated;
grant insert, update, delete on public.customers, public.movements, public.movement_financials,
  public.payments, public.berths, public.system_settings, public.office_expenses to authenticated;
revoke all on function public.app_has_permission(text), public.app_user_is_active() from public, anon;
grant execute on function public.app_has_permission(text), public.app_user_is_active() to authenticated;
revoke all on function public.initialize_movement_financials() from public, anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('office-expense-receipts','office-expense-receipts',false,10485760,array['application/pdf','image/jpeg','image/png'])
on conflict (id) do update set public=false, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists office_expense_receipts_app_access on storage.objects;
drop policy if exists office_receipts_authenticated_access on storage.objects;
create policy office_receipts_authenticated_access on storage.objects for all to authenticated
  using (bucket_id = 'office-expense-receipts' and public.app_user_is_active())
  with check (bucket_id = 'office-expense-receipts' and public.app_user_is_active());

-- The old custom-auth cloud row contained plaintext passwords; remove it.
delete from public.customers where id = '__SYSTEM_USERS_CONFIG__';

commit;

-- After creating/inviting the owner in Supabase Auth, promote that profile once:
-- update public.app_user_profiles set role='admin', permissions='{}'::jsonb
-- where email=lower('OWNER_EMAIL_HERE');
