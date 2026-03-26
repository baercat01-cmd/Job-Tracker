import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type {
  BuildingPlanModel,
  PlanEntityId,
  PlanLoft,
  PlanOpening,
  PlanOverheadStyle,
  PlanPoint,
  PlanRoom,
  PlanStair,
  PlanWall,
} from '@/lib/buildingPlanModel';
import {
  clamp,
  DEFAULT_OVERHEAD_STYLE,
  newId,
  normalizeRoomLevel,
  roomMatchesFloor,
  type PlanRoomLevel,
} from '@/lib/buildingPlanModel';
import type { PlanOp } from '@/lib/planOps';
import {
  computePerimeterPostSlotsFromPlan,
  perimeterSlotToPlanPoint,
  POST_Tp,
} from '@/lib/perimeterPostLayout';

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
type Orientation = 'widthX' | 'lengthX';
type DroppableItem = 'window' | 'door' | 'overhead';

export type DoorWallAnchor = 'from_start' | 'from_end';

/** Door placement: free click along wall, or measured inset from wall end/start with optional multiples. */
export interface DoorPlacementOptions {
  mode: 'free' | 'measured';
  anchor: DoorWallAnchor;
  /** Distance from anchor corner to the nearest door edge along the wall (ft). */
  insetFromCornerFt: number;
  /** Number of doors (measured mode). */
  count: number;
  /** Clear space between adjacent doors along the wall (ft). */
  gapBetweenFt: number;
}

export type PlanActiveRoomFloor =
  | { kind: 'main' }
  | { kind: 'loft_deck'; loftId: PlanEntityId }
  | { kind: 'loft_upper'; loftId: PlanEntityId };

export type PlanRoomPlacementSpec = {
  name?: string;
  width: number;
  depth: number;
  wallThickness: number;
  /** Only used when active floor is loft_upper (ft above loft deck). */
  loftUpperFloorOffsetFt: number;
  wallTopMode: 'to_ceiling' | 'custom';
  customWallHeightFt: number;
};

