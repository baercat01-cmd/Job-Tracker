import { supabase } from '@/lib/supabase';

/** Safe integer for order_index / version_number. */
function toSafeInt(value: unknown, max = 2147483647): number {
  const n = Number(value);
  if (value === undefined || value === null || Number.isNaN(n) || !Number.isFinite(n)) return 0;
  const i = Math.floor(n);
  if (i < 0) return 0;
  return i > max ? max : i;
}

/**
 * Quantity safe for narrow numeric(5,4) columns (max 9.9999).
 * Returns { value, capped } if we had to cap.
 */
export function safeQuantityForInsert(qty: number): { value: number; capped: boolean } {
  const rounded = Math.round(qty * 10000) / 10000;
  if (rounded > 9.9999) {
    return { value: 9.9999, capped: true };
  }
  return { value: Math.max(0.0001, rounded), capped: false };
}

const MAX_MONEY_MAGNITUDE = 1e12;

function roundDecimals(n: number, places: number): number {
  const m = 10 ** places;
  return Math.round(n * m) / m;
}

/**
 * Normalize numeric fields before material_items insert (Excel upload / round-trip).
 * Reduces float noise; real fix for "numeric field overflow" on quantity > 9.9999 is DB migration
 * `20260326190000_material_items_widen_numeric_columns.sql`.
 */
export function sanitizeMaterialItemNumericsForInsert(row: {
  quantity: number;
  cost_per_unit: number | null;
  markup_percent: number | null;
  price_per_unit: number | null;
  extended_cost: number | null;
  extended_price: number | null;
}): {
  quantity: number;
  cost_per_unit: number | null;
  markup_percent: number | null;
  price_per_unit: number | null;
  extended_cost: number | null;
  extended_price: number | null;
} {
  const q = Number(row.quantity);
  const quantity = Number.isFinite(q) ? Math.max(0, roundDecimals(q, 6)) : 0;

  const money = (v: number | null) => {
    if (v == null || !Number.isFinite(v)) return null;
    if (Math.abs(v) > MAX_MONEY_MAGNITUDE) return null;
    return roundDecimals(v, 6);
  };

  return {
    quantity,
    cost_per_unit: money(row.cost_per_unit),
    markup_percent: money(row.markup_percent),
    price_per_unit: money(row.price_per_unit),
    extended_cost: money(row.extended_cost),
    extended_price: money(row.extended_price),
  };
}

/** Canonical sheet name for crew/field requests. Use this so items show in "Field Request" tab. */
export const FIELD_REQUEST_SHEET_NAME = 'Field Request';

/** Alternate names we treat as the same sheet (legacy / UI). */
const FIELD_REQUEST_SHEET_ALIASES = ['Field Request', 'Field Requests', 'Crew Orders'];

const FIELD_REQUEST_SHEET_NAMES_LOWER = new Set(
  FIELD_REQUEST_SHEET_ALIASES.map((a) => a.toLowerCase())
);

/** True for crew/field-request workbook sections — hide from customer portal & proposal print to customer. */
export function isFieldRequestSheetName(sheetName: string | null | undefined): boolean {
  return FIELD_REQUEST_SHEET_NAMES_LOWER.has(String(sheetName ?? '').trim().toLowerCase());
}

/**
 * Returns the single canonical "Field Request" sheet ID for a job.
 * Crew-requested materials (including "Not Ordered") are stored here so they appear in the workbook.
 * Searches across ALL working workbooks so we never create duplicates.
 * Creates a new workbook + sheet only when truly nothing exists.
 */
