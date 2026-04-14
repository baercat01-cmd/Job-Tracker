-- Run once in Supabase SQL Editor if Dave still shows as Crew / uses the field dashboard.
-- After this, Dave must sign out and sign in again (or reload) so the app loads role = driver.

UPDATE public.user_profiles
SET
  role = 'driver',
  can_manage_fleet_vehicles = true
WHERE lower(btrim(COALESCE(username, ''))) = 'dave';
