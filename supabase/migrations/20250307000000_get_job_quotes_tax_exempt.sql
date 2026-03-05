-- Read-only RPC so the app can load tax_exempt for quotes. Finds the job-link column on quotes dynamically.

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
    WHERE table_schema = 'public' AND table_name = 'quotes' AND column_name LIKE '%job%'
    LIMIT 1;
  END IF;
  IF job_col IS NULL THEN
    RAISE EXCEPTION 'quotes table has no job column';
  END IF;
  FOR r IN EXECUTE format('SELECT id, COALESCE(tax_exempt, false) AS tax_exempt FROM quotes WHERE %I = $1', job_col) USING p_job_id
  LOOP
    quote_id := r.id;
    tax_exempt := r.tax_exempt;
    RETURN NEXT;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION get_job_quotes_tax_exempt(uuid) IS 'Return tax_exempt for all quotes of a job. Use when PostgREST does not expose tax_exempt so the UI can show saved value after refresh.';

GRANT EXECUTE ON FUNCTION public.get_job_quotes_tax_exempt(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_job_quotes_tax_exempt(uuid) TO service_role;
