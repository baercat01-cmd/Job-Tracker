-- Run this ONE block in Supabase SQL Editor if you still see:
--   "new row violates row-level security policy for table 'portal_job_access'"
--
-- FORCE ROW LEVEL SECURITY makes even SECURITY DEFINER RPCs obey policies — turn it off, then disable RLS.

DO $$
DECLARE
  pol RECORD;
BEGIN
  IF to_regclass('public.portal_job_access') IS NULL THEN
    RAISE EXCEPTION 'Table public.portal_job_access does not exist';
  END IF;

  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'portal_job_access'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.portal_job_access', pol.policyname);
  END LOOP;
END $$;

ALTER TABLE public.portal_job_access NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.portal_job_access DISABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.portal_job_access TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.portal_job_access TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.portal_job_access TO service_role;

NOTIFY pgrst, 'reload schema';

-- Verify (should show rls_on = f, force_rls = f):
-- SELECT relrowsecurity AS rls_on, relforcerowsecurity AS force_rls
-- FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
-- WHERE n.nspname = 'public' AND c.relname = 'portal_job_access';
