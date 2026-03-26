import { useMemo } from 'react';
import type { BuildingPlanModel, PlanViewSide } from '@/lib/buildingPlanModel';

export function PlanElevationPreview(props: {
  plan: BuildingPlanModel;
  side: PlanViewSide;
  className?: string;
}) {
  const { plan, side, className } = props;
  const w = plan.dims.width;
  const l = plan.dims.length;
  const h = plan.dims.height;

  const wallLabel = useMemo(() => {
    switch (side) {
      case 'Front':
        return 'Front';
      case 'Back':
        return 'Back';
      case 'Left':
        return 'Left';
      case 'Right':
        return 'Right';
      default:
        return 'Front';
    }
  }, [side]);

  const wall = plan.walls.find((ww) => ww.label === wallLabel) ?? null;

  const openings = useMemo(() => {
    if (!wall) return [];
    return plan.openings.filter((o) => o.wallId === wall.id);
  }, [plan.openings, wall]);

  const viewWidth = side === 'Left' || side === 'Right' ? l : w;

  // Simple elevation: rectangle + openings projected along wall (offset/width) and height/sill.
  return (
    <div className={className}>
      <svg viewBox={`0 0 100 70`} className="w-full h-full">
        <rect x={5} y={5} width={90} height={60} fill="#f8fafc" stroke="#0f172a" strokeWidth={2} />
        {openings.map((o) => {
          const x = 5 + (o.offset / viewWidth) * 90;
          const ww = (o.width / viewWidth) * 90;
          const y = 5 + 60 - (o.sill / h) * 60 - (o.height / h) * 60;
          const hh = (o.height / h) * 60;
          return (
            <rect
              key={o.id}
              x={x}
              y={y}
              width={Math.max(2, ww)}
              height={Math.max(2, hh)}
              fill={o.type === 'door' ? '#bae6fd' : '#fef9c3'}
              stroke={o.type === 'door' ? '#0284c7' : '#a16207'}
              strokeWidth={1}
            />
          );
        })}
      </svg>
    </div>
  );
}

