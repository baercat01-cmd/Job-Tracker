-- One-shot repair for customer portal visibility saves.
-- Safe to run multiple times.

BEGIN;

ALTER TABLE public.customer_portal_access
  ADD COLUMN IF NOT EXISTS show_financial_summary boolean,
  ADD COLUMN IF NOT EXISTS show_line_item_prices boolean,
  ADD COLUMN IF NOT EXISTS show_material_items_no_prices boolean,
  ADD COLUMN IF NOT EXISTS show_section_prices jsonb,
  ADD COLUMN IF NOT EXISTS visibility_by_quote jsonb,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

UPDATE public.customer_portal_access
SET
  show_financial_summary = COALESCE(show_financial_summary, false),
  show_line_item_prices = COALESCE(show_line_item_prices, false),
  show_material_items_no_prices = COALESCE(show_material_items_no_prices, false),
  show_section_prices = COALESCE(show_section_prices, '{}'::jsonb),
  visibility_by_quote = COALESCE(visibility_by_quote, '{}'::jsonb),
  updated_at = COALESCE(updated_at, now());

ALTER TABLE public.customer_portal_access
  ALTER COLUMN show_financial_summary SET DEFAULT false,
  ALTER COLUMN show_financial_summary SET NOT NULL,
  ALTER COLUMN show_line_item_prices SET DEFAULT false,
  ALTER COLUMN show_line_item_prices SET NOT NULL,
  ALTER COLUMN show_material_items_no_prices SET DEFAULT false,
  ALTER COLUMN show_material_items_no_prices SET NOT NULL,
  ALTER COLUMN show_section_prices SET DEFAULT '{}'::jsonb,
  ALTER COLUMN show_section_prices SET NOT NULL,
  ALTER COLUMN visibility_by_quote SET DEFAULT '{}'::jsonb,
  ALTER COLUMN visibility_by_quote SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT now();

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT n.nspname AS schema_name, p.proname AS function_name, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('set_customer_portal_access_visibility', 'get_customer_portal_access_by_token')
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %I.%I(%s);', r.schema_name, r.function_name, r.args);
  END LOOP;
END $$;

CREATE FUNCTION public.set_customer_portal_access_visibility(
  p_link_id uuid,
  p_show_proposal boolean,
  p_show_payments boolean,
  p_show_schedule boolean,
  p_show_documents boolean,
  p_show_photos boolean,
  p_show_financial_summary boolean,
  p_show_line_item_prices boolean,
  p_show_material_items_no_prices boolean,
  p_show_section_prices jsonb,
  p_visibility_by_quote jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.customer_portal_access
  SET
    show_proposal = COALESCE(p_show_proposal, show_proposal),
    show_payments = COALESCE(p_show_payments, show_payments),
    show_schedule = COALESCE(p_show_schedule, show_schedule),
    show_documents = COALESCE(p_show_documents, show_documents),
    show_photos = COALESCE(p_show_photos, show_photos),
    show_financial_summary = COALESCE(p_show_financial_summary, show_financial_summary),
    show_line_item_prices = COALESCE(p_show_line_item_prices, show_line_item_prices),
    show_material_items_no_prices = COALESCE(p_show_material_items_no_prices, show_material_items_no_prices),
    show_section_prices = COALESCE(p_show_section_prices, '{}'::jsonb),
    visibility_by_quote = COALESCE(p_visibility_by_quote, '{}'::jsonb),
    updated_at = now()
  WHERE id = p_link_id;

  RETURN FOUND;
END;
$$;

CREATE FUNCTION public.get_customer_portal_access_by_token(
  p_access_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  row_data public.customer_portal_access%ROWTYPE;
BEGIN
  SELECT *
  INTO row_data
  FROM public.customer_portal_access
  WHERE access_token = p_access_token
    AND is_active = true
    AND (expires_at IS NULL OR expires_at > now())
  ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN to_jsonb(row_data);
END;
$$;

REVOKE ALL ON FUNCTION public.get_customer_portal_access_by_token(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_customer_portal_access_visibility(
  uuid, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, jsonb, jsonb
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_customer_portal_access_by_token(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_customer_portal_access_visibility(
  uuid, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, jsonb, jsonb
) TO authenticated, service_role;

CREATE INDEX IF NOT EXISTS idx_customer_portal_access_access_token
  ON public.customer_portal_access(access_token);

CREATE INDEX IF NOT EXISTS idx_customer_portal_access_job_id
  ON public.customer_portal_access(job_id);

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Verification queries:
-- SELECT column_name FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'customer_portal_access'
--   AND column_name IN (
--     'show_financial_summary','show_line_item_prices','show_material_items_no_prices',
--     'show_section_prices','visibility_by_quote','updated_at'
--   )
-- ORDER BY column_name;
--
-- SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
-- FROM pg_proc p
-- JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public'
--   AND p.proname IN ('set_customer_portal_access_visibility','get_customer_portal_access_by_token')
-- ORDER BY p.proname;
