-- Run in Supabase SQL Editor if the customer portal still shows "Sign & use as contract"
-- after the customer signed (anon often cannot read customer_signed_* via direct quotes SELECT).

CREATE OR REPLACE FUNCTION public.get_quotes_for_customer_portal(
  p_access_token text,
  p_job_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM customer_portal_access
    WHERE access_token = p_access_token
      AND is_active = true
      AND job_id IS NOT DISTINCT FROM p_job_id
  ) THEN
    RETURN '[]'::jsonb;
  END IF;

  RETURN COALESCE(
    (
      SELECT jsonb_agg(to_jsonb(q) ORDER BY q.created_at DESC NULLS LAST)
      FROM quotes q
      WHERE q.job_id = p_job_id
    ),
    '[]'::jsonb
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_quotes_for_customer_portal(text, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_quotes_for_customer_portal(text, uuid) TO authenticated;