export function Plan2DEditor(props: {
  plan: BuildingPlanModel;
  canEdit: boolean;
  mode: ToolMode;
  roomSpec?: PlanRoomPlacementSpec | null;
  /** Which floor you are placing/selecting rooms on. */
  activeRoomFloor?: PlanActiveRoomFloor;
  loftSpec?: { name?: string; width: number; depth: number; elevation: number; clearHeight: number } | null;
  stairSpec?: { width: number; rise: number; loftId?: string | null } | null;
  /** When mode is loft_stair_hole: loft id to cut (must be selected in parent). */
  loftStairHoleTargetId?: PlanEntityId | null;
  openingSpec?: { width: number; height: number; sill: number } | null;
  /** When mode is `overhead`: width, height, sill, and sectional-door style. */
  overheadSpec?: { width: number; height: number; sill: number; style: PlanOverheadStyle } | null;
  /** Door size for door mode and for drag-and-drop when not in door mode (optional; falls back to openingSpec when mode is door). */
  doorOpeningSpec?: { width: number; height: number; sill: number } | null;
  /** When mode is `door`: free click vs measured spacing from wall end/start. Also applies to door drag-and-drop from the palette. */
  doorPlacementOptions?: DoorPlacementOptions | null;
  orientation?: Orientation;
  onCancelPlacement?: () => void;
  onOp: (op: PlanOp) => void;
  selectedId: PlanEntityId | null;
  onSelect: (id: PlanEntityId | null) => void;
}) {
  const {
    plan,
    canEdit,
    mode,
    roomSpec,
    activeRoomFloor: activeRoomFloorProp,
    loftSpec,
    stairSpec,
    loftStairHoleTargetId = null,
    openingSpec,
    overheadSpec,
    doorOpeningSpec = null,
    doorPlacementOptions = null,
    orientation = 'widthX',
    onCancelPlacement,
    onOp,
    selectedId,
    onSelect,
  } = props;

  const activeRoomFloor: PlanActiveRoomFloor = activeRoomFloorProp ?? { kind: 'main' };

  function resolveDoorDimensions(): { width: number; height: number; sill: number } {
    return doorOpeningSpec ?? (mode === 'door' ? openingSpec ?? null : null) ?? { width: 3, height: 7, sill: 0 };
  }

  const wrapRef = useRef<HTMLDivElement>(null);
  const lastPointerPlanRef = useRef<PlanPoint | null>(null);
  const [pan, setPan] = useState({ x: 40, y: 40 });
  const [zoom, setZoom] = useState(10); // px per ft
  const [wallDraft, setWallDraft] = useState<PlanPoint | null>(null);
  const [panning, setPanning] = useState<{ startX: number; startY: number; panX: number; panY: number } | null>(null);
  const [roomGhostOrigin, setRoomGhostOrigin] = useState<PlanPoint | null>(null);
  const [loftGhostOrigin, setLoftGhostOrigin] = useState<PlanPoint | null>(null);
  const [stairDraftFoot, setStairDraftFoot] = useState<PlanPoint | null>(null);
  const [loftStairHoleCorner, setLoftStairHoleCorner] = useState<PlanPoint | null>(null);
  const [loftStairHoleHover, setLoftStairHoleHover] = useState<PlanPoint | null>(null);
  const [openingGhost, setOpeningGhost] = useState<{ a: PlanPoint; b: PlanPoint; kind: DroppableItem } | null>(null);
  const [draggingRoom, setDraggingRoom] = useState<{
    roomId: PlanEntityId;
    startPlan: PlanPoint;
    startOrigin: PlanPoint;
    currentOrigin: PlanPoint;
  } | null>(null);
  const [draggingStairOpening, setDraggingStairOpening] = useState<{
    loftId: PlanEntityId;
    startPlan: PlanPoint;
    openingW: number;
    openingD: number;
    originX: number;
    originY: number;
    curX: number;
    curY: number;
  } | null>(null);
  const skipSelectAfterStairDragRef = useRef(false);
  const skipNextSelectClickRef = useRef(false);

  const [draggingOpening, setDraggingOpening] = useState<{
    openingId: PlanEntityId;
    wall: PlanWall;
    openingWidth: number;
    startAlong: number;
    startOffset: number;
    previewOffset: number;
  } | null>(null);

  useEffect(() => {
    // Clear the room ghost when leaving room mode or when roomSpec changes.
    if (mode !== 'room') {
      setRoomGhostOrigin(null);
    }
  }, [mode, roomSpec?.width, roomSpec?.depth, roomSpec?.wallThickness, activeRoomFloor]);

  useEffect(() => {
    if (mode !== 'loft') setLoftGhostOrigin(null);
  }, [mode, loftSpec?.width, loftSpec?.depth, loftSpec?.elevation, loftSpec?.clearHeight]);

  useEffect(() => {
    if (mode !== 'stair') setStairDraftFoot(null);
  }, [mode, stairSpec?.width, stairSpec?.rise]);

  useEffect(() => {
    if (mode !== 'loft_stair_hole' || !loftStairHoleTargetId) {
      setLoftStairHoleCorner(null);
      setLoftStairHoleHover(null);
    }
  }, [mode, loftStairHoleTargetId]);

  useEffect(() => {
    if (mode !== 'select') setDraggingStairOpening(null);
  }, [mode]);

  useEffect(() => {
    // Clear opening ghost when leaving opening modes.
    if (mode !== 'window' && mode !== 'door' && mode !== 'overhead') {
      setOpeningGhost(null);
    }
  }, [
    mode,
    openingSpec?.width,
    openingSpec?.height,
    openingSpec?.sill,
    doorOpeningSpec?.width,
    doorOpeningSpec?.height,
    doorOpeningSpec?.sill,
    overheadSpec?.width,
    overheadSpec?.height,
    doorPlacementOptions?.mode,
  ]);

  useEffect(() => {
    // When entering window/door/overhead mode, render the ghost immediately from the last known cursor position.
    if (mode !== 'window' && mode !== 'door' && mode !== 'overhead') return;
    if (mode === 'door' && doorPlacementOptions?.mode === 'measured') {
      setOpeningGhost(null);
      return;
    }
    const p = lastPointerPlanRef.current;
    if (!p) return;
    const kind: DroppableItem = mode === 'door' ? 'door' : mode === 'overhead' ? 'overhead' : 'window';
    const wall = findWallNearPoint(p);
    if (!wall) return;
    const spec =
      kind === 'overhead'
        ? overheadSpec ?? { width: 16, height: 14, sill: 0, style: DEFAULT_OVERHEAD_STYLE }
        : kind === 'door'
          ? resolveDoorDimensions()
          : openingSpec ?? { width: 4, height: 3, sill: 3 };
    // Preview follows cursor; snapping happens on click/drop.
    const center = closestPointOnSegment(p, wall.start, wall.end);
    const { ux, uy } = segmentUnit(wall.start, wall.end);
    const half = spec.width / 2;
    const a = { x: center.x - ux * half, y: center.y - uy * half };
    const b = { x: center.x + ux * half, y: center.y + uy * half };
    setOpeningGhost({ a, b, kind });
  }, [
    mode,
    doorPlacementOptions?.mode,
    openingSpec?.width,
    openingSpec?.height,
    openingSpec?.sill,
    overheadSpec?.width,
    overheadSpec?.height,
  ]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (draggingRoom) return; // let pointer-up commit; user can drop outside to cancel later if desired
      if (wallDraft) {
        setWallDraft(null);
        return;
      }
      if (mode === 'room') {
        setRoomGhostOrigin(null);
        onCancelPlacement?.();
      }
      if (mode === 'loft') {
        setLoftGhostOrigin(null);
        onCancelPlacement?.();
      }
      if (mode === 'wall') {
        onCancelPlacement?.();
      }
      if (mode === 'stair') {
        setStairDraftFoot(null);
        onCancelPlacement?.();
      }
      if (mode === 'loft_stair_hole') {
        setLoftStairHoleCorner(null);
        setLoftStairHoleHover(null);
        onCancelPlacement?.();
      }
      if (mode === 'window' || mode === 'door' || mode === 'overhead') {
        setOpeningGhost(null);
        onCancelPlacement?.();
      }
      if (draggingOpening) {
        setDraggingOpening(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [draggingOpening, draggingRoom, draggingStairOpening, mode, onCancelPlacement, wallDraft]);

  const bounds = useMemo(() => {
    const w = orientation === 'lengthX' ? plan.dims.length : plan.dims.width;
    const l = orientation === 'lengthX' ? plan.dims.width : plan.dims.length;
    return { w, l };
  }, [plan.dims.width, plan.dims.length, orientation]);

  const perimeterPostSlots = useMemo(() => computePerimeterPostSlotsFromPlan(plan), [plan]);

  const planToView = useMemo(() => {
    if (orientation === 'lengthX') {
      return (p: PlanPoint): PlanPoint => ({ x: p.y, y: p.x });
    }
    return (p: PlanPoint): PlanPoint => p;
  }, [orientation]);

  const viewToPlan = useMemo(() => {
    if (orientation === 'lengthX') {
      return (p: PlanPoint): PlanPoint => ({ x: p.y, y: p.x });
    }
    return (p: PlanPoint): PlanPoint => p;
  }, [orientation]);

  function screenToPlan(evt: React.PointerEvent): PlanPoint | null {
    const el = wrapRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const sx = evt.clientX - r.left;
    const sy = evt.clientY - r.top;
    const vx = (sx - pan.x) / zoom;
    const vy = (sy - pan.y) / zoom;
    return viewToPlan({ x: vx, y: vy });
  }

  function clientToPlan(clientX: number, clientY: number): PlanPoint | null {
    const el = wrapRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const sx = clientX - r.left;
    const sy = clientY - r.top;
    const vx = (sx - pan.x) / zoom;
    const vy = (sy - pan.y) / zoom;
    return viewToPlan({ x: vx, y: vy });
  }

  function placeOpeningAt(p: PlanPoint, kind: DroppableItem) {
    const wall = findWallNearPoint(p);
    if (!wall) return;
    const wallLen = hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y) || 1;
    const centerOffset = projectOffsetAlongWall(p, wall.start, wall.end);

    if (kind === 'overhead') {
      const oh = overheadSpec ?? { width: 16, height: 14, sill: 0, style: { ...DEFAULT_OVERHEAD_STYLE } };
      const snappedCenter = snapOpeningCenterOffset({
        centerOffset,
        wallLen,
        openingWidth: oh.width,
        postSpacing: 8,
        postSize: POST_Tp,
      });
      const offset = clamp(snappedCenter - oh.width / 2, 0, Math.max(0, wallLen - oh.width));
      onOp({
        type: 'upsert_opening',
        opening: {
          id: newId('oh'),
          type: 'overhead_door',
          wallId: wall.id,
          offset,
          width: oh.width,
          sill: oh.sill,
          height: oh.height,
          overheadStyle: { ...DEFAULT_OVERHEAD_STYLE, ...oh.style },
        },
      });
      return;
    }

    if (kind === 'door' && doorPlacementOptions?.mode === 'measured') {
      const spec = resolveDoorDimensions();
      const opt = doorPlacementOptions;
      const offsets = computeMeasuredDoorOffsets(
        wallLen,
        spec.width,
        opt.count,
        Math.max(0, opt.insetFromCornerFt),
        Math.max(0, opt.gapBetweenFt),
        opt.anchor
      );
      const openings: PlanOpening[] = offsets.map((offset) => ({
        id: newId('door'),
        type: 'door',
        wallId: wall.id,
        offset,
        width: spec.width,
        sill: spec.sill,
        height: spec.height,
      }));
      onOp({ type: 'upsert_openings_batch', openings });
      return;
    }

    const spec = kind === 'door' ? resolveDoorDimensions() : openingSpec ?? { width: 4, height: 3, sill: 3 };
    const snappedCenter = snapOpeningCenterOffset({
      centerOffset,
      wallLen,
      openingWidth: spec.width,
      postSpacing: 8,
      postSize: POST_Tp,
    });
    const offset = clamp(snappedCenter - spec.width / 2, 0, Math.max(0, wallLen - spec.width));
    onOp({
      type: 'upsert_opening',
      opening: {
        id: newId(kind),
        type: kind === 'door' ? 'door' : 'window',
        wallId: wall.id,
        offset,
        width: spec.width,
        sill: spec.sill,
        height: spec.height,
      },
    });
  }

  function snap(p: PlanPoint): PlanPoint {
    const grid = 1; // 1ft snap (in view-space so rotation behaves intuitively)
    const vp = planToView(p);
    const snappedView = {
      x: Math.round(vp.x / grid) * grid,
      y: Math.round(vp.y / grid) * grid,
    };
    const clampedView = {
      x: clamp(snappedView.x, -50, bounds.w + 50),
      y: clamp(snappedView.y, -50, bounds.l + 50),
    };
    return viewToPlan(clampedView);
  }

  function snapRoomOrigin(origin: PlanPoint, spec: { width: number; depth: number }): PlanPoint {
    const snapFt = 0.5;
    const w = plan.dims.width;
    const l = plan.dims.length;

    let ox = origin.x;
    let oy = origin.y;

    // Snap to building perimeter (inside edges).
    if (activeRoomFloor.kind === 'main') {
      if (Math.abs(ox - 0) <= snapFt) ox = 0;
      if (Math.abs(oy - 0) <= snapFt) oy = 0;
      if (Math.abs((ox + spec.width) - w) <= snapFt) ox = w - spec.width;
      if (Math.abs((oy + spec.depth) - l) <= snapFt) oy = l - spec.depth;
    }

    // Snap to other rooms on the same floor.
    const left = ox;
    const right = ox + spec.width;
    const top = oy;
    const bottom = oy + spec.depth;

    let bestDx = 0;
    let bestDxAbs = Infinity;
    let bestDy = 0;
    let bestDyAbs = Infinity;

    for (const r of plan.rooms) {
      if (!roomMatchesFloor(r, activeRoomFloor)) continue;
      // Ignore self while dragging.
      if (draggingRoom && r.id === draggingRoom.roomId) continue;
      const rLeft = r.origin.x;
      const rRight = r.origin.x + r.width;
      const rTop = r.origin.y;
      const rBottom = r.origin.y + r.depth;

      const candidatesX = [
        rLeft - left,
        rLeft - right,
        rRight - left,
        rRight - right,
      ];
      for (const dx of candidatesX) {
        const adx = Math.abs(dx);
        if (adx <= snapFt && adx < bestDxAbs) {
          bestDxAbs = adx;
          bestDx = dx;
        }
      }

      const candidatesY = [
        rTop - top,
        rTop - bottom,
        rBottom - top,
        rBottom - bottom,
      ];
      for (const dy of candidatesY) {
        const ady = Math.abs(dy);
        if (ady <= snapFt && ady < bestDyAbs) {
          bestDyAbs = ady;
          bestDy = dy;
        }
      }
    }

    ox += bestDxAbs !== Infinity ? bestDx : 0;
    oy += bestDyAbs !== Infinity ? bestDy : 0;

    // Clamp inside building.
    ox = clamp(ox, 0, Math.max(0, w - spec.width));
    oy = clamp(oy, 0, Math.max(0, l - spec.depth));

    return snap({ x: ox, y: oy });
  }

  function snapLoftOrigin(origin: PlanPoint, spec: { width: number; depth: number }): PlanPoint {
    return snapRoomOrigin(origin, spec);
  }

  function computeMeasuredDoorOffsets(
    wallLen: number,
    doorWidth: number,
    count: number,
    inset: number,
    gap: number,
    anchor: DoorWallAnchor
  ): number[] {
    const w = doorWidth;
    const n = Math.max(1, Math.min(50, Math.round(count)));
    const maxOff = Math.max(0, wallLen - w);
    if (n === 1) {
      if (anchor === 'from_start') return [clamp(inset, 0, maxOff)];
      return [clamp(wallLen - inset - w, 0, maxOff)];
    }
    const raw: number[] = [];
    if (anchor === 'from_start') {
      for (let i = 0; i < n; i++) raw.push(inset + i * (w + gap));
    } else {
      const rightLeft = wallLen - inset - w;
      for (let i = n - 1; i >= 0; i--) raw.push(rightLeft - (n - 1 - i) * (w + gap));
    }
    return raw.map((o) => clamp(o, 0, maxOff));
  }

  function findWallNearPoint(p: PlanPoint): PlanWall | null {
    // MVP: pick closest perimeter wall for rectangular plans.
    // If walls get more complex later, we'll do proper distance-to-segment checks.
    let best: { wall: PlanWall; score: number } | null = null;
    for (const wall of plan.walls) {
      const score = distToSegment(p, wall.start, wall.end);
      if (!best || score < best.score) best = { wall, score };
    }
    // Door/window placement needs a forgiving "hit area" so users can click near a wall.
    return best && best.score <= 3.5 ? best.wall : null;
  }

  function handlePointerDown(evt: React.PointerEvent) {
    // Right/middle drag pans (works for viewers too).
    if (evt.button === 1 || evt.button === 2) {
      evt.preventDefault();
      setPanning({ startX: evt.clientX, startY: evt.clientY, panX: pan.x, panY: pan.y });
      return;
    }
    if (!canEdit) return;
    const raw = screenToPlan(evt);
    if (!raw) return;
    const p = snap(raw);

    // Drag wall opening, then room, in select mode.
    if (mode === 'select') {
      const openHit = hitTestNearestOpeningOnWall(p, plan, 1.35);
      if (openHit) {
        evt.preventDefault();
        onSelect(openHit.opening.id);
        const along0 = projectOffsetAlongWall(p, openHit.wall.start, openHit.wall.end);
        setDraggingOpening({
          openingId: openHit.opening.id,
          wall: openHit.wall,
          openingWidth: openHit.opening.width,
          startAlong: along0,
          startOffset: openHit.opening.offset,
          previewOffset: openHit.opening.offset,
        });
        return;
      }
      const sameFloorRooms = plan.rooms.filter((r) => roomMatchesFloor(r, activeRoomFloor));
      const hit = hitTestRoom(p, sameFloorRooms);
      if (hit) {
        evt.preventDefault();
        onSelect(hit.id);
        setDraggingRoom({
          roomId: hit.id,
          startPlan: p,
          startOrigin: hit.origin,
          currentOrigin: hit.origin,
        });
        return;
      }
    }

    if (mode === 'wall') {
      if (!wallDraft) {
        setWallDraft(p);
        return;
      }
      const wall: PlanWall = { id: newId('wall'), start: wallDraft, end: p, thickness: 0.5 / 12 };
      setWallDraft(null);
      onOp({ type: 'upsert_wall', wall });
      return;
    }

    if (mode === 'window' || mode === 'door' || mode === 'overhead') {
      // Use raw cursor position for intuitive placement (no grid snap).
      placeOpeningAt(
        raw,
        mode === 'door' ? 'door' : mode === 'overhead' ? 'overhead' : 'window'
      );
      return;
    }

    if (mode === 'outlet' || mode === 'drain') {
      onOp({
        type: 'upsert_fixture',
        fixture: {
          id: newId('fx'),
          type: mode === 'outlet' ? 'outlet' : 'drain',
          position: p,
        },
      });
      return;
    }

    if (mode === 'room') {
      if (!roomSpec) return;
      if (activeRoomFloor.kind !== 'main' && !plan.lofts.some((lf) => lf.id === activeRoomFloor.loftId)) {
        return;
      }
      const origin = snapRoomOrigin(p, { width: roomSpec.width, depth: roomSpec.depth });
      const level: PlanRoomLevel =
        activeRoomFloor.kind === 'main'
          ? 'main'
          : activeRoomFloor.kind === 'loft_deck'
            ? 'loft_deck'
            : 'loft_upper';
      const loftId = activeRoomFloor.kind === 'main' ? null : activeRoomFloor.loftId;
      const room: PlanRoom = {
        id: newId('room'),
        name: roomSpec.name,
        origin,
        width: roomSpec.width,
        depth: roomSpec.depth,
        wallThickness: roomSpec.wallThickness,
        level,
        loftId,
        loftUpperFloorOffsetFt: level === 'loft_upper' ? Math.max(0, roomSpec.loftUpperFloorOffsetFt) : undefined,
        wallTopMode: roomSpec.wallTopMode,
        customWallHeightFt:
          roomSpec.wallTopMode === 'custom' ? Math.max(0.5, roomSpec.customWallHeightFt) : undefined,
      };
      onOp({ type: 'upsert_room', room });
      return;
    }

    if (mode === 'loft') {
      if (!loftSpec) return;
      const origin = snapLoftOrigin(p, { width: loftSpec.width, depth: loftSpec.depth });
      onOp({
        type: 'upsert_loft',
        loft: {
          id: newId('loft'),
          name: loftSpec.name ?? 'Loft',
          origin,
          width: loftSpec.width,
          depth: loftSpec.depth,
          elevation: loftSpec.elevation,
          clearHeight: loftSpec.clearHeight,
          stairOpening: null,
        },
      });
      return;
    }

    if (mode === 'stair') {
      if (!stairSpec) return;
      if (!stairDraftFoot) {
        setStairDraftFoot(p);
        return;
      }
      const dx = p.x - stairDraftFoot.x;
      const dy = p.y - stairDraftFoot.y;
      let run = hypot(dx, dy);
      if (run < 2) run = 2;
      const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
      const stair: PlanStair = {
        id: newId('stair'),
        foot: { ...stairDraftFoot },
        width: stairSpec.width,
        run,
        rise: stairSpec.rise,
        angleDeg,
        loftId: stairSpec.loftId ?? null,
      };
      setStairDraftFoot(null);
      onOp({ type: 'upsert_stair', stair });
      return;
    }

    if (mode === 'loft_stair_hole') {
      if (!loftStairHoleTargetId) return;
      const loft = plan.lofts.find((l) => l.id === loftStairHoleTargetId);
      if (!loft) return;
      const pIn = clampPointInsideLoft(raw, loft);
      if (!loftStairHoleCorner) {
        setLoftStairHoleCorner(pIn);
        setLoftStairHoleHover(pIn);
        return;
      }
      const rect = stairOpeningRectFromDrag(
        loftStairHoleCorner.x,
        loftStairHoleCorner.y,
        pIn.x,
        pIn.y,
        loft
      );
      setLoftStairHoleCorner(null);
      setLoftStairHoleHover(null);
      if (!rect) return;
      onOp({
        type: 'upsert_loft',
        loft: {
          ...loft,
          stairOpening: { x: rect.x, y: rect.y, width: rect.width, depth: rect.depth },
        },
      });
      onCancelPlacement?.();
      return;
    }
  }

  function handleWheel(evt: React.WheelEvent) {
    evt.preventDefault();
    const delta = evt.deltaY;
    setZoom((z) => clamp(z * (delta > 0 ? 0.9 : 1.1), 4, 40));
  }

  function handlePointerMove(evt: React.PointerEvent) {
    if (!panning) return;
    const dx = evt.clientX - panning.startX;
    const dy = evt.clientY - panning.startY;
    setPan({ x: panning.panX + dx, y: panning.panY + dy });
  }

  function handlePointerUp() {
    if (panning) setPanning(null);
    if (draggingOpening) {
      const o = plan.openings.find((x) => x.id === draggingOpening.openingId);
      if (o) {
        const nextOff = clamp(
          draggingOpening.previewOffset,
          0,
          Math.max(0, hypot(draggingOpening.wall.end.x - draggingOpening.wall.start.x, draggingOpening.wall.end.y - draggingOpening.wall.start.y) - o.width)
        );
        if (Math.abs(nextOff - o.offset) > 0.001) {
          skipNextSelectClickRef.current = true;
          onOp({ type: 'upsert_opening', opening: { ...o, offset: nextOff } });
        }
      }
      setDraggingOpening(null);
      return;
    }
    if (draggingStairOpening) {
      const loft = plan.lofts.find((l) => l.id === draggingStairOpening.loftId);
      if (loft?.stairOpening) {
        skipSelectAfterStairDragRef.current = true;
        onOp({
          type: 'upsert_loft',
          loft: {
            ...loft,
            stairOpening: {
              ...loft.stairOpening,
              x: draggingStairOpening.curX,
              y: draggingStairOpening.curY,
            },
          },
        });
      }
      setDraggingStairOpening(null);
      return;
    }
    if (draggingRoom) {
      const r = plan.rooms.find((rr) => rr.id === draggingRoom.roomId);
      if (r) {
        onOp({ type: 'upsert_room', room: { ...r, origin: draggingRoom.currentOrigin } });
      }
      setDraggingRoom(null);
    }
  }

  function handlePointerMoveForEdits(evt: React.PointerEvent) {
    const raw = screenToPlan(evt);
    if (!raw) return;
    lastPointerPlanRef.current = raw;
    const p = snap(raw);

    if (draggingRoom) {
      const dx = p.x - draggingRoom.startPlan.x;
      const dy = p.y - draggingRoom.startPlan.y;
      const r = plan.rooms.find((rr) => rr.id === draggingRoom.roomId);
      if (!r) return;
      const nextOrigin = snapRoomOrigin({ x: draggingRoom.startOrigin.x + dx, y: draggingRoom.startOrigin.y + dy }, { width: r.width, depth: r.depth });
      setDraggingRoom((prev) => (prev ? { ...prev, currentOrigin: nextOrigin } : prev));
      return;
    }

    if (draggingOpening) {
      const wallLen = hypot(draggingOpening.wall.end.x - draggingOpening.wall.start.x, draggingOpening.wall.end.y - draggingOpening.wall.start.y) || 1;
      const along = projectOffsetAlongWall(raw, draggingOpening.wall.start, draggingOpening.wall.end);
      const delta = along - draggingOpening.startAlong;
      const maxOff = Math.max(0, wallLen - draggingOpening.openingWidth);
      const previewOffset = clamp(draggingOpening.startOffset + delta, 0, maxOff);
      setDraggingOpening((prev) => (prev ? { ...prev, previewOffset } : prev));
      return;
    }

    if (draggingStairOpening) {
      const dx = p.x - draggingStairOpening.startPlan.x;
      const dy = p.y - draggingStairOpening.startPlan.y;
      const loft = plan.lofts.find((l) => l.id === draggingStairOpening.loftId);
      if (!loft) return;
      const { openingW: ow, openingD: od, originX, originY } = draggingStairOpening;
      const nx = clamp(originX + dx, 0, Math.max(0, loft.width - ow));
      const ny = clamp(originY + dy, 0, Math.max(0, loft.depth - od));
      setDraggingStairOpening((prev) => (prev ? { ...prev, curX: nx, curY: ny } : prev));
      return;
    }

    if (mode === 'room' && roomSpec) {
      const origin = snapRoomOrigin(p, { width: roomSpec.width, depth: roomSpec.depth });
      setRoomGhostOrigin(origin);
    } else {
      if (roomGhostOrigin) setRoomGhostOrigin(null);
    }

    if (mode === 'loft' && loftSpec) {
      const origin = snapLoftOrigin(p, { width: loftSpec.width, depth: loftSpec.depth });
      setLoftGhostOrigin(origin);
    } else if (loftGhostOrigin) {
      setLoftGhostOrigin(null);
    }

    if ((mode === 'window' || mode === 'door' || mode === 'overhead') && canEdit) {
      if (mode === 'door' && doorPlacementOptions?.mode === 'measured') {
        if (openingGhost) setOpeningGhost(null);
      } else {
      const kind: DroppableItem = mode === 'door' ? 'door' : mode === 'overhead' ? 'overhead' : 'window';
      // Use raw pointer position so the ghost tracks the cursor smoothly.
      const wall = findWallNearPoint(raw);
      if (!wall) {
        if (openingGhost) setOpeningGhost(null);
        return;
      }
      const spec =
        kind === 'overhead'
          ? overheadSpec ?? { width: 16, height: 14, sill: 0, style: DEFAULT_OVERHEAD_STYLE }
          : kind === 'door'
            ? resolveDoorDimensions()
            : openingSpec ?? { width: 4, height: 3, sill: 3 };
      const center = closestPointOnSegment(raw, wall.start, wall.end);
      const { ux, uy } = segmentUnit(wall.start, wall.end);
      const half = spec.width / 2;
      const a = { x: center.x - ux * half, y: center.y - uy * half };
      const b = { x: center.x + ux * half, y: center.y + uy * half };
      setOpeningGhost({ a, b, kind });
      }
    } else {
      if (openingGhost) setOpeningGhost(null);
    }

    if (mode === 'loft_stair_hole' && loftStairHoleTargetId && loftStairHoleCorner && canEdit) {
      const loft = plan.lofts.find((l) => l.id === loftStairHoleTargetId);
      if (!loft) {
        setLoftStairHoleHover(null);
        return;
      }
      setLoftStairHoleHover(clampPointInsideLoft(raw, loft));
      return;
    }
    if (loftStairHoleHover) setLoftStairHoleHover(null);
  }

  // Selection: rooms/lofts by footprint (any click inside), then walls/openings/fixtures/stairs by proximity.
  function handleClickSelect(evt: React.MouseEvent) {
    if (mode !== 'select') return;
    if (skipNextSelectClickRef.current) {
      skipNextSelectClickRef.current = false;
      return;
    }
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const sx = evt.clientX - r.left;
    const sy = evt.clientY - r.top;
    const vp: PlanPoint = { x: (sx - pan.x) / zoom, y: (sy - pan.y) / zoom };
    const p: PlanPoint = viewToPlan(vp);

    const sameFloorRooms = plan.rooms.filter((rm) => roomMatchesFloor(rm, activeRoomFloor));
    const roomHit = hitTestRoom(p, sameFloorRooms);
    if (roomHit) {
      onSelect(roomHit.id);
      return;
    }

    const stairOpeningLoft = hitTestLoftStairOpening(p, plan.lofts);
    if (stairOpeningLoft) {
      onSelect(stairOpeningLoft.id);
      return;
    }

    const loftHit = hitTestLoft(p, plan.lofts);
    if (loftHit) {
      onSelect(loftHit.id);
      return;
    }

    let best: { id: string; score: number } | null = null;
    for (const w of plan.walls) {
      const score = distToSegment(p, w.start, w.end);
      if (!best || score < best.score) best = { id: w.id, score };
    }
    for (const o of plan.openings) {
      const w = plan.walls.find((ww) => ww.id === o.wallId);
      if (!w) continue;
      const c = pointAlongWall(w.start, w.end, o.offset + o.width / 2);
      const score = hypot(p.x - c.x, p.y - c.y);
      if (!best || score < best.score) best = { id: o.id, score };
    }
    for (const f of plan.fixtures) {
      const score = hypot(p.x - f.position.x, p.y - f.position.y);
      if (!best || score < best.score) best = { id: f.id, score };
    }
    for (const s of plan.stairs ?? []) {
      const score = distToStairRun(p, s);
      if (!best || score < best.score) best = { id: s.id, score };
    }
    if (best && best.score <= 2) onSelect(best.id);
    else onSelect(null);
  }

  const viewW = (bounds.w * zoom) + 200;
  const viewH = (bounds.l * zoom) + 200;

  return (
    <div
      className="w-full h-full overflow-hidden bg-white"
      ref={wrapRef}
      onWheel={handleWheel}
      onContextMenu={(e) => e.preventDefault()}
      onDragOver={(e) => {
        const types = e.dataTransfer.types;
        const has =
          typeof types.includes === 'function'
            ? types.includes('application/x-plan-item')
            : Array.from(types as unknown as string[]).includes('application/x-plan-item');
        if (has) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
        }
      }}
      onDrop={(e) => {
        const t = e.dataTransfer.getData('application/x-plan-item');
        if (t !== 'window' && t !== 'door' && t !== 'overhead') return;
        if (!canEdit) return;
        e.preventDefault();
        const raw = clientToPlan(e.clientX, e.clientY);
        if (!raw) return;
        placeOpeningAt(raw, t as DroppableItem);
      }}
    >
      <svg
        className="w-full h-full"
        viewBox={`0 0 ${viewW} ${viewH}`}
        onPointerDown={handlePointerDown}
        onPointerMove={(e) => {
          handlePointerMove(e);
          handlePointerMoveForEdits(e);
        }}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onClick={handleClickSelect}
      >
        <rect x={0} y={0} width={viewW} height={viewH} fill="#ffffff" />

        {/* Grid */}
        {Array.from({ length: Math.ceil(bounds.w) + 21 }).map((_, i) => {
          const x = (i - 10) * zoom + pan.x;
          return <line key={`gx_${i}`} x1={x} y1={0} x2={x} y2={viewH} stroke="#f1f5f9" strokeWidth={1} />;
        })}
        {Array.from({ length: Math.ceil(bounds.l) + 21 }).map((_, i) => {
          const y = (i - 10) * zoom + pan.y;
          return <line key={`gy_${i}`} x1={0} y1={y} x2={viewW} y2={y} stroke="#f1f5f9" strokeWidth={1} />;
        })}

        {/* Perimeter outline */}
        <rect
          x={pan.x}
          y={pan.y}
          width={bounds.w * zoom}
          height={bounds.l * zoom}
          fill="#f8fafc"
          stroke="#0f172a"
          strokeWidth={2}
        />

        {/* Post markers (8' OC + overhead jamb posts; matches 3D layout) */}
        {perimeterPostSlots.map((slot, idx) => {
          const center = perimeterSlotToPlanPoint(slot, plan.dims.width, plan.dims.length);
          const v = planToView(center);
          const px = POST_Tp * zoom;
          return (
            <rect
              key={`post_${slot.edge}_${slot.along.toFixed(4)}_${idx}`}
              x={pan.x + v.x * zoom - px / 2}
              y={pan.y + v.y * zoom - px / 2}
              width={px}
              height={px}
              fill="#0f172a"
              opacity={0.55}
            />
          );
        })}

        {/* Rooms (dim other floors; color by level) */}
        {plan.rooms.map((r) => {
          const onFloor = roomMatchesFloor(r, activeRoomFloor);
          const lvl = normalizeRoomLevel(r);
          const sel = selectedId === r.id;
          let fill = sel ? '#dcfce7' : '#fefce8';
          let stroke = sel ? '#16a34a' : '#a16207';
          if (lvl === 'loft_deck') {
            fill = sel ? '#ede9fe' : '#f5f3ff';
            stroke = sel ? '#5b21b6' : '#7c3aed';
          } else if (lvl === 'loft_upper') {
            fill = sel ? '#fce7f3' : '#fdf2f8';
            stroke = sel ? '#9d174d' : '#db2777';
          }
          const origin = draggingRoom && draggingRoom.roomId === r.id ? draggingRoom.currentOrigin : r.origin;
          const o = planToView(origin);
          const cx = origin.x + r.width / 2;
          const cy = origin.y + r.depth / 2;
          const cv = planToView({ x: cx, y: cy });
          const mode = r.wallTopMode ?? 'to_ceiling';
          const wallTag =
            mode === 'custom' && r.customWallHeightFt != null && r.customWallHeightFt > 0
              ? `${r.customWallHeightFt.toFixed(1)}′ wall`
              : 'to ceiling';
          const lvlTag =
            lvl === 'main' ? 'main' : lvl === 'loft_deck' ? 'on loft' : `above +${(r.loftUpperFloorOffsetFt ?? 0).toFixed(1)}′`;
          return (
            <g key={r.id}>
              <rect
                x={pan.x + o.x * zoom}
                y={pan.y + o.y * zoom}
                width={(orientation === 'lengthX' ? r.depth : r.width) * zoom}
                height={(orientation === 'lengthX' ? r.width : r.depth) * zoom}
                fill={fill}
                stroke={stroke}
                strokeWidth={Math.max(2, r.wallThickness * zoom)}
                opacity={onFloor ? 0.92 : 0.3}
              />
              <text
                x={pan.x + cv.x * zoom}
                y={pan.y + cv.y * zoom - 5}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={11}
                fontWeight={600}
                fill="#0f172a"
              >
                {r.name || 'Room'}
              </text>
              <text
                x={pan.x + cv.x * zoom}
                y={pan.y + cv.y * zoom + 7}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={9}
                fill="#475569"
              >
                {lvlTag} · {wallTag}
              </text>
            </g>
          );
        })}

        {/* Room ghost (preview while placing) */}
        {mode === 'room' && roomSpec && roomGhostOrigin ? (
          <rect
            x={pan.x + planToView(roomGhostOrigin).x * zoom}
            y={pan.y + planToView(roomGhostOrigin).y * zoom}
            width={(orientation === 'lengthX' ? roomSpec.depth : roomSpec.width) * zoom}
            height={(orientation === 'lengthX' ? roomSpec.width : roomSpec.depth) * zoom}
            fill="#fde68a"
            stroke="#a16207"
            strokeWidth={2}
            opacity={0.45}
          />
        ) : null}

        {/* Lofts */}
        {plan.lofts.map((loft) => {
          const o = planToView(loft.origin);
          const rw = (orientation === 'lengthX' ? loft.depth : loft.width) * zoom;
          const rh = (orientation === 'lengthX' ? loft.width : loft.depth) * zoom;
          const so = loft.stairOpening;
          let holeEl: ReactNode = null;
          if (so && so.width > 0 && so.depth > 0) {
            const drag = draggingStairOpening?.loftId === loft.id ? draggingStairOpening : null;
            const ox = drag ? drag.curX : so.x;
            const oy = drag ? drag.curY : so.y;
            const ho = planToView({ x: loft.origin.x + ox, y: loft.origin.y + oy });
            const hw = (orientation === 'lengthX' ? so.depth : so.width) * zoom;
            const hh = (orientation === 'lengthX' ? so.width : so.depth) * zoom;
            const holeSelected = selectedId === loft.id && drag;
            holeEl = (
              <rect
                x={pan.x + ho.x * zoom}
                y={pan.y + ho.y * zoom}
                width={hw}
                height={hh}
                fill="#ffffff"
                stroke={holeSelected ? '#16a34a' : '#0f172a'}
                strokeWidth={holeSelected ? 2.5 : 1.5}
                strokeDasharray="6 4"
                opacity={0.95}
                style={{ cursor: mode === 'select' && canEdit ? 'move' : undefined }}
              />
            );
          }
          const ch = loft.clearHeight ?? 8;
          return (
            <g key={loft.id}>
              <rect
                x={pan.x + o.x * zoom}
                y={pan.y + o.y * zoom}
                width={rw}
                height={rh}
                fill={selectedId === loft.id ? '#bbf7d0' : '#e0f2fe'}
                stroke={selectedId === loft.id ? '#16a34a' : '#0284c7'}
                strokeWidth={2}
                opacity={0.7}
              />
              <text
                pointerEvents="none"
                x={pan.x + planToView({ x: loft.origin.x + loft.width / 2, y: loft.origin.y + loft.depth / 2 }).x * zoom}
                y={pan.y + planToView({ x: loft.origin.x + loft.width / 2, y: loft.origin.y + loft.depth / 2 }).y * zoom}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={11}
                fill="#0c4a6e"
              >
                {loft.name ?? 'Loft'} · deck {loft.elevation.toFixed(1)}′ · {ch.toFixed(0)}′ clr
              </text>
              {holeEl}
            </g>
          );
        })}

        {/* Stairs (plan footprint) */}
        {(plan.stairs ?? []).map((s) => {
          const [p0, p1, p2, p3] = stairFootprintCorners(s);
          const pts = [p0, p1, p2, p3].map((pt) => {
            const v = planToView(pt);
            return `${pan.x + v.x * zoom},${pan.y + v.y * zoom}`;
          });
          return (
            <polygon
              key={s.id}
              points={pts.join(' ')}
              fill={selectedId === s.id ? '#86efac' : '#bae6fd'}
              stroke={selectedId === s.id ? '#15803d' : '#0369a1'}
              strokeWidth={2}
              opacity={0.85}
            />
          );
        })}

        {/* Loft ghost */}
        {mode === 'loft' && loftSpec && loftGhostOrigin ? (
          <rect
            x={pan.x + planToView(loftGhostOrigin).x * zoom}
            y={pan.y + planToView(loftGhostOrigin).y * zoom}
            width={(orientation === 'lengthX' ? loftSpec.depth : loftSpec.width) * zoom}
            height={(orientation === 'lengthX' ? loftSpec.width : loftSpec.depth) * zoom}
            fill="#bae6fd"
            stroke="#0284c7"
            strokeWidth={2}
            opacity={0.45}
          />
        ) : null}

        {/* Walls */}
        {plan.walls.map((w) => (
          <line
            key={w.id}
            x1={pan.x + planToView(w.start).x * zoom}
            y1={pan.y + planToView(w.start).y * zoom}
            x2={pan.x + planToView(w.end).x * zoom}
            y2={pan.y + planToView(w.end).y * zoom}
            stroke={selectedId === w.id ? '#22c55e' : '#334155'}
            strokeWidth={Math.max(2, w.thickness * zoom)}
            strokeLinecap="round"
          />
        ))}

        {/* Openings */}
        {plan.openings.map((o) => {
          const wall = plan.walls.find((w) => w.id === o.wallId);
          if (!wall) return null;
          const off = draggingOpening?.openingId === o.id ? draggingOpening.previewOffset : o.offset;
          const a = pointAlongWall(wall.start, wall.end, off);
          const b = pointAlongWall(wall.start, wall.end, off + o.width);
          const av = planToView(a);
          const bv = planToView(b);
          return (
            <line
              key={o.id}
              x1={pan.x + av.x * zoom}
              y1={pan.y + av.y * zoom}
              x2={pan.x + bv.x * zoom}
              y2={pan.y + bv.y * zoom}
              stroke={
                selectedId === o.id
                  ? '#22c55e'
                  : o.type === 'overhead_door'
                    ? '#f59e0b'
                    : o.type === 'door'
                      ? '#0ea5e9'
                      : '#eab308'
              }
              strokeWidth={6}
              strokeLinecap="round"
            />
          );
        })}

        {/* Opening ghost (preview while placing windows/doors) */}
        {openingGhost ? (() => {
          const av = planToView(openingGhost.a);
          const bv = planToView(openingGhost.b);
          return (
            <line
              x1={pan.x + av.x * zoom}
              y1={pan.y + av.y * zoom}
              x2={pan.x + bv.x * zoom}
              y2={pan.y + bv.y * zoom}
              stroke={
                openingGhost.kind === 'overhead'
                  ? '#f59e0b'
                  : openingGhost.kind === 'door'
                    ? '#0ea5e9'
                    : '#eab308'
              }
              strokeWidth={8}
              strokeLinecap="round"
              opacity={0.5}
            />
          );
        })() : null}

        {/* Fixtures */}
        {plan.fixtures.map((f) => (
          <circle
            key={f.id}
            cx={pan.x + planToView(f.position).x * zoom}
            cy={pan.y + planToView(f.position).y * zoom}
            r={5}
            fill={selectedId === f.id ? '#22c55e' : f.type === 'drain' ? '#64748b' : '#0ea5e9'}
          />
        ))}

        {/* Draft wall */}
        {wallDraft ? (
          <circle
            cx={pan.x + planToView(wallDraft).x * zoom}
            cy={pan.y + planToView(wallDraft).y * zoom}
            r={6}
            fill="#22c55e"
          />
        ) : null}

        {mode === 'stair' && stairDraftFoot ? (
          <circle
            cx={pan.x + planToView(stairDraftFoot).x * zoom}
            cy={pan.y + planToView(stairDraftFoot).y * zoom}
            r={7}
            fill="#0369a1"
            stroke="#fff"
            strokeWidth={2}
          />
        ) : null}

        {mode === 'loft_stair_hole' &&
        loftStairHoleTargetId &&
        loftStairHoleCorner &&
        loftStairHoleHover
          ? (() => {
              const loft = plan.lofts.find((l) => l.id === loftStairHoleTargetId);
              if (!loft) return null;
              const r = stairOpeningRectFromDrag(
                loftStairHoleCorner.x,
                loftStairHoleCorner.y,
                loftStairHoleHover.x,
                loftStairHoleHover.y,
                loft
              );
              if (!r) return null;
              const ho = planToView({ x: loft.origin.x + r.x, y: loft.origin.y + r.y });
              const rw = (orientation === 'lengthX' ? r.depth : r.width) * zoom;
              const rh = (orientation === 'lengthX' ? r.width : r.depth) * zoom;
              return (
                <rect
                  x={pan.x + ho.x * zoom}
                  y={pan.y + ho.y * zoom}
                  width={rw}
                  height={rh}
                  fill="rgba(220, 38, 38, 0.12)"
                  stroke="#dc2626"
                  strokeWidth={2}
                  strokeDasharray="5 4"
                />
              );
            })()
          : null}
      </svg>
    </div>
  );
}

