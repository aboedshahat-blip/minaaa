-- DEPRECATED one-off schema patch. Current schema is managed only by
-- supabase/migrations/. Do not use this file to configure a database.
do $$ begin raise exception 'Deprecated script. Apply pending supabase/migrations/ instead.'; end $$;

/*
-- Keep movement columns in sync with the application model.
ALTER TABLE public.movements
  ADD COLUMN IF NOT EXISTS cashier_receipt_no TEXT,
  ADD COLUMN IF NOT EXISTS booking_category TEXT,
  ADD COLUMN IF NOT EXISTS discount NUMERIC DEFAULT 0;

-- Make PostgREST recognize the new fields immediately.
NOTIFY pgrst, 'reload schema';
*/
