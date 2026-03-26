export type PlanId = string;
export type PlanEntityId = string;

export type PlanUnits = 'ft';

export type PlanViewSide = 'Front' | 'Back' | 'Left' | 'Right';

export interface PlanPoint {
  x: number; // feet
  y: number; // feet (2D plan Y axis; we use x/y for 2D, map to x/z in 3D)
}

export interface PlanWall {
  id: PlanEntityId;
  start: PlanPoint;
  end: PlanPoint;
  thickness: number; // feet
  label?: string;
}

export type PlanOpeningType = 'door' | 'window' | 'overhead_door';

/** Visual / sectional-door options for overhead openings (3D + elevation). */
export interface PlanOverheadStyle {
  /** CSS-style hex, e.g. #334155 */
  colorHex: string;
  panelRows: number;
  panelCols: number;
  /** Flat panel indices: row * panelCols + col */
  windowPanelIndices: number[];
}

export const DEFAULT_OVERHEAD_STYLE: PlanOverheadStyle = {
  colorHex: '#475569',
  panelRows: 4,
  panelCols: 3,
  windowPanelIndices: [],
};

export interface PlanOpening {
  id: PlanEntityId;
  type: PlanOpeningType;
  wallId: PlanEntityId;
  /** Offset along wall from wall.start in feet. */
  offset: number;
  width: number; // feet
  /** Sill height above floor in feet (doors typically 0). */
  sill: number;
  height: number; // feet
  /** Only for `overhead_door`; omitted uses DEFAULT_OVERHEAD_STYLE in UI/3D. */
  overheadStyle?: PlanOverheadStyle;
}

/**
 * Rectangular cut in the loft deck for stair access (offsets from loft.origin, feet).
 * `width` and `depth` are the opening’s size on the plan (deck plane).
 */
export interface PlanLoftStairOpening {
  x: number;
  y: number;
  width: number;
  depth: number;
}

export interface PlanLoft {
  id: PlanEntityId;
  name?: string;
  origin: PlanPoint;
  width: number; // feet
  depth: number; // feet
  /** Height of loft deck above main floor (feet). */
  elevation: number;
  /** Headroom inside loft under roof (feet); used for labels / 3D. */
  clearHeight?: number;
  /** Hole through loft deck for stairs. */
  stairOpening?: PlanLoftStairOpening | null;
}

/** Straight stair run on the main floor up toward a loft (plan view). */
export interface PlanStair {
  id: PlanEntityId;
  /** Bottom end of the run (main floor). */
  foot: PlanPoint;
  width: number; // feet (tread width)
  run: number; // horizontal run along angleDeg (feet)
  rise: number; // total vertical to top of run (feet), usually ≈ loft deck elevation
  /** 0° = +x in plan, 90° = +y (down on screen). */
  angleDeg: number;
  loftId?: PlanEntityId | null;
}

/** Where the room sits vertically. Omitted on old plans = main floor. */
export type PlanRoomLevel = 'main' | 'loft_deck' | 'loft_upper';

export interface PlanRoom {
  id: PlanEntityId;
  name?: string;
  origin: PlanPoint;
  width: number; // feet
  depth: number; // feet
  wallThickness: number; // feet
  /** Default `main` (below loft). */
  level?: PlanRoomLevel;
  /** Required when level is `loft_deck` or `loft_upper`. */
  loftId?: PlanEntityId | null;
  /**
   * For `loft_upper`: height from loft **deck** up to this room’s floor (feet).
   * E.g. 4 = room starts 4′ above the deck; walls can extend to loft ceiling.
   */
  loftUpperFloorOffsetFt?: number;
  /**
   * `to_ceiling` (default): wall tops meet ceiling for that story.
   * `custom`: use `customWallHeightFt` from room floor.
   */
  wallTopMode?: 'to_ceiling' | 'custom';
  /** Used when `wallTopMode === 'custom'` (feet above room floor). */
  customWallHeightFt?: number;
}

export type PlanFixtureType = 'outlet' | 'drain' | 'switch' | 'light' | 'other';

export interface PlanFixture {
  id: PlanEntityId;
  type: PlanFixtureType;
  position: PlanPoint;
  elevation?: number; // feet
  label?: string;
}

