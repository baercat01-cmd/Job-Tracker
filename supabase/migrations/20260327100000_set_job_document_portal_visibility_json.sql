-- Fallback RPC (single jsonb arg) for office toggle when PostgREST is picky about overloads.
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

NOTIFY pgrst, 'reload schema';
