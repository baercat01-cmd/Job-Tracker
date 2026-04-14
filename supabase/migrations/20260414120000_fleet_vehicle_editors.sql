-- Allow designated field users (e.g. Dave) and foremen to write fleet vehicle data when RLS is enabled.
-- Sets can_manage_fleet_vehicles for username 'dave' (case-insensitive) and adds permissive policies
-- that OR with any existing policies (only when the table already has row-level security on).

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS can_manage_fleet_vehicles boolean NOT NULL DEFAULT false;

UPDATE public.user_profiles p
SET can_manage_fleet_vehicles = true
WHERE lower(btrim(COALESCE(p.username, ''))) = 'dave';

COMMENT ON COLUMN public.user_profiles.can_manage_fleet_vehicles IS
  'Grants fleet vehicle / maintenance / document / location_history writes when combined with RLS policies using user_can_manage_fleet_vehicles().';

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
        up.role::text IN ('office', 'foreman')
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

-- Supplemental policies (only if RLS is already enabled on the table; avoids enabling RLS by mistake)
DO $body$
DECLARE
  tbl text;
  rls_on boolean;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['vehicles', 'maintenance_logs', 'vehicle_documents', 'location_history']
  LOOP
    CONTINUE WHEN to_regclass('public.' || tbl) IS NULL;

    SELECT c.relrowsecurity
    INTO rls_on
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = tbl;

    CONTINUE WHEN NOT COALESCE(rls_on, false);

    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.%I',
      tbl || '_mb_fleet_managers_insert',
      tbl
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.user_can_manage_fleet_vehicles())',
      tbl || '_mb_fleet_managers_insert',
      tbl
    );

    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.%I',
      tbl || '_mb_fleet_managers_update',
      tbl
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.user_can_manage_fleet_vehicles()) WITH CHECK (public.user_can_manage_fleet_vehicles())',
      tbl || '_mb_fleet_managers_update',
      tbl
    );

    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.%I',
      tbl || '_mb_fleet_managers_delete',
      tbl
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.user_can_manage_fleet_vehicles())',
      tbl || '_mb_fleet_managers_delete',
      tbl
    );
  END LOOP;
END $body$;
