import { useState, useEffect, FC } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  FileText,
  DollarSign,
  TrendingUp,
  Package,
  Users,
  Wrench,
  ChevronDown,
  ChevronRight,
  Download,
  Eye,
  Percent,
} from 'lucide-react';
import { toast } from 'sonner';

interface JobFinancialsProps {
  job?: any;
}

interface MaterialSheet {
  id: string;
  sheet_name: string;
  description: string | null;
  is_option: boolean;
  order_index: number;
  items: MaterialItem[];
  labor: SheetLabor[];
}

interface MaterialItem {
  id: string;
  category: string;
  material_name: string;
  quantity: number;
  cost_per_unit: number | null;
  price_per_unit: number | null;
  extended_cost: number | null;
  extended_price: number | null;
  taxable: boolean;
  markup_percent: number | null;
}

interface SheetLabor {
  id: string;
  description: string;
  estimated_hours: number;
  hourly_rate: number;
  total_labor_cost: number;
  notes: string | null;
}

interface CustomRow {
  id: string;
  category: string;
  description: string;
  quantity: number;
  unit_cost: number;
  total_cost: number;
  markup_percent: number;
  selling_price: number;
  taxable: boolean;
  is_option: boolean;
  sheet_id: string | null;
  line_items: CustomRowItem[];
}

interface CustomRowItem {
  id: string;
  description: string;
  quantity: number;
  unit_cost: number;
  total_cost: number;
  taxable: boolean;
}

interface SubcontractorEstimate {
  id: string;
  company_name: string | null;
  total_amount: number | null;
  markup_percent: number;
  sheet_id: string | null;
  line_items: SubcontractorLineItem[];
}

interface SubcontractorLineItem {
  id: string;
  description: string;
  total_price: number;
  excluded: boolean;
  markup_percent: number;
  taxable: boolean;
  item_type: 'material' | 'labor';
}

