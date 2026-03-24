-- PostgREST / OnSpace: single-parameter RPCs (jsonb) show up in schema cache more reliably
-- than 11-argument office_insert_portal_job_access.

CREATE OR REPLACE FUNCTION public.office_portal_job_access_insert_json(p_row jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF to_regclass('public.portal_job_access') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Table portal_job_access does not exist');
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
    (p_row->>'portal_user_id')::uuid,
    (p_row->>'job_id')::uuid,
    coalesce((p_row->>'can_view_schedule')::boolean, true),
    coalesce((p_row->>'can_view_documents')::boolean, true),
    coalesce((p_row->>'can_view_photos')::boolean, false),
    coalesce((p_row->>'can_view_financials')::boolean, false),
    coalesce((p_row->>'can_view_proposal')::boolean, false),
    coalesce((p_row->>'can_view_materials')::boolean, false),
    coalesce((p_row->>'can_edit_schedule')::boolean, false),
    NULLIF(TRIM(COALESCE(p_row->>'notes', '')), ''),
    CASE
      WHEN p_row->>'created_by' IS NOT NULL AND length(trim(p_row->>'created_by')) > 0
        THEN (p_row->>'created_by')::uuid
      ELSE NULL
    END
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
EXCEPTION
  WHEN SQLSTATE '42703' THEN
    INSERT INTO public.portal_job_access (
      portal_user_id,
      job_id,
      can_view_schedule,
      can_view_documents,
      can_view_photos,
      can_view_financials,
      notes,
      created_by
    ) VALUES (
      (p_row->>'portal_user_id')::uuid,
      (p_row->>'job_id')::uuid,
      coalesce((p_row->>'can_view_schedule')::boolean, true),
      coalesce((p_row->>'can_view_documents')::boolean, true),
      coalesce((p_row->>'can_view_photos')::boolean, false),
      coalesce((p_row->>'can_view_financials')::boolean, false),
      NULLIF(TRIM(COALESCE(p_row->>'notes', '')), ''),
      CASE
        WHEN p_row->>'created_by' IS NOT NULL AND length(trim(p_row->>'created_by')) > 0
          THEN (p_row->>'created_by')::uuid
        ELSE NULL
      END
    )
    RETURNING id INTO v_id;
    RETURN jsonb_build_object('ok', true, 'id', v_id);
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public.office_portal_job_access_update_json(p_id uuid, p_patch jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.portal_job_access SET
    can_view_schedule = CASE WHEN p_patch ? 'can_view_schedule' THEN (p_patch->>'can_view_schedule')::boolean ELSE can_view_schedule END,
    can_view_documents = CASE WHEN p_patch ? 'can_view_documents' THEN (p_patch->>'can_view_documents')::boolean ELSE can_view_documents END,
    can_view_photos = CASE WHEN p_patch ? 'can_view_photos' THEN (p_patch->>'can_view_photos')::boolean ELSE can_view_photos END,
    can_view_financials = CASE WHEN p_patch ? 'can_view_financials' THEN (p_patch->>'can_view_financials')::boolean ELSE can_view_financials END,
    can_view_proposal = CASE WHEN p_patch ? 'can_view_proposal' THEN (p_patch->>'can_view_proposal')::boolean ELSE can_view_proposal END,
    can_view_materials = CASE WHEN p_patch ? 'can_view_materials' THEN (p_patch->>'can_view_materials')::boolean ELSE can_view_materials END,
    can_edit_schedule = CASE WHEN p_patch ? 'can_edit_schedule' THEN (p_patch->>'can_edit_schedule')::boolean ELSE can_edit_schedule END,
    notes = CASE
      WHEN p_patch ? 'notes' THEN
        CASE WHEN p_patch->'notes' IS NULL OR jsonb_typeof(p_patch->'notes') = 'null' THEN NULL ELSE p_patch->>'notes' END
      ELSE notes
    END,
    updated_at = now()
  WHERE id = p_id;

  RETURN jsonb_build_object('ok', true);
EXCEPTION
  WHEN SQLSTATE '42703' THEN
    UPDATE public.portal_job_access SET
      can_view_schedule = CASE WHEN p_patch ? 'can_view_schedule' THEN (p_patch->>'can_view_schedule')::boolean ELSE can_view_schedule END,
      can_view_documents = CASE WHEN p_patch ? 'can_view_documents' THEN (p_patch->>'can_view_documents')::boolean ELSE can_view_documents END,
      can_view_photos = CASE WHEN p_patch ? 'can_view_photos' THEN (p_patch->>'can_view_photos')::boolean ELSE can_view_photos END,
      can_view_financials = CASE WHEN p_patch ? 'can_view_financials' THEN (p_patch->>'can_view_financials')::boolean ELSE can_view_financials END,
      notes = CASE
        WHEN p_patch ? 'notes' THEN
          CASE WHEN p_patch->'notes' IS NULL OR jsonb_typeof(p_patch->'notes') = 'null' THEN NULL ELSE p_patch->>'notes' END
        ELSE notes
      END,
      updated_at = now()
    WHERE id = p_id;
    RETURN jsonb_build_object('ok', true);
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public.office_portal_job_access_delete_json(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.portal_job_access WHERE id = p_id;
  RETURN jsonb_build_object('ok', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public.office_portal_job_access_list_json(p_portal_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  result jsonb;
BEGIN
  IF to_regclass('public.portal_job_access') IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT coalesce((json_agg(row_to_json(q)))::jsonb, '[]'::jsonb) INTO result
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

  RETURN coalesce(result, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.office_portal_job_access_insert_json(jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.office_portal_job_access_update_json(uuid, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.office_portal_job_access_delete_json(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.office_portal_job_access_list_json(uuid) TO anon, authenticated;
