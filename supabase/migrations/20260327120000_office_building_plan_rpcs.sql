-- Office-friendly building plan RPCs (local PIN auth environments often have no auth.uid()).
-- These SECURITY DEFINER functions bypass RLS and accept the app's user_profiles.id as p_user_id.
-- They are intentionally simple and rely on app-level controls.

CREATE OR REPLACE FUNCTION public.office_create_building_plan(
  p_job_id uuid,
  p_quote_id uuid,
  p_name text,
  p_model_json jsonb,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row jsonb;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Missing user id';
  END IF;

  INSERT INTO public.building_plans (job_id, quote_id, name, model_json, created_by, updated_at)
  VALUES (
    p_job_id,
    p_quote_id,
    COALESCE(NULLIF(TRIM(p_name), ''), 'New plan'),
    COALESCE(p_model_json, '{}'::jsonb),
    p_user_id,
    now()
  )
  RETURNING to_jsonb(building_plans.*) INTO v_row;

  INSERT INTO public.building_plan_versions (plan_id, model_json, created_by)
  VALUES ((v_row->>'id')::uuid, (v_row->'model_json'), p_user_id);

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.office_create_building_plan(uuid, uuid, text, jsonb, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.office_create_building_plan(uuid, uuid, text, jsonb, uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.office_update_building_plan(
  p_plan_id uuid,
  p_model_json jsonb,
  p_name text,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row jsonb;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Missing user id';
  END IF;

  UPDATE public.building_plans
  SET
    model_json = COALESCE(p_model_json, model_json),
    name = COALESCE(NULLIF(TRIM(p_name), ''), name),
    updated_at = now()
  WHERE id = p_plan_id
  RETURNING to_jsonb(building_plans.*) INTO v_row;

  IF v_row IS NULL THEN
    RAISE EXCEPTION 'Plan not found';
  END IF;

  INSERT INTO public.building_plan_versions (plan_id, model_json, created_by)
  VALUES (p_plan_id, (v_row->'model_json'), p_user_id);

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.office_update_building_plan(uuid, jsonb, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.office_update_building_plan(uuid, jsonb, text, uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.office_list_building_plans_for_job(p_job_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((json_agg(to_jsonb(p) ORDER BY p.updated_at DESC))::jsonb, '[]'::jsonb)
  FROM public.building_plans p
  WHERE p.job_id = p_job_id;
$$;

REVOKE ALL ON FUNCTION public.office_list_building_plans_for_job(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.office_list_building_plans_for_job(uuid) TO anon, authenticated;

COMMENT ON FUNCTION public.office_create_building_plan IS 'Office create building plan (no auth.uid); links to job/quote; snapshots version.';
COMMENT ON FUNCTION public.office_update_building_plan IS 'Office update building plan (no auth.uid); snapshots version.';
COMMENT ON FUNCTION public.office_list_building_plans_for_job IS 'Office list plans for a job.';

SELECT pg_notify('pgrst', 'reload schema');

