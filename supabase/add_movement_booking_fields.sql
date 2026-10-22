-- Keep movement columns in sync with the application model.
ALTER TABLE public.movements
  ADD COLUMN IF NOT EXISTS cashier_receipt_no TEXT,
  ADD COLUMN IF NOT EXISTS booking_category TEXT,
  ADD COLUMN IF NOT EXISTS discount NUMERIC DEFAULT 0;

-- Make PostgREST recognize the new fields immediately.
NOTIFY pgrst, 'reload schema';
