import type { BuildingPlanModel, PlanOpening } from '@/lib/buildingPlanModel';
import { DEFAULT_OVERHEAD_STYLE } from '@/lib/buildingPlanModel';

export type EstimatorWall = 'Front' | 'Back' | 'Left' | 'Right';

export type EstimatorOpeningKind = 'window' | 'door' | 'overhead_door';

export interface EstimatorOverheadStyle3D {
  colorHex: string;
  panelRows: number;
  panelCols: number;
  windowPanelIndices: number[];
}

export interface EstimatorOpening {
  id: number;
  wall: EstimatorWall;
  offset: number;
  elev: number;
  w: number;
  h: number;
  kind: EstimatorOpeningKind;
  overheadStyle?: EstimatorOverheadStyle3D;
}

export interface EstimatorLoft3D {
  id: string;
  /** Loft deck center X in world space (origin at building center). */
  centerX: number;
  centerZ: number;
  width: number;
  depth: number;
  elevation: number;
  clearHeight: number;
  stairOpening?: { ox: number; oz: number; w: number; d: number } | null;
}

export interface EstimatorStair3D {
  id: string;
  footX: number;
  footZ: number;
  width: number;
  run: number;
  rise: number;
  angleDeg: number;
}

export interface EstimatorBuildingState {
  width: number;
  length: number;
  height: number;
  pitch: number;
  openings: EstimatorOpening[];
  lofts: EstimatorLoft3D[];
  stairs: EstimatorStair3D[];
}

export function planToEstimatorBuildingState(plan: BuildingPlanModel): EstimatorBuildingState {
  const wallById = new Map(plan.walls.map((w) => [w.id, w] as const));

  const openings: EstimatorOpening[] = plan.openings
    .map((o): EstimatorOpening | null => {
      const wall = wallById.get(o.wallId);
      const label = wall?.label;
      if (label !== 'Front' && label !== 'Back' && label !== 'Left' && label !== 'Right') return null;
      const kind: EstimatorOpeningKind =
        o.type === 'overhead_door' ? 'overhead_door' : o.type === 'door' ? 'door' : 'window';
      const st = o.type === 'overhead_door' ? { ...DEFAULT_OVERHEAD_STYLE, ...o.overheadStyle } : undefined;
      return {
        id: stableNumberId(o),
        wall: label,
        offset: o.offset,
        elev: o.sill,
        w: o.width,
        h: o.height,
        kind,
        overheadStyle:
          kind === 'overhead_door'
            ? {
                colorHex: st!.colorHex,
                panelRows: Math.max(1, Math.min(24, Math.round(st!.panelRows))),
                panelCols: Math.max(1, Math.min(24, Math.round(st!.panelCols))),
                windowPanelIndices: Array.isArray(st!.windowPanelIndices) ? st!.windowPanelIndices : [],
              }
            : undefined,
      };
    })
    .filter((x): x is EstimatorOpening => x != null);

  const bw = plan.dims.width;
  const bl = plan.dims.length;

  const lofts: EstimatorLoft3D[] = plan.lofts.map((loft) => {
    const so = loft.stairOpening;
    return {
      id: loft.id,
      centerX: loft.origin.x + loft.width / 2 - bw / 2,
      centerZ: loft.origin.y + loft.depth / 2 - bl / 2,
      width: loft.width,
      depth: loft.depth,
      elevation: loft.elevation,
      clearHeight: loft.clearHeight ?? 8,
      stairOpening:
        so && so.width > 0 && so.depth > 0
          ? {
              ox: loft.origin.x + so.x + so.width / 2 - bw / 2,
              oz: loft.origin.y + so.y + so.depth / 2 - bl / 2,
              w: so.width,
              d: so.depth,
            }
          : null,
    };
  });

  const stairs: EstimatorStair3D[] = (plan.stairs ?? []).map((s) => ({
    id: s.id,
    footX: s.foot.x - bw / 2,
    footZ: s.foot.y - bl / 2,
    width: s.width,
    run: s.run,
    rise: s.rise,
    angleDeg: s.angleDeg,
  }));

  return {
    width: bw,
    length: bl,
    height: plan.dims.height,
    pitch: plan.dims.pitch,
    openings,
    lofts,
    stairs,
  };
}

function stableNumberId(o: PlanOpening): number {
  // Existing estimator uses number ids; map string id to a stable int-ish hash.
  let h = 2166136261;
  for (let i = 0; i < o.id.length; i++) {
    h ^= o.id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

