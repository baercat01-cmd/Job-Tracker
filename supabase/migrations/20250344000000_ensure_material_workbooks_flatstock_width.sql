-- Re-ensure column exists: PostgREST "schema cache" errors occur when this column is missing
-- (e.g. DB restored from backup, or migration history out of sync with actual schema).
ALTER TABLE public.material_workbooks
  ADD COLUMN IF NOT EXISTS flatstock_width_inches integer NULL;

COMMENT ON COLUMN public.material_workbooks.flatstock_width_inches IS 'Width in inches of flatstock used for trim on this workbook (e.g. 41 or 42). Used on Trim & flatstock order.';