function clampPointInsideLoft(p: PlanPoint, loft: PlanLoft): PlanPoint {
  return {
    x: clamp(p.x, loft.origin.x, loft.origin.x + loft.width),
    y: clamp(p.y, loft.origin.y, loft.origin.y + loft.depth),
  };
}

function hitTestNearestOpeningOnWall(
  p: PlanPoint,
  plan: BuildingPlanModel,
  maxDistFt: number
): { opening: PlanOpening; wall: PlanWall } | null {
  let best: { opening: PlanOpening; wall: PlanWall; dist: number } | null = null;
  for (const o of plan.openings) {
    const wall = plan.walls.find((w) => w.id === o.wallId);
    if (!wall) continue;
    const a = pointAlongWall(wall.start, wall.end, o.offset);
    const b = pointAlongWall(wall.start, wall.end, o.offset + o.width);
    const d = distToSegment(p, a, b);
    if (d <= maxDistFt && (!best || d < best.dist)) best = { opening: o, wall, dist: d };
  }
  return best ? { opening: best.opening, wall: best.wall } : null;
}

/** Intersection of drag box with loft interior; returns opening in loft-local coords. */
function stairOpeningRectFromDrag(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  loft: PlanLoft
): { x: number; y: number; width: number; depth: number } | null {
  let minX = Math.min(ax, bx);
  let maxX = Math.max(ax, bx);
  let minY = Math.min(ay, by);
  let maxY = Math.max(ay, by);
  const Lx0 = loft.origin.x;
  const Ly0 = loft.origin.y;
  const Lx1 = Lx0 + loft.width;
  const Ly1 = Ly0 + loft.depth;
  minX = clamp(minX, Lx0, Lx1);
  maxX = clamp(maxX, Lx0, Lx1);
  minY = clamp(minY, Ly0, Ly1);
  maxY = clamp(maxY, Ly0, Ly1);
  const width = maxX - minX;
  const depth = maxY - minY;
  if (width < 0.25 || depth < 0.25) return null;
  return { x: minX - Lx0, y: minY - Ly0, width, depth };
}

