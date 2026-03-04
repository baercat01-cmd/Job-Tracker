-- Read-only RPC so the app can load tax_exempt for quotes even when PostgREST
-- schema cache does not yet expose the tax_exempt column (persists after refresh).

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

COMMENT ON FUNCTION get_job_quotes_tax_exempt(uuid) IS 'Return tax_exempt for all quotes of a job. Use when PostgREST does not expose tax_exempt so the UI can show saved value after refresh.';

GRANT EXECUTE ON FUNCTION public.get_job_quotes_tax_exempt(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_job_quotes_tax_exempt(uuid) TO service_role;
