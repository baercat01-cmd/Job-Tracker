/**
 * Width-only slitting on 41/42" coil: each strip is full stick length (default 10').
 * Per-sheet layouts; remainder width prefers max strips of one trim, then two different trims, then one.
 */

/** Keep in sync with TrimDrawingPreview FLATSTOCK_STICK_LENGTH_INCHES. */
const DEFAULT_STICK_LENGTH_INCHES = 120;

export type TrimSlittingDemand = {
  materialItemId: string;
  materialName: string;
  sku?: string | null;
  stretchOutInches: number;
  qty: number;
};

export type TrimSlittingStrip = {
  materialItemId: string;
  materialName: string;
  sku?: string | null;
  stretchOutInches: number;
  /** 1-based; cut widest first (descending stretch-out). */
  cutOrder: number;
  stretchWiderThanCoil?: boolean;
};

export type TrimSlittingSheet = {
  sheetIndex: number;
  strips: TrimSlittingStrip[];
  usedWidthInches: number;
  scrapWidthInches: number;
};

export type TrimSlittingPerItem = {
  materialItemId: string;
  stripsPlanned: number;
  qtyDemand: number;
};

export type TrimSlittingPlanV1 = {
  version: 1;
  flatstockWidthInches: number;
  stickLengthInches: number;
  generatedAt: string;
  sheets: TrimSlittingSheet[];
  totalSheets: number;
  perItem: TrimSlittingPerItem[];
  /** Sum of per-line independent sheet counts (ceil(q / floor(W/s))), for comparison. */
  legacyIndependentSheetsSum: number;
};

type RowDemand = TrimSlittingDemand & { qtyLeft: number };

function sortStripsForCutOrder(
  raw: Omit<TrimSlittingStrip, 'cutOrder'>[]
): TrimSlittingStrip[] {
  const sorted = [...raw].sort((a, b) => {
    if (b.stretchOutInches !== a.stretchOutInches) {
      return b.stretchOutInches - a.stretchOutInches;
    }
    return a.materialName.localeCompare(b.materialName);
  });
  return sorted.map((s, i) => ({ ...s, cutOrder: i + 1 }));
}

function stripFrom(
  d: TrimSlittingDemand,
  wider?: boolean
): Omit<TrimSlittingStrip, 'cutOrder'> {
  return {
    materialItemId: d.materialItemId,
    materialName: d.materialName,
    sku: d.sku,
    stretchOutInches: d.stretchOutInches,
    stretchWiderThanCoil: wider,
  };
}

type FillStep =
  | { kind: 'multi'; id: string; count: number }
  | { kind: 'pair'; a: string; b: string }
  | { kind: 'single'; id: string };

function fillRemainderStep(rows: RowDemand[], R: number): FillStep | null {
  const eligible = rows.filter((d) => d.qtyLeft > 0 && d.stretchOutInches <= R);
  if (eligible.length === 0) return null;

  let bestMulti: { id: string; k: number; s: number } | null = null;
  for (const d of eligible) {
    const k = Math.min(Math.floor(R / d.stretchOutInches), d.qtyLeft);
    if (k < 2) continue;
    const s = d.stretchOutInches;
    if (
      !bestMulti ||
      k > bestMulti.k ||
      (k === bestMulti.k && s > bestMulti.s)
    ) {
      bestMulti = { id: d.materialItemId, k, s };
    }
  }
  if (bestMulti) {
    return { kind: 'multi', id: bestMulti.id, count: bestMulti.k };
  }

  let bestPair: { a: string; b: string; sum: number; maxS: number } | null = null;
  for (let i = 0; i < eligible.length; i++) {
    for (let j = i + 1; j < eligible.length; j++) {
      const a = eligible[i];
      const b = eligible[j];
      if (a.materialItemId === b.materialItemId) continue;
      const sum = a.stretchOutInches + b.stretchOutInches;
      if (sum > R) continue;
      const maxS = Math.max(a.stretchOutInches, b.stretchOutInches);
      if (
        !bestPair ||
        sum > bestPair.sum ||
        (sum === bestPair.sum && maxS > bestPair.maxS)
      ) {
        bestPair = { a: a.materialItemId, b: b.materialItemId, sum, maxS };
      }
    }
  }
  if (bestPair) {
    return { kind: 'pair', a: bestPair.a, b: bestPair.b };
  }

  let widest: RowDemand | null = null;
  for (const d of eligible) {
    if (!widest || d.stretchOutInches > widest.stretchOutInches) {
      widest = d;
    }
  }
  if (widest) {
    return { kind: 'single', id: widest.materialItemId };
  }
  return null;
}

function applyStep(
  step: FillStep,
  raw: Omit<TrimSlittingStrip, 'cutOrder'>[],
  byId: Map<string, RowDemand>
): number {
  let deltaW = 0;
  if (step.kind === 'multi') {
    const d = byId.get(step.id)!;
    for (let i = 0; i < step.count; i++) {
      raw.push(stripFrom(d));
    }
    d.qtyLeft -= step.count;
    deltaW = step.count * d.stretchOutInches;
  } else if (step.kind === 'pair') {
    const da = byId.get(step.a)!;
    const db = byId.get(step.b)!;
    raw.push(stripFrom(da));
    raw.push(stripFrom(db));
    da.qtyLeft -= 1;
    db.qtyLeft -= 1;
    deltaW = da.stretchOutInches + db.stretchOutInches;
  } else {
    const d = byId.get(step.id)!;
    raw.push(stripFrom(d));
    d.qtyLeft -= 1;
    deltaW = d.stretchOutInches;
  }
  return deltaW;
}

