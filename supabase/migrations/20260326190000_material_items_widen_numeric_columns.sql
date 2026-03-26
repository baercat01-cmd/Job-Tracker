-- Widen material_items numeric columns: legacy numeric(5,4) rejects normal quantities (e.g. 100 fasteners)
-- and re-imported Excel from the app fails with "numeric field overflow".

ALTER TABLE public.material_items
  ALTER COLUMN quantity       TYPE numeric USING quantity::numeric,
  ALTER COLUMN cost_per_unit  TYPE numeric USING cost_per_unit::numeric,
  ALTER COLUMN price_per_unit TYPE numeric USING price_per_unit::numeric,
  ALTER COLUMN extended_cost  TYPE numeric USING extended_cost::numeric,
  ALTER COLUMN extended_price TYPE numeric USING extended_price::numeric,
  ALTER COLUMN markup_percent TYPE numeric USING markup_percent::numeric;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'material_items'
      AND column_name = 'quantity_ready_for_job'
  ) THEN
    ALTER TABLE public.material_items
      ALTER COLUMN quantity_ready_for_job TYPE numeric USING quantity_ready_for_job::numeric;
  END IF;
END $$;
