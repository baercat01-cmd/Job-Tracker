import type { BuildingPlanModel, PlanViewSide } from '@/lib/buildingPlanModel';

/** Vertical panel module — must match `PlanWallElevationDraw` metal seams. */
export const ELEVATION_METAL_PANEL_MODULE_FT = 3;

function isGableEndWall(side: PlanViewSide, widthFt: number, lengthFt: number): boolean {
  if (side !== 'Front' && side !== 'Back' && side !== 'Left' && side !== 'Right') return false;
  if (Math.abs(widthFt - lengthFt) < 1e-6) return side === 'Front' || side === 'Back';
  if (lengthFt >= widthFt) return side === 'Front' || side === 'Back';
  return side === 'Left' || side === 'Right';
}

function roofTopElevationFt(
  alongFt: number,
  wallRunFt: number,
  eaveHtFt: number,
  ridgeRiseFt: number,
  isGable: boolean
): number {
  if (!isGable) return eaveHtFt;
  const half = wallRunFt / 2;
  if (half < 1e-6) return eaveHtFt;
  if (alongFt <= half) return eaveHtFt + (alongFt / half) * ridgeRiseFt;
  return eaveHtFt + ((wallRunFt - alongFt) / half) * ridgeRiseFt;
}

function maxRoofTopInBay(
  aFt: number,
  bFt: number,
  wallRunFt: number,
  eaveHtFt: number,
  ridgeRiseFt: number,
  isGable: boolean
): number {
  if (!isGable) return eaveHtFt;
  const peak = wallRunFt / 2;
  if (peak > aFt + 1e-6 && peak < bFt - 1e-6) return eaveHtFt + ridgeRiseFt;
  return Math.max(
    roofTopElevationFt(aFt, wallRunFt, eaveHtFt, ridgeRiseFt, true),
    roofTopElevationFt(bFt, wallRunFt, eaveHtFt, ridgeRiseFt, true)
  );
}

/** Seam / break positions along wall (ft), same stepping as elevation SVG. */
export function metalPanelEdgesAlongWallFt(wallRunFt: number, moduleFt: number = ELEVATION_METAL_PANEL_MODULE_FT): number[] {
  const edges: number[] = [];
  for (let d = 0; d <= wallRunFt + 1e-6; d += moduleFt) {
    edges.push(Math.min(d, wallRunFt));
  }
  const last = edges[edges.length - 1];
  if (last < wallRunFt - 1e-4) edges.push(wallRunFt);
  return edges;
}

export type ElevationMetalPanelRow = {
  bay: number;
  fromFt: number;
  toFt: number;
  widthFt: number;
  heightLeftFt: number;
  heightRightFt: number;
  heightMaxFt: number;
};

export type ElevationMetalCutList = {
  side: PlanViewSide;
  wallLabel: string;
  wallRunFt: number;
  isGable: boolean;
  eaveHeightFt: number;
  ridgeRiseFt: number;
  pitch: number;
  moduleFt: number;
  panels: ElevationMetalPanelRow[];
  approxWallFaceSqFt: number;
};

/**
 * Gross vertical-sheet layout for one elevation (3′ module seams, gable peak matches plan pitch).
 * Does not net out door/window cutouts — field trim per opening.
 */
export function computeElevationMetalCutList(plan: BuildingPlanModel, side: PlanViewSide): ElevationMetalCutList | null {
  if (side !== 'Front' && side !== 'Back' && side !== 'Left' && side !== 'Right') return null;

  const w = plan.dims.width;
  const l = plan.dims.length;
  const h = plan.dims.height;
  const pitch = plan.dims.pitch;

  const wallLabel = side;
  const wallRunFt = side === 'Left' || side === 'Right' ? l : w;
  const isGable = isGableEndWall(side, w, l);
  const ridgeRiseFt = isGable ? (wallRunFt / 2) * (pitch / 12) : 0;

  const edges = metalPanelEdgesAlongWallFt(wallRunFt, ELEVATION_METAL_PANEL_MODULE_FT);
  const panels: ElevationMetalPanelRow[] = [];
  let approxWallFaceSqFt = 0;

  for (let i = 0; i < edges.length - 1; i++) {
    const fromFt = edges[i];
    const toFt = edges[i + 1];
    const widthFt = toFt - fromFt;
    if (widthFt < 1e-6) continue;

    const heightLeftFt = roofTopElevationFt(fromFt, wallRunFt, h, ridgeRiseFt, isGable);
    const heightRightFt = roofTopElevationFt(toFt, wallRunFt, h, ridgeRiseFt, isGable);
    const heightMaxFt = maxRoofTopInBay(fromFt, toFt, wallRunFt, h, ridgeRiseFt, isGable);

    panels.push({
      bay: panels.length + 1,
      fromFt,
      toFt,
      widthFt,
      heightLeftFt,
      heightRightFt,
      heightMaxFt,
    });
    approxWallFaceSqFt += widthFt * ((heightLeftFt + heightRightFt) / 2);
  }

  return {
    side,
    wallLabel,
    wallRunFt,
    isGable,
    eaveHeightFt: h,
    ridgeRiseFt,
    pitch,
    moduleFt: ELEVATION_METAL_PANEL_MODULE_FT,
    panels,
    approxWallFaceSqFt,
  };
}