function stairFootprintCorners(s: PlanStair): [PlanPoint, PlanPoint, PlanPoint, PlanPoint] {
  const rad = (s.angleDeg * Math.PI) / 180;
  const ux = Math.cos(rad);
  const uy = Math.sin(rad);
  const px = -uy;
  const py = ux;
  const hw = s.width / 2;
  const f = s.foot;
  const p0 = { x: f.x + px * hw, y: f.y + py * hw };
  const p1 = { x: f.x - px * hw, y: f.y - py * hw };
  const p2 = { x: p1.x + ux * s.run, y: p1.y + uy * s.run };
  const p3 = { x: p0.x + ux * s.run, y: p0.y + uy * s.run };
  return [p0, p1, p2, p3];
}

function distToStairRun(p: PlanPoint, s: PlanStair): number {
  const rad = (s.angleDeg * Math.PI) / 180;
  const ux = Math.cos(rad);
  const uy = Math.sin(rad);
  const end = { x: s.foot.x + ux * s.run, y: s.foot.y + uy * s.run };
  return distToSegment(p, s.foot, end);
}

function hypot(dx: number, dy: number) {
  return Math.sqrt(dx * dx + dy * dy);
}

function distToSegment(p: PlanPoint, a: PlanPoint, b: PlanPoint): number {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const wx = p.x - a.x;
  const wy = p.y - a.y;
  const c1 = vx * wx + vy * wy;
  if (c1 <= 0) return hypot(p.x - a.x, p.y - a.y);
  const c2 = vx * vx + vy * vy;
  if (c2 <= c1) return hypot(p.x - b.x, p.y - b.y);
  const t = c1 / c2;
  const px = a.x + t * vx;
  const py = a.y + t * vy;
  return hypot(p.x - px, p.y - py);
}

