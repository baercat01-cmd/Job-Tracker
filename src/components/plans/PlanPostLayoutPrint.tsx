import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { BuildingPlanModel, PlanOpening } from '@/lib/buildingPlanModel';
import { clamp, getPerimeterPostSettings, resolvePerimeterPostSettings } from '@/lib/buildingPlanModel';
import { formatArchitecturalFeetDetailed, formatFeetForPlan } from '@/lib/architecturalFormat';
import { downloadSvgFromElement, printSvgFromElement } from '@/lib/blueprintPrintUtils';
import type { PlanOp } from '@/lib/planOps';
import { inwardNormalForWall, planToViewLengthX, pointAlongWall } from '@/lib/planBlueprintView';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  computePerimeterPostSlotsFromPlan,
  getSlotPostWidthFt,
  perimeterSlotToPlanPoint,
  SKIRT_BOARD_PAST_POST_FT,
  type PerimeterEdge,
  type PerimeterPostReason,
  type PerimeterPostSlot,
} from '@/lib/perimeterPostLayout';

const INK = '#0f172a';
const INK_MUTED = '#64748b';
const WALL_FILL = '#fafafa';
const POST_CORNER = '#5c3d1e';
const POST_OC = '#8b5a2b';
const POST_JAMB = '#b45309';
const POST_WALK_JAMB = '#0e7490';

function inchesDraftFromFt(ft: number): string {
  return String(Math.round(ft * 120) / 10);
}

function postFillClass(reason: PerimeterPostReason | string): string {
  if (reason === 'corner') return POST_CORNER;
  if (reason === 'overhead_jamb') return POST_JAMB;
  if (reason === 'door_jamb') return POST_WALK_JAMB;
  return POST_OC;
}

function primaryPostReason(slots: PerimeterPostSlot[]): PerimeterPostReason {
  const rs = new Set(slots.map((s) => s.reason));
  if (rs.has('overhead_jamb')) return 'overhead_jamb';
  if (rs.has('door_jamb')) return 'door_jamb';
  if (rs.has('corner')) return 'corner';
  return '8ft_oc';
}

function slotsForEdge(slots: PerimeterPostSlot[], edge: PerimeterEdge): PerimeterPostSlot[] {
  return slots.filter((s) => s.edge === edge).sort((a, b) => a.along - b.along);
}

function tickOnHorizontal(x: number, y: number) {
  const len = 5;
  return <line x1={x - len * 0.55} y1={y - len * 0.55} x2={x + len * 0.55} y2={y + len * 0.55} stroke={INK} strokeWidth={0.9} />;
}

function tickOnVertical(x: number, y: number) {
  const len = 5;
  return <line x1={x - len * 0.55} y1={y + len * 0.55} x2={x + len * 0.55} y2={y - len * 0.55} stroke={INK} strokeWidth={0.9} />;
}

/**
 * Post-bay dimension ticks along one wall in **feet along that edge** (0 … edgeLength).
 * Building OAL is skirt-outside; post run is inset SKIRT_BOARD_PAST_POST_FT each end (3″ total).
 * Merges corner bays: first segment runs from inset post face to next post CL (no split tick at corner CL).
 */
function buildPostLayoutDimensionTicksAlongFt(
  sortedAlongFt: number[],
  edgeLengthFt: number,
  insetEachEndFt: number
): number[] {
  const c = [...sortedAlongFt].sort((a, b) => a - b);
  const inset = Math.max(0, insetEachEndFt);
  if (c.length === 0) return [];
  const hi = edgeLengthFt - inset;
  if (c.length === 1) return [inset, hi];
  if (hi <= inset) return [];
  const mids = c.slice(1, -1).filter((t) => t > inset && t < hi);
  return [inset, ...mids, hi];
}

/** Previous name — kept so cached bundles / any stray references do not throw ReferenceError. */
const buildPostLayoutDimensionTicks = buildPostLayoutDimensionTicksAlongFt;

function sortedDimTicksPxFront(alongTicksFt: number[], oy: number, pxPerFt: number): number[] {
  return alongTicksFt.map((t) => oy + t * pxPerFt).sort((a, b) => a - b);
}

function sortedDimTicksPxBack(
  widthFt: number,
  lengthFt: number,
  alongTicksFt: number[],
  oy: number,
  pxPerFt: number
): number[] {
  return alongTicksFt
    .map((t) => oy + planToViewLengthX({ x: widthFt - t, y: lengthFt }).y * pxPerFt)
    .sort((a, b) => a - b);
}

function sortedDimTicksPxLeft(lengthFt: number, alongTicksFt: number[], ox: number, pxPerFt: number): number[] {
  return alongTicksFt
    .map((t) => ox + planToViewLengthX({ x: 0, y: lengthFt - t }).x * pxPerFt)
    .sort((a, b) => a - b);
}

