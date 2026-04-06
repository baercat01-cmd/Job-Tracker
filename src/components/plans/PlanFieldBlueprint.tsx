import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { BuildingPlanModel, PlanOpening, PlanRoom } from '@/lib/buildingPlanModel';
import { normalizeRoomLevel } from '@/lib/buildingPlanModel';
import { formatFeetForPlan } from '@/lib/architecturalFormat';
import {
  inwardNormalForWall,
  planToViewLengthX,
  pointAlongWall,
  stairFootprintCorners,
  wallMidpoint,
} from '@/lib/planBlueprintView';
import {
  computePerimeterPostSlotsFromPlan,
  getSlotPostWidthFt,
  perimeterSlotToPlanPoint,
} from '@/lib/perimeterPostLayout';

const STROKE = '#0f172a';
const STROKE_LIGHT = '#475569';
const FILL_BG = '#ffffff';
const FILL_BUILDING = '#f8fafc';
const GRID = '#e2e8f0';

function DimHorizontal(props: {
  x1: number;
  x2: number;
  yStructure: number;
  yDim: number;
  label: string;
  fontSize?: number;
}) {
  const { x1, x2, yStructure, yDim, label, fontSize = 11 } = props;
  const left = Math.min(x1, x2);
  const right = Math.max(x1, x2);
  const mid = (left + right) / 2;
  return (
    <g>
      <line x1={left} y1={yStructure} x2={left} y2={yDim} stroke={STROKE} strokeWidth={0.85} />
      <line x1={right} y1={yStructure} x2={right} y2={yDim} stroke={STROKE} strokeWidth={0.85} />
      <line x1={left} y1={yDim} x2={right} y2={yDim} stroke={STROKE} strokeWidth={1.1} />
      <line x1={left} y1={yDim - 5} x2={left} y2={yDim + 5} stroke={STROKE} strokeWidth={1.1} />
      <line x1={right} y1={yDim - 5} x2={right} y2={yDim + 5} stroke={STROKE} strokeWidth={1.1} />
      <text
        x={mid}
        y={yDim - 8}
        textAnchor="middle"
        fontSize={fontSize}
        fontWeight={600}
        fill={STROKE}
        fontFamily="ui-sans-serif, system-ui, sans-serif"
      >
        {label}
      </text>
    </g>
  );
}

function DimVertical(props: {
  y1: number;
  y2: number;
  xStructure: number;
  xDim: number;
  label: string;
  fontSize?: number;
}) {
  const { y1, y2, xStructure, xDim, label, fontSize = 11 } = props;
  const top = Math.min(y1, y2);
  const bot = Math.max(y1, y2);
  const mid = (top + bot) / 2;
  return (
    <g>
      <line x1={xStructure} y1={top} x2={xDim} y2={top} stroke={STROKE} strokeWidth={0.85} />
      <line x1={xStructure} y1={bot} x2={xDim} y2={bot} stroke={STROKE} strokeWidth={0.85} />
      <line x1={xDim} y1={top} x2={xDim} y2={bot} stroke={STROKE} strokeWidth={1.1} />
      <line x1={xDim - 5} y1={top} x2={xDim + 5} y2={top} stroke={STROKE} strokeWidth={1.1} />
      <line x1={xDim - 5} y1={bot} x2={xDim + 5} y2={bot} stroke={STROKE} strokeWidth={1.1} />
      <text
        x={xDim - 10}
        y={mid}
        textAnchor="middle"
        fontSize={fontSize}
        fontWeight={600}
        fill={STROKE}
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        transform={`rotate(-90 ${xDim - 10} ${mid})`}
      >
        {label}
      </text>
    </g>
  );
}

function NorthArrow(props: { cx: number; cy: number; size: number }) {
  const { cx, cy, size } = props;
  return (
    <g aria-label="North toward front wall">
      <circle cx={cx} cy={cy} r={size * 0.55} fill="none" stroke={STROKE} strokeWidth={1} />
      <path
        d={`M ${cx} ${cy - size * 0.85} L ${cx + size * 0.28} ${cy + size * 0.35} L ${cx} ${cy + size * 0.08} L ${cx - size * 0.28} ${cy + size * 0.35} Z`}
        fill={STROKE}
      />
      <text
        x={cx}
        y={cy - size * 1.15}
        textAnchor="middle"
        fontSize={11}
        fontWeight={700}
        fill={STROKE}
        fontFamily="ui-sans-serif, system-ui, sans-serif"
      >
        N
      </text>
    </g>
  );
}

