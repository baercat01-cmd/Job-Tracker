import type { BuildingPlanModel, PlanOpening } from '@/lib/buildingPlanModel';

export type EstimatorWall = 'Front' | 'Back' | 'Left' | 'Right';

export interface EstimatorOpening {
  id: number;
  wall: EstimatorWall;
  offset: number;
  elev: number;
  w: number;
  h: number;
}

export interface EstimatorBuildingState {
  width: number;
  length: number;
  height: number;
  pitch: number;
  openings: EstimatorOpening[];
}

export function planToEstimatorBuildingState(plan: BuildingPlanModel): EstimatorBuildingState {
  const wallById = new Map(plan.walls.map((w) => [w.id, w] as const));

  const openings: EstimatorOpening[] = plan.openings
    .map((o): EstimatorOpening | null => {
      const wall = wallById.get(o.wallId);
      const label = wall?.label;
      if (label !== 'Front' && label !== 'Back' && label !== 'Left' && label !== 'Right') return null;
      return {
        id: stableNumberId(o),
        wall: label,
        offset: o.offset,
        elev: o.sill,
        w: o.width,
        h: o.height,
      };
    })
    .filter((x): x is EstimatorOpening => x != null);

  return {
    width: plan.dims.width,
    length: plan.dims.length,
    height: plan.dims.height,
    pitch: plan.dims.pitch,
    openings,
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

