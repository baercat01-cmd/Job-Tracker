import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertTriangle,
  Building2,
  Calculator,
  CheckCircle2,
  Gauge,
  History,
  Layers,
  Receipt,
  TrendingUp,
} from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';

function formatCurrency(value: number): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function parseNum(raw: string, fallback: number): number {
  const n = Number(String(raw).replace(/,/g, ''));
  return Number.isFinite(n) ? n : fallback;
}

const DEFAULTS: Record<string, number> = {
  totalAnnualOverhead: 1_052_957,
  totalAnnualFieldHours: 20_830,
  avgCrewWage: 25,
  targetChargeRate: 60,
  sampleJobHours: 400,
  sampleMaterialsCost: 40_000,
  targetNetMarginPct: 20,
  /** Prior year: avg field FTE / headcount used for annual overhead per employee */
  priorYearAvgFieldEmployees: 14,
  /** Prior year: jobs completed (or jobs you allocate overhead across—match your books) */
  priorYearJobsCount: 40,
};

/** Legacy single key (all users); migrated to per-user keys on load */
const LEGACY_STORAGE_KEY = 'fieldtrack:profit-margin-overhead-dashboard:v1';
const STORAGE_KEY_BASE = 'fieldtrack:profit-margin-overhead-dashboard';

function readFieldtrackUserIdFromStorage(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem('fieldtrack_user_id');
  } catch {
    return null;
  }
}

function profitMarginStorageKey(profileId?: string | null): string {
  const uid = readFieldtrackUserIdFromStorage() ?? profileId ?? null;
  return uid ? `${STORAGE_KEY_BASE}:v2:${uid}` : `${STORAGE_KEY_BASE}:v2:local`;
}

export type ProfitMarginDashboardState = {
  totalAnnualOverhead: number;
  totalAnnualFieldHours: number;
  avgCrewWage: number;
  targetChargeRate: number;
  sampleJobHours: number;
  sampleMaterialsCost: number;
  targetNetMarginPct: number;
  priorYearOverhead: number;
  priorYearFieldHours: number;
  priorYearAvgFieldEmployees: number;
  priorYearJobsCount: number;
  plannedOverhead: number;
  plannedFieldHours: number;
  plannedAvgFieldEmployees: number;
  plannedJobsCount: number;
};

function buildInitialState(): ProfitMarginDashboardState {
  return {
    totalAnnualOverhead: DEFAULTS.totalAnnualOverhead,
    totalAnnualFieldHours: DEFAULTS.totalAnnualFieldHours,
    avgCrewWage: DEFAULTS.avgCrewWage,
    targetChargeRate: DEFAULTS.targetChargeRate,
    sampleJobHours: DEFAULTS.sampleJobHours,
    sampleMaterialsCost: DEFAULTS.sampleMaterialsCost,
    targetNetMarginPct: DEFAULTS.targetNetMarginPct,
    priorYearOverhead: DEFAULTS.totalAnnualOverhead,
    priorYearFieldHours: DEFAULTS.totalAnnualFieldHours,
    priorYearAvgFieldEmployees: DEFAULTS.priorYearAvgFieldEmployees,
    priorYearJobsCount: DEFAULTS.priorYearJobsCount,
    plannedOverhead: DEFAULTS.totalAnnualOverhead,
    plannedFieldHours: DEFAULTS.totalAnnualFieldHours,
    plannedAvgFieldEmployees: DEFAULTS.priorYearAvgFieldEmployees,
    plannedJobsCount: DEFAULTS.priorYearJobsCount,
  };
}

function loadPersistedState(storageKey: string): ProfitMarginDashboardState {
  const initial = buildInitialState();
  if (typeof window === 'undefined') return initial;
  try {
    let raw = localStorage.getItem(storageKey);
    if (!raw) raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return initial;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const next = { ...initial };
    (Object.keys(initial) as (keyof ProfitMarginDashboardState)[]).forEach((key) => {
      const v = parsed[key as string];
      if (typeof v === 'number' && Number.isFinite(v)) {
        next[key] = v;
      }
    });
    return next;
  } catch {
    return initial;
  }
}

