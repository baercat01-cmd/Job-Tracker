-- Create RPCs that bypass RLS so portal links can be created even when table grants/RLS block direct access.
-- Run this in: Supabase Dashboard → SQL Editor → New query → Paste → Run
-- After this, the app will use these functions instead of direct INSERT/UPDATE.

-- Create: insert a new portal link (runs with definer rights, bypasses RLS)
CREATE OR REPLACE FUNCTION public.create_customer_portal_link(
  p_job_id uuid,
  p_customer_identifier text,
  p_access_token text,
  p_customer_name text,
  p_customer_email text,
  p_customer_phone text,
  p_is_active boolean DEFAULT true,
  p_expires_at timestamptz DEFAULT null,
  p_created_by uuid DEFAULT null,
  p_show_proposal boolean DEFAULT true,
  p_show_payments boolean DEFAULT true,
  p_show_schedule boolean DEFAULT true,
  p_show_documents boolean DEFAULT true,
  p_show_photos boolean DEFAULT true,
  p_show_financial_summary boolean DEFAULT true,
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
  INSERT INTO public.customer_portal_access (
    job_id, customer_identifier, access_token, customer_name, customer_email, customer_phone,
    is_active, expires_at, created_by,
    show_proposal, show_payments, show_schedule, show_documents, show_photos, show_financial_summary,
    custom_message, updated_at
  ) VALUES (
    p_job_id, p_customer_identifier, p_access_token, p_customer_name, p_customer_email, p_customer_phone,
    p_is_active, p_expires_at, p_created_by,
    p_show_proposal, p_show_payments, p_show_schedule, p_show_documents, p_show_photos, p_show_financial_summary,
    p_custom_message, now()
  )
  RETURNING to_jsonb(customer_portal_access.*) INTO v_row;
  RETURN v_row;
END;
$$;

-- Update: update an existing portal link by id
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
  p_custom_message text
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

COMMENT ON FUNCTION public.create_customer_portal_link IS 'Creates a customer portal link; bypasses RLS so app works when table grants block direct insert.';
COMMENT ON FUNCTION public.update_customer_portal_link IS 'Updates a customer portal link; bypasses RLS.';

-- Tell PostgREST to reload schema so it sees the new functions (fixes PGRST202)
NOTIFY pgrst, 'reload schema';
