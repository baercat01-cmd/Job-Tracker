-- Allow standalone subcontractor sections to be marked optional
-- so they can be shown in proposal but excluded from totals.
ALTER TABLE public.subcontractor_estimates
  ADD COLUMN IF NOT EXISTS is_option boolean NOT NULL DEFAULT false;
