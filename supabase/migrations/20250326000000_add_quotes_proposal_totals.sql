-- Store proposal totals on the quote so the customer portal can display the same numbers as the job Proposal tab.
-- JobFinancials writes these when the proposal is viewed; the portal reads and displays them.
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS proposal_subtotal numeric,
  ADD COLUMN IF NOT EXISTS proposal_tax numeric,
  ADD COLUMN IF NOT EXISTS proposal_grand_total numeric,
  ADD COLUMN IF NOT EXISTS proposal_totals_updated_at timestamptz;

COMMENT ON COLUMN public.quotes.proposal_subtotal IS 'Proposal subtotal (materials + labor) when last viewed in office; portal uses this so totals match.';
COMMENT ON COLUMN public.quotes.proposal_grand_total IS 'Proposal grand total (subtotal + tax) when last viewed in office; portal uses this so totals match.';
