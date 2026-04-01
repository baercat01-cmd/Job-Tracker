import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { isQuoteContractFrozen, sortQuotesLikeJobFinancials } from '@/lib/quoteProposalLock';
import type { Job } from '@/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calculator, Briefcase } from 'lucide-react';
import { JobProposalBudgetBreakdownPanel } from '@/components/office/JobProposalBudgetBreakdownPanel';

function defaultQuoteIdForJob(quotes: any[]): string | null {
  if (!quotes?.length) return null;
  const mainQuotes = quotes.filter((q: any) => !q.is_change_order_proposal);
  const frozenMain = mainQuotes.filter((q: any) => isQuoteContractFrozen(q));
  if (frozenMain.length > 0) {
    return frozenMain.sort(
      (a: any, b: any) =>
        new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
    )[0]?.id ?? null;
  }
  const sorted = sortQuotesLikeJobFinancials(quotes);
  return sorted[0]?.id ?? null;
}

export function JobProposalCostBudgetPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [jobId, setJobId] = useState<string>('');

  const [quotes, setQuotes] = useState<any[]>([]);
  const [quotesLoading, setQuotesLoading] = useState(false);
  const [quoteId, setQuoteId] = useState<string>('');

  const loadJobs = useCallback(async () => {
    setJobsLoading(true);
    try {
      const { data, error: err } = await supabase
        .from('jobs')
        .select('*')
        .order('created_at', { ascending: false });
      if (err) throw err;
      const list = (data || []).filter((j: Job) => !j.is_internal && j.status !== 'archived');
      setJobs(list);
    } catch (e: unknown) {
      console.error(e);
      setJobs([]);
    } finally {
      setJobsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  useEffect(() => {
    if (!jobId) {
      setQuotes([]);
      setQuoteId('');
      return;
    }
    let cancelled = false;
    setQuotesLoading(true);
    (async () => {
      const { data, error: err } = await supabase
        .from('quotes')
        .select(
          'id, proposal_number, quote_number, created_at, job_id, is_change_order_proposal, locked_for_editing, signed_version, customer_signed_at, sent_at, tax_exempt, proposal_grand_total'
        )
        .eq('job_id', jobId)
        .order('created_at', { ascending: false });
      if (cancelled) return;
      if (err) {
        setQuotes([]);
        setQuoteId('');
        setQuotesLoading(false);
        return;
      }
      const list = data || [];
      setQuotes(list);
      const def = defaultQuoteIdForJob(list);
      setQuoteId((prev) => (prev && list.some((q: any) => q.id === prev) ? prev : def || ''));
      setQuotesLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="bg-gradient-to-r from-slate-900 via-emerald-950 to-slate-900 text-white rounded-lg p-4 shadow-lg border-2 border-emerald-600">
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight flex items-center gap-2">
          <Calculator className="w-7 h-7 text-emerald-400" />
          Proposal cost budget
        </h2>
        <p className="text-emerald-200/90 text-sm mt-1">
          Totals are computed automatically from proposal costs: material extended costs, internal labor, custom row costs,
          and subcontractor line amounts (no sell markup).
        </p>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <Briefcase className="w-5 h-5" />
            Select job & proposal
          </CardTitle>
          <CardDescription>
            Defaults match the job detail view: contract-locked proposal when present, otherwise highest proposal number.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Job</Label>
              <Select
                value={jobId || undefined}
                onValueChange={(v) => {
                  setJobId(v);
                  setQuoteId('');
                }}
                disabled={jobsLoading}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={jobsLoading ? 'Loading jobs…' : 'Choose a job'} />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {jobs.map((j) => (
                    <SelectItem key={j.id} value={j.id}>
                      {j.name} — {j.client_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Proposal</Label>
              <Select
                value={quoteId || undefined}
                onValueChange={setQuoteId}
                disabled={!jobId || quotesLoading || quotes.length === 0}
              >
                <SelectTrigger className="w-full">
                  <SelectValue
                    placeholder={
                      !jobId
                        ? 'Select a job first'
                        : quotesLoading
                          ? 'Loading proposals…'
                          : quotes.length === 0
                            ? 'No proposals'
                            : 'Choose proposal'
                    }
                  />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {sortQuotesLikeJobFinancials(quotes).map((q: any) => (
                    <SelectItem key={q.id} value={q.id}>
                      #{q.proposal_number || q.quote_number || q.id.slice(0, 8)}
                      {q.is_change_order_proposal ? ' (change order)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <JobProposalBudgetBreakdownPanel jobId={jobId} quoteId={quoteId || null} />
    </div>
  );
}
