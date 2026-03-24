-- Office app: grant/update/revoke subcontractor job access when RLS blocks direct PostgREST writes.
-- Requires public.portal_job_access (see 20260324115000_create_portal_job_access.sql).

CREATE OR REPLACE FUNCTION public.office_insert_portal_job_access(
  p_portal_user_id uuid,
  p_job_id uuid,
  p_can_view_schedule boolean DEFAULT true,
  p_can_view_documents boolean DEFAULT true,
  p_can_view_photos boolean DEFAULT false,
  p_can_view_financials boolean DEFAULT false,
  p_can_view_proposal boolean DEFAULT false,
  p_can_view_materials boolean DEFAULT false,
  p_can_edit_schedule boolean DEFAULT false,
  p_notes text DEFAULT NULL,
  p_created_by uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF to_regclass('public.portal_job_access') IS NULL THEN
    RAISE EXCEPTION 'Table portal_job_access does not exist';
  END IF;

  INSERT INTO public.portal_job_access (
    portal_user_id,
    job_id,
    can_view_schedule,
    can_view_documents,
    can_view_photos,
    can_view_financials,
    can_view_proposal,
    can_view_materials,
    can_edit_schedule,
    notes,
    created_by
  ) VALUES (
    p_portal_user_id,
    p_job_id,
    p_can_view_schedule,
    p_can_view_documents,
    p_can_view_photos,
    p_can_view_financials,
    p_can_view_proposal,
    p_can_view_materials,
    p_can_edit_schedule,
    p_notes,
    p_created_by
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.office_update_portal_job_access(
  p_id uuid,
  p_can_view_schedule boolean,
  p_can_view_documents boolean,
  p_can_view_photos boolean,
  p_can_view_financials boolean,
  p_can_view_proposal boolean,
  p_can_view_materials boolean,
  p_can_edit_schedule boolean,
  p_notes text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE public.portal_job_access
  SET
    can_view_schedule = p_can_view_schedule,
    can_view_documents = p_can_view_documents,
    can_view_photos = p_can_view_photos,
    can_view_financials = p_can_view_financials,
    can_view_proposal = p_can_view_proposal,
    can_view_materials = p_can_view_materials,
    can_edit_schedule = p_can_edit_schedule,
    notes = p_notes,
    updated_at = now()
  WHERE id = p_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.office_delete_portal_job_access(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  DELETE FROM public.portal_job_access WHERE id = p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.office_insert_portal_job_access(
  uuid, uuid, boolean, boolean, boolean, boolean, boolean, boolean, boolean, text, uuid
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.office_update_portal_job_access(
  uuid, boolean, boolean, boolean, boolean, boolean, boolean, boolean, text
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.office_delete_portal_job_access(uuid) TO authenticated;
