-- ============================================================
-- Portal Job Access JSON RPCs for OnSpace API
-- ============================================================
-- OnSpace backend (*.backend.onspace.ai) does NOT serve Edge Functions,
-- so we need Postgres RPCs with JSON payloads to avoid PostgREST's
-- multi-argument function caching issues.
--
-- Creates:
--   office_portal_job_access_insert_json(jsonb)
--   office_portal_job_access_update_json(uuid, jsonb)
--   office_portal_job_access_delete_json(uuid)
--   office_portal_job_access_list_json(uuid)
--
-- SECURITY DEFINER bypasses RLS, allowing office app (no auth.uid()) to manage.
-- ============================================================

-- 1) INSERT portal job access
CREATE OR REPLACE FUNCTION public.office_portal_job_access_insert_json(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id uuid;
  portal_user_id_val uuid;
  job_id_val uuid;
BEGIN
  -- Extract required fields
  portal_user_id_val := (payload->>'portal_user_id')::uuid;
  job_id_val := (payload->>'job_id')::uuid;

  IF portal_user_id_val IS NULL OR job_id_val IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Missing portal_user_id or job_id'
    );
  END IF;

  -- Insert with all fields from payload
  INSERT INTO public.portal_job_access (
    portal_user_id,
    job_id,
    can_view_schedule,
    can_view_documents,
    can_view_photos,
    can_view_financials,
    notes,
    created_by
  )
  VALUES (
    portal_user_id_val,
    job_id_val,
    COALESCE((payload->>'can_view_schedule')::boolean, true),
    COALESCE((payload->>'can_view_documents')::boolean, true),
    COALESCE((payload->>'can_view_photos')::boolean, false),
    COALESCE((payload->>'can_view_financials')::boolean, false),
    payload->>'notes',
    NULLIF(payload->>'created_by', '')::uuid
  )
  RETURNING id INTO new_id;

  RETURN jsonb_build_object(
    'ok', true,
    'id', new_id
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'ok', false,
    'error', SQLERRM
  );
END;
$$;

-- 2) UPDATE portal job access
CREATE OR REPLACE FUNCTION public.office_portal_job_access_update_json(
  access_id uuid,
  payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_count int;
BEGIN
  IF access_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Missing access_id'
    );
  END IF;

  -- Update only provided fields
  UPDATE public.portal_job_access
  SET
    can_view_schedule = COALESCE((payload->>'can_view_schedule')::boolean, can_view_schedule),
    can_view_documents = COALESCE((payload->>'can_view_documents')::boolean, can_view_documents),
    can_view_photos = COALESCE((payload->>'can_view_photos')::boolean, can_view_photos),
    can_view_financials = COALESCE((payload->>'can_view_financials')::boolean, can_view_financials),
    notes = COALESCE(payload->>'notes', notes)
  WHERE id = access_id;

  GET DIAGNOSTICS updated_count = ROW_COUNT;

  IF updated_count = 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'No row found with that id'
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'id', access_id
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'ok', false,
    'error', SQLERRM
  );
END;
$$;

-- 3) DELETE portal job access
CREATE OR REPLACE FUNCTION public.office_portal_job_access_delete_json(access_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count int;
BEGIN
  IF access_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Missing access_id'
    );
  END IF;

  DELETE FROM public.portal_job_access
  WHERE id = access_id;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  IF deleted_count = 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'No row found with that id'
    );
  END IF;

  RETURN jsonb_build_object('ok', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'ok', false,
    'error', SQLERRM
  );
END;
$$;

-- 4) LIST portal job access for a subcontractor (with nested jobs)
CREATE OR REPLACE FUNCTION public.office_portal_job_access_list_json(p_portal_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF p_portal_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Missing portal_user_id'
    );
  END IF;

  SELECT jsonb_build_object(
    'ok', true,
    'rows', COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', pja.id,
        'portal_user_id', pja.portal_user_id,
        'job_id', pja.job_id,
        'can_view_schedule', pja.can_view_schedule,
        'can_view_documents', pja.can_view_documents,
        'can_view_photos', pja.can_view_photos,
        'can_view_financials', pja.can_view_financials,
        'notes', pja.notes,
        'created_by', pja.created_by,
        'created_at', pja.created_at,
        'jobs', jsonb_build_object(
          'id', j.id,
          'name', j.name,
          'job_number', j.job_number,
          'client_name', j.client_name,
          'address', j.address,
          'status', j.status,
          'projected_start_date', j.projected_start_date,
          'projected_end_date', j.projected_end_date,
          'description', j.description
        )
      )
    ), '[]'::jsonb)
  ) INTO result
  FROM public.portal_job_access pja
  LEFT JOIN public.jobs j ON j.id = pja.job_id
  WHERE pja.portal_user_id = p_portal_user_id;

  RETURN result;
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'ok', false,
    'error', SQLERRM
  );
END;
$$;

-- Grant execute to anon and authenticated
GRANT EXECUTE ON FUNCTION public.office_portal_job_access_insert_json(jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.office_portal_job_access_update_json(uuid, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.office_portal_job_access_delete_json(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.office_portal_job_access_list_json(uuid) TO anon, authenticated;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';

-- Verify functions exist
-- SELECT proname FROM pg_proc WHERE proname LIKE 'office_portal_job_access%';
