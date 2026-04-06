import type { PlanOpening, PlanWall } from '@/lib/buildingPlanModel';

export function wallLengthFt(wall: PlanWall): number {
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  return Math.hypot(dx, dy) || 0;
}

/** Right edge (toward wall end) of nearest opening strictly toward wall.start from this opening. */
export function leftNeighborRightEdgeFt(o: PlanOpening, planOpenings: PlanOpening[]): number {
  let best: number | null = null;
  for (const x of planOpenings) {
    if (x.wallId !== o.wallId || x.id === o.id) continue;
    const re = x.offset + x.width;
    if (re <= o.offset + 1e-6 && (best === null || re > best)) best = re;
  }
  return best ?? 0;
}

/** Left edge (toward wall start) of nearest opening strictly toward wall.end from this opening. */
export function rightNeighborLeftEdgeFt(o: PlanOpening, planOpenings: PlanOpening[]): number | null {
  let best: number | null = null;
  for (const x of planOpenings) {
    if (x.wallId !== o.wallId || x.id === o.id) continue;
    if (x.offset + 1e-6 < o.offset + o.width) continue;
    if (best === null || x.offset < best) best = x.offset;
  }
  return best;
}

export type OpeningPlacementDimKind =
  | 'door_start_to_wall_start'
  | 'door_end_to_wall_end'
  | 'clear_left_to_door_start'
  | 'clear_door_end_to_right';

export function readPlacementDimensionFt(
  o: PlanOpening,
  wallLen: number,
  kind: OpeningPlacementDimKind,
  planOpenings: PlanOpening[]
): number {
  const leftN = leftNeighborRightEdgeFt(o, planOpenings);
  const rightN = rightNeighborLeftEdgeFt(o, planOpenings);
  switch (kind) {
    case 'door_start_to_wall_start':
      return o.offset;
    case 'door_end_to_wall_end':
      return Math.max(0, wallLen - o.offset - o.width);
    case 'clear_left_to_door_start':
      return Math.max(0, o.offset - leftN);
    case 'clear_door_end_to_right':
      return rightN === null ? Math.max(0, wallLen - o.offset - o.width) : Math.max(0, rightN - o.offset - o.width);
    default:
      return o.offset;
  }
}

export function offsetFromPlacementDimensionFt(
  o: PlanOpening,
  wallLen: number,
  kind: OpeningPlacementDimKind,
  valueFt: number,
  planOpenings: PlanOpening[]
): number {
  const w = o.width;
  const maxOff = Math.max(0, wallLen - w);
  const leftN = leftNeighborRightEdgeFt(o, planOpenings);
  const rightN = rightNeighborLeftEdgeFt(o, planOpenings);
  const v = Math.max(0, valueFt);

  let next: number;
  switch (kind) {
    case 'door_start_to_wall_start':
      next = v;
      break;
    case 'door_end_to_wall_end':
      next = wallLen - w - v;
      break;
    case 'clear_left_to_door_start':
      next = leftN + v;
      break;
    case 'clear_door_end_to_right':
      next = rightN === null ? wallLen - w - v : rightN - w - v;
      break;
    default:
      next = o.offset;
  }
  return Math.max(0, Math.min(maxOff, next));
}
