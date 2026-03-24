import type { SupabaseClient } from '@supabase/supabase-js';

export type PortalJobAccessInsertPayload = {
  portal_user_id: string;
  job_id: string;
  can_view_schedule: boolean;
  can_view_documents: boolean;
  can_view_photos: boolean;
  can_view_financials: boolean;
  can_view_proposal: boolean;
  can_view_materials: boolean;
  can_edit_schedule: boolean;
  notes: string | null;
  created_by?: string | null;
};

export type PortalJobAccessUpdatePayload = {
  can_view_schedule: boolean;
  can_view_documents: boolean;
  can_view_photos: boolean;
  can_view_financials: boolean;
  can_view_proposal: boolean;
  can_view_materials: boolean;
  can_edit_schedule: boolean;
  notes: string | null;
};

const EDGE_SKIP = 'EDGE_SKIP';

function isOptionalColumnError(err: unknown): boolean {
  const msg = String((err as { message?: string })?.message ?? '');
  return /can_edit_schedule|can_view_proposal|can_view_materials|schema cache|PGRST204/i.test(msg);
}

/** PostgREST rejects the body when JSON keys do not match the function parameter names (e.g. `p_row` vs `payload`). */
function isRpcArgMismatch(err: unknown): boolean {
  const m = String((err as { message?: string })?.message ?? '');
  return /PGRST301|PGRST202|42883|argument|Could not choose|Could not find the function|does not exist/i.test(m);
}

/** Data/constraint errors: retrying legacy RPC or direct insert will not help. */
function isNonRetryablePortalJobAccessErr(msg: string): boolean {
  return /violates foreign key|foreign key constraint|23503|unique constraint|23505|duplicate key/i.test(
    msg
  );
}

type EdgeJson = { ok?: boolean; error?: string; id?: string | null; rows?: Record<string, unknown>[] };

/**
 * Full URL to portal-job-access function, or null when not available:
 * - OnSpace `*.backend.onspace.ai` does not host Supabase Edge Functions (HTTP 404 service not found).
 * - Optional override: VITE_SUPABASE_FUNCTIONS_URL = API origin (e.g. https://ref.supabase.co) if functions live elsewhere.
 */
function portalJobAccessEdgeInvokeUrl(): string | null {
  const fnOrigin = String(import.meta.env.VITE_SUPABASE_FUNCTIONS_URL ?? '')
    .trim()
    .replace(/\/$/, '');
  if (fnOrigin) {
    return `${fnOrigin}/functions/v1/portal-job-access`;
  }
  const api = String(import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '');
  if (!api) return null;
  if (/\.backend\.onspace\.ai/i.test(api)) {
    return null;
  }
  return `${api}/functions/v1/portal-job-access`;
}

function anonKey(): string | null {
  const k = import.meta.env.VITE_SUPABASE_ANON_KEY;
  return typeof k === 'string' && k.length > 0 ? k : null;
}

async function callPortalJobAccessEdgeFetch(
  invokeUrl: string,
  body: Record<string, unknown>
): Promise<{ ok: true; rows?: Record<string, unknown>[]; id?: string | null } | { ok: false; error: Error }> {
  const key = anonKey();
  if (!key) {
    return { ok: false, error: new Error('Missing VITE_SUPABASE_ANON_KEY') };
  }
  try {
    const res = await fetch(invokeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
        apikey: key,
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let parsed: EdgeJson;
    try {
      parsed = JSON.parse(text) as EdgeJson;
    } catch {
      return { ok: false, error: new Error(`Edge invalid JSON (HTTP ${res.status}): ${text.slice(0, 240)}`) };
    }
    if (!res.ok) {
      return {
        ok: false,
        error: new Error(`Edge HTTP ${res.status}: ${parsed?.error || text.slice(0, 200)}`),
      };
    }
    if (parsed?.ok === true) {
      return { ok: true, rows: parsed.rows, id: parsed.id ?? null };
    }
    return { ok: false, error: new Error(parsed?.error || 'portal-job-access returned ok: false') };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e : new Error(String(e)) };
  }
}

async function callPortalJobAccessEdgeSdk(
  client: SupabaseClient,
  body: Record<string, unknown>
): Promise<{ ok: true; rows?: Record<string, unknown>[]; id?: string | null } | { ok: false; error: Error }> {
  try {
    const { data, error } = await client.functions.invoke('portal-job-access', { body });
    if (error) {
      return { ok: false, error: new Error(error.message || 'Edge invoke failed') };
    }
    const row = data as EdgeJson | null;
    if (row?.ok === true) {
      return { ok: true, rows: row.rows, id: row.id ?? null };
    }
    return { ok: false, error: new Error(row?.error || 'portal-job-access returned ok: false') };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e : new Error(String(e)) };
  }
}

