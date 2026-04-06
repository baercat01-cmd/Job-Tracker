import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { BuildingPlanModel, PlanEntityId, PlanOverheadStyle, PlanRoomLevel } from '@/lib/buildingPlanModel';
import { DEFAULT_OVERHEAD_STYLE, getRoomFloorElevation, normalizeRoomLevel } from '@/lib/buildingPlanModel';
import { applyOp, type PlanOp } from '@/lib/planOps';
import type { OpeningPlacementDimKind } from '@/lib/openingPlacementAlongWall';
import {
  offsetFromPlacementDimensionFt,
  readPlacementDimensionFt,
  wallLengthFt,
} from '@/lib/openingPlacementAlongWall';
import {
  Plan2DEditor,
  type DoorPlacementOptions,
  type PlanActiveRoomFloor,
  type PlanFocusedSpace,
  type PlanRoomPlacementSpec,
} from '@/components/plans/Plan2DEditor';
import { PlanElevationPage } from '@/components/plans/PlanElevationPage';
import { PlanElevationPreview } from '@/components/plans/PlanElevationPreview';
import { PlanSectionSheet } from '@/components/plans/PlanSectionSheet';
import { PlanFieldBlueprint } from '@/components/plans/PlanFieldBlueprint';
import { PlanPostLayoutPrint } from '@/components/plans/PlanPostLayoutPrint';
import { Button } from '@/components/ui/button';
import {
  PlanWorkspaceToolSidebar,
  type SidebarSection,
  type ToolMode,
} from './PlanWorkspaceToolSidebar';

type ViewMode =
  | 'floor'
  | 'blueprint'
  | 'post_layout'
  | 'cross_section'
  | 'Front'
  | 'Back'
  | 'Left'
  | 'Right';

const PLACEMENT_FINISH_TOOLS: ToolMode[] = [
  'door',
  'window',
  'overhead',
  'room',
  'loft',
  'stair',
  'loft_stair_hole',
  'outlet',
  'drain',
];

