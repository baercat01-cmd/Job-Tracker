-- Separate standard (library) vs custom saved trim configurations in UI and queries.
ALTER TABLE public.trim_saved_configs
  ADD COLUMN IF NOT EXISTS is_custom_trim boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.trim_saved_configs.is_custom_trim IS
  'When true, saved trim is treated as custom (job-specific or one-off). When false, standard library trim.';

-- Historical data: rows saved with a job link behaved as job/custom trims in the UI.
UPDATE public.trim_saved_configs
SET is_custom_trim = true
WHERE job_id IS NOT NULL;
