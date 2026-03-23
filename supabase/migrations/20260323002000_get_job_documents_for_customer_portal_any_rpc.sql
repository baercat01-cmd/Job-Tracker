-- Fallback RPC: return all job documents for a token-validated portal link.
-- Used when visibility column/function schema cache is stale.

CREATE OR REPLACE FUNCTION public.get_job_documents_for_customer_portal_any(
  p_access_token text,
  p_job_id uuid
)
RETURNS SETOF public.job_documents
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT d.*
  FROM public.job_documents d
  WHERE d.job_id = p_job_id
    AND EXISTS (
      SELECT 1
      FROM public.customer_portal_access a
      WHERE a.access_token = p_access_token
        AND a.job_id = p_job_id
        AND a.is_active = true
        AND (a.expires_at IS NULL OR a.expires_at > now())
    )
  ORDER BY d.updated_at DESC;
$$;

REVOKE ALL ON FUNCTION public.get_job_documents_for_customer_portal_any(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_job_documents_for_customer_portal_any(text, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_job_documents_for_customer_portal_any(text, uuid) TO authenticated;
