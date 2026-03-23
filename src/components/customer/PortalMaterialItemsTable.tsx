import { Fragment, type ReactNode } from 'react';
import { PortalMultilineText } from '@/components/customer/PortalMultilineText';

/** Format quantity only for customer-facing lists — never includes price. */
export function formatPortalMaterialQty(item: { quantity?: unknown; length?: string | null }): string {
  const q = item.quantity;
  const num = q != null && q !== '' ? Number(q) : NaN;
  return Number.isFinite(num) ? String(num) : q != null && String(q).trim() !== '' ? String(q) : '—';
}

type PortalItem = {
  id: string;
  material_name?: string | null;
  quantity?: unknown;
  length?: string | null;
  usage?: string | null;
  category?: string | null;
  notes?: string | null;
  order_index?: number | null;
};

/**
 * Renders material line items for the customer portal: name, qty, usage only (no pricing).
 */
export function PortalMaterialItemsTable({
  items,
  className = '',
}: {
  items: PortalItem[] | null | undefined;
  className?: string;
}): ReactNode {
  const sorted = [...(items || [])].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
  if (sorted.length === 0) return null;

  const grouped: Array<{ category: string; rows: PortalItem[] }> = [];
  const groupMap = new Map<string, PortalItem[]>();
  sorted.forEach((item) => {
    const key = (item.category && item.category.trim()) || 'Uncategorized';
    if (!groupMap.has(key)) {
      const rows: PortalItem[] = [];
      groupMap.set(key, rows);
      grouped.push({ category: key, rows });
    }
    groupMap.get(key)!.push(item);
  });

  return (
    <div className={`mt-3 overflow-x-auto rounded-md border border-border/80 bg-muted/20 ${className}`.trim()}>
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b bg-muted/40 text-left text-muted-foreground text-xs uppercase tracking-wide">
            <th className="py-2 px-3 font-semibold">Material</th>
            <th className="py-2 px-3 font-semibold whitespace-nowrap">Qty</th>
            <th className="py-2 px-3 font-semibold whitespace-nowrap">Length</th>
            <th className="py-2 px-3 font-semibold">Usage / Notes</th>
          </tr>
        </thead>
        <tbody>
          {grouped.map((group) => (
            <Fragment key={group.category}>
              <tr className="border-b bg-muted/50">
                <td colSpan={4} className="py-2 px-3 text-xs font-semibold tracking-wide text-foreground/80 uppercase">
                  {group.category}
                </td>
              </tr>
              {group.rows.map((item) => (
                <tr key={item.id} className="border-b border-border/60 last:border-0">
                  <td className="py-2 px-3 align-top">
                    {item.material_name?.trim() ? <PortalMultilineText text={item.material_name} /> : '—'}
                  </td>
                  <td className="py-2 px-3 align-top tabular-nums whitespace-nowrap">{formatPortalMaterialQty(item)}</td>
                  <td className="py-2 px-3 align-top whitespace-nowrap">
                    {item.length != null && String(item.length).trim() !== '' ? String(item.length).trim() : '—'}
                  </td>
                  <td className="py-2 px-3 align-top text-muted-foreground">
                    {item.usage != null && String(item.usage).trim() !== '' ? (
                      <PortalMultilineText text={item.usage as string} />
                    ) : item.notes != null && String(item.notes).trim() !== '' ? (
                      <PortalMultilineText text={item.notes as string} />
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
