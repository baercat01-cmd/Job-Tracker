-- Add default trim drawing column to materials_catalog
-- Allows each catalog SKU to have a default trim configuration that is automatically
-- linked to material items when they are added from the catalog

ALTER TABLE public.materials_catalog
  ADD COLUMN IF NOT EXISTS default_trim_saved_config_id uuid 
  REFERENCES public.trim_saved_configs(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.materials_catalog.default_trim_saved_config_id IS 
  'Default trim drawing for this SKU; when material is added from catalog, the new line item is linked to this config.';

-- Reload schema cache so API sees the new column immediately
NOTIFY pgrst, 'reload schema';
