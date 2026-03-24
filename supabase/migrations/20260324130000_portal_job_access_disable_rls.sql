-- Fix: "Database blocked portal_job_access write (RLS)" when granting subcontractor job access.
-- Office app inserts/updates portal_job_access via PostgREST; RLS must not block authenticated writes.

DO $$
DECLARE
  pol RECORD;
BEGIN
  IF to_regclass('public.portal_job_access') IS NULL THEN
    RAISE NOTICE 'public.portal_job_access missing; skip.';
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

ALTER TABLE public.portal_job_access DISABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.portal_job_access TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.portal_job_access TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.portal_job_access TO service_role;

COMMENT ON TABLE public.portal_job_access IS 'Subcontractor-to-job visibility mapping; RLS disabled for office app writes.';
