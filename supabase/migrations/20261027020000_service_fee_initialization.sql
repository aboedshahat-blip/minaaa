-- Initialize new movement account rows using the shared service tariffs.
-- Existing financial rows are left untouched; the application repairs missing
-- historical ledger rows while preserving each device's locally saved data.
begin;

create or replace function public.initialize_movement_financials()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  commission_settings jsonb;
  customer_fee_marker text;
  customer_commissions jsonb;
  service_text text;
  base_system numeric;
  base_nafez numeric;
begin
  select value into commission_settings
  from public.system_settings where key = 'commissions';

  select substring(notes from '\[\[VIB_CUSTOMER_FEES:(\{.*?\})\]\]')
    into customer_fee_marker
  from public.customers where id = new.customer_id;
  if customer_fee_marker is not null then
    customer_commissions := customer_fee_marker::jsonb;
  end if;

  service_text := lower(coalesce(new.container_path, ''));
  if service_text !~ 'فارغ|تعتيق|استلام|صادر|وارد' then
    service_text := lower(coalesce(new.booking_category, ''));
  end if;

  if service_text ~ 'فارغ|تعتيق|استلام' then
    base_system := coalesce(
      (commission_settings->>'default_empty_commission')::numeric,
      (commission_settings->>'default_system_commission')::numeric,
      (customer_commissions->>'system_commission')::numeric,
      200
    );
  elsif service_text ~ 'صادر' then
    base_system := coalesce(
      (commission_settings->>'default_outbound_commission')::numeric,
      (commission_settings->>'default_system_commission')::numeric,
      (customer_commissions->>'system_commission')::numeric,
      200
    );
  elsif service_text ~ 'وارد' then
    base_system := coalesce(
      (commission_settings->>'default_inbound_commission')::numeric,
      (commission_settings->>'default_system_commission')::numeric,
      (customer_commissions->>'system_commission')::numeric,
      200
    );
  else
    base_system := coalesce(
      (customer_commissions->>'system_commission')::numeric,
      (commission_settings->>'default_system_commission')::numeric,
      200
    );
  end if;

  base_nafez := coalesce(
    (customer_commissions->>'nafez_commission')::numeric,
    (commission_settings->>'default_nafez_commission')::numeric,
    0
  );

  insert into public.movement_financials (
    movement_id, cashier_invoice, system_commission, nafez_commission,
    total_amount, payment_status, paid_amount, remaining_amount, customer_paid_amount
  ) values (
    new.id, 0, base_system, base_nafez, base_system + base_nafez,
    'unpaid', 0, base_system + base_nafez, 0
  ) on conflict (movement_id) do nothing;
  return new;
end;
$$;

revoke all on function public.initialize_movement_financials() from public, anon, authenticated;

commit;
