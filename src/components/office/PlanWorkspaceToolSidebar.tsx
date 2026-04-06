import type {
  BuildingPlanModel,
  PlanEntityId,
  PlanLoftStairOpening,
  PlanOpening,
  PlanOverheadStyle,
  PlanRoomLevel,
  PlanWall,
} from '@/lib/buildingPlanModel';
import type { OpeningPlacementDimKind } from '@/lib/openingPlacementAlongWall';
import { formatFeetForPlan } from '@/lib/architecturalFormat';
import { clamp } from '@/lib/buildingPlanModel';
import { applyOp } from '@/lib/planOps';
import type { DoorPlacementOptions, PlanActiveRoomFloor, PlanRoomPlacementSpec } from '@/components/plans/Plan2DEditor';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { Dispatch, ReactNode, SetStateAction } from 'react';

export type ToolMode =
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

export type SidebarSection =
  | 'select'
  | 'wall'
  | 'door'
  | 'window'
  | 'overhead'
  | 'drag'
  | 'outlet'
  | 'drain'
  | 'room'
  | 'loft'
  | 'stair'
  | 'stair_hole'
  | 'edit_room'
  | 'edit_loft'
  | 'edit_opening';

export type PlanWorkspaceToolSidebarProps = {
  plan: BuildingPlanModel;
  onChange: (next: BuildingPlanModel) => void;
  sidebarSection: SidebarSection;
  setSidebarSection: Dispatch<SetStateAction<SidebarSection>>;
  tool: ToolMode;
  setTool: Dispatch<SetStateAction<ToolMode>>;
  selectedId: PlanEntityId | null;
  setSelectedId: (id: PlanEntityId | null) => void;
  activeRoomFloorKey: string;
  setActiveRoomFloorKey: (k: string) => void;
  activeRoomFloor: PlanActiveRoomFloor;
  roomSpec: PlanRoomPlacementSpec;
  setRoomSpec: Dispatch<SetStateAction<PlanRoomPlacementSpec>>;
  selectedRoom: BuildingPlanModel['rooms'][number] | null | undefined;
  windowSpec: { label: string; width: number; height: number; sill: number };
  setWindowSpec: Dispatch<SetStateAction<{ label: string; width: number; height: number; sill: number }>>;
  doorSpec: { label: string; width: number; height: number; sill: number };
  setDoorSpec: Dispatch<SetStateAction<{ label: string; width: number; height: number; sill: number }>>;
  doorPlacement: DoorPlacementOptions;
  setDoorPlacement: Dispatch<SetStateAction<DoorPlacementOptions>>;
  overheadPlaceSpec: { width: number; height: number; sill: number; style: PlanOverheadStyle };
  setOverheadPlaceSpec: Dispatch<SetStateAction<{ width: number; height: number; sill: number; style: PlanOverheadStyle }>>;
  overheadWindowIdxText: string;
  setOverheadWindowIdxText: Dispatch<SetStateAction<string>>;
  loftSpec: { name: string; width: number; depth: number; elevation: number; clearHeight: number };
  setLoftSpec: Dispatch<SetStateAction<{ name: string; width: number; depth: number; elevation: number; clearHeight: number }>>;
  stairSpec: { width: number; rise: number; loftId: string | null };
  setStairSpec: Dispatch<SetStateAction<{ width: number; rise: number; loftId: string | null }>>;
  selectedLoft: BuildingPlanModel['lofts'][number] | null | undefined;
  editLoftTargetId: PlanEntityId | null;
  setEditLoftTargetId: Dispatch<SetStateAction<PlanEntityId | null>>;
  editLoftDraft: {
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
  } | null;
  setEditLoftDraft: Dispatch<
    SetStateAction<{
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
    } | null>
  >;
  loftBeingEdited: BuildingPlanModel['lofts'][number] | null | undefined;
  canDelete: boolean;
  deleteSelected: () => void;
  floorKeyToRoomFields: (key: string) => { level: PlanRoomLevel; loftId: string | null };
  /** Floor-plan placement modes (doors, windows, rooms, …): show save/done strip */
  showPlacementDone?: boolean;
  onFinishPlacing?: () => void | Promise<void>;
  finishPlacingPending?: boolean;
  /** Parent offers RPC/database save with “Save & stop placing” */
  finishPlacingSaveOffered?: boolean;
  finishPlacingSaveDisabled?: boolean;
  selectedOpening: PlanOpening | null;
  openingWall: PlanWall | null;
  openingPlacementKind: OpeningPlacementDimKind;
  setOpeningPlacementKind: Dispatch<SetStateAction<OpeningPlacementDimKind>>;
  openingPlacementDraft: string;
  setOpeningPlacementDraft: Dispatch<SetStateAction<string>>;
  onApplyOpeningPlacement: () => void;
};

function openingSidebarLabel(o: PlanOpening): string {
  if (o.type === 'overhead_door') return `OH ${formatFeetForPlan(o.width)}×${formatFeetForPlan(o.height)}`;
  if (o.type === 'door') return `Door ${formatFeetForPlan(o.width)}×${formatFeetForPlan(o.height)}`;
  return `Window ${formatFeetForPlan(o.width)}×${formatFeetForPlan(o.height)} sill ${formatFeetForPlan(o.sill)}`;
}

function ToolRow(props: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={props.active ? 'default' : 'outline'}
      disabled={props.disabled}
      title={props.title}
      className={cn('w-full justify-start text-left font-medium shrink-0', props.active && 'ring-2 ring-green-200')}
      onClick={props.onClick}
    >
      {props.children}
    </Button>
  );
}