function closestPointOnSegment(p: PlanPoint, a: PlanPoint, b: PlanPoint): PlanPoint {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const c2 = vx * vx + vy * vy;
  if (c2 <= 0) return { x: a.x, y: a.y };
  const wx = p.x - a.x;
  const wy = p.y - a.y;
  const t = clamp((wx * vx + wy * vy) / c2, 0, 1);
  return { x: a.x + t * vx, y: a.y + t * vy };
}

function segmentUnit(a: PlanPoint, b: PlanPoint): { ux: number; uy: number } {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const len = Math.sqrt(vx * vx + vy * vy) || 1;
  return { ux: vx / len, uy: vy / len };
}

function projectOffsetAlongWall(p: PlanPoint, a: PlanPoint, b: PlanPoint): number {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const len = Math.sqrt(vx * vx + vy * vy) || 1;
  const ux = vx / len;
  const uy = vy / len;
  const wx = p.x - a.x;
  const wy = p.y - a.y;
  const proj = wx * ux + wy * uy;
  return clamp(proj, 0, len);
}

function pointAlongWall(a: PlanPoint, b: PlanPoint, offset: number): PlanPoint {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const len = Math.sqrt(vx * vx + vy * vy) || 1;
  const t = clamp(offset / len, 0, 1);
  return { x: a.x + vx * t, y: a.y + vy * t };
}

