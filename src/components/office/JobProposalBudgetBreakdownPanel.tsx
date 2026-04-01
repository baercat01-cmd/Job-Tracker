import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { loadProposalFinancialData } from '@/lib/loadProposalFinancialData';
import { computeProposalCostBudget, type ProposalCostBudget } from '@/lib/proposalCostBudget';
import { computeProposalTotals } from '@/lib/proposalTotals';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';

const TAX_RATE = 0.07;

export function fmtProposalMoney(n: number) {
  return (Number.isFinite(n) ? n : 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

type JobProposalBudgetBreakdownPanelProps = {
  jobId: string;
  quoteId: string | null;
  /** Extra class on outer wrapper */
  className?: string;
};

/**
 * Full cost vs sell breakdown for one job + quote. Used from office Cost budget page and job detail “Budget” tab.
 */
export function JobProposalBudgetBreakdownPanel({ jobId, quoteId, className }: JobProposalBudgetBreakdownPanelProps) {
  const [payloadLoading, setPayloadLoading] = useState(false);
  const [costBudget, setCostBudget] = useState<ProposalCostBudget | null>(null);
  const [sellSubtotal, setSellSubtotal] = useState<number | null>(null);
  const [sellTax, setSellTax] = useState<number | null>(null);
  const [sellGrand, setSellGrand] = useState<number | null>(null);
  const [storedGrand, setStoredGrand] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshBudget = useCallback(async () => {
    if (!jobId || !quoteId) {
      setCostBudget(null);
      setSellSubtotal(null);
      setSellTax(null);
      setSellGrand(null);
      setStoredGrand(null);
      setError(null);
      return;
    }
    setPayloadLoading(true);
    setError(null);
    try {
      const payload = await loadProposalFinancialData(jobId, quoteId);
      if (!payload) {
        setError('Could not load workbook or proposal data for this job.');
        setCostBudget(null);
        setSellSubtotal(null);
        setSellTax(null);
        setSellGrand(null);
        setStoredGrand(null);
        return;
      }

      const costs = computeProposalCostBudget({
        materialSheets: payload.materialSheets,
        customRows: payload.customRows,
        subcontractorEstimates: payload.subcontractorEstimates,
        customRowLineItems: payload.customRowLineItems,
        subcontractorLineItems: payload.subcontractorLineItems,
      });
      setCostBudget(costs);

      const sell = computeProposalTotals({
        materialSheets: payload.materialSheets,
        customRows: payload.customRows,
        subcontractorEstimates: payload.subcontractorEstimates,
        customRowLineItems: payload.customRowLineItems,
        subcontractorLineItems: payload.subcontractorLineItems,
        categoryMarkups: payload.categoryMarkups,
        taxRate: TAX_RATE,
        taxExempt: payload.taxExempt,
      });
      setSellSubtotal(sell.subtotal);
      setSellTax(sell.tax);
      setSellGrand(sell.grandTotal);

      const { data: qMeta } = await supabase
        .from('quotes')
        .select('proposal_grand_total')
        .eq('id', quoteId)
        .maybeSingle();
      const pg =
        qMeta && (qMeta as { proposal_grand_total?: number | null }).proposal_grand_total != null
          ? Number((qMeta as { proposal_grand_total: number }).proposal_grand_total)
          : NaN;
      setStoredGrand(Number.isFinite(pg) ? pg : null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to compute budget';
      setError(msg);
      setCostBudget(null);
    } finally {
      setPayloadLoading(false);
    }
  }, [jobId, quoteId]);

  useEffect(() => {
    refreshBudget();
  }, [refreshBudget]);

  const marginVsSell =
    sellGrand != null && costBudget ? sellGrand - costBudget.totalCost : null;
  const marginPct =
    sellGrand != null && sellGrand > 0 && marginVsSell != null ? (marginVsSell / sellGrand) * 100 : null;

  const fmt = fmtProposalMoney;

  return (
    <div className={className ?? 'space-y-6'}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Totals from workbook line costs and financial rows; sell side uses the same rules as the customer proposal.
        </p>
        <Button type="button" variant="outline" size="sm" onClick={() => refreshBudget()} disabled={payloadLoading || !quoteId}>
          <RefreshCw className={`w-4 h-4 mr-2 ${payloadLoading ? 'animate-spin' : ''}`} />
          Recalculate
        </Button>
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      {!quoteId && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground text-sm">
            No proposal is selected for this job.
          </CardContent>
        </Card>
      )}

      {quoteId && payloadLoading && (
        <Card>
          <CardContent className="py-10 flex items-center justify-center gap-2 text-muted-foreground">
            <RefreshCw className="w-5 h-5 animate-spin" />
            Loading proposal and computing budget…
          </CardContent>
        </Card>
      )}

      {quoteId && !payloadLoading && costBudget && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card className="border-blue-200 bg-blue-50/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-base text-blue-900">Price (sell)</CardTitle>
                <CardDescription>Computed grand total (customer price, incl. tax)</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold tabular-nums text-blue-950">{fmt(sellGrand ?? 0)}</p>
                {storedGrand != null && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Saved on quote: <span className="tabular-nums font-medium text-foreground">{fmt(storedGrand)}</span>
                  </p>
                )}
              </CardContent>
            </Card>
            <Card className="border-emerald-200 bg-emerald-50/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-base text-emerald-900">Cost (internal)</CardTitle>
                <CardDescription>Sum of line-item costs (no sell markup)</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold tabular-nums text-emerald-900">{fmt(costBudget.totalCost)}</p>
              </CardContent>
            </Card>
            <Card
              className={`border-2 ${
                marginVsSell != null && marginVsSell >= 0 ? 'border-emerald-300 bg-emerald-50/80' : 'border-red-200 bg-red-50/50'
              }`}
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-base text-foreground">Profit</CardTitle>
                <CardDescription>Price − cost (using computed sell above)</CardDescription>
              </CardHeader>
              <CardContent>
                {marginVsSell != null ? (
                  <>
                    <p
                      className={`text-3xl font-bold tabular-nums ${
                        marginVsSell >= 0 ? 'text-emerald-800' : 'text-destructive'
                      }`}
                    >
                      {fmt(marginVsSell)}
                    </p>
                    {marginPct != null && Number.isFinite(marginPct) && (
                      <p className="text-sm text-muted-foreground mt-2">
                        <span className="font-medium text-foreground">{marginPct.toFixed(1)}%</span> of price
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">—</p>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle className="text-base">How the price is built</CardTitle>
              <CardDescription>Subtotal and tax that roll up to the price (same rules as the customer proposal)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-medium tabular-nums">{fmt(sellSubtotal ?? 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tax</span>
                <span className="font-medium tabular-nums">{fmt(sellTax ?? 0)}</span>
              </div>
              <div className="flex justify-between border-t pt-2 font-semibold">
                <span>Price (grand total)</span>
                <span className="tabular-nums">{fmt(sellGrand ?? 0)}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Cost breakdown</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {[
                ['Workbook materials (cost)', costBudget.catalogMaterialsCost],
                ['Sheet labor (internal)', costBudget.sheetLaborCost],
                ['Sheet-linked materials (cost)', costBudget.sheetLinkedMaterialsCost],
                ['Sheet-linked labor (cost)', costBudget.sheetLinkedLaborCost],
                ['Custom rows on sheets — materials', costBudget.customLinkedMaterialsCost],
                ['Custom rows on sheets — labor', costBudget.customLinkedLaborCost],
                ['Standalone custom — materials', costBudget.customStandaloneMaterialsCost],
                ['Standalone custom — labor', costBudget.customStandaloneLaborCost],
                ['Subcontractor line bids (total)', costBudget.subcontractorCost],
              ].map(([label, v]) => (
                <div key={String(label)} className="flex justify-between gap-4">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-medium tabular-nums shrink-0">{fmt(Number(v))}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          {costBudget.bySheet.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">By workbook sheet</CardTitle>
                <CardDescription>Optional / change-order sheets are excluded</CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="py-2 pr-4 font-medium">Sheet</th>
                      <th className="py-2 pr-4 font-medium text-right">Materials</th>
                      <th className="py-2 pr-4 font-medium text-right">Labor</th>
                      <th className="py-2 pr-4 font-medium text-right">Subs</th>
                      <th className="py-2 font-medium text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {costBudget.bySheet.map((row) => {
                      const t = row.materialsCost + row.laborCost + row.subcontractorCost;
                      return (
                        <tr key={row.sheetId} className="border-b border-border/60">
                          <td className="py-2 pr-4">{row.sheetName}</td>
                          <td className="py-2 pr-4 text-right tabular-nums">{fmt(row.materialsCost)}</td>
                          <td className="py-2 pr-4 text-right tabular-nums">{fmt(row.laborCost)}</td>
                          <td className="py-2 pr-4 text-right tabular-nums">{fmt(row.subcontractorCost)}</td>
                          <td className="py-2 text-right font-medium tabular-nums">{fmt(t)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
