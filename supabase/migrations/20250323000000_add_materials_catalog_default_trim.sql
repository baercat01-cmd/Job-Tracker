-- Add default trim drawing column to materials_catalog (skip if table missing on this project)
DO $trim_col$
BEGIN
  IF to_regclass('public.materials_catalog') IS NULL THEN
    RETURN;
  END IF;
  IF to_regclass('public.trim_saved_configs') IS NOT NULL THEN
    ALTER TABLE public.materials_catalog
      ADD COLUMN IF NOT EXISTS default_trim_saved_config_id uuid
      REFERENCES public.trim_saved_configs(id) ON DELETE SET NULL;
  ELSE
    ALTER TABLE public.materials_catalog
      ADD COLUMN IF NOT EXISTS default_trim_saved_config_id uuid;
  END IF;
  EXECUTE $doc$
    COMMENT ON COLUMN public.materials_catalog.default_trim_saved_config_id IS
      'Default trim drawing for this SKU; when material is added from catalog, the new line item is linked to this config.'
  $doc$;
END $trim_col$;

NOTIFY pgrst, 'reload schema';
