-- =====================================================================
-- Portal Job Access OnSpace Cloud RPCs
-- =====================================================================
-- These functions support office PIN-based authentication (user_profiles)
-- instead of Supabase Auth, for managing subcontractor portal job access.
-- =====================================================================

-- Drop existing functions if they exist
DROP FUNCTION IF EXISTS public.office_insert_portal_job_access(uuid, uuid, boolean, boolean, boolean, boolean, text);
DROP FUNCTION IF EXISTS public.office_update_portal_job_access(uuid, boolean, boolean, boolean, boolean, text);
DROP FUNCTION IF EXISTS public.office_delete_portal_job_access(uuid);
DROP FUNCTION IF EXISTS public.office_list_portal_job_access_for_sub(uuid);

-- =====================================================================
-- 1. Insert Portal Job Access
-- =====================================================================
CREATE OR REPLACE FUNCTION public.office_insert_portal_job_access(
  p_portal_user_id uuid,
  p_job_id uuid,
  p_can_view_schedule boolean DEFAULT true,
  p_can_view_documents boolean DEFAULT true,
  p_can_view_photos boolean DEFAULT false,
  p_can_view_financials boolean DEFAULT false,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
  v_new_id uuid;
BEGIN
  -- Insert the portal job access record
  INSERT INTO public.portal_job_access (
    portal_user_id,
    job_id,
    can_view_schedule,
    can_view_documents,
    can_view_photos,
    can_view_financials,
    notes,
    created_by,
    created_at
  ) VALUES (
    p_portal_user_id,
    p_job_id,
    p_can_view_schedule,
    p_can_view_documents,
    p_can_view_photos,
    p_can_view_financials,
    p_notes,
    NULL, -- created_by is NULL for office operations (PIN-based auth)
    now()
  )
  RETURNING id INTO v_new_id;

  -- Return the newly created record as JSON
  SELECT jsonb_build_object(
    'id', pja.id,
    'portal_user_id', pja.portal_user_id,
    'job_id', pja.job_id,
    'can_view_schedule', pja.can_view_schedule,
    'can_view_documents', pja.can_view_documents,
    'can_view_photos', pja.can_view_photos,
    'can_view_financials', pja.can_view_financials,
    'notes', pja.notes,
    'created_at', pja.created_at
  )
  INTO v_result
  FROM public.portal_job_access pja
  WHERE pja.id = v_new_id;

  RETURN v_result;
END;
$$;

-- =====================================================================
-- 2. Update Portal Job Access
-- =====================================================================
CREATE OR REPLACE FUNCTION public.office_update_portal_job_access(
  p_id uuid,
  p_can_view_schedule boolean DEFAULT NULL,
  p_can_view_documents boolean DEFAULT NULL,
  p_can_view_photos boolean DEFAULT NULL,
  p_can_view_financials boolean DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
BEGIN
  -- Update the portal job access record (only update non-NULL params)
  UPDATE public.portal_job_access
  SET
    can_view_schedule = COALESCE(p_can_view_schedule, can_view_schedule),
    can_view_documents = COALESCE(p_can_view_documents, can_view_documents),
    can_view_photos = COALESCE(p_can_view_photos, can_view_photos),
    can_view_financials = COALESCE(p_can_view_financials, can_view_financials),
    notes = COALESCE(p_notes, notes)
  WHERE id = p_id;

  -- Return the updated record as JSON
  SELECT jsonb_build_object(
    'id', pja.id,
    'portal_user_id', pja.portal_user_id,
    'job_id', pja.job_id,
    'can_view_schedule', pja.can_view_schedule,
    'can_view_documents', pja.can_view_documents,
    'can_view_photos', pja.can_view_photos,
    'can_view_financials', pja.can_view_financials,
    'notes', pja.notes,
    'created_at', pja.created_at
  )
  INTO v_result
  FROM public.portal_job_access pja
  WHERE pja.id = p_id;

  RETURN v_result;
END;
$$;

-- =====================================================================
-- 3. Delete Portal Job Access
-- =====================================================================
CREATE OR REPLACE FUNCTION public.office_delete_portal_job_access(
  p_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deleted_count integer;
BEGIN
  -- Delete the portal job access record
  DELETE FROM public.portal_job_access
  WHERE id = p_id;

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  -- Return deletion status
  RETURN jsonb_build_object(
    'success', v_deleted_count > 0,
    'deleted_id', p_id,
    'deleted_count', v_deleted_count
  );
END;
$$;

-- =====================================================================
-- 4. List Portal Job Access for Subcontractor
-- =====================================================================
-- Returns all job access records for a portal user with nested job data
CREATE OR REPLACE FUNCTION public.office_list_portal_job_access_for_sub(
  p_portal_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
BEGIN
  -- Get all portal_job_access records with nested job data
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', pja.id,
      'portal_user_id', pja.portal_user_id,
      'job_id', pja.job_id,
      'can_view_schedule', pja.can_view_schedule,
      'can_view_documents', pja.can_view_documents,
      'can_view_photos', pja.can_view_photos,
      'can_view_financials', pja.can_view_financials,
      'notes', pja.notes,
      'created_at', pja.created_at,
      'job', jsonb.*build_object(
        'id', j.id,
        'job_number', j.job_number,
        'name', j.name,
        'client_name', j.client_name,
        'address', j.address,
        'status', j.status,
        'projected_start_date', j.projected_start_date,
        'projected_end_date', j.projected_end_date,
        'description', j.description,
        'created_at', j.created_at
      )
    )
    ORDER BY j.job_number DESC, j.created_at DESC
  )
  INTO v_result
  FROM public.portal_job_access pja
  INNER JOIN public.jobs j ON pja.job_id = j.id
  WHERE pja.portal_user_id = p_portal_user_id;

  -- Return empty array if no records found
  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

-- =====================================================================
-- Grant Execute Permissions
-- =====================================================================
GRANT EXECUTE ON FUNCTION public.office_insert_portal_job_access(uuid, uuid, boolean, boolean, boolean, boolean, text) TO anon;
GRANT EXECUTE ON FUNCTION public.office_insert_portal_job_access(uuid, uuid, boolean, boolean, boolean, boolean, text) TO authenticated;

GRANT EXECUTE ON FUNCTION public.office_update_portal_job_access(uuid, boolean, boolean, boolean, boolean, text) TO anon;
GRANT EXECUTE ON FUNCTION public.office_update_portal_job_access(uuid, boolean, boolean, boolean, boolean, text) TO authenticated;

GRANT EXECUTE ON FUNCTION public.office_delete_portal_job_access(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.office_delete_portal_job_access(uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.office_list_portal_job_access_for_sub(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.office_list_portal_job_access_for_sub(uuid) TO authenticated;

-- =====================================================================
-- Reload PostgREST Schema Cache
-- =====================================================================
NOTIFY pgrst, 'reload schema';
