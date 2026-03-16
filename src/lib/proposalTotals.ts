/**
 * Single source of truth for proposal totals calculation
 * Used by both customer portal and JobFinancials to ensure consistent totals
 */

export function computeProposalTotals(input: {
  materialSheets: Array<{ id: string; is_option?: boolean; sheet_type?: string; [key: string]: any }>;
  customRows: Array<{ id: string; sheet_id?: string; [key: string]: any }>;
  subcontractorEstimates: Array<{ id: string; sheet_id?: string; row_id?: string; [key: string]: any }>;
  customRowLineItems: Record<string, any[]>;
  subcontractorLineItems: Record<string, any[]>;
  categoryMarkups?: Record<string, number>;
  taxRate?: number;
  taxExempt: boolean;
}): { subtotal: number; tax: number; grandTotal: number } {
  // TODO: implement in next step; for now return zeros
  return { subtotal: 0, tax: 0, grandTotal: 0 };
}
