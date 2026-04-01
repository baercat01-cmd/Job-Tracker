import { useEffect, useMemo, useState } from 'react';
import type {
  BuildingPlanModel,
  PlanEntityId,
  PlanLoftStairOpening,
  PlanOverheadStyle,
  PlanRoomLevel,
} from '@/lib/buildingPlanModel';
import {
  clamp,
  DEFAULT_OVERHEAD_STYLE,
  getRoomFloorElevation,
  normalizeRoomLevel,
} from '@/lib/buildingPlanModel';
import { applyOp, type PlanOp } from '@/lib/planOps';
import {
  Plan2DEditor,
  type DoorPlacementOptions,
  type PlanActiveRoomFloor,
  type PlanFocusedSpace,
  type PlanRoomPlacementSpec,
} from '@/components/plans/Plan2DEditor';
import { PlanElevationPreview } from '@/components/plans/PlanElevationPreview';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type ToolMode =
  | 'select'
  | 'wall'
  | 'window'
  | 'door'
  | 'overhead'
  | 'outlet'
  | 'drain'
  | 'room'
  | 'loft'
  | 'stair'
  | 'loft_stair_hole';
type ViewMode = 'floor' | 'Front' | 'Back' | 'Left' | 'Right';

export function PlanLocalWorkspace(props: {
  plan: BuildingPlanModel;
  onChange: (next: BuildingPlanModel) => void;
}) {
  const { plan, onChange } = props;
  const [tool, setTool] = useState<ToolMode>('select');
  const [viewMode, setViewMode] = useState<ViewMode>('floor');
  const [selectedId, setSelectedId] = useState<PlanEntityId | null>(null);
  const [showRoomDialog, setShowRoomDialog] = useState(false);
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
  const [showEditRoom, setShowEditRoom] = useState(false);
  const selectedRoom = selectedId ? plan.rooms.find((r) => r.id === selectedId) : null;
  const [showWindowDialog, setShowWindowDialog] = useState(false);
  const [windowSpec, setWindowSpec] = useState<{ label: string; width: number; height: number; sill: number }>({
    label: '4x3',
    width: 4,
    height: 3,
    sill: 3,
  });
  const [showDoorDialog, setShowDoorDialog] = useState(false);
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
  const [showOverheadDialog, setShowOverheadDialog] = useState(false);
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
  const [showLoftDialog, setShowLoftDialog] = useState(false);
  const [loftSpec, setLoftSpec] = useState<{
    name: string;
    width: number;
    depth: number;
    elevation: number;
    clearHeight: number;
  }>({ name: 'Loft', width: 12, depth: 10, elevation: 8, clearHeight: 8 });
  const [showStairDialog, setShowStairDialog] = useState(false);
  const [stairSpec, setStairSpec] = useState<{ width: number; rise: number; loftId: string | null }>({
    width: 3,
    rise: 8,
    loftId: null,
  });
  const [showEditLoft, setShowEditLoft] = useState(false);
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

  const canDelete = !!selectedId;
  const deleteSelected = () => {
    if (!selectedId) return;
    const id = selectedId;
    let op: PlanOp | null = null;
    if (plan.walls.some((w) => w.id === id)) op = { type: 'delete_wall', wallId: id };
    else if (plan.openings.some((o) => o.id === id)) op = { type: 'delete_opening', openingId: id };
    else if (plan.rooms.some((r) => r.id === id)) op = { type: 'delete_room', roomId: id };
    else if (plan.lofts.some((l) => l.id === id)) op = { type: 'delete_loft', loftId: id };
    else if ((plan.stairs ?? []).some((s) => s.id === id)) op = { type: 'delete_stair', stairId: id };
    else if (plan.fixtures.some((f) => f.id === id)) op = { type: 'delete_fixture', fixtureId: id };
    if (!op) return;
    onChange(applyOp(plan, op));
    setSelectedId(null);
  };

  const onOp = (op: PlanOp) => {
    onChange(applyOp(plan, op));
  };

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

  return (
    <div className="absolute inset-0 w-full h-full flex flex-col bg-white">
      <div className="h-12 bg-white border-b flex items-center justify-between px-3 gap-2">
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant={tool === 'select' ? 'default' : 'outline'} onClick={() => setTool('select')}>
            Select
          </Button>
          <Button size="sm" variant={tool === 'wall' ? 'default' : 'outline'} onClick={() => setTool('wall')}>
            Wall
          </Button>
          <Button
            size="sm"
            variant={tool === 'door' ? 'default' : 'outline'}
            onClick={() => setShowDoorDialog(true)}
          >
            Door
          </Button>
          {tool === 'door' ? (
            <Button size="sm" variant="outline" onClick={() => setTool('select')}>
              Cancel
            </Button>
          ) : null}
          <Button
            size="sm"
            variant={tool === 'window' ? 'default' : 'outline'}
            onClick={() => setShowWindowDialog(true)}
          >
            Window
          </Button>
          <Button
            size="sm"
            variant={tool === 'overhead' ? 'default' : 'outline'}
            onClick={() => {
              setOverheadWindowIdxText(overheadPlaceSpec.style.windowPanelIndices.join(', '));
              setShowOverheadDialog(true);
            }}
          >
            Overhead
          </Button>
          {tool === 'overhead' ? (
            <Button size="sm" variant="outline" onClick={() => setTool('select')}>
              Cancel
            </Button>
          ) : null}
          <div className="flex flex-wrap items-center gap-1 ml-1 pl-2 border-l border-slate-200 text-[11px] text-slate-600">
            <span className="shrink-0 whitespace-nowrap">Drag:</span>
            <span
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('application/x-plan-item', 'door');
                e.dataTransfer.effectAllowed = 'copy';
              }}
              className="cursor-grab select-none px-2 py-0.5 rounded border border-sky-200 bg-sky-50 text-sky-900 whitespace-nowrap"
            >
              Door
            </span>
            <span
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('application/x-plan-item', 'window');
                e.dataTransfer.effectAllowed = 'copy';
              }}
              className="cursor-grab select-none px-2 py-0.5 rounded border border-amber-200 bg-amber-50 text-amber-950 whitespace-nowrap"
            >
              Window
            </span>
            <span
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('application/x-plan-item', 'overhead');
                e.dataTransfer.effectAllowed = 'copy';
              }}
              className="cursor-grab select-none px-2 py-0.5 rounded border border-orange-200 bg-orange-50 text-orange-950 whitespace-nowrap"
            >
              Overhead
            </span>
          </div>
          <Button size="sm" variant={tool === 'outlet' ? 'default' : 'outline'} onClick={() => setTool('outlet')}>
            Outlet
          </Button>
          <Button size="sm" variant={tool === 'drain' ? 'default' : 'outline'} onClick={() => setTool('drain')}>
            Drain
          </Button>
          <Button
            size="sm"
            variant={tool === 'room' ? 'default' : 'outline'}
            onClick={() => setShowRoomDialog(true)}
          >
            Room
          </Button>
          {tool === 'room' ? (
            <Button size="sm" variant="outline" onClick={() => setTool('select')}>
              Cancel
            </Button>
          ) : null}
          <select
            className="h-8 max-w-[200px] rounded-md border border-input bg-background px-2 text-xs"
            value={activeRoomFloorKey}
            onChange={(e) => setActiveRoomFloorKey(e.target.value)}
            title="Floor for room placement and selection"
          >
            <option value="main">Room floor: Main</option>
            {plan.lofts.map((l) => (
              <option key={`deck-${l.id}`} value={`deck:${l.id}`}>
                Room floor: On loft ({l.name ?? 'Loft'})
              </option>
            ))}
            {plan.lofts.map((l) => (
              <option key={`upper-${l.id}`} value={`upper:${l.id}`}>
                Room floor: Above loft ({l.name ?? 'Loft'})
              </option>
            ))}
          </select>
          <Button
            size="sm"
            variant="outline"
            disabled={!selectedRoom}
            onClick={() => {
              if (!selectedRoom) return;
              const lvl = selectedRoom.level ?? 'main';
              if (lvl === 'main') setActiveRoomFloorKey('main');
              else if (lvl === 'loft_deck' && selectedRoom.loftId) setActiveRoomFloorKey(`deck:${selectedRoom.loftId}`);
              else if (lvl === 'loft_upper' && selectedRoom.loftId) setActiveRoomFloorKey(`upper:${selectedRoom.loftId}`);
              else setActiveRoomFloorKey('main');
              setRoomSpec({
                name: selectedRoom.name ?? 'Room',
                width: selectedRoom.width,
                depth: selectedRoom.depth,
                wallThickness: selectedRoom.wallThickness,
                loftUpperFloorOffsetFt: selectedRoom.loftUpperFloorOffsetFt ?? 4,
                wallTopMode: selectedRoom.wallTopMode ?? 'to_ceiling',
                customWallHeightFt: selectedRoom.customWallHeightFt ?? 8,
              });
              setShowEditRoom(true);
            }}
          >
            Edit Room
          </Button>
          <Button size="sm" variant={tool === 'loft' ? 'default' : 'outline'} onClick={() => setShowLoftDialog(true)}>
            Loft
          </Button>
          {tool === 'loft' ? (
            <Button size="sm" variant="outline" onClick={() => setTool('select')}>
              Cancel
            </Button>
          ) : null}
          <Button size="sm" variant={tool === 'stair' ? 'default' : 'outline'} onClick={() => setShowStairDialog(true)}>
            Stair
          </Button>
          {tool === 'stair' ? (
            <Button size="sm" variant="outline" onClick={() => setTool('select')}>
              Cancel
            </Button>
          ) : null}
          <Button
            size="sm"
            variant={tool === 'loft_stair_hole' ? 'default' : 'outline'}
            disabled={!selectedLoft}
            onClick={() => setTool('loft_stair_hole')}
            title="Select a loft first, then drag a rectangle on the deck for the stair opening"
          >
            Stair hole
          </Button>
          {tool === 'loft_stair_hole' ? (
            <Button size="sm" variant="outline" onClick={() => setTool('select')}>
              Cancel
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            disabled={!selectedLoft}
            title={
              selectedLoft
                ? undefined
                : 'Use the Select tool, then click anywhere inside the loft on the floor plan'
            }
            onClick={() => {
              if (!selectedLoft) return;
              setEditLoftTargetId(selectedLoft.id);
              const h = selectedLoft.stairOpening;
              setEditLoftDraft({
                name: selectedLoft.name ?? 'Loft',
                width: selectedLoft.width,
                depth: selectedLoft.depth,
                elevation: selectedLoft.elevation,
                clearHeight: selectedLoft.clearHeight ?? 8,
                holeEnabled: !!h,
                holeX: h?.x ?? 1,
                holeY: h?.y ?? 1,
                holeW: h?.width ?? 3,
                holeD: h?.depth ?? 6,
              });
              setShowEditLoft(true);
            }}
          >
            Edit loft
          </Button>
          {plan.lofts.length > 0 ? (
            <label className="flex items-center gap-1.5 text-xs text-slate-600">
              <span className="shrink-0">Loft</span>
              <select
                className="border rounded px-1.5 py-1 bg-white max-w-[140px]"
                value={selectedLoft?.id ?? ''}
                onChange={(e) => {
                  const id = e.target.value;
                  setSelectedId(id || null);
                }}
              >
                <option value="">—</option>
                {plan.lofts.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name ?? 'Loft'}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <Button size="sm" variant="destructive" disabled={!canDelete} onClick={deleteSelected}>
            Delete
          </Button>
        </div>

        <div className="text-xs text-slate-600 max-w-md text-right">
          <strong>Double-click</strong> a room or loft to open it, place doors/windows on its walls, and read details.{' '}
          <strong>Esc</strong> or <strong>Back to full plan</strong> returns. Drag chips onto walls; room floor updates
          automatically in space view.
        </div>
      </div>

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

      <div className="flex-1 min-h-0">
        {viewMode === 'floor' ? (
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
            orientation="lengthX"
            onCancelPlacement={() => setTool('select')}
            onOp={onOp}
            selectedId={selectedId}
            onSelect={setSelectedId}
            focusedSpace={focusedSpace}
            onRequestFocusSpace={(f) => {
              setFocusedSpace(f);
              setSelectedId(f.id);
              applyFloorForFocusedSpace(f);
            }}
          />
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

      <div className="h-28 bg-white border-t px-3 py-2 flex items-center gap-2 overflow-x-auto">
        <PreviewButton active={viewMode === 'floor'} label="Floor" onClick={() => setViewMode('floor')}>
          <MiniFloor plan={plan} />
        </PreviewButton>
        {previews.map((side) => (
          <PreviewButton key={side} active={viewMode === side} label={side} onClick={() => setViewMode(side)}>
            <PlanElevationPreview plan={plan} side={side} className="w-full h-full" />
          </PreviewButton>
        ))}
      </div>

      <Dialog open={showRoomDialog} onOpenChange={setShowRoomDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add room</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Name</Label>
              <Input value={roomSpec.name} onChange={(e) => setRoomSpec((p) => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Width (ft)</Label>
                <Input
                  type="number"
                  value={roomSpec.width}
                  onChange={(e) => setRoomSpec((p) => ({ ...p, width: parseFloat(e.target.value) || 0 }))}
                />
              </div>
              <div>
                <Label className="text-xs">Depth (ft)</Label>
                <Input
                  type="number"
                  value={roomSpec.depth}
                  onChange={(e) => setRoomSpec((p) => ({ ...p, depth: parseFloat(e.target.value) || 0 }))}
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">Wall thickness (inches)</Label>
              <Input
                type="number"
                value={Math.round(roomSpec.wallThickness * 12 * 100) / 100}
                onChange={(e) => {
                  const inches = parseFloat(e.target.value) || 0;
                  setRoomSpec((p) => ({ ...p, wallThickness: inches / 12 }));
                }}
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Uses the toolbar <strong>Room floor</strong> selector (main, on loft, or above loft). On-loft / above-loft rooms snap inside the loft outline.
            </p>
            {activeRoomFloor.kind === 'loft_upper' ? (
              <div>
                <Label className="text-xs">Room floor above loft deck (ft)</Label>
                <Input
                  type="number"
                  value={roomSpec.loftUpperFloorOffsetFt}
                  onChange={(e) =>
                    setRoomSpec((p) => ({ ...p, loftUpperFloorOffsetFt: parseFloat(e.target.value) || 0 }))
                  }
                />
              </div>
            ) : null}
            <div className="space-y-2">
              <Label className="text-xs">Wall top</Label>
              <div className="flex flex-col gap-2 text-sm">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="wallTopAdd"
                    checked={roomSpec.wallTopMode === 'to_ceiling'}
                    onChange={() => setRoomSpec((p) => ({ ...p, wallTopMode: 'to_ceiling' }))}
                  />
                  <span>To ceiling (default)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="wallTopAdd"
                    checked={roomSpec.wallTopMode === 'custom'}
                    onChange={() => setRoomSpec((p) => ({ ...p, wallTopMode: 'custom' }))}
                  />
                  <span>Custom wall height</span>
                </label>
              </div>
              {roomSpec.wallTopMode === 'custom' ? (
                <div>
                  <Label className="text-xs">Wall height (ft)</Label>
                  <Input
                    type="number"
                    value={roomSpec.customWallHeightFt}
                    onChange={(e) =>
                      setRoomSpec((p) => ({ ...p, customWallHeightFt: parseFloat(e.target.value) || 0 }))
                    }
                  />
                </div>
              ) : null}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowRoomDialog(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  setTool('room');
                  setShowRoomDialog(false);
                }}
              >
                Place on plan
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showEditRoom} onOpenChange={setShowEditRoom}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit room</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Name</Label>
              <Input value={roomSpec.name} onChange={(e) => setRoomSpec((p) => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Width (ft)</Label>
                <Input
                  type="number"
                  value={roomSpec.width}
                  onChange={(e) => setRoomSpec((p) => ({ ...p, width: parseFloat(e.target.value) || 0 }))}
                />
              </div>
              <div>
                <Label className="text-xs">Depth (ft)</Label>
                <Input
                  type="number"
                  value={roomSpec.depth}
                  onChange={(e) => setRoomSpec((p) => ({ ...p, depth: parseFloat(e.target.value) || 0 }))}
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">Wall thickness (inches)</Label>
              <Input
                type="number"
                value={Math.round(roomSpec.wallThickness * 12 * 100) / 100}
                onChange={(e) => {
                  const inches = parseFloat(e.target.value) || 0;
                  setRoomSpec((p) => ({ ...p, wallThickness: inches / 12 }));
                }}
              />
            </div>
            <div>
              <Label className="text-xs">Room floor</Label>
              <select
                className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
                value={activeRoomFloorKey}
                onChange={(e) => setActiveRoomFloorKey(e.target.value)}
              >
                <option value="main">Main (below loft)</option>
                {plan.lofts.map((l) => (
                  <option key={`ed-${l.id}`} value={`deck:${l.id}`}>
                    On loft — {l.name ?? 'Loft'}
                  </option>
                ))}
                {plan.lofts.map((l) => (
                  <option key={`eu-${l.id}`} value={`upper:${l.id}`}>
                    Above loft — {l.name ?? 'Loft'}
                  </option>
                ))}
              </select>
            </div>
            {activeRoomFloor.kind === 'loft_upper' ? (
              <div>
                <Label className="text-xs">Room floor above loft deck (ft)</Label>
                <Input
                  type="number"
                  value={roomSpec.loftUpperFloorOffsetFt}
                  onChange={(e) =>
                    setRoomSpec((p) => ({ ...p, loftUpperFloorOffsetFt: parseFloat(e.target.value) || 0 }))
                  }
                />
              </div>
            ) : null}
            <div className="space-y-2">
              <Label className="text-xs">Wall top</Label>
              <div className="flex flex-col gap-2 text-sm">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="wallTopEdit"
                    checked={roomSpec.wallTopMode === 'to_ceiling'}
                    onChange={() => setRoomSpec((p) => ({ ...p, wallTopMode: 'to_ceiling' }))}
                  />
                  <span>To ceiling (default)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="wallTopEdit"
                    checked={roomSpec.wallTopMode === 'custom'}
                    onChange={() => setRoomSpec((p) => ({ ...p, wallTopMode: 'custom' }))}
                  />
                  <span>Custom wall height</span>
                </label>
              </div>
              {roomSpec.wallTopMode === 'custom' ? (
                <div>
                  <Label className="text-xs">Wall height (ft)</Label>
                  <Input
                    type="number"
                    value={roomSpec.customWallHeightFt}
                    onChange={(e) =>
                      setRoomSpec((p) => ({ ...p, customWallHeightFt: parseFloat(e.target.value) || 0 }))
                    }
                  />
                </div>
              ) : null}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowEditRoom(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (!selectedRoom) return;
                  const { level, loftId } = floorKeyToRoomFields(activeRoomFloorKey);
                  onChange(
                    applyOp(plan, {
                      type: 'upsert_room',
                      room: {
                        ...selectedRoom,
                        name: roomSpec.name,
                        width: roomSpec.width,
                        depth: roomSpec.depth,
                        wallThickness: roomSpec.wallThickness,
                        level,
                        loftId,
                        loftUpperFloorOffsetFt: level === 'loft_upper' ? Math.max(0, roomSpec.loftUpperFloorOffsetFt) : undefined,
                        wallTopMode: roomSpec.wallTopMode,
                        customWallHeightFt:
                          roomSpec.wallTopMode === 'custom'
                            ? Math.max(0.5, roomSpec.customWallHeightFt)
                            : undefined,
                      },
                    })
                  );
                  setShowEditRoom(false);
                }}
              >
                Save changes
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showWindowDialog} onOpenChange={setShowWindowDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Select window size</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {[
                { label: '3x3', width: 3, height: 3, sill: 3 },
                { label: '4x3', width: 4, height: 3, sill: 3 },
                { label: '4x4', width: 4, height: 4, sill: 3 },
                { label: '5x4', width: 5, height: 4, sill: 3 },
                { label: '6x4', width: 6, height: 4, sill: 3 },
                { label: '3x2 (short)', width: 3, height: 2, sill: 4 },
              ].map((p) => (
                <button
                  key={p.label}
                  className={`border rounded px-3 py-2 text-left hover:bg-slate-50 ${
                    windowSpec.label === p.label ? 'border-green-600 ring-2 ring-green-200' : 'border-slate-200'
                  }`}
                  onClick={() => setWindowSpec(p)}
                >
                  <div className="font-semibold text-sm">{p.label}</div>
                  <div className="text-[11px] text-slate-600">
                    {p.width}ft × {p.height}ft · sill {p.sill}ft
                  </div>
                </button>
              ))}
            </div>

            <div className="border-t pt-3">
              <div className="text-xs font-semibold text-slate-700 mb-2">Custom</div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-xs">Width (ft)</Label>
                  <Input
                    type="number"
                    value={windowSpec.width}
                    onChange={(e) => setWindowSpec((p) => ({ ...p, width: parseFloat(e.target.value) || 0, label: 'Custom' }))}
                  />
                </div>
                <div>
                  <Label className="text-xs">Height (ft)</Label>
                  <Input
                    type="number"
                    value={windowSpec.height}
                    onChange={(e) => setWindowSpec((p) => ({ ...p, height: parseFloat(e.target.value) || 0, label: 'Custom' }))}
                  />
                </div>
                <div>
                  <Label className="text-xs">Sill (ft)</Label>
                  <Input
                    type="number"
                    value={windowSpec.sill}
                    onChange={(e) => setWindowSpec((p) => ({ ...p, sill: parseFloat(e.target.value) || 0, label: 'Custom' }))}
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowWindowDialog(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  setTool('window');
                  setShowWindowDialog(false);
                }}
              >
                Place windows
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showDoorDialog} onOpenChange={setShowDoorDialog}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Door size and placement</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {[
                { label: '3×7', width: 3, height: 7, sill: 0 },
                { label: '3×6′8″', width: 3, height: 6 + 2 / 3, sill: 0 },
                { label: '2×8 × 6′8″', width: 2 + 2 / 3, height: 6 + 2 / 3, sill: 0 },
                { label: '6×7 (dbl)', width: 6, height: 7, sill: 0 },
                { label: '8×8 (oh size)', width: 8, height: 8, sill: 0 },
              ].map((p) => (
                <button
                  key={p.label}
                  className={`border rounded px-3 py-2 text-left hover:bg-slate-50 ${
                    doorSpec.label === p.label ? 'border-green-600 ring-2 ring-green-200' : 'border-slate-200'
                  }`}
                  onClick={() => setDoorSpec(p)}
                >
                  <div className="font-semibold text-sm">{p.label}</div>
                  <div className="text-[11px] text-slate-600">
                    {p.width.toFixed(2)}ft × {p.height.toFixed(2)}ft
                  </div>
                </button>
              ))}
            </div>

            <div className="border-t pt-3">
              <div className="text-xs font-semibold text-slate-700 mb-2">Custom size</div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-xs">Width (ft)</Label>
                  <Input
                    type="number"
                    value={doorSpec.width}
                    onChange={(e) =>
                      setDoorSpec((p) => ({ ...p, width: parseFloat(e.target.value) || 0, label: 'Custom' }))
                    }
                  />
                </div>
                <div>
                  <Label className="text-xs">Height (ft)</Label>
                  <Input
                    type="number"
                    value={doorSpec.height}
                    onChange={(e) =>
                      setDoorSpec((p) => ({ ...p, height: parseFloat(e.target.value) || 0, label: 'Custom' }))
                    }
                  />
                </div>
                <div>
                  <Label className="text-xs">Sill (ft)</Label>
                  <Input
                    type="number"
                    value={doorSpec.sill}
                    onChange={(e) =>
                      setDoorSpec((p) => ({ ...p, sill: parseFloat(e.target.value) || 0, label: 'Custom' }))
                    }
                  />
                </div>
              </div>
            </div>

            <div className="border-t pt-3 space-y-3">
              <div className="text-xs font-semibold text-slate-700">Placement</div>
              <div className="flex flex-col gap-2 text-sm">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="doorPlaceMode"
                    checked={doorPlacement.mode === 'free'}
                    onChange={() => setDoorPlacement((p) => ({ ...p, mode: 'free' }))}
                  />
                  <span>Free — click or drag one door along the wall (snaps to posts)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="doorPlaceMode"
                    checked={doorPlacement.mode === 'measured'}
                    onChange={() => setDoorPlacement((p) => ({ ...p, mode: 'measured' }))}
                  />
                  <span>Measured — inset from wall end, count, and spacing between doors</span>
                </label>
              </div>

              {doorPlacement.mode === 'measured' ? (
                <div className="space-y-3 pl-1">
                  <div>
                    <Label className="text-xs">Anchor</Label>
                    <select
                      className="mt-1 w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
                      value={doorPlacement.anchor}
                      onChange={(e) =>
                        setDoorPlacement((p) => ({
                          ...p,
                          anchor: e.target.value === 'from_end' ? 'from_end' : 'from_start',
                        }))
                      }
                    >
                      <option value="from_start">From start of wall (first corner along wall)</option>
                      <option value="from_end">From end of wall (opposite corner)</option>
                    </select>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Inset is measured from that corner to the near edge of the nearest door in the row.
                    </p>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <Label className="text-xs">Inset from corner (ft)</Label>
                      <Input
                        type="number"
                        min={0}
                        value={doorPlacement.insetFromCornerFt}
                        onChange={(e) =>
                          setDoorPlacement((p) => ({
                            ...p,
                            insetFromCornerFt: Math.max(0, parseFloat(e.target.value) || 0),
                          }))
                        }
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Number of doors</Label>
                      <Input
                        type="number"
                        min={1}
                        max={50}
                        value={doorPlacement.count}
                        onChange={(e) =>
                          setDoorPlacement((p) => ({
                            ...p,
                            count: Math.min(50, Math.max(1, Math.round(parseFloat(e.target.value) || 1))),
                          }))
                        }
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Gap between (ft)</Label>
                      <Input
                        type="number"
                        min={0}
                        value={doorPlacement.gapBetweenFt}
                        onChange={(e) =>
                          setDoorPlacement((p) => ({
                            ...p,
                            gapBetweenFt: Math.max(0, parseFloat(e.target.value) || 0),
                          }))
                        }
                      />
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowDoorDialog(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  setTool('door');
                  setShowDoorDialog(false);
                }}
              >
                Place on plan
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showOverheadDialog} onOpenChange={setShowOverheadDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Overhead door</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-xs">Width (ft)</Label>
                <Input
                  type="number"
                  value={overheadPlaceSpec.width}
                  onChange={(e) =>
                    setOverheadPlaceSpec((p) => ({ ...p, width: parseFloat(e.target.value) || 0 }))
                  }
                />
              </div>
              <div>
                <Label className="text-xs">Height (ft)</Label>
                <Input
                  type="number"
                  value={overheadPlaceSpec.height}
                  onChange={(e) =>
                    setOverheadPlaceSpec((p) => ({ ...p, height: parseFloat(e.target.value) || 0 }))
                  }
                />
              </div>
              <div>
                <Label className="text-xs">Sill (ft)</Label>
                <Input
                  type="number"
                  value={overheadPlaceSpec.sill}
                  onChange={(e) =>
                    setOverheadPlaceSpec((p) => ({ ...p, sill: parseFloat(e.target.value) || 0 }))
                  }
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">Face color (hex)</Label>
              <Input
                value={overheadPlaceSpec.style.colorHex}
                onChange={(e) =>
                  setOverheadPlaceSpec((p) => ({
                    ...p,
                    style: { ...p.style, colorHex: e.target.value },
                  }))
                }
                placeholder="#475569"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Panel rows</Label>
                <Input
                  type="number"
                  min={1}
                  max={24}
                  value={overheadPlaceSpec.style.panelRows}
                  onChange={(e) =>
                    setOverheadPlaceSpec((p) => ({
                      ...p,
                      style: {
                        ...p.style,
                        panelRows: Math.max(1, Math.min(24, Math.round(parseFloat(e.target.value) || 1))),
                      },
                    }))
                  }
                />
              </div>
              <div>
                <Label className="text-xs">Panel columns</Label>
                <Input
                  type="number"
                  min={1}
                  max={24}
                  value={overheadPlaceSpec.style.panelCols}
                  onChange={(e) =>
                    setOverheadPlaceSpec((p) => ({
                      ...p,
                      style: {
                        ...p.style,
                        panelCols: Math.max(1, Math.min(24, Math.round(parseFloat(e.target.value) || 1))),
                      },
                    }))
                  }
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">Glazed panel indices (0-based, row-major)</Label>
              <Input
                value={overheadWindowIdxText}
                onChange={(e) => setOverheadWindowIdxText(e.target.value)}
                placeholder="e.g. 0, 2, 5"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Index = row × columns + column. Jamb posts adjust in 3D; interior posts between jambs are removed.
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowOverheadDialog(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  const rows = Math.max(1, Math.min(24, Math.round(overheadPlaceSpec.style.panelRows)));
                  const cols = Math.max(1, Math.min(24, Math.round(overheadPlaceSpec.style.panelCols)));
                  const maxIdx = rows * cols;
                  const windowPanelIndices = overheadWindowIdxText
                    .split(/[\s,]+/)
                    .map((x) => x.trim())
                    .filter(Boolean)
                    .map((x) => parseInt(x, 10))
                    .filter((n) => Number.isFinite(n) && n >= 0 && n < maxIdx)
                    .filter((n, i, a) => a.indexOf(n) === i);
                  setOverheadPlaceSpec((p) => ({
                    ...p,
                    style: { ...p.style, panelRows: rows, panelCols: cols, windowPanelIndices },
                  }));
                  setTool('overhead');
                  setShowOverheadDialog(false);
                }}
              >
                Place on plan
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showLoftDialog} onOpenChange={setShowLoftDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add loft</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Name</Label>
              <Input value={loftSpec.name} onChange={(e) => setLoftSpec((p) => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Width (ft)</Label>
                <Input
                  type="number"
                  value={loftSpec.width}
                  onChange={(e) => setLoftSpec((p) => ({ ...p, width: parseFloat(e.target.value) || 0 }))}
                />
              </div>
              <div>
                <Label className="text-xs">Depth (ft)</Label>
                <Input
                  type="number"
                  value={loftSpec.depth}
                  onChange={(e) => setLoftSpec((p) => ({ ...p, depth: parseFloat(e.target.value) || 0 }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Deck height (ft)</Label>
                <Input
                  type="number"
                  value={loftSpec.elevation}
                  onChange={(e) => setLoftSpec((p) => ({ ...p, elevation: parseFloat(e.target.value) || 0 }))}
                />
              </div>
              <div>
                <Label className="text-xs">Clear height (ft)</Label>
                <Input
                  type="number"
                  value={loftSpec.clearHeight}
                  onChange={(e) => setLoftSpec((p) => ({ ...p, clearHeight: parseFloat(e.target.value) || 0 }))}
                />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Deck height is the main-floor to loft floor. Clear height is headroom in the loft. Use <strong>Wall</strong> for
              posts or knee walls, then <strong>Edit loft</strong> for the stair opening.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowLoftDialog(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  setTool('loft');
                  setShowLoftDialog(false);
                }}
              >
                Place on plan
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showStairDialog} onOpenChange={setShowStairDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add stair run</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Tread width (ft)</Label>
              <Input
                type="number"
                value={stairSpec.width}
                onChange={(e) => setStairSpec((p) => ({ ...p, width: parseFloat(e.target.value) || 0 }))}
              />
            </div>
            <div>
              <Label className="text-xs">Total rise (ft)</Label>
              <Input
                type="number"
                value={stairSpec.rise}
                onChange={(e) => setStairSpec((p) => ({ ...p, rise: parseFloat(e.target.value) || 0 }))}
              />
            </div>
            <div>
              <Label className="text-xs">Match loft deck (optional)</Label>
              <select
                className="w-full border rounded-md h-9 px-2 text-sm bg-background"
                value={stairSpec.loftId ?? ''}
                onChange={(e) => {
                  const v = e.target.value;
                  const loft = plan.lofts.find((l) => l.id === v);
                  setStairSpec((p) => ({
                    ...p,
                    loftId: v || null,
                    rise: loft ? loft.elevation : p.rise,
                  }));
                }}
              >
                <option value="">None (use rise above)</option>
                {plan.lofts.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name ?? 'Loft'} — deck {l.elevation}′
                  </option>
                ))}
              </select>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Click the <strong>bottom</strong> of the stair, then a second point in the <strong>direction</strong> the stairs
              run (distance = horizontal run).
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowStairDialog(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  setTool('stair');
                  setShowStairDialog(false);
                }}
              >
                Place stair
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showEditLoft}
        onOpenChange={(open) => {
          setShowEditLoft(open);
          if (!open) {
            setEditLoftTargetId(null);
            setEditLoftDraft(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit loft</DialogTitle>
          </DialogHeader>
          {editLoftDraft && loftBeingEdited ? (
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Name</Label>
                <Input
                  value={editLoftDraft.name}
                  onChange={(e) => setEditLoftDraft((p) => (p ? { ...p, name: e.target.value } : p))}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Width (ft)</Label>
                  <Input
                    type="number"
                    value={editLoftDraft.width}
                    onChange={(e) =>
                      setEditLoftDraft((p) =>
                        p ? { ...p, width: parseFloat(e.target.value) || 0 } : p
                      )
                    }
                  />
                </div>
                <div>
                  <Label className="text-xs">Depth (ft)</Label>
                  <Input
                    type="number"
                    value={editLoftDraft.depth}
                    onChange={(e) =>
                      setEditLoftDraft((p) =>
                        p ? { ...p, depth: parseFloat(e.target.value) || 0 } : p
                      )
                    }
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Deck height (ft)</Label>
                  <Input
                    type="number"
                    value={editLoftDraft.elevation}
                    onChange={(e) =>
                      setEditLoftDraft((p) =>
                        p ? { ...p, elevation: parseFloat(e.target.value) || 0 } : p
                      )
                    }
                  />
                </div>
                <div>
                  <Label className="text-xs">Clear height (ft)</Label>
                  <Input
                    type="number"
                    value={editLoftDraft.clearHeight}
                    onChange={(e) =>
                      setEditLoftDraft((p) =>
                        p ? { ...p, clearHeight: parseFloat(e.target.value) || 0 } : p
                      )
                    }
                  />
                </div>
              </div>
              <div className="border-t pt-3 space-y-2">
                <div className="text-xs font-semibold text-slate-700">Stair opening on deck</div>
                <p className="text-xs text-slate-500">
                  Set <strong>width</strong> and <strong>length</strong> (plan dimensions), then position with the fields below or{' '}
                  <strong>drag the white opening</strong> on the plan (Select tool). Or use toolbar <strong>Stair hole</strong> and drag a rectangle.
                </p>
                <div className="flex flex-wrap gap-1.5 items-center">
                  <span className="text-xs text-slate-600 w-full sm:w-auto sm:mr-1">Presets (centered)</span>
                  {(
                    [
                      { label: '3×6′', w: 3, d: 6 },
                      { label: '3×8′', w: 3, d: 8 },
                      { label: '4×8′', w: 4, d: 8 },
                      { label: '4×10′', w: 4, d: 10 },
                    ] as const
                  ).map((preset) => (
                    <Button
                      key={preset.label}
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="h-7 text-xs"
                      onClick={() =>
                        setEditLoftDraft((p) => {
                          if (!p) return p;
                          const lw = Math.max(1, p.width);
                          const ld = Math.max(1, p.depth);
                          const hw = preset.w;
                          const hd = preset.d;
                          return {
                            ...p,
                            holeEnabled: true,
                            holeW: hw,
                            holeD: hd,
                            holeX: Math.max(0, (lw - hw) / 2),
                            holeY: Math.max(0, (ld - hd) / 2),
                          };
                        })
                      }
                    >
                      {preset.label}
                    </Button>
                  ))}
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={editLoftDraft.holeEnabled}
                    onChange={(e) => setEditLoftDraft((p) => (p ? { ...p, holeEnabled: e.target.checked } : p))}
                  />
                  Show opening
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Position — along loft width from origin (ft)</Label>
                    <Input
                      type="number"
                      value={editLoftDraft.holeX}
                      onChange={(e) =>
                        setEditLoftDraft((p) =>
                          p ? { ...p, holeX: parseFloat(e.target.value) || 0 } : p
                        )
                      }
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Position — along loft length from origin (ft)</Label>
                    <Input
                      type="number"
                      value={editLoftDraft.holeY}
                      onChange={(e) =>
                        setEditLoftDraft((p) =>
                          p ? { ...p, holeY: parseFloat(e.target.value) || 0 } : p
                        )
                      }
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Opening width (ft)</Label>
                    <Input
                      type="number"
                      value={editLoftDraft.holeW}
                      onChange={(e) =>
                        setEditLoftDraft((p) =>
                          p ? { ...p, holeW: parseFloat(e.target.value) || 0 } : p
                        )
                      }
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Opening length (ft)</Label>
                    <Input
                      type="number"
                      value={editLoftDraft.holeD}
                      onChange={(e) =>
                        setEditLoftDraft((p) =>
                          p ? { ...p, holeD: parseFloat(e.target.value) || 0 } : p
                        )
                      }
                    />
                  </div>
                </div>
                <p className="text-[11px] text-slate-500">
                  Origin matches the loft’s corner on the plan (same as the loft rectangle). Drag the dashed opening to reposition without typing.
                </p>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setShowEditLoft(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    if (!editLoftDraft || !loftBeingEdited) return;
                    const w = Math.max(1, editLoftDraft.width);
                    const d = Math.max(1, editLoftDraft.depth);
                    let stairOpening: PlanLoftStairOpening | null = null;
                    if (editLoftDraft.holeEnabled) {
                      const hw = Math.max(0.5, editLoftDraft.holeW);
                      const hd = Math.max(0.5, editLoftDraft.holeD);
                      const x = clamp(editLoftDraft.holeX, 0, Math.max(0, w - hw));
                      const y = clamp(editLoftDraft.holeY, 0, Math.max(0, d - hd));
                      stairOpening = { x, y, width: hw, depth: hd };
                    }
                    onChange(
                      applyOp(plan, {
                        type: 'upsert_loft',
                        loft: {
                          ...loftBeingEdited,
                          name: editLoftDraft.name,
                          width: w,
                          depth: d,
                          elevation: editLoftDraft.elevation,
                          clearHeight: editLoftDraft.clearHeight,
                          stairOpening,
                        },
                      })
                    );
                    setShowEditLoft(false);
                    setEditLoftTargetId(null);
                    setEditLoftDraft(null);
                  }}
                >
                  Save
                </Button>
              </div>
            </div>
          ) : showEditLoft && editLoftTargetId ? (
            <p className="text-sm text-slate-600">This loft is no longer in the plan. Close and try again.</p>
          ) : null}
        </DialogContent>
      </Dialog>
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

