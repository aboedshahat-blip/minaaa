# Supabase database guide

## One supported schema source

Use the ordered migrations in `migrations/` as the sole source of database changes. Apply pending migrations with the Supabase CLI against the intended project only, and review the migration plan before applying it. Do not run `schema.sql`, `secure_auth_and_rls.sql`, `add_movement_booking_fields.sql`, or `add_office_expenses.sql`; those old one-off scripts are retained only to explain older installations and now stop with a clear error.

The latest migration adds movement change attribution and `movement_financials.cashier_receipt_details`. If the app reports that this column is missing, the deployed database is behind the repository; refreshing the browser cannot add it. Apply the pending migration, then reload the app.

## Why some values appear in more than one place

- `movements` owns the operational snapshot: customer/berth names and codes, vehicle/container data, and movement date. The IDs connect to current customer/berth records; the copied names preserve what was recorded at the time.
- `movement_financials` owns one financial summary per movement. Its primary key is also a foreign key to `movements.id`, so this is a one-to-one split for financial access control, not a second movement.
- `cashier_receipt_no` is the legacy/display string; `cashier_receipt_details` is the structured receipt list with per-receipt amounts. New cashier writes should update both together. Legacy rows may only have the string and cannot be safely split into amounts without source evidence.
- `payments` is the receipt ledger. The paid/remaining/status fields in `movement_financials` are per-movement balances used for fast reporting. They are related representations and must be updated together by payment flows; they are not interchangeable.
- `customers.trucks` is the customer's current fleet list. Vehicle values on `movements` are historical snapshots and must remain even if the fleet list changes.
- Import batch metadata and payment type metadata currently use tagged JSON in `notes` for compatibility with older deployed schemas. Do not add duplicate columns until a reviewed migration moves existing marker data safely.

## Deployment rules

1. Back up production before any schema or data migration.
2. Link the CLI to the intended Supabase project and inspect pending migrations.
3. Apply migrations in timestamp order; never reset production or replay a migration manually.
4. Confirm the deployment workflow completed and the app can read/write with each intended role.

Do not store a database password, service-role key, or Supabase access token in frontend code, committed files, or chat. Keep deployment credentials in the deployment provider's encrypted secrets.
