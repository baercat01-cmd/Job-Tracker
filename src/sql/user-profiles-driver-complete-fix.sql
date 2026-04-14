-- =============================================================================
-- ONE FILE — paste into YOUR project's SQL console (same database as REST API).
--
-- OnSpace / custom API (*.backend.onspace.ai): use the SQL console for THAT
-- project (same org/host as your API URL), not an unrelated supabase.com project.
--
-- Fixes: can_manage_fleet_vehicles (PGRST204), role "driver" (23514), grants,
--        role column as plain text, PostgREST reload.
-- =============================================================================

-- A) Fleet column + helper (expects public.user_profiles for fleet RLS)
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS can_manage_fleet_vehicles boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.user_profiles.can_manage_fleet_vehicles IS
  'Fleet writes when RLS uses user_can_manage_fleet_vehicles().';

CREATE OR REPLACE FUNCTION public.user_can_manage_fleet_vehicles()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT (
        up.role::text IN ('office', 'foreman', 'driver')
        OR COALESCE(up.can_manage_fleet_vehicles, false)
      )
      FROM public.user_profiles up
      WHERE up.id = auth.uid()
    ),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.user_can_manage_fleet_vehicles() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_can_manage_fleet_vehicles() TO authenticated;

-- B0) List relations named user_profiles (Results tab — usually one row: public r or p)
SELECT n.nspname AS schema, c.relkind, c.oid::regclass AS regclass
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relname = 'user_profiles'
  AND n.nspname NOT IN ('pg_catalog', 'information_schema')
  AND n.nspname NOT LIKE 'pg\_%' ESCAPE '\'
ORDER BY 1;

-- B1) Drop every constraint named user_profiles_role_check (any schema)
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT n.nspname AS sch, t.relname::text AS tbl, c.conname::text AS conname
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE c.contype = 'c'
      AND c.conname = 'user_profiles_role_check'
  LOOP
    EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT IF EXISTS %I', r.sch, r.tbl, r.conname);
  END LOOP;
END $$;

-- B2) Each physical / partitioned parent table "user_profiles": drop ALL CHECKs on parent only,
--     force role to text, add one CHECK (includes driver), normalize unknown roles.
DO $$
DECLARE
  p RECORD;
  r RECORD;
BEGIN
  FOR p IN
    SELECT n.nspname AS sch, c.oid AS tbl_oid, c.relname::text AS tname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'user_profiles'
      AND c.relkind IN ('r', 'p')
      AND n.nspname NOT IN ('pg_catalog', 'information_schema')
      AND n.nspname NOT LIKE 'pg\_%' ESCAPE '\'
  LOOP
    RAISE NOTICE 'mb_driver_fix: processing %.%', p.sch, p.tname;
    FOR r IN
      SELECT c2.conname::text AS conname
      FROM pg_constraint c2
      WHERE c2.conrelid = p.tbl_oid
        AND c2.contype = 'c'
    LOOP
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT IF EXISTS %I', p.sch, p.tname, r.conname);
    END LOOP;

    EXECUTE format(
      'ALTER TABLE %I.%I ALTER COLUMN role TYPE text USING role::text',
      p.sch,
      p.tname
    );

    EXECUTE format(
      'ALTER TABLE %I.%I ADD CONSTRAINT user_profiles_role_check CHECK (role::text = ANY (ARRAY[''crew'', ''foreman'', ''office'', ''payroll'', ''shop'', ''driver'']::text[]))',
      p.sch,
      p.tname
    );

    EXECUTE format(
      'UPDATE %I.%I SET role = ''crew'' WHERE role::text IS NOT NULL AND lower(btrim(role::text)) NOT IN (''crew'', ''foreman'', ''office'', ''payroll'', ''shop'', ''driver'')',
      p.sch,
      p.tname
    );
  END LOOP;
END $$;

-- C) PIN / anon (public — matches typical PostgREST config)
ALTER TABLE public.user_profiles DISABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_profiles TO anon, authenticated, service_role;

-- D) Verify CHECK on public.user_profiles
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.user_profiles'::regclass
  AND contype = 'c';

SELECT column_name, data_type, udt_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'user_profiles'
  AND column_name = 'role';

-- E) PostgREST reload
NOTIFY pgrst, 'reload schema';
SELECT pg_notify('pgrst', 'reload schema');

-- F) Insert test (Messages tab)
DO $$
BEGIN
  INSERT INTO public.user_profiles (username, email, role)
  VALUES ('__driver_constraint_test__', '', 'driver');
  DELETE FROM public.user_profiles WHERE username = '__driver_constraint_test__';
  RAISE NOTICE 'driver insert test: SUCCESS';
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'driver insert test: FAILED — %', SQLERRM;
END $$;