function sortedDimTicksPxRight(widthFt: number, alongTicksFt: number[], ox: number, pxPerFt: number): number[] {
  return alongTicksFt
    .map((t) => ox + planToViewLengthX({ x: widthFt, y: t }).x * pxPerFt)
    .sort((a, b) => a - b);
}

/** Post bay dimensions along one horizontal baseline (single tier). */
function HorizontalPostChain(props: {
  yWall: number;
  yDim: number;
  /** Sorted dimension tick positions (px) along the wall */
  tickPx: number[];
  pxPerFt: number;
  keyPrefix: string;
}) {
  const { yWall, yDim, tickPx, pxPerFt, keyPrefix } = props;
  const xs = tickPx;
  if (xs.length < 2) return null;
  const els: JSX.Element[] = [];
  for (let i = 0; i < xs.length - 1; i++) {
    const x1 = xs[i];
    const x2 = xs[i + 1];
    const mid = (x1 + x2) / 2;
    const ft = Math.abs(x2 - x1) / pxPerFt;
    els.push(
      <g key={`${keyPrefix}-${i}`}>
        <line x1={x1} y1={yWall} x2={x1} y2={yDim} stroke={INK_MUTED} strokeWidth={0.5} />
        <line x1={x2} y1={yWall} x2={x2} y2={yDim} stroke={INK_MUTED} strokeWidth={0.5} />
        <line x1={x1} y1={yDim} x2={x2} y2={yDim} stroke={INK} strokeWidth={0.85} />
        {tickOnHorizontal(x1, yDim)}
        {tickOnHorizontal(x2, yDim)}
        <text
          x={mid}
          y={yDim < yWall ? yDim + 10 : yDim - 6}
          textAnchor="middle"
          fontSize={8.5}
          fontWeight={500}
          fill={INK}
          fontFamily="ui-sans-serif, system-ui, sans-serif"
        >
          {formatArchitecturalFeetDetailed(ft)}
        </text>
      </g>
    );
  }
  return <>{els}</>;
}

/** Post bay dimensions along one vertical baseline. */
function VerticalPostChain(props: {
  xWall: number;
  xDim: number;
  /** Sorted dimension tick positions (px) along the wall */
  tickPy: number[];
  pxPerFt: number;
  keyPrefix: string;
}) {
  const { xWall, xDim, tickPy, pxPerFt, keyPrefix } = props;
  const ys = tickPy;
  if (ys.length < 2) return null;
  const els: JSX.Element[] = [];
  for (let i = 0; i < ys.length - 1; i++) {
    const y1 = ys[i];
    const y2 = ys[i + 1];
    const mid = (y1 + y2) / 2;
    const ft = Math.abs(y2 - y1) / pxPerFt;
    const tx = xDim - (xDim < xWall ? 6 : -6);
    els.push(
      <g key={`${keyPrefix}-${i}`}>
        <line x1={xWall} y1={y1} x2={xDim} y2={y1} stroke={INK_MUTED} strokeWidth={0.5} />
        <line x1={xWall} y1={y2} x2={xDim} y2={y2} stroke={INK_MUTED} strokeWidth={0.5} />
        <line x1={xDim} y1={y1} x2={xDim} y2={y2} stroke={INK} strokeWidth={0.85} />
        {tickOnVertical(xDim, y1)}
        {tickOnVertical(xDim, y2)}
        <text
          x={tx}
          y={mid}
          textAnchor="middle"
          fontSize={8.5}
          fontWeight={500}
          fill={INK}
          fontFamily="ui-sans-serif, system-ui, sans-serif"
          transform={`rotate(-90 ${tx} ${mid})`}
        >
          {formatArchitecturalFeetDetailed(ft)}
        </text>
      </g>
    );
  }
  return <>{els}</>;
}

function openingLabel(o: PlanOpening): string {
  if (o.type === 'overhead_door') return `OH ${formatFeetForPlan(o.width)} × ${formatFeetForPlan(o.height)}`;
  if (o.type === 'door') return `Door ${formatFeetForPlan(o.width)} × ${formatFeetForPlan(o.height)}`;
  return `Window ${formatFeetForPlan(o.width)} × ${formatFeetForPlan(o.height)} sill ${formatFeetForPlan(o.sill)}`;
}

export type PlanPostLayoutPrintProps = {
  plan: BuildingPlanModel;
  className?: string;
  showActions?: boolean;
  /** When set, spacing fields persist to the plan via plan ops. */
  onOp?: (op: PlanOp) => void;
  /** Jump to Floor plan with a placement tool (doors/windows are edited there). */
  onEditOpeningsOnFloor?: (tool: 'door' | 'window' | 'overhead') => void;
};

