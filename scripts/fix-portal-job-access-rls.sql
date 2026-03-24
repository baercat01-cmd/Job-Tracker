-- Allow office app (authenticated) to manage portal_job_access for subcontractor hub.
-- Run in Supabase -> SQL Editor if granting subcontractor job access fails with RLS errors.

DO $$
DECLARE
  pol RECORD;
BEGIN
  IF to_regclass('public.portal_job_access') IS NULL THEN
    RAISE NOTICE 'public.portal_job_access does not exist; create table first.';
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

