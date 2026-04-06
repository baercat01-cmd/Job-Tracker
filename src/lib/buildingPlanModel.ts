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

export interface PlanOverheadStyle {
  colorHex: string;
  panelRows: number;
  panelCols: number;
  windowPanelIndices: number[];
}

export const DEFAULT_OVERHEAD_STYLE: PlanOverheadStyle = {
  colorHex: '#475569',
  panelRows: 4,
  panelCols: 4,
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
  /** Style for overhead doors (only when type is 'overhead_door'). */
  overheadStyle?: PlanOverheadStyle;
}

/** Nominal post face width used in layout & drawings (feet). */
export const DEFAULT_POST_FACE_WIDTH_FT = 4 / 12;

/** Perimeter line post spacing and post sizes (saved on the plan). */
export interface PlanPerimeterPostSettings {
  /** Center-to-center spacing after the first bay (feet). */
  ocSpacingFt: number;
  /** Feet from corner post outside face to first intermediate post center. */
  firstBayFromCornerOutsideFt: number;
  /** Eave / long-wall runs (not gable end). Default 4″. */
  eaveWallPostWidthFt?: number;
  /** Gable-end walls. Default 4″. */
  gableWallPostWidthFt?: number;
  /** Walk-door jamb posts (when enabled). Default matches eave width. */
  doorJambPostWidthFt?: number;
  /** Overhead door jamb posts. Default matches door jamb or eave. */
  overheadJambPostWidthFt?: number;
  /** Add posts at walk-door jambs (each side of opening). */
  addWalkDoorJambPosts?: boolean;
}

export const DEFAULT_PERIMETER_POST_SETTINGS: PlanPerimeterPostSettings = {
  ocSpacingFt: 8,
  firstBayFromCornerOutsideFt: 8,
};

/** Fully resolved post settings for layout & rendering. */
export type ResolvedPerimeterPostSettings = {
  ocSpacingFt: number;
  firstBayFromCornerOutsideFt: number;
  eaveWallPostWidthFt: number;
  gableWallPostWidthFt: number;
  doorJambPostWidthFt: number;
  overheadJambPostWidthFt: number;
  addWalkDoorJambPosts: boolean;
  /** max face width / 2 for overlap checks */
  maxPostHalfFt: number;
};

export interface PlanLoftStairOpening {
  x: number; // feet from loft origin
  y: number; // feet from loft origin
  width: number; // feet
  depth: number; // feet
}

export interface PlanLoft {
  id: PlanEntityId;
  name?: string;
  origin: PlanPoint;
  width: number; // feet
  depth: number; // feet
  elevation: number; // feet above floor
  clearHeight?: number; // feet
  stairOpening?: PlanLoftStairOpening | null;
}

export type PlanRoomLevel = 'main' | 'loft_deck' | 'loft_upper';

