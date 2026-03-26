import { useMemo, type ReactNode } from 'react';
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
          const isOh = o.type === 'overhead_door';
          const fill = isOh ? '#ffedd5' : o.type === 'door' ? '#bae6fd' : '#fef9c3';
          const stroke = isOh ? '#d97706' : o.type === 'door' ? '#0284c7' : '#a16207';
          const pr = isOh ? Math.max(1, o.overheadStyle?.panelRows ?? 4) : 0;
          const pc = isOh ? Math.max(1, o.overheadStyle?.panelCols ?? 3) : 0;
          const gridLines: ReactNode[] = [];
          if (isOh && pr > 0 && pc > 0) {
            for (let i = 1; i < pc; i++) {
              const lx = x + (i / pc) * ww;
              gridLines.push(
                <line key={`v_${i}`} x1={lx} y1={y} x2={lx} y2={y + hh} stroke={stroke} strokeWidth={0.35} opacity={0.5} />
              );
            }
            for (let j = 1; j < pr; j++) {
              const ly = y + (j / pr) * hh;
              gridLines.push(
                <line key={`h_${j}`} x1={x} y1={ly} x2={x + ww} y2={ly} stroke={stroke} strokeWidth={0.35} opacity={0.5} />
              );
            }
          }
          return (
            <g key={o.id}>
              <rect x={x} y={y} width={Math.max(2, ww)} height={Math.max(2, hh)} fill={fill} stroke={stroke} strokeWidth={1} />
              {gridLines}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

