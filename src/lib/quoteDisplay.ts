/** Fields needed to render quote / estimate identifiers in the UI */
export type QuoteNumberFields = {
  proposal_number?: string | null;
  quote_number?: string | null;
  estimate_number?: string | null;
  id?: string;
  is_change_order_proposal?: boolean | null;
  is_customer_estimate?: boolean | null;
};

/** Formal proposals: proposal_number. Customer estimates: dedicated estimate_number ({proposal}-E{n}), then fallbacks. */
export function displayNumberForQuoteRow(q: QuoteNumberFields, isCustomerEstimate: boolean): string {
  if (isCustomerEstimate) {
    const est = q.estimate_number != null && String(q.estimate_number).trim() !== '' ? String(q.estimate_number).trim() : '';
    if (est) return est;
    const primary = q.quote_number;
    const fallback = q.proposal_number;
    const raw = primary ?? fallback;
    if (raw != null && String(raw).trim() !== '') return String(raw).trim();
  } else {
    const primary = q.proposal_number;
    const fallback = q.quote_number;
    const raw = primary ?? fallback;
    if (raw != null && String(raw).trim() !== '') return String(raw).trim();
  }
  const id = q.id?.replace(/-/g, '') ?? '';
  return id.slice(0, 8) || '—';
}

/** Short label for proposal/estimate dropdowns (materials, dialogs). */
export function formatQuoteScopeLabel(q: QuoteNumberFields): string {
  if (q.is_change_order_proposal) return 'Change orders';
  const isEst = q.is_customer_estimate === true;
  const num = displayNumberForQuoteRow(q, isEst);
  if (isEst) return `Estimate #${num}`;
  return num;
}
