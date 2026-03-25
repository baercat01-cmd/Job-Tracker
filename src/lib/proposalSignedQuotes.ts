import { supabase } from '@/lib/supabase';

/** Quote IDs that have at least one signed `proposal_versions` row (contract evidence when quotes row is stale). */
export async function fetchQuoteIdsWithSignedProposalVersion(quoteIds: string[]): Promise<Set<string>> {
  const ids = [...new Set(quoteIds.filter(Boolean))];
  if (ids.length === 0) return new Set();
  const { data, error } = await supabase
    .from('proposal_versions')
    .select('quote_id')
    .in('quote_id', ids)
    .eq('is_signed', true);
  if (error) {
    console.warn('fetchQuoteIdsWithSignedProposalVersion:', error.message);
    return new Set();
  }
  return new Set((data || []).map((r: { quote_id: string }) => r.quote_id).filter(Boolean));
}
