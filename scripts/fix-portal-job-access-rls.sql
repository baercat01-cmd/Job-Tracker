-- Subcontractor hub: portal_job_access table, RLS off, grants, office_* RPCs.
-- Supabase SQL Editor may treat $word$ as special; run in 4 STEPS (tabs/queries), each block alone.

-- =============================================================================
-- STEP 1 — Table, FK, indexes, drop RLS policies, disable RLS, grants, comment
-- =============================================================================

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

DO $$
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
END $$;

CREATE INDEX IF NOT EXISTS idx_portal_job_access_portal_user_id ON public.portal_job_access (portal_user_id);
CREATE INDEX IF NOT EXISTS idx_portal_job_access_job_id ON public.portal_job_access (job_id);

DO $$
DECLARE
  pol RECORD;
BEGIN
  IF to_regclass('public.portal_job_access') IS NULL THEN
    RETURN;
  END IF;

  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'portal_job_access'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.portal_job_access', pol.policyname);
  END LOOP;
END $$;

-- Without NO FORCE, table owners / SECURITY DEFINER still hit policies (Postgres 15+ behavior).
ALTER TABLE public.portal_job_access NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.portal_job_access DISABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.portal_job_access TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.portal_job_access TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.portal_job_access TO service_role;

COMMENT ON TABLE public.portal_job_access IS 'Subcontractor-to-job visibility mapping; RLS disabled for office app writes.';

-- =============================================================================
-- STEP 2 — Only this function (one $$ pair). Run alone. Then STEP 3, then STEP 4.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.office_insert_portal_job_access(
  p_portal_user_id uuid,
  p_job_id uuid,
  p_can_view_schedule boolean DEFAULT true,
  p_can_view_documents boolean DEFAULT true,
  p_can_view_photos boolean DEFAULT false,
  p_can_view_financials boolean DEFAULT false,
  p_can_view_proposal boolean DEFAULT false,
  p_can_view_materials boolean DEFAULT false,
  p_can_edit_schedule boolean DEFAULT false,
  p_notes text DEFAULT NULL,
  p_created_by uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF to_regclass('public.portal_job_access') IS NULL THEN
    RAISE EXCEPTION 'Table portal_job_access does not exist';
  END IF;

  INSERT INTO public.portal_job_access (
    portal_user_id,
    job_id,
    can_view_schedule,
    can_view_documents,
    can_view_photos,
    can_view_financials,
    can_view_proposal,
    can_view_materials,
    can_edit_schedule,
    notes,
    created_by
  ) VALUES (
    p_portal_user_id,
    p_job_id,
    p_can_view_schedule,
    p_can_view_documents,
    p_can_view_photos,
    p_can_view_financials,
    p_can_view_proposal,
    p_can_view_materials,
    p_can_edit_schedule,
    p_notes,
    p_created_by
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- =============================================================================
-- STEP 3 — Run alone (only this CREATE FUNCTION).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.office_update_portal_job_access(
  p_id uuid,
  p_can_view_schedule boolean,
  p_can_view_documents boolean,
  p_can_view_photos boolean,
  p_can_view_financials boolean,
  p_can_view_proposal boolean,
  p_can_view_materials boolean,
  p_can_edit_schedule boolean,
  p_notes text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE public.portal_job_access
  SET
    can_view_schedule = p_can_view_schedule,
    can_view_documents = p_can_view_documents,
    can_view_photos = p_can_view_photos,
    can_view_financials = p_can_view_financials,
    can_view_proposal = p_can_view_proposal,
    can_view_materials = p_can_view_materials,
    can_edit_schedule = p_can_edit_schedule,
    notes = p_notes,
    updated_at = now()
  WHERE id = p_id;
END;
$$;

-- =============================================================================
-- STEP 4 — Run alone (only this CREATE FUNCTION + GRANTs below, or run GRANTs as STEP 5).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.office_delete_portal_job_access(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  DELETE FROM public.portal_job_access WHERE id = p_id;
END;
$$;

-- =============================================================================
-- STEP 5 — Run alone (three GRANTs).
-- =============================================================================

GRANT EXECUTE ON FUNCTION public.office_insert_portal_job_access(
  uuid, uuid, boolean, boolean, boolean, boolean, boolean, boolean, boolean, text, uuid
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.office_insert_portal_job_access(
  uuid, uuid, boolean, boolean, boolean, boolean, boolean, boolean, boolean, text, uuid
) TO anon;

GRANT EXECUTE ON FUNCTION public.office_update_portal_job_access(
  uuid, boolean, boolean, boolean, boolean, boolean, boolean, boolean, text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.office_update_portal_job_access(
  uuid, boolean, boolean, boolean, boolean, boolean, boolean, boolean, text
) TO anon;

GRANT EXECUTE ON FUNCTION public.office_delete_portal_job_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.office_delete_portal_job_access(uuid) TO anon;

-- =============================================================================
-- STEP 6 — Run alone (refreshes API schema cache so new RPCs are visible).
-- =============================================================================

NOTIFY pgrst, 'reload schema';
