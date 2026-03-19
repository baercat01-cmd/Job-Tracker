-- Create RPCs that bypass RLS so portal links can be created even when table grants/RLS block direct access.
-- Run this in: Supabase Dashboard → SQL Editor → New query → Paste → Run
-- After this, the app will use these functions instead of direct INSERT/UPDATE.

-- Drop old versions first (in case of schema changes)
DROP FUNCTION IF EXISTS public.create_customer_portal_link CASCADE;
DROP FUNCTION IF EXISTS public.update_customer_portal_link CASCADE;
DROP FUNCTION IF EXISTS public.get_customer_portal_link_by_job CASCADE;
DROP FUNCTION IF EXISTS public.get_customer_portal_access_by_token CASCADE;

-- Get: return the portal link row for a job (SECURITY DEFINER so office always gets full row including visibility)
CREATE OR REPLACE FUNCTION public.get_customer_portal_link_by_job(p_job_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT to_jsonb(r) FROM (
    SELECT id, job_id, customer_identifier, access_token, customer_name, customer_email, customer_phone,
           is_active, expires_at, last_accessed_at, created_by, created_at, updated_at,
           show_proposal, show_payments, show_schedule, show_documents, show_photos,
           show_financial_summary, COALESCE(show_line_item_prices, false) AS show_line_item_prices,
           COALESCE(show_section_prices, '{}'::jsonb) AS show_section_prices,
           COALESCE(visibility_by_quote, '{}'::jsonb) AS visibility_by_quote,
           custom_message
    FROM customer_portal_access
    WHERE job_id = p_job_id
    ORDER BY updated_at DESC NULLS LAST, created_at DESC
    LIMIT 1
  ) r;
$$;
GRANT EXECUTE ON FUNCTION public.get_customer_portal_link_by_job(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_customer_portal_link_by_job(uuid) TO authenticated;
COMMENT ON FUNCTION public.get_customer_portal_link_by_job(uuid) IS 'Return the portal link for a job with full visibility columns; used so office UI does not reset toggles on reload.';

-- Get by token: used by customer portal so visibility settings always reflect what office saved (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.get_customer_portal_access_by_token(p_access_token text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT to_jsonb(r) FROM (
    SELECT id, job_id, customer_identifier, access_token, customer_name, customer_email, customer_phone,
           is_active, expires_at, last_accessed_at, created_by, created_at, updated_at,
           show_proposal, show_payments, show_schedule, show_documents, show_photos,
           show_financial_summary, COALESCE(show_line_item_prices, false) AS show_line_item_prices,
           COALESCE(show_section_prices, '{}'::jsonb) AS show_section_prices,
           COALESCE(visibility_by_quote, '{}'::jsonb) AS visibility_by_quote,
           custom_message
    FROM customer_portal_access
    WHERE access_token = p_access_token AND is_active = true
    LIMIT 1
  ) r;
$$;
GRANT EXECUTE ON FUNCTION public.get_customer_portal_access_by_token(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_customer_portal_access_by_token(text) TO authenticated;
COMMENT ON FUNCTION public.get_customer_portal_access_by_token(text) IS 'Return portal access row by token so customer portal always gets current visibility settings.';

-- Create: insert a new portal link (runs with definer rights, bypasses RLS)
CREATE OR REPLACE FUNCTION public.create_customer_portal_link(
  p_job_id uuid,
  p_customer_identifier text,
  p_access_token text,
  p_customer_name text,
  p_customer_email text DEFAULT null,
  p_customer_phone text DEFAULT null,
  p_is_active boolean DEFAULT true,
  p_expires_at timestamptz DEFAULT null,
  p_created_by uuid DEFAULT null,
  p_show_proposal boolean DEFAULT true,
  p_show_payments boolean DEFAULT true,
  p_show_schedule boolean DEFAULT true,
  p_show_documents boolean DEFAULT true,
  p_show_photos boolean DEFAULT true,
  p_show_financial_summary boolean DEFAULT true,
  p_show_line_item_prices boolean DEFAULT false,
  p_show_section_prices jsonb DEFAULT null,
  p_visibility_by_quote jsonb DEFAULT null,
  p_custom_message text DEFAULT null
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row jsonb;
BEGIN
  -- Use UPSERT: if a link exists for this job+customer_identifier, update it
  INSERT INTO public.customer_portal_access (
    job_id, customer_identifier, access_token, customer_name, customer_email, customer_phone,
    is_active, expires_at, created_by,
    show_proposal, show_payments, show_schedule, show_documents, show_photos, show_financial_summary, show_line_item_prices, show_section_prices, visibility_by_quote,
    custom_message, updated_at
  ) VALUES (
    p_job_id, p_customer_identifier, p_access_token, p_customer_name, p_customer_email, p_customer_phone,
    p_is_active, p_expires_at, p_created_by,
    p_show_proposal, p_show_payments, p_show_schedule, p_show_documents, p_show_photos, p_show_financial_summary, coalesce(p_show_line_item_prices, false), coalesce(p_show_section_prices, '{}'::jsonb), coalesce(p_visibility_by_quote, '{}'::jsonb),
    p_custom_message, now()
  )
  ON CONFLICT (job_id, customer_identifier)
  DO UPDATE SET
    access_token = EXCLUDED.access_token,
    customer_name = EXCLUDED.customer_name,
    customer_email = EXCLUDED.customer_email,
    customer_phone = EXCLUDED.customer_phone,
    is_active = EXCLUDED.is_active,
    expires_at = EXCLUDED.expires_at,
    show_proposal = EXCLUDED.show_proposal,
    show_payments = EXCLUDED.show_payments,
    show_schedule = EXCLUDED.show_schedule,
    show_documents = EXCLUDED.show_documents,
    show_photos = EXCLUDED.show_photos,
    show_financial_summary = EXCLUDED.show_financial_summary,
    custom_message = EXCLUDED.custom_message,
    show_line_item_prices = EXCLUDED.show_line_item_prices,
    show_section_prices = coalesce(EXCLUDED.show_section_prices, '{}'::jsonb),
    visibility_by_quote = coalesce(EXCLUDED.visibility_by_quote, '{}'::jsonb),
    updated_at = now()
  RETURNING to_jsonb(customer_portal_access.*) INTO v_row;
  
  RETURN v_row;
END;
$$;

-- Update: update an existing portal link by id
CREATE FUNCTION public.update_customer_portal_link(
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
  p_show_section_prices jsonb DEFAULT null,
  p_visibility_by_quote jsonb DEFAULT null,
  p_custom_message text DEFAULT null
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
    customer_identifier = p_customer_identifier,
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
    show_line_item_prices = coalesce(p_show_line_item_prices, false),
    show_section_prices = coalesce(p_show_section_prices, '{}'::jsonb),
    visibility_by_quote = coalesce(p_visibility_by_quote, '{}'::jsonb),
    custom_message = p_custom_message,
    updated_at = now()
  WHERE id = p_id
  RETURNING to_jsonb(customer_portal_access.*) INTO v_row;
  RETURN v_row;
END;
$$;

-- Allow anon and authenticated to call these
GRANT EXECUTE ON FUNCTION public.create_customer_portal_link TO anon;
GRANT EXECUTE ON FUNCTION public.create_customer_portal_link TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_customer_portal_link TO anon;
GRANT EXECUTE ON FUNCTION public.update_customer_portal_link TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_customer_portal_link_by_job TO anon;
GRANT EXECUTE ON FUNCTION public.get_customer_portal_link_by_job TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_customer_portal_access_by_token TO anon;
GRANT EXECUTE ON FUNCTION public.get_customer_portal_access_by_token TO authenticated;

COMMENT ON FUNCTION public.create_customer_portal_link IS 'Creates or updates a customer portal link (upsert); bypasses RLS so app works when table grants block direct insert.';
COMMENT ON FUNCTION public.update_customer_portal_link IS 'Updates a customer portal link; bypasses RLS.';
COMMENT ON FUNCTION public.get_customer_portal_link_by_job IS 'Gets the most recent customer portal link for a job; bypasses RLS.';
COMMENT ON FUNCTION public.get_customer_portal_access_by_token IS 'Gets customer portal access by token; bypasses RLS.';

-- Tell PostgREST to reload schema so it sees the new functions (fixes PGRST202)
NOTIFY pgrst, 'reload schema';
