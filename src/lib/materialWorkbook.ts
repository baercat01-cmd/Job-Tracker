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

/** Canonical sheet name for crew/field requests. Use this so items show in "Field Request" tab. */
export const FIELD_REQUEST_SHEET_NAME = 'Field Request';

/** Alternate names we treat as the same sheet (legacy / UI). */
const FIELD_REQUEST_SHEET_ALIASES = ['Field Request', 'Field Requests', 'Crew Orders'];

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
