/**
 * Proposal/workbook lock rules:
 * - "Mark as sent" records `sent_at` only — it must not lock materials (sent cannot be "undone" but is not a contract).
 * - Contract = customer signature and/or office signed_version — revocable via Revoke contract.
 * - `locked_for_editing` = office manual lock.
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
