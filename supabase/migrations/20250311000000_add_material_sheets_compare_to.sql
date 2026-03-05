-- Add compare_to_sheet_id to material_sheets so an optional section can be
-- linked to a required section for side-by-side price comparison.
ALTER TABLE material_sheets
  ADD COLUMN IF NOT EXISTS compare_to_sheet_id uuid REFERENCES material_sheets(id) ON DELETE SET NULL;

NOTIFY pgrst, 'reload schema';
