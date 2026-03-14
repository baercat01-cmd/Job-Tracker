-- Add sheet_type to material_sheets: 'proposal' (default) or 'change_order'.
-- Change order sheets are excluded from proposal grand total and shown in a separate customer portal section.
ALTER TABLE material_sheets
  ADD COLUMN IF NOT EXISTS sheet_type text NOT NULL DEFAULT 'proposal'
  CHECK (sheet_type IN ('proposal', 'change_order'));

COMMENT ON COLUMN material_sheets.sheet_type IS 'proposal = part of main proposal total; change_order = separate section, not added to proposal total.';

NOTIFY pgrst, 'reload schema';
