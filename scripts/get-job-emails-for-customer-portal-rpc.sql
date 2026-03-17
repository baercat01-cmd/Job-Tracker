-- Run in Supabase Dashboard → SQL Editor if customer portal Messages tab is empty or "Send Message" works but messages don't show.
-- This RPC lets the portal load job_emails by verifying the access token (SECURITY DEFINER bypasses RLS).

-- RPC so customer portal can load job_emails when RLS blocks anon SELECT.
CREATE OR REPLACE FUNCTION public.get_job_emails_for_customer_portal(p_access_token text, p_job_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_valid boolean;
  v_emails jsonb;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM customer_portal_access
    WHERE access_token = trim(p_access_token) AND is_active = true
      AND (job_id IS NULL OR job_id = p_job_id)
  ) INTO v_valid;
  IF NOT v_valid THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT COALESCE(
    (SELECT jsonb_agg(to_jsonb(e))
     FROM (
       SELECT * FROM job_emails
       WHERE job_id = p_job_id
       ORDER BY email_date DESC NULLS LAST
       LIMIT 100
     ) e),
    '[]'::jsonb
  ) INTO v_emails;
  RETURN v_emails;
END;
$$;

COMMENT ON FUNCTION public.get_job_emails_for_customer_portal(text, uuid) IS
  'Returns job_emails for the given job after validating portal token. Use from customer portal when RLS blocks anon SELECT.';

GRANT EXECUTE ON FUNCTION public.get_job_emails_for_customer_portal(text, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_job_emails_for_customer_portal(text, uuid) TO authenticated;
