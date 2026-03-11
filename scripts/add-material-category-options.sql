-- Optional sections are stored here (no material_items column needed).
-- Run this in Supabase Dashboard → SQL Editor once. Then the "Option" checkbox will work.
CREATE TABLE IF NOT EXISTS public.material_category_options (
  sheet_id uuid NOT NULL REFERENCES public.material_sheets(id) ON DELETE CASCADE,
  category_name text NOT NULL,
  is_optional boolean NOT NULL DEFAULT true,
  PRIMARY KEY (sheet_id, category_name)
);

ALTER TABLE public.material_category_options ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read for authenticated" ON public.material_category_options;
CREATE POLICY "Allow read for authenticated"
  ON public.material_category_options FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow insert for authenticated" ON public.material_category_options;
CREATE POLICY "Allow insert for authenticated"
  ON public.material_category_options FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow update for authenticated" ON public.material_category_options;
CREATE POLICY "Allow update for authenticated"
  ON public.material_category_options FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow delete for authenticated" ON public.material_category_options;
CREATE POLICY "Allow delete for authenticated"
  ON public.material_category_options FOR DELETE TO authenticated USING (true);

NOTIFY pgrst, 'reload schema';
