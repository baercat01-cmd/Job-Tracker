-- Enforce user_profiles.role via BEFORE trigger; drop CHECK constraints that block "driver".
-- Idempotent. Safe after 20260416100000 (or any schema that still has user_profiles_role_check).

CREATE OR REPLACE FUNCTION public.mb_user_profiles_role_bi()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v text;
BEGIN
  v := lower(btrim(COALESCE(NEW.role::text, '')));
  IF v = '' THEN
    NEW.role := 'crew';
    RETURN NEW;
  END IF;
  IF v NOT IN ('crew', 'foreman', 'office', 'payroll', 'shop', 'driver') THEN
    RAISE EXCEPTION 'new row for relation "user_profiles" violates check constraint "user_profiles_role_check"'
      USING ERRCODE = '23514',
        DETAIL = format('invalid role: %s', NEW.role::text);
  END IF;
  NEW.role := v;
  RETURN NEW;
END;
$$;

-- Drop role-related CHECKs only (avoid nuking unrelated CHECKs on this table).
ALTER TABLE public.user_profiles DROP CONSTRAINT IF EXISTS user_profiles_role_check;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT c.conname::text AS conname
    FROM pg_constraint c
    WHERE c.conrelid = 'public.user_profiles'::regclass
      AND c.contype = 'c'
      AND (
        c.conname = 'user_profiles_role_check'
        OR c.conname ILIKE '%\_role\_check%' ESCAPE '\'
        OR c.conname ILIKE '%role%check%'
      )
  LOOP
    EXECUTE format('ALTER TABLE public.user_profiles DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.user_profiles
  ALTER COLUMN role TYPE text USING role::text;

DROP TRIGGER IF EXISTS tr_mb_user_profiles_role_bi ON public.user_profiles;

CREATE TRIGGER tr_mb_user_profiles_role_bi
  BEFORE INSERT OR UPDATE OF role ON public.user_profiles
  FOR EACH ROW
  EXECUTE PROCEDURE public.mb_user_profiles_role_bi();

UPDATE public.user_profiles
SET role = 'crew'
WHERE role::text IS NOT NULL
  AND lower(btrim(role::text)) NOT IN ('crew', 'foreman', 'office', 'payroll', 'shop', 'driver');

NOTIFY pgrst, 'reload schema';
SELECT pg_notify('pgrst', 'reload schema');
