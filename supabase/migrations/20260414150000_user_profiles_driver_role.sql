-- Driver role: fleet-focused users (no jobs/office/building estimator).
-- Extends role check, sets Dave to driver with fleet write access, updates fleet RLS helper.
--
-- If you only see "relation user_profiles does not exist", run 20260414110000 first,
-- or rely on the block below (same as 20260414110000) so this file is safe to run alone.

CREATE TABLE IF NOT EXISTS public.user_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text,
  email text,
  role text NOT NULL DEFAULT 'crew',
  phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  pin_hash text,
  webauthn_credentials jsonb,
  is_admin boolean NOT NULL DEFAULT false,
  can_manage_fleet_vehicles boolean NOT NULL DEFAULT false
);

ALTER TABLE public.user_profiles DISABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_profiles TO anon, authenticated, service_role;

ALTER TABLE public.user_profiles DROP CONSTRAINT IF EXISTS user_profiles_role_check;

ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_role_check CHECK (
    role = ANY (
      ARRAY[
        'crew'::text,
        'foreman'::text,
        'office'::text,
        'payroll'::text,
        'shop'::text,
        'driver'::text
      ]
    )
  );

-- Dedicated driver account: fleet for all companies; no field/office app.
UPDATE public.user_profiles p
SET
  role = 'driver'::text,
  can_manage_fleet_vehicles = true
WHERE lower(btrim(COALESCE(p.username, ''))) = 'dave';

-- Create Dave if no matching row exists (unique fleet-only login; set PIN in the app).
INSERT INTO public.user_profiles (username, email, role, can_manage_fleet_vehicles)
SELECT 'Dave', NULL, 'driver', true
WHERE NOT EXISTS (
  SELECT 1
  FROM public.user_profiles p
  WHERE lower(btrim(COALESCE(p.username, ''))) = 'dave'
);

-- Fleet vehicle writes: drivers same as office/foreman for RLS (uses auth.uid() when present).
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
