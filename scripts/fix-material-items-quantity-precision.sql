-- Fix: material_items.quantity was typed as numeric(5,4) which only allows
-- values up to 9.9999. This widens the relevant numeric columns so crew can
-- request quantities of 10 or more.
--
-- Run this once in the Supabase SQL Editor.

-- Widen quantity to unrestricted numeric (or use numeric(12,4) for 4 decimal places)
ALTER TABLE public.material_items
  ALTER COLUMN quantity TYPE numeric(12, 4);

-- Also widen the other numeric columns in case they have similar narrow definitions
ALTER TABLE public.material_items
  ALTER COLUMN cost_per_unit    TYPE numeric(14, 4),
  ALTER COLUMN price_per_unit   TYPE numeric(14, 4),
  ALTER COLUMN extended_cost    TYPE numeric(18, 4),
  ALTER COLUMN extended_price   TYPE numeric(18, 4),
  ALTER COLUMN markup_percent   TYPE numeric(10, 4);
