import { useId, useMemo } from 'react';
import { getPerimeterPostSettings, type BuildingPlanModel, type PlanOpening, type PlanViewSide } from '@/lib/buildingPlanModel';
import { formatArchitecturalFeetDetailed, formatFeetForPlan } from '@/lib/architecturalFormat';
import { ELEVATION_METAL_PANEL_MODULE_FT } from '@/lib/elevationMetalCutList';
import { getSlotPostWidthFt, perimeterPostSlotsForViewSide } from '@/lib/perimeterPostLayout';
import { cn } from '@/lib/utils';

const INK = '#0f172a';
const INK_MUTED = '#64748b';
const STUD = '#c4a484';
const STUD_DARK = '#5c3d1e';
const SHEATHING = '#e8e4dc';
const SLAB = '#94a3b8';
/** Neutral sheet-metal (no color fill — reads as gray line art) */
const METAL_BASE = '#e4e4e7';
const METAL_RIB = '#52525b';
const METAL_HIGHLIGHT = '#a1a1aa';
const GLASS = '#93c5fd';
const GLASS_STROKE = '#2563eb';

const GIRT_SPACING_FT = 2;
const METAL_PANEL_WIDTH_FT = ELEVATION_METAL_PANEL_MODULE_FT;

function openingPalette(o: PlanOpening): { fill: string; stroke: string } {
  if (o.type === 'overhead_door') return { fill: '#fed7aa', stroke: '#c2410c' };
  if (o.type === 'door') return { fill: '#bae6fd', stroke: '#0369a1' };
  return { fill: '#fef08a', stroke: '#a16207' };
}

function openingLabel(o: PlanOpening): string {
  if (o.type === 'overhead_door') return `OH ${formatFeetForPlan(o.width)}×${formatFeetForPlan(o.height)}`;
  if (o.type === 'door') return `Door ${formatFeetForPlan(o.width)}×${formatFeetForPlan(o.height)}`;
  return `Wnd ${formatFeetForPlan(o.width)}×${formatFeetForPlan(o.height)} sill ${formatFeetForPlan(o.sill)}`;
}

function girtElevationsFt(wallHtFt: number): number[] {
  const out: number[] = [];
  for (let e = GIRT_SPACING_FT; e < wallHtFt - 0.08; e += GIRT_SPACING_FT) {
    out.push(e);
  }
  return out;
}

/** Ridge runs along the longer plan axis → gable on the two ends perpendicular to that. */
function isGableEndWall(side: PlanViewSide, widthFt: number, lengthFt: number): boolean {
  if (side !== 'Front' && side !== 'Back' && side !== 'Left' && side !== 'Right') return false;
  if (Math.abs(widthFt - lengthFt) < 1e-6) return side === 'Front' || side === 'Back';
  if (lengthFt >= widthFt) return side === 'Front' || side === 'Back';
  return side === 'Left' || side === 'Right';
}

type OpeningGeom = {
  o: PlanOpening;
  x: number;
  y: number;
  ww: number;
  hh: number;
};

/**
 * Full-wall elevation: framing, 3′ metal modules (optional), eave or gable roof profile.
 */