export interface PlanRoom {
  id: PlanEntityId;
  name?: string;
  origin: PlanPoint;
  width: number; // feet
  depth: number; // feet
  wallThickness: number; // feet
  level?: PlanRoomLevel;
  loftId?: PlanEntityId | null;
  loftUpperFloorOffsetFt?: number;
  wallTopMode?: 'to_ceiling' | 'custom';
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

export interface PlanStair {
  id: PlanEntityId;
  /** Bottom of stair run in plan. */
  foot: PlanPoint;
  /** Tread width. */
  width: number; // feet
  /** Horizontal run distance. */
  run: number; // feet
  /** Total vertical rise. */
  rise: number; // feet
  /** Angle in degrees from +x axis. */
  angleDeg: number;
  /** Associated loft (optional). */
  loftId?: PlanEntityId | null;
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
  fixtures: PlanFixture[];
  stairs?: PlanStair[];
  meta: {
    createdAt: string;
    updatedAt: string;
    rev: number;
  };
  /** Perimeter post spacing; omitted = defaults (8′ / 8′). */
  perimeterPosts?: PlanPerimeterPostSettings;
}

const POST_WIDTH_MIN_FT = 2.5 / 12;
const POST_WIDTH_MAX_FT = 2;

export function getPerimeterPostSettings(plan: BuildingPlanModel): PlanPerimeterPostSettings {
  const p = plan.perimeterPosts;
  const d = DEFAULT_PERIMETER_POST_SETTINGS;
  if (!p) return { ...d };
  return {
    ocSpacingFt: Number.isFinite(p.ocSpacingFt) ? clamp(p.ocSpacingFt, 1, 64) : d.ocSpacingFt,
    firstBayFromCornerOutsideFt: Number.isFinite(p.firstBayFromCornerOutsideFt)
      ? clamp(p.firstBayFromCornerOutsideFt, 1, 64)
      : d.firstBayFromCornerOutsideFt,
    eaveWallPostWidthFt: p.eaveWallPostWidthFt,
    gableWallPostWidthFt: p.gableWallPostWidthFt,
    doorJambPostWidthFt: p.doorJambPostWidthFt,
    overheadJambPostWidthFt: p.overheadJambPostWidthFt,
    addWalkDoorJambPosts: p.addWalkDoorJambPosts,
  };
}

function clampPostWidthFt(v: number | undefined, fallback: number): number {
  if (!Number.isFinite(v)) return fallback;
  return clamp(v, POST_WIDTH_MIN_FT, POST_WIDTH_MAX_FT);
}

export function resolvePerimeterPostSettings(plan: BuildingPlanModel): ResolvedPerimeterPostSettings {
  const p = plan.perimeterPosts;
  const d = DEFAULT_PERIMETER_POST_SETTINGS;
  const oc = Number.isFinite(p?.ocSpacingFt) ? clamp(p!.ocSpacingFt, 1, 64) : d.ocSpacingFt;
  const fb = Number.isFinite(p?.firstBayFromCornerOutsideFt)
    ? clamp(p!.firstBayFromCornerOutsideFt, 1, 64)
    : d.firstBayFromCornerOutsideFt;
  const eave = clampPostWidthFt(p?.eaveWallPostWidthFt, DEFAULT_POST_FACE_WIDTH_FT);
  const gable = clampPostWidthFt(p?.gableWallPostWidthFt, eave);
  const doorJ = clampPostWidthFt(p?.doorJambPostWidthFt, eave);
  const ohJ = clampPostWidthFt(p?.overheadJambPostWidthFt, doorJ);
  const addDoorJambs = p?.addWalkDoorJambPosts === true;
  const maxW = Math.max(eave, gable, doorJ, ohJ);
  return {
    ocSpacingFt: oc,
    firstBayFromCornerOutsideFt: fb,
    eaveWallPostWidthFt: eave,
    gableWallPostWidthFt: gable,
    doorJambPostWidthFt: doorJ,
    overheadJambPostWidthFt: ohJ,
    addWalkDoorJambPosts: addDoorJambs,
    maxPostHalfFt: maxW / 2,
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
  // Wall order (and opening `offset` = ft along wall from `start` → `end`):
  // Front (0,0)→(w,0), Right (w,0)→(w,l), Back (w,l)→(0,l), Left (0,l)→(0,0).
  // Elevations and 3D must use the same edge directions when mapping offsets.
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

export function normalizeRoomLevel(room: PlanRoom): PlanRoomLevel {
  return room.level ?? 'main';
}

export function roomMatchesFloor(
  room: PlanRoom,
  activeFloor: { kind: 'main' } | { kind: 'loft_deck'; loftId: PlanEntityId } | { kind: 'loft_upper'; loftId: PlanEntityId }
): boolean {
  const level = normalizeRoomLevel(room);
  if (activeFloor.kind === 'main') return level === 'main';
  if (activeFloor.kind === 'loft_deck') {
    return level === 'loft_deck' && room.loftId === activeFloor.loftId;
  }
  if (activeFloor.kind === 'loft_upper') {
    return level === 'loft_upper' && room.loftId === activeFloor.loftId;
  }
  return false;
}

function clampPositive(n: number, fallback: number): number {
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * Returns the floor elevation (in feet above grade) for a given room.
 * - Main floor rooms: 0
 * - Rooms on a loft deck: the loft's elevation
 * - Rooms above a loft: the loft's elevation + the room's loftUpperFloorOffsetFt
 */
export function getRoomFloorElevation(plan: BuildingPlanModel, room: PlanRoom): number {
  const level = normalizeRoomLevel(room);
  if (level === 'main') return 0;
  const loft = room.loftId ? plan.lofts.find((l) => l.id === room.loftId) : undefined;
  if (!loft) return 0;
  if (level === 'loft_deck') return loft.elevation;
  if (level === 'loft_upper') return loft.elevation + (room.loftUpperFloorOffsetFt ?? 0);
  return 0;
}