function buildOneNormalSheet(W: number, rows: RowDemand[], byId: Map<string, RowDemand>): TrimSlittingSheet | null {
  const eligible = rows.filter((d) => d.qtyLeft > 0 && d.stretchOutInches <= W);
  if (eligible.length === 0) return null;

  const raw: Omit<TrimSlittingStrip, 'cutOrder'>[] = [];

  const sorted = [...eligible].sort((a, b) => {
    if (b.stretchOutInches !== a.stretchOutInches) {
      return b.stretchOutInches - a.stretchOutInches;
    }
    return a.materialName.localeCompare(b.materialName);
  });
  const first = sorted[0];
  const k0 = Math.min(Math.floor(W / first.stretchOutInches), first.qtyLeft);
  if (k0 <= 0) return null;

  for (let i = 0; i < k0; i++) {
    raw.push(stripFrom(first));
  }
  first.qtyLeft -= k0;
  let R = W - k0 * first.stretchOutInches;

  while (R > 0) {
    const step = fillRemainderStep(rows, R);
    if (!step) break;
    const dw = applyStep(step, raw, byId);
    R -= dw;
  }

  const strips = sortStripsForCutOrder(raw);
  const used = strips.reduce((s, x) => s + x.stretchOutInches, 0);
  return {
    sheetIndex: 0,
    strips,
    usedWidthInches: Math.round(used * 10000) / 10000,
    scrapWidthInches: Math.round((W - used) * 10000) / 10000,
  };
}

/** Sum of independent per-line sheet counts (ignores cross-line nesting). */
export function legacyIndependentSheetsSum(
  demands: TrimSlittingDemand[],
  flatstockWidthInches: number
): number {
  const W = flatstockWidthInches;
  let sum = 0;
  for (const d of demands) {
    const q = Math.max(0, Math.floor(Number(d.qty) || 0));
    if (q <= 0) continue;
    const s = d.stretchOutInches;
    if (!Number.isFinite(s) || s <= 0) continue;
    if (s > W) {
      sum += q;
      continue;
    }
    const across = Math.max(1, Math.floor(W / s));
    const cap = across;
    sum += Math.ceil(q / cap);
  }
  return sum;
}

export function buildTrimSlittingPlan(
  demands: TrimSlittingDemand[],
  flatstockWidthInches: number,
  stickLengthInches: number = DEFAULT_STICK_LENGTH_INCHES
): TrimSlittingPlanV1 {
  const W = flatstockWidthInches;
  const L = stickLengthInches;
  const generatedAt = new Date().toISOString();

  const cleaned = demands
    .map((d) => ({
      ...d,
      qty: Math.max(0, Math.floor(Number(d.qty) || 0)),
      stretchOutInches: Number(d.stretchOutInches) || 0,
    }))
    .filter((d) => d.qty > 0 && d.stretchOutInches > 0);

  const legacySum = legacyIndependentSheetsSum(cleaned, W);

  if (!Number.isFinite(W) || W <= 0 || cleaned.length === 0) {
    return {
      version: 1,
      flatstockWidthInches: W,
      stickLengthInches: L,
      generatedAt,
      sheets: [],
      totalSheets: 0,
      perItem: cleaned.map((d) => ({
        materialItemId: d.materialItemId,
        stripsPlanned: 0,
        qtyDemand: d.qty,
      })),
      legacyIndependentSheetsSum: legacySum,
    };
  }

  const rows: RowDemand[] = cleaned.map((d) => ({ ...d, qtyLeft: d.qty }));
  const byId = new Map(rows.map((r) => [r.materialItemId, r]));
  const sheets: TrimSlittingSheet[] = [];

  // Strips wider than coil: one strip per sheet until qty satisfied
  const wideRows = rows.filter((r) => r.stretchOutInches > W);
  for (const wr of wideRows) {
    while (wr.qtyLeft > 0) {
      sheets.push({
        sheetIndex: sheets.length + 1,
        strips: sortStripsForCutOrder([stripFrom(wr, true)]),
        usedWidthInches: Math.min(wr.stretchOutInches, W),
        scrapWidthInches: Math.max(0, Math.round((W - wr.stretchOutInches) * 10000) / 10000),
      });
      wr.qtyLeft -= 1;
    }
  }

  let guard = 0;
  while (rows.some((r) => r.qtyLeft > 0 && r.stretchOutInches <= W)) {
    if (++guard > 10000) break;
    const sheet = buildOneNormalSheet(W, rows, byId);
    if (!sheet || sheet.strips.length === 0) break;
    sheet.sheetIndex = sheets.length + 1;
    sheets.push(sheet);
  }

  const perItemMap = new Map<string, { demand: number; strips: number }>();
  for (const d of cleaned) {
    perItemMap.set(d.materialItemId, { demand: d.qty, strips: 0 });
  }
  for (const sh of sheets) {
    for (const st of sh.strips) {
      const rec = perItemMap.get(st.materialItemId);
      if (rec) rec.strips += 1;
    }
  }

  return {
    version: 1,
    flatstockWidthInches: W,
    stickLengthInches: L,
    generatedAt,
    sheets,
    totalSheets: sheets.length,
    perItem: cleaned.map((d) => {
      const rec = perItemMap.get(d.materialItemId)!;
      return {
        materialItemId: d.materialItemId,
        stripsPlanned: rec.strips,
        qtyDemand: rec.demand,
      };
    }),
    legacyIndependentSheetsSum: legacySum,
  };
}

export function isTrimSlittingPlanV1(x: unknown): x is TrimSlittingPlanV1 {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  return o.version === 1 && Array.isArray(o.sheets) && typeof o.totalSheets === 'number';
}
