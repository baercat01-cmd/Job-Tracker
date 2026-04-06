import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { BuildingPlanModel } from '@/lib/buildingPlanModel';
import {
  formatArchitecturalFeet,
  formatArchitecturalFeetDetailed,
  formatFeetForPlan,
} from '@/lib/architecturalFormat';
import { downloadSvgFromElement, printSvgFromElement } from '@/lib/blueprintPrintUtils';
import { cn } from '@/lib/utils';

const STROKE = '#0f172a';
const STROKE_LIGHT = '#475569';
const CONCRETE = '#94a3b8';
const SOIL = '#c4a574';
const SKIRT = '#6b5344';
const NAILER = '#78350f';
const PANEL = '#b91c1c';

/** Optional field-reference dimensions (pole-barn style). Merge with defaults; plan dims still drive span / eave / pitch. */
export type CrossSectionDetail = {
  overhangFt: number;
  trussHeelFt: number;
  girtSpacingFt: number;
  sidingStartAboveGradeFt: number;
  skirtBoardHeightFt: number;
  slabThickFt: number;
  footerDepthFt: number;
  footerDiameterFt: number;
  purlinOCFt: number;
};

export const DEFAULT_CROSS_SECTION_DETAIL: CrossSectionDetail = {
  overhangFt: 1.5,
  trussHeelFt: 0.5,
  girtSpacingFt: 2,
  sidingStartAboveGradeFt: 4 / 12,
  skirtBoardHeightFt: 7.25 / 12,
  slabThickFt: 4.5 / 12,
  footerDepthFt: 4,
  footerDiameterFt: 1 + 1 / 3,
  purlinOCFt: 2,
};

function mergeSectionDetail(partial?: Partial<CrossSectionDetail>): CrossSectionDetail {
  return { ...DEFAULT_CROSS_SECTION_DETAIL, ...partial };
}

export type PlanCrossSectionPrintProps = {
  plan: BuildingPlanModel;
  className?: string;
  showActions?: boolean;
  sectionDetail?: Partial<CrossSectionDetail>;
  /** Use inside PlanSectionSheet pan/zoom: no inner scroll, natural SVG height */
  embedInPanZoom?: boolean;
};

