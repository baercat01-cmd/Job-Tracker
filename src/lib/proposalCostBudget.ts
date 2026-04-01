/**
 * Internal cost rollups from the same proposal structures as computeProposalTotals (no sell markup).
 * Materials: extended_cost or qty × cost_per_unit. Labor: sheet labor rows / line total_cost. Subs: line bid (total_price / total_cost).
 */

function toBoolOption(v: unknown): boolean {
  return v === true || v === 1 || v === 'true' || v === '1' || v === 't' || v === 'yes';
}

function itemOptional(item: { is_optional?: unknown }): boolean {
  return toBoolOption((item as any).is_optional);
}

function materialItemCost(item: {
  quantity?: number;
  cost_per_unit?: number;
  extended_cost?: number | string | null;
}): number {
  if (itemOptional(item as any)) return 0;
  const ext = item.extended_cost != null && item.extended_cost !== '' ? Number(item.extended_cost) : null;
  if (ext != null && ext > 0) return ext;
  const qty = Number(item.quantity) || 0;
  return qty * (Number(item.cost_per_unit) || 0);
}

function sheetLaborCostOnly(sheet: {
  laborTotal?: number | string | null;
  labor?: Array<{ total_labor_cost?: number; estimated_hours?: number; hourly_rate?: number }>;
}): number {
  if (sheet.labor && Array.isArray(sheet.labor) && sheet.labor.length > 0) {
    return sheet.labor.reduce((sum, l) => {
      const c = l.total_labor_cost ?? (l.estimated_hours ?? 0) * (l.hourly_rate ?? 0);
      return sum + (Number(c) || 0);
    }, 0);
  }
  const lt = sheet.laborTotal;
  if (lt != null && lt !== '') return Number(lt) || 0;
  return 0;
}

function customLineCost(item: any): number {
  return Number(item.total_cost) || (Number(item.quantity) || 0) * (Number(item.unit_cost) || 0);
}

function subLineCost(item: any): number {
  if (item.excluded) return 0;
  return (
    Number(item.total_price ?? item.total_cost) ||
    (Number(item.quantity) || 0) * (Number(item.unit_cost) || 0)
  );
}

export type ProposalCostSheetBreakdown = {
  sheetId: string;
  sheetName: string;
  materialsCost: number;
  laborCost: number;
  subcontractorCost: number;
};

export type ProposalCostBudget = {
  /** Catalog / workbook material_items only */
  catalogMaterialsCost: number;
  /** material_sheet_labor and sheet-level labor (internal cost) */
  sheetLaborCost: number;
  /** custom_financial_row_items linked to sheet (total_cost only) */
  sheetLinkedMaterialsCost: number;
  sheetLinkedLaborCost: number;
  /** Custom rows (standalone + linked) — line total_cost, no row markup */
  customStandaloneMaterialsCost: number;
  customStandaloneLaborCost: number;
  customLinkedMaterialsCost: number;
  customLinkedLaborCost: number;
  /** Subcontractor estimate line bids (no estimate markup) */
  subcontractorCost: number;
  totalCost: number;
  bySheet: ProposalCostSheetBreakdown[];
};

type CostInput = {
  materialSheets: any[];
  customRows: any[];
  subcontractorEstimates: any[];
  customRowLineItems: Record<string, any[]>;
  subcontractorLineItems: Record<string, any[]>;
};

