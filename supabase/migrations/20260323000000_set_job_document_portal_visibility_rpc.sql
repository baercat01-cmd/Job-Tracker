-- Fallback RPC for portal visibility updates when PostgREST schema cache is stale.
-- Called by office UI toggle in JobDocuments.

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
