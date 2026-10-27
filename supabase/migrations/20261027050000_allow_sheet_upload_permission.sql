begin;

-- Sheet upload is its own user permission. Do not require staff with that
-- permission to also receive the broader manual movement-entry permission.
drop policy if exists movements_insert on public.movements;
create policy movements_insert on public.movements for insert to authenticated
  with check (
    public.app_has_permission('can_add_movements')
    or public.app_has_permission('can_upload_sheets')
  );

commit;
