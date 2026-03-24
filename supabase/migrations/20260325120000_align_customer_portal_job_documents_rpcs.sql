-- Align token checks for job document RPCs with real portal links (null job_id, trim token, expires_at).
-- Replace get_job_documents_for_customer_portal_any return type with jsonb + nested revisions so fallback matches primary.

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
    SELECT 1
    FROM public.customer_portal_access a
    WHERE trim(a.access_token) = trim(p_access_token)
      AND a.is_active = true
      AND (a.expires_at IS NULL OR a.expires_at > now())
      AND (a.job_id IS NULL OR a.job_id = p_job_id)
  ) INTO v_valid;
  IF NOT v_valid THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT COALESCE(
    (SELECT jsonb_agg(doc ORDER BY doc->>'name')
     FROM (
       SELECT (to_jsonb(d) || jsonb_build_object(
         'job_document_revisions',
         (SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.version_number), '[]'::jsonb)
          FROM public.job_document_revisions r WHERE r.document_id = d.id)
       )) AS doc
       FROM public.job_documents d
       WHERE d.job_id = p_job_id AND d.visible_to_customer_portal = true
     ) sub),
    '[]'::jsonb
  ) INTO v_docs;
  RETURN v_docs;
END;
$$;

COMMENT ON FUNCTION public.get_job_documents_for_customer_portal(text, uuid) IS
  'Returns visible portal job documents with revisions; validates portal token (trim, expiry, job match).';

REVOKE ALL ON FUNCTION public.get_job_documents_for_customer_portal(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_job_documents_for_customer_portal(text, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_job_documents_for_customer_portal(text, uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.get_job_documents_for_customer_portal_any(text, uuid);

CREATE OR REPLACE FUNCTION public.get_job_documents_for_customer_portal_any(
  p_access_token text,
  p_job_id uuid
)
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
    SELECT 1
    FROM public.customer_portal_access a
    WHERE trim(a.access_token) = trim(p_access_token)
      AND a.is_active = true
      AND (a.expires_at IS NULL OR a.expires_at > now())
      AND (a.job_id IS NULL OR a.job_id = p_job_id)
  ) INTO v_valid;
  IF NOT v_valid THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT COALESCE(
    (SELECT jsonb_agg(doc ORDER BY doc->>'name')
     FROM (
       SELECT (to_jsonb(d) || jsonb_build_object(
         'job_document_revisions',
         (SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.version_number), '[]'::jsonb)
          FROM public.job_document_revisions r WHERE r.document_id = d.id)
       )) AS doc
       FROM public.job_documents d
       WHERE d.job_id = p_job_id AND d.visible_to_customer_portal = true
     ) sub),
    '[]'::jsonb
  ) INTO v_docs;
  RETURN v_docs;
END;
$$;

COMMENT ON FUNCTION public.get_job_documents_for_customer_portal_any(text, uuid) IS
  'Fallback: same payload as get_job_documents_for_customer_portal (jsonb with revisions).';

REVOKE ALL ON FUNCTION public.get_job_documents_for_customer_portal_any(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_job_documents_for_customer_portal_any(text, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_job_documents_for_customer_portal_any(text, uuid) TO authenticated;
