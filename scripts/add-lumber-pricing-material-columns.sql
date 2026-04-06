-- Run in Supabase: Dashboard → SQL → New query → paste → Run.
-- Fixes: baseline vendor + pieces/truck not saving (missing columns on lumber_rebar_materials).

ALTER TABLE public.lumber_rebar_materials
  ADD COLUMN IF NOT EXISTS truckload_pieces integer;

ALTER TABLE public.lumber_rebar_materials
  ADD COLUMN IF NOT EXISTS comparison_baseline_vendor_id uuid REFERENCES public.lumber_rebar_vendors(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.lumber_rebar_materials.truckload_pieces IS
  'Pieces per truckload for full-truck vendor comparison in the office UI.';
COMMENT ON COLUMN public.lumber_rebar_materials.comparison_baseline_vendor_id IS
  'Vendor used as price comparison baseline; null = use lowest quote on file.';
