-- Ensure portal_job_access writes are never blocked by FORCE RLS (breaks SECURITY DEFINER RPCs too).
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

ALTER TABLE public.portal_job_access NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.portal_job_access DISABLE ROW LEVEL SECURITY;
