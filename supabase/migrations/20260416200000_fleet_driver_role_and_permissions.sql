-- ============================================================
-- Fleet: driver role + can_manage_fleet_vehicles column
-- Idempotent — safe to run multiple times.
-- ============================================================

-- ── 0. Schema USAGE (anon needs it for PostgREST) ────────────
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- ── 1. Ensure public.user_profiles exists ────────────────────
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  username              text,
  email                 text        NOT NULL DEFAULT '',
  role                  text        NOT NULL DEFAULT 'crew',
  phone                 text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  pin_hash              text,
  webauthn_credentials  jsonb       NOT NULL DEFAULT '[]'::jsonb,
  is_admin              boolean     NOT NULL DEFAULT false
);

-- Disable RLS so anon/authenticated can INSERT freely (PIN-auth app pattern)
ALTER TABLE public.user_profiles DISABLE ROW LEVEL SECURITY;

-- Grant full CRUD to all roles so PostgREST never blocks a browser INSERT
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_profiles
  TO anon, authenticated, service_role;

-- ── 2. Add can_manage_fleet_vehicles column ───────────────────
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS can_manage_fleet_vehicles boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.user_profiles.can_manage_fleet_vehicles IS
  'When true, the user may create / edit / archive vehicles and maintenance logs '
  'regardless of role. Roles office, foreman, and driver already have fleet access '
  'via user_can_manage_fleet_vehicles().';

-- ── 3. Normalize invalid role values before adding CHECK ──────
-- Replace anything not in the allowed list with the closest safe default.
UPDATE public.user_profiles
SET role = 'crew'
WHERE role IS NULL
   OR role NOT IN ('crew','foreman','office','payroll','shop','driver');

-- Drop old constraint (name may differ across migrations; try both common names)
ALTER TABLE public.user_profiles DROP CONSTRAINT IF EXISTS user_profiles_role_check;
ALTER TABLE public.user_profiles DROP CONSTRAINT IF EXISTS user_profiles_role_fkey;

-- Add the authoritative CHECK that includes 'driver'
ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_role_check
  CHECK (role IN ('crew','foreman','office','payroll','shop','driver'));

-- ── 4. Fleet helper function ──────────────────────────────────
-- Returns TRUE when the calling auth user is allowed to manage vehicles.
CREATE OR REPLACE FUNCTION public.user_can_manage_fleet_vehicles()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_profiles p
    WHERE p.id = auth.uid()
      AND (
        p.role IN ('office', 'foreman', 'driver')
        OR p.can_manage_fleet_vehicles = true
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.user_can_manage_fleet_vehicles() TO authenticated;

-- ── 5. Fleet table RLS policies (only when RLS is already ON) ─

-- ── vehicles ──────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'vehicles' AND c.relrowsecurity
  ) THEN
    -- insert
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename='vehicles'
        AND policyname='fleet_editors_can_insert_vehicles'
    ) THEN
      EXECUTE $pol$
        CREATE POLICY fleet_editors_can_insert_vehicles
          ON public.vehicles FOR INSERT TO authenticated
          WITH CHECK (public.user_can_manage_fleet_vehicles())
      $pol$;
    END IF;
    -- update
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename='vehicles'
        AND policyname='fleet_editors_can_update_vehicles'
    ) THEN
      EXECUTE $pol$
        CREATE POLICY fleet_editors_can_update_vehicles
          ON public.vehicles FOR UPDATE TO authenticated
          USING (public.user_can_manage_fleet_vehicles())
          WITH CHECK (public.user_can_manage_fleet_vehicles())
      $pol$;
    END IF;
    -- delete
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename='vehicles'
        AND policyname='fleet_editors_can_delete_vehicles'
    ) THEN
      EXECUTE $pol$
        CREATE POLICY fleet_editors_can_delete_vehicles
          ON public.vehicles FOR DELETE TO authenticated
          USING (public.user_can_manage_fleet_vehicles())
      $pol$;
    END IF;
  END IF;
END $$;

