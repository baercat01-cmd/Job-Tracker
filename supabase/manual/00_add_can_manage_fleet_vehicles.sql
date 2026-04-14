-- =============================================================================
-- 00_add_can_manage_fleet_vehicles.sql
-- Run in: Supabase → SQL Editor → paste entire file → Run
--
-- Fixes app error: PGRST204 — could not find column
--   "can_manage_fleet_vehicles" on "user_profiles" (PostgREST schema cache)
--
-- After success: wait ~60s for API schema cache, or use Dashboard schema reload
-- if your project exposes it, then retry "Create User" in the app.
-- =============================================================================

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS can_manage_fleet_vehicles boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.user_profiles.can_manage_fleet_vehicles IS
  'Fleet vehicle / maintenance / document / location_history writes when RLS uses user_can_manage_fleet_vehicles().';

-- Align with app: office, foreman, driver, or this flag
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

-- Optional: mark Dave for fleet edits (same as migration 20260414120000)
UPDATE public.user_profiles p
SET can_manage_fleet_vehicles = true
WHERE lower(btrim(COALESCE(p.username, ''))) = 'dave';
