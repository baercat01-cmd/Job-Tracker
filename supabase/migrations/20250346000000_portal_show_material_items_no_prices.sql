-- Customer portal: list material line items (name, quantity, usage) without any prices.
ALTER TABLE public.customer_portal_access
  ADD COLUMN IF NOT EXISTS show_material_items_no_prices boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.customer_portal_access.show_material_items_no_prices IS
  'When true, material sheets show a line list (material name, quantity, usage) with no unit or section prices. Section $ totals for material sheets are suppressed when this is on.';

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
           COALESCE(show_material_items_no_prices, false) AS show_material_items_no_prices,
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
           COALESCE(visibility_by_quote, '{}'::jsonb) AS visibility_by_quote,
           COALESCE(show_material_items_no_prices, false) AS show_material_items_no_prices,
           custom_message
    FROM customer_portal_access
    WHERE access_token = p_access_token AND is_active = true
    LIMIT 1
  ) r;
$$;
