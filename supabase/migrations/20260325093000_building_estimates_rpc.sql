-- Allow estimator saves through an RPC to bypass RLS on building_estimates.
-- Matches the app's local PIN auth (not Supabase Auth), so direct INSERT is often blocked by RLS.

CREATE OR REPLACE FUNCTION public.create_building_estimate(
  p_quote_id uuid,
  p_width numeric,
  p_length numeric,
  p_height numeric,
  p_pitch numeric,
  p_model_data jsonb,
  p_calculated_materials jsonb,
  p_estimated_cost numeric,
  p_created_by uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row jsonb;
BEGIN
  INSERT INTO public.building_estimates (
    quote_id,
    width,
    length,
    height,
    pitch,
    model_data,
    calculated_materials,
    estimated_cost,
    created_by
  ) VALUES (
    p_quote_id,
    p_width,
    p_length,
    p_height,
    p_pitch,
    coalesce(p_model_data, '{}'::jsonb),
    coalesce(p_calculated_materials, '{}'::jsonb),
    p_estimated_cost,
    p_created_by
  )
  RETURNING to_jsonb(building_estimates.*) INTO v_row;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_building_estimate(uuid, numeric, numeric, numeric, numeric, jsonb, jsonb, numeric, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.create_building_estimate(uuid, numeric, numeric, numeric, numeric, jsonb, jsonb, numeric, uuid) TO authenticated;

COMMENT ON FUNCTION public.create_building_estimate IS 'Insert into building_estimates via RPC to bypass RLS for estimator saves.';

SELECT pg_notify('pgrst', 'reload schema');

