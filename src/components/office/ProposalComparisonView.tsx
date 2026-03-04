import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { X, FileText, Package, List, DollarSign, ArrowRight, Minus, Plus } from 'lucide-react';
import { toast } from 'sonner';

const TAX_RATE = 0.07;

interface QuoteOption {
  id: string;
  proposal_number?: string;
  quote_number?: string;
  created_at?: string;
}

interface SheetSnapshot {
  id: string;
  sheet_name: string;
  description?: string | null;
  order_index: number;
  items: Array<{
    id: string;
    material_name: string;
    category: string;
    quantity: number;
    cost_per_unit: number | null;
    price_per_unit: number | null;
    extended_cost: number | null;
    extended_price: number | null;
  }>;
  labor?: { total_labor_cost: number; description?: string } | null;
  categoryMarkups: Record<string, number>;
}

interface CustomRowSnapshot {
  id: string;
  description: string;
  category: string;
  order_index: number;
  markup_percent: number;
  lineItems: Array<{
    id: string;
    description: string;
    quantity: number;
    total_cost: number;
    item_type?: string;
    taxable?: boolean;
    markup_percent?: number;
  }>;
}

interface SubcontractorSnapshot {
  id: string;
  company_name: string;
  sheet_id?: string | null;
  row_id?: string | null;
  markup_percent: number;
  lineItems: Array<{
    description: string;
    total_price: number;
    excluded?: boolean;
    item_type?: string;
    taxable?: boolean;
  }>;
}

export interface ProposalSnapshot {
  quote: { id: string; description?: string | null; tax_exempt?: boolean; proposal_number?: string; quote_number?: string };
  sheets: SheetSnapshot[];
  customRows: CustomRowSnapshot[];
  subcontractors: SubcontractorSnapshot[];
  totals: {
    materialsTotal: number;
    laborTotal: number;
    subtotal: number;
    tax: number;
    grandTotal: number;
  };
}

