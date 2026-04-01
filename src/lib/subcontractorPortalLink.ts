import type { SupabaseClient } from '@supabase/supabase-js';
import { getOrCreatePortalUserForSubcontractor } from '@/lib/subcontractorPortalUser';

export function generateSubcontractorPortalAccessToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < 32; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

export function buildSubcontractorPortalUrl(accessToken: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/subcontractor-portal?token=${encodeURIComponent(accessToken)}`;
}

export type SubcontractorPortalLinkRow = {
  access_token: string;
  portal_user_id: string;
  subcontractor_id: string;
  is_active: boolean;
};

/**
 * Ensures a stable opaque token exists for this subcontractor’s portal user (one row per portal user).
 */
export async function ensureSubcontractorPortalShareLink(
  client: SupabaseClient,
  subcontractorId: string,
  createdBy: string | null | undefined
): Promise<{ access_token: string | null; portalUserId: string | null; error: Error | null }> {
  const { portalUserId, error: puErr } = await getOrCreatePortalUserForSubcontractor(
    client,
    subcontractorId,
    createdBy
  );
  if (puErr || !portalUserId) {
    return { access_token: null, portalUserId: null, error: puErr ?? new Error('Could not resolve portal user') };
  }

  const { data: existing, error: selErr } = await client
    .from('subcontractor_portal_links')
    .select('access_token')
    .eq('portal_user_id', portalUserId)
    .maybeSingle();

  if (selErr) {
    return { access_token: null, portalUserId, error: selErr as Error };
  }
  if (existing && typeof (existing as { access_token?: string }).access_token === 'string') {
    return { access_token: String((existing as { access_token: string }).access_token), portalUserId, error: null };
  }

  const token = generateSubcontractorPortalAccessToken();
  const { error: insErr } = await client.from('subcontractor_portal_links').insert({
    portal_user_id: portalUserId,
    subcontractor_id: subcontractorId,
    access_token: token,
    is_active: true,
    created_by: createdBy ?? null,
  });

  if (insErr) {
    const msg = String((insErr as { message?: string }).message ?? '');
    if (/duplicate|unique|23505/i.test(msg)) {
      const { data: again } = await client
        .from('subcontractor_portal_links')
        .select('access_token')
        .eq('portal_user_id', portalUserId)
        .maybeSingle();
      if (again && typeof (again as { access_token?: string }).access_token === 'string') {
        return { access_token: String((again as { access_token: string }).access_token), portalUserId, error: null };
      }
    }
    return { access_token: null, portalUserId, error: insErr as Error };
  }

  return { access_token: token, portalUserId, error: null };
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

export type ResolvedSubcontractorPortalToken = {
  portal_user_id: string;
  subcontractor_id: string;
  full_name: string;
  company_name: string | null;
};

export async function resolveSubcontractorPortalByToken(
  client: SupabaseClient,
  accessToken: string
): Promise<{ row: ResolvedSubcontractorPortalToken | null; error: Error | null }> {
  const trimmed = accessToken.trim();
  if (!trimmed) return { row: null, error: null };

  const { data, error } = await client.rpc('get_subcontractor_portal_link_by_token', {
    p_access_token: trimmed,
  });

  if (error) return { row: null, error: error as Error };

  const raw = unwrapRpcJsonb(data);
  if (raw == null || (typeof raw === 'object' && raw !== null && Object.keys(raw as object).length === 0)) {
    return { row: null, error: null };
  }

  const o = raw as Record<string, unknown>;
  const portal_user_id = o.portal_user_id != null ? String(o.portal_user_id) : '';
  const subcontractor_id = o.subcontractor_id != null ? String(o.subcontractor_id) : '';
  if (!portal_user_id || !subcontractor_id) {
    return { row: null, error: null };
  }

  return {
    row: {
      portal_user_id,
      subcontractor_id,
      full_name: String(o.full_name ?? ''),
      company_name: o.company_name != null ? String(o.company_name) : null,
    },
    error: null,
  };
}

export async function rotateSubcontractorPortalShareToken(
  client: SupabaseClient,
  subcontractorId: string
): Promise<{ access_token: string | null; error: Error | null }> {
  const token = generateSubcontractorPortalAccessToken();
  const { data, error } = await client
    .from('subcontractor_portal_links')
    .update({ access_token: token, updated_at: new Date().toISOString() })
    .eq('subcontractor_id', subcontractorId)
    .select('access_token')
    .maybeSingle();

  if (error) return { access_token: null, error: error as Error };
  const t = (data as { access_token?: string } | null)?.access_token;
  if (!t) {
    return { access_token: null, error: new Error('No portal link row for this subcontractor') };
  }
  return { access_token: String(t), error: null };
}
