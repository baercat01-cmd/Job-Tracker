-- Let the app fix legacy numeric(5,4) on material_items without manual SQL (workbook Excel upload).
-- SECURITY DEFINER runs with definer rights so ALTER succeeds for authenticated users.

CREATE OR REPLACE FUNCTION public.ensure_material_items_wide_numerics()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  EXECUTE $ddl$
    ALTER TABLE public.material_items
      ALTER COLUMN quantity       TYPE numeric USING quantity::numeric,
      ALTER COLUMN cost_per_unit  TYPE numeric USING cost_per_unit::numeric,
      ALTER COLUMN price_per_unit TYPE numeric USING price_per_unit::numeric,
      ALTER COLUMN extended_cost  TYPE numeric USING extended_cost::numeric,
      ALTER COLUMN extended_price TYPE numeric USING extended_price::numeric,
      ALTER COLUMN markup_percent TYPE numeric USING markup_percent::numeric
  $ddl$;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'material_items'
      AND column_name = 'quantity_ready_for_job'
  ) THEN
    EXECUTE $ddl$
      ALTER TABLE public.material_items
        ALTER COLUMN quantity_ready_for_job TYPE numeric USING quantity_ready_for_job::numeric
    $ddl$;
  END IF;

  RETURN jsonb_build_object('ok', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

COMMENT ON FUNCTION public.ensure_material_items_wide_numerics() IS
  'Widens material_items numeric columns so quantities > 9.9999 (Excel upload) do not overflow. Safe to call repeatedly.';

GRANT EXECUTE ON FUNCTION public.ensure_material_items_wide_numerics() TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_material_items_wide_numerics() TO service_role;

NOTIFY pgrst, 'reload schema';
