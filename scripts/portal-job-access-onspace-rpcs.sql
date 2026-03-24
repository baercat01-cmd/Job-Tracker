-- OnSpace (VITE_SUPABASE_URL like *.backend.onspace.ai): Edge Functions are NOT available there.
-- Run this entire file in your project SQL Editor (same DB as the app), then:
--   NOTIFY pgrst, 'reload schema';
--
-- Contents match supabase/migrations/20260326000000_portal_job_access_onspace_rpcs.sql

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
  DELETE FROM public.portal_job_access WHERE id = p_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.office_list_portal_job_access_for_sub(p_portal_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  result json;
BEGIN
  IF to_regclass('public.portal_job_access') IS NULL THEN
    RETURN '[]'::json;
  END IF;

  SELECT coalesce(json_agg(row_to_json(q)), '[]'::json) INTO result
  FROM (
    SELECT
      pja.id,
      pja.portal_user_id,
      pja.job_id,
      pja.can_view_schedule,
      pja.can_view_documents,
      pja.can_view_photos,
      pja.can_view_financials,
      pja.can_view_proposal,
      pja.can_view_materials,
      pja.can_edit_schedule,
      pja.notes,
      pja.created_by,
      pja.created_at,
      pja.updated_at,
      CASE WHEN j.id IS NULL THEN NULL ELSE row_to_json(j) END AS jobs
    FROM public.portal_job_access pja
    LEFT JOIN public.jobs j ON j.id = pja.job_id
    WHERE pja.portal_user_id = p_portal_user_id
    ORDER BY pja.created_at
  ) q;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.office_insert_portal_job_access(
  uuid, uuid, boolean, boolean, boolean, boolean, boolean, boolean, boolean, text, uuid
) TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.office_update_portal_job_access(
  uuid, boolean, boolean, boolean, boolean, boolean, boolean, boolean, text
) TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.office_delete_portal_job_access(uuid) TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.office_list_portal_job_access_for_sub(uuid) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
