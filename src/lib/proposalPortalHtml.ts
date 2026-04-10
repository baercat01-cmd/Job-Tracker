import { isFieldRequestSheetName } from '@/lib/materialWorkbook';
import { generateProposalHTML } from '@/components/office/ProposalPDFTemplate';
import type { ProposalDataBundle } from '@/lib/loadProposalDataForQuote';
import { displayNumberForQuoteRow } from '@/lib/quoteDisplay';
import { formatPortalMaterialQty } from '@/components/customer/PortalMaterialItemsTable';

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function materialItemsTableHtmlForPrint(items: any[] | undefined): string {
  const sorted = [...(items || [])].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
  if (!sorted.length) return '';
  const rows = sorted
    .map((item) => {
      const name = escapeHtml(item.material_name?.trim() || '—');
      const qty = escapeHtml(formatPortalMaterialQty(item));
      const usage = escapeHtml(item.usage?.trim() || '—');
      return `<tr><td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;">${name}</td><td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;white-space:nowrap;">${qty}</td><td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;color:#475569;">${usage}</td></tr>`;
    })
    .join('');
  return `<div style="margin-top:10px;"><p style="font-size:9pt;font-weight:600;color:#64748b;margin-bottom:6px;">MATERIAL LIST (quantities and usage — no pricing)</p><table style="width:100%;border-collapse:collapse;font-size:9pt;"><thead><tr style="background:#f1f5f9;"><th style="text-align:left;padding:6px 8px;">Material</th><th style="text-align:left;padding:6px 8px;">Qty</th><th style="text-align:left;padding:6px 8px;">Usage</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

export type ProposalPortalJob = {
  client_name: string;
  address: string;
  name: string;
  customer_phone?: string;
  description?: string | null;
};

/** Builds the same proposal HTML as the customer portal print / PDF flow. */
export function buildProposalHtmlForPortal(opts: {
  job: ProposalPortalJob;
  quote: any | null;
  proposalData: ProposalDataBundle;
  showFinancial: boolean;
  showLineItemPrices: boolean;
  showSectionPrices?: Record<string, boolean> | null;
  /** When true, material sheets list name/qty/usage and omit section $ totals for those sheets */
  showMaterialItemsNoPrices?: boolean;
  quoteStoredTotals?: { subtotal: number; tax: number; grandTotal: number } | null;
}): string {
  const {
    job,
    quote,
    proposalData,
    showFinancial,
    showLineItemPrices,
    showSectionPrices,
    showMaterialItemsNoPrices = false,
    quoteStoredTotals,
  } = opts;

  const showPriceForSection = (sectionId: string) =>
    showFinancial && showLineItemPrices && (showSectionPrices == null || showSectionPrices[sectionId] !== false);

  const isCustomerEstimate = quote?.is_customer_estimate === true;
  const proposalNumber = isCustomerEstimate
    ? displayNumberForQuoteRow(quote, true)
    : quote?.proposal_number || quote?.quote_number || 'N/A';
  const proposalSheets = (proposalData.materialSheets || []).filter(
    (s: any) => s.sheet_type !== 'change_order' && !isFieldRequestSheetName(s.sheet_name)
  );
  const customRows = proposalData.customRows || [];
  const standaloneCustomRows = customRows.filter((row: any) => !row.sheet_id);
  const sheetSections: Array<{ type: 'material' | 'custom' | 'subcontractor'; id: string; orderIndex: number; data: any }> = [];
  proposalSheets.forEach((sheet: any) => {
    const sheetOrder = sheet.order_index ?? 0;
    sheetSections.push({ type: 'material' as const, id: sheet.id, orderIndex: sheetOrder * 1000, data: sheet });
    customRows
      .filter((r: any) => r.sheet_id === sheet.id)
      .sort((a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0))
      .forEach((row: any, idx: number) => {
        sheetSections.push({
          type: 'custom' as const,
          id: row.id,
          orderIndex: sheetOrder * 1000 + 100 + (row.order_index ?? idx),
          data: row,
        });
      });
  });
  const allSections: Array<{ type: 'material' | 'custom' | 'subcontractor'; id: string; orderIndex: number; data: any }> = [
    ...sheetSections,
    ...standaloneCustomRows.map((row: any) => ({
      type: 'custom' as const,
      id: row.id,
      orderIndex: (row.order_index ?? 0) * 1000,
      data: row,
    })),
    ...(proposalData.subcontractorEstimates || [])
      .filter((est: any) => !est.sheet_id && !est.row_id)
      .map((est: any) => ({
        type: 'subcontractor' as const,
        id: est.id,
        orderIndex: (est.order_index ?? 0) * 1000,
        data: est,
      })),
  ].sort((a, b) => a.orderIndex - b.orderIndex);

  const sections = allSections.map((section) => {
    if (section.type === 'material') {
      const s = section.data;
      const linkedSubs = (proposalData.subcontractorEstimates || []).filter((e: any) => e.sheet_id === s.id);
      const parts: string[] = [];
      if (s.description) parts.push(s.description);
      linkedSubs.forEach((est: any) => {
        if (est.scope_of_work) parts.push(est.scope_of_work);
      });
      let description = parts.join('\n');
      if (showMaterialItemsNoPrices) {
        const tableHtml = materialItemsTableHtmlForPrint(s.items);
        const textHtml = description.trim()
          ? escapeHtml(description).replace(/\n/g, '<br/>')
          : '';
        description = textHtml && tableHtml ? `${textHtml}<br/>${tableHtml}` : tableHtml || textHtml;
      }
      const sheetPrice =
        showMaterialItemsNoPrices || !showPriceForSection(s.id) ? undefined : (s._computedTotal ?? 0);
      return {
        name: s.sheet_name,
        description,
        price: sheetPrice,
        optional: false,
      };
    }
    if (section.type === 'custom') {
      const r = section.data;
      return {
        name: r.description || r.category || 'Custom',
        description: r.notes || '',
        price: showPriceForSection(r.id) ? (r._computedTotal ?? 0) : undefined,
        optional: false,
      };
    }
    const e = section.data;
    return {
      name: e.company_name,
      description: e.scope_of_work || '',
      price: showFinancial && showLineItemPrices ? (e._computedTotal ?? 0) : undefined,
      optional: false,
    };
  });

  const displayTotalsForPrint =
    (proposalData?.totals != null ? proposalData.totals : null) ??
    quoteStoredTotals ??
    (quote &&
    Number.isFinite(Number(quote.proposal_grand_total)) &&
    Number.isFinite(Number(quote.proposal_subtotal))
      ? {
          subtotal: Number(quote.proposal_subtotal),
          tax: Number(quote.proposal_tax) || 0,
          grandTotal: Number(quote.proposal_grand_total),
        }
      : null);

  const totals = displayTotalsForPrint
    ? {
        materials: 0,
        labor: 0,
        subtotal: displayTotalsForPrint.subtotal,
        tax: displayTotalsForPrint.tax,
        grandTotal: displayTotalsForPrint.grandTotal,
      }
    : { materials: 0, labor: 0, subtotal: 0, tax: 0, grandTotal: 0 };

  return generateProposalHTML({
    proposalNumber,
    date: new Date().toLocaleDateString('en-US'),
    job: {
      client_name: job.client_name,
      address: job.address || '',
      name: job.name,
      customer_phone: job.customer_phone || undefined,
      description: job.description || undefined,
    },
    sections,
    totals,
    showLineItems: false,
    showSectionPrices: !!(showFinancial && showLineItemPrices),
    showInternalDetails: false,
    theme: 'default',
    taxExempt: !!quote?.tax_exempt,
    documentKind: isCustomerEstimate ? 'estimate' : 'proposal',
  });
}