function persistProfitMarginState(storageKey: string, state: ProfitMarginDashboardState): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(storageKey, JSON.stringify(state));
  } catch {
    /* quota / private mode */
  }
}

export function ProfitMarginOverheadDashboard() {
  const { profile } = useAuth();
  const storageKey = useMemo(() => profitMarginStorageKey(profile?.id), [profile?.id]);

  const [state, setState] = useState<ProfitMarginDashboardState>(() =>
    loadPersistedState(profitMarginStorageKey()),
  );

  const stateRef = useRef(state);
  stateRef.current = state;
  const storageKeyRef = useRef(storageKey);
  storageKeyRef.current = storageKey;

  useEffect(() => {
    setState(loadPersistedState(storageKey));
  }, [storageKey]);

  useEffect(() => {
    persistProfitMarginState(storageKey, state);
  }, [storageKey, state]);

  useEffect(() => {
    const flush = () => persistProfitMarginState(storageKeyRef.current, stateRef.current);
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('beforeunload', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('beforeunload', flush);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  const patch = (partial: Partial<ProfitMarginDashboardState>) =>
    setState((prev) => ({ ...prev, ...partial }));

  const {
    totalAnnualOverhead,
    totalAnnualFieldHours,
    avgCrewWage,
    targetChargeRate,
    sampleJobHours,
    sampleMaterialsCost,
    targetNetMarginPct,
    priorYearOverhead,
    priorYearFieldHours,
    priorYearAvgFieldEmployees,
    priorYearJobsCount,
    plannedOverhead,
    plannedFieldHours,
    plannedAvgFieldEmployees,
    plannedJobsCount,
  } = state;

  const priorYearOverheadPerHour = useMemo(() => {
    if (priorYearFieldHours <= 0) return 0;
    return priorYearOverhead / priorYearFieldHours;
  }, [priorYearOverhead, priorYearFieldHours]);

  const priorYearOverheadPerEmployee = useMemo(() => {
    if (priorYearAvgFieldEmployees <= 0) return 0;
    return priorYearOverhead / priorYearAvgFieldEmployees;
  }, [priorYearOverhead, priorYearAvgFieldEmployees]);

  const priorYearOverheadPerJob = useMemo(() => {
    if (priorYearJobsCount <= 0) return 0;
    return priorYearOverhead / priorYearJobsCount;
  }, [priorYearOverhead, priorYearJobsCount]);

  const projectedOverheadPerHour = useMemo(() => {
    if (plannedFieldHours <= 0) return 0;
    return plannedOverhead / plannedFieldHours;
  }, [plannedOverhead, plannedFieldHours]);

  const projectedOverheadPerEmployee = useMemo(() => {
    if (plannedAvgFieldEmployees <= 0) return 0;
    return plannedOverhead / plannedAvgFieldEmployees;
  }, [plannedOverhead, plannedAvgFieldEmployees]);

  const projectedOverheadPerJob = useMemo(() => {
    if (plannedJobsCount <= 0) return 0;
    return plannedOverhead / plannedJobsCount;
  }, [plannedOverhead, plannedJobsCount]);

  function copyPriorYearToProjection() {
    setState((prev) => ({
      ...prev,
      plannedOverhead: prev.priorYearOverhead,
      plannedFieldHours: prev.priorYearFieldHours,
      plannedAvgFieldEmployees: prev.priorYearAvgFieldEmployees,
      plannedJobsCount: prev.priorYearJobsCount,
    }));
  }

  function applyProjectionToBaseline() {
    setState((prev) => ({
      ...prev,
      totalAnnualOverhead: prev.plannedOverhead,
      totalAnnualFieldHours: prev.plannedFieldHours,
    }));
  }


  const hourlyOverheadRate = useMemo(() => {
    if (totalAnnualFieldHours <= 0) return 0;
    return totalAnnualOverhead / totalAnnualFieldHours;
  }, [totalAnnualOverhead, totalAnnualFieldHours]);

  const trueCostPerHour = avgCrewWage + hourlyOverheadRate;
  const netProfitPerHour = targetChargeRate - trueCostPerHour;
  const negativeMargin = netProfitPerHour < 0;

  const jobOverheadBurden = sampleJobHours * hourlyOverheadRate;
  const jobLaborCost = sampleJobHours * avgCrewWage;
  const trueBreakevenCost = sampleMaterialsCost + jobOverheadBurden + jobLaborCost;
  const marginDecimal = Math.min(Math.max(targetNetMarginPct / 100, 0), 0.999);
  const recommendedBidPrice =
    marginDecimal >= 0.999 ? Number.POSITIVE_INFINITY : trueBreakevenCost / (1 - marginDecimal);

  const chartData = useMemo(
    () => [
      {
        name: 'What we charge',
        billableRate: targetChargeRate,
        wage: 0,
        overheadBurden: 0,
      },
      {
        name: 'True cost',
        billableRate: 0,
        wage: avgCrewWage,
        overheadBurden: hourlyOverheadRate,
      },
    ],
    [targetChargeRate, avgCrewWage, hourlyOverheadRate],
  );

  const tooltipFormatter = (v: number, name: string) => [`$${formatCurrency(v)}`, `${name} ($/hr)`];

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
        <div className="mb-4 flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
            <Gauge className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-slate-900 md:text-xl">
              Profit margin and overhead
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Post-frame construction scenario modeling: baseline burden, per-hour leakage, and bid
              targets using your charge rate and margin goal. All inputs save automatically for the
              signed-in office user on this device (browser storage), including after refresh or when
              you leave the tab.
            </p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-1 xl:grid-cols-1">
          {/* PRIOR YEAR + PROJECTION */}
          <section
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm ring-1 ring-slate-100"
            aria-labelledby="pm-section-consolidated"
          >
            <div className="mb-4 flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-2">
                <History className="mt-0.5 h-5 w-5 shrink-0 text-slate-600" aria-hidden />
                <div>
                  <h3 id="pm-section-consolidated" className="text-base font-semibold text-slate-900">
                    Consolidated actuals and projection
                  </h3>
                  <p className="mt-1 max-w-3xl text-sm text-slate-600">
                    Enter last year&apos;s consolidated overhead, field hours, average field headcount, and job
                    count. Adjust the plan column for next year to see projected overhead per employee, per
                    job, and per crew-hour. Headcount and jobs should match how you close the books (e.g.
                    completed jobs or total jobs in the year).
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={copyPriorYearToProjection}>
                  Copy prior year → plan
                </Button>
                <Button type="button" size="sm" onClick={applyProjectionToBaseline} className="bg-slate-800 hover:bg-slate-900">
                  Apply plan to baseline above
                </Button>
              </div>
            </div>

            <div className="grid gap-8 lg:grid-cols-2">
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                  <History className="h-4 w-4 text-slate-500" />
                  Prior year (consolidated)
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <Label htmlFor="prior-overhead" className="text-slate-700">
                      Total overhead (actual)
                    </Label>
                    <Input
                      id="prior-overhead"
                      inputMode="decimal"
                      className="mt-1.5 font-mono tabular-nums"
                      value={priorYearOverhead === 0 ? '' : priorYearOverhead}
                      placeholder="0"
                      onChange={(e) =>
                        patch({ priorYearOverhead: Math.max(0, parseNum(e.target.value, 0)) })
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="prior-hours" className="text-slate-700">
                      Field hours (actual)
                    </Label>
                    <Input
                      id="prior-hours"
                      inputMode="numeric"
                      className="mt-1.5 font-mono tabular-nums"
                      value={priorYearFieldHours}
                      onChange={(e) =>
                        patch({ priorYearFieldHours: Math.max(0, parseNum(e.target.value, priorYearFieldHours)) })
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="prior-employees" className="text-slate-700">
                      Avg field employees (FTE)
                    </Label>
                    <Input
                      id="prior-employees"
                      inputMode="decimal"
                      className="mt-1.5 font-mono tabular-nums"
                      value={priorYearAvgFieldEmployees}
                      onChange={(e) =>
                        patch({
                          priorYearAvgFieldEmployees: Math.max(
                            0,
                            parseNum(e.target.value, priorYearAvgFieldEmployees),
                          ),
                        })
                      }
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Label htmlFor="prior-jobs" className="text-slate-700">
                      Jobs in allocation pool
                    </Label>
                    <Input
                      id="prior-jobs"
                      inputMode="numeric"
                      className="mt-1.5 font-mono tabular-nums"
                      value={priorYearJobsCount}
                      onChange={(e) =>
                        patch({ priorYearJobsCount: Math.max(0, parseNum(e.target.value, priorYearJobsCount)) })
                      }
                    />
                  </div>
                </div>
                <dl className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50/90 p-4 sm:grid-cols-3">
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Per crew-hour
                    </dt>
                    <dd className="mt-1 font-semibold tabular-nums text-slate-900">
                      ${formatCurrency(priorYearOverheadPerHour)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Per employee / yr
                    </dt>
                    <dd className="mt-1 font-semibold tabular-nums text-slate-900">
                      ${formatCurrency(priorYearOverheadPerEmployee)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Per job
                    </dt>
                    <dd className="mt-1 font-semibold tabular-nums text-slate-900">
                      ${formatCurrency(priorYearOverheadPerJob)}
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="space-y-4 border-t border-slate-100 pt-6 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                  <TrendingUp className="h-4 w-4 text-emerald-600" />
                  Next year plan (projected)
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <Label htmlFor="plan-overhead" className="text-slate-700">
                      Planned total overhead
                    </Label>
                    <Input
                      id="plan-overhead"
                      inputMode="decimal"
                      className="mt-1.5 font-mono tabular-nums"
                      value={plannedOverhead === 0 ? '' : plannedOverhead}
                      placeholder="0"
                      onChange={(e) =>
                        patch({ plannedOverhead: Math.max(0, parseNum(e.target.value, 0)) })
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="plan-hours" className="text-slate-700">
                      Planned field hours
                    </Label>
                    <Input
                      id="plan-hours"
                      inputMode="numeric"
                      className="mt-1.5 font-mono tabular-nums"
                      value={plannedFieldHours}
                      onChange={(e) =>
                        patch({ plannedFieldHours: Math.max(0, parseNum(e.target.value, plannedFieldHours)) })
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="plan-employees" className="text-slate-700">
                      Planned avg field employees
                    </Label>
                    <Input
                      id="plan-employees"
                      inputMode="decimal"
                      className="mt-1.5 font-mono tabular-nums"
                      value={plannedAvgFieldEmployees}
                      onChange={(e) =>
                        patch({
                          plannedAvgFieldEmployees: Math.max(
                            0,
                            parseNum(e.target.value, plannedAvgFieldEmployees),
                          ),
                        })
                      }
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Label htmlFor="plan-jobs" className="text-slate-700">
                      Planned jobs in pool
                    </Label>
                    <Input
                      id="plan-jobs"
                      inputMode="numeric"
                      className="mt-1.5 font-mono tabular-nums"
                      value={plannedJobsCount}
                      onChange={(e) =>
                        patch({ plannedJobsCount: Math.max(0, parseNum(e.target.value, plannedJobsCount)) })
                      }
                    />
                  </div>
                </div>
                <dl className="grid gap-3 rounded-lg border-2 border-emerald-200 bg-emerald-50/50 p-4 sm:grid-cols-3">
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-emerald-800">
                      Projected / crew-hr
                    </dt>
                    <dd className="mt-1 font-semibold tabular-nums text-emerald-900">
                      ${formatCurrency(projectedOverheadPerHour)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-emerald-800">
                      Projected / employee
                    </dt>
                    <dd className="mt-1 font-semibold tabular-nums text-emerald-900">
                      ${formatCurrency(projectedOverheadPerEmployee)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-emerald-800">
                      Projected / job
                    </dt>
                    <dd className="mt-1 font-semibold tabular-nums text-emerald-900">
                      ${formatCurrency(projectedOverheadPerJob)}
                    </dd>
                  </div>
                </dl>
                <p className="text-xs text-slate-500">
                  Apply plan to baseline updates total annual overhead and total annual field hours in the section
                  below so the rest of the dashboard uses your projection.
                </p>
              </div>
            </div>
          </section>

          {/* SECTION 1 */}
          <section
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm ring-1 ring-slate-100"
            aria-labelledby="pm-section-baseline"
          >
            <div className="mb-6 flex items-center gap-2 border-b border-slate-100 pb-4">
              <Building2 className="h-5 w-5 text-emerald-600" aria-hidden />
              <h3 id="pm-section-baseline" className="text-base font-semibold text-slate-900">
                The baseline (global overhead)
              </h3>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-4">
                <div>
                  <Label htmlFor="annual-overhead" className="text-slate-700">
                    Total annual overhead
                  </Label>
                  <Input
                    id="annual-overhead"
                    inputMode="decimal"
                    className="mt-2 font-mono tabular-nums"
                    value={totalAnnualOverhead === 0 ? '' : totalAnnualOverhead}
                    placeholder="0"
                    onChange={(e) =>
                      patch({ totalAnnualOverhead: Math.max(0, parseNum(e.target.value, 0)) })
                    }
                  />
                  <Slider
                    className="mt-3"
                    min={0}
                    max={3_000_000}
                    step={1000}
                    value={[Math.min(totalAnnualOverhead, 3_000_000)]}
                    onValueChange={([v]) => patch({ totalAnnualOverhead: v })}
                  />
                </div>
                <div>
                  <Label htmlFor="field-hours" className="text-slate-700">
                    Total annual field hours
                  </Label>
                  <Input
                    id="field-hours"
                    inputMode="numeric"
                    className="mt-2 font-mono tabular-nums"
                    value={totalAnnualFieldHours}
                    onChange={(e) =>
                      patch({
                        totalAnnualFieldHours: Math.max(0, parseNum(e.target.value, totalAnnualFieldHours)),
                      })
                    }
                  />
                  <Slider
                    className="mt-3"
                    min={5000}
                    max={50000}
                    step={10}
                    value={[Math.min(Math.max(totalAnnualFieldHours, 5000), 50000)]}
                    onValueChange={([v]) => patch({ totalAnnualFieldHours: v })}
                  />
                </div>
              </div>

              <div className="flex flex-col justify-center rounded-lg border-2 border-emerald-200 bg-gradient-to-br from-emerald-50/80 to-white px-4 py-6 text-center md:px-6">
                <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                  Hourly overhead rate
                </p>
                <p className="mt-2 text-xs text-slate-600">Total overhead ÷ field hours</p>
                <p
                  className="mt-4 font-bold tracking-tight text-emerald-700"
                  style={{ fontSize: 'clamp(2.25rem, 8vw, 3.75rem)', lineHeight: 1.05 }}
                >
                  ${formatCurrency(hourlyOverheadRate)}
                </p>
                <p className="mt-1 text-sm font-medium text-slate-600">per crew-hour</p>
              </div>
            </div>
          </section>

          {/* SECTION 2 */}
          <section
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm ring-1 ring-slate-100"
            aria-labelledby="pm-section-leak"
          >
            <div className="mb-6 flex items-center gap-2 border-b border-slate-100 pb-4">
              <Layers className="h-5 w-5 text-violet-600" aria-hidden />
              <h3 id="pm-section-leak" className="text-base font-semibold text-slate-900">
                The profit leak visualizer (per employee hour)
              </h3>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <div className="space-y-4">
                <div>
                  <Label htmlFor="crew-wage" className="text-slate-700">
                    Average crew wage ($/hr)
                  </Label>
                  <Input
                    id="crew-wage"
                    inputMode="decimal"
                    className="mt-2 font-mono tabular-nums"
                    value={avgCrewWage}
                    onChange={(e) =>
                      patch({ avgCrewWage: Math.max(0, parseNum(e.target.value, avgCrewWage)) })
                    }
                  />
                  <Slider
                    className="mt-3"
                    min={15}
                    max={65}
                    step={0.5}
                    value={[Math.min(Math.max(avgCrewWage, 15), 65)]}
                    onValueChange={([v]) => patch({ avgCrewWage: v })}
                  />
                </div>
                <div>
                  <Label htmlFor="charge-rate" className="text-slate-700">
                    Target charge rate ($/hr)
                  </Label>
                  <Input
                    id="charge-rate"
                    inputMode="decimal"
                    className="mt-2 font-mono tabular-nums"
                    value={targetChargeRate}
                    onChange={(e) =>
                      patch({ targetChargeRate: Math.max(0, parseNum(e.target.value, targetChargeRate)) })
                    }
                  />
                  <Slider
                    className="mt-3"
                    min={30}
                    max={150}
                    step={1}
                    value={[Math.min(Math.max(targetChargeRate, 30), 150)]}
                    onValueChange={([v]) => patch({ targetChargeRate: v })}
                  />
                </div>

                <dl className="grid grid-cols-2 gap-3 rounded-lg border border-slate-100 bg-slate-50/80 p-4 text-sm">
                  <div>
                    <dt className="text-slate-600">True cost / hr</dt>
                    <dd className="mt-1 font-semibold tabular-nums text-slate-900">
                      ${formatCurrency(trueCostPerHour)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-600">Net profit / hr</dt>
                    <dd
                      className={cn(
                        'mt-1 font-semibold tabular-nums',
                        negativeMargin ? 'text-red-600' : 'text-emerald-600',
                      )}
                    >
                      ${formatCurrency(netProfitPerHour)}
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="space-y-4">
                {negativeMargin ? (
                  <div
                    className="flex gap-3 rounded-lg border-2 border-red-300 bg-red-50 px-4 py-3 text-red-900 shadow-sm"
                    role="alert"
                  >
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
                    <p className="text-sm font-semibold leading-snug">
                      WARNING: Negative margin trap. You are losing money on every hour worked.
                    </p>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-900">
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
                    <span className="text-sm font-semibold">Healthy spread: positive margin per hour.</span>
                  </div>
                )}

                <div className="h-64 w-full min-w-0 md:h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={chartData}
                      margin={{ top: 8, right: 8, left: 0, bottom: 4 }}
                      barCategoryGap="18%"
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                      <XAxis
                        dataKey="name"
                        tick={{ fill: '#64748b', fontSize: 12 }}
                        axisLine={{ stroke: '#cbd5e1' }}
                      />
                      <YAxis
                        tick={{ fill: '#64748b', fontSize: 12 }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v) => `$${v}`}
                        domain={[0, 'auto']}
                      />
                      <Tooltip
                        formatter={tooltipFormatter}
                        labelFormatter={(label) => String(label)}
                        contentStyle={{
                          borderRadius: '8px',
                          border: '1px solid #e2e8f0',
                          boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.08)',
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: '12px', color: '#475569' }} />
                      <Bar dataKey="billableRate" stackId="stack" fill="#059669" name="What we charge" />
                      <Bar dataKey="wage" stackId="stack" fill="#64748b" name="Wage" />
                      <Bar dataKey="overheadBurden" stackId="stack" fill="#d97706" name="Overhead burden" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-xs text-slate-500">
                  Stacked bars use the same scale: billable rate vs. wage plus overhead burden per hour.
                </p>
              </div>
            </div>
          </section>

          {/* SECTION 3 */}
          <section
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm ring-1 ring-slate-100"
            aria-labelledby="pm-section-bid"
          >
            <div className="mb-6 flex items-center gap-2 border-b border-slate-100 pb-4">
              <Receipt className="h-5 w-5 text-sky-600" aria-hidden />
              <h3 id="pm-section-bid" className="text-base font-semibold text-slate-900">
                The bid calculator (per job)
              </h3>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <div className="space-y-4">
                <div>
                  <Label htmlFor="job-hours" className="text-slate-700">
                    Estimated job hours
                  </Label>
                  <Input
                    id="job-hours"
                    inputMode="numeric"
                    className="mt-2 font-mono tabular-nums"
                    value={sampleJobHours}
                    onChange={(e) =>
                      patch({ sampleJobHours: Math.max(0, parseNum(e.target.value, sampleJobHours)) })
                    }
                  />
                  <Slider
                    className="mt-3"
                    min={50}
                    max={2500}
                    step={10}
                    value={[Math.min(Math.max(sampleJobHours, 50), 2500)]}
                    onValueChange={([v]) => patch({ sampleJobHours: v })}
                  />
                </div>
                <div>
                  <Label htmlFor="materials-cost" className="text-slate-700">
                    Materials cost
                  </Label>
                  <Input
                    id="materials-cost"
                    inputMode="decimal"
                    className="mt-2 font-mono tabular-nums"
                    value={sampleMaterialsCost === 0 ? '' : sampleMaterialsCost}
                    placeholder="0"
                    onChange={(e) =>
                      patch({ sampleMaterialsCost: Math.max(0, parseNum(e.target.value, 0)) })
                    }
                  />
                  <Slider
                    className="mt-3"
                    min={0}
                    max={250_000}
                    step={500}
                    value={[Math.min(sampleMaterialsCost, 250_000)]}
                    onValueChange={([v]) => patch({ sampleMaterialsCost: v })}
                  />
                </div>
                <div>
                  <Label htmlFor="net-margin" className="text-slate-700">
                    Target net margin (%)
                  </Label>
                  <Input
                    id="net-margin"
                    inputMode="decimal"
                    className="mt-2 font-mono tabular-nums"
                    value={targetNetMarginPct}
                    onChange={(e) =>
                      patch({
                        targetNetMarginPct: Math.min(
                          99.9,
                          Math.max(0, parseNum(e.target.value, targetNetMarginPct)),
                        ),
                      })
                    }
                  />
                  <Slider
                    className="mt-3"
                    min={0}
                    max={45}
                    step={0.5}
                    value={[Math.min(Math.max(targetNetMarginPct, 0), 45)]}
                    onValueChange={([v]) => patch({ targetNetMarginPct: v })}
                  />
                </div>
              </div>

              <div className="flex flex-col justify-between rounded-lg border border-dashed border-slate-200 bg-slate-50/50 p-5">
                <div className="flex items-center gap-2 text-slate-700">
                  <Calculator className="h-4 w-4" />
                  <span className="text-sm font-medium uppercase tracking-wide">Cost breakdown</span>
                </div>
                <ul className="mt-4 space-y-3 font-mono text-sm tabular-nums">
                  <li className="flex justify-between gap-4 border-b border-slate-200/80 pb-2 text-slate-600">
                    <span>Materials</span>
                    <span className="text-slate-900">${formatCurrency(sampleMaterialsCost)}</span>
                  </li>
                  <li className="flex justify-between gap-4 border-b border-slate-200/80 pb-2 text-slate-600">
                    <span>Job overhead burden</span>
                    <span className="text-slate-900">${formatCurrency(jobOverheadBurden)}</span>
                  </li>
                  <li className="flex justify-between gap-4 border-b border-slate-200/80 pb-2 text-slate-600">
                    <span>Job labor cost</span>
                    <span className="text-slate-900">${formatCurrency(jobLaborCost)}</span>
                  </li>
                  <li className="flex justify-between gap-4 pt-1 text-slate-800">
                    <span className="font-semibold">True breakeven</span>
                    <span className="font-semibold text-slate-900">${formatCurrency(trueBreakevenCost)}</span>
                  </li>
                </ul>

                <div className="mt-6 rounded-lg border-2 border-sky-300 bg-white px-4 py-5 text-center shadow-sm">
                  <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                    Recommended bid price
                  </p>
                  <p
                    className="mt-2 font-bold tracking-tight text-sky-700"
                    style={{ fontSize: 'clamp(1.75rem, 5vw, 2.75rem)', lineHeight: 1.1 }}
                  >
                    {Number.isFinite(recommendedBidPrice)
                      ? `$${formatCurrency(recommendedBidPrice)}`
                      : '—'}
                  </p>
                  <p className="mt-2 text-xs text-slate-500">
                    Breakeven ÷ (1 − {targetNetMarginPct.toFixed(1)}% target margin)
                  </p>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