async function callPortalJobAccessEdge(
  client: SupabaseClient,
  body: Record<string, unknown>
): Promise<{ ok: true; rows?: Record<string, unknown>[]; id?: string | null } | { ok: false; error: Error }> {
  const invokeUrl = portalJobAccessEdgeInvokeUrl();
  if (!invokeUrl) {
    return { ok: false, error: new Error(EDGE_SKIP) };
  }
  const a = await callPortalJobAccessEdgeFetch(invokeUrl, body);
  if (a.ok === true) {
    return a;
  }
  const errA = a.error;
  const b = await callPortalJobAccessEdgeSdk(client, body);
  if (b.ok === true) {
    return b;
  }
  const errB = b.error;
  return { ok: false, error: new Error([errA.message, errB.message].filter(Boolean).join(' | ')) };
}

function isEdgeSkippedErr(e: Error): boolean {
  return e.message === EDGE_SKIP;
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

function parseListRpcPayload(data: unknown): Record<string, unknown>[] | null {
  const u = unwrapRpcJsonb(data);
  if (u == null) return null;
  if (Array.isArray(u)) return u as Record<string, unknown>[];
  if (typeof u === 'object' && u !== null) {
    const o = u as Record<string, unknown>;
    if (Array.isArray(o.rows)) return o.rows as Record<string, unknown>[];
  }
  if (typeof u === 'string') {
    try {
      const p = JSON.parse(u) as unknown;
      return Array.isArray(p) ? (p as Record<string, unknown>[]) : null;
    } catch {
      return null;
    }
  }
  return null;
}

async function rpcPortalJobAccessInsertJson(
  client: SupabaseClient,
  payload: PortalJobAccessInsertPayload
): Promise<{ error: Error | null }> {
  const p_row = {
    portal_user_id: payload.portal_user_id,
    job_id: payload.job_id,
    can_view_schedule: payload.can_view_schedule,
    can_view_documents: payload.can_view_documents,
    can_view_photos: payload.can_view_photos,
    can_view_financials: payload.can_view_financials,
    can_view_proposal: payload.can_view_proposal,
    can_view_materials: payload.can_view_materials,
    can_edit_schedule: payload.can_edit_schedule,
    notes: payload.notes,
    created_by: payload.created_by ?? null,
  };
  let { data, error } = await client.rpc('office_portal_job_access_insert_json', { p_row });
  if (error && isRpcArgMismatch(error)) {
    ({ data, error } = await client.rpc('office_portal_job_access_insert_json', {
      payload: p_row,
    }));
  }
  if (error) return { error: error as Error };
  const d = unwrapRpcJsonb(data) as { ok?: boolean; error?: string } | null;
  if (d?.ok === true) return { error: null };
  return { error: new Error(d?.error || 'office_portal_job_access_insert_json failed') };
}

async function rpcPortalJobAccessUpdateJson(
  client: SupabaseClient,
  id: string,
  payload: PortalJobAccessUpdatePayload
): Promise<{ error: Error | null }> {
  const p_patch = { ...payload };
  let { data, error } = await client.rpc('office_portal_job_access_update_json', {
    p_id: id,
    p_patch,
  });
  if (error && isRpcArgMismatch(error)) {
    ({ data, error } = await client.rpc('office_portal_job_access_update_json', {
      id,
      payload: p_patch,
    }));
  }
  if (error) return { error: error as Error };
  const d = unwrapRpcJsonb(data) as { ok?: boolean; error?: string } | null;
  if (d?.ok === true) return { error: null };
  return { error: new Error(d?.error || 'office_portal_job_access_update_json failed') };
}

async function rpcPortalJobAccessDeleteJson(
  client: SupabaseClient,
  id: string
): Promise<{ error: Error | null }> {
  let { data, error } = await client.rpc('office_portal_job_access_delete_json', { p_id: id });
  if (error && isRpcArgMismatch(error)) {
    ({ data, error } = await client.rpc('office_portal_job_access_delete_json', { id }));
  }
  if (error) return { error: error as Error };
  const d = unwrapRpcJsonb(data) as { ok?: boolean; error?: string } | null;
  if (d?.ok === true) return { error: null };
  return { error: new Error(d?.error || 'office_portal_job_access_delete_json failed') };
}

async function insertPortalJobAccessDirect(
  client: SupabaseClient,
  payload: PortalJobAccessInsertPayload
): Promise<{ error: Error | null }> {
  let { error } = await client.from('portal_job_access').insert([payload]);
  if (error && isOptionalColumnError(error)) {
    const { can_view_proposal, can_view_materials, can_edit_schedule, ...fallbackPayload } = payload;
    void can_view_proposal;
    void can_view_materials;
    void can_edit_schedule;
    const fb = await client.from('portal_job_access').insert([fallbackPayload]);
    error = fb.error;
  }
  return { error: error as Error | null };
}

const insertRpcArgs = (payload: PortalJobAccessInsertPayload) => ({
  p_portal_user_id: payload.portal_user_id,
  p_job_id: payload.job_id,
  p_can_view_schedule: payload.can_view_schedule,
  p_can_view_documents: payload.can_view_documents,
  p_can_view_photos: payload.can_view_photos,
  p_can_view_financials: payload.can_view_financials,
  p_can_view_proposal: payload.can_view_proposal,
  p_can_view_materials: payload.can_view_materials,
  p_can_edit_schedule: payload.can_edit_schedule,
  p_notes: payload.notes,
  p_created_by: payload.created_by ?? null,
});

/**
 * OnSpace: Edge Functions are not on *.backend.onspace.ai — use RPC (after SQL migration).
 * Supabase Cloud: Edge first (service role), then RPC, then direct REST.
 */
export async function insertPortalJobAccess(
  client: SupabaseClient,
  payload: PortalJobAccessInsertPayload
): Promise<{ error: Error | null }> {
  const edge = await callPortalJobAccessEdge(client, { action: 'insert', payload });
  if (edge.ok === true) {
    return { error: null };
  }
  const edgeInsertErr = edge.error;

  const jsonRpc = await rpcPortalJobAccessInsertJson(client, payload);
  if (!jsonRpc.error) return { error: null };
  if (isNonRetryablePortalJobAccessErr(jsonRpc.error.message)) {
    return {
      error: new Error(
        `${jsonRpc.error.message} | If granting from Subcontractor Hub, ensure a portal user exists for this subcontractor (the app creates one automatically after this update).`
      ),
    };
  }

  const { error: rpcError } = await client.rpc('office_insert_portal_job_access', insertRpcArgs(payload));
  if (!rpcError) return { error: null };

  const direct = await insertPortalJobAccessDirect(client, payload);
  if (!direct.error) return { error: null };

  const parts: string[] = [];
  if (!isEdgeSkippedErr(edgeInsertErr)) parts.push(edgeInsertErr.message);
  parts.push(jsonRpc.error.message);
  parts.push(rpcError.message);
  parts.push(direct.error.message);
  let msg = parts.filter(Boolean).join(' | ');
  if (/schema cache|Could not find the function/i.test(msg)) {
    msg +=
      ' | Run scripts/portal-job-access-json-rpcs.sql (single-arg jsonb RPCs), then NOTIFY pgrst, \'reload schema\'; and/or scripts/portal-job-access-emergency-rls-off.sql if RLS blocks inserts.';
  }
  return { error: new Error(msg) };
}

async function updatePortalJobAccessDirect(
  client: SupabaseClient,
  id: string,
  payload: PortalJobAccessUpdatePayload
): Promise<{ error: Error | null }> {
  let { error } = await client.from('portal_job_access').update(payload).eq('id', id);
  if (error && isOptionalColumnError(error)) {
    const { can_view_proposal, can_view_materials, can_edit_schedule, ...fallbackPayload } = payload;
    void can_view_proposal;
    void can_view_materials;
    void can_edit_schedule;
    const fb = await client.from('portal_job_access').update(fallbackPayload).eq('id', id);
    error = fb.error;
  }
  return { error: error as Error | null };
}

export async function updatePortalJobAccess(
  client: SupabaseClient,
  id: string,
  payload: PortalJobAccessUpdatePayload
): Promise<{ error: Error | null }> {
  const edge = await callPortalJobAccessEdge(client, { action: 'update', id, payload });
  if (edge.ok === true) {
    return { error: null };
  }
  const edgeUpdateErr = edge.error;

  const jsonRpc = await rpcPortalJobAccessUpdateJson(client, id, payload);
  if (!jsonRpc.error) return { error: null };

  const { error: rpcError } = await client.rpc('office_update_portal_job_access', {
    p_id: id,
    p_can_view_schedule: payload.can_view_schedule,
    p_can_view_documents: payload.can_view_documents,
    p_can_view_photos: payload.can_view_photos,
    p_can_view_financials: payload.can_view_financials,
    p_can_view_proposal: payload.can_view_proposal,
    p_can_view_materials: payload.can_view_materials,
    p_can_edit_schedule: payload.can_edit_schedule,
    p_notes: payload.notes,
  });
  if (!rpcError) return { error: null };

  const direct = await updatePortalJobAccessDirect(client, id, payload);
  if (!direct.error) return { error: null };

  const parts: string[] = [];
  if (!isEdgeSkippedErr(edgeUpdateErr)) parts.push(edgeUpdateErr.message);
  parts.push(jsonRpc.error.message);
  parts.push(rpcError.message);
  parts.push(direct.error.message);
  return { error: new Error(parts.filter(Boolean).join(' | ')) };
}

export async function deletePortalJobAccess(client: SupabaseClient, id: string): Promise<{ error: Error | null }> {
  const edge = await callPortalJobAccessEdge(client, { action: 'delete', id });
  if (edge.ok === true) {
    return { error: null };
  }
  const edgeDeleteErr = edge.error;

  const jsonRpc = await rpcPortalJobAccessDeleteJson(client, id);
  if (!jsonRpc.error) return { error: null };

  const { error: rpcError } = await client.rpc('office_delete_portal_job_access', { p_id: id });
  if (!rpcError) return { error: null };

  const { error: directError } = await client.from('portal_job_access').delete().eq('id', id);
  if (!directError) return { error: null };

  const parts: string[] = [];
  if (!isEdgeSkippedErr(edgeDeleteErr)) parts.push(edgeDeleteErr.message);
  parts.push(jsonRpc.error.message);
  parts.push(rpcError.message);
  parts.push(directError.message);
  return { error: new Error(parts.filter(Boolean).join(' | ')) };
}

/** Subcontractor portal (anon): Edge list, then json RPC list, then legacy RPC, then direct select. */
export async function fetchPortalJobAccessRowsForSubcontractor(
  client: SupabaseClient,
  portalUserId: string
): Promise<{ rows: Record<string, unknown>[]; error: Error | null }> {
  const edge = await callPortalJobAccessEdge(client, {
    action: 'list_for_subcontractor',
    portal_user_id: portalUserId,
  });
  if (edge.ok === true && Array.isArray(edge.rows)) {
    return { rows: edge.rows, error: null };
  }
  let edgeListErr: Error | null = null;
  if (edge.ok === false) {
    edgeListErr = edge.error;
  }

  let listJsonData: unknown;
  const firstList = await client.rpc('office_portal_job_access_list_json', {
    p_portal_user_id: portalUserId,
  });
  listJsonData = firstList.data;
  let listJsonErr = firstList.error;
  if (listJsonErr && isRpcArgMismatch(listJsonErr)) {
    const second = await client.rpc('office_portal_job_access_list_json', {
      portal_user_id: portalUserId,
    });
    listJsonData = second.data;
    listJsonErr = second.error;
  }
  if (!listJsonErr) {
    const parsed = parseListRpcPayload(listJsonData);
    if (parsed) {
      return { rows: parsed, error: null };
    }
  }

  const { data: rpcData, error: rpcError } = await client.rpc('office_list_portal_job_access_for_sub', {
    p_portal_user_id: portalUserId,
  });
  if (!rpcError) {
    const parsed = parseListRpcPayload(rpcData);
    if (parsed) {
      return { rows: parsed, error: null };
    }
  }

  const { data, error } = await client
    .from('portal_job_access')
    .select('*, jobs(*)')
    .eq('portal_user_id', portalUserId);
  if (error) {
    const parts: string[] = [];
    if (edgeListErr && !isEdgeSkippedErr(edgeListErr)) parts.push(edgeListErr.message);
    if (listJsonErr) parts.push(listJsonErr.message);
    if (rpcError) parts.push(rpcError.message);
    parts.push(error.message);
    return { rows: [], error: new Error(parts.filter(Boolean).join(' | ')) };
  }
  return { rows: (data || []) as Record<string, unknown>[], error: null };
}