export interface BuildingPlanModel {
  version: 1;
  units: PlanUnits;
  /** Display name. */
  name: string;
  /** Core building dimensions in feet. */
  dims: {
    width: number;
    length: number;
    height: number;
    pitch: number; // roof pitch in inches per 12
  };
  /** Rectangular perimeter walls for MVP. */
  walls: PlanWall[];
  openings: PlanOpening[];
  rooms: PlanRoom[];
  lofts: PlanLoft[];
  /** Omitted in older saved plans — treat as []. */
  stairs?: PlanStair[];
  fixtures: PlanFixture[];
  meta: {
    createdAt: string;
    updatedAt: string;
    rev: number;
  };
}

export function newId(prefix: string = 'ent'): PlanEntityId {
  // Prefer crypto.randomUUID when available (modern browsers + secure contexts).
  const uuid =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  return `${prefix}_${uuid}`;
}

export function createDefaultRectPlan(opts: {
  name?: string;
  width: number;
  length: number;
  height: number;
  pitch: number;
}): BuildingPlanModel {
  const now = new Date().toISOString();
  const width = clampPositive(opts.width, 1);
  const length = clampPositive(opts.length, 1);
  const height = clampPositive(opts.height, 1);
  const pitch = clampPositive(opts.pitch, 0);

  // 2D coordinate system (feet):
  // - origin at top-left of building rectangle for convenience
  // - +x to the right (width), +y down (length)
  // This maps cleanly into screen space; 3D mapping can translate as needed.
  const a: PlanPoint = { x: 0, y: 0 };
  const b: PlanPoint = { x: width, y: 0 };
  const c: PlanPoint = { x: width, y: length };
  const d: PlanPoint = { x: 0, y: length };

  const thickness = 0.5 / 12; // 6" wall for MVP
  const walls: PlanWall[] = [
    { id: newId('wall'), start: a, end: b, thickness, label: 'Front' },
    { id: newId('wall'), start: b, end: c, thickness, label: 'Right' },
    { id: newId('wall'), start: c, end: d, thickness, label: 'Back' },
    { id: newId('wall'), start: d, end: a, thickness, label: 'Left' },
  ];

  return {
    version: 1,
    units: 'ft',
    name: opts.name ?? 'New plan',
    dims: { width, length, height, pitch },
    walls,
    openings: [],
    rooms: [],
    lofts: [],
    stairs: [],
    fixtures: [],
    meta: { createdAt: now, updatedAt: now, rev: 1 },
  };
}

export function resizeRectPerimeter(plan: BuildingPlanModel, dims: BuildingPlanModel['dims']): BuildingPlanModel {
  const width = clampPositive(dims.width, plan.dims.width || 1);
  const length = clampPositive(dims.length, plan.dims.length || 1);

  const a: PlanPoint = { x: 0, y: 0 };
  const b: PlanPoint = { x: width, y: 0 };
  const c: PlanPoint = { x: width, y: length };
  const d: PlanPoint = { x: 0, y: length };

  const byLabel = new Map<string, PlanWall>();
  for (const w of plan.walls) {
    if (w.label) byLabel.set(w.label, w);
  }

  const thickness = 0.5 / 12;
  const front = byLabel.get('Front') ?? { id: newId('wall'), start: a, end: b, thickness, label: 'Front' };
  const right = byLabel.get('Right') ?? { id: newId('wall'), start: b, end: c, thickness, label: 'Right' };
  const back = byLabel.get('Back') ?? { id: newId('wall'), start: c, end: d, thickness, label: 'Back' };
  const left = byLabel.get('Left') ?? { id: newId('wall'), start: d, end: a, thickness, label: 'Left' };

  const walls: PlanWall[] = [
    { ...front, start: a, end: b, thickness: front.thickness ?? thickness, label: 'Front' },
    { ...right, start: b, end: c, thickness: right.thickness ?? thickness, label: 'Right' },
    { ...back, start: c, end: d, thickness: back.thickness ?? thickness, label: 'Back' },
    { ...left, start: d, end: a, thickness: left.thickness ?? thickness, label: 'Left' },
  ];

  const next: BuildingPlanModel = {
    ...plan,
    dims: { ...dims, width, length },
    walls,
  };

  // Clamp opening offsets to resized walls.
  const wallById = new Map(walls.map((w) => [w.id, w] as const));
  const openings = next.openings.map((o) => {
    const w = wallById.get(o.wallId);
    return w ? clampOpeningOffsetToWall(o, w) : o;
  });

  return { ...next, openings };
}

export function bumpRev(plan: BuildingPlanModel): BuildingPlanModel {
  const now = new Date().toISOString();
  return {
    ...plan,
    meta: {
      ...plan.meta,
      updatedAt: now,
      rev: (plan.meta?.rev ?? 0) + 1,
    },
  };
}

