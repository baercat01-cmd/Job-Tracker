import { useState, useEffect, lazy, Suspense } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import type { Job } from '@/types';

export type ViewMode = 'split' | 'proposal' | 'materials';

// Lazy-load heavy panels so the tab opens fast; they load when first needed
const JobFinancials = lazy(() => import('./JobFinancials').then((m) => ({ default: m.JobFinancials })));
const MaterialsManagement = lazy(() => import('./MaterialsManagement').then((m) => ({ default: m.MaterialsManagement })));

const PanelFallback = () => (
  <div className="flex items-center justify-center min-h-[280px] bg-slate-50/80">
    <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

interface ProposalAndMaterialsViewProps {
  job: Job;
  userId?: string;
  viewMode?: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
}

export function ProposalAndMaterialsView({ job, userId: userIdProp, viewMode: viewModeProp, onViewModeChange }: ProposalAndMaterialsViewProps) {
  const { profile } = useAuth();
  const userId = userIdProp ?? profile?.id ?? '';
  const [internalViewMode, setInternalViewMode] = useState<ViewMode>('split');
  const viewMode = viewModeProp ?? internalViewMode;
  const setViewMode = onViewModeChange ?? setInternalViewMode;
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(null);

  // When job changes, set proposal to most recent only if we don't already have a valid selection for this job
  // so that switching proposals and re-opening the tab doesn't reset the user's choice
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: quotes, error } = await supabase
        .from('quotes')
        .select('id, proposal_number, quote_number, created_at')
        .eq('job_id', job.id)
        .order('created_at', { ascending: false });
      if (!mounted) return;
      if (error || !quotes?.length) {
        setSelectedQuoteId(null);
        return;
      }
      // Same order as JobFinancials: highest proposal number first (e.g. 26012-3 before 26012-2)
      const sorted = [...quotes].sort((a: any, b: any) => {
        const na = (a.proposal_number || a.quote_number || '').toString();
        const nb = (b.proposal_number || b.quote_number || '').toString();
        if (na === nb) return 0;
        return nb.localeCompare(na, undefined, { numeric: true });
      });
      setSelectedQuoteId((prev) => {
        if (prev && sorted.some((q: any) => q.id === prev)) return prev;
        return sorted[0]?.id ?? null;
      });
    })();
    return () => { mounted = false; };
  }, [job.id]);

  if (!userId) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading…</p>
        </div>
      </div>
    );
  }

  const showProposal = viewMode === 'split' || viewMode === 'proposal';
  const showMaterials = viewMode === 'split' || viewMode === 'materials';
  const isSplit = viewMode === 'split';

  return (
    <div className="flex flex-col h-full min-h-0 w-full">
      <div className="flex-1 flex min-h-0 border-t border-slate-200 overflow-hidden">
        {/* Proposal panel — narrower in split so materials workbook has more room */}
        <div
          className={`min-w-0 flex flex-col bg-white overflow-auto transition-all ${
            isSplit ? 'w-2/5 min-w-[260px] border-r border-slate-200' : 'w-full'
          } ${showProposal ? '' : 'hidden'}`}
        >
          <div className="w-full max-w-full mx-auto space-y-2 pt-0 pb-2 px-3">
            <Suspense fallback={<PanelFallback />}>
              <JobFinancials
                job={job}
                controlledQuoteId={selectedQuoteId ?? undefined}
                onQuoteChange={setSelectedQuoteId}
              />
            </Suspense>
          </div>
        </div>

        {/* Materials panel — flex-1 so it uses remaining space; scrolls to show all data */}
        <div
          className={`min-w-0 flex flex-col bg-slate-50 overflow-auto flex-1 w-full ${
            showMaterials ? '' : 'hidden'
          }`}
        >
          <Suspense fallback={<PanelFallback />}>
            <MaterialsManagement
              job={job}
              userId={userId}
              controlledQuoteId={selectedQuoteId ?? undefined}
              onQuoteChange={setSelectedQuoteId}
            />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
