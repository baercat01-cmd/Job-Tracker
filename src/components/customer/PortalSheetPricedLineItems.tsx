import type { ReactNode } from 'react';
import { PortalMultilineText } from '@/components/customer/PortalMultilineText';
import { formatPortalMaterialQty } from '@/components/customer/PortalMaterialItemsTable';

/** Selling line amount per material_items row — matches loadProposalDataForQuote itemEffectivePrice / JobFinancials portal totals */
function itemSellingLineAmount(i: any): number {
  if (i.extended_price != null && i.extended_price !== '') return Number(i.extended_price);
  return (Number(i.quantity) || 0) * (Number(i.price_per_unit) || 0);
}

function isItemOptionalFlag(i: any): boolean {
  return i.is_optional === true || i.is_optional === 'true' || i.is_optional === 1;
}

export function laborRowAmount(lr: any): number {
  if (lr.total_labor_cost != null && lr.total_labor_cost !== '') return Number(lr.total_labor_cost);
  return (Number(lr.estimated_hours) || 0) * (Number(lr.hourly_rate) || 0);
}

/**
 * Selling amount for sheet-linked custom_financial_row_items (portal).
 * When total_cost is empty but the line is labor, use material_sheet_labor row(s) so the portal
 * matches _computedLabor (office often stores labor on the sheet, not on the linked row).
 */
export function portalSheetLinkedItemSellingAmount(item: any, sheet: any): number {
  const base = (Number(item.total_cost) || 0) * (1 + (Number(item.markup_percent) || 0) / 100);
  if (base > 0) return base;
  if ((item.item_type || 'material') !== 'labor') return 0;
  const rows = [...(sheet.laborRows || [])].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
  if (rows.length === 1) return laborRowAmount(rows[0]);
  const want = String(item.description || '').trim().toLowerCase();
  if (want) {
    const exact = rows.find((r: any) => String(r.description || '').trim().toLowerCase() === want);
    if (exact) return laborRowAmount(exact);
    const partial = rows.find((r: any) => {
      const d = String(r.description || '').trim().toLowerCase();
      return d && (d.includes(want) || want.includes(d));
    });
    if (partial) return laborRowAmount(partial);
  }
  return 0;
}

/**
 * Priced material + labor lines for one sheet (customer portal). Shown when "Section prices"
 * / line-item pricing is enabled and material list-without-prices mode is off.
 */
export function PortalSheetPricedLineItems({
  sheet,
  variant = 'default',
}: {
  sheet: any;
  /** Orange styling on change-order cards */
  variant?: 'default' | 'changeOrder';
}): ReactNode {
  const items = [...(sheet.items || [])].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
  const laborRows = [...(sheet.laborRows || [])].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
  const catOptional: Record<string, boolean> = sheet._portalCategoryOptional || {};
  const categoryOrder: string[] = Array.isArray(sheet.category_order) ? sheet.category_order : [];

  const byCat = new Map<string, any[]>();
  items.forEach((item) => {
    const cat = item.category || 'Uncategorized';
    if (!byCat.has(cat)) byCat.set(cat, []);
    byCat.get(cat)!.push(item);
  });

  const catNames = [...byCat.keys()].sort((a, b) => {
    const ia = categoryOrder.indexOf(a);
    const ib = categoryOrder.indexOf(b);
    if (ia >= 0 && ib >= 0) return ia - ib;
    if (ia >= 0) return -1;
    if (ib >= 0) return 1;
    return a.localeCompare(b, undefined, { sensitivity: 'base' });
  });

  const isCo = variant === 'changeOrder';
  const catHead = isCo ? 'bg-orange-50/90 text-orange-950 border-b border-orange-100' : 'bg-muted/40 text-muted-foreground border-b border-border/60';
  const tableBorder = isCo ? 'border-orange-100' : 'border-border/70';

  if (catNames.length === 0 && laborRows.length === 0) return null;

  return (
    <div className="mt-3 space-y-3 text-sm">
      {catNames.map((catName) => {
        const catItems = byCat.get(catName)!;
        const catOpt = catOptional[catName] === true;
        return (
          <div key={catName} className={`rounded-md border ${tableBorder} bg-muted/10 overflow-hidden`}>
            <div className={`px-3 py-1.5 text-xs font-semibold uppercase tracking-wide ${catHead}`}>
              {catName}
              {catOpt && (
                <span className={`ml-2 font-normal normal-case ${isCo ? 'text-orange-800' : 'text-amber-800'}`}>
                  (optional add-on)
                </span>
              )}
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className={`text-left text-xs text-muted-foreground ${isCo ? 'bg-orange-50/50' : ''}`}>
                  <th className="py-1.5 px-3 font-medium">Item</th>
                  <th className="py-1.5 px-3 font-medium whitespace-nowrap">Qty</th>
                  <th className="py-1.5 px-3 font-medium text-right whitespace-nowrap">Amount</th>
                </tr>
              </thead>
              <tbody>
                {catItems.map((item) => {
                  const opt = isItemOptionalFlag(item);
                  const line = itemSellingLineAmount(item);
                  return (
                    <tr key={item.id} className={`border-t ${isCo ? 'border-orange-100/80' : 'border-border/50'}`}>
                      <td className="py-2 px-3 align-top">
                        <span className={opt ? 'text-muted-foreground' : ''}>
                          {item.material_name?.trim() ? <PortalMultilineText text={item.material_name} /> : '—'}
                        </span>
                        {opt && <span className={`ml-1 text-xs ${isCo ? 'text-orange-800' : 'text-amber-700'}`}>(optional)</span>}
                      </td>
                      <td className="py-2 px-3 align-top tabular-nums whitespace-nowrap text-muted-foreground">
                        {formatPortalMaterialQty(item)}
                      </td>
                      <td
                        className={`py-2 px-3 align-top text-right tabular-nums font-medium ${
                          isCo ? 'text-orange-900' : 'text-emerald-800'
                        }`}
                      >
                        $
                        {line.toLocaleString('en-US', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}

      {laborRows.length > 0 && (
        <div className={`rounded-md border ${tableBorder} bg-muted/10 overflow-hidden`}>
          <div className={`px-3 py-1.5 text-xs font-semibold uppercase tracking-wide ${catHead}`}>
            {isCo ? 'Details' : 'Labor'}
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className={`text-left text-xs text-muted-foreground ${isCo ? 'bg-orange-50/50' : ''}`}>
                <th className="py-1.5 px-3 font-medium">Description</th>
                <th className="py-1.5 px-3 font-medium text-right whitespace-nowrap">Amount</th>
              </tr>
            </thead>
            <tbody>
              {laborRows.map((lr: any) => {
                const line = laborRowAmount(lr);
                const desc =
                  [lr.description?.trim(), lr.notes?.trim()].filter(Boolean).join(' — ') || (isCo ? 'Line item' : 'Labor');
                return (
                  <tr key={lr.id} className={`border-t ${isCo ? 'border-orange-100/80' : 'border-border/50'}`}>
                    <td className="py-2 px-3 align-top">
                      <PortalMultilineText text={desc} />
                    </td>
                    <td
                      className={`py-2 px-3 align-top text-right tabular-nums font-medium ${
                        isCo ? 'text-orange-900' : 'text-amber-800'
                      }`}
                    >
                      $
                      {line.toLocaleString('en-US', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