export function PlanCrossSectionPrint({
  plan,
  className = '',
  showActions = true,
  sectionDetail: sectionDetailProp,
  embedInPanZoom = false,
}: PlanCrossSectionPrintProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [box, setBox] = useState({ w: 800, h: 520 });

  const detail = useMemo(() => mergeSectionDetail(sectionDetailProp), [sectionDetailProp]);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setBox({ w: Math.max(320, r.width), h: Math.max(300, r.height) });
    });
    ro.observe(el);
    const r = el.getBoundingClientRect();
    setBox({ w: Math.max(320, r.width), h: Math.max(300, r.height) });
    return () => ro.disconnect();
  }, []);

  const w = plan.dims.width;
  const h = plan.dims.height;
  const pitch = plan.dims.pitch;
  const oh = detail.overhangFt;
  const halfSpanFt = w / 2;
  const ridgeRise = (halfSpanFt + oh) * (pitch / 12);
  const maxLoftElev = useMemo(
    () => plan.lofts.reduce((m, lf) => Math.max(m, lf.elevation), 0),
    [plan.lofts]
  );

  const layout = useMemo(() => {
    const headerH = 76;
    const notesFooterH = 96;
    const marginSide = 44;
    const marginTop = headerH + 10;
    const leftSpecCol = Math.min(168, Math.max(112, box.w * 0.17));
    const rightSpecCol = Math.min(168, Math.max(112, box.w * 0.17));
    /** Extra plan-feet past CL so interior dimensions / callouts clear the right spec column */
    const interiorDimPadFt = 1.45;
    /** Pixels between drawing edge and spec note columns */
    const specTextGapPx = 20;

    const innerW = box.w - marginSide * 2 - leftSpecCol - rightSpecCol - 24;
    const innerH = box.h - marginTop - notesFooterH;
    const elevTop = h + ridgeRise + 0.85;
    const elevBottom = -(detail.slabThickFt + detail.footerDepthFt + 0.35);
    const worldV = elevTop - elevBottom;
    /** Horizontal model: overhang + half building width + pad for interior dimension ticks */
    const worldHFt = oh + halfSpanFt + interiorDimPadFt;
    /** Higher cap = sharper on-screen / print (was 38) */
    const sx = Math.min(innerW / Math.max(worldHFt, 0.01), innerH / Math.max(worldV, 0.01), 54);
    const pxPerFt = Math.max(12, sx);

    const drawH = worldV * pxPerFt;
    const graphicBaseX = marginSide + leftSpecCol;
    const baselineY = marginTop + 22 + elevTop * pxPerFt;
    const worldWidthPx = (oh + halfSpanFt + interiorDimPadFt) * pxPerFt;

    return {
      pxPerFt,
      drawH,
      graphicBaseX,
      baselineY,
      elevTop,
      elevBottom,
      marginSide,
      marginTop,
      totalW: box.w,
      totalH: Math.max(box.h, marginTop + drawH + notesFooterH + 56),
      headerH,
      worldWidthPx,
      specTextGapPx,
      leftSpecAnchorX: graphicBaseX - specTextGapPx,
      rightSpecAnchorX: graphicBaseX + worldWidthPx + specTextGapPx,
    };
  }, [box.w, box.h, h, ridgeRise, detail.slabThickFt, detail.footerDepthFt, halfSpanFt, oh]);

  const {
    pxPerFt,
    graphicBaseX,
    baselineY,
    elevBottom,
    marginSide,
    marginTop,
    totalW,
    totalH,
    headerH,
    worldWidthPx,
    leftSpecAnchorX,
    rightSpecAnchorX,
  } = layout;

  const ySvg = (elevFt: number) => baselineY - elevFt * pxPerFt;

  const xTip = graphicBaseX;
  const xWallOut = graphicBaseX + oh * pxPerFt;
  const xCL = graphicBaseX + (oh + halfSpanFt) * pxPerFt;
  const xInteriorDim = xCL + Math.min(28, 0.35 * pxPerFt);

  const yWallTop = ySvg(h);
  const yRidge = ySvg(h + ridgeRise);
  const slabThickPx = Math.max(3, detail.slabThickFt * pxPerFt);
  const footerDepthPx = detail.footerDepthFt * pxPerFt;
  const footerW = Math.max(6, detail.footerDiameterFt * pxPerFt);
  const postW = Math.max(5, 0.38 * pxPerFt);
  const ySkirtTop = ySvg(detail.skirtBoardHeightFt);
  const ySidingStart = ySvg(detail.sidingStartAboveGradeFt);
  const ySoilBottom = ySvg(elevBottom);
  const heelElev = h + detail.trussHeelFt;
  const yHeelTop = ySvg(heelElev);

  const postOuterX = xWallOut - postW * 0.15;
  const postInnerX = postOuterX + postW;

  const girtElevations = useMemo(() => {
    const out: number[] = [];
    for (let e = detail.girtSpacingFt; e < h - 0.12; e += detail.girtSpacingFt) {
      out.push(e);
    }
    return out;
  }, [detail.girtSpacingFt, h]);

  const wallDimLevels = useMemo(() => {
    const set = new Set<number>([0, ...girtElevations, h]);
    return [...set].filter((e) => e >= 0 && e <= h + 1e-6).sort((a, b) => a - b);
  }, [girtElevations, h]);

  function purlinTickGroup(x0: number, y0: number, x1: number, y1: number, keyPrefix: string) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const lenPx = Math.hypot(dx, dy) || 1;
    const lenFt = lenPx / pxPerFt;
    const n = Math.max(0, Math.floor(lenFt / detail.purlinOCFt));
    const ux = dx / lenPx;
    const uy = dy / lenPx;
    const px = -uy;
    const py = ux;
    const tick = Math.min(9, Math.max(4, 0.14 * pxPerFt));
    const nodes: ReactNode[] = [];
    for (let i = 1; i < n; i++) {
      const t = (i * detail.purlinOCFt * pxPerFt) / lenPx;
      if (t <= 0 || t >= 1) continue;
      const x = x0 + dx * t;
      const y = y0 + dy * t;
      nodes.push(
        <line
          key={`${keyPrefix}-${i}`}
          x1={x - px * tick}
          y1={y - py * tick}
          x2={x + px * tick}
          y2={y + py * tick}
          stroke={NAILER}
          strokeWidth={1.2}
        />
      );
    }
    return <g>{nodes}</g>;
  }

  const footerTopY = baselineY + slabThickPx;
  const yFooterBottom = baselineY + slabThickPx + footerDepthPx;
  const soilX0 = xTip - 20;
  const soilX1 = graphicBaseX + worldWidthPx + 6;

  const specLineH = 12;
  const specStartY = yWallTop + Math.max(24, (ridgeRise * pxPerFt) * 0.15);
  const leftSpecs = [
    `Roof: metal panel · ${pitch}/12 pitch`,
    `Purlins: nailers @ ${formatFeetForPlan(detail.purlinOCFt)} O.C.`,
    `Wall: metal panel · girts 2× (schematic)`,
    `Girts / nailers @ ${formatFeetForPlan(detail.girtSpacingFt)} O.C.`,
    `Skirt: treated · bottom @ grade`,
    `Siding begins ${formatArchitecturalFeet(detail.sidingStartAboveGradeFt)} above FF`,
  ];
  const rightSpecs = [
    `Truss heel ${formatArchitecturalFeet(detail.trussHeelFt)}`,
    `Overhang ${formatArchitecturalFeet(oh)}`,
    `Half width to CL ${formatFeetForPlan(halfSpanFt)} (bldg ${formatFeetForPlan(w)})`,
    `Footer ${formatArchitecturalFeet(detail.footerDepthFt)} × dia ${formatArchitecturalFeet(detail.footerDiameterFt)}`,
    `Slab ${formatArchitecturalFeet(detail.slabThickFt)}`,
    `Verify posts & uplift with engineer`,
  ];

  function printIt() {
    const svg = svgRef.current;
    if (!svg) return;
    printSvgFromElement(svg, `Cross section — ${plan.name}`, totalW, totalH);
  }

  function downloadIt() {
    const svg = svgRef.current;
    if (!svg) return;
    downloadSvgFromElement(svg, `${plan.name || 'plan'}-cross-section`);
  }

  const dimLeftX = xTip - 32;
  const girtTickLen = Math.min(10, 0.12 * pxPerFt);

  return (
    <div ref={wrapRef} className={cn('flex flex-col gap-2 min-h-0', className)}>
      {showActions ? (
        <div className="flex flex-wrap items-center gap-2 shrink-0 print:hidden">
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
          <span className="text-[11px] text-slate-500">
            Half section: exterior + overhang → centerline / ridge (sym.) · field reference, not engineered.
          </span>
        </div>
      ) : null}
      <div
        className={cn(
          'rounded-md border border-slate-200 bg-white',
          embedInPanZoom ? 'shrink-0 overflow-visible' : 'min-h-0 flex-1 overflow-auto'
        )}
      >
        <svg
          ref={svgRef}
          width={totalW}
          height={totalH}
          viewBox={`0 0 ${totalW} ${totalH}`}
          className={cn('block h-auto', embedInPanZoom ? 'max-w-none' : 'max-w-full')}
          shapeRendering="geometricPrecision"
          textRendering="optimizeLegibility"
          role="img"
          aria-label={`Cross section for ${plan.name}`}
        >
          <rect width={totalW} height={totalH} fill="#fff" />
          <rect x={0} y={0} width={totalW} height={headerH} fill="#f8fafc" stroke={STROKE_LIGHT} strokeWidth={1} />
          <text
            x={totalW / 2}
            y={30}
            textAnchor="middle"
            fontSize={17}
            fontWeight={700}
            fill={STROKE}
            fontFamily="ui-sans-serif, system-ui, sans-serif"
          >
            Cross section — half (transverse)
          </text>
          <text
            x={marginSide}
            y={50}
            fontSize={11}
            fill={STROKE_LIGHT}
            fontFamily="ui-sans-serif, system-ui, sans-serif"
          >
            {plan.name}
          </text>
          <text
            x={totalW - marginSide}
            y={50}
            textAnchor="end"
            fontSize={10}
            fill="#94a3b8"
            fontFamily="ui-sans-serif, system-ui, sans-serif"
          >
            {new Date(plan.meta.updatedAt).toLocaleDateString()} · Rev {plan.meta.rev ?? 1}
          </text>
          <text x={marginSide} y={66} fontSize={10} fill="#94a3b8" fontFamily="ui-sans-serif, system-ui, sans-serif">
            Eave {formatFeetForPlan(h)} · {pitch}/12 · ridge rise {formatFeetForPlan(ridgeRise)} over half span + OH
          </text>

          {/* Spec columns */}
          {leftSpecs.map((line, i) => (
            <text
              key={`ls-${i}`}
              x={leftSpecAnchorX}
              y={specStartY + i * specLineH}
              textAnchor="end"
              fontSize={9}
              fill={STROKE}
              fontFamily="ui-sans-serif, system-ui, sans-serif"
            >
              {line}
            </text>
          ))}
          {rightSpecs.map((line, i) => (
            <text
              key={`rs-${i}`}
              x={rightSpecAnchorX}
              y={specStartY + i * specLineH}
              textAnchor="start"
              fontSize={9}
              fill={STROKE}
              fontFamily="ui-sans-serif, system-ui, sans-serif"
            >
              {line}
            </text>
          ))}

          {/* Soil */}
          <rect
            x={soilX0}
            y={footerTopY}
            width={Math.max(0, soilX1 - soilX0)}
            height={Math.max(0, ySoilBottom - footerTopY)}
            fill={SOIL}
            opacity={0.55}
          />
          <line x1={soilX0} y1={baselineY} x2={soilX1} y2={baselineY} stroke="#22c55e" strokeWidth={1.3} />
          <text x={xTip - 8} y={baselineY - 4} fontSize={8} fill="#15803d" fontFamily="ui-sans-serif, system-ui, sans-serif">
            Grade
          </text>

          {/* Slab (half width) */}
          <rect
            x={xWallOut}
            y={baselineY}
            width={xCL - xWallOut}
            height={slabThickPx}
            fill={CONCRETE}
            opacity={0.8}
            stroke={STROKE_LIGHT}
            strokeWidth={0.6}
          />
          <text
            x={(xWallOut + xCL) / 2}
            y={baselineY + slabThickPx + 12}
            textAnchor="middle"
            fontSize={8}
            fill={STROKE_LIGHT}
            fontFamily="ui-sans-serif, system-ui, sans-serif"
          >
            Slab {formatArchitecturalFeet(detail.slabThickFt)}
          </text>
          <line x1={xWallOut - 6} y1={baselineY} x2={xCL + 6} y2={baselineY} stroke={STROKE} strokeWidth={1} strokeDasharray="4 3" />
          <text x={xWallOut} y={baselineY - 5} fontSize={9} fill={STROKE_LIGHT} fontFamily="ui-sans-serif, system-ui, sans-serif">
            Finish floor (0′)
          </text>

          {/* Footer pier under post */}
          <rect
            x={postOuterX + postW / 2 - footerW / 2}
            y={footerTopY}
            width={footerW}
            height={footerDepthPx}
            fill={CONCRETE}
            stroke={STROKE}
            strokeWidth={1}
          />
          <text
            x={postOuterX + postW / 2}
            y={yFooterBottom + 11}
            textAnchor="middle"
            fontSize={8}
            fill={STROKE_LIGHT}
            fontFamily="ui-sans-serif, system-ui, sans-serif"
          >
            Footer {formatArchitecturalFeet(detail.footerDepthFt)} deep · dia {formatArchitecturalFeet(detail.footerDiameterFt)}
          </text>

          {/* Wall panel (exterior sheathing hint) */}
          <rect
            x={postOuterX - 3}
            y={yWallTop}
            width={3}
            height={baselineY - yWallTop}
            fill={PANEL}
            opacity={0.85}
          />

          {/* Wall fill (half) */}
          <rect
            x={postInnerX}
            y={yWallTop}
            width={xCL - postInnerX}
            height={baselineY - yWallTop}
            fill="#e2e8f0"
            stroke={STROKE}
            strokeWidth={1.2}
          />
          <rect
            x={postInnerX}
            y={ySkirtTop}
            width={xCL - postInnerX}
            height={baselineY - ySkirtTop}
            fill={SKIRT}
            opacity={0.88}
          />
          <text
            x={postInnerX + (xCL - postInnerX) / 2}
            y={(ySkirtTop + baselineY) / 2 + 3}
            textAnchor="middle"
            fontSize={7.5}
            fill="#f8fafc"
            fontWeight={600}
            fontFamily="ui-sans-serif, system-ui, sans-serif"
          >
            Skirt
          </text>
          <line
            x1={postInnerX}
            y1={ySidingStart}
            x2={xCL}
            y2={ySidingStart}
            stroke={STROKE_LIGHT}
            strokeWidth={0.65}
            strokeDasharray="4 3"
          />

          {/* Girts: lines + exterior nailer ticks */}
          {girtElevations.map((elev) => {
            const yy = ySvg(elev);
            return (
              <g key={`girt-${elev}`}>
                <line
                  x1={postInnerX}
                  y1={yy}
                  x2={xCL - 1}
                  y2={yy}
                  stroke={NAILER}
                  strokeWidth={1.35}
                />
                <rect
                  x={postOuterX - girtTickLen - 2}
                  y={yy - 2}
                  width={girtTickLen}
                  height={4}
                  fill={NAILER}
                  opacity={0.9}
                />
              </g>
            );
          })}

          {/* Column */}
          <rect
            x={postOuterX}
            y={yWallTop}
            width={postW}
            height={baselineY - yWallTop}
            fill="#c4a484"
            stroke={STROKE}
            strokeWidth={0.85}
          />

          {/* Heel (eave) */}
          <rect
            x={xTip}
            y={yHeelTop}
            width={xWallOut - xTip}
            height={yWallTop - yHeelTop}
            fill="#cbd5e1"
            opacity={0.45}
            stroke="none"
          />

          {/* Roof plane */}
          <line x1={xTip} y1={yWallTop} x2={xCL} y2={yRidge} stroke={STROKE} strokeWidth={2.2} />
          {purlinTickGroup(xTip, yWallTop, xCL, yRidge, 'p')}
          <line
            x1={xTip}
            y1={yWallTop + 2}
            x2={xWallOut}
            y2={yWallTop + 2}
            stroke="#57534e"
            strokeWidth={1.5}
            opacity={0.9}
          />
          <text x={(xTip + xCL) / 2} y={yRidge - 8} textAnchor="middle" fontSize={7.5} fill={NAILER} fontWeight={600} fontFamily="ui-sans-serif, system-ui, sans-serif">
            Purlins @ {formatFeetForPlan(detail.purlinOCFt)} O.C.
          </text>

          {/* Centerline */}
          <line
            x1={xCL}
            y1={ySoilBottom + 4}
            x2={xCL}
            y2={yRidge - 4}
            stroke={STROKE_LIGHT}
            strokeWidth={0.85}
            strokeDasharray="6 4"
          />
          <text
            x={xCL + 5}
            y={(yWallTop + baselineY) / 2}
            fontSize={8}
            fill={STROKE_LIGHT}
            fontFamily="ui-sans-serif, system-ui, sans-serif"
          >
            Centerline (sym.)
          </text>

          {/* Loft */}
          {maxLoftElev > 0.01 && maxLoftElev < h + ridgeRise ? (
            <g>
              <line
                x1={postInnerX}
                y1={ySvg(maxLoftElev)}
                x2={xCL}
                y2={ySvg(maxLoftElev)}
                stroke="#0369a1"
                strokeWidth={1.2}
                strokeDasharray="6 4"
              />
              <text
                x={xCL - 4}
                y={ySvg(maxLoftElev) - 4}
                textAnchor="end"
                fontSize={8}
                fill="#0369a1"
                fontWeight={600}
                fontFamily="ui-sans-serif, system-ui, sans-serif"
              >
                Loft {formatFeetForPlan(maxLoftElev)}
              </text>
            </g>
          ) : null}

          {/* Vertical girt / wall segment dimensions (exterior / left) */}
          {wallDimLevels.length >= 2
            ? wallDimLevels.slice(0, -1).map((a, idx) => {
                const b = wallDimLevels[idx + 1];
                const ya = ySvg(a);
                const yb = ySvg(b);
                const yTop = Math.min(ya, yb);
                const yBot = Math.max(ya, yb);
                const mid = (yTop + yBot) / 2;
                const segFt = b - a;
                if (segFt < 1e-6) return null;
                return (
                  <g key={`wd-${a}-${b}`}>
                    <line x1={dimLeftX} y1={yTop} x2={dimLeftX} y2={yBot} stroke={STROKE} strokeWidth={0.75} />
                    <line x1={dimLeftX - 4} y1={yTop} x2={dimLeftX + 4} y2={yTop} stroke={STROKE} strokeWidth={0.75} />
                    <line x1={dimLeftX - 4} y1={yBot} x2={dimLeftX + 4} y2={yBot} stroke={STROKE} strokeWidth={0.75} />
                    <text
                      x={dimLeftX - 7}
                      y={mid}
                      textAnchor="end"
                      fontSize={7.5}
                      fontWeight={500}
                      fill={STROKE}
                      fontFamily="ui-sans-serif, system-ui, sans-serif"
                      transform={`rotate(-90 ${dimLeftX - 7} ${mid})`}
                    >
                      {formatArchitecturalFeetDetailed(segFt)}
                    </text>
                  </g>
                );
              })
            : null}

          {/* Interior wall / height (right of CL) */}
          <g>
            <line x1={xInteriorDim} y1={baselineY} x2={xInteriorDim} y2={yWallTop} stroke={STROKE} strokeWidth={0.85} />
            <line x1={xInteriorDim - 4} y1={baselineY} x2={xInteriorDim + 4} y2={baselineY} stroke={STROKE} strokeWidth={0.85} />
            <line x1={xInteriorDim - 4} y1={yWallTop} x2={xInteriorDim + 4} y2={yWallTop} stroke={STROKE} strokeWidth={0.85} />
            <text
              x={xInteriorDim + 8}
              y={(baselineY + yWallTop) / 2}
              fontSize={9}
              fontWeight={600}
              fill={STROKE}
              fontFamily="ui-sans-serif, system-ui, sans-serif"
              transform={`rotate(-90 ${xInteriorDim + 8} ${(baselineY + yWallTop) / 2})`}
            >
              {formatArchitecturalFeetDetailed(h)} wall (int.)
            </text>
          </g>

          {/* Half span to CL (horizontal) */}
          <g>
            <line x1={xWallOut} y1={baselineY + 22} x2={xCL} y2={baselineY + 22} stroke={STROKE} strokeWidth={1} />
            <line x1={xWallOut} y1={baselineY + 16} x2={xWallOut} y2={baselineY + 28} stroke={STROKE} strokeWidth={1} />
            <line x1={xCL} y1={baselineY + 16} x2={xCL} y2={baselineY + 28} stroke={STROKE} strokeWidth={1} />
            <text
              x={(xWallOut + xCL) / 2}
              y={baselineY + 38}
              textAnchor="middle"
              fontSize={10}
              fontWeight={600}
              fill={STROKE}
              fontFamily="ui-sans-serif, system-ui, sans-serif"
            >
              {formatFeetForPlan(halfSpanFt)} to CL · {formatFeetForPlan(w)} o.a.
            </text>
          </g>

          {/* Overhang */}
          <g>
            <line x1={xTip} y1={yWallTop + 18} x2={xWallOut} y2={yWallTop + 18} stroke={STROKE} strokeWidth={0.9} />
            <line x1={xTip} y1={yWallTop + 12} x2={xTip} y2={yWallTop + 24} stroke={STROKE} strokeWidth={0.9} />
            <line x1={xWallOut} y1={yWallTop + 12} x2={xWallOut} y2={yWallTop + 24} stroke={STROKE} strokeWidth={0.9} />
            <text
              x={(xTip + xWallOut) / 2}
              y={yWallTop + 30}
              textAnchor="middle"
              fontSize={9}
              fontWeight={600}
              fill={STROKE}
              fontFamily="ui-sans-serif, system-ui, sans-serif"
            >
              Overhang {formatArchitecturalFeet(oh)}
            </text>
          </g>

          {/* Rise */}
          <g>
            <line x1={xCL - 18} y1={yWallTop} x2={xCL - 18} y2={yRidge} stroke={STROKE_LIGHT} strokeWidth={0.75} strokeDasharray="3 2" />
            <line x1={xCL - 24} y1={yWallTop} x2={xCL - 12} y2={yWallTop} stroke={STROKE_LIGHT} strokeWidth={0.65} />
            <line x1={xCL - 24} y1={yRidge} x2={xCL - 12} y2={yRidge} stroke={STROKE_LIGHT} strokeWidth={0.65} />
            <text
              x={xCL - 22}
              y={(yWallTop + yRidge) / 2}
              fontSize={9}
              fill={STROKE_LIGHT}
              fontFamily="ui-sans-serif, system-ui, sans-serif"
              textAnchor="end"
              transform={`rotate(-90 ${xCL - 22} ${(yWallTop + yRidge) / 2})`}
            >
              Rise {formatFeetForPlan(ridgeRise)} ({pitch}/12)
            </text>
          </g>

          {detail.trussHeelFt > 1e-6 ? (
            <g>
              <line x1={xWallOut + 14} y1={yHeelTop} x2={xWallOut + 14} y2={yWallTop} stroke={STROKE} strokeWidth={0.85} />
              <line x1={xWallOut + 8} y1={yHeelTop} x2={xWallOut + 20} y2={yHeelTop} stroke={STROKE} strokeWidth={0.85} />
              <line x1={xWallOut + 8} y1={yWallTop} x2={xWallOut + 20} y2={yWallTop} stroke={STROKE} strokeWidth={0.85} />
              <text
                x={xWallOut + 22}
                y={(yHeelTop + yWallTop) / 2}
                fontSize={8}
                fontWeight={600}
                fill={STROKE}
                fontFamily="ui-sans-serif, system-ui, sans-serif"
                transform={`rotate(-90 ${xWallOut + 22} ${(yHeelTop + yWallTop) / 2})`}
              >
                Heel {formatArchitecturalFeet(detail.trussHeelFt)}
              </text>
            </g>
          ) : null}

          <text
            x={marginSide}
            y={totalH - 28}
            fontSize={9}
            fill="#64748b"
            fontFamily="ui-sans-serif, system-ui, sans-serif"
          >
            Half building; mirror at centerline. Length runs into the page. Not to scale for bracing or openings.
          </text>
          <text
            x={marginSide}
            y={totalH - 12}
            fontSize={8}
            fill="#94a3b8"
            fontFamily="ui-sans-serif, system-ui, sans-serif"
          >
            Not for permit. Confirm truss, posts, and foundation with supplier / engineer.
          </text>
        </svg>
      </div>
    </div>
  );
}
