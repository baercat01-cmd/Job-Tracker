import type { BuildingPlanModel, PlanPoint, PlanStair, PlanWall } from '@/lib/buildingPlanModel';
import { clamp } from '@/lib/buildingPlanModel';

/** Same convention as Plan2DEditor `lengthX`: horizontal axis = building length, vertical = width. */
export function planToViewLengthX(p: PlanPoint): PlanPoint {
  return { x: p.y, y: p.x };
}

export function pointAlongWall(a: PlanPoint, b: PlanPoint, offsetFt: number): PlanPoint {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const len = Math.sqrt(vx * vx + vy * vy) || 1;
  const t = clamp(offsetFt / len, 0, 1);
  return { x: a.x + vx * t, y: a.y + vy * t };
}

export function segmentUnit(a: PlanPoint, b: PlanPoint): { ux: number; uy: number } {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const len = Math.sqrt(vx * vx + vy * vy) || 1;
  return { ux: vx / len, uy: vy / len };
}

export function wallMidpoint(w: PlanWall): PlanPoint {
  return { x: (w.start.x + w.end.x) / 2, y: (w.start.y + w.end.y) / 2 };
}

/** Unit normal pointing toward building interior (for rectangular perimeter). */
export function inwardNormalForWall(plan: BuildingPlanModel, wall: PlanWall): { nx: number; ny: number } {
  const { ux, uy } = segmentUnit(wall.start, wall.end);
  const mx = (wall.start.x + wall.end.x) / 2;
  const my = (wall.start.y + wall.end.y) / 2;
  const cx = plan.dims.width / 2;
  const cy = plan.dims.length / 2;
  let nx = -uy;
  let ny = ux;
  const dot = (cx - mx) * nx + (cy - my) * ny;
  if (dot < 0) {
    nx = -nx;
    ny = -ny;
  }
  const h = Math.hypot(nx, ny) || 1;
  return { nx: nx / h, ny: ny / h };
}

export function stairFootprintCorners(s: PlanStair): [PlanPoint, PlanPoint, PlanPoint, PlanPoint] {
  const rad = (s.angleDeg * Math.PI) / 180;
  const ux = Math.cos(rad);
  const uy = Math.sin(rad);
  const px = -uy;
  const py = ux;
  const hw = s.width / 2;
  const f = s.foot;
  const p0 = { x: f.x + px * hw, y: f.y + py * hw };
  const p1 = { x: f.x - px * hw, y: f.y - py * hw };
  const p2 = { x: p1.x + ux * s.run, y: p1.y + uy * s.run };
  const p3 = { x: p0.x + ux * s.run, y: p0.y + uy * s.run };
  return [p0, p1, p2, p3];
}
