import { useEffect, useMemo, useState } from 'react';
import type { BuildingPlanModel, PlanEntityId } from '@/lib/buildingPlanModel';
import { createDefaultRectPlan } from '@/lib/buildingPlanModel';
import { usePlanRealtime } from '@/lib/usePlanRealtime';
import { Plan2DEditor } from '@/components/plans/Plan2DEditor';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PlanElevationPreview } from '@/components/plans/PlanElevationPreview';
import { supabase } from '@/lib/supabase';

type ToolMode = 'select' | 'wall' | 'window' | 'door' | 'outlet' | 'drain';
type ViewMode = 'floor' | 'Front' | 'Back' | 'Left' | 'Right' | '3d';

export function PlanShareWorkspace(props: {
  planId: string;
  initialPlanJson: unknown;
  token?: string;
  canEdit: boolean;
}) {
  const { planId, initialPlanJson, token, canEdit } = props;

  const initialPlan = useMemo((): BuildingPlanModel => {
    if (initialPlanJson && typeof initialPlanJson === 'object') {
      return initialPlanJson as BuildingPlanModel;
    }
    return createDefaultRectPlan({ width: 30, length: 40, height: 12, pitch: 4 });
  }, [initialPlanJson]);

  const { plan, sendOp, connected, presence, saving, lastSavedAt, lastSaveError } = usePlanRealtime({
    planId,
    initialPlan,
    share: { token, canEdit },
  });

  const [mode, setMode] = useState<ToolMode>('select');
  const [selectedId, setSelectedId] = useState<PlanEntityId | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('floor');
  const [versionCount, setVersionCount] = useState<number | null>(null);

  const canDelete = canEdit && !!selectedId;
  const deleteSelected = () => {
    if (!canDelete || !selectedId) return;
    const id = selectedId;
    if (plan.walls.some((w) => w.id === id)) sendOp({ type: 'delete_wall', wallId: id });
    else if (plan.openings.some((o) => o.id === id)) sendOp({ type: 'delete_opening', openingId: id });
    else if (plan.lofts.some((l) => l.id === id)) sendOp({ type: 'delete_loft', loftId: id });
    else if (plan.fixtures.some((f) => f.id === id)) sendOp({ type: 'delete_fixture', fixtureId: id });
    setSelectedId(null);
  };

  useEffect(() => {
    let cancelled = false;
    async function loadVersions() {
      if (!token) return;
      const { data, error } = await supabase.rpc('get_building_plan_versions_by_token', { p_token: token });
      if (cancelled) return;
      if (error) {
        setVersionCount(null);
        return;
      }
      if (Array.isArray(data)) setVersionCount(data.length);
      else if (typeof data === 'string') {
        try {
          const parsed = JSON.parse(data);
          setVersionCount(Array.isArray(parsed) ? parsed.length : null);
        } catch {
          setVersionCount(null);
        }
      } else {
        setVersionCount(null);
      }
    }
    void loadVersions();
    return () => {
      cancelled = true;
    };
  }, [token, lastSavedAt]);

  return (
    <div className="w-full h-[calc(100dvh-64px)] flex flex-col">
      <div className="h-12 bg-white border-b flex items-center justify-between px-3 gap-2">
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant={mode === 'select' ? 'default' : 'outline'} onClick={() => setMode('select')}>
            Select
          </Button>
          <Button
            size="sm"
            variant={mode === 'wall' ? 'default' : 'outline'}
            onClick={() => setMode('wall')}
            disabled={!canEdit}
          >
            Wall
          </Button>
          <Button
            size="sm"
            variant={mode === 'door' ? 'default' : 'outline'}
            onClick={() => setMode('door')}
            disabled={!canEdit}
          >
            Door
          </Button>
          <Button
            size="sm"
            variant={mode === 'window' ? 'default' : 'outline'}
            onClick={() => setMode('window')}
            disabled={!canEdit}
          >
            Window
          </Button>
          <Button
            size="sm"
            variant={mode === 'outlet' ? 'default' : 'outline'}
            onClick={() => setMode('outlet')}
            disabled={!canEdit}
          >
            Outlet
          </Button>
          <Button
            size="sm"
            variant={mode === 'drain' ? 'default' : 'outline'}
            onClick={() => setMode('drain')}
            disabled={!canEdit}
          >
            Drain
          </Button>
          <Button size="sm" variant="destructive" disabled={!canDelete} onClick={deleteSelected}>
            Delete
          </Button>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <Badge variant={connected ? 'default' : 'outline'}>{connected ? 'Live' : 'Offline'}</Badge>
          <Badge variant="outline">{presence.length} online</Badge>
          <Badge variant={canEdit ? 'default' : 'outline'}>{canEdit ? 'Editing enabled' : 'View only'}</Badge>
          {canEdit ? <Badge variant="outline">{saving ? 'Saving…' : lastSavedAt ? 'Saved' : 'Not saved yet'}</Badge> : null}
          {typeof versionCount === 'number' ? <Badge variant="outline">{versionCount} versions</Badge> : null}
        </div>
      </div>

      {!canEdit ? (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 text-xs px-3 py-2">
          View-only link. Ask your office team for an edit link if you need to make changes.
        </div>
      ) : lastSaveError ? (
        <div className="bg-rose-50 border-b border-rose-200 text-rose-900 text-xs px-3 py-2">{lastSaveError}</div>
      ) : null}

      <div className="flex-1 min-h-0">
        {viewMode === 'floor' ? (
          <Plan2DEditor
            plan={plan}
            canEdit={canEdit}
            mode={mode}
            onOp={sendOp}
            selectedId={selectedId}
            onSelect={setSelectedId}
            orientation="lengthX"
            onCancelPlacement={() => setMode('select')}
          />
        ) : viewMode === '3d' ? (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground bg-white">
            3D view wiring comes next.
          </div>
        ) : (
          <div className="w-full h-full bg-white p-6">
            <div className="max-w-3xl mx-auto">
              <div className="text-sm font-bold mb-3">{viewMode} elevation</div>
              <div className="aspect-[10/7] border rounded bg-slate-50">
                <PlanElevationPreview plan={plan} side={viewMode} className="w-full h-full" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom preview strip */}
      <div className="h-28 bg-white border-t px-3 py-2 flex items-center gap-2 overflow-x-auto">
        <PreviewButton active={viewMode === 'floor'} label="Floor" onClick={() => setViewMode('floor')}>
          <MiniFloor plan={plan} />
        </PreviewButton>
        {(['Front', 'Back', 'Left', 'Right'] as const).map((side) => (
          <PreviewButton key={side} active={viewMode === side} label={side} onClick={() => setViewMode(side)}>
            <PlanElevationPreview plan={plan} side={side} className="w-full h-full" />
          </PreviewButton>
        ))}
        <PreviewButton active={viewMode === '3d'} label="3D" onClick={() => setViewMode('3d')}>
          <Mini3D />
        </PreviewButton>
      </div>
    </div>
  );
}

function PreviewButton(props: {
  active: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const { active, label, onClick, children } = props;
  return (
    <button
      onClick={onClick}
      className={`w-28 h-24 rounded border p-1 flex flex-col gap-1 shrink-0 ${
        active ? 'border-green-600 ring-2 ring-green-200' : 'border-slate-200 hover:border-slate-300'
      }`}
    >
      <div className="flex-1 rounded bg-white overflow-hidden">{children}</div>
      <div className="text-[10px] font-semibold text-slate-700 text-center">{label}</div>
    </button>
  );
}

function MiniFloor({ plan }: { plan: BuildingPlanModel }) {
  const w = Math.max(1, plan.dims.width);
  const l = Math.max(1, plan.dims.length);
  return (
    <svg viewBox="0 0 100 70" className="w-full h-full">
      <rect x={5} y={5} width={90} height={60} fill="#f8fafc" stroke="#0f172a" strokeWidth={2} />
      {plan.openings.slice(0, 12).map((o) => {
        const wall = plan.walls.find((ww) => ww.id === o.wallId);
        if (!wall) return null;
        // crude placement based on wall label and offset
        const isHorizontal = wall.label === 'Front' || wall.label === 'Back';
        const along = wall.label === 'Front' || wall.label === 'Back' ? w : l;
        const t = along > 0 ? o.offset / along : 0;
        const ww = along > 0 ? (o.width / along) * 90 : 4;
        const x = isHorizontal ? 5 + t * 90 : wall.label === 'Left' ? 5 : 95;
        const y = isHorizontal ? (wall.label === 'Front' ? 5 : 65) : 5 + t * 60;
        return (
          <circle key={o.id} cx={x} cy={y} r={3} fill={o.type === 'door' ? '#0284c7' : '#a16207'} opacity={0.8} />
        );
      })}
    </svg>
  );
}

function Mini3D() {
  return (
    <svg viewBox="0 0 100 70" className="w-full h-full">
      <rect x={5} y={5} width={90} height={60} fill="#0f172a" />
      <path d="M20 50 L50 25 L80 50 Z" fill="#334155" stroke="#94a3b8" strokeWidth={2} />
      <rect x={25} y={35} width={50} height={20} fill="#1f2937" stroke="#94a3b8" strokeWidth={2} />
    </svg>
  );
}

