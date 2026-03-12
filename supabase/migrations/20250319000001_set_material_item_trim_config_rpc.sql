-- RPC to set material_items.trim_saved_config_id without hitting client schema cache.
-- Use this for link/unlink trim so "trim_saved_config_id column not in schema cache" is avoided.
CREATE OR REPLACE FUNCTION public.set_material_item_trim_config(
  p_material_item_id uuid,
  p_trim_saved_config_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  UPDATE public.material_items
  SET trim_saved_config_id = p_trim_saved_config_id
  WHERE id = p_material_item_id;
END;
$$;

COMMENT ON FUNCTION public.set_material_item_trim_config(uuid, uuid) IS
  'Set or clear trim_saved_config_id on a material item. Used by app to avoid schema-cache errors when linking trim drawings.';