-- ── maintenance_logs ──────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'maintenance_logs' AND c.relrowsecurity
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename='maintenance_logs'
        AND policyname='fleet_editors_can_insert_maintenance_logs'
    ) THEN
      EXECUTE $pol$
        CREATE POLICY fleet_editors_can_insert_maintenance_logs
          ON public.maintenance_logs FOR INSERT TO authenticated
          WITH CHECK (public.user_can_manage_fleet_vehicles())
      $pol$;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename='maintenance_logs'
        AND policyname='fleet_editors_can_update_maintenance_logs'
    ) THEN
      EXECUTE $pol$
        CREATE POLICY fleet_editors_can_update_maintenance_logs
          ON public.maintenance_logs FOR UPDATE TO authenticated
          USING (public.user_can_manage_fleet_vehicles())
          WITH CHECK (public.user_can_manage_fleet_vehicles())
      $pol$;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename='maintenance_logs'
        AND policyname='fleet_editors_can_delete_maintenance_logs'
    ) THEN
      EXECUTE $pol$
        CREATE POLICY fleet_editors_can_delete_maintenance_logs
          ON public.maintenance_logs FOR DELETE TO authenticated
          USING (public.user_can_manage_fleet_vehicles())
      $pol$;
    END IF;
  END IF;
END $$;

-- ── vehicle_documents ─────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'vehicle_documents' AND c.relrowsecurity
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename='vehicle_documents'
        AND policyname='fleet_editors_can_insert_vehicle_documents'
    ) THEN
      EXECUTE $pol$
        CREATE POLICY fleet_editors_can_insert_vehicle_documents
          ON public.vehicle_documents FOR INSERT TO authenticated
          WITH CHECK (public.user_can_manage_fleet_vehicles())
      $pol$;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename='vehicle_documents'
        AND policyname='fleet_editors_can_update_vehicle_documents'
    ) THEN
      EXECUTE $pol$
        CREATE POLICY fleet_editors_can_update_vehicle_documents
          ON public.vehicle_documents FOR UPDATE TO authenticated
          USING (public.user_can_manage_fleet_vehicles())
          WITH CHECK (public.user_can_manage_fleet_vehicles())
      $pol$;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename='vehicle_documents'
        AND policyname='fleet_editors_can_delete_vehicle_documents'
    ) THEN
      EXECUTE $pol$
        CREATE POLICY fleet_editors_can_delete_vehicle_documents
          ON public.vehicle_documents FOR DELETE TO authenticated
          USING (public.user_can_manage_fleet_vehicles())
      $pol$;
    END IF;
  END IF;
END $$;

-- ── location_history ──────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'location_history' AND c.relrowsecurity
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename='location_history'
        AND policyname='fleet_editors_can_insert_location_history'
    ) THEN
      EXECUTE $pol$
        CREATE POLICY fleet_editors_can_insert_location_history
          ON public.location_history FOR INSERT TO authenticated
          WITH CHECK (public.user_can_manage_fleet_vehicles())
      $pol$;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename='location_history'
        AND policyname='fleet_editors_can_update_location_history'
    ) THEN
      EXECUTE $pol$
        CREATE POLICY fleet_editors_can_update_location_history
          ON public.location_history FOR UPDATE TO authenticated
          USING (public.user_can_manage_fleet_vehicles())
          WITH CHECK (public.user_can_manage_fleet_vehicles())
      $pol$;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename='location_history'
        AND policyname='fleet_editors_can_delete_location_history'
    ) THEN
      EXECUTE $pol$
        CREATE POLICY fleet_editors_can_delete_location_history
          ON public.location_history FOR DELETE TO authenticated
          USING (public.user_can_manage_fleet_vehicles())
      $pol$;
    END IF;
  END IF;
END $$;

-- ── 6. Verification queries ───────────────────────────────────
-- Run these in the same session to confirm success:
--
-- SELECT pg_get_constraintdef(oid)
--   FROM pg_constraint
--   WHERE conname = 'user_profiles_role_check';
--
-- Expected output must contain: 'driver'
--
-- INSERT INTO public.user_profiles (username, email, role)
--   VALUES ('__test_driver__', '', 'driver');
-- DELETE FROM public.user_profiles WHERE username = '__test_driver__';

-- Notify PostgREST to reload its schema cache immediately
NOTIFY pgrst, 'reload schema';
