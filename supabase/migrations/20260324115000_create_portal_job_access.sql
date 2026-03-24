-- Subcontractor (and legacy portal user) access to jobs: one row per user+job with permission flags.
-- portal_user_id references public.portal_users(id) and/or public.subcontractors(id) depending on app flow — no FK.

CREATE TABLE IF NOT EXISTS public.portal_job_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_user_id uuid NOT NULL,
  job_id uuid NOT NULL,
  can_view_schedule boolean NOT NULL DEFAULT true,
  can_view_documents boolean NOT NULL DEFAULT true,
  can_view_photos boolean NOT NULL DEFAULT false,
  can_view_financials boolean NOT NULL DEFAULT false,
  can_view_proposal boolean NOT NULL DEFAULT false,
  can_view_materials boolean NOT NULL DEFAULT false,
  can_edit_schedule boolean NOT NULL DEFAULT false,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT portal_job_access_portal_user_job_unique UNIQUE (portal_user_id, job_id)
);

DO $pja_fk$
BEGIN
  IF to_regclass('public.jobs') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint c
       JOIN pg_class t ON c.conrelid = t.oid
       WHERE t.relname = 'portal_job_access' AND c.conname = 'portal_job_access_job_id_fkey'
     )
  THEN
    ALTER TABLE public.portal_job_access
      ADD CONSTRAINT portal_job_access_job_id_fkey
      FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table THEN NULL;
END $pja_fk$;

CREATE INDEX IF NOT EXISTS idx_portal_job_access_portal_user_id ON public.portal_job_access (portal_user_id);
CREATE INDEX IF NOT EXISTS idx_portal_job_access_job_id ON public.portal_job_access (job_id);
