-- Customer estimates: working quotes with rough pricing, hidden from portal until promoted to a formal proposal.

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS is_customer_estimate boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.quotes.is_customer_estimate IS
  'When true, office-only customer estimate (rough pricing). Excluded from customer portal until converted to a formal proposal.';

-- Portal: do not list estimates (customers only see formal proposals).
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
        AND COALESCE(q.is_customer_estimate, false) = false
    ),
    '[]'::jsonb
  );
END;
$$;

COMMENT ON FUNCTION public.get_quotes_for_customer_portal(text, uuid) IS
  'Returns quote rows for the job as JSON when portal token matches; excludes is_customer_estimate quotes.';

GRANT EXECUTE ON FUNCTION public.get_quotes_for_customer_portal(text, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_quotes_for_customer_portal(text, uuid) TO authenticated;

-- create_proposal_version is defined in 20260410120000_create_proposal_version_four_arg_wrapper.sql (4-arg only; PostgREST-safe).
