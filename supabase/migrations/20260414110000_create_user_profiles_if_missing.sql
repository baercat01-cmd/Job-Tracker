-- Pin-based FieldTrack users (name on login screen). Many environments created this table manually;
-- this migration ensures it exists before fleet/driver migrations that ALTER user_profiles.

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

COMMENT ON TABLE public.user_profiles IS 'App users for PIN login; client stores fieldtrack_user_id = id.';

ALTER TABLE public.user_profiles DISABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_profiles TO anon, authenticated, service_role;
