-- Run this in Supabase Dashboard → SQL Editor to enable "Mark ready" (partial quantity) in the shop view.
-- This adds the column and function that track how many units are marked ready per material item.

-- 1) Add column to material_items
ALTER TABLE public.material_items
  ADD COLUMN IF NOT EXISTS quantity_ready_for_job integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.material_items.quantity_ready_for_job IS 'Number of units already marked ready for job by shop. When >= quantity, status becomes ready_for_job.';

-- 2) Add RPC so the app can update it without schema cache issues
CREATE OR REPLACE FUNCTION public.mark_material_partial_ready(
  p_material_item_id uuid,
  p_quantity_to_mark integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_row material_items%ROWTYPE;
  v_new_ready integer;
BEGIN
  IF p_quantity_to_mark IS NULL OR p_quantity_to_mark <= 0 THEN
    RETURN;
  END IF;

  SELECT * INTO v_row FROM public.material_items WHERE id = p_material_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_new_ready := COALESCE(v_row.quantity_ready_for_job, 0) + p_quantity_to_mark;
  IF v_new_ready > v_row.quantity THEN
    v_new_ready := v_row.quantity;
  END IF;

  UPDATE public.material_items
  SET
    quantity_ready_for_job = v_new_ready,
    status = CASE WHEN v_new_ready >= v_row.quantity THEN 'ready_for_job'::text ELSE status END,
    updated_at = now()
  WHERE id = p_material_item_id;
END;
$$;

COMMENT ON FUNCTION public.mark_material_partial_ready(uuid, integer) IS
  'Mark a partial quantity of a material item as ready for job. When total ready >= quantity, status is set to ready_for_job.';
