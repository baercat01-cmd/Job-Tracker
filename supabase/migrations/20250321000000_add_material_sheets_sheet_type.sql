-- Add sheet_type column to material_sheets
-- Enables separation of proposal sheets from change order sheets

ALTER TABLE public.material_sheets
  ADD COLUMN IF NOT EXISTS sheet_type text NOT NULL DEFAULT 'proposal';

-- Add constraint to ensure valid values
ALTER TABLE public.material_sheets
  DROP CONSTRAINT IF EXISTS material_sheets_sheet_type_check;

ALTER TABLE public.material_sheets
  ADD CONSTRAINT material_sheets_sheet_type_check
  CHECK (sheet_type IN ('proposal', 'change_order'));

-- Add index for filtering by sheet type
CREATE INDEX IF NOT EXISTS idx_material_sheets_sheet_type
  ON public.material_sheets(sheet_type);

COMMENT ON COLUMN public.material_sheets.sheet_type IS 
  'Type of sheet: proposal (included in base proposal total) or change_order (additional work, shown separately to customer)';

NOTIFY pgrst, 'reload schema';
