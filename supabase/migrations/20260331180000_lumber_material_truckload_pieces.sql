-- Pieces per full truck for this SKU (e.g. 2646 for 2x4). Used for vendor comparison truck totals.
ALTER TABLE public.lumber_rebar_materials
  ADD COLUMN IF NOT EXISTS truckload_pieces integer;

COMMENT ON COLUMN public.lumber_rebar_materials.truckload_pieces IS
  'Optional count of pieces per truckload for this material; drives “extra vs low” truck $ in pricing UI.';
