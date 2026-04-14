import bundledDriverRoleFixSql from '../sql/user-profiles-driver-complete-fix.sql?raw';

/** One script: column + function + role CHECK + grants (fixes 23514 and PGRST204). Bundled so Copy SQL is never stale vs /public fetch. */
export function useDriverRoleFixSql(shouldLoad: boolean): { sql: string; loading: boolean } {
  return {
    sql: shouldLoad ? bundledDriverRoleFixSql.trim() : '',
    loading: false,
  };
}
