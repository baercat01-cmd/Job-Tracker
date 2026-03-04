-- =============================================================================
-- TAX EXEMPT FIX: Run this ENTIRE script in Supabase → SQL Editor → New query
-- =============================================================================
-- If tax exempt still doesn't save after running once, run STEP 2 in a *new* query.
-- =============================================================================

-- STEP 1: Add column and make PostgREST see it
ALTER TABLE quotes
ADD COLUMN IF NOT EXISTS tax_exempt boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN quotes.tax_exempt IS 'When true, tax is not applied and grand total equals subtotal.';

-- Reload API schema so GET/PATCH include tax_exempt
NOTIFY pgrst, 'reload schema';

-- STEP 2: RPC so the app can SAVE tax exempt even when schema cache is stale.
-- The app calls this function instead of updating the table directly.
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
BEGIN
  IF p_value THEN
    UPDATE quotes SET tax_exempt = true WHERE job_id = p_job_id;
  ELSE
    UPDATE quotes SET tax_exempt = false WHERE id = p_quote_id;
  END IF;
END;
$$;

-- Required: allow the app to call this function via the API
GRANT EXECUTE ON FUNCTION public.set_quote_tax_exempt(uuid, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_quote_tax_exempt(uuid, uuid, boolean) TO service_role;

-- RPC so the app can LOAD tax exempt after refresh (when schema cache does not expose the column)
CREATE OR REPLACE FUNCTION get_job_quotes_tax_exempt(p_job_id uuid)
RETURNS TABLE(quote_id uuid, tax_exempt boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id AS quote_id, COALESCE(quotes.tax_exempt, false) AS tax_exempt
  FROM quotes
  WHERE job_id = p_job_id;
$$;
GRANT EXECUTE ON FUNCTION public.get_job_quotes_tax_exempt(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_job_quotes_tax_exempt(uuid) TO service_role;

NOTIFY pgrst, 'reload schema';

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
-- After running: hard refresh the app (Ctrl+F5). If you already ran the RPC
-- migration but still get an error, run only: supabase/run-tax-exempt-grant.sql
-- Then in a NEW query run:  NOTIFY pgrst, 'reload schema';
-- =============================================================================
