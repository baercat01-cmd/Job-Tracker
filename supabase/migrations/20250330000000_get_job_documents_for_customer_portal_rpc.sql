-- RPC so customer portal can load job documents marked visible_to_customer_portal when RLS blocks anon SELECT.
CREATE OR REPLACE FUNCTION public.get_job_documents_for_customer_portal(p_access_token text, p_job_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_valid boolean;
  v_docs jsonb;
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
    (SELECT jsonb_agg(doc ORDER BY doc->>'name')
     FROM (
       SELECT (to_jsonb(d) || jsonb_build_object('job_document_revisions',
         (SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.version_number), '[]'::jsonb)
          FROM job_document_revisions r WHERE r.document_id = d.id)
       )) AS doc
       FROM job_documents d
       WHERE d.job_id = p_job_id AND d.visible_to_customer_portal = true
     ) sub),
    '[]'::jsonb
  ) INTO v_docs;
  RETURN v_docs;
END;
$$;

COMMENT ON FUNCTION public.get_job_documents_for_customer_portal(text, uuid) IS
  'Returns job documents with visible_to_customer_portal = true for the given job after validating portal token. Use from customer portal when RLS blocks anon SELECT.';

GRANT EXECUTE ON FUNCTION public.get_job_documents_for_customer_portal(text, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_job_documents_for_customer_portal(text, uuid) TO authenticated;
