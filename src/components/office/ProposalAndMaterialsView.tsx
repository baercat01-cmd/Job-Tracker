import { useState, useEffect, lazy, Suspense } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { isQuoteContractFrozen } from '@/lib/quoteProposalLock';
import { fetchQuoteIdsWithSignedProposalVersion } from '@/lib/proposalSignedQuotes';
import type { Job } from '@/types';
import { DocumentPanelContext } from '@/contexts/DocumentPanelContext';
import { FloatingDocumentViewer } from './FloatingDocumentViewer';
import { JobFinancials } from './JobFinancials';
import type { BreakdownSheetPrice } from './MaterialsManagement';

export type ViewMode = 'split' | 'proposal' | 'materials';

// JobFinancials loaded statically so the proposal panel always loads (dynamic chunk was failing).
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
  /** When set, proposal selection is controlled by parent (e.g. JobDetailedView) so it stays in sync with Subcontractors tab. */
  controlledQuoteId?: string | null;
  onQuoteChange?: (quoteId: string | null) => void;
}

export function ProposalAndMaterialsView({ job, userId: userIdProp, viewMode: viewModeProp, onViewModeChange, controlledQuoteId, onQuoteChange }: ProposalAndMaterialsViewProps) {
  const { profile } = useAuth();
  const userId = userIdProp ?? profile?.id ?? '';
  const [internalViewMode, setInternalViewMode] = useState<ViewMode>('split');
  const viewMode = viewModeProp ?? internalViewMode;
  const setViewMode = onViewModeChange ?? setInternalViewMode;
  const [internalQuoteId, setInternalQuoteId] = useState<string | null>(null);
  const [linkedSheetId, setLinkedSheetId] = useState<string | null>(null);
  const [showDocumentsInPanel, setShowDocumentsInPanel] = useState(false);
  const [breakdownSheetPrices, setBreakdownSheetPrices] = useState<BreakdownSheetPrice[]>([]);
  const [materialsWorkbookView, setMaterialsWorkbookView] = useState<{ workbookId: string | null; status: 'working' | 'locked' | null } | null>(null);

  const isControlled = controlledQuoteId !== undefined;
  const selectedQuoteId = isControlled ? (controlledQuoteId ?? null) : internalQuoteId;
  const setSelectedQuoteId = isControlled ? (onQuoteChange ?? (() => {})) : setInternalQuoteId;

  // When uncontrolled and job changes, set proposal to most recent only if we don't already have a valid selection for this job
  useEffect(() => {
    if (isControlled) return;
    let mounted = true;
    (async () => {
      const { data: quotes, error } = await supabase
        .from('quotes')
        .select(
          'id, proposal_number, quote_number, created_at, sent_at, locked_for_editing, signed_version, customer_signed_at, is_change_order_proposal'
        )
        .eq('job_id', job.id)
        .order('created_at', { ascending: false });
      if (!mounted) return;
      if (error || !quotes?.length) {
        setInternalQuoteId(null);
        return;
      }

      const signedIds = await fetchQuoteIdsWithSignedProposalVersion((quotes || []).map((q: any) => q.id));
      const quotesMerged = (quotes || []).map((q: any) => ({
        ...q,
        has_signed_proposal_version: signedIds.has(q.id),
      }));

      // Prefer a signed/office-locked main proposal so Materials binds to the workbook that exists for contracts.
      // This fixes the "No Material Workbook" case when the most-recent proposal is not the frozen contract.
      const mainQuotes = quotesMerged.filter((q: any) => !q.is_change_order_proposal);
      const frozenMain = mainQuotes.filter((q: any) => isQuoteContractFrozen(q));
      if (frozenMain.length > 0) {
        setInternalQuoteId((prev) => {
          if (prev && frozenMain.some((q: any) => q.id === prev)) return prev;
          return frozenMain[0]?.id ?? null; // quotes are already sorted by created_at desc
        });
        return;
      }

      const sorted = [...quotesMerged].sort((a: any, b: any) => {
        const na = (a.proposal_number || a.quote_number || '').toString();
        const nb = (b.proposal_number || b.quote_number || '').toString();
        if (na === nb) return 0;
        return nb.localeCompare(na, undefined, { numeric: true });
      });
      setInternalQuoteId((prev) => {
        if (prev && sorted.some((q: any) => q.id === prev)) return prev;
        return sorted[0]?.id ?? null;
      });
    })();
    return () => { mounted = false; };
  }, [job.id, isControlled]);

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
    <DocumentPanelContext.Provider value={{ showDocumentsInPanel, setShowDocumentsInPanel }}>
      <div className="flex flex-col h-full min-h-0 w-full">
        <div className="flex-1 flex min-h-0 border-t border-slate-200 overflow-hidden">
          {/* Proposal panel — narrower in split so materials workbook has more room */}
          <div
            className={`min-w-0 flex flex-col bg-white overflow-auto transition-all ${
              isSplit ? 'w-2/5 min-w-[260px] border-r border-slate-200' : 'w-full'
            } ${showProposal ? '' : 'hidden'}`}
          >
            <div className="w-full max-w-full mx-auto space-y-2 pt-0 pb-2 px-3">
              <JobFinancials
                job={job}
                controlledQuoteId={selectedQuoteId ?? undefined}
                onQuoteChange={setSelectedQuoteId}
                onSheetSelect={setLinkedSheetId}
                externalBreakdownSheetPrices={breakdownSheetPrices}
                externalMaterialsWorkbookView={materialsWorkbookView}
              />
            </div>
          </div>

          {/* Materials panel — shows document viewer in same view when "Documents" is clicked from header */}
          <div
            className={`min-w-0 flex flex-col bg-slate-50 overflow-auto flex-1 w-full ${
              showMaterials ? '' : 'hidden'
            }`}
          >
            {showDocumentsInPanel ? (
              <div className="flex flex-col h-full min-h-0 w-full p-2">
                <FloatingDocumentViewer
                  jobId={job.id}
                  open={true}
                  onClose={() => setShowDocumentsInPanel(false)}
                  embed
                  backLabel="Back to Workbook"
                />
              </div>
            ) : (
              <Suspense fallback={<PanelFallback />}>
                <MaterialsManagement
                  job={job}
                  userId={userId}
                  controlledQuoteId={selectedQuoteId ?? undefined}
                  onQuoteChange={setSelectedQuoteId}
                  externalActiveSheetId={linkedSheetId}
                  onBreakdownPriceSync={setBreakdownSheetPrices}
                  onWorkbookViewSync={setMaterialsWorkbookView}
                />
              </Suspense>
            )}
          </div>
        </div>
      </div>
    </DocumentPanelContext.Provider>
  );
}