function hitTestRoom(p: PlanPoint, rooms: PlanRoom[]): PlanRoom | null {
  for (let i = rooms.length - 1; i >= 0; i--) {
    const r = rooms[i];
    if (
      p.x >= r.origin.x &&
      p.x <= r.origin.x + r.width &&
      p.y >= r.origin.y &&
      p.y <= r.origin.y + r.depth
    ) {
      return r;
    }
  }
  return null;
}

function hitTestLoftStairOpening(p: PlanPoint, lofts: PlanLoft[]): PlanLoft | null {
  for (let i = lofts.length - 1; i >= 0; i--) {
    const lf = lofts[i];
    const so = lf.stairOpening;
    if (!so || so.width <= 0 || so.depth <= 0) continue;
    const x0 = lf.origin.x + so.x;
    const y0 = lf.origin.y + so.y;
    if (p.x >= x0 && p.x <= x0 + so.width && p.y >= y0 && p.y <= y0 + so.depth) {
      return lf;
    }
  }
  return null;
}

function hitTestLoft(p: PlanPoint, lofts: PlanLoft[]): PlanLoft | null {
  for (let i = lofts.length - 1; i >= 0; i--) {
    const lf = lofts[i];
    if (
      p.x >= lf.origin.x &&
      p.x <= lf.origin.x + lf.width &&
      p.y >= lf.origin.y &&
      p.y <= lf.origin.y + lf.depth
    ) {
      return lf;
    }
  }
  return null;
}

