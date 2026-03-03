import { useState, lazy, Suspense } from 'react';
import { useAuth } from '@/hooks/useAuth';
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
            isSplit ? 'w-2/5 min-w-[280px] border-r border-slate-200' : 'w-full'
          } ${showProposal ? '' : 'hidden'}`}
        >
          <div className="max-w-4xl mx-auto space-y-2 pt-0 pb-2 px-3 w-full">
            <Suspense fallback={<PanelFallback />}>
              <JobFinancials
                job={job}
                controlledQuoteId={selectedQuoteId ?? undefined}
                onQuoteChange={setSelectedQuoteId}
              />
            </Suspense>
          </div>
        </div>

        {/* Materials panel — wider in split to show full workbook */}
        <div
          className={`min-w-0 flex flex-col bg-slate-50 overflow-auto flex-1 ${
            isSplit ? 'min-w-0' : 'w-full'
          } ${showMaterials ? '' : 'hidden'}`}
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
