-- RPCs so office and customer portal always get full portal link rows (including visibility) regardless of RLS.
-- Fixes: visibility toggles resetting on reload; customer portal not reflecting office visibility settings.

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
           custom_message
    FROM customer_portal_access
    WHERE access_token = p_access_token AND is_active = true
    LIMIT 1
  ) r;
$$;
GRANT EXECUTE ON FUNCTION public.get_customer_portal_access_by_token(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_customer_portal_access_by_token(text) TO authenticated;
COMMENT ON FUNCTION public.get_customer_portal_access_by_token(text) IS 'Return portal access row by token so customer portal always gets current visibility settings.';
