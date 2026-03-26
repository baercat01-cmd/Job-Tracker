/**
 * Proposal/workbook lock rules:
 * - "Mark as sent" records `sent_at` (permanent) and also sets `locked_for_editing` + locks the workbook.
 *   Sent can be *unlocked for editing* without clearing `sent_at`.
 *   Sent is NOT a contract and does NOT create a contract workbook pair.
 * - Contract = customer signature and/or office `signed_version` — revocable via Revoke contract.
 * - `locked_for_editing` = office manual lock (single materials workbook flipped to `status: 'locked'`; no auto job-tracking duplicate).
 *
 * Materials workbook model:
 * - Draft: one `working` row per proposal holds price + line items; header/portal track this workbook.
 * - Office-locked proposal: that same row becomes `locked` (still the only row for that quote).
 * - Signed contract: current workbook is set `locked` (proposal price / contract snapshot), then a second row is inserted as
 *   `working` for shop/COS/job tracking only — JobFinancials and stored proposal totals must never read the working row for price.
 */

export function quoteHasActiveContract(
  q: { signed_version?: unknown; customer_signed_at?: string | null } | null | undefined
): boolean {
  if (!q) return false;
  const sv = q.signed_version;
  const hasSignedVersion = sv != null && String(sv).trim() !== '' && Number(sv) > 0;
  return !!(q.customer_signed_at || hasSignedVersion);
}

/** True when materials / proposal financials should be read-only from quote flags (not workbook row status). */
export function isQuoteWorkbookReadOnlyByFlags(
  q: {
    locked_for_editing?: boolean | null;
    signed_version?: unknown;
    customer_signed_at?: string | null;
  } | null | undefined
): boolean {
  if (!q) return false;
  return !!(q.locked_for_editing || quoteHasActiveContract(q));
}

/** @deprecated Use isQuoteWorkbookReadOnlyByFlags — kept name for call sites that mean "read-only/frozen". */
export function isQuoteContractFrozen(
  q: {
    locked_for_editing?: boolean | null;
    signed_version?: unknown;
    customer_signed_at?: string | null;
    /** Sent is not a contract, but it does imply read-only + workbook lock. */
    sent_at?: string | null;
  } | null | undefined
): boolean {
  return isQuoteWorkbookReadOnlyByFlags(q);
}
