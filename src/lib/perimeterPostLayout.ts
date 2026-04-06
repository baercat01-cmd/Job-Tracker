/**
 * Perimeter post layout logic for building plans
 * Computes post positions on building perimeter (OC + corners + door jamb posts)
 */

import type { BuildingPlanModel, PlanPoint, PlanViewSide, PlanWall } from './buildingPlanModel';
import { DEFAULT_POST_FACE_WIDTH_FT, resolvePerimeterPostSettings } from './buildingPlanModel';
import { pointAlongWall } from './planBlueprintView';

/** Legacy nominal post width (feet); prefer {@link getSlotPostWidthFt}. */
export const POST_Tp = DEFAULT_POST_FACE_WIDTH_FT;

/** Skirt outside sits past post outside face by this amount each end (2× = 3″ total shorter post run than skirt OAL). */
export const SKIRT_BOARD_PAST_POST_FT = 1.5 / 12;

/** Default OC spacing (ft); plan may override via `perimeterPosts`. */
export const POST_OC_SPACING_FT = 8;

/** Default first bay from corner outside face (ft); plan may override. */
export const POST_FIRST_BAY_FROM_CORNER_OUTSIDE_FT = 8;

export type PerimeterEdge = 'front' | 'back' | 'left' | 'right';

export type PerimeterPostReason = 'corner' | '8ft_oc' | 'overhead_jamb' | 'door_jamb';

export interface PerimeterPostSlot {
  edge: PerimeterEdge;
  along: number;
  reason: PerimeterPostReason;
}

/** Ridge heuristic: matches {@link PlanWallElevationDraw} gable ends. */
export function isGablePerimeterEdge(plan: BuildingPlanModel, edge: PerimeterEdge): boolean {
  const widthFt = plan.dims.width;
  const lengthFt = plan.dims.length;
  if (Math.abs(widthFt - lengthFt) < 1e-6) return edge === 'front' || edge === 'back';
  if (lengthFt >= widthFt) return edge === 'front' || edge === 'back';
  return edge === 'left' || edge === 'right';
}

export function perimeterEdgeForViewSide(side: PlanViewSide): PerimeterEdge | null {
  if (side === 'Front') return 'front';
  if (side === 'Back') return 'back';
  if (side === 'Left') return 'left';
  if (side === 'Right') return 'right';
  return null;
}

/** Face width (ft) for a slot — jamb types use their own widths; corners/OC use eave vs gable for that edge. */
export function getSlotPostWidthFt(plan: BuildingPlanModel, slot: PerimeterPostSlot): number {
  const r = resolvePerimeterPostSettings(plan);
  switch (slot.reason) {
    case 'door_jamb':
      return r.doorJambPostWidthFt;
    case 'overhead_jamb':
      return r.overheadJambPostWidthFt;
    default:
      return isGablePerimeterEdge(plan, slot.edge) ? r.gableWallPostWidthFt : r.eaveWallPostWidthFt;
  }
}

function reasonPriority(r: PerimeterPostReason): number {
  switch (r) {
    case 'overhead_jamb':
      return 4;
    case 'door_jamb':
      return 3;
    case 'corner':
      return 2;
    case '8ft_oc':
      return 1;
    default:
      return 0;
  }
}

/**
 * Compute all perimeter post positions for a given plan.
 * Places posts at:
 * - Building corners
 * - First bay: plan `firstBayFromCornerOutsideFt` from corner post outside face to first post CL, then `ocSpacingFt` CL–CL
 * - Overhead door jamb positions
 * - Optional walk-door jamb posts
 */
export function computePerimeterPostSlotsFromPlan(plan: BuildingPlanModel): PerimeterPostSlot[] {
  const posts: PerimeterPostSlot[] = [];
  const width = plan.dims.width;
  const length = plan.dims.length;
  const r = resolvePerimeterPostSettings(plan);
  const { ocSpacingFt, firstBayFromCornerOutsideFt, addWalkDoorJambPosts } = r;

  function postHalfForEdge(edge: PerimeterEdge): number {
    return (isGablePerimeterEdge(plan, edge) ? r.gableWallPostWidthFt : r.eaveWallPostWidthFt) / 2;
  }

  function addOCPostsAlongEdge(edge: PerimeterEdge, edgeLength: number) {
    posts.push({ edge, along: 0, reason: 'corner' });

    let pos = firstBayFromCornerOutsideFt - postHalfForEdge(edge);
    while (pos < edgeLength - 0.001) {
      posts.push({ edge, along: pos, reason: '8ft_oc' });
      pos += ocSpacingFt;
    }

    if (edgeLength > 0.001) {
      posts.push({ edge, along: edgeLength, reason: 'corner' });
    }
  }

  addOCPostsAlongEdge('front', width);
  addOCPostsAlongEdge('right', length);
  addOCPostsAlongEdge('back', width);
  addOCPostsAlongEdge('left', length);

  for (const opening of plan.openings) {
    if (opening.type !== 'overhead_door') continue;

    const wall = plan.walls.find((w) => w.id === opening.wallId);
    if (!wall) continue;

    const edge = determineEdgeFromWall(wall, width, length);
    if (!edge) continue;

    const leftJamb = opening.offset;
    const rightJamb = opening.offset + opening.width;

    posts.push({ edge, along: leftJamb, reason: 'overhead_jamb' });
    posts.push({ edge, along: rightJamb, reason: 'overhead_jamb' });
  }

  if (addWalkDoorJambPosts) {
    for (const opening of plan.openings) {
      if (opening.type !== 'door') continue;
      const wall = plan.walls.find((w) => w.id === opening.wallId);
      if (!wall) continue;
      const edge = determineEdgeFromWall(wall, width, length);
      if (!edge) continue;
      posts.push({ edge, along: opening.offset, reason: 'door_jamb' });
      posts.push({ edge, along: opening.offset + opening.width, reason: 'door_jamb' });
    }
  }

  const deduped = deduplicatePosts(posts);
  return removeOcPostsOverlappingDoorOpenings(deduped, plan);
}

