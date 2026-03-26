import type { BuildingPlanModel, PlanPoint } from '@/lib/buildingPlanModel';

/** Matches `BuildingModel3D` framing constants. */
export const POST_Tp = 0.4583; // 6x6 post width (ft)
export const POST_Tg = 0.125; // 1.5" girt / jamb gap (ft)
export const POST_JAMB_GAP = POST_Tg; // 1.5" between RO and jamb post face
export const POST_SPACING_FT = 8;

export type PerimeterEdge = 'Front' | 'Back' | 'Left' | 'Right';

export interface PerimeterPostSlot {
  edge: PerimeterEdge;
  /**
   * Front/Back: world X center of post (same as endwall `posX` in BuildingModel3D).
   * Left/Right: world Z center of post (sidewall loop).
   */
  along: number;
}

export interface OverheadRoughOnWall {
  wall: PerimeterEdge;
  /** Same `offset` as PlanOpening / placeOpening (ft). */
  offset: number;
  width: number;
}

function roundedBuildingLength(length: number): number {
  return Math.ceil(length / POST_SPACING_FT) * POST_SPACING_FT;
}

/** Default endwall post X positions in world space (before overhead adjustments). */
function defaultEndwallWorldXs(width: number): number[] {
  const xs: number[] = [];
  for (let x = POST_SPACING_FT; x < width - 1; x += POST_SPACING_FT) {
    xs.push(x - width / 2);
  }
  return xs;
}

/** Default sidewall post Z positions in world space. */
function defaultSidewallWorldZs(roundedLength: number): number[] {
  const l = roundedLength;
  const offsetZ = l / 2;
  const nB = l / POST_SPACING_FT;
  const zs: number[] = [];
  for (let i = 0; i <= nB; i++) {
    let z = i * POST_SPACING_FT - offsetZ;
    if (i === 0) z += POST_Tp / 2 + POST_Tg;
    if (i === nB) z -= POST_Tp / 2 + POST_Tg;
    zs.push(z);
  }
  return zs;
}

function jambCentersForOverhead(
  wall: PerimeterEdge,
  width: number,
  roundedLength: number,
  offset: number,
  openingWidth: number
): { left: number; right: number } {
  const w = width;
  const l = roundedLength;
  const j = POST_JAMB_GAP;
  const hp = POST_Tp / 2;

  if (wall === 'Front' || wall === 'Back') {
    const le = -w / 2 + offset;
    const re = le + openingWidth;
    return { left: le - j - hp, right: re + j + hp };
  }

  const leftEdgeZ = -l / 2 + offset;
  const rightEdgeZ = leftEdgeZ + openingWidth;
  return { left: leftEdgeZ - j - hp, right: rightEdgeZ + j + hp };
}

const DEDUPE_FT = 0.04;

function dedupeSlots(slots: PerimeterPostSlot[]): PerimeterPostSlot[] {
  const out: PerimeterPostSlot[] = [];
  for (const s of slots) {
    if (!out.some((o) => o.edge === s.edge && Math.abs(o.along - s.along) < DEDUPE_FT)) {
      out.push(s);
    }
  }
  return out.sort((a, b) => (a.edge === b.edge ? a.along - b.along : a.edge.localeCompare(b.edge)));
}

/**
 * Structural perimeter posts after applying overhead-door jamb posts and removing
 * grid posts strictly between jambs on the same edge.
 */
export function computePerimeterPostSlots(
  width: number,
  length: number,
  overheads: OverheadRoughOnWall[]
): PerimeterPostSlot[] {
  const lR = roundedBuildingLength(length);
  const w = width;

  const slots: PerimeterPostSlot[] = [];
  const endXs = defaultEndwallWorldXs(w);
  for (const xw of endXs) {
    slots.push({ edge: 'Front', along: xw }, { edge: 'Back', along: xw });
  }
  const sideZs = defaultSidewallWorldZs(lR);
  for (const z of sideZs) {
    slots.push({ edge: 'Left', along: z }, { edge: 'Right', along: z });
  }

  let next = slots;

  for (const oh of overheads) {
    if (oh.width <= 0) continue;
    const { left, right } = jambCentersForOverhead(oh.wall, w, lR, oh.offset, oh.width);
    const lo = Math.min(left, right);
    const hi = Math.max(left, right);

    next = next.filter((s) => {
      if (s.edge !== oh.wall) return true;
      return !(s.along > lo && s.along < hi);
    });

    next.push({ edge: oh.wall, along: left }, { edge: oh.wall, along: right });
  }

  return dedupeSlots(next);
}

export function countPerimeterPosts(width: number, length: number, overheads: OverheadRoughOnWall[]): number {
  return computePerimeterPostSlots(width, length, overheads).length;
}

/** Plan-view center (feet) for drawing post markers in the 2D editor. */
export function overheadRoughOpeningsFromPlan(plan: BuildingPlanModel): OverheadRoughOnWall[] {
  const wallById = new Map(plan.walls.map((ww) => [ww.id, ww] as const));
  const out: OverheadRoughOnWall[] = [];
  for (const o of plan.openings) {
    if (o.type !== 'overhead_door') continue;
    const label = wallById.get(o.wallId)?.label;
    if (label !== 'Front' && label !== 'Back' && label !== 'Left' && label !== 'Right') continue;
    out.push({ wall: label, offset: o.offset, width: o.width });
  }
  return out;
}

export function computePerimeterPostSlotsFromPlan(plan: BuildingPlanModel): PerimeterPostSlot[] {
  return computePerimeterPostSlots(plan.dims.width, plan.dims.length, overheadRoughOpeningsFromPlan(plan));
}

export function perimeterSlotToPlanPoint(slot: PerimeterPostSlot, width: number, length: number): PlanPoint {
  const inset = POST_Tp / 2;
  const w = width;
  const l = length;
  switch (slot.edge) {
    case 'Front':
      return { x: slot.along + w / 2, y: inset };
    case 'Back':
      return { x: slot.along + w / 2, y: l - inset };
    case 'Left':
      return { x: inset, y: slot.along + l / 2 };
    case 'Right':
      return { x: w - inset, y: slot.along + l / 2 };
    default:
      return { x: 0, y: 0 };
  }
}