function snapOpeningCenterOffset(args: {
  centerOffset: number;
  wallLen: number;
  openingWidth: number;
  postSpacing: number;
  postSize: number;
}): number {
  const { centerOffset, wallLen, openingWidth, postSpacing, postSize } = args;

  // Candidate snaps:
  // - bay centers (between posts)
  // - "up against post" (opening edge aligned to post edge)
  const snapFt = 1.0;

  const posts: number[] = [];
  for (let t = 0; t <= wallLen + 0.001; t += postSpacing) {
    posts.push(Math.min(wallLen, t));
  }
  if (posts.length === 0) return clamp(centerOffset, 0, wallLen);

  const bayCenters: number[] = [];
  for (let i = 0; i < posts.length - 1; i++) {
    bayCenters.push((posts[i] + posts[i + 1]) / 2);
  }

  const postEdgeSnaps: number[] = [];
  const halfPost = postSize / 2;
  const halfOpen = openingWidth / 2;
  for (const p of posts) {
    // Align opening left edge to post right edge => center at p + halfPost + halfOpen
    postEdgeSnaps.push(p + halfPost + halfOpen);
    // Align opening right edge to post left edge => center at p - halfPost - halfOpen
    postEdgeSnaps.push(p - halfPost - halfOpen);
  }

  const candidates = [...bayCenters, ...postEdgeSnaps];
  let best = centerOffset;
  let bestAbs = Infinity;
  for (const c of candidates) {
    const a = Math.abs(c - centerOffset);
    if (a <= snapFt && a < bestAbs) {
      bestAbs = a;
      best = c;
    }
  }

  // Clamp so opening stays within wall extents.
  const minCenter = openingWidth / 2;
  const maxCenter = Math.max(minCenter, wallLen - openingWidth / 2);
  return clamp(best, minCenter, maxCenter);
}

