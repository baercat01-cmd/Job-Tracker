-- Subcontractor hub: create public.portal_users row for a subcontractors row without relying on
-- direct REST inserts (RLS on portal_users often blocks the office app).
-- Body: { "subcontractor_id": "<uuid>", "created_by": "<uuid or omit>" }
-- Returns: { "ok": true, "id": "<portal_users uuid>" } | { "ok": false, "error": "..." }

CREATE OR REPLACE FUNCTION public.office_portal_user_ensure_for_subcontractor_json(p_row jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub_id uuid := NULLIF(trim(p_row->>'subcontractor_id'), '')::uuid;
  v_created_by uuid := NULL;
  v_username text;
  v_existing uuid;
  v_email text;
  v_name text;
  v_company text;
  v_new_id uuid;
BEGIN
  IF v_sub_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'subcontractor_id required');
  END IF;

  IF p_row ? 'created_by' AND length(trim(coalesce(p_row->>'created_by', ''))) > 0 THEN
    v_created_by := (p_row->>'created_by')::uuid;
  END IF;

  v_username := 'sub:' || v_sub_id::text;

  SELECT pu.id INTO v_existing
  FROM public.portal_users pu
  WHERE pu.username = v_username AND pu.user_type = 'subcontractor'
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'id', v_existing);
  END IF;

  SELECT s.name, s.company_name, s.email
 INTO v_name, v_company, v_email
  FROM public.subcontractors s
  WHERE s.id = v_sub_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Subcontractor not found');
  END IF;

  v_email := CASE
    WHEN v_email IS NOT NULL AND length(trim(v_email)) > 0 THEN trim(v_email)
    ELSE 'subcontractor.' || replace(v_sub_id::text, '-', '') || '@portal.internal'
  END;

  INSERT INTO public.portal_users (
    user_type,
    email,
    username,
    password_hash,
    full_name,
    company_name,
    created_by,
    is_active
  ) VALUES (
    'subcontractor',
    v_email,
    v_username,
    '—',
    coalesce(nullif(trim(v_name), ''), 'Subcontractor'),
    nullif(trim(v_company), ''),
    v_created_by,
    true
  )
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object('ok', true, 'id', v_new_id);
EXCEPTION
  WHEN unique_violation THEN
    SELECT pu.id INTO v_existing
    FROM public.portal_users pu
    WHERE pu.username = v_username AND pu.user_type = 'subcontractor'
    LIMIT 1;
    IF v_existing IS NOT NULL THEN
      RETURN jsonb_build_object('ok', true, 'id', v_existing);
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
  WHEN SQLSTATE '42703' THEN
    INSERT INTO public.portal_users (
      user_type,
      email,
      username,
      password_hash,
      full_name,
      company_name,
      created_by
    ) VALUES (
      'subcontractor',
      v_email,
      v_username,
      '—',
      coalesce(nullif(trim(v_name), ''), 'Subcontractor'),
      nullif(trim(v_company), ''),
      v_created_by
    )
    RETURNING id INTO v_new_id;
    RETURN jsonb_build_object('ok', true, 'id', v_new_id);
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.office_portal_user_ensure_for_subcontractor_json(jsonb) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
