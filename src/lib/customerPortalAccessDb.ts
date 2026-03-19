/**
 * Portal link persistence via PostgREST on customer_portal_access only.
 * Avoids update_customer_portal_link / create_customer_portal_link RPCs (schema cache / PGRST202 issues).
 */
import { supabase } from '@/lib/supabase';

export function isPortalColumnOrSchemaError(e: unknown): boolean {
  const m = String((e as { message?: string })?.message ?? '');
  const code = (e as { code?: string })?.code;
  return (
    code === 'PGRST204' ||
    /show_line_item_prices|show_section_prices|visibility_by_quote|column.*exist|unknown column|schema cache/i.test(m)
  );
}

export function isPortalUpdateBlockedError(e: unknown): boolean {
  const code = (e as { code?: string })?.code;
  const m = String((e as { message?: string })?.message ?? '');
  return code === '42501' || code === 'PGRST301' || /RLS|permission|denied|row-level security/i.test(m);
}

const ZERO_ROWS = 'PORTAL_UPDATE_0_ROWS';

/** Strip jsonb / newer columns for older PostgREST schemas. */
export function stripOptionalPortalColumns(patch: Record<string, unknown>): Record<string, unknown> {
  const o = { ...patch };
  delete o.show_line_item_prices;
  delete o.show_section_prices;
  delete o.visibility_by_quote;
  return o;
}

/**
 * UPDATE customer_portal_access by id. Retries without optional columns if needed.
 * Returns error if 0 rows updated (RLS or wrong id).
 */
export async function updateCustomerPortalAccessRow(
  linkId: string,
  patch: Record<string, unknown>,
  selectColumns: string,
  selectFallback: string
): Promise<{ data: Record<string, unknown> | null; error: unknown }> {
  const payload = { ...patch, updated_at: new Date().toISOString() };
  let res = await supabase
    .from('customer_portal_access')
    .update(payload)
    .eq('id', linkId)
    .select(selectColumns);

  if (res.error && isPortalColumnOrSchemaError(res.error)) {
    res = await supabase
      .from('customer_portal_access')
      .update(stripOptionalPortalColumns(payload))
      .eq('id', linkId)
      .select(selectFallback);
  }

  if (res.error) {
    return { data: null, error: res.error };
  }
  const rows = res.data ?? [];
  if (rows.length === 0) {
    return {
      data: null,
      error: {
        code: ZERO_ROWS,
        message:
          'Could not update portal link (no row updated). Run migration 20250340000000_customer_portal_access_rest_writes.sql in Supabase SQL Editor, or scripts/fix-customer-portal-access-rls.sql.',
      },
    };
  }
  const row = rows[0] as unknown as Record<string, unknown>;
  if (selectFallback === selectColumns || row.show_line_item_prices === undefined) {
    row.show_line_item_prices = row.show_line_item_prices ?? false;
  }
  return { data: row, error: null };
}

/**
 * Same as update but no returned row (lighter). For autosave paths.
 */
export async function updateCustomerPortalAccessRowMinimal(
  linkId: string,
  patch: Record<string, unknown>
): Promise<{ ok: boolean; error: unknown }> {
  const payload = { ...patch, updated_at: new Date().toISOString() };
  let res = await supabase.from('customer_portal_access').update(payload).eq('id', linkId).select('id');
  if (res.error && isPortalColumnOrSchemaError(res.error)) {
    res = await supabase
      .from('customer_portal_access')
      .update(stripOptionalPortalColumns(payload))
      .eq('id', linkId)
      .select('id');
  }
  if (res.error) return { ok: false, error: res.error };
  if (!res.data?.length) {
    return {
      ok: false,
      error: {
        code: ZERO_ROWS,
        message:
          'Could not save portal settings. Apply migration 20250340000000_customer_portal_access_rest_writes.sql (or fix-customer-portal-access-rls.sql) in Supabase.',
      },
    };
  }
  return { ok: true, error: null };
}

export async function insertCustomerPortalAccessRow(
  insertPayload: Record<string, unknown>,
  selectColumns: string,
  selectFallback: string
): Promise<{ data: Record<string, unknown> | null; error: unknown }> {
  let res = await supabase.from('customer_portal_access').insert([insertPayload]).select(selectColumns);
  if (res.error && isPortalColumnOrSchemaError(res.error)) {
    const { show_line_item_prices, show_section_prices, visibility_by_quote, ...rest } = insertPayload as Record<
      string,
      unknown
    >;
    res = await supabase.from('customer_portal_access').insert([rest]).select(selectFallback);
  }
  if (res.error) return { data: null, error: res.error };
  const row = (res.data?.[0] as unknown as Record<string, unknown>) ?? null;
  if (row && row.show_line_item_prices === undefined) row.show_line_item_prices = false;
  return { data: row, error: null };
}

export function portalSaveErrorMessage(error: unknown): string {
  const e = error as { code?: string; message?: string; details?: string };
  if (e?.code === ZERO_ROWS || e?.code === 'PGRST116') {
    return e.message ?? 'Update did not apply. Check Supabase RLS/grants (run portal REST migration).';
  }
  if (isPortalUpdateBlockedError(error)) {
    return 'Database blocked this action. Run scripts/fix-customer-portal-access-rls.sql in Supabase SQL Editor.';
  }
  if (e?.code === '23502') {
    return 'Save failed (NOT NULL). Ensure show_section_prices and visibility_by_quote are sent; run ensure-portal-section-visibility.sql if needed.';
  }
  return e?.message || e?.details || 'Save failed';
}
