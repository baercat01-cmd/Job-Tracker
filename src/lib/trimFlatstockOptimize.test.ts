import { describe, expect, it } from 'vitest';
import {
  buildTrimSlittingPlan,
  legacyIndependentSheetsSum,
  type TrimSlittingDemand,
} from './trimFlatstockOptimize';

function sumStrips(plan: ReturnType<typeof buildTrimSlittingPlan>, id: string): number {
  return plan.sheets.reduce(
    (n, sh) => n + sh.strips.filter((s) => s.materialItemId === id).length,
    0
  );
}

describe('buildTrimSlittingPlan', () => {
  it('packs 14" qty 5 on 42" in two sheets (3+2)', () => {
    const demands: TrimSlittingDemand[] = [
      { materialItemId: 'a', materialName: 'A', stretchOutInches: 14, qty: 5 },
    ];
    const plan = buildTrimSlittingPlan(demands, 42);
    expect(plan.totalSheets).toBe(2);
    expect(sumStrips(plan, 'a')).toBe(5);
    expect(plan.legacyIndependentSheetsSum).toBe(2);
  });

  it('never uses more sheets than independent sum for sample job mix', () => {
    const demands: TrimSlittingDemand[] = [
      { materialItemId: '1', materialName: 'T1', stretchOutInches: 13.75, qty: 11 },
      { materialItemId: '2', materialName: 'T2', stretchOutInches: 6.62, qty: 22 },
      { materialItemId: '3', materialName: 'T3', stretchOutInches: 14.12, qty: 11 },
      { materialItemId: '4', materialName: 'T4', stretchOutInches: 5.51, qty: 21 },
    ];
    const plan = buildTrimSlittingPlan(demands, 42);
    const legacy = legacyIndependentSheetsSum(demands, 42);
    expect(legacy).toBe(17);
    expect(plan.totalSheets).toBeLessThanOrEqual(legacy);
    for (const d of demands) {
      expect(sumStrips(plan, d.materialItemId)).toBe(d.qty);
    }
  });

  it('uses one sheet per qty when strip is wider than coil', () => {
    const demands: TrimSlittingDemand[] = [
      { materialItemId: 'w', materialName: 'Wide', stretchOutInches: 50, qty: 3 },
    ];
    const plan = buildTrimSlittingPlan(demands, 42);
    expect(plan.totalSheets).toBe(3);
    expect(plan.sheets.every((s) => s.strips.length === 1)).toBe(true);
    expect(plan.sheets[0].strips[0].stretchWiderThanCoil).toBe(true);
  });

  it('prefers two of same trim in remainder when possible', () => {
    const demands: TrimSlittingDemand[] = [
      { materialItemId: 'a', materialName: 'A', stretchOutInches: 20, qty: 1 },
      { materialItemId: 'b', materialName: 'B', stretchOutInches: 6, qty: 4 },
    ];
    const plan = buildTrimSlittingPlan(demands, 42);
    const sheetWithA = plan.sheets.find((s) => s.strips.some((x) => x.materialItemId === 'a'));
    expect(sheetWithA).toBeDefined();
    const bs = sheetWithA!.strips.filter((x) => x.materialItemId === 'b');
    expect(bs.length).toBeGreaterThanOrEqual(2);
  });
});
