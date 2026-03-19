-- Shared trim slitting plan (office / shop / crew) and per-line cut progress.

ALTER TABLE public.material_workbooks
  ADD COLUMN IF NOT EXISTS trim_flatstock_plan jsonb NULL;

COMMENT ON COLUMN public.material_workbooks.trim_flatstock_plan IS
  'Width-only slitting plan JSON (version 1). Regenerate after coil width, quantities, or trim links change.';

ALTER TABLE public.material_items
  ADD COLUMN IF NOT EXISTS trim_cut_state text NOT NULL DEFAULT 'pending';

ALTER TABLE public.material_items
  DROP CONSTRAINT IF EXISTS material_items_trim_cut_state_check;

ALTER TABLE public.material_items
  ADD CONSTRAINT material_items_trim_cut_state_check
  CHECK (trim_cut_state IN ('pending', 'in_progress', 'cut_complete'));

COMMENT ON COLUMN public.material_items.trim_cut_state IS
  'Shop/field progress for trim slitting: pending | in_progress | cut_complete.';
