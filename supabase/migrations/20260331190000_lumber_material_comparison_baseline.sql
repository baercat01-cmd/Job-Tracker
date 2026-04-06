-- Optional vendor to use as the comparison anchor for pricing tables (instead of always using mathematical lowest).
ALTER TABLE public.lumber_rebar_materials
  ADD COLUMN IF NOT EXISTS comparison_baseline_vendor_id uuid REFERENCES public.lumber_rebar_vendors(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.lumber_rebar_materials.comparison_baseline_vendor_id IS
  'When set, vendor comparison Δ columns use this vendor''s latest price as baseline; when null, use lowest quoted price.';
