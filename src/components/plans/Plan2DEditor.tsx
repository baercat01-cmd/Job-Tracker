import { useEffect, useMemo, useRef, useState } from 'react';
import type { BuildingPlanModel, PlanEntityId, PlanPoint, PlanRoom, PlanWall } from '@/lib/buildingPlanModel';
import { clamp, newId } from '@/lib/buildingPlanModel';
import type { PlanOp } from '@/lib/planOps';

type ToolMode = 'select' | 'wall' | 'window' | 'door' | 'outlet' | 'drain' | 'room';
type Orientation = 'widthX' | 'lengthX';
type DroppableItem = 'window' | 'door';

export function Plan2DEditor(props: {
  plan: BuildingPlanModel;
  canEdit: boolean;
  mode: ToolMode;
  roomSpec?: { name?: string; width: number; depth: number; wallThickness: number } | null;
  openingSpec?: { width: number; height: number; sill: number } | null;
  orientation?: Orientation;
  onCancelPlacement?: () => void;
  onOp: (op: PlanOp) => void;
  selectedId: PlanEntityId | null;
  onSelect: (id: PlanEntityId | null) => void;
}) {
  const { plan, canEdit, mode, roomSpec, openingSpec, orientation = 'widthX', onCancelPlacement, onOp, selectedId, onSelect } = props;

  const wrapRef = useRef<HTMLDivElement>(null);
  const lastPointerPlanRef = useRef<PlanPoint | null>(null);
  const [pan, setPan] = useState({ x: 40, y: 40 });
  const [zoom, setZoom] = useState(10); // px per ft
  const [wallDraft, setWallDraft] = useState<PlanPoint | null>(null);
  const [panning, setPanning] = useState<{ startX: number; startY: number; panX: number; panY: number } | null>(null);
  const [roomGhostOrigin, setRoomGhostOrigin] = useState<PlanPoint | null>(null);
  const [openingGhost, setOpeningGhost] = useState<{ a: PlanPoint; b: PlanPoint; kind: DroppableItem } | null>(null);
  const [draggingRoom, setDraggingRoom] = useState<{
    roomId: PlanEntityId;
    startPlan: PlanPoint;
    startOrigin: PlanPoint;
    currentOrigin: PlanPoint;
  } | null>(null);

  useEffect(() => {
    // Clear the room ghost when leaving room mode or when roomSpec changes.
    if (mode !== 'room') {
      setRoomGhostOrigin(null);
    }
  }, [mode, roomSpec?.width, roomSpec?.depth, roomSpec?.wallThickness]);

  useEffect(() => {
    // Clear opening ghost when leaving opening modes.
    if (mode !== 'window' && mode !== 'door') {
      setOpeningGhost(null);
    }
  }, [mode, openingSpec?.width, openingSpec?.height, openingSpec?.sill]);

  useEffect(() => {
    // When entering window/door mode, render the ghost immediately from the last known cursor position.
    if (mode !== 'window' && mode !== 'door') return;
    const p = lastPointerPlanRef.current;
    if (!p) return;
    const kind: DroppableItem = mode === 'door' ? 'door' : 'window';
    const wall = findWallNearPoint(p);
    if (!wall) return;
    const spec =
      openingSpec ?? (kind === 'door' ? { width: 3, height: 7, sill: 0 } : { width: 4, height: 3, sill: 3 });
    // Preview follows cursor; snapping happens on click/drop.
    const center = closestPointOnSegment(p, wall.start, wall.end);
    const { ux, uy } = segmentUnit(wall.start, wall.end);
    const half = spec.width / 2;
    const a = { x: center.x - ux * half, y: center.y - uy * half };
    const b = { x: center.x + ux * half, y: center.y + uy * half };
    setOpeningGhost({ a, b, kind });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (draggingRoom) return; // let pointer-up commit; user can drop outside to cancel later if desired
      if (wallDraft) {
        setWallDraft(null);
        return;
      }
      if (mode === 'room' || mode === 'wall') {
        setRoomGhostOrigin(null);
        onCancelPlacement?.();
      }
      if (mode === 'window' || mode === 'door') {
        setOpeningGhost(null);
        onCancelPlacement?.();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [draggingRoom, mode, onCancelPlacement, wallDraft]);

  const bounds = useMemo(() => {
    const w = orientation === 'lengthX' ? plan.dims.length : plan.dims.width;
    const l = orientation === 'lengthX' ? plan.dims.width : plan.dims.length;
    return { w, l };
  }, [plan.dims.width, plan.dims.length, orientation]);

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
    const spec = openingSpec ?? (kind === 'door' ? { width: 3, height: 7, sill: 0 } : { width: 4, height: 3, sill: 3 });
    const wallLen = hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y) || 1;
    const centerOffset = projectOffsetAlongWall(p, wall.start, wall.end);
    const snappedCenter = snapOpeningCenterOffset({
      centerOffset,
      wallLen,
      openingWidth: spec.width,
      postSpacing: 8,
      postSize: 0.4583,
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
    if (Math.abs(ox - 0) <= snapFt) ox = 0;
    if (Math.abs(oy - 0) <= snapFt) oy = 0;
    if (Math.abs((ox + spec.width) - w) <= snapFt) ox = w - spec.width;
    if (Math.abs((oy + spec.depth) - l) <= snapFt) oy = l - spec.depth;

    // Snap to other rooms.
    const left = ox;
    const right = ox + spec.width;
    const top = oy;
    const bottom = oy + spec.depth;

    let bestDx = 0;
    let bestDxAbs = Infinity;
    let bestDy = 0;
    let bestDyAbs = Infinity;

    for (const r of plan.rooms) {
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

    // Drag room in select mode.
    if (mode === 'select') {
      const hit = hitTestRoom(p, plan.rooms);
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

    if (mode === 'window' || mode === 'door') {
      // Use raw cursor position for intuitive placement (no grid snap).
      placeOpeningAt(raw, mode);
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
      const origin = snapRoomOrigin(p, { width: roomSpec.width, depth: roomSpec.depth });
      const room: PlanRoom = {
        id: newId('room'),
        name: roomSpec.name,
        origin,
        width: roomSpec.width,
        depth: roomSpec.depth,
        wallThickness: roomSpec.wallThickness,
      };
      onOp({ type: 'upsert_room', room });
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

    if (mode === 'room' && roomSpec) {
      const origin = snapRoomOrigin(p, { width: roomSpec.width, depth: roomSpec.depth });
      setRoomGhostOrigin(origin);
    } else {
      if (roomGhostOrigin) setRoomGhostOrigin(null);
    }

    if ((mode === 'window' || mode === 'door') && canEdit) {
      const kind: DroppableItem = mode === 'door' ? 'door' : 'window';
      // Use raw pointer position so the ghost tracks the cursor smoothly.
      const wall = findWallNearPoint(raw);
      if (!wall) {
        if (openingGhost) setOpeningGhost(null);
        return;
      }
      const spec = openingSpec ?? (kind === 'door' ? { width: 3, height: 7, sill: 0 } : { width: 4, height: 3, sill: 3 });
      const center = closestPointOnSegment(raw, wall.start, wall.end);
      const { ux, uy } = segmentUnit(wall.start, wall.end);
      const half = spec.width / 2;
      const a = { x: center.x - ux * half, y: center.y - uy * half };
      const b = { x: center.x + ux * half, y: center.y + uy * half };
      setOpeningGhost({ a, b, kind });
    } else {
      if (openingGhost) setOpeningGhost(null);
    }
  }

  // Simple selection (walls/openings/fixtures/rooms/lofts) by nearest center.
  function handleClickSelect(evt: React.MouseEvent) {
    if (mode !== 'select') return;
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const sx = evt.clientX - r.left;
    const sy = evt.clientY - r.top;
    const vp: PlanPoint = { x: (sx - pan.x) / zoom, y: (sy - pan.y) / zoom };
    const p: PlanPoint = viewToPlan(vp);

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
    for (const r of plan.rooms) {
      const cx = r.origin.x + r.width / 2;
      const cy = r.origin.y + r.depth / 2;
      const score = hypot(p.x - cx, p.y - cy);
      if (!best || score < best.score) best = { id: r.id, score };
    }
    for (const loft of plan.lofts) {
      const cx = loft.origin.x + loft.width / 2;
      const cy = loft.origin.y + loft.depth / 2;
      const score = hypot(p.x - cx, p.y - cy);
      if (!best || score < best.score) best = { id: loft.id, score };
    }
    if (best && best.score <= 1.5) onSelect(best.id);
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
        const t = e.dataTransfer.getData('application/x-plan-item');
        if (t === 'window' || t === 'door') {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
        }
      }}
      onDrop={(e) => {
        const t = e.dataTransfer.getData('application/x-plan-item');
        if (t !== 'window' && t !== 'door') return;
        if (!canEdit) return;
        e.preventDefault();
        const raw = clientToPlan(e.clientX, e.clientY);
        if (!raw) return;
        placeOpeningAt(raw, t);
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

        {/* Post spacing markers (8' OC) */}
        {(() => {
          // Posts in the 3D estimator are 8' on-center along the perimeter.
          const spacing = 8;
          const width = plan.dims.width;
          const length = plan.dims.length;
          const postSize = 0.4583; // 6x6 post in feet (matches 3D Tp)
          const inset = postSize / 2; // draw inside wall line
          const px = postSize * zoom;

          const markers: Array<{ p: PlanPoint; wall: 'Front' | 'Back' | 'Left' | 'Right' }> = [];

          // Along front/back (x axis in plan space)
          for (let x = 0; x <= width; x += spacing) {
            markers.push({ p: { x, y: 0 }, wall: 'Front' });
            markers.push({ p: { x, y: length }, wall: 'Back' });
          }
          // Along left/right (y axis in plan space)
          for (let y = 0; y <= length; y += spacing) {
            markers.push({ p: { x: 0, y }, wall: 'Left' });
            markers.push({ p: { x: width, y }, wall: 'Right' });
          }

          // Remove duplicates at corners (rough)
          const uniq = new Map<string, { p: PlanPoint; wall: 'Front' | 'Back' | 'Left' | 'Right' }>();
          for (const m of markers) {
            const key = `${m.p.x.toFixed(3)},${m.p.y.toFixed(3)}`;
            // Prefer front/back over left/right when de-duping corners (arbitrary but stable).
            if (!uniq.has(key) || m.wall === 'Front' || m.wall === 'Back') {
              uniq.set(key, m);
            }
          }

          return Array.from(uniq.values()).map((m, idx) => {
            // Offset inside the wall.
            let center = m.p;
            if (m.wall === 'Front') center = { x: m.p.x, y: inset };
            else if (m.wall === 'Back') center = { x: m.p.x, y: length - inset };
            else if (m.wall === 'Left') center = { x: inset, y: m.p.y };
            else if (m.wall === 'Right') center = { x: width - inset, y: m.p.y };

            // Clamp inside in case of extreme sizes.
            center = { x: clamp(center.x, inset, Math.max(inset, width - inset)), y: clamp(center.y, inset, Math.max(inset, length - inset)) };

            const v = planToView(center);
            return (
              <rect
                key={`post_${idx}`}
                x={pan.x + v.x * zoom - px / 2}
                y={pan.y + v.y * zoom - px / 2}
                width={px}
                height={px}
                fill="#0f172a"
                opacity={0.55}
              />
            );
          });
        })()}

        {/* Rooms */}
        {plan.rooms.map((r) => (
          <g key={r.id}>
            {(() => {
              const origin = draggingRoom && draggingRoom.roomId === r.id ? draggingRoom.currentOrigin : r.origin;
              const o = planToView(origin);
              return (
            <rect
              x={pan.x + o.x * zoom}
              y={pan.y + o.y * zoom}
              width={(orientation === 'lengthX' ? r.depth : r.width) * zoom}
              height={(orientation === 'lengthX' ? r.width : r.depth) * zoom}
              fill={selectedId === r.id ? '#dcfce7' : '#fefce8'}
              stroke={selectedId === r.id ? '#16a34a' : '#a16207'}
              strokeWidth={Math.max(2, r.wallThickness * zoom)}
              opacity={0.9}
            />
              );
            })()}
            {r.name ? (
              <text
                x={pan.x + planToView({ x: r.origin.x + r.width / 2, y: r.origin.y + r.depth / 2 }).x * zoom}
                y={pan.y + planToView({ x: r.origin.x + r.width / 2, y: r.origin.y + r.depth / 2 }).y * zoom}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={12}
                fill="#0f172a"
              >
                {r.name}
              </text>
            ) : null}
          </g>
        ))}

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
        {plan.lofts.map((loft) => (
          <rect
            key={loft.id}
            x={pan.x + planToView(loft.origin).x * zoom}
            y={pan.y + planToView(loft.origin).y * zoom}
            width={(orientation === 'lengthX' ? loft.depth : loft.width) * zoom}
            height={(orientation === 'lengthX' ? loft.width : loft.depth) * zoom}
            fill={selectedId === loft.id ? '#bbf7d0' : '#e0f2fe'}
            stroke={selectedId === loft.id ? '#16a34a' : '#0284c7'}
            strokeWidth={2}
            opacity={0.7}
          />
        ))}

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
          const a = pointAlongWall(wall.start, wall.end, o.offset);
          const b = pointAlongWall(wall.start, wall.end, o.offset + o.width);
          const av = planToView(a);
          const bv = planToView(b);
          return (
            <line
              key={o.id}
              x1={pan.x + av.x * zoom}
              y1={pan.y + av.y * zoom}
              x2={pan.x + bv.x * zoom}
              y2={pan.y + bv.y * zoom}
              stroke={selectedId === o.id ? '#22c55e' : o.type === 'door' ? '#0ea5e9' : '#eab308'}
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
              stroke={openingGhost.kind === 'door' ? '#0ea5e9' : '#eab308'}
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
      </svg>
    </div>
  );
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

