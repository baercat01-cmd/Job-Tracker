import { useState } from 'react';
import type { BuildingPlanModel } from '@/lib/buildingPlanModel';
import { PlanCrossSectionPrint } from '@/components/plans/PlanCrossSectionPrint';
import { PlanWallElevationDraw } from '@/components/plans/PlanWallElevationDraw';
import { ZoomableDiagramViewport } from '@/components/plans/ZoomableDiagramViewport';

const SIDES = ['Front', 'Back', 'Left', 'Right'] as const;

/**
 * Wall elevations (all four sides) plus half cross section, inside a pan/zoom viewport.
 */
export function PlanSectionSheet(props: { plan: BuildingPlanModel; className?: string }) {
  const { plan, className = '' } = props;
  const [showMetalPanels, setShowMetalPanels] = useState(true);

  return (
    <div className={`flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-hidden ${className}`}>
      <div className="print:hidden rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700">
        <p className="text-xs font-semibold text-slate-800">How to view framing</p>
        <p className="mt-1 text-[11px] leading-snug text-slate-600">
          Select <strong className="font-medium text-slate-800">Framing only</strong> below to hide the metal skin and see posts, girts, sheathing, and openings.{' '}
          <strong className="font-medium text-slate-800">+ Metal skin</strong> adds neutral gray 3′ panel seams on top (gable rule: Front/Back when length ≥ width, else Left/Right).
        </p>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-6">
          <label className="flex cursor-pointer items-center gap-2 text-xs">
            <input
              type="radio"
              className="border-slate-300 text-slate-800"
              name="elevation-wall-skin"
              checked={!showMetalPanels}
              onChange={() => setShowMetalPanels(false)}
            />
            Framing only
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-xs">
            <input
              type="radio"
              className="border-slate-300 text-slate-800"
              name="elevation-wall-skin"
              checked={showMetalPanels}
              onChange={() => setShowMetalPanels(true)}
            />
            + Metal panel skin (3′ modules, gray)
          </label>
        </div>
      </div>
      <ZoomableDiagramViewport className="min-h-0 flex-1 basis-0">
        <div className="inline-block w-max max-w-full bg-white p-8 pb-12 shadow-sm">
          <section className="mb-12">
            <h2 className="mb-6 border-b border-slate-200 pb-2 text-sm font-semibold text-slate-800">
              Wall elevations (full run, schematic)
            </h2>
            <div className="grid grid-cols-1 gap-10 lg:grid-cols-2 xl:gap-x-14 [&>div]:min-w-0">
              {SIDES.map((side) => (
                <PlanWallElevationDraw
                  key={side}
                  plan={plan}
                  side={side}
                  runLength={560}
                  showMetalPanels={showMetalPanels}
                />
              ))}
            </div>
          </section>
          <section>
            <h2 className="mb-4 border-b border-slate-200 pb-2 text-sm font-semibold text-slate-800">
              Cross section (half building, detail)
            </h2>
            <PlanCrossSectionPrint plan={plan} embedInPanZoom showActions className="min-w-[1180px]" />
          </section>
        </div>
      </ZoomableDiagramViewport>
    </div>
  );
}
