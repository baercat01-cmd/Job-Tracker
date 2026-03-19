-- Create/update portal link RPCs (SECURITY DEFINER). Required when RLS blocks direct table UPDATE/INSERT.
-- Previously only in scripts/create-portal-link-rpc.sql; without these, "Save changes" fails with PGRST202.

DROP FUNCTION IF EXISTS public.create_customer_portal_link CASCADE;
DROP FUNCTION IF EXISTS public.update_customer_portal_link CASCADE;

-- Upsert by job + customer_identifier (no unique index required)
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
  v_id uuid;
BEGIN
  SELECT id INTO v_id
  FROM public.customer_portal_access
  WHERE job_id = p_job_id
    AND customer_identifier = lower(trim(p_customer_identifier))
  LIMIT 1;

  IF v_id IS NULL THEN
    SELECT id INTO v_id
    FROM public.customer_portal_access
    WHERE job_id = p_job_id
    ORDER BY updated_at DESC NULLS LAST, created_at DESC
    LIMIT 1;
  END IF;

  IF v_id IS NOT NULL THEN
    UPDATE public.customer_portal_access
    SET
      customer_identifier = lower(trim(p_customer_identifier)),
      access_token = p_access_token,
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
    WHERE id = v_id
    RETURNING to_jsonb(customer_portal_access.*) INTO v_row;
  ELSE
    INSERT INTO public.customer_portal_access (
      job_id, customer_identifier, access_token, customer_name, customer_email, customer_phone,
      is_active, expires_at, created_by,
      show_proposal, show_payments, show_schedule, show_documents, show_photos, show_financial_summary,
      show_line_item_prices, show_section_prices, visibility_by_quote,
      custom_message, updated_at
    ) VALUES (
      p_job_id, lower(trim(p_customer_identifier)), p_access_token, p_customer_name, p_customer_email, p_customer_phone,
      p_is_active, p_expires_at, p_created_by,
      p_show_proposal, p_show_payments, p_show_schedule, p_show_documents, p_show_photos, p_show_financial_summary,
      coalesce(p_show_line_item_prices, false), coalesce(p_show_section_prices, '{}'::jsonb), coalesce(p_visibility_by_quote, '{}'::jsonb),
      p_custom_message, now()
    )
    RETURNING to_jsonb(customer_portal_access.*) INTO v_row;
  END IF;

  RETURN v_row;
END;
$$;

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
    show_line_item_prices = coalesce(p_show_line_item_prices, false),
    show_section_prices = CASE
      WHEN p_show_section_prices IS NULL THEN show_section_prices
      ELSE coalesce(p_show_section_prices, '{}'::jsonb)
    END,
    visibility_by_quote = CASE
      WHEN p_visibility_by_quote IS NULL THEN visibility_by_quote
      ELSE coalesce(p_visibility_by_quote, '{}'::jsonb)
    END,
    custom_message = p_custom_message,
    updated_at = now()
  WHERE id = p_id
  RETURNING to_jsonb(customer_portal_access.*) INTO v_row;
  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_customer_portal_link TO anon;
GRANT EXECUTE ON FUNCTION public.create_customer_portal_link TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_customer_portal_link TO anon;
GRANT EXECUTE ON FUNCTION public.update_customer_portal_link TO authenticated;

COMMENT ON FUNCTION public.create_customer_portal_link IS 'Creates or updates portal link by job; bypasses RLS.';
COMMENT ON FUNCTION public.update_customer_portal_link IS 'Updates portal link by id; bypasses RLS.';

NOTIFY pgrst, 'reload schema';
