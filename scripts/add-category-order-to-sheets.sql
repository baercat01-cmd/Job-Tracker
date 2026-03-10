-- Add category_order column to material_sheets
-- This stores a JSON array of category names in the user-defined display order for each sheet.
-- Example: ["Doors", "Windows", "Trim", "Fasteners"]
-- Categories not present in the array are appended at the end in their natural workbook order.

ALTER TABLE public.material_sheets
  ADD COLUMN IF NOT EXISTS category_order jsonb;

-- No index needed; this is a small JSON array read once per sheet load.

NOTIFY pgrst, 'reload schema';