/** `along` on a perimeter edge (same convention as {@link perimeterSlotToPlanPoint}). */
function planPointToAlongOnEdge(edge: PerimeterEdge, p: PlanPoint, buildingWidth: number, buildingLength: number): number {
  switch (edge) {
    case 'front':
      return p.x;
    case 'right':
      return p.y;
    case 'back':
      return buildingWidth - p.x;
    case 'left':
      return buildingLength - p.y;
    default:
      return 0;
  }
}

function openingAlongIntervalOnEdge(
  wall: PlanWall,
  edge: PerimeterEdge,
  offsetFt: number,
  widthFt: number,
  buildingWidth: number,
  buildingLength: number
): { lo: number; hi: number } {
  const p0 = pointAlongWall(wall.start, wall.end, offsetFt);
  const p1 = pointAlongWall(wall.start, wall.end, offsetFt + widthFt);
  const a0 = planPointToAlongOnEdge(edge, p0, buildingWidth, buildingLength);
  const a1 = planPointToAlongOnEdge(edge, p1, buildingWidth, buildingLength);
  return { lo: Math.min(a0, a1), hi: Math.max(a0, a1) };
}

/**
 * Drop 8′ OC posts whose bodies overlap walk-door or overhead clear openings.
 * Corner and jamb posts stay.
 */
function removeOcPostsOverlappingDoorOpenings(posts: PerimeterPostSlot[], plan: BuildingPlanModel): PerimeterPostSlot[] {
  const bw = plan.dims.width;
  const bl = plan.dims.length;

  const intervalsByEdge = new Map<PerimeterEdge, { lo: number; hi: number }[]>();
  for (const opening of plan.openings) {
    if (opening.type !== 'door' && opening.type !== 'overhead_door') continue;
    const wall = plan.walls.find((w) => w.id === opening.wallId);
    if (!wall) continue;
    const edge = determineEdgeFromWall(wall, bw, bl);
    if (!edge) continue;
    const { lo, hi } = openingAlongIntervalOnEdge(wall, edge, opening.offset, opening.width, bw, bl);
    const list = intervalsByEdge.get(edge) ?? [];
    list.push({ lo, hi });
    intervalsByEdge.set(edge, list);
  }

  return posts.filter((post) => {
    if (post.reason !== '8ft_oc') return true;
    const postHalf = getSlotPostWidthFt(plan, post) / 2;
    const intervals = intervalsByEdge.get(post.edge);
    if (!intervals?.length) return true;
    for (const { lo, hi } of intervals) {
      if (post.along + postHalf > lo && post.along - postHalf < hi) return false;
    }
    return true;
  });
}

/**
 * Convert a perimeter slot to actual plan coordinates
 */
export function perimeterSlotToPlanPoint(slot: PerimeterPostSlot, buildingWidth: number, buildingLength: number): PlanPoint {
  const { edge, along } = slot;

  switch (edge) {
    case 'front':
      return { x: along, y: 0 };

    case 'right':
      return { x: buildingWidth, y: along };

    case 'back':
      return { x: buildingWidth - along, y: buildingLength };

    case 'left':
      return { x: 0, y: buildingLength - along };

    default:
      return { x: 0, y: 0 };
  }
}

function determineEdgeFromWall(
  wall: { start: PlanPoint; end: PlanPoint },
  buildingWidth: number,
  buildingLength: number
): PerimeterEdge | null {
  const { start, end } = wall;
  const tolerance = 0.1;

  if (Math.abs(start.y) < tolerance && Math.abs(end.y) < tolerance) {
    return 'front';
  }

  if (Math.abs(start.y - buildingLength) < tolerance && Math.abs(end.y - buildingLength) < tolerance) {
    return 'back';
  }

  if (Math.abs(start.x) < tolerance && Math.abs(end.x) < tolerance) {
    return 'left';
  }

  if (Math.abs(start.x - buildingWidth) < tolerance && Math.abs(end.x - buildingWidth) < tolerance) {
    return 'right';
  }

  return null;
}

function deduplicatePosts(posts: PerimeterPostSlot[]): PerimeterPostSlot[] {
  const result: PerimeterPostSlot[] = [];
  const tolerance = 0.1;

  for (const post of posts) {
    const idx = result.findIndex((p) => p.edge === post.edge && Math.abs(p.along - post.along) < tolerance);
    if (idx < 0) {
      result.push(post);
      continue;
    }
    const existing = result[idx];
    if (reasonPriority(post.reason) > reasonPriority(existing.reason)) {
      result[idx] = post;
    }
  }

  return result;
}

/** Slots on one elevation wall, sorted by distance along the wall (ft). */
export function perimeterPostSlotsForViewSide(plan: BuildingPlanModel, side: PlanViewSide): PerimeterPostSlot[] {
  const edge = perimeterEdgeForViewSide(side);
  if (!edge) return [];
  return computePerimeterPostSlotsFromPlan(plan)
    .filter((s) => s.edge === edge)
    .sort((a, b) => a.along - b.along);
}
