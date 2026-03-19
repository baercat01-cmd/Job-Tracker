-- Allow per-section price visibility in customer portal (show section prices individually).
ALTER TABLE public.customer_portal_access
  ADD COLUMN IF NOT EXISTS show_section_prices jsonb DEFAULT '{}';

COMMENT ON COLUMN public.customer_portal_access.show_section_prices IS 'Per-section price visibility: { "sheet-id": true, "row-id": false }. When key is true, show that section price in portal; when false, hide. Missing key defaults to global show_line_item_prices.';

-- Refresh GET RPCs so they return the new column (customer portal and office need it).
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
           custom_message
    FROM customer_portal_access
    WHERE job_id = p_job_id
    ORDER BY updated_at DESC NULLS LAST, created_at DESC
    LIMIT 1
  ) r;
$$;

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
           custom_message
    FROM customer_portal_access
    WHERE access_token = p_access_token AND is_active = true
    LIMIT 1
  ) r;
$$;
