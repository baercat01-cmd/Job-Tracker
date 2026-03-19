-- Portal saves use PostgREST: .from('customer_portal_access').update/insert()
-- No dependency on update_customer_portal_link RPC (avoids PGRST202 schema cache).
--
-- Idempotent: safe to run on any project.

DO $$
DECLARE
  pol RECORD;
BEGIN
  IF to_regclass('public.customer_portal_access') IS NULL THEN
    RAISE NOTICE 'customer_portal_access missing; create table first (fix-customer-portal-access-rls.sql).';
    RETURN;
  END IF;

  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'customer_portal_access'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.customer_portal_access', pol.policyname);
  END LOOP;
END $$;

ALTER TABLE public.customer_portal_access DISABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.customer_portal_access TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.customer_portal_access TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.customer_portal_access TO service_role;

COMMENT ON TABLE public.customer_portal_access IS
  'Portal links; RLS disabled so authenticated office clients can PATCH via REST without RPC.';