export function getWall(plan: BuildingPlanModel, wallId: PlanEntityId): PlanWall | undefined {
  return plan.walls.find((w) => w.id === wallId);
}

export function getLoft(plan: BuildingPlanModel, loftId: PlanEntityId | null | undefined): PlanLoft | undefined {
  if (!loftId) return undefined;
  return plan.lofts.find((l) => l.id === loftId);
}

/**
 * Vertical thickness of the loft floor assembly (feet), same rule as the 3D deck slab:
 * wall height minus walkable deck elevation, with small minimums so geometry stays valid.
 */
export function loftStructureThicknessFt(wallHeightFt: number, deckElevationFt: number): number {
  const minT = 1 / 12;
  const raw = wallHeightFt - deckElevationFt;
  let t = raw > minT ? raw : minT;
  if (t > deckElevationFt) t = Math.max(minT, deckElevationFt);
  return t;
}

/** Keeps stair opening inside the loft footprint with sensible minimum sizes. */
export function clampLoftStairOpeningToLoftBounds(loft: PlanLoft): PlanLoft {
  if (!loft.stairOpening) return loft;
  const lw = Math.max(1, loft.width);
  const ld = Math.max(1, loft.depth);
  const so = loft.stairOpening;
  const hw = Math.max(0.5, so.width);
  const hd = Math.max(0.5, so.depth);
  const x = clamp(so.x, 0, Math.max(0, lw - hw));
  const y = clamp(so.y, 0, Math.max(0, ld - hd));
  return { ...loft, stairOpening: { ...so, x, y, width: hw, depth: hd } };
}

export function normalizeRoomLevel(room: PlanRoom): PlanRoomLevel {
  return room.level ?? 'main';
}

/** Whether `room` belongs to the given floor slice (for 2D editing). */
export function roomMatchesFloor(
  room: PlanRoom,
  floor:
    | { kind: 'main' }
    | { kind: 'loft_deck'; loftId: PlanEntityId }
    | { kind: 'loft_upper'; loftId: PlanEntityId }
): boolean {
  const lvl = normalizeRoomLevel(room);
  if (floor.kind === 'main') return lvl === 'main';
  if (floor.kind === 'loft_deck') return lvl === 'loft_deck' && room.loftId === floor.loftId;
  return lvl === 'loft_upper' && room.loftId === floor.loftId;
}

/** Elevation of room floor (feet above main slab). */
export function getRoomFloorElevation(plan: BuildingPlanModel, room: PlanRoom): number {
  const lvl = normalizeRoomLevel(room);
  if (lvl === 'main') return 0;
  const loft = getLoft(plan, room.loftId);
  if (!loft) return 0;
  if (lvl === 'loft_deck') return loft.elevation;
  const off = Math.max(0, room.loftUpperFloorOffsetFt ?? 0);
  return loft.elevation + off;
}

/** Elevation of wall top (feet). */
export function getRoomWallTopElevation(plan: BuildingPlanModel, room: PlanRoom): number {
  const floorEl = getRoomFloorElevation(plan, room);
  const mode = room.wallTopMode ?? 'to_ceiling';
  if (
    mode === 'custom' &&
    room.customWallHeightFt != null &&
    Number.isFinite(room.customWallHeightFt) &&
    room.customWallHeightFt > 0
  ) {
    return floorEl + room.customWallHeightFt;
  }
  const lvl = normalizeRoomLevel(room);
  if (lvl === 'main') return plan.dims.height;
  const loft = getLoft(plan, room.loftId);
  if (!loft) return plan.dims.height;
  return loft.elevation + (loft.clearHeight ?? 8);
}

export function getResolvedWallHeightFt(plan: BuildingPlanModel, room: PlanRoom): number {
  return Math.max(0, getRoomWallTopElevation(plan, room) - getRoomFloorElevation(plan, room));
}

export function clampOpeningOffsetToWall(opening: PlanOpening, wall: PlanWall): PlanOpening {
  const wallLen = distance(wall.start, wall.end);
  const maxOffset = Math.max(0, wallLen - opening.width);
  const nextOffset = clamp(opening.offset, 0, maxOffset);
  return nextOffset === opening.offset ? opening : { ...opening, offset: nextOffset };
}

export function distance(a: PlanPoint, b: PlanPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function clampPositive(n: number, fallback: number): number {
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

