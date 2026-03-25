-- Expose plan version history via share token (view-only allowed).
-- Used by the shared plan UI to show basic change history.

CREATE OR REPLACE FUNCTION public.get_building_plan_versions_by_token(p_token text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(to_jsonb(v) ORDER BY v.created_at DESC), '[]'::jsonb)
  FROM (
    SELECT pv.id, pv.plan_id, pv.created_at
    FROM public.building_plan_shares s
    JOIN public.building_plan_versions pv ON pv.plan_id = s.plan_id
    WHERE s.token = p_token
      AND s.is_active = true
      AND (s.expires_at IS NULL OR s.expires_at > now())
    ORDER BY pv.created_at DESC
    LIMIT 50
  ) v;
$$;

GRANT EXECUTE ON FUNCTION public.get_building_plan_versions_by_token(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_building_plan_versions_by_token(text) TO authenticated;

COMMENT ON FUNCTION public.get_building_plan_versions_by_token(text) IS 'Return recent plan version timestamps for a shared plan token.';

NOTIFY pgrst, 'reload schema';