export function PlanPostLayoutPrint({
  plan,
  className = '',
  showActions = true,
  onOp,
  onEditOpeningsOnFloor,
}: PlanPostLayoutPrintProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [box, setBox] = useState({ w: 800, h: 520 });
  const [zoom, setZoom] = useState(1);

  const postSettings = useMemo(() => getPerimeterPostSettings(plan), [plan]);
  const resolvedPosts = useMemo(() => resolvePerimeterPostSettings(plan), [plan]);
  const [ocDraft, setOcDraft] = useState(String(postSettings.ocSpacingFt));
  const [firstBayDraft, setFirstBayDraft] = useState(String(postSettings.firstBayFromCornerOutsideFt));
  const [eaveInDraft, setEaveInDraft] = useState(() => inchesDraftFromFt(resolvedPosts.eaveWallPostWidthFt));
  const [gableInDraft, setGableInDraft] = useState(() => inchesDraftFromFt(resolvedPosts.gableWallPostWidthFt));
  const [doorJambInDraft, setDoorJambInDraft] = useState(() => inchesDraftFromFt(resolvedPosts.doorJambPostWidthFt));
  const [ohJambInDraft, setOhJambInDraft] = useState(() => inchesDraftFromFt(resolvedPosts.overheadJambPostWidthFt));
  const [addWalkDoorJambs, setAddWalkDoorJambs] = useState(resolvedPosts.addWalkDoorJambPosts);

  useEffect(() => {
    const s = getPerimeterPostSettings(plan);
    const r = resolvePerimeterPostSettings(plan);
    setOcDraft(String(s.ocSpacingFt));
    setFirstBayDraft(String(s.firstBayFromCornerOutsideFt));
    setEaveInDraft(inchesDraftFromFt(r.eaveWallPostWidthFt));
    setGableInDraft(inchesDraftFromFt(r.gableWallPostWidthFt));
    setDoorJambInDraft(inchesDraftFromFt(r.doorJambPostWidthFt));
    setOhJambInDraft(inchesDraftFromFt(r.overheadJambPostWidthFt));
    setAddWalkDoorJambs(r.addWalkDoorJambPosts);
  }, [plan.meta.rev, plan.perimeterPosts]);

  const applyPostSettings = useCallback(() => {
    const oc = parseFloat(ocDraft);
    const fb = parseFloat(firstBayDraft);
    const eIn = parseFloat(eaveInDraft);
    const gIn = parseFloat(gableInDraft);
    const dIn = parseFloat(doorJambInDraft);
    const oIn = parseFloat(ohJambInDraft);
    if (!Number.isFinite(oc) || !Number.isFinite(fb)) return;
    if (!Number.isFinite(eIn) || !Number.isFinite(gIn) || !Number.isFinite(dIn) || !Number.isFinite(oIn)) return;
    onOp?.({
      type: 'set_perimeter_posts',
      perimeterPosts: {
        ocSpacingFt: oc,
        firstBayFromCornerOutsideFt: fb,
        eaveWallPostWidthFt: eIn / 12,
        gableWallPostWidthFt: gIn / 12,
        doorJambPostWidthFt: dIn / 12,
        overheadJambPostWidthFt: oIn / 12,
        addWalkDoorJambPosts: addWalkDoorJambs,
      },
    });
  }, [ocDraft, firstBayDraft, eaveInDraft, gableInDraft, doorJambInDraft, ohJambInDraft, addWalkDoorJambs, onOp]);

  const zoomScrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = zoomScrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setZoom((z) => clamp(z * (e.deltaY < 0 ? 1.09 : 0.91), 0.35, 4));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setBox({ w: Math.max(360, r.width), h: Math.max(320, r.height) });
    });
    ro.observe(el);
    const r = el.getBoundingClientRect();
    setBox({ w: Math.max(360, r.width), h: Math.max(320, r.height) });
    return () => ro.disconnect();
  }, []);

  const lengthFt = plan.dims.length;
  const widthFt = plan.dims.width;
  const diagonalFt = Math.sqrt(lengthFt * lengthFt + widthFt * widthFt);

  const wallInsetFt = useMemo(() => {
    if (!plan.walls.length) return 0.5 / 12;
    const t = plan.walls.reduce((s, w) => s + (w.thickness || 0.5 / 12), 0) / plan.walls.length;
    return Math.max(0.25 / 12, t);
  }, [plan.walls]);

  const slots = useMemo(() => computePerimeterPostSlotsFromPlan(plan), [plan]);
  const wallById = useMemo(() => new Map(plan.walls.map((w) => [w.id, w] as const)), [plan.walls]);

  const layout = useMemo(() => {
    const headerH = 76;
    const footerH = 56;
    const dimOuter = 52;
    const dimPost = 22;
    const marginSide = 64;
    const marginTop = headerH + 10;
    const marginBot = footerH + dimOuter + dimPost + 28;

    const innerW = box.w - marginSide * 2;
    const innerH = Math.max(220, box.h - 52) - marginTop - marginBot;
    const s = Math.min(innerW / Math.max(lengthFt, 0.01), innerH / Math.max(widthFt, 0.01), 42);
    const pxPerFt = Math.max(7, s);

    const drawW = lengthFt * pxPerFt;
    const drawH = widthFt * pxPerFt;
    const totalH = marginTop + drawH + marginBot;

    const ox = marginSide + dimOuter + dimPost;
    const oy = marginTop + dimPost + 8;

    return {
      pxPerFt,
      drawW,
      drawH,
      ox,
      oy,
      marginSide,
      marginTop,
      totalW: box.w,
      totalH: Math.max(totalH, 480),
      headerH,
      dimOuter,
      dimPost,
    };
  }, [box.w, box.h, lengthFt, widthFt]);

  const { pxPerFt, drawW, drawH, ox, oy, marginSide, marginTop, totalW, totalH, headerH, dimOuter, dimPost } =
    layout;

  const insetPx = wallInsetFt * pxPerFt;
  const innerOx = ox + insetPx;
  const innerOy = oy + insetPx;
  const innerW = drawW - 2 * insetPx;
  const innerH = drawH - 2 * insetPx;

  const skirtInsetFt = SKIRT_BOARD_PAST_POST_FT;

  const frontAlongSorted = useMemo(
    () => slotsForEdge(slots, 'front').map((s) => s.along).sort((a, b) => a - b),
    [slots]
  );
  const backAlongSorted = useMemo(
    () => slotsForEdge(slots, 'back').map((s) => s.along).sort((a, b) => a - b),
    [slots]
  );
  const leftAlongSorted = useMemo(
    () => slotsForEdge(slots, 'left').map((s) => s.along).sort((a, b) => a - b),
    [slots]
  );
  const rightAlongSorted = useMemo(
    () => slotsForEdge(slots, 'right').map((s) => s.along).sort((a, b) => a - b),
    [slots]
  );

  const frontDimTicksPx = useMemo(() => {
    const t = buildPostLayoutDimensionTicksAlongFt(frontAlongSorted, widthFt, skirtInsetFt);
    if (t.length < 2) return [];
    return sortedDimTicksPxFront(t, oy, pxPerFt);
  }, [frontAlongSorted, widthFt, skirtInsetFt, oy, pxPerFt]);

  const backDimTicksPx = useMemo(() => {
    const t = buildPostLayoutDimensionTicksAlongFt(backAlongSorted, widthFt, skirtInsetFt);
    if (t.length < 2) return [];
    return sortedDimTicksPxBack(widthFt, lengthFt, t, oy, pxPerFt);
  }, [backAlongSorted, widthFt, lengthFt, skirtInsetFt, oy, pxPerFt]);

  const leftDimTicksPx = useMemo(() => {
    const t = buildPostLayoutDimensionTicksAlongFt(leftAlongSorted, lengthFt, skirtInsetFt);
    if (t.length < 2) return [];
    return sortedDimTicksPxLeft(lengthFt, t, ox, pxPerFt);
  }, [leftAlongSorted, lengthFt, skirtInsetFt, ox, pxPerFt]);

  const rightDimTicksPx = useMemo(() => {
    const t = buildPostLayoutDimensionTicksAlongFt(rightAlongSorted, lengthFt, skirtInsetFt);
    if (t.length < 2) return [];
    return sortedDimTicksPxRight(widthFt, t, ox, pxPerFt);
  }, [rightAlongSorted, widthFt, skirtInsetFt, ox, pxPerFt]);

  const uniquePosts = useMemo(() => {
    const m = new Map<string, { v: { x: number; y: number }; slots: PerimeterPostSlot[] }>();
    for (const s of slots) {
      const p = perimeterSlotToPlanPoint(s, plan.dims.width, plan.dims.length);
      const v = planToViewLengthX(p);
      const key = `${v.x.toFixed(2)}_${v.y.toFixed(2)}`;
      const cur = m.get(key);
      if (!cur) m.set(key, { v, slots: [s] });
      else cur.slots.push(s);
    }
    return Array.from(m.values());
  }, [slots, plan.dims.width, plan.dims.length]);

  const openingCallouts = useMemo(() => {
    const byWall = new Map<string, { o: (typeof plan.openings)[0]; idx: number }[]>();
    plan.openings.forEach((o) => {
      const w = wallById.get(o.wallId);
      if (!w) return;
      const arr = byWall.get(w.id) ?? [];
      arr.push({ o, idx: arr.length });
      byWall.set(w.id, arr);
    });
    const out: { key: string; lx: number; ly: number; tx: number; ty: number; text: string }[] = [];

    for (const [, arr] of byWall) {
      for (const { o, idx } of arr) {
        const wall = wallById.get(o.wallId);
        if (!wall) continue;
        const a = pointAlongWall(wall.start, wall.end, o.offset);
        const b = pointAlongWall(wall.start, wall.end, o.offset + o.width);
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const v = planToViewLengthX(mid);
        const px = ox + v.x * pxPerFt;
        const py = oy + v.y * pxPerFt;
        const { nx, ny } = inwardNormalForWall(plan, wall);
        const outPlan = { x: -nx, y: -ny };
        const vOutX = outPlan.y * pxPerFt;
        const vOutY = outPlan.x * pxPerFt;
        const len = Math.hypot(vOutX, vOutY) || 1;
        const base = 40 + idx * 18;
        const tx = px + (vOutX / len) * base;
        const ty = py + (vOutY / len) * base - (idx % 2) * 12;

        out.push({ key: o.id, lx: px, ly: py, tx, ty, text: openingLabel(o) });
      }
    }
    return out;
  }, [plan, plan.openings, wallById, ox, oy, pxPerFt]);

  const buildingRight = ox + drawW;
  const buildingBottom = oy + drawH;

  const yPostDimBottom = buildingBottom + dimPost;
  const yOverallBottom = buildingBottom + dimPost + dimOuter;
  const xPostDimLeft = ox - dimPost;
  const xOverallLeft = ox - dimPost - dimOuter;
  const yPostDimTop = oy - dimPost;
  const yOverallTop = oy - dimPost - dimOuter;
  const xPostDimRight = buildingRight + dimPost;
  const xOverallRight = buildingRight + dimPost + dimOuter;

  function printIt() {
    const svg = svgRef.current;
    if (!svg) return;
    printSvgFromElement(svg, `Post layout — ${plan.name}`, totalW, totalH);
  }

  function downloadIt() {
    const svg = svgRef.current;
    if (!svg) return;
    downloadSvgFromElement(svg, `${plan.name || 'plan'}-post-layout`);
  }

  return (
    <div ref={wrapRef} className={`flex flex-col gap-2 min-h-0 ${className}`}>
      {showActions ? (
        <div className="flex flex-col gap-2 shrink-0 print:hidden">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="text-xs font-medium rounded-md border border-slate-300 bg-white px-3 py-1.5 hover:bg-slate-50"
              onClick={printIt}
            >
              Print / Save PDF
            </button>
            <button
              type="button"
              className="text-xs font-medium rounded-md border border-slate-300 bg-white px-3 py-1.5 hover:bg-slate-50"
              onClick={downloadIt}
            >
              Download SVG
            </button>
            <div className="ml-auto flex flex-wrap items-center gap-1 rounded-md border border-slate-200 bg-white px-1 py-0.5">
              <button
                type="button"
                className="text-xs font-medium rounded px-2 py-1 hover:bg-slate-100"
                aria-label="Zoom out"
                onClick={() => setZoom((z) => clamp(z / 1.15, 0.35, 4))}
              >
                −
              </button>
              <span className="min-w-[2.75rem] text-center text-[11px] tabular-nums text-slate-600">
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                className="text-xs font-medium rounded px-2 py-1 hover:bg-slate-100"
                aria-label="Zoom in"
                onClick={() => setZoom((z) => clamp(z * 1.15, 0.35, 4))}
              >
                +
              </button>
              <button
                type="button"
                className="text-[11px] font-medium rounded px-2 py-1 text-slate-600 hover:bg-slate-100"
                onClick={() => setZoom(1)}
              >
                Reset
              </button>
            </div>
          </div>
          {(onOp || onEditOpeningsOnFloor) && (
            <div className="flex flex-wrap items-end gap-3 rounded-md border border-slate-100 bg-slate-50/80 px-2 py-2">
              {onOp ? (
                <div className="flex flex-wrap items-end gap-2">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">OC spacing (′)</span>
                    <Input
                      className="h-8 w-16 text-xs"
                      value={ocDraft}
                      onChange={(e) => setOcDraft(e.target.value)}
                      inputMode="decimal"
                    />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                      First bay from corner outside (′)
                    </span>
                    <Input
                      className="h-8 w-20 text-xs"
                      value={firstBayDraft}
                      onChange={(e) => setFirstBayDraft(e.target.value)}
                      inputMode="decimal"
                    />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Eave post (″)</span>
                    <Input
                      className="h-8 w-14 text-xs"
                      value={eaveInDraft}
                      onChange={(e) => setEaveInDraft(e.target.value)}
                      inputMode="decimal"
                    />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Gable post (″)</span>
                    <Input
                      className="h-8 w-14 text-xs"
                      value={gableInDraft}
                      onChange={(e) => setGableInDraft(e.target.value)}
                      inputMode="decimal"
                    />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Walk jamb (″)</span>
                    <Input
                      className="h-8 w-14 text-xs"
                      value={doorJambInDraft}
                      onChange={(e) => setDoorJambInDraft(e.target.value)}
                      inputMode="decimal"
                    />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">OH jamb (″)</span>
                    <Input
                      className="h-8 w-14 text-xs"
                      value={ohJambInDraft}
                      onChange={(e) => setOhJambInDraft(e.target.value)}
                      inputMode="decimal"
                    />
                  </div>
                  <div className="flex items-center gap-2 pt-4">
                    <Checkbox
                      id="walk-door-jamb-posts"
                      checked={addWalkDoorJambs}
                      onCheckedChange={(c) => setAddWalkDoorJambs(c === true)}
                    />
                    <Label htmlFor="walk-door-jamb-posts" className="text-[11px] font-normal cursor-pointer">
                      Walk-door jamb posts
                    </Label>
                  </div>
                  <button
                    type="button"
                    className="text-xs font-medium rounded-md border border-slate-300 bg-white px-3 py-1.5 hover:bg-slate-50 self-end"
                    onClick={applyPostSettings}
                  >
                    Apply posts
                  </button>
                </div>
              ) : null}
              {onEditOpeningsOnFloor ? (
                <div className="flex flex-wrap items-center gap-1.5 border-l border-slate-200 pl-3">
                  <span className="text-[11px] text-slate-600">
                    Openings ({plan.openings.length}) — place on{' '}
                    <span className="font-medium">Floor</span>:
                  </span>
                  <button
                    type="button"
                    className="text-xs font-medium rounded-md border border-slate-300 bg-white px-2 py-1 hover:bg-slate-50"
                    onClick={() => onEditOpeningsOnFloor('window')}
                  >
                    Window
                  </button>
                  <button
                    type="button"
                    className="text-xs font-medium rounded-md border border-slate-300 bg-white px-2 py-1 hover:bg-slate-50"
                    onClick={() => onEditOpeningsOnFloor('door')}
                  >
                    Door
                  </button>
                  <button
                    type="button"
                    className="text-xs font-medium rounded-md border border-slate-300 bg-white px-2 py-1 hover:bg-slate-50"
                    onClick={() => onEditOpeningsOnFloor('overhead')}
                  >
                    Overhead
                  </button>
                </div>
              ) : null}
            </div>
          )}
          <span className="text-[11px] text-slate-500">
            Post bays: 1½″ skirt inset each end · overall = skirt outside · Ctrl/⌘ + scroll to zoom · openings as callouts.
          </span>
        </div>
      ) : null}
      <div
        ref={zoomScrollRef}
        className="flex-1 min-h-0 overflow-auto rounded-md border border-slate-200 bg-slate-50 print:border-0"
      >
        <div
          className="inline-block"
          style={{
            width: totalW * zoom,
            height: totalH * zoom,
          }}
        >
          <svg
            ref={svgRef}
            width={totalW}
            height={totalH}
            viewBox={`0 0 ${totalW} ${totalH}`}
            className="block"
            style={{
              transform: `scale(${zoom})`,
              transformOrigin: 'top left',
            }}
            role="img"
            aria-label={`Post layout for ${plan.name}`}
          >
          <rect width={totalW} height={totalH} fill="#ffffff" />
          <rect x={0} y={0} width={totalW} height={headerH} fill="#f8fafc" stroke="#e2e8f0" strokeWidth={1} />
          <text x={marginSide} y={30} fontSize={17} fontWeight={700} fill={INK} fontFamily="ui-sans-serif, system-ui, sans-serif">
            Post layout
          </text>
          <text x={marginSide} y={50} fontSize={11.5} fill={INK_MUTED} fontFamily="ui-sans-serif, system-ui, sans-serif">
            {plan.name} · {postSettings.firstBayFromCornerOutsideFt}′ corner outside → first CL, then {postSettings.ocSpacingFt}′ OC · eave{' '}
            {formatArchitecturalFeetDetailed(resolvedPosts.eaveWallPostWidthFt)} · gable {formatArchitecturalFeetDetailed(resolvedPosts.gableWallPostWidthFt)}
            {resolvedPosts.addWalkDoorJambPosts ? ' · walk jambs' : ''} · Not for permit
          </text>
          <text x={marginSide} y={66} fontSize={9.5} fill="#94a3b8" fontFamily="ui-sans-serif, system-ui, sans-serif">
            {uniquePosts.length} posts · Rev {plan.meta.rev ?? 1} · {new Date(plan.meta.updatedAt).toLocaleDateString()}
          </text>

          {/* Outer shell */}
          <rect x={ox} y={oy} width={drawW} height={drawH} fill={WALL_FILL} stroke={INK} strokeWidth={1.75} />
          {/* Inner framing line */}
          <rect
            x={innerOx}
            y={innerOy}
            width={innerW}
            height={innerH}
            fill="none"
            stroke={INK_MUTED}
            strokeWidth={0.75}
            strokeDasharray="5 4"
            opacity={0.9}
          />

          {/* Squaring diagonal */}
          <line
            x1={ox}
            y1={oy}
            x2={buildingRight}
            y2={buildingBottom}
            stroke={INK_MUTED}
            strokeWidth={0.65}
            strokeDasharray="4 3"
            opacity={0.85}
          />
          <text
            x={(ox + buildingRight) / 2 - 36}
            y={(oy + buildingBottom) / 2 - 10}
            fontSize={8.5}
            fontWeight={600}
            fill={INK}
            fontFamily="ui-sans-serif, system-ui, sans-serif"
          >
            {formatArchitecturalFeetDetailed(diagonalFt)} diag check
          </text>

          {/* Opening gaps on outer line + callouts */}
          {plan.openings.map((o) => {
            const wall = wallById.get(o.wallId);
            if (!wall) return null;
            const a = pointAlongWall(wall.start, wall.end, o.offset);
            const b = pointAlongWall(wall.start, wall.end, o.offset + o.width);
            const av = planToViewLengthX(a);
            const bv = planToViewLengthX(b);
            const x1 = ox + av.x * pxPerFt;
            const y1 = oy + av.y * pxPerFt;
            const x2 = ox + bv.x * pxPerFt;
            const y2 = oy + bv.y * pxPerFt;
            const col = o.type === 'overhead_door' ? '#ea580c' : o.type === 'door' ? '#0284c7' : '#ca8a04';
            return (
              <line
                key={`og-${o.id}`}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={col}
                strokeWidth={5}
                strokeLinecap="butt"
                opacity={0.92}
              />
            );
          })}

          {openingCallouts.map((c) => (
            <g key={`oc-${c.key}`}>
              <line x1={c.lx} y1={c.ly} x2={c.tx} y2={c.ty} stroke={INK_MUTED} strokeWidth={0.55} />
              <circle cx={c.lx} cy={c.ly} r={2} fill={INK} />
              <text
                x={c.tx}
                y={c.ty}
                fontSize={7.5}
                fontWeight={600}
                fill={INK}
                stroke="#ffffff"
                strokeWidth={2.5}
                paintOrder="stroke fill"
                fontFamily="ui-sans-serif, system-ui, sans-serif"
              >
                {c.text}
              </text>
            </g>
          ))}

          {uniquePosts.map((u) => {
            const px = ox + u.v.x * pxPerFt;
            const py = oy + u.v.y * pxPerFt;
            const wFt = Math.max(...u.slots.map((s) => getSlotPostWidthFt(plan, s)));
            const r = Math.max(2.2, (wFt * pxPerFt) / 2);
            const primaryReason = primaryPostReason(u.slots);
            return (
              <g key={`${u.v.x}-${u.v.y}`}>
                <rect
                  x={px - r}
                  y={py - r}
                  width={r * 2}
                  height={r * 2}
                  fill={postFillClass(primaryReason)}
                  stroke="#fff"
                  strokeWidth={0.85}
                />
              </g>
            );
          })}

          <text
            x={ox - 8}
            y={oy + drawH / 2}
            textAnchor="end"
            fontSize={8}
            fontWeight={700}
            fill={INK_MUTED}
            transform={`rotate(-90 ${ox - 8} ${oy + drawH / 2})`}
            fontFamily="ui-sans-serif, system-ui, sans-serif"
          >
            FRONT
          </text>
          <text
            x={buildingRight + 8}
            y={oy + drawH / 2}
            textAnchor="start"
            fontSize={8}
            fontWeight={700}
            fill={INK_MUTED}
            transform={`rotate(-90 ${buildingRight + 8} ${oy + drawH / 2})`}
            fontFamily="ui-sans-serif, system-ui, sans-serif"
          >
            BACK
          </text>
          <text x={ox + drawW / 2} y={oy - 8} textAnchor="middle" fontSize={8} fontWeight={700} fill={INK_MUTED} fontFamily="ui-sans-serif, system-ui, sans-serif">
            LEFT
          </text>
          <text x={ox + drawW / 2} y={buildingBottom + 18} textAnchor="middle" fontSize={8} fontWeight={700} fill={INK_MUTED} fontFamily="ui-sans-serif, system-ui, sans-serif">
            RIGHT
          </text>

          {/* Post bay dimensions — post outside (inset from skirt) → CL → … → far post outside */}
          {frontDimTicksPx.length >= 2 ? (
            <VerticalPostChain
              keyPrefix="pf"
              xWall={ox}
              xDim={xPostDimLeft}
              tickPy={frontDimTicksPx}
              pxPerFt={pxPerFt}
            />
          ) : null}
          {backDimTicksPx.length >= 2 ? (
            <VerticalPostChain
              keyPrefix="pb"
              xWall={buildingRight}
              xDim={xPostDimRight}
              tickPy={backDimTicksPx}
              pxPerFt={pxPerFt}
            />
          ) : null}
          {leftDimTicksPx.length >= 2 ? (
            <HorizontalPostChain
              keyPrefix="pl"
              yWall={oy}
              yDim={yPostDimTop}
              tickPx={leftDimTicksPx}
              pxPerFt={pxPerFt}
            />
          ) : null}
          {rightDimTicksPx.length >= 2 ? (
            <HorizontalPostChain
              keyPrefix="pr"
              yWall={buildingBottom}
              yDim={yPostDimBottom}
              tickPx={rightDimTicksPx}
              pxPerFt={pxPerFt}
            />
          ) : null}

          {/* Overall building — skirt outside (plan OAL) */}
          <g>
            <line x1={ox} y1={yOverallBottom} x2={buildingRight} y2={yOverallBottom} stroke={INK} strokeWidth={1} />
            <line x1={ox} y1={yOverallBottom - 5} x2={ox} y2={yOverallBottom + 5} stroke={INK} strokeWidth={1} />
            <line x1={buildingRight} y1={yOverallBottom - 5} x2={buildingRight} y2={yOverallBottom + 5} stroke={INK} strokeWidth={1} />
            <text
              x={(ox + buildingRight) / 2}
              y={yOverallBottom + 14}
              textAnchor="middle"
              fontSize={10}
              fontWeight={700}
              fill={INK}
              fontFamily="ui-sans-serif, system-ui, sans-serif"
            >
              {formatArchitecturalFeetDetailed(lengthFt)}
            </text>
          </g>
          <g>
            <line x1={xOverallLeft} y1={oy} x2={xOverallLeft} y2={buildingBottom} stroke={INK} strokeWidth={1} />
            <line x1={xOverallLeft - 5} y1={oy} x2={xOverallLeft + 5} y2={oy} stroke={INK} strokeWidth={1} />
            <line x1={xOverallLeft - 5} y1={buildingBottom} x2={xOverallLeft + 5} y2={buildingBottom} stroke={INK} strokeWidth={1} />
            <text
              x={xOverallLeft - 12}
              y={(oy + buildingBottom) / 2}
              textAnchor="middle"
              fontSize={10}
              fontWeight={700}
              fill={INK}
              fontFamily="ui-sans-serif, system-ui, sans-serif"
              transform={`rotate(-90 ${xOverallLeft - 12} ${(oy + buildingBottom) / 2})`}
            >
              {formatArchitecturalFeetDetailed(widthFt)}
            </text>
          </g>

          <g transform={`translate(${marginSide}, ${totalH - 44})`}>
            <rect x={0} y={0} width={9} height={9} fill={POST_CORNER} stroke="#fff" strokeWidth={0.5} />
            <text x={14} y={8} fontSize={8.5} fill={INK} fontFamily="ui-sans-serif, system-ui, sans-serif">
              Corner
            </text>
            <rect x={68} y={0} width={9} height={9} fill={POST_OC} stroke="#fff" strokeWidth={0.5} />
            <text x={82} y={8} fontSize={8.5} fill={INK} fontFamily="ui-sans-serif, system-ui, sans-serif">
              {postSettings.ocSpacingFt}′ OC
            </text>
            <rect x={128} y={0} width={9} height={9} fill={POST_JAMB} stroke="#fff" strokeWidth={0.5} />
            <text x={142} y={8} fontSize={8.5} fill={INK} fontFamily="ui-sans-serif, system-ui, sans-serif">
              OH jamb
            </text>
          </g>

          <text x={marginSide} y={totalH - 14} fontSize={8} fill={INK_MUTED} fontFamily="ui-sans-serif, system-ui, sans-serif">
            Verify layout on site. Diagonal is a squaring check for rectangular footprint.
          </text>
        </svg>
        </div>
      </div>
    </div>
  );
}
