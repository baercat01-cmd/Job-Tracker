-- Allow office app (authenticated) to manage portal_users for subcontractor/customer portal.
-- Run in Supabase → SQL Editor if creating portal users fails with permission / RLS errors.

DO $$
DECLARE
  pol RECORD;
BEGIN
  IF to_regclass('public.portal_users') IS NULL THEN
    RAISE NOTICE 'public.portal_users does not exist; create table first.';
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

COMMENT ON TABLE public.portal_users IS 'Portal logins; RLS disabled so office app can manage users via REST.';
