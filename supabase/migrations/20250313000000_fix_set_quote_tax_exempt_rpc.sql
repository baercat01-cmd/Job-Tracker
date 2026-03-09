-- Ensure tax_exempt column exists on quotes, then create/replace the RPC.

ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS tax_exempt boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.set_quote_tax_exempt(
  p_job_id  uuid,
  p_quote_id uuid,
  p_value   boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  job_col text;
BEGIN
  -- Find the column on quotes that references jobs
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
    RAISE EXCEPTION 'quotes table has no job column';
  END IF;

  IF p_value THEN
    -- Mark every quote for this job as tax exempt
    EXECUTE format('UPDATE public.quotes SET tax_exempt = true  WHERE %I = $1', job_col) USING p_job_id;
  ELSE
    -- Remove tax exempt from this specific quote only
    UPDATE public.quotes SET tax_exempt = false WHERE id = p_quote_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_quote_tax_exempt(uuid, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_quote_tax_exempt(uuid, uuid, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_quote_tax_exempt(uuid, uuid, boolean) TO anon;

NOTIFY pgrst, 'reload schema';
