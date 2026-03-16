/**
 * Single source of truth for proposal totals calculation
 * Used by both customer portal and JobFinancials to ensure consistent totals
 */

interface MaterialItem {
  id?: string;
  category?: string;
  material_name?: string;
  quantity?: number;
  cost_per_unit?: number;
  price_per_unit?: number;
  markup_percent?: number;
  taxable?: boolean;
  extended_cost?: number;
  extended_price?: number;
  totalPrice?: number;
  totalCost?: number;
}

interface MaterialSheet {
  id: string;
  is_option?: boolean;
  sheet_type?: string;
  items?: MaterialItem[];
  categories?: Array<{
    name: string;
    items: MaterialItem[];
  }>;
  laborTotal?: number;
  labor?: Array<{
    total_labor_cost?: number;
    estimated_hours?: number;
    hourly_rate?: number;
    markup_percent?: number;
  }>;
  [key: string]: any;
}

export function computeProposalTotals(input: {
  materialSheets: MaterialSheet[];
  customRows: Array<{ id: string; sheet_id?: string; [key: string]: any }>;
  subcontractorEstimates: Array<{ id: string; sheet_id?: string; row_id?: string; [key: string]: any }>;
  customRowLineItems: Record<string, any[]>;
  subcontractorLineItems: Record<string, any[]>;
  categoryMarkups?: Record<string, number>;
  taxRate?: number;
  taxExempt: boolean;
}): { subtotal: number; tax: number; grandTotal: number } {
  let sheetMaterialsTotal = 0;
  let sheetLaborTotal = 0;
  let sheetMaterialsTaxableOnly = 0;

  // Process material sheets (exclude optional and change_order)
  for (const sheet of input.materialSheets) {
    // Skip optional sheets and change order sheets
    if (sheet.is_option === true || sheet.sheet_type === 'change_order') {
      continue;
    }

    // Sum sheet materials from categories or items
    if (sheet.categories && Array.isArray(sheet.categories)) {
      for (const category of sheet.categories) {
        if (category.items && Array.isArray(category.items)) {
          for (const item of category.items) {
            const itemPrice = item.totalPrice ?? item.extended_price ?? 
              ((item.cost_per_unit ?? 0) * (item.quantity ?? 0) * (1 + (item.markup_percent ?? 0) / 100));
            sheetMaterialsTotal += itemPrice;
            
            // Track taxable materials for tax calculation
            if (item.taxable !== false) {
              sheetMaterialsTaxableOnly += itemPrice;
            }
          }
        }
      }
    } else if (sheet.items && Array.isArray(sheet.items)) {
      for (const item of sheet.items) {
        const itemPrice = item.totalPrice ?? item.extended_price ?? 
          ((item.cost_per_unit ?? 0) * (item.quantity ?? 0) * (1 + (item.markup_percent ?? 0) / 100));
        sheetMaterialsTotal += itemPrice;
        
        if (item.taxable !== false) {
          sheetMaterialsTaxableOnly += itemPrice;
        }
      }
    }

    // Sum sheet labor
    if (sheet.laborTotal) {
      sheetLaborTotal += sheet.laborTotal;
    } else if (sheet.labor && Array.isArray(sheet.labor)) {
      for (const laborEntry of sheet.labor) {
        const laborCost = laborEntry.total_labor_cost ?? 
          ((laborEntry.estimated_hours ?? 0) * (laborEntry.hourly_rate ?? 0));
        const laborMarkup = laborEntry.markup_percent ?? 0;
        const laborPrice = laborCost * (1 + laborMarkup / 100);
        sheetLaborTotal += laborPrice;
      }
    }

    // Sum linked custom rows (rows where row.sheet_id === sheet.id)
    const linkedRows = input.customRows.filter(row => row.sheet_id === sheet.id);
    for (const row of linkedRows) {
      const rowLineItems = input.customRowLineItems[row.id] || [];
      for (const item of rowLineItems) {
        const itemCost = (item.quantity ?? 0) * (item.unit_cost ?? 0);
        const itemMarkup = item.markup_percent ?? row.markup_percent ?? 0;
        const itemPrice = itemCost * (1 + itemMarkup / 100);
        
        if (item.item_type === 'labor') {
          sheetLaborTotal += itemPrice;
        } else {
          sheetMaterialsTotal += itemPrice;
          if (item.taxable !== false) {
            sheetMaterialsTaxableOnly += itemPrice;
          }
        }
      }
      
      // Add linked subcontractors for this row
      const rowSubs = input.subcontractorEstimates.filter(
        sub => sub.row_id === row.id && sub.sheet_id === sheet.id
      );
      for (const sub of rowSubs) {
        const subLineItems = input.subcontractorLineItems[sub.id] || [];
        for (const item of subLineItems) {
          if (item.excluded) continue;
          
          const itemPrice = item.total_price ?? 0;
          const itemMarkup = item.markup_percent ?? sub.markup_percent ?? 0;
          const markedUpPrice = itemPrice * (1 + itemMarkup / 100);
          
          if (item.item_type === 'labor') {
            sheetLaborTotal += markedUpPrice;
          } else {
            sheetMaterialsTotal += markedUpPrice;
            if (item.taxable !== false) {
              sheetMaterialsTaxableOnly += markedUpPrice;
            }
          }
        }
      }
    }

    // Sum sheet-level subcontractors (subs where est.sheet_id === sheet.id and no est.row_id)
    const sheetLevelSubs = input.subcontractorEstimates.filter(
      sub => sub.sheet_id === sheet.id && !sub.row_id
    );
    for (const sub of sheetLevelSubs) {
      const subLineItems = input.subcontractorLineItems[sub.id] || [];
      for (const item of subLineItems) {
        if (item.excluded) continue;
        
        const itemPrice = item.total_price ?? 0;
        const itemMarkup = item.markup_percent ?? sub.markup_percent ?? 0;
        const markedUpPrice = itemPrice * (1 + itemMarkup / 100);
        
        if (item.item_type === 'labor') {
          sheetLaborTotal += markedUpPrice;
        } else {
          sheetMaterialsTotal += markedUpPrice;
          if (item.taxable !== false) {
            sheetMaterialsTaxableOnly += markedUpPrice;
          }
        }
      }
    }
  }

  // Process standalone custom rows (rows with no sheet_id)
  let customMaterialsTotal = 0;
  let customLaborTotal = 0;
  let customMaterialsTaxableOnly = 0;

  const standaloneRows = input.customRows.filter(row => !row.sheet_id);
  for (const row of standaloneRows) {
    const rowLineItems = input.customRowLineItems[row.id] || [];
    for (const item of rowLineItems) {
      const itemCost = (item.quantity ?? 0) * (item.unit_cost ?? 0);
      const itemMarkup = item.markup_percent ?? row.markup_percent ?? 0;
      const itemPrice = itemCost * (1 + itemMarkup / 100);
      
      if (item.item_type === 'labor') {
        customLaborTotal += itemPrice;
      } else {
        customMaterialsTotal += itemPrice;
        if (item.taxable !== false) {
          customMaterialsTaxableOnly += itemPrice;
        }
      }
    }
    
    // Add linked subcontractors for this standalone row
    const rowSubs = input.subcontractorEstimates.filter(
      sub => sub.row_id === row.id && !sub.sheet_id
    );
    for (const sub of rowSubs) {
      const subLineItems = input.subcontractorLineItems[sub.id] || [];
      for (const item of subLineItems) {
        if (item.excluded) continue;
        
        const itemPrice = item.total_price ?? 0;
        const itemMarkup = item.markup_percent ?? sub.markup_percent ?? 0;
        const markedUpPrice = itemPrice * (1 + itemMarkup / 100);
        
        if (item.item_type === 'labor') {
          customLaborTotal += markedUpPrice;
        } else {
          customMaterialsTotal += markedUpPrice;
          if (item.taxable !== false) {
            customMaterialsTaxableOnly += markedUpPrice;
          }
        }
      }
    }
  }

  // Process standalone subcontractors (no sheet_id and no row_id)
  let subMaterialsTotal = 0;
  let subLaborTotal = 0;
  let subMaterialsTaxableOnly = 0;

  const standaloneSubs = input.subcontractorEstimates.filter(
    sub => !sub.sheet_id && !sub.row_id
  );
  for (const sub of standaloneSubs) {
    const subLineItems = input.subcontractorLineItems[sub.id] || [];
    for (const item of subLineItems) {
      if (item.excluded) continue;
      
      const itemPrice = item.total_price ?? 0;
      const itemMarkup = item.markup_percent ?? sub.markup_percent ?? 0;
      const markedUpPrice = itemPrice * (1 + itemMarkup / 100);
      
      if (item.item_type === 'labor') {
        subLaborTotal += markedUpPrice;
      } else {
        subMaterialsTotal += markedUpPrice;
        if (item.taxable !== false) {
          subMaterialsTaxableOnly += markedUpPrice;
        }
      }
    }
  }

  // Calculate final totals
  const totalMaterials = sheetMaterialsTotal + customMaterialsTotal + subMaterialsTotal;
  const totalLabor = sheetLaborTotal + customLaborTotal + subLaborTotal;
  const subtotal = totalMaterials + totalLabor;
  
  // Calculate tax on taxable materials only
  const totalTaxableMaterials = sheetMaterialsTaxableOnly + customMaterialsTaxableOnly + subMaterialsTaxableOnly;
  const tax = input.taxExempt ? 0 : totalTaxableMaterials * (input.taxRate ?? 0.07);
  
  const grandTotal = subtotal + tax;

  return { subtotal, tax, grandTotal };
}
