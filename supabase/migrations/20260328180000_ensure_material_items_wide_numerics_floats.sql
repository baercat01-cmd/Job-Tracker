-- Widen numeric + float columns on material_items (legacy numeric(5,4) and any real/float qty columns).
-- information_schema only lists float types as double precision / real, not numeric — include them so RPC never skips a constrained column.

CREATE OR REPLACE FUNCTION public.ensure_material_items_wide_numerics()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'material_items'
      AND data_type IN ('numeric', 'double precision', 'real')
    ORDER BY ordinal_position
  LOOP
    EXECUTE format(
      'ALTER TABLE public.material_items ALTER COLUMN %I TYPE numeric USING %I::numeric',
      r.column_name,
      r.column_name
    );
  END LOOP;

  RETURN jsonb_build_object('ok', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$fn$;

COMMENT ON FUNCTION public.ensure_material_items_wide_numerics() IS
  'Widens all numeric and float columns on material_items to unconstrained numeric (fixes Excel upload overflow).';

GRANT EXECUTE ON FUNCTION public.ensure_material_items_wide_numerics() TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_material_items_wide_numerics() TO service_role;

NOTIFY pgrst, 'reload schema';
