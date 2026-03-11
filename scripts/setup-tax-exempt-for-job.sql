-- Tax exempt: save per job and sync across all users.
-- Run this in Supabase SQL Editor if you see: "Could not find the function set_quote_tax_exempt" or "Could not find the 'tax_exempt' column of 'quotes'".
-- When checked, tax exempt is saved for the job so all proposals (quotes) for that job are tax exempt and all users see it.

-- 1) Add column to quotes if missing
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS tax_exempt boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.quotes.tax_exempt IS 'When true, tax is not applied for this quote. When set for one quote of a job, typically applied to all quotes for that job so it syncs for all users.';

-- 2) Read-only RPC: return tax_exempt for all quotes of a job (used when loading proposals so saved value persists)
CREATE OR REPLACE FUNCTION public.get_job_quotes_tax_exempt(p_job_id uuid)
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
  FOR r IN EXECUTE format('SELECT id, COALESCE(tax_exempt, false) AS tax_exempt FROM public.quotes WHERE %I = $1', job_col) USING p_job_id
  LOOP
    quote_id := r.id;
    tax_exempt := r.tax_exempt;
    RETURN NEXT;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.get_job_quotes_tax_exempt(uuid) IS 'Return tax_exempt for all quotes of a job. Used when loading proposals so saved value persists across users.';

GRANT EXECUTE ON FUNCTION public.get_job_quotes_tax_exempt(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_job_quotes_tax_exempt(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_job_quotes_tax_exempt(uuid) TO anon;

-- 3) Write RPC: set tax_exempt for the job (when true = all quotes for job; when false = single quote)
CREATE OR REPLACE FUNCTION public.set_quote_tax_exempt(
  p_job_id   uuid,
  p_quote_id uuid,
  p_value    boolean
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
    EXECUTE format('UPDATE public.quotes SET tax_exempt = true WHERE %I = $1', job_col) USING p_job_id;
  ELSE
    UPDATE public.quotes SET tax_exempt = false WHERE id = p_quote_id;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.set_quote_tax_exempt(uuid, uuid, boolean) IS 'Set tax_exempt: when true, all quotes for job_id; when false, single quote by id. Saves for job so it syncs across all users.';

GRANT EXECUTE ON FUNCTION public.set_quote_tax_exempt(uuid, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_quote_tax_exempt(uuid, uuid, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_quote_tax_exempt(uuid, uuid, boolean) TO anon;

-- 4) Reload PostgREST schema so the new column and RPCs are visible
NOTIFY pgrst, 'reload schema';
