import type { SupabaseClient } from '@supabase/supabase-js';

/** Stable link between office `subcontractors` rows and `portal_users` (FK target for `portal_job_access`). */
export function subcontractorPortalUsername(subcontractorId: string): string {
  return `sub:${subcontractorId}`;
}

/** Inverse of subcontractorPortalUsername — used when resolving share links from a portal_users row. */
export function subcontractorIdFromPortalUsername(username: string): string | null {
  const t = String(username ?? '').trim();
  if (!t.startsWith('sub:')) return null;
  const id = t.slice(4).trim();
  return /^[0-9a-f-]{36}$/i.test(id) ? id : null;
}

function unwrapRpcJsonb(data: unknown): unknown {
  if (typeof data === 'string') {
    try {
      return JSON.parse(data) as unknown;
    } catch {
      return data;
    }
  }
  return data;
}

function isRpcArgMismatch(err: unknown): boolean {
  const m = String((err as { message?: string })?.message ?? '');
  return /PGRST301|PGRST202|42883|argument|Could not choose|Could not find the function|does not exist/i.test(m);
}

function isRpcNotDeployed(err: unknown): boolean {
  const m = String((err as { message?: string })?.message ?? '');
  return /Could not find the function|schema cache|does not exist|PGRST202|PGRST301/i.test(m);
}

function isLikelyPortalUsersRlsInsert(err: unknown): boolean {
  const code = (err as { code?: string })?.code;
  const msg = String((err as { message?: string })?.message ?? '');
  if (/portal_users/i.test(msg) && /row-level security|RLS policy|violates row-level/i.test(msg)) return true;
  if (code === '42501' && /portal_users|row-level security|rls/i.test(msg)) return true;
  return false;
}

async function rpcEnsurePortalUserForSubcontractor(
  client: SupabaseClient,
  subcontractorId: string,
  createdBy: string | null | undefined
): Promise<{ portalUserId: string | null; error: Error | null }> {
  const p_row = {
    subcontractor_id: subcontractorId,
    created_by: createdBy ?? null,
  };
  let { data, error } = await client.rpc('office_portal_user_ensure_for_subcontractor_json', { p_row });
  if (error && isRpcArgMismatch(error)) {
    ({ data, error } = await client.rpc('office_portal_user_ensure_for_subcontractor_json', {
      payload: p_row,
    }));
  }
  if (error) return { portalUserId: null, error: error as Error };
  const d = unwrapRpcJsonb(data) as { ok?: boolean; id?: string; error?: string } | null;
  if (d?.ok === true && d.id) return { portalUserId: String(d.id), error: null };
  return {
    portalUserId: null,
    error: new Error(d?.error || 'office_portal_user_ensure_for_subcontractor_json failed'),
  };
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

  const rpc = await rpcEnsurePortalUserForSubcontractor(client, subcontractorId, createdBy);
  if (rpc.portalUserId) return { portalUserId: rpc.portalUserId, error: null };
  if (rpc.error && !isRpcNotDeployed(rpc.error)) {
    return { portalUserId: null, error: rpc.error };
  }

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

  if (insErr && isLikelyPortalUsersRlsInsert(insErr) && rpc.error && isRpcNotDeployed(rpc.error)) {
    return {
      portalUserId: null,
      error: new Error(
        'Subcontractor portal user could not be created: PostgREST does not see office_portal_user_ensure_for_subcontractor_json yet, and portal_users has RLS blocking inserts. In Supabase → SQL Editor, run migration 20260330130000_portal_users_subcontractor_access_fix.sql (or scripts/fix-portal-users-rls.sql + 20260327000000_portal_user_ensure_subcontractor_json.sql), then run: NOTIFY pgrst, \'reload schema\';'
      ),
    };
  }

  if (insErr && isLikelyPortalUsersRlsInsert(insErr)) {
    return {
      portalUserId: null,
      error: new Error(
        `${msg} — Fix: run supabase/migrations/20260330130000_portal_users_subcontractor_access_fix.sql in the SQL Editor, or scripts/fix-portal-users-rls.sql, then NOTIFY pgrst, 'reload schema'.`
      ),
    };
  }

  return { portalUserId: null, error: insErr ? (insErr as Error) : new Error('Could not create portal user') };
}
