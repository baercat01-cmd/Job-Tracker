-- Ensure labor-related tables accept inserts/updates from the app (anon/authenticated).
-- Run in Supabase SQL Editor if "Add Labor" or sheet labor saves fail or don't persist.
--
-- 1. material_sheet_labor — legacy sheet-level labor (one per sheet)
-- 2. custom_financial_row_items — line items including "Add Labor" from the dropdown (sheet-linked or row-linked)

-- Disable RLS so table grants control access (simplest for app use)
ALTER TABLE IF EXISTS public.material_sheet_labor DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.custom_financial_row_items DISABLE ROW LEVEL SECURITY;

-- Ensure anon and authenticated can read/write (Supabase client uses one of these)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.material_sheet_labor TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.material_sheet_labor TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.material_sheet_labor TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.custom_financial_row_items TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.custom_financial_row_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.custom_financial_row_items TO service_role;

-- Optional: if you prefer to keep RLS enabled, use permissive policies instead of disabling RLS:
-- (Comment out the DISABLE lines above and run the block below.)
/*
ALTER TABLE public.material_sheet_labor ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all material_sheet_labor" ON public.material_sheet_labor;
CREATE POLICY "Allow all material_sheet_labor" ON public.material_sheet_labor FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.custom_financial_row_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all custom_financial_row_items" ON public.custom_financial_row_items;
CREATE POLICY "Allow all custom_financial_row_items" ON public.custom_financial_row_items FOR ALL USING (true) WITH CHECK (true);
*/
