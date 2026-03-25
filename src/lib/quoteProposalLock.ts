/**
 * Proposal/workbook lock rules:
 * - "Mark as sent" records `sent_at` only — it must not lock materials (sent cannot be "undone" but is not a contract).
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
  q: {
    signed_version?: unknown;
    customer_signed_at?: string | null;
    /**
     * True when any `proposal_versions` row for this quote has `is_signed` (office or portal).
     * Handles legacy rows where `quotes.signed_version` was never backfilled after signing.
     */
    has_signed_proposal_version?: boolean | null;
  } | null | undefined
): boolean {
  if (!q) return false;
  if (q.has_signed_proposal_version === true) return true;
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

/** @deprecated Use isQuoteWorkbookReadOnlyByFlags — kept name for call sites that meant "frozen for contract". */
export function isQuoteContractFrozen(
  q: {
    locked_for_editing?: boolean | null;
    signed_version?: unknown;
    customer_signed_at?: string | null;
    /** Ignored: sent does not imply contract or workbook lock */
    sent_at?: string | null;
  } | null | undefined
): boolean {
  return isQuoteWorkbookReadOnlyByFlags(q);
}
