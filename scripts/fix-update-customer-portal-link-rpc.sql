-- =============================================================================
-- Fix: "Could not find the function public.update_customer_portal_link ... 
--       in the schema cache"
--
-- 1. Run this ENTIRE script in Supabase → SQL Editor.
-- 2. Then: Dashboard → Project Settings → General → Restart project
--    (required — NOTIFY alone often is not enough for schema cache.)
-- 3. Wait 1–2 minutes, hard-refresh the app (Ctrl+Shift+R).
-- 4. Confirm VITE_SUPABASE_URL in your app matches THIS Supabase project.
-- =============================================================================

-- Remove every overload so PostgREST sees exactly one signature
DROP FUNCTION IF EXISTS public.update_customer_portal_link CASCADE;

CREATE OR REPLACE FUNCTION public.update_customer_portal_link(
  p_id uuid,
  p_customer_identifier text,
  p_customer_name text,
  p_customer_email text,
  p_customer_phone text,
  p_is_active boolean,
  p_expires_at timestamptz,
  p_show_proposal boolean,
  p_show_payments boolean,
  p_show_schedule boolean,
  p_show_documents boolean,
  p_show_photos boolean,
  p_show_financial_summary boolean,
  p_show_line_item_prices boolean DEFAULT false,
  p_show_section_prices jsonb DEFAULT NULL,
  p_visibility_by_quote jsonb DEFAULT NULL,
  p_custom_message text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row jsonb;
BEGIN
  UPDATE public.customer_portal_access
  SET
    customer_identifier = lower(trim(p_customer_identifier)),
    customer_name = p_customer_name,
    customer_email = p_customer_email,
    customer_phone = p_customer_phone,
    is_active = p_is_active,
    expires_at = p_expires_at,
    show_proposal = p_show_proposal,
    show_payments = p_show_payments,
    show_schedule = p_show_schedule,
    show_documents = p_show_documents,
    show_photos = p_show_photos,
    show_financial_summary = p_show_financial_summary,
    show_line_item_prices = COALESCE(p_show_line_item_prices, false),
    show_section_prices = CASE
      WHEN p_show_section_prices IS NULL THEN show_section_prices
      ELSE COALESCE(p_show_section_prices, '{}'::jsonb)
    END,
    visibility_by_quote = CASE
      WHEN p_visibility_by_quote IS NULL THEN visibility_by_quote
      ELSE COALESCE(p_visibility_by_quote, '{}'::jsonb)
    END,
    custom_message = p_custom_message,
    updated_at = now()
  WHERE id = p_id
  RETURNING to_jsonb(customer_portal_access.*) INTO v_row;
  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_customer_portal_link(
  uuid, text, text, text, text, boolean, timestamptz,
  boolean, boolean, boolean, boolean, boolean, boolean, boolean,
  jsonb, jsonb, text
) TO anon;
GRANT EXECUTE ON FUNCTION public.update_customer_portal_link(
  uuid, text, text, text, text, boolean, timestamptz,
  boolean, boolean, boolean, boolean, boolean, boolean, boolean,
  jsonb, jsonb, text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_customer_portal_link(
  uuid, text, text, text, text, boolean, timestamptz,
  boolean, boolean, boolean, boolean, boolean, boolean, boolean,
  jsonb, jsonb, text
) TO service_role;

COMMENT ON FUNCTION public.update_customer_portal_link IS
  'Updates portal link; bypasses RLS. Used by office app when direct UPDATE is blocked.';

NOTIFY pgrst, 'reload schema';

-- Verify (should return one row with 17 args ending in jsonb, jsonb, text)
SELECT p.proname,
       pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'update_customer_portal_link';
