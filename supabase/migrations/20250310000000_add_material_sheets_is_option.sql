-- Ensure is_option column exists on material_sheets for optional proposal sections.
-- The create script already includes this column; this migration is for existing databases
-- that were created before the column was added.
ALTER TABLE material_sheets
  ADD COLUMN IF NOT EXISTS is_option boolean DEFAULT false;

NOTIFY pgrst, 'reload schema';