export function PlanWorkspaceToolSidebar(p: PlanWorkspaceToolSidebarProps) {
  const goSelect = () => {
    p.setTool('select');
    p.setSidebarSection('select');
  };

  return (
    <aside className="flex w-[280px] shrink-0 flex-col border-l border-slate-200 bg-slate-50/90 min-h-0">
      <div className="border-b border-slate-200 px-2 py-2">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Plan tools</div>
      </div>
      <div className="flex flex-col gap-1 overflow-y-auto p-2 min-h-0 max-h-[38vh] border-b border-slate-200">
        <ToolRow
          active={p.sidebarSection === 'select' && p.tool === 'select'}
          onClick={goSelect}
        >
          Select
        </ToolRow>
        <ToolRow
          active={p.sidebarSection === 'edit_opening'}
          disabled={!p.selectedOpening}
          title={p.selectedOpening ? undefined : 'Select a door, window, or overhead on the plan first'}
          onClick={() => {
            if (!p.selectedOpening) return;
            p.setTool('select');
            p.setSidebarSection('edit_opening');
          }}
        >
          Opening placement
        </ToolRow>
        <ToolRow
          active={p.sidebarSection === 'wall' || p.tool === 'wall'}
          onClick={() => {
            p.setTool('wall');
            p.setSidebarSection('wall');
          }}
        >
          Wall
        </ToolRow>
        <ToolRow
          active={p.sidebarSection === 'door' || p.tool === 'door'}
          onClick={() => {
            p.setTool('select');
            p.setSidebarSection('door');
          }}
        >
          Door
        </ToolRow>
        <ToolRow
          active={p.sidebarSection === 'window' || p.tool === 'window'}
          onClick={() => {
            p.setTool('select');
            p.setSidebarSection('window');
          }}
        >
          Window
        </ToolRow>
        <ToolRow
          active={p.sidebarSection === 'overhead' || p.tool === 'overhead'}
          onClick={() => {
            p.setTool('select');
            p.setOverheadWindowIdxText(p.overheadPlaceSpec.style.windowPanelIndices.join(', '));
            p.setSidebarSection('overhead');
          }}
        >
          Overhead
        </ToolRow>
        <ToolRow
          active={p.sidebarSection === 'drag'}
          onClick={() => {
            p.setTool('select');
            p.setSidebarSection('drag');
          }}
        >
          Drag onto wall
        </ToolRow>
        <ToolRow
          active={p.sidebarSection === 'outlet' || p.tool === 'outlet'}
          onClick={() => {
            p.setTool('outlet');
            p.setSidebarSection('outlet');
          }}
        >
          Outlet
        </ToolRow>
        <ToolRow
          active={p.sidebarSection === 'drain' || p.tool === 'drain'}
          onClick={() => {
            p.setTool('drain');
            p.setSidebarSection('drain');
          }}
        >
          Drain
        </ToolRow>
        <ToolRow
          active={p.sidebarSection === 'room' || p.tool === 'room'}
          onClick={() => {
            p.setTool('select');
            p.setSidebarSection('room');
          }}
        >
          Room
        </ToolRow>
        <ToolRow
          active={p.sidebarSection === 'edit_room'}
          disabled={!p.selectedRoom}
          onClick={() => {
            if (!p.selectedRoom) return;
            p.setTool('select');
            const lvl = p.selectedRoom.level ?? 'main';
            if (lvl === 'main') p.setActiveRoomFloorKey('main');
            else if (lvl === 'loft_deck' && p.selectedRoom.loftId)
              p.setActiveRoomFloorKey(`deck:${p.selectedRoom.loftId}`);
            else if (lvl === 'loft_upper' && p.selectedRoom.loftId)
              p.setActiveRoomFloorKey(`upper:${p.selectedRoom.loftId}`);
            else p.setActiveRoomFloorKey('main');
            p.setRoomSpec({
              name: p.selectedRoom.name ?? 'Room',
              width: p.selectedRoom.width,
              depth: p.selectedRoom.depth,
              wallThickness: p.selectedRoom.wallThickness,
              loftUpperFloorOffsetFt: p.selectedRoom.loftUpperFloorOffsetFt ?? 4,
              wallTopMode: p.selectedRoom.wallTopMode ?? 'to_ceiling',
              customWallHeightFt: p.selectedRoom.customWallHeightFt ?? 8,
            });
            p.setSidebarSection('edit_room');
          }}
        >
          Edit room
        </ToolRow>
        <ToolRow
          active={p.sidebarSection === 'loft' || p.tool === 'loft'}
          onClick={() => {
            p.setTool('select');
            p.setSidebarSection('loft');
          }}
        >
          Loft
        </ToolRow>
        <ToolRow
          active={p.sidebarSection === 'stair' || p.tool === 'stair'}
          onClick={() => {
            p.setTool('select');
            p.setSidebarSection('stair');
          }}
        >
          Stair
        </ToolRow>
        <ToolRow
          active={p.sidebarSection === 'stair_hole' || p.tool === 'loft_stair_hole'}
          disabled={!p.selectedLoft}
          title={
            p.selectedLoft
              ? undefined
              : 'Select a loft first, then drag a rectangle on the deck for the stair opening'
          }
          onClick={() => {
            if (!p.selectedLoft) return;
            p.setTool('loft_stair_hole');
            p.setSidebarSection('stair_hole');
          }}
        >
          Stair hole
        </ToolRow>
        <ToolRow
          active={p.sidebarSection === 'edit_loft'}
          disabled={!p.selectedLoft}
          title={
            p.selectedLoft
              ? undefined
              : 'Use Select, then click inside a loft on the plan'
          }
          onClick={() => {
            if (!p.selectedLoft) return;
            p.setTool('select');
            p.setEditLoftTargetId(p.selectedLoft.id);
            const h = p.selectedLoft.stairOpening;
            p.setEditLoftDraft({
              name: p.selectedLoft.name ?? 'Loft',
              width: p.selectedLoft.width,
              depth: p.selectedLoft.depth,
              elevation: p.selectedLoft.elevation,
              clearHeight: p.selectedLoft.clearHeight ?? 8,
              holeEnabled: !!h,
              holeX: h?.x ?? 1,
              holeY: h?.y ?? 1,
              holeW: h?.width ?? 3,
              holeD: h?.depth ?? 6,
            });
            p.setSidebarSection('edit_loft');
          }}
        >
          Edit loft
        </ToolRow>
        {p.plan.lofts.length > 0 ? (
          <label className="flex flex-col gap-1 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[11px] text-slate-600">
            <span className="font-medium text-slate-700">Active loft (selection)</span>
            <select
              className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
              value={p.selectedLoft?.id ?? ''}
              onChange={(e) => {
                const id = e.target.value;
                p.setSelectedId(id || null);
              }}
            >
              <option value="">—</option>
              {p.plan.lofts.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name ?? 'Loft'}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {p.showPlacementDone ? (
        <div className="border-b border-slate-200 bg-amber-50/90 px-2 py-2 space-y-1.5">
          <p className="text-[10px] text-amber-950/90 leading-snug">
            {p.finishPlacingSaveOffered && !p.finishPlacingSaveDisabled
              ? 'Click below to save your drawing and return to Select.'
              : 'Click below to stop placing and return to Select.'}
          </p>
          <Button
            type="button"
            size="sm"
            className="w-full font-semibold bg-amber-600 text-white hover:bg-amber-700"
            disabled={p.finishPlacingPending}
            onClick={() => void p.onFinishPlacing?.()}
          >
            {p.finishPlacingPending
              ? 'Saving…'
              : p.finishPlacingSaveOffered && !p.finishPlacingSaveDisabled
                ? 'Save & stop placing'
                : 'Stop placing'}
          </Button>
        </div>
      ) : null}

      {p.sidebarSection === 'select' ? null : (
      <div className="flex flex-1 flex-col min-h-0 overflow-y-auto bg-white p-3 text-sm">
        <div className="mb-2 text-xs font-semibold text-slate-700">
          {p.sidebarSection === 'wall' && 'Wall'}
          {p.sidebarSection === 'door' && 'Door'}
          {p.sidebarSection === 'window' && 'Window'}
          {p.sidebarSection === 'overhead' && 'Overhead door'}
          {p.sidebarSection === 'drag' && 'Drag from here'}
          {p.sidebarSection === 'outlet' && 'Outlet'}
          {p.sidebarSection === 'drain' && 'Drain'}
          {p.sidebarSection === 'room' && 'Add room'}
          {p.sidebarSection === 'edit_room' && 'Edit room'}
          {p.sidebarSection === 'loft' && 'Add loft'}
          {p.sidebarSection === 'stair' && 'Add stair'}
          {p.sidebarSection === 'stair_hole' && 'Stair opening'}
          {p.sidebarSection === 'edit_loft' && 'Edit loft'}
          {p.sidebarSection === 'edit_opening' && 'Opening placement'}
        </div>

        {p.sidebarSection === 'edit_opening' && p.selectedOpening && p.openingWall ? (
          <div className="space-y-3">
            <p className="text-[11px] text-slate-600">
              Wall <strong>{p.openingWall.label ?? '—'}</strong> · {openingSidebarLabel(p.selectedOpening)} · tap the opening on
              the plan (without dragging) to open this panel.
            </p>
            <div>
              <Label className="text-xs">Measure</Label>
              <select
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-xs"
                value={p.openingPlacementKind}
                onChange={(e) => p.setOpeningPlacementKind(e.target.value as OpeningPlacementDimKind)}
              >
                <option value="door_start_to_wall_start">Door/window start → wall start (corner)</option>
                <option value="door_end_to_wall_end">Door/window end → wall end (corner)</option>
                <option value="clear_left_to_door_start">Clearance: toward start (wall or nearest opening) → opening start</option>
                <option value="clear_door_end_to_right">Clearance: opening end → toward end (opening or corner)</option>
              </select>
            </div>
            <div>
              <Label className="text-xs">Distance (ft)</Label>
              <Input
                className="mt-1"
                value={p.openingPlacementDraft}
                onChange={(e) => p.setOpeningPlacementDraft(e.target.value)}
                inputMode="decimal"
              />
            </div>
            <p className="text-[10px] text-slate-500">
              Along-wall direction follows the wall from its <strong>start</strong> point to <strong>end</strong> point in
              the model. Drag the opening on the plan to nudge; use Apply for exact dimensions.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => p.setSidebarSection('select')}>
                Done
              </Button>
              <Button type="button" size="sm" onClick={p.onApplyOpeningPlacement}>
                Apply placement
              </Button>
            </div>
          </div>
        ) : null}

        {p.sidebarSection === 'edit_opening' && (!p.selectedOpening || !p.openingWall) ? (
          <p className="text-xs text-slate-500">Select a door, window, or overhead on the floor plan (tap without drag).</p>
        ) : null}

        {p.sidebarSection === 'wall' ? (
          <p className="text-xs text-slate-600">Click and drag on the plan to draw walls. Press corner points to finish runs.</p>
        ) : null}

        {p.sidebarSection === 'outlet' ? (
          <p className="text-xs text-slate-600">Click a wall to place an electrical outlet.</p>
        ) : null}

        {p.sidebarSection === 'drain' ? (
          <p className="text-xs text-slate-600">Click a wall to place a drain / plumbing stub.</p>
        ) : null}

        {p.sidebarSection === 'stair_hole' ? (
          <p className="text-xs text-slate-600">
            With a loft selected, drag a rectangle on the loft deck for the stair opening. Use <strong>Edit loft</strong> to tune
            size and position.
          </p>
        ) : null}

        {p.sidebarSection === 'drag' ? (
          <div className="space-y-2">
            <p className="text-[11px] text-slate-600">Drag a chip onto a wall in the plan.</p>
            <div className="flex flex-col gap-2">
              <span
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/x-plan-item', 'door');
                  e.dataTransfer.effectAllowed = 'copy';
                }}
                className="cursor-grab select-none rounded border border-sky-200 bg-sky-50 px-3 py-2 text-center text-sm text-sky-900"
              >
                Door
              </span>
              <span
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/x-plan-item', 'window');
                  e.dataTransfer.effectAllowed = 'copy';
                }}
                className="cursor-grab select-none rounded border border-amber-200 bg-amber-50 px-3 py-2 text-center text-sm text-amber-950"
              >
                Window
              </span>
              <span
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/x-plan-item', 'overhead');
                  e.dataTransfer.effectAllowed = 'copy';
                }}
                className="cursor-grab select-none rounded border border-orange-200 bg-orange-50 px-3 py-2 text-center text-sm text-orange-950"
              >
                Overhead
              </span>
            </div>
          </div>
        ) : null}

        {p.sidebarSection === 'room' ? (
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Room floor</Label>
              <select
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-xs"
                value={p.activeRoomFloorKey}
                onChange={(e) => p.setActiveRoomFloorKey(e.target.value)}
                title="Floor for room placement"
              >
                <option value="main">Main</option>
                {p.plan.lofts.map((l) => (
                  <option key={`deck-${l.id}`} value={`deck:${l.id}`}>
                    On loft ({l.name ?? 'Loft'})
                  </option>
                ))}
                {p.plan.lofts.map((l) => (
                  <option key={`upper-${l.id}`} value={`upper:${l.id}`}>
                    Above loft ({l.name ?? 'Loft'})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-xs">Name</Label>
              <Input
                value={p.roomSpec.name}
                onChange={(e) => p.setRoomSpec((s) => ({ ...s, name: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Width (ft)</Label>
                <Input
                  type="number"
                  value={p.roomSpec.width}
                  onChange={(e) => p.setRoomSpec((s) => ({ ...s, width: parseFloat(e.target.value) || 0 }))}
                />
              </div>
              <div>
                <Label className="text-xs">Depth (ft)</Label>
                <Input
                  type="number"
                  value={p.roomSpec.depth}
                  onChange={(e) => p.setRoomSpec((s) => ({ ...s, depth: parseFloat(e.target.value) || 0 }))}
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">Wall thickness (in)</Label>
              <Input
                type="number"
                value={Math.round(p.roomSpec.wallThickness * 12 * 100) / 100}
                onChange={(e) => {
                  const inches = parseFloat(e.target.value) || 0;
                  p.setRoomSpec((s) => ({ ...s, wallThickness: inches / 12 }));
                }}
              />
            </div>
            {p.activeRoomFloor.kind === 'loft_upper' ? (
              <div>
                <Label className="text-xs">Floor above deck (ft)</Label>
                <Input
                  type="number"
                  value={p.roomSpec.loftUpperFloorOffsetFt}
                  onChange={(e) =>
                    p.setRoomSpec((s) => ({ ...s, loftUpperFloorOffsetFt: parseFloat(e.target.value) || 0 }))
                  }
                />
              </div>
            ) : null}
            <div className="space-y-2">
              <Label className="text-xs">Wall top</Label>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="radio"
                  name="wallTopAddSb"
                  checked={p.roomSpec.wallTopMode === 'to_ceiling'}
                  onChange={() => p.setRoomSpec((s) => ({ ...s, wallTopMode: 'to_ceiling' }))}
                />
                To ceiling
              </label>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="radio"
                  name="wallTopAddSb"
                  checked={p.roomSpec.wallTopMode === 'custom'}
                  onChange={() => p.setRoomSpec((s) => ({ ...s, wallTopMode: 'custom' }))}
                />
                Custom height
              </label>
              {p.roomSpec.wallTopMode === 'custom' ? (
                <div>
                  <Label className="text-xs">Wall height (ft)</Label>
                  <Input
                    type="number"
                    value={p.roomSpec.customWallHeightFt}
                    onChange={(e) =>
                      p.setRoomSpec((s) => ({ ...s, customWallHeightFt: parseFloat(e.target.value) || 0 }))
                    }
                  />
                </div>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={goSelect}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  p.setTool('room');
                }}
              >
                Place on plan
              </Button>
            </div>
          </div>
        ) : null}

        {p.sidebarSection === 'edit_room' && p.selectedRoom ? (
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Name</Label>
              <Input
                value={p.roomSpec.name}
                onChange={(e) => p.setRoomSpec((s) => ({ ...s, name: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Width (ft)</Label>
                <Input
                  type="number"
                  value={p.roomSpec.width}
                  onChange={(e) => p.setRoomSpec((s) => ({ ...s, width: parseFloat(e.target.value) || 0 }))}
                />
              </div>
              <div>
                <Label className="text-xs">Depth (ft)</Label>
                <Input
                  type="number"
                  value={p.roomSpec.depth}
                  onChange={(e) => p.setRoomSpec((s) => ({ ...s, depth: parseFloat(e.target.value) || 0 }))}
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">Wall thickness (in)</Label>
              <Input
                type="number"
                value={Math.round(p.roomSpec.wallThickness * 12 * 100) / 100}
                onChange={(e) => {
                  const inches = parseFloat(e.target.value) || 0;
                  p.setRoomSpec((s) => ({ ...s, wallThickness: inches / 12 }));
                }}
              />
            </div>
            <div>
              <Label className="text-xs">Room floor</Label>
              <select
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-xs"
                value={p.activeRoomFloorKey}
                onChange={(e) => p.setActiveRoomFloorKey(e.target.value)}
              >
                <option value="main">Main</option>
                {p.plan.lofts.map((l) => (
                  <option key={`ed-${l.id}`} value={`deck:${l.id}`}>
                    On loft — {l.name ?? 'Loft'}
                  </option>
                ))}
                {p.plan.lofts.map((l) => (
                  <option key={`eu-${l.id}`} value={`upper:${l.id}`}>
                    Above loft — {l.name ?? 'Loft'}
                  </option>
                ))}
              </select>
            </div>
            {p.activeRoomFloor.kind === 'loft_upper' ? (
              <div>
                <Label className="text-xs">Floor above deck (ft)</Label>
                <Input
                  type="number"
                  value={p.roomSpec.loftUpperFloorOffsetFt}
                  onChange={(e) =>
                    p.setRoomSpec((s) => ({ ...s, loftUpperFloorOffsetFt: parseFloat(e.target.value) || 0 }))
                  }
                />
              </div>
            ) : null}
            <div className="space-y-2">
              <Label className="text-xs">Wall top</Label>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="radio"
                  name="wallTopEdSb"
                  checked={p.roomSpec.wallTopMode === 'to_ceiling'}
                  onChange={() => p.setRoomSpec((s) => ({ ...s, wallTopMode: 'to_ceiling' }))}
                />
                To ceiling
              </label>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="radio"
                  name="wallTopEdSb"
                  checked={p.roomSpec.wallTopMode === 'custom'}
                  onChange={() => p.setRoomSpec((s) => ({ ...s, wallTopMode: 'custom' }))}
                />
                Custom height
              </label>
              {p.roomSpec.wallTopMode === 'custom' ? (
                <div>
                  <Label className="text-xs">Wall height (ft)</Label>
                  <Input
                    type="number"
                    value={p.roomSpec.customWallHeightFt}
                    onChange={(e) =>
                      p.setRoomSpec((s) => ({ ...s, customWallHeightFt: parseFloat(e.target.value) || 0 }))
                    }
                  />
                </div>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => p.setSidebarSection('room')}>
                Back
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  const { level, loftId } = p.floorKeyToRoomFields(p.activeRoomFloorKey);
                  p.onChange(
                    applyOp(p.plan, {
                      type: 'upsert_room',
                      room: {
                        ...p.selectedRoom!,
                        name: p.roomSpec.name,
                        width: p.roomSpec.width,
                        depth: p.roomSpec.depth,
                        wallThickness: p.roomSpec.wallThickness,
                        level,
                        loftId,
                        loftUpperFloorOffsetFt:
                          level === 'loft_upper' ? Math.max(0, p.roomSpec.loftUpperFloorOffsetFt) : undefined,
                        wallTopMode: p.roomSpec.wallTopMode,
                        customWallHeightFt:
                          p.roomSpec.wallTopMode === 'custom'
                            ? Math.max(0.5, p.roomSpec.customWallHeightFt)
                            : undefined,
                      },
                    })
                  );
                  p.setSidebarSection('select');
                  p.setTool('select');
                }}
              >
                Save
              </Button>
            </div>
          </div>
        ) : null}

        {p.sidebarSection === 'edit_room' && !p.selectedRoom ? (
          <p className="text-xs text-slate-500">Select a room on the plan, then open Edit room again.</p>
        ) : null}

        {p.sidebarSection === 'window' ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: '3x3', width: 3, height: 3, sill: 3 },
                { label: '4x3', width: 4, height: 3, sill: 3 },
                { label: '4x4', width: 4, height: 4, sill: 3 },
                { label: '5x4', width: 5, height: 4, sill: 3 },
                { label: '6x4', width: 6, height: 4, sill: 3 },
                { label: '3x2 (short)', width: 3, height: 2, sill: 4 },
              ].map((sz) => (
                <button
                  key={sz.label}
                  type="button"
                  className={cn(
                    'rounded border px-2 py-1.5 text-left text-xs hover:bg-slate-50',
                    p.windowSpec.label === sz.label ? 'border-green-600 ring-2 ring-green-200' : 'border-slate-200'
                  )}
                  onClick={() => p.setWindowSpec(sz)}
                >
                  <div className="font-semibold">{sz.label}</div>
                  <div className="text-[10px] text-slate-600">
                    {sz.width}×{sz.height}′ sill {sz.sill}′
                  </div>
                </button>
              ))}
            </div>
            <div className="border-t pt-2">
              <div className="mb-1 text-[10px] font-semibold text-slate-700">Custom</div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-xs">W</Label>
                  <Input
                    type="number"
                    value={p.windowSpec.width}
                    onChange={(e) =>
                      p.setWindowSpec((s) => ({ ...s, width: parseFloat(e.target.value) || 0, label: 'Custom' }))
                    }
                  />
                </div>
                <div>
                  <Label className="text-xs">H</Label>
                  <Input
                    type="number"
                    value={p.windowSpec.height}
                    onChange={(e) =>
                      p.setWindowSpec((s) => ({ ...s, height: parseFloat(e.target.value) || 0, label: 'Custom' }))
                    }
                  />
                </div>
                <div>
                  <Label className="text-xs">Sill</Label>
                  <Input
                    type="number"
                    value={p.windowSpec.sill}
                    onChange={(e) =>
                      p.setWindowSpec((s) => ({ ...s, sill: parseFloat(e.target.value) || 0, label: 'Custom' }))
                    }
                  />
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={goSelect}>
                Cancel
              </Button>
              <Button size="sm" onClick={() => p.setTool('window')}>
                Place windows
              </Button>
            </div>
          </div>
        ) : null}

        {p.sidebarSection === 'door' ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: '3×7', width: 3, height: 7, sill: 0 },
                { label: '3×6′8″', width: 3, height: 6 + 2 / 3, sill: 0 },
                { label: '2×8 × 6′8″', width: 2 + 2 / 3, height: 6 + 2 / 3, sill: 0 },
                { label: '6×7 (dbl)', width: 6, height: 7, sill: 0 },
                { label: '8×8 (oh size)', width: 8, height: 8, sill: 0 },
              ].map((sz) => (
                <button
                  key={sz.label}
                  type="button"
                  className={cn(
                    'rounded border px-2 py-1.5 text-left text-xs hover:bg-slate-50',
                    p.doorSpec.label === sz.label ? 'border-green-600 ring-2 ring-green-200' : 'border-slate-200'
                  )}
                  onClick={() => p.setDoorSpec(sz)}
                >
                  <div className="font-semibold">{sz.label}</div>
                  <div className="text-[10px] text-slate-600">
                    {sz.width.toFixed(2)}×{sz.height.toFixed(2)}′
                  </div>
                </button>
              ))}
            </div>
            <div className="border-t pt-2">
              <div className="mb-1 text-[10px] font-semibold text-slate-700">Custom</div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-xs">W</Label>
                  <Input
                    type="number"
                    value={p.doorSpec.width}
                    onChange={(e) =>
                      p.setDoorSpec((s) => ({ ...s, width: parseFloat(e.target.value) || 0, label: 'Custom' }))
                    }
                  />
                </div>
                <div>
                  <Label className="text-xs">H</Label>
                  <Input
                    type="number"
                    value={p.doorSpec.height}
                    onChange={(e) =>
                      p.setDoorSpec((s) => ({ ...s, height: parseFloat(e.target.value) || 0, label: 'Custom' }))
                    }
                  />
                </div>
                <div>
                  <Label className="text-xs">Sill</Label>
                  <Input
                    type="number"
                    value={p.doorSpec.sill}
                    onChange={(e) =>
                      p.setDoorSpec((s) => ({ ...s, sill: parseFloat(e.target.value) || 0, label: 'Custom' }))
                    }
                  />
                </div>
              </div>
            </div>
            <div className="border-t pt-2 space-y-2">
              <div className="text-[10px] font-semibold text-slate-700">Placement</div>
              <label className="flex items-start gap-2 text-[11px] cursor-pointer">
                <input
                  type="radio"
                  name="doorPlaceSb"
                  className="mt-0.5"
                  checked={p.doorPlacement.mode === 'free'}
                  onChange={() => p.setDoorPlacement((s) => ({ ...s, mode: 'free' }))}
                />
                <span>Free — click or drag along wall</span>
              </label>
              <label className="flex items-start gap-2 text-[11px] cursor-pointer">
                <input
                  type="radio"
                  name="doorPlaceSb"
                  className="mt-0.5"
                  checked={p.doorPlacement.mode === 'measured'}
                  onChange={() => p.setDoorPlacement((s) => ({ ...s, mode: 'measured' }))}
                />
                <span>Measured — inset, count, spacing</span>
              </label>
              {p.doorPlacement.mode === 'measured' ? (
                <div className="space-y-2 pl-1">
                  <div>
                    <Label className="text-xs">Anchor</Label>
                    <select
                      className="mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                      value={p.doorPlacement.anchor}
                      onChange={(e) =>
                        p.setDoorPlacement((s) => ({
                          ...s,
                          anchor: e.target.value === 'from_end' ? 'from_end' : 'from_start',
                        }))
                      }
                    >
                      <option value="from_start">From start</option>
                      <option value="from_end">From end</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <Label className="text-xs">Inset</Label>
                      <Input
                        type="number"
                        min={0}
                        value={p.doorPlacement.insetFromCornerFt}
                        onChange={(e) =>
                          p.setDoorPlacement((s) => ({
                            ...s,
                            insetFromCornerFt: Math.max(0, parseFloat(e.target.value) || 0),
                          }))
                        }
                      />
                    </div>
                    <div>
                      <Label className="text-xs">#</Label>
                      <Input
                        type="number"
                        min={1}
                        max={50}
                        value={p.doorPlacement.count}
                        onChange={(e) =>
                          p.setDoorPlacement((s) => ({
                            ...s,
                            count: Math.min(50, Math.max(1, Math.round(parseFloat(e.target.value) || 1))),
                          }))
                        }
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Gap</Label>
                      <Input
                        type="number"
                        min={0}
                        value={p.doorPlacement.gapBetweenFt}
                        onChange={(e) =>
                          p.setDoorPlacement((s) => ({
                            ...s,
                            gapBetweenFt: Math.max(0, parseFloat(e.target.value) || 0),
                          }))
                        }
                      />
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={goSelect}>
                Cancel
              </Button>
              <Button size="sm" onClick={() => p.setTool('door')}>
                Place on plan
              </Button>
            </div>
          </div>
        ) : null}

        {p.sidebarSection === 'overhead' ? (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-xs">W</Label>
                <Input
                  type="number"
                  value={p.overheadPlaceSpec.width}
                  onChange={(e) =>
                    p.setOverheadPlaceSpec((s) => ({ ...s, width: parseFloat(e.target.value) || 0 }))
                  }
                />
              </div>
              <div>
                <Label className="text-xs">H</Label>
                <Input
                  type="number"
                  value={p.overheadPlaceSpec.height}
                  onChange={(e) =>
                    p.setOverheadPlaceSpec((s) => ({ ...s, height: parseFloat(e.target.value) || 0 }))
                  }
                />
              </div>
              <div>
                <Label className="text-xs">Sill</Label>
                <Input
                  type="number"
                  value={p.overheadPlaceSpec.sill}
                  onChange={(e) =>
                    p.setOverheadPlaceSpec((s) => ({ ...s, sill: parseFloat(e.target.value) || 0 }))
                  }
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">Face color</Label>
              <Input
                value={p.overheadPlaceSpec.style.colorHex}
                onChange={(e) =>
                  p.setOverheadPlaceSpec((s) => ({
                    ...s,
                    style: { ...s.style, colorHex: e.target.value },
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
                  value={p.overheadPlaceSpec.style.panelRows}
                  onChange={(e) =>
                    p.setOverheadPlaceSpec((s) => ({
                      ...s,
                      style: {
                        ...s.style,
                        panelRows: Math.max(1, Math.min(24, Math.round(parseFloat(e.target.value) || 1))),
                      },
                    }))
                  }
                />
              </div>
              <div>
                <Label className="text-xs">Panel cols</Label>
                <Input
                  type="number"
                  min={1}
                  max={24}
                  value={p.overheadPlaceSpec.style.panelCols}
                  onChange={(e) =>
                    p.setOverheadPlaceSpec((s) => ({
                      ...s,
                      style: {
                        ...s.style,
                        panelCols: Math.max(1, Math.min(24, Math.round(parseFloat(e.target.value) || 1))),
                      },
                    }))
                  }
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">Glazed indices</Label>
              <Input
                value={p.overheadWindowIdxText}
                onChange={(e) => p.setOverheadWindowIdxText(e.target.value)}
                placeholder="0, 2, 5"
              />
              <p className="mt-1 text-[10px] text-muted-foreground">Row-major, 0-based.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={goSelect}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  const rows = Math.max(1, Math.min(24, Math.round(p.overheadPlaceSpec.style.panelRows)));
                  const cols = Math.max(1, Math.min(24, Math.round(p.overheadPlaceSpec.style.panelCols)));
                  const maxIdx = rows * cols;
                  const windowPanelIndices = p.overheadWindowIdxText
                    .split(/[\s,]+/)
                    .map((x) => x.trim())
                    .filter(Boolean)
                    .map((x) => parseInt(x, 10))
                    .filter((n) => Number.isFinite(n) && n >= 0 && n < maxIdx)
                    .filter((n, i, a) => a.indexOf(n) === i);
                  p.setOverheadPlaceSpec((s) => ({
                    ...s,
                    style: { ...s.style, panelRows: rows, panelCols: cols, windowPanelIndices },
                  }));
                  p.setTool('overhead');
                }}
              >
                Place on plan
              </Button>
            </div>
          </div>
        ) : null}

        {p.sidebarSection === 'loft' ? (
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Name</Label>
              <Input
                value={p.loftSpec.name}
                onChange={(e) => p.setLoftSpec((s) => ({ ...s, name: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Width</Label>
                <Input
                  type="number"
                  value={p.loftSpec.width}
                  onChange={(e) => p.setLoftSpec((s) => ({ ...s, width: parseFloat(e.target.value) || 0 }))}
                />
              </div>
              <div>
                <Label className="text-xs">Depth</Label>
                <Input
                  type="number"
                  value={p.loftSpec.depth}
                  onChange={(e) => p.setLoftSpec((s) => ({ ...s, depth: parseFloat(e.target.value) || 0 }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Deck h</Label>
                <Input
                  type="number"
                  value={p.loftSpec.elevation}
                  onChange={(e) => p.setLoftSpec((s) => ({ ...s, elevation: parseFloat(e.target.value) || 0 }))}
                />
              </div>
              <div>
                <Label className="text-xs">Clear h</Label>
                <Input
                  type="number"
                  value={p.loftSpec.clearHeight}
                  onChange={(e) => p.setLoftSpec((s) => ({ ...s, clearHeight: parseFloat(e.target.value) || 0 }))}
                />
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Deck height is main to loft floor. Use Wall for posts; Edit loft for stair opening.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={goSelect}>
                Cancel
              </Button>
              <Button size="sm" onClick={() => p.setTool('loft')}>
                Place on plan
              </Button>
            </div>
          </div>
        ) : null}

        {p.sidebarSection === 'stair' ? (
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Tread width (ft)</Label>
              <Input
                type="number"
                value={p.stairSpec.width}
                onChange={(e) => p.setStairSpec((s) => ({ ...s, width: parseFloat(e.target.value) || 0 }))}
              />
            </div>
            <div>
              <Label className="text-xs">Total rise (ft)</Label>
              <Input
                type="number"
                value={p.stairSpec.rise}
                onChange={(e) => p.setStairSpec((s) => ({ ...s, rise: parseFloat(e.target.value) || 0 }))}
              />
            </div>
            <div>
              <Label className="text-xs">Match loft deck</Label>
              <select
                className="mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                value={p.stairSpec.loftId ?? ''}
                onChange={(e) => {
                  const v = e.target.value;
                  const loft = p.plan.lofts.find((l) => l.id === v);
                  p.setStairSpec((s) => ({
                    ...s,
                    loftId: v || null,
                    rise: loft ? loft.elevation : s.rise,
                  }));
                }}
              >
                <option value="">None</option>
                {p.plan.lofts.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name ?? 'Loft'} — {l.elevation}′
                  </option>
                ))}
              </select>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Click bottom of stair, then second point in run direction (horizontal run).
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={goSelect}>
                Cancel
              </Button>
              <Button size="sm" onClick={() => p.setTool('stair')}>
                Place stair
              </Button>
            </div>
          </div>
        ) : null}

        {p.sidebarSection === 'edit_loft' && p.editLoftDraft && p.loftBeingEdited ? (
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Name</Label>
              <Input
                value={p.editLoftDraft.name}
                onChange={(e) => p.setEditLoftDraft((d) => (d ? { ...d, name: e.target.value } : d))}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Width</Label>
                <Input
                  type="number"
                  value={p.editLoftDraft.width}
                  onChange={(e) =>
                    p.setEditLoftDraft((d) => (d ? { ...d, width: parseFloat(e.target.value) || 0 } : d))
                  }
                />
              </div>
              <div>
                <Label className="text-xs">Depth</Label>
                <Input
                  type="number"
                  value={p.editLoftDraft.depth}
                  onChange={(e) =>
                    p.setEditLoftDraft((d) => (d ? { ...d, depth: parseFloat(e.target.value) || 0 } : d))
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Deck h</Label>
                <Input
                  type="number"
                  value={p.editLoftDraft.elevation}
                  onChange={(e) =>
                    p.setEditLoftDraft((d) => (d ? { ...d, elevation: parseFloat(e.target.value) || 0 } : d))
                  }
                />
              </div>
              <div>
                <Label className="text-xs">Clear h</Label>
                <Input
                  type="number"
                  value={p.editLoftDraft.clearHeight}
                  onChange={(e) =>
                    p.setEditLoftDraft((d) => (d ? { ...d, clearHeight: parseFloat(e.target.value) || 0 } : d))
                  }
                />
              </div>
            </div>
            <div className="border-t pt-2 space-y-2">
              <div className="text-[10px] font-semibold text-slate-700">Stair opening</div>
              <div className="flex flex-wrap gap-1">
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
                    className="h-7 text-[10px]"
                    onClick={() =>
                      p.setEditLoftDraft((d) => {
                        if (!d) return d;
                        const lw = Math.max(1, d.width);
                        const ld = Math.max(1, d.depth);
                        return {
                          ...d,
                          holeEnabled: true,
                          holeW: preset.w,
                          holeD: preset.d,
                          holeX: Math.max(0, (lw - preset.w) / 2),
                          holeY: Math.max(0, (ld - preset.d) / 2),
                        };
                      })
                    }
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={p.editLoftDraft.holeEnabled}
                  onChange={(e) =>
                    p.setEditLoftDraft((d) => (d ? { ...d, holeEnabled: e.target.checked } : d))
                  }
                />
                Show opening
              </label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">X</Label>
                  <Input
                    type="number"
                    value={p.editLoftDraft.holeX}
                    onChange={(e) =>
                      p.setEditLoftDraft((d) => (d ? { ...d, holeX: parseFloat(e.target.value) || 0 } : d))
                    }
                  />
                </div>
                <div>
                  <Label className="text-xs">Y</Label>
                  <Input
                    type="number"
                    value={p.editLoftDraft.holeY}
                    onChange={(e) =>
                      p.setEditLoftDraft((d) => (d ? { ...d, holeY: parseFloat(e.target.value) || 0 } : d))
                    }
                  />
                </div>
                <div>
                  <Label className="text-xs">Open W</Label>
                  <Input
                    type="number"
                    value={p.editLoftDraft.holeW}
                    onChange={(e) =>
                      p.setEditLoftDraft((d) => (d ? { ...d, holeW: parseFloat(e.target.value) || 0 } : d))
                    }
                  />
                </div>
                <div>
                  <Label className="text-xs">Open L</Label>
                  <Input
                    type="number"
                    value={p.editLoftDraft.holeD}
                    onChange={(e) =>
                      p.setEditLoftDraft((d) => (d ? { ...d, holeD: parseFloat(e.target.value) || 0 } : d))
                    }
                  />
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  p.setEditLoftTargetId(null);
                  p.setEditLoftDraft(null);
                  p.setSidebarSection('loft');
                }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  if (!p.editLoftDraft || !p.loftBeingEdited) return;
                  const w = Math.max(1, p.editLoftDraft.width);
                  const d = Math.max(1, p.editLoftDraft.depth);
                  let stairOpening: PlanLoftStairOpening | null = null;
                  if (p.editLoftDraft.holeEnabled) {
                    const hw = Math.max(0.5, p.editLoftDraft.holeW);
                    const hd = Math.max(0.5, p.editLoftDraft.holeD);
                    const x = clamp(p.editLoftDraft.holeX, 0, Math.max(0, w - hw));
                    const y = clamp(p.editLoftDraft.holeY, 0, Math.max(0, d - hd));
                    stairOpening = { x, y, width: hw, depth: hd };
                  }
                  p.onChange(
                    applyOp(p.plan, {
                      type: 'upsert_loft',
                      loft: {
                        ...p.loftBeingEdited,
                        name: p.editLoftDraft.name,
                        width: w,
                        depth: d,
                        elevation: p.editLoftDraft.elevation,
                        clearHeight: p.editLoftDraft.clearHeight,
                        stairOpening,
                      },
                    })
                  );
                  p.setEditLoftTargetId(null);
                  p.setEditLoftDraft(null);
                  p.setSidebarSection('select');
                  p.setTool('select');
                }}
              >
                Save
              </Button>
            </div>
          </div>
        ) : null}

        {p.sidebarSection === 'edit_loft' && p.editLoftTargetId && !p.loftBeingEdited ? (
          <p className="text-xs text-slate-500">This loft is no longer in the plan. Pick another loft.</p>
        ) : null}
      </div>
      )}

      {p.selectedId ? (
        <div className="border-t border-slate-200 p-2">
          <Button
            variant="destructive"
            size="sm"
            className="w-full"
            disabled={!p.canDelete}
            onClick={p.deleteSelected}
          >
            Delete selected
          </Button>
        </div>
      ) : null}
    </aside>
  );
}
