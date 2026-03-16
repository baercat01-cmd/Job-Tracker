-- Add flatstock width (inches) to material_workbooks so Trim & flatstock order can record 41" vs 42" wide.
ALTER TABLE material_workbooks
  ADD COLUMN IF NOT EXISTS flatstock_width_inches integer NULL;

COMMENT ON COLUMN material_workbooks.flatstock_width_inches IS 'Width in inches of flatstock used for trim on this workbook (e.g. 41 or 42). Used on Trim & flatstock order.';