export function PlanWallElevationDraw(props: {
  plan: BuildingPlanModel;
  side: PlanViewSide;
  runLength?: number;
  className?: string;
  showMetalPanels?: boolean;
  /** `full` = dedicated elevation tab (wider); `compact` = grid on section sheet */
  variant?: 'compact' | 'full';
}) {
  const {
    plan,
    side,
    runLength = 520,
    className = '',
    showMetalPanels = true,
    variant = 'compact',
  } = props;
  const maskUid = useId().replace(/:/g, '');

  const w = plan.dims.width;
  const l = plan.dims.length;
  const h = plan.dims.height;
  const pitch = plan.dims.pitch;

  const wallLabel =
    side === 'Front' || side === 'Back' || side === 'Left' || side === 'Right' ? side : 'Front';

  const wall = plan.walls.find((ww) => ww.label === wallLabel) ?? null;

  const wallRunFt = side === 'Left' || side === 'Right' ? l : w;
  const isGable = isGableEndWall(side, w, l);
  const ridgeRiseFt = isGable ? (wallRunFt / 2) * (pitch / 12) : 0;

  const openings = useMemo(() => {
    if (!wall) return [];
    return plan.openings.filter((o) => o.wallId === wall.id);
  }, [plan.openings, wall]);

  const marginL = 56;
  const marginR = 36;
  const headerH = 50;
  const marginB = 58;
  const wallH = Math.max(160, Math.min(240, h * 10));
  const pxPerFtVert = wallH / Math.max(h, 0.01);
  const gableRisePx = ridgeRiseFt * pxPerFtVert;
  const marginT = headerH + gableRisePx;

  const wy0 = marginT;
  const wy1 = marginT + wallH;
  const wW = runLength;
  const wH = wy1 - wy0;
  const peakY = headerH;
  const peakX = marginL + runLength / 2;

  const wx0 = marginL;
  const wx1 = marginL + runLength;
  const vbW = marginL + runLength + marginR;
  const vbH = wy1 + marginB;

  const maskId = `wall-metal-mask-${wallLabel}-${maskUid}`;
  const clipWallId = `wall-clip-${wallLabel}-${maskUid}`;

  const wallFacePathD = isGable
    ? `M ${wx0} ${wy1} L ${wx1} ${wy1} L ${wx1} ${wy0} L ${peakX} ${peakY} L ${wx0} ${wy0} Z`
    : `M ${wx0} ${wy1} L ${wx1} ${wy1} L ${wx1} ${wy0} L ${wx0} ${wy0} Z`;

  const openingGeoms: OpeningGeom[] = useMemo(() => {
    return openings.map((o) => {
      const x = wx0 + (o.offset / wallRunFt) * wW;
      const ww = Math.max(4, (o.width / wallRunFt) * wW);
      const topFromFF = o.sill + o.height;
      const yTop = wy1 - (topFromFF / h) * wH;
      const yBot = wy1 - (o.sill / h) * wH;
      const hh = Math.max(4, yBot - yTop);
      return { o, x, y: yTop, ww, hh };
    });
  }, [openings, wallRunFt, h, wW, wH, wx0, wy1]);

  const postSlots = useMemo(
    () => (wall ? perimeterPostSlotsForViewSide(plan, wallLabel as PlanViewSide) : []),
    [plan, wall, wallLabel]
  );
  const postOcFt = getPerimeterPostSettings(plan).ocSpacingFt;
  const girtsFt = useMemo(() => girtElevationsFt(h), [h]);

  const ftToY = (elevFromFF: number) => wy1 - (elevFromFF / h) * wH;
  const ftToX = (alongFt: number) => wx0 + (alongFt / wallRunFt) * wW;

  const panelSeamFt = METAL_PANEL_WIDTH_FT;

  const panelSeamsPx = useMemo(() => {
    const seams: number[] = [];
    for (let d = 0; d <= wallRunFt + 1e-6; d += panelSeamFt) {
      seams.push(wx0 + (d / wallRunFt) * wW);
    }
    return seams;
  }, [wallRunFt, wW, wx0]);

  const studStroke = showMetalPanels ? 0.45 : 0.85;
  const studOpacity = showMetalPanels ? 0.95 : 1;
  const sheathFill = showMetalPanels ? SHEATHING : '#f5f0e6';

  return (
    <div
      className={cn(
        'w-full shrink-0',
        variant === 'full' ? 'w-full max-w-none' : 'max-w-[640px]',
        className
      )}
    >
      <svg
        viewBox={`0 0 ${vbW} ${vbH}`}
        className="h-auto w-full border border-slate-200 bg-white shadow-sm"
        role="img"
        aria-label={`${wallLabel} wall elevation${showMetalPanels ? '' : ', framing only'}`}
      >
        <defs>
          <clipPath id={clipWallId} clipPathUnits="userSpaceOnUse">
            <path d={wallFacePathD} />
          </clipPath>
          <mask id={maskId} maskUnits="userSpaceOnUse">
            <path d={wallFacePathD} fill="white" />
            {openingGeoms.map(({ o, x, y, ww, hh }) => (
              <rect key={`mh-${o.id}`} x={x - 0.5} y={y - 0.5} width={ww + 1} height={hh + 1} fill="black" />
            ))}
          </mask>
        </defs>

        <rect x={0} y={0} width={vbW} height={vbH} fill="#fff" />
        <text
          x={vbW / 2}
          y={22}
          textAnchor="middle"
          fontSize={13}
          fontWeight={700}
          fill={INK}
          fontFamily="ui-sans-serif, system-ui, sans-serif"
        >
          {wallLabel} elevation {isGable ? '(gable end)' : '(eave side)'}
        </text>
        <text
          x={vbW / 2}
          y={38}
          textAnchor="middle"
          fontSize={8.5}
          fill={INK_MUTED}
          fontFamily="ui-sans-serif, system-ui, sans-serif"
        >
          {formatArchitecturalFeetDetailed(wallRunFt)} run · {formatFeetForPlan(h)} eave · {pitch}/12
          {isGable ? ` · peak +${formatFeetForPlan(ridgeRiseFt)}` : ''} ·{' '}
          {showMetalPanels ? `${METAL_PANEL_WIDTH_FT}′ panel seams (gray)` : 'framing / sheathing — metal hidden'}
        </text>

        <text x={wx0} y={headerH - 8} fontSize={6.5} fill={INK_MUTED} fontFamily="ui-sans-serif, system-ui, sans-serif">
          Posts {postOcFt}′ OC (plan) · Girts {GIRT_SPACING_FT}′ O.C. · Use “Framing only” above to hide metal skin
        </text>

        {/* Grade / slab */}
        <rect x={wx0 - 4} y={wy1} width={wW + 8} height={10} fill={SLAB} opacity={0.8} stroke={INK_MUTED} strokeWidth={0.5} />
        <line x1={wx0 - 8} y1={wy1} x2={wx1 + 8} y2={wy1} stroke="#22c55e" strokeWidth={1} />
        <text x={wx0 - 6} y={wy1 - 4} fontSize={7} fill="#15803d" fontFamily="ui-sans-serif, system-ui, sans-serif">
          Grade
        </text>

        {/* Sheathing */}
        <path d={wallFacePathD} fill={sheathFill} stroke={INK} strokeWidth={showMetalPanels ? 1.2 : 1.5} />

        {/* Gable rake framing (outline) */}
        {isGable ? (
          <g fill="none" stroke={STUD_DARK} strokeWidth={1.2} opacity={0.95}>
            <line x1={wx0} y1={wy0} x2={peakX} y2={peakY} />
            <line x1={wx1} y1={wy0} x2={peakX} y2={peakY} />
            <line x1={peakX} y1={peakY} x2={peakX} y2={wy0 - 2} strokeDasharray="3 2" opacity={0.5} />
          </g>
        ) : null}

        {/* Posts — clip to wall face; extend to eave line (gable triangle above uses rake lines) */}
        <g clipPath={`url(#${clipWallId})`}>
          {postSlots.map((slot) => {
            const cx = ftToX(slot.along);
            const wFt = getSlotPostWidthFt(plan, slot);
            const postWpx = Math.max(2.5, (wFt / wallRunFt) * wW);
            return (
              <rect
                key={`post-${slot.edge}-${slot.along}-${slot.reason}`}
                x={cx - postWpx / 2}
                y={wy0}
                width={postWpx}
                height={wy1 - wy0}
                fill={STUD}
                stroke={STUD_DARK}
                strokeWidth={studStroke}
                opacity={studOpacity}
              />
            );
          })}
        </g>

        {/* Girts (below eave only) */}
        <g clipPath={`url(#${clipWallId})`}>
          {girtsFt.map((elev) => {
            const yy = ftToY(elev);
            return (
              <line
                key={`girt-${elev}`}
                x1={wx0}
                y1={yy}
                x2={wx1}
                y2={yy}
                stroke={STUD_DARK}
                strokeWidth={showMetalPanels ? 1.1 : 1.45}
                opacity={0.95}
              />
            );
          })}
        </g>

        {/* Double top plate at eave */}
        <g clipPath={`url(#${clipWallId})`}>
          <line x1={wx0} y1={wy0 + 2} x2={wx1} y2={wy0 + 2} stroke={STUD_DARK} strokeWidth={2.2} />
          <line x1={wx0} y1={wy0 + 5} x2={wx1} y2={wy0 + 5} stroke={STUD_DARK} strokeWidth={1.6} />
        </g>

        {/* Metal: 3′ panel seams + subtle ribs within panel */}
        {showMetalPanels ? (
          <g mask={`url(#${maskId})`} opacity={0.95}>
            <path d={wallFacePathD} fill={METAL_BASE} stroke={METAL_RIB} strokeWidth={0.35} />
            {panelSeamsPx.map((xi, i) => (
              <line
                key={`seam-${i}`}
                x1={xi}
                y1={isGable ? interpolateGableTopY(xi, wx0, wx1, peakX, peakY, wy0) : wy0}
                x2={xi}
                y2={wy1}
                stroke={METAL_RIB}
                strokeWidth={1.05}
              />
            ))}
            {panelSeamsPx.slice(0, -1).map((xLeft, i) => {
              const xRight = panelSeamsPx[i + 1];
              const mid = (xLeft + xRight) / 2;
              if (mid >= wx1 - 0.5) return null;
              return (
                <line
                  key={`rib-${i}`}
                  x1={mid}
                  y1={isGable ? interpolateGableTopY(mid, wx0, wx1, peakX, peakY, wy0) : wy0}
                  x2={mid}
                  y2={wy1}
                stroke={METAL_HIGHLIGHT}
                strokeWidth={0.35}
                opacity={0.65}
                />
              );
            })}
          </g>
        ) : null}

        {/* Openings */}
        {openingGeoms.map(({ o, x, y, ww, hh }) => {
          const jw = Math.min(8, Math.max(2.5, ww * 0.07));
          const headH = Math.min(10, Math.max(3.5, hh * 0.07));
          const sillH = o.type === 'window' ? Math.min(6, Math.max(2.5, hh * 0.05)) : 0;
          const { fill, stroke } = openingPalette(o);
          const glassTop = y + headH;
          const glassBot = o.type === 'window' ? y + hh - sillH : y + hh;
          const glassH = Math.max(2, glassBot - glassTop);

          return (
            <g key={o.id}>
              <title>{openingLabel(o)}</title>
              <rect x={x} y={y} width={ww} height={hh} fill="#0f172a" opacity={showMetalPanels ? 0.12 : 0.18} stroke="none" />
              <rect x={x} y={y} width={jw} height={hh} fill={STUD} stroke={INK} strokeWidth={0.65} />
              <rect x={x + ww - jw} y={y} width={jw} height={hh} fill={STUD} stroke={INK} strokeWidth={0.65} />
              <rect x={x} y={y} width={ww} height={headH} fill={STUD} stroke={INK} strokeWidth={0.65} />
              {o.type === 'window' ? (
                <rect x={x} y={y + hh - sillH} width={ww} height={sillH} fill={STUD} stroke={INK} strokeWidth={0.6} />
              ) : null}

              {o.type === 'window' ? (
                <g>
                  <rect
                    x={x + jw}
                    y={glassTop}
                    width={ww - 2 * jw}
                    height={glassH}
                    fill={GLASS}
                    stroke={GLASS_STROKE}
                    strokeWidth={0.8}
                  />
                  <line
                    x1={x + jw + (ww - 2 * jw) / 2}
                    y1={glassTop}
                    x2={x + jw + (ww - 2 * jw) / 2}
                    y2={glassBot}
                    stroke={GLASS_STROKE}
                    strokeWidth={0.5}
                    opacity={0.7}
                  />
                  <line
                    x1={x + jw}
                    y1={glassTop + glassH / 2}
                    x2={x + ww - jw}
                    y2={glassTop + glassH / 2}
                    stroke={GLASS_STROKE}
                    strokeWidth={0.5}
                    opacity={0.7}
                  />
                </g>
              ) : null}

              {o.type === 'door' || o.type === 'overhead_door' ? (
                <g>
                  <rect
                    x={x + jw}
                    y={y + headH}
                    width={ww - 2 * jw}
                    height={hh - headH}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={1.1}
                  />
                  {o.type === 'overhead_door'
                    ? Array.from({ length: 4 }).map((_, gi) => {
                        const gy = y + headH + ((gi + 1) * (hh - headH)) / 5;
                        return (
                          <line
                            key={`ohg-${gi}`}
                            x1={x + jw + 1}
                            y1={gy}
                            x2={x + ww - jw - 1}
                            y2={gy}
                            stroke={stroke}
                            strokeWidth={0.5}
                            opacity={0.65}
                          />
                        );
                      })
                    : null}
                  {o.type === 'door' ? (
                    <line
                      x1={x + ww - jw - 1}
                      y1={y + headH + 1}
                      x2={x + jw + 1}
                      y2={y + hh - 2}
                      stroke={INK}
                      strokeWidth={0.45}
                      opacity={0.35}
                    />
                  ) : null}
                </g>
              ) : null}

              {hh >= 16 ? (
                <text
                  x={x + ww / 2}
                  y={y + hh / 2 + (o.type === 'window' ? 0 : 3)}
                  textAnchor="middle"
                  fontSize={6.5}
                  fontWeight={600}
                  fill={INK}
                  stroke="#ffffff"
                  strokeWidth={2}
                  paintOrder="stroke fill"
                  fontFamily="ui-sans-serif, system-ui, sans-serif"
                >
                  {openingLabel(o)}
                </text>
              ) : null}
            </g>
          );
        })}

        {/* Eave line */}
        <line x1={wx0 - 3} y1={wy0} x2={wx1 + 3} y2={wy0} stroke={INK} strokeWidth={1.8} />
        <text x={wx1 + 6} y={wy0 + 4} fontSize={7} fill={INK_MUTED} fontFamily="ui-sans-serif, system-ui, sans-serif">
          Eave · {pitch}/12
        </text>

        {isGable ? (
          <text x={peakX} y={peakY - 4} textAnchor="middle" fontSize={7} fill={INK_MUTED} fontFamily="ui-sans-serif, system-ui, sans-serif">
            Ridge
          </text>
        ) : null}

        {/* Horizontal dimensions */}
        <g>
          <line x1={wx0} y1={wy1 + 28} x2={wx1} y2={wy1 + 28} stroke={INK} strokeWidth={0.9} />
          <line x1={wx0} y1={wy1 + 22} x2={wx0} y2={wy1 + 34} stroke={INK} strokeWidth={0.9} />
          <line x1={wx1} y1={wy1 + 22} x2={wx1} y2={wy1 + 34} stroke={INK} strokeWidth={0.9} />
          <text
            x={(wx0 + wx1) / 2}
            y={wy1 + 42}
            textAnchor="middle"
            fontSize={9}
            fontWeight={600}
            fill={INK}
            fontFamily="ui-sans-serif, system-ui, sans-serif"
          >
            {formatArchitecturalFeetDetailed(wallRunFt)}
          </text>
        </g>
        {/* Vertical: eave height */}
        <g>
          <line x1={wx1 + 14} y1={wy1} x2={wx1 + 14} y2={wy0} stroke={INK} strokeWidth={0.9} />
          <line x1={wx1 + 8} y1={wy1} x2={wx1 + 20} y2={wy1} stroke={INK} strokeWidth={0.9} />
          <line x1={wx1 + 8} y1={wy0} x2={wx1 + 20} y2={wy0} stroke={INK} strokeWidth={0.9} />
          <text
            x={wx1 + 22}
            y={(wy0 + wy1) / 2}
            fontSize={9}
            fontWeight={600}
            fill={INK}
            fontFamily="ui-sans-serif, system-ui, sans-serif"
            transform={`rotate(-90 ${wx1 + 22} ${(wy0 + wy1) / 2})`}
          >
            {formatArchitecturalFeetDetailed(h)} eave
          </text>
        </g>
        {isGable ? (
          <g>
            <line x1={wx1 + 32} y1={wy1} x2={wx1 + 32} y2={peakY} stroke={INK_MUTED} strokeWidth={0.75} strokeDasharray="3 2" />
            <line x1={wx1 + 26} y1={wy1} x2={wx1 + 38} y2={wy1} stroke={INK_MUTED} strokeWidth={0.75} />
            <line x1={wx1 + 26} y1={peakY} x2={wx1 + 38} y2={peakY} stroke={INK_MUTED} strokeWidth={0.75} />
            <text
              x={wx1 + 40}
              y={(wy1 + peakY) / 2}
              fontSize={8}
              fontWeight={600}
              fill={INK_MUTED}
              fontFamily="ui-sans-serif, system-ui, sans-serif"
              transform={`rotate(-90 ${wx1 + 40} ${(wy1 + peakY) / 2})`}
            >
              {formatArchitecturalFeetDetailed(h + ridgeRiseFt)} to ridge
            </text>
          </g>
        ) : null}
      </svg>
    </div>
  );
}

/** Y on gable roof edge at given x (left slope, peak, right slope). */
function interpolateGableTopY(x: number, wx0: number, wx1: number, peakX: number, peakY: number, wy0: number): number {
  if (x <= peakX) {
    if (x <= wx0) return wy0;
    const t = (x - wx0) / (peakX - wx0);
    return wy0 + t * (peakY - wy0);
  }
  if (x >= wx1) return wy0;
  const t = (x - peakX) / (wx1 - peakX);
  return peakY + t * (wy0 - peakY);
}
