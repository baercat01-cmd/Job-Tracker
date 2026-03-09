-- Fix: material_items columns too narrow for quantity/price.
-- In Supabase: SQL Editor → New query → paste this ENTIRE file → click Run.
-- You must run all 6 lines. If "Run" only runs one, run the block again until no errors.

ALTER TABLE public.material_items ALTER COLUMN quantity       TYPE numeric USING quantity::numeric;
ALTER TABLE public.material_items ALTER COLUMN cost_per_unit  TYPE numeric USING cost_per_unit::numeric;
ALTER TABLE public.material_items ALTER COLUMN price_per_unit TYPE numeric USING price_per_unit::numeric;
ALTER TABLE public.material_items ALTER COLUMN extended_cost  TYPE numeric USING extended_cost::numeric;
ALTER TABLE public.material_items ALTER COLUMN extended_price TYPE numeric USING extended_price::numeric;
ALTER TABLE public.material_items ALTER COLUMN markup_percent TYPE numeric USING markup_percent::numeric;
