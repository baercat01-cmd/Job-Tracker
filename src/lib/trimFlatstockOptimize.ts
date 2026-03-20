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
  /** Cut length for the resulting trim piece (used for shop instructions). */
  pieceLengthInches: number;
  qty: number;
};

export type TrimSlittingStrip = {
  /** Unique id for this specific strip instance within this plan. */
  stripInstanceId: string;
  materialItemId: string;
  materialName: string;
  sku?: string | null;
  stretchOutInches: number;
  /** 1-based; cut order for this sheet (widest groups first). */
  cutOrder: number;
  /** Width leftover before this strip is cut (used for cutoff→next-trim mapping). */
  cutoffBeforeWidthInches: number;
  /** For strips that consume a remainder produced by earlier cuts on the same sheet. */
  usesCutoffFromStripInstanceId?: string | null;
  /** Primary strips vs remainder-derived strips. */
  role?: 'primary' | 'from_cutoff';
  /** Cut length for the resulting trim piece (used for shop instructions). */
  pieceLengthInches: number;
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
  /** Number of full 10' slit strips planned for this trim item (each strip maps to one strip instance on some sheet). */
  stripsPlanned: number;
  qtyDemand: number;
};

export type TrimSlittingPlanV1 = {
  version: 1;
  flatstockWidthInches: number;
  /**
   * Width-only slitting layout model.
   * - `stickLengthInches` is informational (used to label strip length for shop instructions).
   * - The optimizer is 1D in width: sheet math is driven by width packing only.
   */
  stickLengthInches: number;
  generatedAt: string;
  sheets: TrimSlittingSheet[];
  totalSheets: number;
  perItem: TrimSlittingPerItem[];
  /** Sum of per-line independent sheet counts (ceil(q / floor(W/s))), for comparison. */
  legacyIndependentSheetsSum: number;
};

type RowDemand = TrimSlittingDemand & { qtyLeft: number };

