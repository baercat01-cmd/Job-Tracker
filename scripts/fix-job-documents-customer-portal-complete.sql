-- ---------------------------------------------------------------------------
-- Run once in Supabase → SQL Editor if:
--   - "Visible to customer portal" toggle errors (schema cache / missing column)
--   - Customer portal Documents tab stays empty after toggles are on
--
-- Then in the same session (or SQL Editor again):
--   NOTIFY pgrst, 'reload schema';
-- ---------------------------------------------------------------------------

-- 1) Column on job_documents
ALTER TABLE public.job_documents
  ADD COLUMN IF NOT EXISTS visible_to_customer_portal boolean NOT NULL DEFAULT false;

-- 2) Office: update visibility (PostgREST schema cache not required)
CREATE OR REPLACE FUNCTION public.set_job_document_portal_visibility(
  p_document_id uuid,
  p_visible boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.job_documents
  SET
    visible_to_customer_portal = p_visible,
    updated_at = now()
  WHERE id = p_document_id;

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.set_job_document_portal_visibility(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_job_document_portal_visibility(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_job_document_portal_visibility(uuid, boolean) TO service_role;

-- 2b) Same update via single jsonb arg (fallback when PostgREST/client has trouble with the two-arg RPC)
CREATE OR REPLACE FUNCTION public.set_job_document_portal_visibility_json(p jsonb)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  doc_id uuid;
  vis boolean;
BEGIN
  doc_id := (p->>'p_document_id')::uuid;
  IF doc_id IS NULL THEN
    doc_id := (p->>'document_id')::uuid;
  END IF;
  IF p ? 'p_visible' THEN
    vis := COALESCE((p->>'p_visible')::boolean, false);
  ELSIF p ? 'visible' THEN
    vis := COALESCE((p->>'visible')::boolean, false);
  ELSE
    vis := false;
  END IF;
  IF doc_id IS NULL THEN
    RETURN false;
  END IF;
  UPDATE public.job_documents
  SET
    visible_to_customer_portal = vis,
    updated_at = now()
  WHERE id = doc_id;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.set_job_document_portal_visibility_json(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_job_document_portal_visibility_json(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_job_document_portal_visibility_json(jsonb) TO service_role;

-- 3) Customer: list documents (matches supabase/migrations/20260325120000_align_customer_portal_job_documents_rpcs.sql)
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

REVOKE ALL ON FUNCTION public.get_job_documents_for_customer_portal_any(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_job_documents_for_customer_portal_any(text, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_job_documents_for_customer_portal_any(text, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
