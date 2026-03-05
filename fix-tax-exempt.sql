-- =============================================================================
-- TAX EXEMPT FIX: Run this ENTIRE script in Supabase → SQL Editor → New query
-- =============================================================================
-- Uses the actual job-link column on "quotes" (finds it automatically).
-- After it succeeds, open a *new* query and run only:  NOTIFY pgrst, 'reload schema';
-- Then hard refresh the app (Ctrl+F5). Tax exempt should then save.
-- =============================================================================

-- STEP 1: Add column
ALTER TABLE quotes
ADD COLUMN IF NOT EXISTS tax_exempt boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN quotes.tax_exempt IS 'When true, tax is not applied and grand total equals subtotal.';

-- STEP 2: RPC so the app can SAVE tax exempt. Uses dynamic SQL to find the job column on quotes.
CREATE OR REPLACE FUNCTION set_quote_tax_exempt(
  p_job_id uuid,
  p_quote_id uuid,
  p_value boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  job_col text;
BEGIN
  SELECT column_name INTO job_col
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'quotes'
    AND column_name IN ('job_id', 'job', 'jobs_id', 'job_ref');
  IF job_col IS NULL THEN
    SELECT column_name INTO job_col
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'quotes'
      AND column_name LIKE '%job%'
    LIMIT 1;
  END IF;
  IF job_col IS NULL THEN
    RAISE EXCEPTION 'quotes table has no job column (tried job_id, job, jobs_id, job_ref, or any name containing job)';
  END IF;
  IF p_value THEN
    EXECUTE format('UPDATE quotes SET tax_exempt = true WHERE %I = $1', job_col) USING p_job_id;
  ELSE
    UPDATE quotes SET tax_exempt = false WHERE id = p_quote_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_quote_tax_exempt(uuid, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_quote_tax_exempt(uuid, uuid, boolean) TO service_role;

-- RPC so the app can LOAD tax exempt. Uses dynamic SQL to find the job column.
CREATE OR REPLACE FUNCTION get_job_quotes_tax_exempt(p_job_id uuid)
RETURNS TABLE(quote_id uuid, tax_exempt boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  job_col text;
  r record;
BEGIN
  SELECT column_name INTO job_col
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'quotes'
    AND column_name IN ('job_id', 'job', 'jobs_id', 'job_ref');
  IF job_col IS NULL THEN
    SELECT column_name INTO job_col
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'quotes'
      AND column_name LIKE '%job%'
    LIMIT 1;
  END IF;
  IF job_col IS NULL THEN
    RAISE EXCEPTION 'quotes table has no job column (tried job_id, job, jobs_id, job_ref, or any name containing job)';
  END IF;
  FOR r IN EXECUTE format('SELECT id, COALESCE(tax_exempt, false) AS tax_exempt FROM quotes WHERE %I = $1', job_col) USING p_job_id
  LOOP
    quote_id := r.id;
    tax_exempt := r.tax_exempt;
    RETURN NEXT;
  END LOOP;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_job_quotes_tax_exempt(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_job_quotes_tax_exempt(uuid) TO service_role;

-- STEP 3 (optional): Event trigger so future column/table changes auto-reload schema.
-- If you get a permission error, skip this and run NOTIFY in a new query when needed.
CREATE OR REPLACE FUNCTION pgrst_watch() RETURNS event_trigger
  LANGUAGE plpgsql AS $$
BEGIN
  NOTIFY pgrst, 'reload schema';
END;
$$;
DROP EVENT TRIGGER IF EXISTS pgrst_watch;
CREATE EVENT TRIGGER pgrst_watch
  ON ddl_command_end
  EXECUTE PROCEDURE pgrst_watch();

-- =============================================================================
-- IMPORTANT: Open a NEW query in SQL Editor and run ONLY:
--   NOTIFY pgrst, 'reload schema';
-- Then hard refresh the app (Ctrl+F5). Tax exempt should then save.
-- =============================================================================
