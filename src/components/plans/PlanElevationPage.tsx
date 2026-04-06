import { useMemo, useState } from 'react';
import type { BuildingPlanModel, PlanViewSide } from '@/lib/buildingPlanModel';
import { formatArchitecturalFeetDetailed } from '@/lib/architecturalFormat';
import { computeElevationMetalCutList, ELEVATION_METAL_PANEL_MODULE_FT } from '@/lib/elevationMetalCutList';
import { PlanWallElevationDraw } from '@/components/plans/PlanWallElevationDraw';
import { ZoomableDiagramViewport } from '@/components/plans/ZoomableDiagramViewport';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const ELEVATION_SIDES = ['Front', 'Back', 'Left', 'Right'] as const satisfies readonly PlanViewSide[];

type PlanElevationPageProps = {
  plan: BuildingPlanModel;
  side: PlanViewSide;
  className?: string;
  onEditOnFloor: () => void;
  onEditDoors: () => void;
  onEditWindows: () => void;
  onEditOverhead: () => void;
};

/**
 * Full-size elevation for Front/Back/Left/Right workspace tabs (same drawing as Section sheet, wider).
 * Openings are edited on the floor plan; this view updates from `plan`.
 */
export function PlanElevationPage({
  plan,
  side,
  className = '',
  onEditOnFloor,
  onEditDoors,
  onEditWindows,
  onEditOverhead,
}: PlanElevationPageProps) {
  const [showMetalPanels, setShowMetalPanels] = useState(true);
  const [showMetalCutList, setShowMetalCutList] = useState(false);

  const metalCutListsAllSides = useMemo(
    () =>
      ELEVATION_SIDES.map((s) => ({
        side: s,
        list: computeElevationMetalCutList(plan, s)!,
      })),
    [plan]
  );

  const metalCutListTotals = useMemo(() => {
    let panels = 0;
    let sq = 0;
    for (const { list } of metalCutListsAllSides) {
      panels += list.panels.length;
      sq += list.approxWallFaceSqFt;
    }
    return { panels, sq };
  }, [metalCutListsAllSides]);

  return (
    <div className={`flex h-full min-h-0 min-w-0 flex-1 flex-col gap-1.5 overflow-hidden ${className}`}>
      <div className="shrink-0 flex flex-col gap-1.5 rounded-none border-b border-slate-200 bg-slate-50 px-3 py-1.5 text-slate-700 print:hidden sm:rounded-md sm:border sm:py-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold text-slate-800">
            {side} · edit openings on the floor plan, then return here
          </p>
          <div className="flex flex-wrap gap-1.5">
            <Button type="button" size="sm" variant="outline" className="h-7 text-[11px]" onClick={onEditOnFloor}>
              Floor plan
            </Button>
            <Button type="button" size="sm" variant="outline" className="h-7 text-[11px]" onClick={onEditDoors}>
              Doors
            </Button>
            <Button type="button" size="sm" variant="outline" className="h-7 text-[11px]" onClick={onEditWindows}>
              Windows
            </Button>
            <Button type="button" size="sm" variant="outline" className="h-7 text-[11px]" onClick={onEditOverhead}>
              Overhead
            </Button>
          </div>
        </div>
        <p className="text-[11px] leading-snug text-slate-600">
          <strong className="font-medium text-slate-800">Framing only</strong> hides the metal skin.{' '}
          <strong className="font-medium text-slate-800">+ Metal skin</strong> shows gray 3′ panel seams.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-6">
          <label className="flex cursor-pointer items-center gap-2 text-xs">
            <input
              type="radio"
              className="border-slate-300 text-slate-800"
              name={`elevation-wall-skin-${side}`}
              checked={!showMetalPanels}
              onChange={() => setShowMetalPanels(false)}
            />
            Framing only
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-xs">
            <input
              type="radio"
              className="border-slate-300 text-slate-800"
              name={`elevation-wall-skin-${side}`}
              checked={showMetalPanels}
              onChange={() => setShowMetalPanels(true)}
            />
            + Metal panel skin
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 pt-2">
          <Button
            type="button"
            size="sm"
            variant={showMetalCutList ? 'default' : 'outline'}
            className="h-7 text-[11px]"
            onClick={() => setShowMetalCutList((v) => !v)}
          >
            {showMetalCutList ? 'Hide metal cut list' : 'Metal cut list'}
          </Button>
          <span className="text-[10px] text-slate-500">
            {ELEVATION_SIDES.length} sides · {metalCutListTotals.panels} panel
            {metalCutListTotals.panels === 1 ? '' : 's'} · {ELEVATION_METAL_PANEL_MODULE_FT}′ module · ~
            {metalCutListTotals.sq.toFixed(0)} ft² gross (all walls)
          </span>
        </div>
      </div>

      {showMetalCutList ? (
        <div className="shrink-0 rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-800 print:break-inside-avoid">
          <div className="mb-2 text-xs font-semibold text-slate-900">Metal wall sheet cut list — by side</div>
          <p className="mb-3 text-[10px] leading-snug text-slate-600">
            Each wall is listed separately. Gross vertical bays use {ELEVATION_METAL_PANEL_MODULE_FT}′ panel seams (same as
            the drawings). Openings are not deducted — trim, laps, and J-channel at doors/windows per your panel system.
          </p>
          <div className="max-h-[min(55vh,520px)] space-y-4 overflow-y-auto pr-1">
            {metalCutListsAllSides.map(({ side: wallSide, list }) => (
              <section
                key={wallSide}
                className={cn(
                  'rounded-md border border-slate-200 bg-slate-50/60 p-2.5 print:break-inside-avoid',
                  wallSide === side && 'ring-2 ring-green-200 ring-offset-1 ring-offset-white'
                )}
              >
                <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200 pb-1.5">
                  <h3 className="text-[11px] font-bold text-slate-900">
                    {wallSide} elevation {list.isGable ? '(gable end)' : '(eave side)'}
                    {wallSide === side ? (
                      <span className="ml-1.5 font-normal text-green-800">· current view</span>
                    ) : null}
                  </h3>
                  <span className="text-[10px] text-slate-600">
                    {list.panels.length} panel{list.panels.length === 1 ? '' : 's'} · ~{list.approxWallFaceSqFt.toFixed(0)}{' '}
                    ft² gross
                  </span>
                </div>
                <div className="overflow-x-auto rounded border border-slate-100 bg-white">
                  <table className="w-full min-w-[520px] border-collapse text-[11px]">
                    <thead className="bg-slate-100 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                      <tr>
                        <th className="border-b border-slate-200 px-2 py-1.5">#</th>
                        <th className="border-b border-slate-200 px-2 py-1.5">From</th>
                        <th className="border-b border-slate-200 px-2 py-1.5">To</th>
                        <th className="border-b border-slate-200 px-2 py-1.5">Width</th>
                        <th className="border-b border-slate-200 px-2 py-1.5">H left</th>
                        <th className="border-b border-slate-200 px-2 py-1.5">H right</th>
                        <th className="border-b border-slate-200 px-2 py-1.5">Max H</th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.panels.map((p) => (
                        <tr key={`${wallSide}-${p.bay}`} className="border-b border-slate-100 odd:bg-slate-50/80">
                          <td className="px-2 py-1 font-medium tabular-nums">{p.bay}</td>
                          <td className="px-2 py-1 tabular-nums">{formatArchitecturalFeetDetailed(p.fromFt)}</td>
                          <td className="px-2 py-1 tabular-nums">{formatArchitecturalFeetDetailed(p.toFt)}</td>
                          <td className="px-2 py-1 tabular-nums">{formatArchitecturalFeetDetailed(p.widthFt)}</td>
                          <td className="px-2 py-1 tabular-nums">{formatArchitecturalFeetDetailed(p.heightLeftFt)}</td>
                          <td className="px-2 py-1 tabular-nums">{formatArchitecturalFeetDetailed(p.heightRightFt)}</td>
                          <td className="px-2 py-1 tabular-nums font-medium">
                            {formatArchitecturalFeetDetailed(p.heightMaxFt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-1.5 text-[10px] text-slate-500">
                  Eave {formatArchitecturalFeetDetailed(list.eaveHeightFt)} · pitch {list.pitch}/12
                  {list.isGable
                    ? ` · ridge rise +${formatArchitecturalFeetDetailed(list.ridgeRiseFt)} · run ${formatArchitecturalFeetDetailed(list.wallRunFt)}`
                    : ` · run ${formatArchitecturalFeetDetailed(list.wallRunFt)}`}
                </p>
              </section>
            ))}
          </div>
        </div>
      ) : null}

      <ZoomableDiagramViewport className="min-h-0 flex-1 basis-0 !rounded-none !border-0 bg-slate-50">
        <div className="inline-block w-full min-w-0 max-w-none bg-white p-3 pb-6 shadow-sm sm:p-6 sm:pb-10">
          <PlanWallElevationDraw
            plan={plan}
            side={side}
            variant="full"
            runLength={720}
            showMetalPanels={showMetalPanels}
          />
        </div>
      </ZoomableDiagramViewport>
    </div>
  );
}
