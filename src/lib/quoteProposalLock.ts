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
 *   `working` (UI: "job workbook") for shop/COS/field tracking only — it does not drive customer proposal totals. JobFinancials
 *   reads the locked row for materials totals. The proposal-priced workbook is read-only whenever the left proposal panel
 *   is read-only (contract, office lock, or older proposal version), and becomes editable after Unlock — same session flag as JobFinancials.
 *   The job workbook (`working` row) stays a separate editable book.
 */

export function quoteHasActiveContract(
  q: { signed_version?: unknown; customer_signed_at?: string | null } | null | undefined
): boolean {
  if (!q) return false;
  const sv = q.signed_version;
  const hasSignedVersion = sv != null && String(sv).trim() !== '' && Number(sv) > 0;
  return !!(q.customer_signed_at || hasSignedVersion);
}

export type QuoteNavSortFields = {
  id: string;
  proposal_number?: string | null;
  quote_number?: string | null;
};

/** Same ordering as JobFinancials `loadQuoteData` (highest proposal number first). */
export function sortQuotesLikeJobFinancials<T extends QuoteNavSortFields>(quotes: T[]): T[] {
  return [...quotes].sort((a, b) => {
    const na = (a.proposal_number || a.quote_number || '').toString();
    const nb = (b.proposal_number || b.quote_number || '').toString();
    if (na === nb) return 0;
    return nb.localeCompare(na, undefined, { numeric: true });
  });
}

/** Matches JobFinancials default lock: not the newest quote in the job list, signed contract, or `locked_for_editing`. */
export function isQuoteDefaultLockedForProposalPanel(
  quote: {
    id: string;
    locked_for_editing?: boolean | null;
    signed_version?: unknown;
    customer_signed_at?: string | null;
  } | null | undefined,
  allJobQuotesSortedLikeFinancials: { id: string }[]
): boolean {
  if (!quote) return false;
  return (
    (allJobQuotesSortedLikeFinancials.length > 0 && quote.id !== allJobQuotesSortedLikeFinancials[0]?.id) ||
    quoteHasActiveContract(quote) ||
    !!quote.locked_for_editing
  );
}

/**
 * Matches JobFinancials `isReadOnly`: office lock (`locked_for_editing`) always read-only. Otherwise contract / older
 * proposal stays read-only until session unlock (`historicalUnlockedQuoteId` in JobFinancials).
 */
export function isProposalPanelReadOnly(
  quote: {
    id: string;
    locked_for_editing?: boolean | null;
    signed_version?: unknown;
    customer_signed_at?: string | null;
  } | null | undefined,
  allJobQuotesSortedLikeFinancials: { id: string }[],
  sessionUnlockedQuoteId: string | null
): boolean {
  if (!quote) return false;
  if (quote.locked_for_editing) return true;
  const otherReasonLocked =
    (allJobQuotesSortedLikeFinancials.length > 0 && quote.id !== allJobQuotesSortedLikeFinancials[0]?.id) ||
    quoteHasActiveContract(quote);
  return otherReasonLocked && quote.id !== sessionUnlockedQuoteId;
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