export function PlanLocalWorkspace(props: {
  plan: BuildingPlanModel;
  /** Supports functional updates so rapid plan ops (e.g. doors) do not drop edits. */
  onChange: Dispatch<SetStateAction<BuildingPlanModel>>;
  /** Optional persist (e.g. job drawing RPC). Used by “Save & stop placing”. */
  onPersistDrawing?: () => void | Promise<void>;
  persistDrawingDisabled?: boolean;
  persistDrawingPending?: boolean;
}) {
  const { plan, onChange, onPersistDrawing, persistDrawingDisabled, persistDrawingPending } = props;
  const [tool, setTool] = useState<ToolMode>('select');
  const [sidebarSection, setSidebarSection] = useState<SidebarSection>('select');
  const [viewMode, setViewMode] = useState<ViewMode>('floor');
  const [selectedId, setSelectedId] = useState<PlanEntityId | null>(null);
  const [activeRoomFloorKey, setActiveRoomFloorKey] = useState<string>('main');
  const [roomSpec, setRoomSpec] = useState<PlanRoomPlacementSpec>({
    name: 'Room',
    width: 12,
    depth: 12,
    wallThickness: 0.5 / 12,
    loftUpperFloorOffsetFt: 4,
    wallTopMode: 'to_ceiling',
    customWallHeightFt: 8,
  });
  const selectedRoom = selectedId ? plan.rooms.find((r) => r.id === selectedId) : null;
  const selectedOpening = useMemo(
    () => (selectedId ? plan.openings.find((o) => o.id === selectedId) ?? null : null),
    [plan.openings, selectedId]
  );
  const openingWall = useMemo(
    () => (selectedOpening ? plan.walls.find((w) => w.id === selectedOpening.wallId) ?? null : null),
    [plan.walls, selectedOpening]
  );
  const [openingPlacementKind, setOpeningPlacementKind] = useState<OpeningPlacementDimKind>('door_start_to_wall_start');
  const [openingPlacementDraft, setOpeningPlacementDraft] = useState('0');
  const [windowSpec, setWindowSpec] = useState<{ label: string; width: number; height: number; sill: number }>({
    label: '4x3',
    width: 4,
    height: 3,
    sill: 3,
  });
  const [doorSpec, setDoorSpec] = useState<{ label: string; width: number; height: number; sill: number }>({
    label: '3×7',
    width: 3,
    height: 7,
    sill: 0,
  });
  const [doorPlacement, setDoorPlacement] = useState<DoorPlacementOptions>({
    mode: 'free',
    anchor: 'from_start',
    insetFromCornerFt: 1,
    count: 1,
    gapBetweenFt: 0,
  });
  const [overheadPlaceSpec, setOverheadPlaceSpec] = useState<{
    width: number;
    height: number;
    sill: number;
    style: PlanOverheadStyle;
  }>({
    width: 16,
    height: 14,
    sill: 0,
    style: { ...DEFAULT_OVERHEAD_STYLE },
  });
  const [overheadWindowIdxText, setOverheadWindowIdxText] = useState('');
  const [loftSpec, setLoftSpec] = useState<{
    name: string;
    width: number;
    depth: number;
    elevation: number;
    clearHeight: number;
  }>({ name: 'Loft', width: 12, depth: 10, elevation: 8, clearHeight: 8 });
  const [stairSpec, setStairSpec] = useState<{ width: number; rise: number; loftId: string | null }>({
    width: 3,
    rise: 8,
    loftId: null,
  });
  /** Double-click / drill-in: zoom to one room or loft and sync floor for doors & windows. */
  const [focusedSpace, setFocusedSpace] = useState<PlanFocusedSpace | null>(null);
  /** Loft being edited in the dialog (stable if selection changes while open). */
  const [editLoftTargetId, setEditLoftTargetId] = useState<PlanEntityId | null>(null);
  const [editLoftDraft, setEditLoftDraft] = useState<{
    name: string;
    width: number;
    depth: number;
    elevation: number;
    clearHeight: number;
    holeEnabled: boolean;
    holeX: number;
    holeY: number;
    holeW: number;
    holeD: number;
  } | null>(null);

  const selectedLoft = selectedId ? plan.lofts.find((l) => l.id === selectedId) ?? null : null;
  const loftBeingEdited = editLoftTargetId ? plan.lofts.find((l) => l.id === editLoftTargetId) ?? null : null;

  const focusedRoom =
    focusedSpace?.kind === 'room' ? plan.rooms.find((r) => r.id === focusedSpace.id) ?? null : null;
  const focusedLoftEntity =
    focusedSpace?.kind === 'loft' ? plan.lofts.find((l) => l.id === focusedSpace.id) ?? null : null;

  useEffect(() => {
    if (!focusedSpace) return;
    if (focusedSpace.kind === 'room' && !plan.rooms.some((r) => r.id === focusedSpace.id)) {
      setFocusedSpace(null);
    }
    if (focusedSpace.kind === 'loft' && !plan.lofts.some((l) => l.id === focusedSpace.id)) {
      setFocusedSpace(null);
    }
  }, [focusedSpace, plan.rooms, plan.lofts]);

  useEffect(() => {
    if (!focusedSpace) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      setFocusedSpace(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [focusedSpace]);

  useEffect(() => {
    if (sidebarSection === 'edit_loft') return;
    setEditLoftTargetId(null);
    setEditLoftDraft(null);
  }, [sidebarSection]);

  const canDelete = !!selectedId;
  const deleteSelected = () => {
    const id = selectedId;
    if (!id) return;
    onChange((prev) => {
      let op: PlanOp | null = null;
      if (prev.walls.some((w) => w.id === id)) op = { type: 'delete_wall', wallId: id };
      else if (prev.openings.some((o) => o.id === id)) op = { type: 'delete_opening', openingId: id };
      else if (prev.rooms.some((r) => r.id === id)) op = { type: 'delete_room', roomId: id };
      else if (prev.lofts.some((l) => l.id === id)) op = { type: 'delete_loft', loftId: id };
      else if ((prev.stairs ?? []).some((s) => s.id === id)) op = { type: 'delete_stair', stairId: id };
      else if (prev.fixtures.some((f) => f.id === id)) op = { type: 'delete_fixture', fixtureId: id };
      if (!op) return prev;
      return applyOp(prev, op);
    });
    setSelectedId(null);
  };

  const onOp = useCallback(
    (op: PlanOp) => {
      onChange((prev) => applyOp(prev, op));
    },
    [onChange]
  );

  const showPlacementDone = PLACEMENT_FINISH_TOOLS.includes(tool);

  const requestOpeningPlacementEdit = useCallback((openingId: PlanEntityId) => {
    setSelectedId(openingId);
    setTool('select');
    setSidebarSection('edit_opening');
  }, []);

  const applyOpeningPlacement = useCallback(() => {
    const o = plan.openings.find((x) => x.id === selectedId);
    const wall = o ? plan.walls.find((w) => w.id === o.wallId) : null;
    if (!o || !wall) return;
    const L = wallLengthFt(wall);
    const val = parseFloat(openingPlacementDraft.replace(/,/g, ''));
    if (!Number.isFinite(val) || val < 0) return;
    const nextOff = offsetFromPlacementDimensionFt(o, L, openingPlacementKind, val, plan.openings);
    onChange((prev) => {
      const cur = prev.openings.find((x) => x.id === o.id);
      if (!cur) return prev;
      return applyOp(prev, { type: 'upsert_opening', opening: { ...cur, offset: nextOff } });
    });
  }, [plan.openings, plan.walls, selectedId, openingPlacementDraft, openingPlacementKind, onChange]);

  const finishPlacing = useCallback(async () => {
    setTool('select');
    setSidebarSection('select');
    if (onPersistDrawing && !persistDrawingDisabled) {
      await onPersistDrawing();
    }
  }, [onPersistDrawing, persistDrawingDisabled]);

  const previews = useMemo(() => ['Front', 'Back', 'Left', 'Right'] as const, []);

  const activeRoomFloor = useMemo((): PlanActiveRoomFloor => {
    if (activeRoomFloorKey === 'main') return { kind: 'main' };
    const [k, id] = activeRoomFloorKey.split(':');
    if (k === 'deck' && id) return { kind: 'loft_deck', loftId: id };
    if (k === 'upper' && id) return { kind: 'loft_upper', loftId: id };
    return { kind: 'main' };
  }, [activeRoomFloorKey]);

  function floorKeyToRoomFields(key: string): { level: PlanRoomLevel; loftId: string | null } {
    if (key === 'main') return { level: 'main', loftId: null };
    const [a, id] = key.split(':');
    if (a === 'deck' && id) return { level: 'loft_deck', loftId: id };
    if (a === 'upper' && id) return { level: 'loft_upper', loftId: id };
    return { level: 'main', loftId: null };
  }

  function applyFloorForFocusedSpace(focus: PlanFocusedSpace) {
    if (focus.kind === 'loft') {
      setActiveRoomFloorKey(`deck:${focus.id}`);
      return;
    }
    const room = plan.rooms.find((r) => r.id === focus.id);
    if (!room) return;
    const lvl = normalizeRoomLevel(room);
    if (lvl === 'main') setActiveRoomFloorKey('main');
    else if (lvl === 'loft_deck' && room.loftId) setActiveRoomFloorKey(`deck:${room.loftId}`);
    else if (lvl === 'loft_upper' && room.loftId) setActiveRoomFloorKey(`upper:${room.loftId}`);
    else setActiveRoomFloorKey('main');
  }

  const isElevationSideView =
    viewMode === 'Front' || viewMode === 'Back' || viewMode === 'Left' || viewMode === 'Right';

  return (
    <div className="absolute inset-0 w-full h-full flex flex-col bg-white">
      {focusedSpace && (focusedRoom || focusedLoftEntity) ? (
        <div className="shrink-0 border-b border-emerald-200 bg-emerald-50/95 px-3 py-2 flex flex-wrap items-center gap-3 text-sm">
          <div className="font-semibold text-emerald-950 shrink-0">Space view</div>
          <div className="text-emerald-900 flex flex-wrap gap-x-4 gap-y-1 min-w-0">
            {focusedRoom ? (
              <>
                <span className="font-medium truncate">{focusedRoom.name || 'Room'}</span>
                <span>
                  {focusedRoom.width.toFixed(1)}′ × {focusedRoom.depth.toFixed(1)}′
                </span>
                <span className="text-emerald-800">
                  {normalizeRoomLevel(focusedRoom) === 'main'
                    ? 'Main floor'
                    : normalizeRoomLevel(focusedRoom) === 'loft_deck'
                      ? `On loft (${plan.lofts.find((l) => l.id === focusedRoom.loftId)?.name ?? 'loft'})`
                      : `Above loft +${(focusedRoom.loftUpperFloorOffsetFt ?? 0).toFixed(1)}′`}
                </span>
                <span>
                  Floor elev. {getRoomFloorElevation(plan, focusedRoom).toFixed(2)}′ ·{' '}
                  {(focusedRoom.wallTopMode ?? 'to_ceiling') === 'custom'
                    ? `walls ${(focusedRoom.customWallHeightFt ?? 0).toFixed(1)}′`
                    : 'walls to ceiling'}
                </span>
              </>
            ) : focusedLoftEntity ? (
              <>
                <span className="font-medium truncate">{focusedLoftEntity.name ?? 'Loft'}</span>
                <span>
                  {focusedLoftEntity.width.toFixed(1)}′ × {focusedLoftEntity.depth.toFixed(1)}′ deck
                </span>
                <span>
                  Deck {focusedLoftEntity.elevation.toFixed(1)}′ · clear {(focusedLoftEntity.clearHeight ?? 8).toFixed(1)}′
                </span>
                {focusedLoftEntity.stairOpening ? (
                  <span className="text-emerald-800">
                    Stair opening {focusedLoftEntity.stairOpening.width.toFixed(1)}′ ×{' '}
                    {focusedLoftEntity.stairOpening.depth.toFixed(1)}′
                  </span>
                ) : (
                  <span className="text-emerald-800">No stair opening yet</span>
                )}
              </>
            ) : null}
          </div>
          <Button
            size="sm"
            variant="outline"
            className="ml-auto border-emerald-600 text-emerald-900 hover:bg-emerald-100"
            onClick={() => setFocusedSpace(null)}
          >
            Back to full plan
          </Button>
        </div>
      ) : null}

      <div className="flex min-h-0 min-w-0 flex-1 flex-row">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {viewMode === 'blueprint' ? (
          <div className="h-full min-h-0 p-3 flex flex-col">
            <PlanFieldBlueprint plan={plan} className="flex-1 min-h-0" />
          </div>
        ) : viewMode === 'post_layout' ? (
          <div className="h-full min-h-0 p-3 flex flex-col">
            <PlanPostLayoutPrint
              plan={plan}
              className="flex-1 min-h-0"
              onOp={onOp}
              onEditOpeningsOnFloor={(tool) => {
                setViewMode('floor');
                setTool(tool);
                if (tool === 'door') setSidebarSection('door');
                else if (tool === 'window') setSidebarSection('window');
                else setSidebarSection('overhead');
              }}
            />
          </div>
        ) : viewMode === 'cross_section' ? (
          <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-3">
            <PlanSectionSheet plan={plan} className="min-h-0 min-w-0 flex-1 overflow-hidden" />
          </div>
        ) : viewMode === 'floor' ? (
          <Plan2DEditor
            plan={plan}
            canEdit={true}
            mode={tool}
            roomSpec={tool === 'room' ? roomSpec : null}
            activeRoomFloor={activeRoomFloor}
            loftSpec={tool === 'loft' ? loftSpec : null}
            stairSpec={
              tool === 'stair'
                ? { width: stairSpec.width, rise: stairSpec.rise, loftId: stairSpec.loftId }
                : null
            }
            loftStairHoleTargetId={tool === 'loft_stair_hole' && selectedLoft ? selectedLoft.id : null}
            openingSpec={tool === 'window' ? { width: windowSpec.width, height: windowSpec.height, sill: windowSpec.sill } : null}
            doorOpeningSpec={
              tool === 'door' ? { width: doorSpec.width, height: doorSpec.height, sill: doorSpec.sill } : null
            }
            overheadSpec={
              tool === 'overhead'
                ? {
                    width: overheadPlaceSpec.width,
                    height: overheadPlaceSpec.height,
                    sill: overheadPlaceSpec.sill,
                    style: overheadPlaceSpec.style,
                  }
                : null
            }
            doorPlacementOptions={tool === 'door' ? doorPlacement : null}
            orientation="lengthX"
            onCancelPlacement={() => {
              setTool('select');
              setSidebarSection('select');
            }}
            onOp={onOp}
            selectedId={selectedId}
            onSelect={setSelectedId}
            focusedSpace={focusedSpace}
            onRequestFocusSpace={(f) => {
              setFocusedSpace(f);
              setSelectedId(f.id);
              applyFloorForFocusedSpace(f);
            }}
            onRequestOpeningPlacementEdit={requestOpeningPlacementEdit}
          />
        ) : viewMode === 'Front' || viewMode === 'Back' || viewMode === 'Left' || viewMode === 'Right' ? (
          <div className="flex h-full min-h-0 flex-col p-3">
            <PlanElevationPage
              plan={plan}
              side={viewMode}
              className="min-h-0 flex-1"
              onEditOnFloor={() => {
                setViewMode('floor');
                setTool('select');
                setSidebarSection('select');
              }}
              onEditDoors={() => {
                setViewMode('floor');
                setTool('door');
                setSidebarSection('door');
              }}
              onEditWindows={() => {
                setViewMode('floor');
                setTool('window');
                setSidebarSection('window');
              }}
              onEditOverhead={() => {
                setViewMode('floor');
                setTool('overhead');
                setSidebarSection('overhead');
              }}
            />
          </div>
        ) : null}
          </div>
        </div>
        <PlanWorkspaceToolSidebar
          plan={plan}
          onChange={onChange}
          showPlacementDone={showPlacementDone}
          onFinishPlacing={finishPlacing}
          finishPlacingPending={!!persistDrawingPending}
          finishPlacingSaveOffered={!!onPersistDrawing}
          finishPlacingSaveDisabled={!!persistDrawingDisabled}
          sidebarSection={sidebarSection}
          setSidebarSection={setSidebarSection}
          tool={tool}
          setTool={setTool}
          selectedId={selectedId}
          setSelectedId={setSelectedId}
          activeRoomFloorKey={activeRoomFloorKey}
          setActiveRoomFloorKey={setActiveRoomFloorKey}
          activeRoomFloor={activeRoomFloor}
          roomSpec={roomSpec}
          setRoomSpec={setRoomSpec}
          selectedRoom={selectedRoom}
          windowSpec={windowSpec}
          setWindowSpec={setWindowSpec}
          doorSpec={doorSpec}
          setDoorSpec={setDoorSpec}
          doorPlacement={doorPlacement}
          setDoorPlacement={setDoorPlacement}
          overheadPlaceSpec={overheadPlaceSpec}
          setOverheadPlaceSpec={setOverheadPlaceSpec}
          overheadWindowIdxText={overheadWindowIdxText}
          setOverheadWindowIdxText={setOverheadWindowIdxText}
          loftSpec={loftSpec}
          setLoftSpec={setLoftSpec}
          stairSpec={stairSpec}
          setStairSpec={setStairSpec}
          selectedLoft={selectedLoft}
          editLoftTargetId={editLoftTargetId}
          setEditLoftTargetId={setEditLoftTargetId}
          editLoftDraft={editLoftDraft}
          setEditLoftDraft={setEditLoftDraft}
          loftBeingEdited={loftBeingEdited}
          canDelete={canDelete}
          deleteSelected={deleteSelected}
          floorKeyToRoomFields={floorKeyToRoomFields}
          selectedOpening={selectedOpening}
          openingWall={openingWall}
          openingPlacementKind={openingPlacementKind}
          setOpeningPlacementKind={setOpeningPlacementKind}
          openingPlacementDraft={openingPlacementDraft}
          setOpeningPlacementDraft={setOpeningPlacementDraft}
          onApplyOpeningPlacement={applyOpeningPlacement}
        />
      </div>

      <div
        className={`shrink-0 bg-white border-t px-2 flex items-center gap-2 overflow-x-auto ${
          isElevationSideView ? 'h-16 py-1' : 'h-28 py-2 px-3'
        }`}
      >
        <PreviewButton
          compact={isElevationSideView}
          active={viewMode === 'floor'}
          label="Floor"
          onClick={() => setViewMode('floor')}
        >
          <MiniFloor plan={plan} />
        </PreviewButton>
        <PreviewButton
          compact={isElevationSideView}
          active={viewMode === 'blueprint'}
          label="Blueprint"
          onClick={() => setViewMode('blueprint')}
        >
          <MiniBlueprint />
        </PreviewButton>
        <PreviewButton
          compact={isElevationSideView}
          active={viewMode === 'post_layout'}
          label="Posts"
          onClick={() => setViewMode('post_layout')}
        >
          <MiniPostLayout />
        </PreviewButton>
        <PreviewButton
          compact={isElevationSideView}
          active={viewMode === 'cross_section'}
          label="Section"
          onClick={() => setViewMode('cross_section')}
        >
          <MiniCrossSection />
        </PreviewButton>
        {previews.map((side) => (
          <PreviewButton
            key={side}
            compact={isElevationSideView}
            active={viewMode === side}
            label={side}
            onClick={() => setViewMode(side)}
          >
            <PlanElevationPreview plan={plan} side={side} className="w-full h-full" />
          </PreviewButton>
        ))}
      </div>

    </div>
  );
}

function PreviewButton(props: {
  active: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  /** Tighter strip when elevation / sheet views need maximum canvas height */
  compact?: boolean;
}) {
  const { active, label, onClick, children, compact } = props;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded border flex flex-col gap-0.5 shrink-0 ${
        compact ? 'w-[4.5rem] h-[3.25rem] p-0.5' : 'w-28 h-24 p-1 gap-1'
      } ${active ? 'border-green-600 ring-2 ring-green-200' : 'border-slate-200 hover:border-slate-300'}`}
    >
      <div className="flex-1 min-h-0 rounded bg-white overflow-hidden">{children}</div>
      <div
        className={`font-semibold text-slate-700 text-center leading-none ${
          compact ? 'text-[8px]' : 'text-[10px]'
        }`}
      >
        {label}
      </div>
    </button>
  );
}

function MiniBlueprint() {
  return (
    <svg viewBox="0 0 100 70" className="w-full h-full">
      <rect x={2} y={2} width={96} height={20} fill="#f1f5f9" stroke="#64748b" strokeWidth={1} />
      <rect x={8} y={30} width={84} height={36} fill="#f8fafc" stroke="#0f172a" strokeWidth={1.5} />
      <line x1={8} y1={66} x2={92} y2={66} stroke="#0f172a" strokeWidth={0.8} />
      <line x1={4} y1={30} x2={4} y2={66} stroke="#0f172a" strokeWidth={0.8} />
      <text x={50} y={14} textAnchor="middle" fontSize={8} fill="#334155" fontWeight={600}>
        SVG
      </text>
    </svg>
  );
}

function MiniPostLayout() {
  return (
    <svg viewBox="0 0 100 70" className="w-full h-full">
      <rect x={10} y={12} width={80} height={48} fill="#f8fafc" stroke="#0f172a" strokeWidth={1.2} strokeDasharray="4 3" />
      {[18, 38, 58, 78].flatMap((cx) =>
        [22, 50].map((cy) => <rect key={`${cx}-${cy}`} x={cx - 2} y={cy - 2} width={4} height={4} fill="#1e293b" />)
      )}
    </svg>
  );
}

function MiniCrossSection() {
  return (
    <svg viewBox="0 0 100 70" className="w-full h-full">
      <line x1={10} y1={58} x2={90} y2={58} stroke="#64748b" strokeWidth={1} strokeDasharray="3 2" />
      <rect x={18} y={28} width={64} height={30} fill="#e2e8f0" stroke="#0f172a" strokeWidth={1.2} />
      <line x1={18} y1={28} x2={50} y2={10} stroke="#0f172a" strokeWidth={1.5} />
      <line x1={82} y1={28} x2={50} y2={10} stroke="#0f172a" strokeWidth={1.5} />
    </svg>
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
        const isHorizontal = wall.label === 'Front' || wall.label === 'Back';
        const along = wall.label === 'Front' || wall.label === 'Back' ? w : l;
        const t = along > 0 ? o.offset / along : 0;
        const x = isHorizontal ? 5 + t * 90 : wall.label === 'Left' ? 5 : 95;
        const y = isHorizontal ? (wall.label === 'Front' ? 5 : 65) : 5 + t * 60;
        const fill =
          o.type === 'overhead_door' ? '#f59e0b' : o.type === 'door' ? '#0284c7' : '#a16207';
        return <circle key={o.id} cx={x} cy={y} r={3} fill={fill} opacity={0.8} />;
      })}
    </svg>
  );
}

