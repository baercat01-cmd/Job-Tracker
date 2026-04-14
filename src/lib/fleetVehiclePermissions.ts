import type { UserProfile } from '@/types';

/** Office, foreman, driver, or profile flag — can add/edit vehicles and maintenance/location/doc records. */
export function canManageFleetVehicleRecords(profile: UserProfile | null | undefined): boolean {
  if (!profile) return false;
  if (profile.role === 'office' || profile.role === 'foreman' || profile.role === 'driver') return true;
  return profile.can_manage_fleet_vehicles === true;
}

/** Fleet → Users tab (app_users / create_app_user): office only. */
export function canManageFleetAppUsers(profile: UserProfile | null | undefined): boolean {
  return profile?.role === 'office';
}
