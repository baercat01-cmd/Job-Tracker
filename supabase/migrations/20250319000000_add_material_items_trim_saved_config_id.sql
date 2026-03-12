-- Link workbook material items to trim drawings (trim_saved_configs) so shop can view the drawing when pulling.
ALTER TABLE public.material_items
  ADD COLUMN IF NOT EXISTS trim_saved_config_id uuid REFERENCES public.trim_saved_configs(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.material_items.trim_saved_config_id IS 'When set, this material item is custom trim; shop can view the linked trim drawing in pull form.';
