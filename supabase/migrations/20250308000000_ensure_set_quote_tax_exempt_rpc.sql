-- Ensure set_quote_tax_exempt exists and is callable. Finds the job-link column on quotes dynamically.

CREATE OR REPLACE FUNCTION public.set_quote_tax_exempt(
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
    WHERE table_schema = 'public' AND table_name = 'quotes' AND column_name LIKE '%job%'
    LIMIT 1;
  END IF;
  IF job_col IS NULL THEN
    RAISE EXCEPTION 'quotes table has no job column';
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

NOTIFY pgrst, 'reload schema';
