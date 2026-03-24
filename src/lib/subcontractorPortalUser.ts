import type { SupabaseClient } from '@supabase/supabase-js';

/** Stable link between office `subcontractors` rows and `portal_users` (FK target for `portal_job_access`). */
export function subcontractorPortalUsername(subcontractorId: string): string {
  return `sub:${subcontractorId}`;
}

/**
 * Read-only: portal user created for this subcontractor (via hub grant or copy-link).
 */
export async function resolvePortalUserIdForSubcontractor(
  client: SupabaseClient,
  subcontractorId: string
): Promise<{ portalUserId: string | null; error: Error | null }> {
  const username = subcontractorPortalUsername(subcontractorId);
  const { data, error } = await client
    .from('portal_users')
    .select('id')
    .eq('username', username)
    .eq('user_type', 'subcontractor')
    .maybeSingle();
  if (error) return { portalUserId: null, error: error as Error };
  return { portalUserId: data?.id != null ? String((data as { id: string }).id) : null, error: null };
}

/**
 * Ensures a `portal_users` row exists so `portal_job_access.portal_user_id` satisfies FK to `portal_users`.
 */
export async function getOrCreatePortalUserForSubcontractor(
  client: SupabaseClient,
  subcontractorId: string,
  createdBy: string | null | undefined
): Promise<{ portalUserId: string | null; error: Error | null }> {
  const resolved = await resolvePortalUserIdForSubcontractor(client, subcontractorId);
  if (resolved.error) return { portalUserId: null, error: resolved.error };
  if (resolved.portalUserId) return { portalUserId: resolved.portalUserId, error: null };

  const { data: sub, error: subErr } = await client
    .from('subcontractors')
    .select('id, name, company_name, email')
    .eq('id', subcontractorId)
    .maybeSingle();
  if (subErr) return { portalUserId: null, error: subErr as Error };
  if (!sub) return { portalUserId: null, error: new Error('Subcontractor not found') };

  const username = subcontractorPortalUsername(String(sub.id));
  const safeId = String(sub.id).replace(/-/g, '');
  const email =
    typeof sub.email === 'string' && sub.email.trim().length > 0
      ? sub.email.trim()
      : `subcontractor.${safeId}@portal.internal`;

  const row = {
    user_type: 'subcontractor' as const,
    email,
    username,
    password_hash: '—',
    full_name: String(sub.name ?? 'Subcontractor'),
    company_name: sub.company_name ?? null,
    phone: null,
    created_by: createdBy ?? null,
  };

  const { data: inserted, error: insErr } = await client.from('portal_users').insert([row]).select('id').single();

  if (!insErr && inserted?.id) {
    return { portalUserId: String(inserted.id), error: null };
  }

  const msg = String((insErr as { message?: string })?.message ?? '');
  if (/duplicate key|unique constraint|23505/i.test(msg)) {
    const again = await resolvePortalUserIdForSubcontractor(client, subcontractorId);
    if (again.portalUserId) return { portalUserId: again.portalUserId, error: null };
  }

  return { portalUserId: null, error: insErr ? (insErr as Error) : new Error('Could not create portal user') };
}
