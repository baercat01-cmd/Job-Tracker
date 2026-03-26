-- PostgREST / OnSpace: single-parameter jsonb RPCs register in the schema cache more reliably
-- than multi-argument office_create_building_plan / office_update_building_plan.

CREATE OR REPLACE FUNCTION public.office_create_building_plan_json(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_job_id uuid;
  v_quote_id uuid;
  v_name text;
  v_model jsonb;
  v_user_id uuid;
  v_row jsonb;
BEGIN
  v_job_id := (NULLIF(TRIM(COALESCE(p_payload->>'p_job_id', '')), ''))::uuid;
  v_quote_id := (NULLIF(TRIM(COALESCE(p_payload->>'p_quote_id', '')), ''))::uuid;
  v_name := COALESCE(NULLIF(TRIM(COALESCE(p_payload->>'p_name', '')), ''), 'New plan');
  v_model := COALESCE(p_payload->'p_model_json', '{}'::jsonb);
  v_user_id := (NULLIF(TRIM(COALESCE(p_payload->>'p_user_id', '')), ''))::uuid;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Missing user id';
  END IF;

  INSERT INTO public.building_plans (job_id, quote_id, name, model_json, created_by, updated_at)
  VALUES (v_job_id, v_quote_id, v_name, v_model, v_user_id, now())
  RETURNING to_jsonb(building_plans.*) INTO v_row;

  INSERT INTO public.building_plan_versions (plan_id, model_json, created_by)
  VALUES ((v_row->>'id')::uuid, (v_row->'model_json'), v_user_id);

  RETURN v_row;
END;
$fn$;

REVOKE ALL ON FUNCTION public.office_create_building_plan_json(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.office_create_building_plan_json(jsonb) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.office_update_building_plan_json(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_plan_id uuid;
  v_name text;
  v_user_id uuid;
  v_row jsonb;
BEGIN
  v_plan_id := (NULLIF(TRIM(COALESCE(p_payload->>'p_plan_id', '')), ''))::uuid;
  v_name := p_payload->>'p_name';
  v_user_id := (NULLIF(TRIM(COALESCE(p_payload->>'p_user_id', '')), ''))::uuid;

  IF v_plan_id IS NULL THEN
    RAISE EXCEPTION 'Missing plan id';
  END IF;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Missing user id';
  END IF;

  UPDATE public.building_plans
  SET
    model_json = COALESCE(p_payload->'p_model_json', model_json),
    name = COALESCE(NULLIF(TRIM(v_name), ''), name),
    updated_at = now()
  WHERE id = v_plan_id
  RETURNING to_jsonb(building_plans.*) INTO v_row;

  IF v_row IS NULL THEN
    RAISE EXCEPTION 'Plan not found';
  END IF;

  INSERT INTO public.building_plan_versions (plan_id, model_json, created_by)
  VALUES (v_plan_id, (v_row->'model_json'), v_user_id);

  RETURN v_row;
END;
$fn$;

REVOKE ALL ON FUNCTION public.office_update_building_plan_json(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.office_update_building_plan_json(jsonb) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.office_list_building_plans_for_job_json(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_job_id uuid;
BEGIN
  v_job_id := (NULLIF(TRIM(COALESCE(p_payload->>'p_job_id', '')), ''))::uuid;
  RETURN COALESCE((
    SELECT (json_agg(to_jsonb(p) ORDER BY p.updated_at DESC))::jsonb
    FROM public.building_plans p
    WHERE p.job_id = v_job_id
  ), '[]'::jsonb);
END;
$fn$;

REVOKE ALL ON FUNCTION public.office_list_building_plans_for_job_json(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.office_list_building_plans_for_job_json(jsonb) TO anon, authenticated;

COMMENT ON FUNCTION public.office_create_building_plan_json(jsonb) IS 'OnSpace-friendly create plan; payload keys: p_job_id, p_quote_id, p_name, p_model_json, p_user_id.';
COMMENT ON FUNCTION public.office_update_building_plan_json(jsonb) IS 'OnSpace-friendly update plan; payload keys: p_plan_id, p_model_json, p_name, p_user_id.';
COMMENT ON FUNCTION public.office_list_building_plans_for_job_json(jsonb) IS 'OnSpace-friendly list plans; payload key: p_job_id.';

SELECT pg_notify('pgrst', 'reload schema');
