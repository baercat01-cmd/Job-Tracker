-- Attach a default trim drawing to catalog materials (by SKU).
-- When trim material is added to a job from catalog, the material item can auto-get this drawing.
ALTER TABLE public.materials_catalog
  ADD COLUMN IF NOT EXISTS default_trim_saved_config_id uuid REFERENCES public.trim_saved_configs(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.materials_catalog.default_trim_saved_config_id IS 'Default trim drawing for this SKU; when material is added from catalog, the new line item can be linked to this config.';
