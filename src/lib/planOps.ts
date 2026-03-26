import type {
  BuildingPlanModel,
  PlanEntityId,
  PlanFixture,
  PlanLoft,
  PlanOpening,
  PlanRoom,
  PlanStair,
  PlanWall,
} from '@/lib/buildingPlanModel';
import {
  bumpRev,
  clampLoftStairOpeningToLoftBounds,
  clampOpeningOffsetToWall,
  getWall,
  newId,
} from '@/lib/buildingPlanModel';

export type PlanActorId = string;

export type PlanOp =
  | { type: 'set_dims'; dims: BuildingPlanModel['dims'] }
  | { type: 'upsert_wall'; wall: PlanWall }
  | { type: 'delete_wall'; wallId: PlanEntityId }
  | { type: 'upsert_opening'; opening: PlanOpening }
  /** Apply multiple new/changed openings in one revision (e.g. a row of doors). */
  | { type: 'upsert_openings_batch'; openings: PlanOpening[] }
  | { type: 'delete_opening'; openingId: PlanEntityId }
  | { type: 'upsert_room'; room: PlanRoom }
  | { type: 'delete_room'; roomId: PlanEntityId }
  | { type: 'upsert_loft'; loft: PlanLoft }
  | { type: 'delete_loft'; loftId: PlanEntityId }
  | { type: 'upsert_stair'; stair: PlanStair }
  | { type: 'delete_stair'; stairId: PlanEntityId }
  | { type: 'upsert_fixture'; fixture: PlanFixture }
  | { type: 'delete_fixture'; fixtureId: PlanEntityId };

export type PlanWireMessage = {
  opId: string;
  actorId: PlanActorId;
  ts: number;
  op: PlanOp;
};

export function newOpId(): string {
  return newId('op');
}

export function applyOp(plan: BuildingPlanModel, op: PlanOp): BuildingPlanModel {
  switch (op.type) {
    case 'set_dims': {
      return bumpRev({ ...plan, dims: { ...op.dims } });
    }
    case 'upsert_wall': {
      const idx = plan.walls.findIndex((w) => w.id === op.wall.id);
      const nextWalls = idx >= 0 ? replaceAt(plan.walls, idx, op.wall) : [...plan.walls, op.wall];

      // Keep openings attached to this wall clamped to its new length.
      const nextOpenings = plan.openings.map((o) => {
        if (o.wallId !== op.wall.id) return o;
        return clampOpeningOffsetToWall(o, op.wall);
      });

      return bumpRev({ ...plan, walls: nextWalls, openings: nextOpenings });
    }
    case 'delete_wall': {
      const nextWalls = plan.walls.filter((w) => w.id !== op.wallId);
      const nextOpenings = plan.openings.filter((o) => o.wallId !== op.wallId);
      return bumpRev({ ...plan, walls: nextWalls, openings: nextOpenings });
    }
    case 'upsert_opening': {
      const wall = getWall(plan, op.opening.wallId);
      const opening = wall ? clampOpeningOffsetToWall(op.opening, wall) : op.opening;
      const idx = plan.openings.findIndex((o) => o.id === opening.id);
      const nextOpenings = idx >= 0 ? replaceAt(plan.openings, idx, opening) : [...plan.openings, opening];
      return bumpRev({ ...plan, openings: nextOpenings });
    }
    case 'upsert_openings_batch': {
      let nextOpenings = [...plan.openings];
      for (const raw of op.openings) {
        const wall = getWall(plan, raw.wallId);
        const opening = wall ? clampOpeningOffsetToWall(raw, wall) : raw;
        const idx = nextOpenings.findIndex((o) => o.id === opening.id);
        if (idx >= 0) nextOpenings = replaceAt(nextOpenings, idx, opening);
        else nextOpenings = [...nextOpenings, opening];
      }
      return bumpRev({ ...plan, openings: nextOpenings });
    }
    case 'delete_opening': {
      return bumpRev({ ...plan, openings: plan.openings.filter((o) => o.id !== op.openingId) });
    }
    case 'upsert_room': {
      const idx = plan.rooms.findIndex((r) => r.id === op.room.id);
      const next = idx >= 0 ? replaceAt(plan.rooms, idx, op.room) : [...plan.rooms, op.room];
      return bumpRev({ ...plan, rooms: next });
    }
    case 'delete_room': {
      return bumpRev({ ...plan, rooms: plan.rooms.filter((r) => r.id !== op.roomId) });
    }
    case 'upsert_loft': {
      const loft =
        op.loft.stairOpening != null ? clampLoftStairOpeningToLoftBounds(op.loft) : op.loft;
      const idx = plan.lofts.findIndex((l) => l.id === loft.id);
      const next = idx >= 0 ? replaceAt(plan.lofts, idx, loft) : [...plan.lofts, loft];
      return bumpRev({ ...plan, lofts: next });
    }
    case 'delete_loft': {
      return bumpRev({
        ...plan,
        lofts: plan.lofts.filter((l) => l.id !== op.loftId),
        stairs: (plan.stairs ?? []).filter((s) => s.loftId !== op.loftId),
      });
    }
    case 'upsert_stair': {
      const list = plan.stairs ?? [];
      const idx = list.findIndex((s) => s.id === op.stair.id);
      const next = idx >= 0 ? replaceAt(list, idx, op.stair) : [...list, op.stair];
      return bumpRev({ ...plan, stairs: next });
    }
    case 'delete_stair': {
      return bumpRev({ ...plan, stairs: (plan.stairs ?? []).filter((s) => s.id !== op.stairId) });
    }
    case 'upsert_fixture': {
      const idx = plan.fixtures.findIndex((f) => f.id === op.fixture.id);
      const next = idx >= 0 ? replaceAt(plan.fixtures, idx, op.fixture) : [...plan.fixtures, op.fixture];
      return bumpRev({ ...plan, fixtures: next });
    }
    case 'delete_fixture': {
      return bumpRev({ ...plan, fixtures: plan.fixtures.filter((f) => f.id !== op.fixtureId) });
    }
    default: {
      return plan;
    }
  }
}

function replaceAt<T>(arr: T[], idx: number, value: T): T[] {
  const next = arr.slice();
  next[idx] = value;
  return next;
}