export const JobFinancials: FC<JobFinancialsProps> = ({ job }) => {
  const [loading, setLoading] = useState(true);
  const [sheets, setSheets] = useState<MaterialSheet[]>([]);
  const [customRows, setCustomRows] = useState<CustomRow[]>([]);
  const [subcontractors, setSubcontractors] = useState<SubcontractorEstimate[]>([]);
  const [workbook, setWorkbook] = useState<any>(null);
  const [expandedSheets, setExpandedSheets] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'proposal' | 'summary'>('proposal');

  useEffect(() => {
    if (job?.id) {
      loadFinancialData();
    }
  }, [job?.id]);

  async function loadFinancialData() {
    try {
      setLoading(true);

      // Load working workbook
      const { data: workbookData } = await supabase
        .from('material_workbooks')
        .select('*')
        .eq('job_id', job.id)
        .eq('status', 'working')
        .single();

      if (!workbookData) {
        setLoading(false);
        return;
      }

      setWorkbook(workbookData);

      // Load sheets with items and labor
      const { data: sheetsData } = await supabase
        .from('material_sheets')
        .select(`
          *,
          items:material_items(*),
          labor:material_sheet_labor(*)
        `)
        .eq('workbook_id', workbookData.id)
        .order('order_index');

      setSheets(sheetsData || []);

      // Load custom financial rows with line items
      const { data: rowsData } = await supabase
        .from('custom_financial_rows')
        .select(`
          *,
          line_items:custom_financial_row_items(*)
        `)
        .eq('job_id', job.id)
        .order('order_index');

      setCustomRows(rowsData || []);

      // Load subcontractor estimates with line items
      const { data: subsData } = await supabase
        .from('subcontractor_estimates')
        .select(`
          *,
          line_items:subcontractor_estimate_line_items(*)
        `)
        .eq('job_id', job.id);

      setSubcontractors(subsData || []);
    } catch (error: any) {
      console.error('Error loading financial data:', error);
      toast.error('Failed to load financial data');
    } finally {
      setLoading(false);
    }
  }

  function toggleSheet(sheetId: string) {
    setExpandedSheets(prev => {
      const newSet = new Set(prev);
      if (newSet.has(sheetId)) {
        newSet.delete(sheetId);
      } else {
        newSet.add(sheetId);
      }
      return newSet;
    });
  }

  function calculateSheetTotals(sheet: MaterialSheet) {
    const materialCost = sheet.items.reduce((sum, item) => sum + (item.extended_cost || 0), 0);
    const materialPrice = sheet.items.reduce((sum, item) => sum + (item.extended_price || 0), 0);
    const laborCost = sheet.labor.reduce((sum, labor) => sum + labor.total_labor_cost, 0);

    return {
      materialCost,
      materialPrice,
      laborCost,
      totalCost: materialCost + laborCost,
      totalPrice: materialPrice + laborCost,
    };
  }

  function calculateCustomRowTotal(row: CustomRow) {
    const lineItemsTotal = row.line_items.reduce((sum, item) => sum + item.total_cost, 0);
    const baseTotal = row.total_cost + lineItemsTotal;
    const markedUpTotal = baseTotal * (1 + row.markup_percent / 100);
    return markedUpTotal;
  }

  function calculateSubcontractorTotal(sub: SubcontractorEstimate) {
    const includedItems = sub.line_items.filter(item => !item.excluded);
    return includedItems.reduce((sum, item) => {
      const markup = item.markup_percent || 0;
      return sum + (item.total_price * (1 + markup / 100));
    }, 0);
  }

  function calculateProjectTotals() {
    // Materials from sheets (taxable)
    const sheetMaterialsPrice = sheets
      .filter(s => !s.is_option)
      .reduce((sum, sheet) => {
        return sum + sheet.items.reduce((itemSum, item) => itemSum + (item.extended_price || 0), 0);
      }, 0);

    // Labor from sheets (non-taxable)
    const sheetLabor = sheets
      .filter(s => !s.is_option)
      .reduce((sum, sheet) => {
        return sum + sheet.labor.reduce((laborSum, labor) => laborSum + labor.total_labor_cost, 0);
      }, 0);

    // Custom rows - separate materials and labor
    const customRowMaterials = customRows
      .filter(r => !r.is_option)
      .reduce((sum, row) => {
        const rowMaterialItems = row.line_items.filter(item => item.taxable);
        const materialsTotal = rowMaterialItems.reduce((itemSum, item) => itemSum + item.total_cost, 0);
        const markedUp = materialsTotal * (1 + row.markup_percent / 100);
        return sum + markedUp;
      }, 0);

    const customRowLabor = customRows
      .filter(r => !r.is_option)
      .reduce((sum, row) => {
        const rowLaborItems = row.line_items.filter(item => !item.taxable);
        const laborTotal = rowLaborItems.reduce((itemSum, item) => itemSum + item.total_cost, 0);
        const markedUp = laborTotal * (1 + row.markup_percent / 100);
        return sum + markedUp;
      }, 0);

    // Subcontractors - separate materials and labor
    const subMaterials = subcontractors
      .filter(sub => !sub.sheet_id) // Standalone subs
      .reduce((sum, sub) => {
        const materialItems = sub.line_items.filter(
          item => !item.excluded && item.item_type === 'material' && item.taxable
        );
        return sum + materialItems.reduce((itemSum, item) => {
          const markup = item.markup_percent || 0;
          return itemSum + (item.total_price * (1 + markup / 100));
        }, 0);
      }, 0);

    const subLabor = subcontractors
      .filter(sub => !sub.sheet_id) // Standalone subs
      .reduce((sum, sub) => {
        const laborItems = sub.line_items.filter(
          item => !item.excluded && (item.item_type === 'labor' || !item.taxable)
        );
        return sum + laborItems.reduce((itemSum, item) => {
          const markup = item.markup_percent || 0;
          return itemSum + (item.total_price * (1 + markup / 100));
        }, 0);
      }, 0);

    const totalMaterials = sheetMaterialsPrice + customRowMaterials + subMaterials;
    const totalLabor = sheetLabor + customRowLabor + subLabor;
    const salesTaxRate = 0.0975; // 9.75%
    const salesTax = totalMaterials * salesTaxRate;
    const grandTotal = totalMaterials + totalLabor + salesTax;

    return {
      materials: totalMaterials,
      labor: totalLabor,
      salesTax,
      grandTotal,
    };
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading financial data...</p>
        </div>
      </div>
    );
  }

  if (!workbook) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <FileText className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
          <h3 className="text-lg font-semibold mb-2">No Financial Data</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Create a material workbook to start building your proposal
          </p>
        </CardContent>
      </Card>
    );
  }

  const totals = calculateProjectTotals();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Job Financials</h2>
          <p className="text-sm text-muted-foreground">
            {job?.name} - Version {workbook.version_number}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            <Download className="w-4 h-4 mr-2" />
            Export PDF
          </Button>
          <Button variant="outline" size="sm">
            <Eye className="w-4 h-4 mr-2" />
            Preview
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <TabsList>
          <TabsTrigger value="proposal">
            <FileText className="w-4 h-4 mr-2" />
            Proposal Details
          </TabsTrigger>
          <TabsTrigger value="summary">
            <DollarSign className="w-4 h-4 mr-2" />
            Financial Summary
          </TabsTrigger>
        </TabsList>

        {/* Proposal Details Tab */}
        <TabsContent value="proposal" className="space-y-4">
          {/* Material Sheets */}
          {sheets.filter(s => !s.is_option).map(sheet => {
            const isExpanded = expandedSheets.has(sheet.id);
            const totals = calculateSheetTotals(sheet);
            const linkedRows = customRows.filter(r => r.sheet_id === sheet.id);
            const linkedSubs = subcontractors.filter(s => s.sheet_id === sheet.id);

            return (
              <Card key={sheet.id}>
                <div
                  className="p-4 cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => toggleSheet(sheet.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {isExpanded ? (
                        <ChevronDown className="w-5 h-5 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="w-5 h-5 text-muted-foreground" />
                      )}
                      <Package className="w-5 h-5 text-blue-600" />
                      <div>
                        <h3 className="font-semibold text-lg">{sheet.sheet_name}</h3>
                        {sheet.description && (
                          <p className="text-sm text-muted-foreground">{sheet.description}</p>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-primary">
                        ${totals.totalPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {sheet.items.length} items • {sheet.labor.length} labor entries
                      </p>
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t px-4 pb-4 space-y-4">
                    {/* Materials */}
                    <div>
                      <h4 className="font-semibold mb-2 text-sm flex items-center gap-2">
                        <Package className="w-4 h-4" />
                        Materials
                      </h4>
                      <div className="space-y-1">
                        {sheet.items.map(item => (
                          <div
                            key={item.id}
                            className="flex items-center justify-between py-2 px-3 bg-blue-50/50 rounded text-sm"
                          >
                            <div className="flex-1">
                              <p className="font-medium">{item.material_name}</p>
                              <p className="text-xs text-muted-foreground">
                                Qty: {item.quantity} • Category: {item.category}
                              </p>
                            </div>
                            <p className="font-semibold">
                              ${(item.extended_price || 0).toFixed(2)}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Labor */}
                    {sheet.labor.length > 0 && (
                      <div>
                        <h4 className="font-semibold mb-2 text-sm flex items-center gap-2">
                          <Users className="w-4 h-4" />
                          Labor
                        </h4>
                        <div className="space-y-1">
                          {sheet.labor.map(labor => (
                            <div
                              key={labor.id}
                              className="flex items-center justify-between py-2 px-3 bg-amber-50/50 rounded text-sm"
                            >
                              <div className="flex-1">
                                <p className="font-medium">{labor.description}</p>
                                <p className="text-xs text-muted-foreground">
                                  {labor.estimated_hours} hrs × ${labor.hourly_rate}/hr
                                </p>
                              </div>
                              <p className="font-semibold">
                                ${labor.total_labor_cost.toFixed(2)}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Linked Custom Rows */}
                    {linkedRows.length > 0 && (
                      <div>
                        <h4 className="font-semibold mb-2 text-sm flex items-center gap-2">
                          <Wrench className="w-4 h-4" />
                          Additional Items
                        </h4>
                        <div className="space-y-1">
                          {linkedRows.map(row => (
                            <div
                              key={row.id}
                              className="flex items-center justify-between py-2 px-3 bg-green-50/50 rounded text-sm"
                            >
                              <div className="flex-1">
                                <p className="font-medium">{row.description}</p>
                                <p className="text-xs text-muted-foreground">
                                  {row.category} • {row.line_items.length} line items
                                </p>
                              </div>
                              <p className="font-semibold">
                                ${calculateCustomRowTotal(row).toFixed(2)}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Linked Subcontractors */}
                    {linkedSubs.length > 0 && (
                      <div>
                        <h4 className="font-semibold mb-2 text-sm flex items-center gap-2">
                          <Users className="w-4 h-4" />
                          Subcontractors
                        </h4>
                        <div className="space-y-1">
                          {linkedSubs.map(sub => (
                            <div
                              key={sub.id}
                              className="flex items-center justify-between py-2 px-3 bg-purple-50/50 rounded text-sm"
                            >
                              <div className="flex-1">
                                <p className="font-medium">{sub.company_name || 'Unnamed'}</p>
                                <p className="text-xs text-muted-foreground">
                                  {sub.line_items.filter(i => !i.excluded).length} items
                                </p>
                              </div>
                              <p className="font-semibold">
                                ${calculateSubcontractorTotal(sub).toFixed(2)}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Sheet Totals */}
                    <div className="pt-3 border-t">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Materials:</span>
                        <span className="font-semibold">${totals.materialPrice.toFixed(2)}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Labor:</span>
                        <span className="font-semibold">${totals.laborCost.toFixed(2)}</span>
                      </div>
                      <div className="flex items-center justify-between text-lg font-bold pt-2 border-t mt-2">
                        <span>Sheet Total:</span>
                        <span className="text-primary">${totals.totalPrice.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}

          {/* Standalone Custom Rows */}
          {customRows.filter(r => !r.sheet_id && !r.is_option).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Wrench className="w-5 h-5" />
                  Additional Items
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {customRows.filter(r => !r.sheet_id && !r.is_option).map(row => (
                  <div
                    key={row.id}
                    className="flex items-center justify-between py-2 px-3 bg-green-50/50 rounded"
                  >
                    <div className="flex-1">
                      <p className="font-medium">{row.description}</p>
                      <p className="text-sm text-muted-foreground">
                        {row.category} • {row.line_items.length} line items
                      </p>
                    </div>
                    <p className="text-lg font-semibold">
                      ${calculateCustomRowTotal(row).toFixed(2)}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Standalone Subcontractors */}
          {subcontractors.filter(s => !s.sheet_id).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  Subcontractors
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {subcontractors.filter(s => !s.sheet_id).map(sub => (
                  <div
                    key={sub.id}
                    className="flex items-center justify-between py-2 px-3 bg-purple-50/50 rounded"
                  >
                    <div className="flex-1">
                      <p className="font-medium">{sub.company_name || 'Unnamed'}</p>
                      <p className="text-sm text-muted-foreground">
                        {sub.line_items.filter(i => !i.excluded).length} included items
                      </p>
                    </div>
                    <p className="text-lg font-semibold">
                      ${calculateSubcontractorTotal(sub).toFixed(2)}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Options */}
          {(sheets.filter(s => s.is_option).length > 0 || customRows.filter(r => r.is_option).length > 0) && (
            <Card className="border-2 border-dashed border-slate-300">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-slate-600">
                  <TrendingUp className="w-5 h-5" />
                  Optional Add-ons
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {sheets.filter(s => s.is_option).map(sheet => {
                  const totals = calculateSheetTotals(sheet);
                  return (
                    <div
                      key={sheet.id}
                      className="flex items-center justify-between py-2 px-3 bg-slate-50 rounded"
                    >
                      <p className="font-medium">{sheet.sheet_name}</p>
                      <p className="font-semibold">${totals.totalPrice.toFixed(2)}</p>
                    </div>
                  );
                })}
                {customRows.filter(r => r.is_option).map(row => (
                  <div
                    key={row.id}
                    className="flex items-center justify-between py-2 px-3 bg-slate-50 rounded"
                  >
                    <p className="font-medium">{row.description}</p>
                    <p className="font-semibold">${calculateCustomRowTotal(row).toFixed(2)}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Financial Summary Tab */}
        <TabsContent value="summary">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="w-5 h-5" />
                Project Totals
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-blue-50 rounded-lg">
                  <p className="text-sm text-muted-foreground mb-1">Total Materials</p>
                  <p className="text-2xl font-bold text-blue-700">
                    ${totals.materials.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">(Taxable)</p>
                </div>
                <div className="p-4 bg-amber-50 rounded-lg">
                  <p className="text-sm text-muted-foreground mb-1">Total Labor</p>
                  <p className="text-2xl font-bold text-amber-700">
                    ${totals.labor.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">(Non-taxable)</p>
                </div>
              </div>

              <div className="pt-4 border-t space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Subtotal:</span>
                  <span className="font-semibold">
                    ${(totals.materials + totals.labor).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Sales Tax (9.75%):</span>
                  <span className="font-semibold">
                    ${totals.salesTax.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex items-center justify-between text-2xl font-bold pt-3 border-t">
                  <span>Grand Total:</span>
                  <span className="text-primary">
                    ${totals.grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
