-- Let shop mark part of a material as "ready for job" (e.g. 10 of 30).
ALTER TABLE public.material_items
  ADD COLUMN IF NOT EXISTS quantity_ready_for_job integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.material_items.quantity_ready_for_job IS 'Number of units already marked ready for job by shop. When >= quantity, status becomes ready_for_job.';
