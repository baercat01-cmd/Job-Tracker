-- RPC so the customer portal can read proposal totals (subtotal, tax, grand_total) for a quote.
-- JobFinancials writes these to quotes; PostgREST/RLS may not expose them to anon. This RPC returns them.
CREATE OR REPLACE FUNCTION get_quote_proposal_totals(p_quote_id uuid)
RETURNS TABLE(subtotal numeric, tax numeric, grand_total numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT proposal_subtotal, COALESCE(proposal_tax, 0), proposal_grand_total
  FROM quotes
  WHERE id = p_quote_id
    AND proposal_subtotal IS NOT NULL
    AND proposal_grand_total IS NOT NULL;
$$;

COMMENT ON FUNCTION get_quote_proposal_totals(uuid) IS 'Return proposal_subtotal, proposal_tax, proposal_grand_total for a quote. Used by customer portal so Overview totals match JobFinancials.';

GRANT EXECUTE ON FUNCTION public.get_quote_proposal_totals(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_quote_proposal_totals(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_quote_proposal_totals(uuid) TO service_role;
