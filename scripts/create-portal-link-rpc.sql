-- Create RPCs that bypass RLS so portal links can be created even when table grants/RLS block direct access.
-- Run this in: Supabase Dashboard → SQL Editor → New query → Paste → Run
-- After this, the app will use these functions instead of direct INSERT/UPDATE.

-- Drop old versions first (in case of schema changes)
DROP FUNCTION IF EXISTS public.create_customer_portal_link CASCADE;
DROP FUNCTION IF EXISTS public.update_customer_portal_link CASCADE;
DROP FUNCTION IF EXISTS public.get_customer_portal_link_by_job CASCADE;
DROP FUNCTION IF EXISTS public.get_customer_portal_access_by_token CASCADE;

-- Create: insert a new portal link or update if exists (runs with definer rights, bypasses RLS)
CREATE FUNCTION public.create_customer_portal_link(
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
  p_custom_message text DEFAULT null,
  p_show_line_item_prices boolean DEFAULT false
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
    show_proposal, show_payments, show_schedule, show_documents, show_photos, show_financial_summary,
    custom_message, show_line_item_prices, updated_at
  ) VALUES (
    p_job_id, p_customer_identifier, p_access_token, p_customer_name, p_customer_email, p_customer_phone,
    p_is_active, p_expires_at, p_created_by,
    p_show_proposal, p_show_payments, p_show_schedule, p_show_documents, p_show_photos, p_show_financial_summary,
    p_custom_message, p_show_line_item_prices, now()
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
  p_custom_message text,
  p_show_line_item_prices boolean
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
    custom_message = p_custom_message,
    show_line_item_prices = p_show_line_item_prices,
    updated_at = now()
  WHERE id = p_id
  RETURNING to_jsonb(customer_portal_access.*) INTO v_row;
  RETURN v_row;
END;
$$;

-- Get link by job ID
CREATE FUNCTION public.get_customer_portal_link_by_job(p_job_id uuid)
RETURNS TABLE (
  id uuid,
  job_id uuid,
  access_token text,
  customer_name text,
  customer_email text,
  customer_phone text,
  customer_identifier text,
  is_active boolean,
  expires_at timestamptz,
  last_accessed_at timestamptz,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  show_proposal boolean,
  show_payments boolean,
  show_schedule boolean,
  show_documents boolean,
  show_photos boolean,
  show_financial_summary boolean,
  custom_message text,
  show_line_item_prices boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    cpa.id,
    cpa.job_id,
    cpa.access_token,
    cpa.customer_name,
    cpa.customer_email,
    cpa.customer_phone,
    cpa.customer_identifier,
    cpa.is_active,
    cpa.expires_at,
    cpa.last_accessed_at,
    cpa.created_by,
    cpa.created_at,
    cpa.updated_at,
    cpa.show_proposal,
    cpa.show_payments,
    cpa.show_schedule,
    cpa.show_documents,
    cpa.show_photos,
    cpa.show_financial_summary,
    cpa.custom_message,
    cpa.show_line_item_prices
  FROM public.customer_portal_access cpa
  WHERE cpa.job_id = p_job_id
  ORDER BY cpa.created_at DESC
  LIMIT 1;
END;
$$;

-- Get access by token
CREATE FUNCTION public.get_customer_portal_access_by_token(p_access_token text)
RETURNS TABLE (
  id uuid,
  job_id uuid,
  access_token text,
  customer_name text,
  customer_email text,
  customer_phone text,
  customer_identifier text,
  is_active boolean,
  expires_at timestamptz,
  last_accessed_at timestamptz,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  show_proposal boolean,
  show_payments boolean,
  show_schedule boolean,
  show_documents boolean,
  show_photos boolean,
  show_financial_summary boolean,
  custom_message text,
  show_line_item_prices boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    cpa.id,
    cpa.job_id,
    cpa.access_token,
    cpa.customer_name,
    cpa.customer_email,
    cpa.customer_phone,
    cpa.customer_identifier,
    cpa.is_active,
    cpa.expires_at,
    cpa.last_accessed_at,
    cpa.created_by,
    cpa.created_at,
    cpa.updated_at,
    cpa.show_proposal,
    cpa.show_payments,
    cpa.show_schedule,
    cpa.show_documents,
    cpa.show_photos,
    cpa.show_financial_summary,
    cpa.custom_message,
    cpa.show_line_item_prices
  FROM public.customer_portal_access cpa
  WHERE cpa.access_token = p_access_token;
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