function makeStripInstance(params: {
  stripInstanceId: string;
  demand: TrimSlittingDemand;
  cutOrder: number;
  cutoffBeforeWidthInches: number;
  usesCutoffFromStripInstanceId?: string | null;
  role?: 'primary' | 'from_cutoff';
  stretchWiderThanCoil?: boolean;
}): TrimSlittingStrip {
  const { stripInstanceId, demand, cutOrder, cutoffBeforeWidthInches, usesCutoffFromStripInstanceId, role, stretchWiderThanCoil } =
    params;
  return {
    stripInstanceId,
    materialItemId: demand.materialItemId,
    materialName: demand.materialName,
    sku: demand.sku,
    stretchOutInches: demand.stretchOutInches,
    cutOrder,
    cutoffBeforeWidthInches,
    usesCutoffFromStripInstanceId,
    role,
    pieceLengthInches: demand.pieceLengthInches,
    stretchWiderThanCoil,
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

function buildOneNormalSheet(
  W: number,
  rows: RowDemand[],
  byId: Map<string, RowDemand>,
  nextStripInstanceId: () => string
): TrimSlittingSheet | null {
  const eligible = rows.filter((d) => d.qtyLeft > 0 && d.stretchOutInches <= W);
  if (eligible.length === 0) return null;

  let usedWidthInches = 0;
  const strips: TrimSlittingStrip[] = [];
  let lastStripInstanceId: string | null = null;
  let cutOrder = 1;

  // Primary stage: place the widest feasible strip as many times as possible.
  const first = [...eligible].sort((a, b) => {
    if (b.stretchOutInches !== a.stretchOutInches) return b.stretchOutInches - a.stretchOutInches;
    return a.materialName.localeCompare(b.materialName);
  })[0];

  const k0 = Math.min(Math.floor(W / first.stretchOutInches), first.qtyLeft);
  if (k0 <= 0) return null;

  for (let i = 0; i < k0; i++) {
    const cutoffBefore = Math.round((W - usedWidthInches) * 10000) / 10000;
    const stripInstanceId = nextStripInstanceId();
    strips.push(
      makeStripInstance({
        stripInstanceId,
        demand: first,
        cutOrder,
        cutoffBeforeWidthInches: cutoffBefore,
        usesCutoffFromStripInstanceId: lastStripInstanceId,
        role: 'primary',
      })
    );
    lastStripInstanceId = stripInstanceId;
    cutOrder += 1;
    usedWidthInches += first.stretchOutInches;
    first.qtyLeft -= 1;
  }

  let R = Math.max(0, W - usedWidthInches);
  // Remainder stage: prefer multi (same trim), then pair (two different trims), then single.
  while (R > 1e-9) {
    const step = fillRemainderStep(rows, R);
    if (!step) break;

    if (step.kind === 'multi') {
      const d = byId.get(step.id)!;
      for (let i = 0; i < step.count; i++) {
        const cutoffBefore = Math.round((W - usedWidthInches) * 10000) / 10000;
        const stripInstanceId = nextStripInstanceId();
        strips.push(
          makeStripInstance({
            stripInstanceId,
            demand: d,
            cutOrder,
            cutoffBeforeWidthInches: cutoffBefore,
            usesCutoffFromStripInstanceId: lastStripInstanceId,
            role: 'from_cutoff',
          })
        );
        lastStripInstanceId = stripInstanceId;
        cutOrder += 1;
        usedWidthInches += d.stretchOutInches;
        d.qtyLeft -= 1;
      }
    } else if (step.kind === 'pair') {
      const da = byId.get(step.a)!;
      const db = byId.get(step.b)!;
      // Place the wider one first.
      const firstPair = da.stretchOutInches >= db.stretchOutInches ? da : db;
      const secondPair = firstPair === da ? db : da;

      for (const d of [firstPair, secondPair]) {
        if (d.qtyLeft <= 0) continue;
        if (d.stretchOutInches > Math.max(0, W - usedWidthInches)) break;
        const cutoffBefore = Math.round((W - usedWidthInches) * 10000) / 10000;
        const stripInstanceId = nextStripInstanceId();
        strips.push(
          makeStripInstance({
            stripInstanceId,
            demand: d,
            cutOrder,
            cutoffBeforeWidthInches: cutoffBefore,
            usesCutoffFromStripInstanceId: lastStripInstanceId,
            role: 'from_cutoff',
          })
        );
        lastStripInstanceId = stripInstanceId;
        cutOrder += 1;
        usedWidthInches += d.stretchOutInches;
        d.qtyLeft -= 1;
      }
    } else {
      const d = byId.get(step.id)!;
      if (d.qtyLeft > 0 && d.stretchOutInches <= Math.max(0, W - usedWidthInches)) {
        const cutoffBefore = Math.round((W - usedWidthInches) * 10000) / 10000;
        const stripInstanceId = nextStripInstanceId();
        strips.push(
          makeStripInstance({
            stripInstanceId,
            demand: d,
            cutOrder,
            cutoffBeforeWidthInches: cutoffBefore,
            usesCutoffFromStripInstanceId: lastStripInstanceId,
            role: 'from_cutoff',
          })
        );
        lastStripInstanceId = stripInstanceId;
        cutOrder += 1;
        usedWidthInches += d.stretchOutInches;
        d.qtyLeft -= 1;
      }
    }

    R = Math.max(0, W - usedWidthInches);
  }

  const totalUsed = Math.round(usedWidthInches * 10000) / 10000;
  return {
    sheetIndex: 0,
    strips,
    usedWidthInches: totalUsed,
    scrapWidthInches: Math.round((W - totalUsed) * 10000) / 10000,
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
      pieceLengthInches: Number(d.pieceLengthInches) || 0,
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
  let stripInstanceSeq = 0;
  const nextStripInstanceId = () => `strip-${sheets.length}-${++stripInstanceSeq}`;

  // Strips wider than coil: one strip per sheet until qty satisfied
  const wideRows = rows.filter((r) => r.stretchOutInches > W);
  for (const wr of wideRows) {
    while (wr.qtyLeft > 0) {
      const cutoffBeforeWidthInches = Math.round(W * 10000) / 10000;
      sheets.push({
        sheetIndex: sheets.length + 1,
        strips: [
          makeStripInstance({
            stripInstanceId: nextStripInstanceId(),
            demand: wr,
            cutOrder: 1,
            cutoffBeforeWidthInches,
            usesCutoffFromStripInstanceId: null,
            role: 'primary',
            stretchWiderThanCoil: true,
          }),
        ],
        usedWidthInches: Math.round(Math.min(wr.stretchOutInches, W) * 10000) / 10000,
        scrapWidthInches: Math.max(0, Math.round((W - wr.stretchOutInches) * 10000) / 10000),
      });
      wr.qtyLeft -= 1;
    }
  }

  let guard = 0;
  while (rows.some((r) => r.qtyLeft > 0 && r.stretchOutInches <= W)) {
    if (++guard > 10000) break;
    const sheet = buildOneNormalSheet(W, rows, byId, nextStripInstanceId);
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
