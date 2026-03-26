-- Fix numeric(5,4) overflow on material_items (Excel upload, qty > 9.9999, etc.).
-- Widens every numeric column on the table — catches renamed or extra columns.
-- Run in Supabase SQL Editor.

DO $do$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'material_items'
      AND data_type IN ('numeric', 'double precision', 'real')
    ORDER BY ordinal_position
  LOOP
    EXECUTE format(
      'ALTER TABLE public.material_items ALTER COLUMN %I TYPE numeric USING %I::numeric',
      r.column_name,
      r.column_name
    );
  END LOOP;
END $do$;

-- Optional: confirm (numeric columns should show precision/scale as NULL = unconstrained)
SELECT column_name, data_type, numeric_precision, numeric_scale
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'material_items'
  AND data_type IN ('numeric', 'double precision', 'real')
ORDER BY ordinal_position;