async function fetchProposalSnapshot(jobId: string, quoteId: string): Promise<ProposalSnapshot | null> {
  // Fetch quote: try full columns first, then minimal so comparison works even when schema is missing columns
  let quote: any = null;
  let quoteRes = await supabase.from('quotes').select('id, description, tax_exempt, proposal_number, quote_number').eq('id', quoteId).single();
  if (quoteRes.error || !quoteRes.data) {
    const firstError = quoteRes.error?.message;
    console.warn('ProposalComparison: quote fetch failed, retrying with minimal columns', quoteId, firstError);
    quoteRes = await supabase.from('quotes').select('id, proposal_number, quote_number').eq('id', quoteId).single();
  }
  if (quoteRes.error || !quoteRes.data) {
    console.warn('ProposalComparison: failed to load quote', quoteId, quoteRes.error?.message);
    return null;
  }
  quote = quoteRes.data;
  if (quote && typeof quote.description === 'undefined') quote.description = null;
  if (quote && typeof quote.tax_exempt === 'undefined') {
    quote.tax_exempt = false;
    try {
      const { data: taxRows } = await supabase.rpc('get_job_quotes_tax_exempt', { p_job_id: jobId });
      const row = (taxRows as { quote_id: string; tax_exempt: boolean }[] | null)?.find((r) => r.quote_id === quoteId);
      if (row) quote.tax_exempt = row.tax_exempt;
    } catch (_) { /* keep false */ }
  }

  const [wbRes, rowsRes, subsRes] = await Promise.all([
    supabase
      .from('material_workbooks')
      .select(`
        id,
        material_sheets (
          id, sheet_name, description, order_index,
          material_items (*),
          material_sheet_labor (*),
          material_category_markups (*)
        )
      `)
      .eq('quote_id', quoteId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('custom_financial_rows')
      .select('*, custom_financial_row_items(*)')
      .eq('quote_id', quoteId)
      .order('order_index'),
    supabase
      .from('subcontractor_estimates')
      .select('*, subcontractor_estimate_line_items(*)')
      .eq('quote_id', quoteId)
      .order('order_index'),
  ]);

  const sheets: SheetSnapshot[] = [];
  let materialsTotal = 0;
  const categoryMarkupsGlobal: Record<string, number> = {};

  if (wbRes.data?.material_sheets) {
    const sortedSheets = (wbRes.data.material_sheets as any[])
      .slice()
      .sort((a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0));
    for (const sheet of sortedSheets) {
      const items = (sheet.material_items || []).map((i: any) => ({
        id: i.id,
        material_name: i.material_name || '',
        category: i.category || 'Uncategorized',
        quantity: Number(i.quantity) || 0,
        cost_per_unit: i.cost_per_unit != null ? Number(i.cost_per_unit) : null,
        price_per_unit: i.price_per_unit != null ? Number(i.price_per_unit) : null,
        extended_cost: i.extended_cost != null ? Number(i.extended_cost) : (Number(i.quantity) || 0) * (Number(i.cost_per_unit) || 0),
        extended_price: i.extended_price != null ? Number(i.extended_price) : (Number(i.quantity) || 0) * (Number(i.price_per_unit) || 0),
      }));
      const categoryMarkups: Record<string, number> = {};
      (sheet.material_category_markups || []).forEach((cm: any) => {
        categoryMarkups[cm.category_name] = cm.markup_percent ?? 10;
        categoryMarkupsGlobal[`${sheet.id}_${cm.category_name}`] = cm.markup_percent ?? 10;
      });
      const laborRow = (sheet.material_sheet_labor || [])[0];
      const labor = laborRow
        ? { total_labor_cost: laborRow.total_labor_cost ?? (Number(laborRow.estimated_hours || 0) * Number(laborRow.hourly_rate || 0)), description: laborRow.description }
        : null;

      const byCategory = new Map<string, typeof items>();
      items.forEach((item) => {
        const cat = item.category;
        if (!byCategory.has(cat)) byCategory.set(cat, []);
        byCategory.get(cat)!.push(item);
      });
      let sheetPrice = 0;
      byCategory.forEach((catItems, catName) => {
        const cost = catItems.reduce((s, i) => s + (i.extended_cost ?? 0), 0);
        const markup = categoryMarkups[catName] ?? 10;
        sheetPrice += cost * (1 + markup / 100);
      });
      materialsTotal += sheetPrice;

      sheets.push({
        id: sheet.id,
        sheet_name: sheet.sheet_name || 'Sheet',
        description: sheet.description,
        order_index: sheet.order_index ?? 0,
        items,
        labor,
        categoryMarkups,
      });
    }
  }

  const customRows: CustomRowSnapshot[] = [];
  const rawRows = (rowsRes.data || []) as any[];
  const customRowLineItemsMap: Record<string, any[]> = {};
  rawRows.forEach((r: any) => {
    customRowLineItemsMap[r.id] = r.custom_financial_row_items || [];
  });

  let customMaterialsTotal = 0;
  let customLaborTotal = 0;
  rawRows.forEach((row: any) => {
    const lineItems = (row.custom_financial_row_items || []).map((li: any) => ({
      id: li.id,
      description: li.description || '',
      quantity: Number(li.quantity) || 0,
      total_cost: Number(li.total_cost) || 0,
      item_type: li.item_type || 'material',
      taxable: li.taxable !== false,
      markup_percent: li.markup_percent ?? 0,
    }));
    const markup = 1 + (Number(row.markup_percent) || 0) / 100;
    const materialItems = lineItems.filter((li: any) => (li.item_type || 'material') === 'material');
    const laborItems = lineItems.filter((li: any) => (li.item_type || 'material') === 'labor');
    let rowMaterials = materialItems.reduce((s: number, i: any) => s + i.total_cost, 0);
    let rowLabor = laborItems.reduce((s: number, i: any) => s + i.total_cost * (1 + (i.markup_percent || 0) / 100), 0);
    if (lineItems.length === 0 && row.category !== 'labor') rowMaterials = Number(row.total_cost) || 0;
    if (lineItems.length === 0 && row.category === 'labor') rowLabor = Number(row.total_cost) || 0;
    customMaterialsTotal += rowMaterials * markup;
    customLaborTotal += rowLabor * markup;
    customRows.push({
      id: row.id,
      description: row.description || '',
      category: row.category || 'line_items',
      order_index: row.order_index ?? 0,
      markup_percent: Number(row.markup_percent) || 0,
      lineItems,
    });
  });

  const subcontractors: SubcontractorSnapshot[] = [];
  let subMaterialsTotal = 0;
  let subLaborTotal = 0;
  (subsRes.data || []).forEach((est: any) => {
    const lineItems = (est.subcontractor_estimate_line_items || []).map((li: any) => ({
      description: li.description || '',
      total_price: Number(li.total_price) || 0,
      excluded: li.excluded,
      item_type: li.item_type || 'material',
      taxable: li.taxable !== false,
    }));
    const markup = 1 + (Number(est.markup_percent) || 0) / 100;
    const materials = lineItems.filter((li: any) => !li.excluded && (li.item_type || 'material') === 'material');
    const labor = lineItems.filter((li: any) => !li.excluded && (li.item_type || 'material') === 'labor');
    subMaterialsTotal += materials.reduce((s: number, i: any) => s + i.total_price, 0) * markup;
    subLaborTotal += labor.reduce((s: number, i: any) => s + i.total_price, 0) * markup;
    subcontractors.push({
      id: est.id,
      company_name: est.company_name || '',
      sheet_id: est.sheet_id,
      row_id: est.row_id,
      markup_percent: Number(est.markup_percent) || 0,
      lineItems,
    });
  });

  const totalMaterials = materialsTotal + customMaterialsTotal + subMaterialsTotal;
  let totalLabor = customLaborTotal + subLaborTotal;
  sheets.forEach((sh) => {
    if (sh.labor) totalLabor += sh.labor.total_labor_cost;
  });
  const subtotal = totalMaterials + totalLabor;
  const taxableMaterials = totalMaterials;
  const tax = quote.tax_exempt ? 0 : taxableMaterials * TAX_RATE;
  const grandTotal = subtotal + tax;

  return {
    quote: {
      id: quote.id,
      description: quote.description,
      tax_exempt: quote.tax_exempt,
      proposal_number: quote.proposal_number,
      quote_number: quote.quote_number,
    },
    sheets,
    customRows,
    subcontractors,
    totals: {
      materialsTotal: totalMaterials,
      laborTotal: totalLabor,
      subtotal,
      tax,
      grandTotal,
    },
  };
}

function formatMoney(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface ProposalComparisonViewProps {
  job: { id: string; name?: string };
  quotes: QuoteOption[];
  onClose?: () => void;
}

export function ProposalComparisonView({ job, quotes, onClose }: ProposalComparisonViewProps) {
  const [quoteAId, setQuoteAId] = useState<string | null>(null);
  const [quoteBId, setQuoteBId] = useState<string | null>(null);
  const [snapshotA, setSnapshotA] = useState<ProposalSnapshot | null>(null);
  const [snapshotB, setSnapshotB] = useState<ProposalSnapshot | null>(null);
  const [loading, setLoading] = useState(false);

  const loadBoth = useCallback(async () => {
    if (!quoteAId || !quoteBId || quoteAId === quoteBId) {
      setSnapshotA(null);
      setSnapshotB(null);
      return;
    }
    setLoading(true);
    try {
      const [a, b] = await Promise.all([
        fetchProposalSnapshot(job.id, quoteAId),
        fetchProposalSnapshot(job.id, quoteBId),
      ]);
      setSnapshotA(a);
      setSnapshotB(b);
      if (!a || !b) {
        const msg = !a && !b ? 'Could not load either proposal.' : !a ? 'Could not load Proposal A.' : 'Could not load Proposal B.';
        toast.error(msg + ' Check console for details.');
      }
    } catch (e: any) {
      console.error('Proposal comparison load error:', e);
      toast.error(e?.message || 'Failed to load comparison');
      setSnapshotA(null);
      setSnapshotB(null);
    } finally {
      setLoading(false);
    }
  }, [job.id, quoteAId, quoteBId]);

  useEffect(() => {
    if (quoteAId && quoteBId && quoteAId !== quoteBId) loadBoth();
    else {
      setSnapshotA(null);
      setSnapshotB(null);
    }
  }, [quoteAId, quoteBId, loadBoth]);

  const label = (q: QuoteOption) => `Proposal #${q.proposal_number ?? q.quote_number ?? q.id.slice(0, 8)}`;
  const hasComparison = snapshotA && snapshotB;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h2 className="text-lg font-semibold text-slate-900">Compare two proposals</h2>
        {onClose && (
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-4 h-4 mr-1" /> Close
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <Label>Proposal A</Label>
              <Select value={quoteAId ?? ''} onValueChange={(v) => setQuoteAId(v || null)}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Select proposal" />
                </SelectTrigger>
                <SelectContent>
                  {quotes.map((q) => (
                    <SelectItem key={q.id} value={q.id}>
                      {label(q)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <ArrowRight className="w-5 h-5 text-slate-400 shrink-0" />
            <div className="space-y-1">
              <Label>Proposal B</Label>
              <Select value={quoteBId ?? ''} onValueChange={(v) => setQuoteBId(v || null)}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Select proposal" />
                </SelectTrigger>
                <SelectContent>
                  {quotes.map((q) => (
                    <SelectItem key={q.id} value={q.id}>
                      {label(q)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {!loading && hasComparison && (
        <Tabs defaultValue="pricing" className="space-y-4">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="pricing">Pricing</TabsTrigger>
            <TabsTrigger value="description">Description</TabsTrigger>
            <TabsTrigger value="materials">Materials</TabsTrigger>
            <TabsTrigger value="lineitems">Line items</TabsTrigger>
          </TabsList>

          <TabsContent value="pricing" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="w-5 h-5" /> Pricing comparison
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[200px]">Line</TableHead>
                        <TableHead className="text-right">Proposal A</TableHead>
                        <TableHead className="text-right">Proposal B</TableHead>
                        <TableHead className="text-right">Difference</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell className="font-medium">Materials</TableCell>
                        <TableCell className="text-right">${formatMoney(snapshotA.totals.materialsTotal)}</TableCell>
                        <TableCell className="text-right">${formatMoney(snapshotB.totals.materialsTotal)}</TableCell>
                        <DiffCell a={snapshotA.totals.materialsTotal} b={snapshotB.totals.materialsTotal} />
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Labor</TableCell>
                        <TableCell className="text-right">${formatMoney(snapshotA.totals.laborTotal)}</TableCell>
                        <TableCell className="text-right">${formatMoney(snapshotB.totals.laborTotal)}</TableCell>
                        <DiffCell a={snapshotA.totals.laborTotal} b={snapshotB.totals.laborTotal} />
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Subtotal</TableCell>
                        <TableCell className="text-right">${formatMoney(snapshotA.totals.subtotal)}</TableCell>
                        <TableCell className="text-right">${formatMoney(snapshotB.totals.subtotal)}</TableCell>
                        <DiffCell a={snapshotA.totals.subtotal} b={snapshotB.totals.subtotal} />
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Tax (7%)</TableCell>
                        <TableCell className="text-right">
                          {snapshotA.quote.tax_exempt ? 'Exempt' : `$${formatMoney(snapshotA.totals.tax)}`}
                        </TableCell>
                        <TableCell className="text-right">
                          {snapshotB.quote.tax_exempt ? 'Exempt' : `$${formatMoney(snapshotB.totals.tax)}`}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">—</TableCell>
                      </TableRow>
                      <TableRow className="bg-slate-50 font-semibold">
                        <TableCell className="font-semibold">Grand total</TableCell>
                        <TableCell className="text-right">${formatMoney(snapshotA.totals.grandTotal)}</TableCell>
                        <TableCell className="text-right">${formatMoney(snapshotB.totals.grandTotal)}</TableCell>
                        <DiffCell a={snapshotA.totals.grandTotal} b={snapshotB.totals.grandTotal} />
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="description" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5" /> Building / proposal description
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-medium text-slate-500 mb-1">Proposal A</p>
                    <div className="min-h-[120px] p-3 rounded border bg-slate-50 text-sm whitespace-pre-wrap">
                      {(snapshotA.quote.description || '').trim() || <span className="text-muted-foreground">No description</span>}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-500 mb-1">Proposal B</p>
                    <div className="min-h-[120px] p-3 rounded border bg-slate-50 text-sm whitespace-pre-wrap">
                      {(snapshotB.quote.description || '').trim() || <span className="text-muted-foreground">No description</span>}
                    </div>
                  </div>
                </div>
                {normalizeDesc(snapshotA.quote.description) !== normalizeDesc(snapshotB.quote.description) && (
                  <p className="text-xs text-amber-700 mt-2">Descriptions differ.</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="materials" className="space-y-4">
            <MaterialsDiffTab snapshotA={snapshotA} snapshotB={snapshotB} />
          </TabsContent>

          <TabsContent value="lineitems" className="space-y-4">
            <LineItemsDiffTab snapshotA={snapshotA} snapshotB={snapshotB} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="text-sm font-medium text-slate-700">{children}</label>;
}

function DiffCell({ a, b }: { a: number; b: number }) {
  const d = b - a;
  return (
    <TableCell className={`text-right font-medium ${d > 0 ? 'text-green-700' : d < 0 ? 'text-red-700' : 'text-muted-foreground'}`}>
      {d === 0 ? '—' : d > 0 ? `+$${formatMoney(d)}` : `-$${formatMoney(-d)}`}
    </TableCell>
  );
}

function normalizeDesc(s?: string | null) {
  return (s ?? '').trim().replace(/\s+/g, ' ');
}

interface MaterialRow {
  sheetName: string;
  name: string;
  category: string;
  qtyA: number;
  qtyB: number;
  costA: number;
  costB: number;
  priceA: number;
  priceB: number;
  status: 'only_a' | 'only_b' | 'both';
}

function MaterialsDiffTab({ snapshotA, snapshotB }: { snapshotA: ProposalSnapshot; snapshotB: ProposalSnapshot }) {
  const rows: MaterialRow[] = [];
  const key = (sheetName: string, name: string, category: string) => `${sheetName}|${name}|${category}`;
  const inA = new Map<string, { sheetName: string; item: any }>();
  const inB = new Map<string, { sheetName: string; item: any }>();

  snapshotA.sheets.forEach((sh) => {
    sh.items.forEach((item) => {
      const k = key(sh.sheet_name, item.material_name, item.category);
      inA.set(k, { sheetName: sh.sheet_name, item });
    });
  });
  snapshotB.sheets.forEach((sh) => {
    sh.items.forEach((item) => {
      const k = key(sh.sheet_name, item.material_name, item.category);
      inB.set(k, { sheetName: sh.sheet_name, item });
    });
  });

  const allKeys = new Set([...inA.keys(), ...inB.keys()]);
  allKeys.forEach((k) => {
    const a = inA.get(k);
    const b = inB.get(k);
    const [_, name, category] = k.split('|');
    const sheetName = a?.sheetName ?? b?.sheetName ?? '';
    if (a && !b) {
      rows.push({
        sheetName,
        name: a.item.material_name,
        category,
        qtyA: a.item.quantity,
        qtyB: 0,
        costA: a.item.extended_cost ?? 0,
        costB: 0,
        priceA: a.item.extended_price ?? 0,
        priceB: 0,
        status: 'only_a',
      });
    } else if (!a && b) {
      rows.push({
        sheetName,
        name: b.item.material_name,
        category,
        qtyA: 0,
        qtyB: b.item.quantity,
        costA: 0,
        costB: b.item.extended_cost ?? 0,
        priceA: 0,
        priceB: b.item.extended_price ?? 0,
        status: 'only_b',
      });
    } else if (a && b) {
      rows.push({
        sheetName,
        name: a.item.material_name,
        category,
        qtyA: a.item.quantity,
        qtyB: b.item.quantity,
        costA: a.item.extended_cost ?? 0,
        costB: b.item.extended_cost ?? 0,
        priceA: a.item.extended_price ?? 0,
        priceB: b.item.extended_price ?? 0,
        status: 'both',
      });
    }
  });

  rows.sort((x, y) => x.sheetName.localeCompare(y.sheetName) || x.name.localeCompare(y.name));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Package className="w-5 h-5" /> Material list differences
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sheet</TableHead>
                <TableHead>Material</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Qty A</TableHead>
                <TableHead className="text-right">Qty B</TableHead>
                <TableHead className="text-right">Cost A</TableHead>
                <TableHead className="text-right">Cost B</TableHead>
                <TableHead className="text-right">Price A</TableHead>
                <TableHead className="text-right">Price B</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow key={i}>
                  <TableCell className="text-sm">{r.sheetName}</TableCell>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.category}</TableCell>
                  <TableCell className="text-right">{r.qtyA}</TableCell>
                  <TableCell className="text-right">{r.qtyB}</TableCell>
                  <TableCell className="text-right">${formatMoney(r.costA)}</TableCell>
                  <TableCell className="text-right">${formatMoney(r.costB)}</TableCell>
                  <TableCell className="text-right">${formatMoney(r.priceA)}</TableCell>
                  <TableCell className="text-right">${formatMoney(r.priceB)}</TableCell>
                  <TableCell>
                    {r.status === 'only_a' && <Badge variant="secondary" className="bg-blue-100 text-blue-800">Only A</Badge>}
                    {r.status === 'only_b' && <Badge variant="secondary" className="bg-amber-100 text-amber-800">Only B</Badge>}
                    {r.status === 'both' && (r.qtyA !== r.qtyB || r.costA !== r.costB || r.priceA !== r.priceB)
                      ? <Badge variant="outline">Changed</Badge>
                      : r.status === 'both' && <span className="text-muted-foreground">Same</span>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

interface LineItemRow {
  rowDescription: string;
  category: string;
  lineDescription: string;
  qtyA: number;
  qtyB: number;
  costA: number;
  costB: number;
  status: 'only_a' | 'only_b' | 'both';
}

function LineItemsDiffTab({ snapshotA, snapshotB }: { snapshotA: ProposalSnapshot; snapshotB: ProposalSnapshot }) {
  const rows: LineItemRow[] = [];
  const key = (rowDesc: string, lineDesc: string) => `${rowDesc}|${lineDesc}`;
  const inA = new Map<string, { rowDescription: string; category: string; item: any }>();
  const inB = new Map<string, { rowDescription: string; category: string; item: any }>();

  snapshotA.customRows.forEach((row) => {
    row.lineItems.forEach((li) => {
      inA.set(key(row.description, li.description), { rowDescription: row.description, category: row.category, item: li });
    });
  });
  snapshotB.customRows.forEach((row) => {
    row.lineItems.forEach((li) => {
      inB.set(key(row.description, li.description), { rowDescription: row.description, category: row.category, item: li });
    });
  });

  const allKeys = new Set([...inA.keys(), ...inB.keys()]);
  allKeys.forEach((k) => {
    const a = inA.get(k);
    const b = inB.get(k);
    const [rowDesc, lineDesc] = k.split('|');
    const rowDescription = a?.rowDescription ?? b?.rowDescription ?? '';
    const category = a?.category ?? b?.category ?? '';
    if (a && !b) {
      rows.push({
        rowDescription,
        category,
        lineDescription: a.item.description,
        qtyA: a.item.quantity,
        qtyB: 0,
        costA: a.item.total_cost,
        costB: 0,
        status: 'only_a',
      });
    } else if (!a && b) {
      rows.push({
        rowDescription,
        category,
        lineDescription: b.item.description,
        qtyA: 0,
        qtyB: b.item.quantity,
        costA: 0,
        costB: b.item.total_cost,
        status: 'only_b',
      });
    } else if (a && b) {
      rows.push({
        rowDescription,
        category,
        lineDescription: a.item.description,
        qtyA: a.item.quantity,
        qtyB: b.item.quantity,
        costA: a.item.total_cost,
        costB: b.item.total_cost,
        status: 'both',
      });
    }
  });

  rows.sort((x, y) => x.rowDescription.localeCompare(y.rowDescription) || x.lineDescription.localeCompare(y.lineDescription));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <List className="w-5 h-5" /> Line item differences
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Row</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Line description</TableHead>
                <TableHead className="text-right">Qty A</TableHead>
                <TableHead className="text-right">Qty B</TableHead>
                <TableHead className="text-right">Cost A</TableHead>
                <TableHead className="text-right">Cost B</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow key={i}>
                  <TableCell className="font-medium">{r.rowDescription}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.category}</TableCell>
                  <TableCell>{r.lineDescription}</TableCell>
                  <TableCell className="text-right">{r.qtyA}</TableCell>
                  <TableCell className="text-right">{r.qtyB}</TableCell>
                  <TableCell className="text-right">${formatMoney(r.costA)}</TableCell>
                  <TableCell className="text-right">${formatMoney(r.costB)}</TableCell>
                  <TableCell>
                    {r.status === 'only_a' && <Badge variant="secondary" className="bg-blue-100 text-blue-800">Only A</Badge>}
                    {r.status === 'only_b' && <Badge variant="secondary" className="bg-amber-100 text-amber-800">Only B</Badge>}
                    {r.status === 'both' && (r.qtyA !== r.qtyB || r.costA !== r.costB)
                      ? <Badge variant="outline">Changed</Badge>
                      : r.status === 'both' && <span className="text-muted-foreground">Same</span>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
