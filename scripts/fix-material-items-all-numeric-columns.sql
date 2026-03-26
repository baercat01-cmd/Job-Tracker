-- Fix numeric(5,4) overflow on material_items columns.
-- Uses unrestricted "numeric" so there is no precision limit at all.
-- Run this in Supabase SQL Editor.

ALTER TABLE public.material_items
  ALTER COLUMN quantity       TYPE numeric USING quantity::numeric,
  ALTER COLUMN cost_per_unit  TYPE numeric USING cost_per_unit::numeric,
  ALTER COLUMN price_per_unit TYPE numeric USING price_per_unit::numeric,
  ALTER COLUMN extended_cost  TYPE numeric USING extended_cost::numeric,
  ALTER COLUMN extended_price TYPE numeric USING extended_price::numeric,
  ALTER COLUMN markup_percent TYPE numeric USING markup_percent::numeric;

-- Confirm the changes
SELECT column_name, data_type, numeric_precision, numeric_scale
FROM information_schema.columns
WHERE table_name = 'material_items'
  AND column_name IN ('quantity','cost_per_unit','price_per_unit','extended_cost','extended_price','markup_percent');
