# Instructions for OnSpace AI: Fix Tax Exempt for Supabase

Paste the following into OnSpace AI so it can help you fix the Tax Exempt feature on your connected Supabase project.

---

**Copy everything below this line and paste into OnSpace AI:**

---

I need to fix the "Tax Exempt" feature in my app. It uses a Supabase project that is connected to OnSpace. The app shows: "Tax exempt could not be saved. The database may be missing the tax_exempt column or RPCs."

Please help me run the following in my **Supabase project** (Dashboard → SQL Editor, or however I run SQL in my connected Supabase):

1. **Add the column** (if missing):
```sql
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS tax_exempt boolean NOT NULL DEFAULT false;
```

2. **Create the read function** (so the app can load saved tax exempt for all quotes of a job):
```sql
CREATE OR REPLACE FUNCTION public.get_job_quotes_tax_exempt(p_job_id uuid)
RETURNS TABLE(quote_id uuid, tax_exempt boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE job_col text; r record;
BEGIN
  SELECT column_name INTO job_col FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'quotes'
    AND column_name IN ('job_id', 'job', 'jobs_id', 'job_ref');
  IF job_col IS NULL THEN
    SELECT column_name INTO job_col FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'quotes' AND column_name LIKE '%job%' LIMIT 1;
  END IF;
  IF job_col IS NULL THEN RAISE EXCEPTION 'quotes table has no job column'; END IF;
  FOR r IN EXECUTE format('SELECT id, COALESCE(tax_exempt, false) AS tax_exempt FROM public.quotes WHERE %I = $1', job_col) USING p_job_id
  LOOP quote_id := r.id; tax_exempt := r.tax_exempt; RETURN NEXT; END LOOP;
END; $$;
GRANT EXECUTE ON FUNCTION public.get_job_quotes_tax_exempt(uuid) TO authenticated, service_role, anon;
```

3. **Create the write function** (so the app can save tax exempt for the job; when true, all quotes for that job become tax exempt):
```sql
CREATE OR REPLACE FUNCTION public.set_quote_tax_exempt(p_job_id uuid, p_quote_id uuid, p_value boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE job_col text;
BEGIN
  SELECT column_name INTO job_col FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'quotes'
    AND column_name IN ('job_id', 'job', 'jobs_id', 'job_ref');
  IF job_col IS NULL THEN
    SELECT column_name INTO job_col FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'quotes' AND column_name LIKE '%job%' LIMIT 1;
  END IF;
  IF job_col IS NULL THEN RAISE EXCEPTION 'quotes table has no job column'; END IF;
  IF p_value THEN
    EXECUTE format('UPDATE public.quotes SET tax_exempt = true WHERE %I = $1', job_col) USING p_job_id;
  ELSE
    UPDATE public.quotes SET tax_exempt = false WHERE id = p_quote_id;
  END IF;
END; $$;
GRANT EXECUTE ON FUNCTION public.set_quote_tax_exempt(uuid, uuid, boolean) TO authenticated, service_role, anon;
```

4. **Reload the API schema** so Supabase’s API sees the new column and functions:
```sql
NOTIFY pgrst, 'reload schema';
```

If OnSpace or my Supabase setup can run SQL, run the four steps above in order. If you can only run one block, combine 1–3 into one script and run it, then run step 4. After that, I will reload my app and the Tax Exempt checkbox should save and sync for the job for all users.

If the schema still doesn’t update (stale cache), tell me how to add a **DATABASE_URL** secret to my Supabase Edge Function **set-job-tax-exempt** (connection string from Supabase Project Settings → Database) so the function can save tax exempt via direct SQL.