export async function getOrCreateCrewOrdersSheetId(
  jobId: string,
  createdBy: string | null
): Promise<string> {
  const { data: workingWbs } = await supabase
    .from('material_workbooks')
    .select('id')
    .eq('job_id', jobId)
    .eq('status', 'working')
    .order('created_at', { ascending: true });

  const workingWbIds = (workingWbs || []).map((w: { id: string }) => w.id);

  if (workingWbIds.length > 0) {
    const { data: crewSheet } = await supabase
      .from('material_sheets')
      .select('id')
      .in('workbook_id', workingWbIds)
      .in('sheet_name', FIELD_REQUEST_SHEET_ALIASES)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (crewSheet) return crewSheet.id;
  }

  let workbookId: string;
  if (workingWbIds.length > 0) {
    workbookId = workingWbIds[0];
  } else {
    const { data: maxWb } = await supabase
      .from('material_workbooks')
      .select('version_number')
      .eq('job_id', jobId)
      .order('version_number', { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextVersion = toSafeInt(Number(maxWb?.version_number ?? 0) + 1);
    const { data: newWorkbook, error: workbookError } = await supabase
      .from('material_workbooks')
      .insert({
        job_id: jobId,
        version_number: nextVersion,
        status: 'working',
        created_by: createdBy,
      })
      .select()
      .single();
    if (workbookError) throw workbookError;
    workbookId = newWorkbook.id;
  }

  const { data: sheetRows } = await supabase
    .from('material_sheets')
    .select('order_index')
    .eq('workbook_id', workbookId)
    .order('order_index', { ascending: false })
    .limit(1);
  const nextOrderIndex = toSafeInt(
    sheetRows?.length ? Number(sheetRows[0].order_index) + 1 : 0
  );
  const { data: newSheet, error: sheetError } = await supabase
    .from('material_sheets')
    .insert({
      workbook_id: workbookId,
      sheet_name: FIELD_REQUEST_SHEET_NAME,
      description: 'Materials requested by crew from the field',
      order_index: nextOrderIndex,
    })
    .select()
    .single();
  if (sheetError) throw sheetError;
  return newSheet.id;
}

/** Minimal workbook row shape for orphan detection (merge hidden sheets into UI). */
export type MaterialWorkbookMergeRow = {
  id: string;
  quote_id?: string | null;
  status?: string | null;
  version_number?: number | null;
};

/**
 * After signing / cloning / pruning, extra `material_workbooks` rows can remain for the same quote.
 * Their `material_sheets` are otherwise invisible because the UI only loads the newest locked + working pair.
 * Returns workbooks that should have their sheets merged into the primary workbook view (by sheet id).
 */
export function orphanMaterialWorkbooksForQuoteMerge(
  wbs: MaterialWorkbookMergeRow[],
  matchQuote: (w: MaterialWorkbookMergeRow) => boolean
): MaterialWorkbookMergeRow[] {
  const forQuote = wbs.filter(matchQuote);
  if (forQuote.length <= 1) return [];

  const byVerDesc = (rows: MaterialWorkbookMergeRow[]) =>
    [...rows].sort((a, b) => (Number(b.version_number) || 0) - (Number(a.version_number) || 0));

  const newestLocked = byVerDesc(forQuote.filter((w) => w.status === 'locked'))[0];
  const newestWorking = byVerDesc(forQuote.filter((w) => w.status === 'working'))[0];

  const pairIds = new Set<string>();
  if (newestLocked?.id) pairIds.add(String(newestLocked.id));
  if (newestWorking?.id) pairIds.add(String(newestWorking.id));

  const isOnlyLockedWorkingPair =
    forQuote.length === 2 &&
    pairIds.size === 2 &&
    forQuote.every((w) => pairIds.has(String(w.id)));

  if (isOnlyLockedWorkingPair) return [];

  return forQuote.filter((w) => !pairIds.has(String(w.id)));
}

export function normalizeMaterialSheetNameForMerge(v: unknown): string {
  return String(v ?? '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Logical identity when merging orphan workbooks: same tab title + order + type = one section in the proposal UI.
 * Orphan snapshots often create new sheet UUIDs for the same tab; merging without this duplicates "Materials" sections.
 */
export function materialSheetLogicalMergeKey(s: {
  sheet_name?: unknown;
  order_index?: unknown;
  sheet_type?: unknown;
}): string {
  return `${normalizeMaterialSheetNameForMerge(s?.sheet_name)}|${toSafeInt(s?.order_index)}|${String(s?.sheet_type ?? 'proposal')}`;
}
