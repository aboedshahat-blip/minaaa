-- DEPRECATED: do not run this file.
--
-- The previous one-file schema was stale: it duplicated movement financials
-- in public.movements, granted broad public access, and did not include the
-- current authentication, session, audit, or receipt-detail model.
--
-- The ordered files in supabase/migrations/ are the only supported database
-- definition. Apply them with the Supabase CLI (`supabase db push`) after
-- linking the intended project and reviewing the pending migrations.
-- Never run this legacy file against production.

do $$
begin
  raise exception 'supabase/schema.sql is deprecated. Apply supabase/migrations/ in order instead.';
end
$$;
