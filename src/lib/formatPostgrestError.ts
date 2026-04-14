/** Human-readable PostgREST / Supabase client error for toasts and logs. */
export function formatPostgrestError(error: unknown): string {
  if (error == null) return 'Unknown error';
  if (typeof error === 'string') return error;
  if (typeof error !== 'object') return String(error);
  const e = error as { message?: string; details?: string; hint?: string; code?: string };
  const parts = [e.message, e.details, e.hint, e.code ? `code ${e.code}` : ''].filter(Boolean);
  return parts.length ? parts.join(' — ') : 'Unknown error';
}
