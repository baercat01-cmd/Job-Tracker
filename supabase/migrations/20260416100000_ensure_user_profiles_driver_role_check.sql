-- Ensures role "driver" is allowed. Drops CHECKs on parent + partition/inherit children,
-- converts role to text, adds CHECK, grants, NOTIFY.

ALTER TABLE public.user_profiles DROP CONSTRAINT IF EXISTS user_profiles_role_check;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT c.conname::text AS conname, t.relname::text AS tbl
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND c.contype = 'c'
      AND (
        t.relname = 'user_profiles'
        OR t.oid IN (
          SELECT inh.inhrelid
          FROM pg_inherits inh
          JOIN pg_class p ON p.oid = inh.inhparent
          JOIN pg_namespace pn ON pn.oid = p.relnamespace
          WHERE pn.nspname = 'public'
            AND p.relname = 'user_profiles'
        )
      )
  LOOP
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', r.tbl, r.conname);
  END LOOP;
END $$;

ALTER TABLE public.user_profiles
  ALTER COLUMN role TYPE text USING role::text;

UPDATE public.user_profiles
SET role = 'crew'
WHERE role::text NOT IN ('crew', 'foreman', 'office', 'payroll', 'shop', 'driver');

ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_role_check CHECK (
    role::text = ANY (ARRAY['crew', 'foreman', 'office', 'payroll', 'shop', 'driver']::text[])
  );

ALTER TABLE public.user_profiles DISABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_profiles TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
