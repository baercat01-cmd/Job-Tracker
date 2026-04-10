-- Reusable material line templates (description, default qty, unit cost, markup) for proposal / budget line items.
CREATE TABLE IF NOT EXISTS public.budget_material_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text,
  description text NOT NULL,
  unit_label text,
  default_quantity numeric NOT NULL DEFAULT 1,
  default_unit_cost numeric NOT NULL DEFAULT 0,
  default_markup_percent numeric NOT NULL DEFAULT 10,
  default_taxable boolean NOT NULL DEFAULT true,
  notes text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS budget_material_catalog_sort_idx
  ON public.budget_material_catalog (sort_order, lower(description));

CREATE INDEX IF NOT EXISTS budget_material_catalog_category_idx
  ON public.budget_material_catalog (lower(category));

COMMENT ON TABLE public.budget_material_catalog IS
  'Office-wide reusable material templates for filling proposal line items (budget / customer price options).';

ALTER TABLE public.budget_material_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "budget_material_catalog_authenticated_all" ON public.budget_material_catalog;
CREATE POLICY "budget_material_catalog_authenticated_all"
  ON public.budget_material_catalog
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.budget_material_catalog TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.budget_material_catalog TO service_role;
