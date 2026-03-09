-- Add order_requested_at to material_items for crew/field material requests.
-- Run in Supabase SQL Editor if crew ordering fails with "Failed to add material"
-- (inserts were sending this column but it may not exist in older DBs).

ALTER TABLE public.material_items
  ADD COLUMN IF NOT EXISTS order_requested_at timestamptz;

COMMENT ON COLUMN public.material_items.order_requested_at IS 'When the crew/field requested this material (for ordering).';