function openingTypeLabel(o: PlanOpening): string {
  if (o.type === 'overhead_door') return 'OH';
  if (o.type === 'door') return 'Door';
  return 'Win';
}

function openingDetailText(o: PlanOpening): string {
  const t = openingTypeLabel(o);
  const sill = o.type !== 'door' ? ` sill ${formatFeetForPlan(o.sill)}` : '';
  return `${t} ${formatFeetForPlan(o.width)}×${formatFeetForPlan(o.height)}${sill}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sanitizeFilename(s: string): string {
  return s.replace(/[^\w\-]+/g, '_').slice(0, 80) || 'blueprint';
}

function roomDimLabels(r: PlanRoom): string {
  const mode = r.wallTopMode ?? 'to_ceiling';
  const wh =
    mode === 'custom' && r.customWallHeightFt != null && r.customWallHeightFt > 0
      ? `${formatFeetForPlan(r.customWallHeightFt)} wall`
      : 'to ceiling';
  const lvl = normalizeRoomLevel(r);
  const floor =
    lvl === 'main' ? 'Main' : lvl === 'loft_deck' ? 'Loft deck' : `Upper +${formatFeetForPlan(r.loftUpperFloorOffsetFt ?? 0)}`;
  return `${floor} · ${wh}`;
}

export type PlanFieldBlueprintProps = {
  plan: BuildingPlanModel;
  className?: string;
  subtitle?: string;
  showGrid?: boolean;
  showPosts?: boolean;
  showActions?: boolean;
};

export function PlanFieldBlueprint({
  plan,
  className = '',
  subtitle,
  showGrid = true,
  showPosts = true,
  showActions = true,
}: PlanFieldBlueprintProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [box, setBox] = useState({ w: 800, h: 480 });

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setBox({ w: Math.max(320, r.width), h: Math.max(280, r.height) });
    });
    ro.observe(el);
    const r = el.getBoundingClientRect();
    setBox({ w: Math.max(320, r.width), h: Math.max(280, r.height) });
    return () => ro.disconnect();
  }, []);

  const lengthFt = plan.dims.length;
  const widthFt = plan.dims.width;

  const layout = useMemo(() => {
    const headerH = 72;
    const footerH = 40;
    const dimStack = 44;
    const marginSide = 56;
    const marginTop = headerH + 8;
    const marginBot = footerH + dimStack + 8;

    const innerW = box.w - marginSide * 2;
    const innerHGuess = Math.max(200, box.h - 48);
    const availW = innerW - dimStack;
    const availH = innerHGuess - marginTop - marginBot;

    const s = Math.min(availW / Math.max(lengthFt, 0.01), availH / Math.max(widthFt, 0.01), 48);
    const pxPerFt = Math.max(10, s);

    const drawW = lengthFt * pxPerFt;
    const drawH = widthFt * pxPerFt;
    const totalH = marginTop + drawH + dimStack + marginBot;

    const ox = marginSide + dimStack;
    const oy = marginTop;

    return {
      pxPerFt,
      drawW,
      drawH,
      ox,
      oy,
      marginSide,
      marginTop,
      dimStack,
      totalW: box.w,
      totalH: Math.max(totalH, 440),
      headerH,
    };
  }, [box.w, box.h, lengthFt, widthFt]);

  const { pxPerFt, drawW, drawH, ox, oy, marginSide, marginTop, dimStack, totalW, totalH, headerH } = layout;

  const wallById = useMemo(() => new Map(plan.walls.map((w) => [w.id, w] as const)), [plan.walls]);

  const perimeterPostSlots = useMemo(() => computePerimeterPostSlotsFromPlan(plan), [plan]);

  function planToPx(p: { x: number; y: number }): { x: number; y: number } {
    const v = planToViewLengthX(p);
    return { x: ox + v.x * pxPerFt, y: oy + v.y * pxPerFt };
  }

  const buildingBottom = oy + drawH;
  const buildingRight = ox + drawW;
  const yDimBottom = buildingBottom + 28;
  const xDimLeft = ox - 28;

  function printBlueprint() {
    const svg = svgRef.current;
    if (!svg) return;
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('width', String(totalW));
    clone.setAttribute('height', String(totalH));
    const serialized = new XMLSerializer().serializeToString(clone);
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Field blueprint — ${escapeHtml(plan.name)}</title>
      <style>
        body{margin:0;background:#fff}
        @page{margin:12mm}
        svg{display:block;max-width:100%;height:auto}
      </style></head><body>${serialized}</body></html>`);
    w.document.close();
    w.onload = () => {
      w.focus();
      w.print();
    };
  }

  function downloadSvg() {
    const svg = svgRef.current;
    if (!svg) return;
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const serialized = new XMLSerializer().serializeToString(clone);
    const blob = new Blob([serialized], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${sanitizeFilename(plan.name || 'blueprint')}-field-blueprint.svg`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div ref={wrapRef} className={`flex flex-col gap-2 min-h-0 ${className}`}>
      {showActions ? (
        <div className="flex flex-wrap items-center gap-2 shrink-0 print:hidden">
          <button
            type="button"
            className="text-xs font-medium rounded-md border border-slate-300 bg-white px-3 py-1.5 hover:bg-slate-50"
            onClick={printBlueprint}
          >
            Print / Save PDF
          </button>
          <button
            type="button"
            className="text-xs font-medium rounded-md border border-slate-300 bg-white px-3 py-1.5 hover:bg-slate-50"
            onClick={downloadSvg}
          >
            Download SVG
          </button>
          <span className="text-[11px] text-slate-500">Field reference only — verify on site.</span>
        </div>
      ) : null}
      <div className="flex-1 min-h-0 overflow-auto border border-slate-200 rounded-md bg-white print:border-0">
        <svg
          ref={svgRef}
          width={totalW}
          height={totalH}
          viewBox={`0 0 ${totalW} ${totalH}`}
          className="block max-w-full h-auto"
          role="img"
          aria-label={`Field floor plan blueprint for ${plan.name}`}
        >
          <rect x={0} y={0} width={totalW} height={totalH} fill={FILL_BG} />

          <rect x={0} y={0} width={totalW} height={headerH} fill="#f1f5f9" stroke={STROKE_LIGHT} strokeWidth={1} />
          <text
            x={marginSide}
            y={28}
            fontSize={18}
            fontWeight={700}
            fill={STROKE}
            fontFamily="ui-sans-serif, system-ui, sans-serif"
          >
            {plan.name || 'Building plan'}
          </text>
          <text
            x={marginSide}
            y={48}
            fontSize={12}
            fill={STROKE_LIGHT}
            fontFamily="ui-sans-serif, system-ui, sans-serif"
          >
            {subtitle ?? `Floor plan · ${formatFeetForPlan(lengthFt)} × ${formatFeetForPlan(widthFt)} · wall ${formatFeetForPlan(plan.dims.height)} · pitch ${plan.dims.pitch}/12`}
          </text>
          <text
            x={marginSide}
            y={64}
            fontSize={10}
            fill="#94a3b8"
            fontFamily="ui-sans-serif, system-ui, sans-serif"
          >
            Updated {new Date(plan.meta.updatedAt).toLocaleDateString()} · Rev {plan.meta.rev ?? 1}
          </text>

          <NorthArrow cx={totalW - marginSide - 28} cy={headerH / 2 + 6} size={22} />

          {showGrid
            ? Array.from({ length: Math.ceil(lengthFt / 2) + 1 }, (_, i) => i * 2).map((gx) => (
                <line
                  key={`gx-${gx}`}
                  x1={ox + gx * pxPerFt}
                  y1={oy}
                  x2={ox + gx * pxPerFt}
                  y2={buildingBottom}
                  stroke={GRID}
                  strokeWidth={gx % 4 === 0 ? 0.9 : 0.45}
                />
              ))
            : null}
          {showGrid
            ? Array.from({ length: Math.ceil(widthFt / 2) + 1 }, (_, i) => i * 2).map((gy) => (
                <line
                  key={`gy-${gy}`}
                  x1={ox}
                  y1={oy + gy * pxPerFt}
                  x2={buildingRight}
                  y2={oy + gy * pxPerFt}
                  stroke={GRID}
                  strokeWidth={gy % 4 === 0 ? 0.9 : 0.45}
                />
              ))
            : null}

          <rect
            x={ox}
            y={oy}
            width={drawW}
            height={drawH}
            fill={FILL_BUILDING}
            stroke={STROKE}
            strokeWidth={2.25}
          />

          {plan.walls.map((w) => {
            if (!w.label) return null;
            const mid = wallMidpoint(w);
            const { nx, ny } = inwardNormalForWall(plan, w);
            const vm = planToViewLengthX(mid);
            const vn = planToViewLengthX({ x: mid.x + nx * 2.5, y: mid.y + ny * 2.5 });
            const px = ox + vm.x * pxPerFt;
            const py = oy + vm.y * pxPerFt;
            const off = 14;
            const dx = (vn.x - vm.x) * pxPerFt;
            const dy = (vn.y - vm.y) * pxPerFt;
            const len = Math.hypot(dx, dy) || 1;
            return (
              <text
                key={`wl-${w.id}`}
                x={px + (dx / len) * off}
                y={py + (dy / len) * off}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={10}
                fontWeight={700}
                fill={STROKE_LIGHT}
                fontFamily="ui-sans-serif, system-ui, sans-serif"
              >
                {w.label}
              </text>
            );
          })}

          {showPosts
            ? perimeterPostSlots.map((slot, idx) => {
                const center = perimeterSlotToPlanPoint(slot, plan.dims.width, plan.dims.length);
                const p = planToPx(center);
                const r = (getSlotPostWidthFt(plan, slot) * pxPerFt) / 2;
                return <rect key={`post-${idx}`} x={p.x - r} y={p.y - r} width={r * 2} height={r * 2} fill={STROKE} />;
              })
            : null}

          {plan.lofts.map((loft) => {
            const o = planToViewLengthX(loft.origin);
            const rw = loft.depth * pxPerFt;
            const rh = loft.width * pxPerFt;
            const x = ox + o.x * pxPerFt;
            const y = oy + o.y * pxPerFt;
            const so = loft.stairOpening;
            const ho = so
              ? planToViewLengthX({ x: loft.origin.x + so.x, y: loft.origin.y + so.y })
              : null;
            const hw = so ? so.depth * pxPerFt : 0;
            const hh = so ? so.width * pxPerFt : 0;
            return (
              <g key={loft.id}>
                <rect
                  x={x}
                  y={y}
                  width={rw}
                  height={rh}
                  fill="#e0f2fe"
                  stroke="#0369a1"
                  strokeWidth={1.75}
                  opacity={0.92}
                />
                <text
                  x={x + rw / 2}
                  y={y + rh / 2 - 6}
                  textAnchor="middle"
                  fontSize={11}
                  fontWeight={600}
                  fill="#0c4a6e"
                  fontFamily="ui-sans-serif, system-ui, sans-serif"
                >
                  {loft.name ?? 'Loft'}
                </text>
                <text
                  x={x + rw / 2}
                  y={y + rh / 2 + 8}
                  textAnchor="middle"
                  fontSize={9}
                  fill="#0369a1"
                  fontFamily="ui-sans-serif, system-ui, sans-serif"
                >
                  {formatFeetForPlan(loft.width)} × {formatFeetForPlan(loft.depth)} · deck {formatFeetForPlan(loft.elevation)}
                </text>
                {ho && so && so.width > 0 && so.depth > 0 ? (
                  <rect
                    x={ox + ho.x * pxPerFt}
                    y={oy + ho.y * pxPerFt}
                    width={hw}
                    height={hh}
                    fill="#ffffff"
                    stroke={STROKE}
                    strokeWidth={1.2}
                    strokeDasharray="5 4"
                  />
                ) : null}
              </g>
            );
          })}

          {plan.rooms.map((r) => {
            const vo = planToViewLengthX(r.origin);
            const rw = r.depth * pxPerFt;
            const rh = r.width * pxPerFt;
            const x = ox + vo.x * pxPerFt;
            const y = oy + vo.y * pxPerFt;
            const cx = x + rw / 2;
            const cy = y + rh / 2;
            return (
              <g key={r.id}>
                <rect
                  x={x}
                  y={y}
                  width={rw}
                  height={rh}
                  fill="#fef9c3"
                  stroke="#a16207"
                  strokeWidth={Math.max(1.5, r.wallThickness * pxPerFt)}
                  opacity={0.88}
                />
                <text
                  x={cx}
                  y={cy - 8}
                  textAnchor="middle"
                  fontSize={12}
                  fontWeight={700}
                  fill={STROKE}
                  fontFamily="ui-sans-serif, system-ui, sans-serif"
                >
                  {r.name || 'Room'}
                </text>
                <text
                  x={cx}
                  y={cy + 6}
                  textAnchor="middle"
                  fontSize={10}
                  fontWeight={600}
                  fill={STROKE_LIGHT}
                  fontFamily="ui-sans-serif, system-ui, sans-serif"
                >
                  {formatFeetForPlan(r.width)} × {formatFeetForPlan(r.depth)}
                </text>
                <text
                  x={cx}
                  y={cy + 20}
                  textAnchor="middle"
                  fontSize={8}
                  fill="#64748b"
                  fontFamily="ui-sans-serif, system-ui, sans-serif"
                >
                  {roomDimLabels(r)}
                </text>
              </g>
            );
          })}

          {(plan.stairs ?? []).map((s) => {
            const [p0, p1, p2, p3] = stairFootprintCorners(s);
            const pts = [p0, p1, p2, p3].map((pt) => {
              const v = planToViewLengthX(pt);
              return `${ox + v.x * pxPerFt},${oy + v.y * pxPerFt}`;
            });
            const mid = planToViewLengthX({
              x: (p0.x + p2.x) / 2,
              y: (p0.y + p2.y) / 2,
            });
            const mpx = ox + mid.x * pxPerFt;
            const mpy = oy + mid.y * pxPerFt;
            return (
              <g key={s.id}>
                <polygon
                  points={pts.join(' ')}
                  fill="#bae6fd"
                  stroke="#0369a1"
                  strokeWidth={1.75}
                  opacity={0.9}
                />
                <text
                  x={mpx}
                  y={mpy}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={9}
                  fontWeight={600}
                  fill="#0c4a6e"
                  fontFamily="ui-sans-serif, system-ui, sans-serif"
                >
                  {`Stair ${formatFeetForPlan(s.width)}×${formatFeetForPlan(s.run)} run · ${formatFeetForPlan(s.rise)} rise`}
                </text>
              </g>
            );
          })}

          {plan.walls.map((w) => (
            <line
              key={w.id}
              x1={planToPx(w.start).x}
              y1={planToPx(w.start).y}
              x2={planToPx(w.end).x}
              y2={planToPx(w.end).y}
              stroke={STROKE}
              strokeWidth={Math.max(2, w.thickness * pxPerFt)}
              strokeLinecap="square"
            />
          ))}

          {plan.openings.map((o) => {
            const wall = wallById.get(o.wallId);
            if (!wall) return null;
            const a = pointAlongWall(wall.start, wall.end, o.offset);
            const b = pointAlongWall(wall.start, wall.end, o.offset + o.width);
            const pa = planToPx(a);
            const pb = planToPx(b);
            const midPx = (pa.x + pb.x) / 2;
            const midPy = (pa.y + pb.y) / 2;
            const { nx, ny } = inwardNormalForWall(plan, wall);
            const nv = planToViewLengthX({ x: nx, y: ny });
            const nlen = Math.hypot(nv.x, nv.y) || 1;
            const labelOff = 18;
            const lx = midPx + (nv.x / nlen) * labelOff;
            const ly = midPy + (nv.y / nlen) * labelOff;
            const stroke =
              o.type === 'overhead_door' ? '#c2410c' : o.type === 'door' ? '#0369a1' : '#a16207';
            return (
              <g key={o.id}>
                <line x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y} stroke={stroke} strokeWidth={7} strokeLinecap="round" />
                <text
                  x={lx}
                  y={ly - 4}
                  textAnchor="middle"
                  fontSize={8.5}
                  fontWeight={700}
                  fill={STROKE}
                  fontFamily="ui-sans-serif, system-ui, sans-serif"
                >
                  {openingDetailText(o)}
                </text>
                <text
                  x={lx}
                  y={ly + 8}
                  textAnchor="middle"
                  fontSize={7.5}
                  fill={STROKE_LIGHT}
                  fontFamily="ui-sans-serif, system-ui, sans-serif"
                >
                  {`${formatFeetForPlan(o.offset)} from ${wall.label ?? 'wall'} start`}
                </text>
              </g>
            );
          })}

          {plan.fixtures.map((f) => {
            const p = planToPx(f.position);
            const fill = f.type === 'drain' ? '#64748b' : '#0ea5e9';
            return (
              <g key={f.id}>
                <circle cx={p.x} cy={p.y} r={5} fill={fill} stroke="#fff" strokeWidth={1} />
                <text
                  x={p.x + 8}
                  y={p.y + 3}
                  fontSize={7}
                  fill={STROKE_LIGHT}
                  fontFamily="ui-sans-serif, system-ui, sans-serif"
                >
                  {f.type}
                  {f.label ? ` ${f.label}` : ''}
                </text>
              </g>
            );
          })}

          <DimHorizontal
            x1={ox}
            x2={buildingRight}
            yStructure={buildingBottom}
            yDim={yDimBottom}
            label={formatFeetForPlan(lengthFt)}
          />
          <DimVertical
            y1={oy}
            y2={buildingBottom}
            xStructure={ox}
            xDim={xDimLeft}
            label={formatFeetForPlan(widthFt)}
          />

          <text
            x={marginSide}
            y={totalH - 14}
            fontSize={9}
            fill="#64748b"
            fontFamily="ui-sans-serif, system-ui, sans-serif"
          >
            Not for permit. Field layout reference — confirm dimensions before fabrication.
          </text>
        </svg>
      </div>
    </div>
  );
}