export function computeProposalCostBudget(input: CostInput): ProposalCostBudget {
  let catalogMaterialsCost = 0;
  let sheetLaborCost = 0;
  let sheetLinkedMaterialsCost = 0;
  let sheetLinkedLaborCost = 0;
  let customLinkedMaterialsCost = 0;
  let customLinkedLaborCost = 0;
  let customStandaloneMaterialsCost = 0;
  let customStandaloneLaborCost = 0;
  let subcontractorCost = 0;

  const bySheetMap = new Map<string, ProposalCostSheetBreakdown>();

  function ensureSheet(sheet: any): ProposalCostSheetBreakdown {
    const id = sheet.id as string;
    let row = bySheetMap.get(id);
    if (!row) {
      row = {
        sheetId: id,
        sheetName: (sheet.name as string) || sheet.sheet_name || 'Sheet',
        materialsCost: 0,
        laborCost: 0,
        subcontractorCost: 0,
      };
      bySheetMap.set(id, row);
    }
    return row;
  }

  for (const sheet of input.materialSheets) {
    if (sheet.is_option === true || sheet.sheet_type === 'change_order') continue;

    const srow = ensureSheet(sheet);

    if (sheet.items && Array.isArray(sheet.items)) {
      for (const item of sheet.items) {
        const c = materialItemCost(item);
        catalogMaterialsCost += c;
        srow.materialsCost += c;
      }
    } else if (sheet.categories && Array.isArray(sheet.categories)) {
      for (const category of sheet.categories) {
        if (!category.items || !Array.isArray(category.items)) continue;
        for (const item of category.items) {
          const c = materialItemCost(item);
          catalogMaterialsCost += c;
          srow.materialsCost += c;
        }
      }
    }

    const lab = sheetLaborCostOnly(sheet);
    sheetLaborCost += lab;
    srow.laborCost += lab;

    const sheetLinkedItems = sheet.sheetLinkedItems || [];
    for (const item of sheetLinkedItems) {
      const c = customLineCost(item);
      if ((item.item_type || 'material') === 'labor') {
        sheetLinkedLaborCost += c;
        srow.laborCost += c;
      } else {
        sheetLinkedMaterialsCost += c;
        srow.materialsCost += c;
      }
    }

    const linkedRows = input.customRows.filter((row) => row.sheet_id === sheet.id);
    for (const row of linkedRows) {
      if (toBoolOption(row.is_option)) continue;
      const rowLineItems = input.customRowLineItems[row.id] || [];
      for (const item of rowLineItems) {
        const c = customLineCost(item);
        if (item.item_type === 'labor') {
          customLinkedLaborCost += c;
          srow.laborCost += c;
        } else {
          customLinkedMaterialsCost += c;
          srow.materialsCost += c;
        }
      }

      const rowSubs = input.subcontractorEstimates.filter((sub) => sub.row_id === row.id && sub.sheet_id === sheet.id);
      for (const sub of rowSubs) {
        const subLineItems = input.subcontractorLineItems[sub.id] || [];
        for (const item of subLineItems) {
          const c = subLineCost(item);
          subcontractorCost += c;
          srow.subcontractorCost += c;
        }
      }
    }

    const sheetLevelSubs = input.subcontractorEstimates.filter((sub) => sub.sheet_id === sheet.id && !sub.row_id);
    for (const sub of sheetLevelSubs) {
      const subLineItems = input.subcontractorLineItems[sub.id] || [];
      for (const item of subLineItems) {
        const c = subLineCost(item);
        subcontractorCost += c;
        srow.subcontractorCost += c;
      }
    }
  }

  const standaloneRows = input.customRows.filter((row) => !row.sheet_id);
  for (const row of standaloneRows) {
    if (toBoolOption(row.is_option)) continue;
    const rowLineItems = input.customRowLineItems[row.id] || [];
    for (const item of rowLineItems) {
      const c = customLineCost(item);
      if (item.item_type === 'labor') {
        customStandaloneLaborCost += c;
      } else {
        customStandaloneMaterialsCost += c;
      }
    }

    const rowSubs = input.subcontractorEstimates.filter((sub) => sub.row_id === row.id && !sub.sheet_id);
    for (const sub of rowSubs) {
      const subLineItems = input.subcontractorLineItems[sub.id] || [];
      for (const item of subLineItems) {
        subcontractorCost += subLineCost(item);
      }
    }
  }

  const standaloneSubs = input.subcontractorEstimates.filter(
    (sub) => !sub.sheet_id && !sub.row_id && !toBoolOption(sub.is_option)
  );
  for (const sub of standaloneSubs) {
    const subLineItems = input.subcontractorLineItems[sub.id] || [];
    for (const item of subLineItems) {
      subcontractorCost += subLineCost(item);
    }
  }

  const totalCost =
    catalogMaterialsCost +
    sheetLaborCost +
    sheetLinkedMaterialsCost +
    sheetLinkedLaborCost +
    customLinkedMaterialsCost +
    customLinkedLaborCost +
    customStandaloneMaterialsCost +
    customStandaloneLaborCost +
    subcontractorCost;

  return {
    catalogMaterialsCost,
    sheetLaborCost,
    sheetLinkedMaterialsCost,
    sheetLinkedLaborCost,
    customLinkedMaterialsCost,
    customLinkedLaborCost,
    customStandaloneMaterialsCost,
    customStandaloneLaborCost,
    subcontractorCost,
    totalCost,
    bySheet: Array.from(bySheetMap.values()).filter(
      (r) => r.materialsCost > 0 || r.laborCost > 0 || r.subcontractorCost > 0
    ),
  };
}
