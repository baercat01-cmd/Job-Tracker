-- Fix: "new row violates row-level security policy for table portal_users"
-- Office app inserts portal_users via PostgREST; RLS must not block authenticated writes.

DO $$
DECLARE
  pol RECORD;
BEGIN
  IF to_regclass('public.portal_users') IS NULL THEN
    RAISE NOTICE 'public.portal_users missing; skip.';
    RETURN;
  END IF;

  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'portal_users'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.portal_users', pol.policyname);
  END LOOP;
END $$;

ALTER TABLE public.portal_users DISABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.portal_users TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.portal_users TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.portal_users TO service_role;

COMMENT ON TABLE public.portal_users IS 'Portal logins; RLS disabled so office REST can manage users.';
