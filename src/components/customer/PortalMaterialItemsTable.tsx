import type { ReactNode } from 'react';
import { PortalMultilineText } from '@/components/customer/PortalMultilineText';

/** Format quantity and optional length (e.g. unit / size) for customer-facing lists — never includes price. */
export function formatPortalMaterialQty(item: { quantity?: unknown; length?: string | null }): string {
  const q = item.quantity;
  const num = q != null && q !== '' ? Number(q) : NaN;
  const qtyStr = Number.isFinite(num) ? String(num) : q != null && String(q).trim() !== '' ? String(q) : '—';
  const len = typeof item.length === 'string' ? item.length.trim() : '';
  if (len) return `${qtyStr} × ${len}`;
  return qtyStr;
}

type PortalItem = {
  id: string;
  material_name?: string | null;
  quantity?: unknown;
  length?: string | null;
  usage?: string | null;
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

  return (
    <div className={`mt-3 overflow-x-auto rounded-md border border-border/80 bg-muted/20 ${className}`.trim()}>
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b bg-muted/40 text-left text-muted-foreground text-xs uppercase tracking-wide">
            <th className="py-2 px-3 font-semibold">Material</th>
            <th className="py-2 px-3 font-semibold whitespace-nowrap">Qty</th>
            <th className="py-2 px-3 font-semibold">Usage</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((item) => (
            <tr key={item.id} className="border-b border-border/60 last:border-0">
              <td className="py-2 px-3 align-top">
                {item.material_name?.trim() ? <PortalMultilineText text={item.material_name} /> : '—'}
              </td>
              <td className="py-2 px-3 align-top tabular-nums whitespace-nowrap">{formatPortalMaterialQty(item)}</td>
              <td className="py-2 px-3 align-top text-muted-foreground">
                {item.usage != null && String(item.usage).trim() !== '' ? (
                  <PortalMultilineText text={item.usage} />
                ) : (
                  '—'
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
