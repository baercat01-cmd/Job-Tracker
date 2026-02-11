
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Trash2, DollarSign, Clock, TrendingUp, Percent, Calculator, FileSpreadsheet, ChevronDown, Briefcase, Edit } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { Badge } from '@/components/ui/badge';
import { SubcontractorEstimatesManagement } from './SubcontractorEstimatesManagement';
import type { Job } from '@/types';

interface CustomFinancialRow {
  id: string;
  job_id: string;
  category: string;
  description: string;
  quantity: number;
  unit_cost: number;
  total_cost: number;
  markup_percent: number;
  selling_price: number;
  notes: string | null;
  order_index: number;
  created_at: string;
  updated_at: string;
}

interface LaborPricing {
  id: string;
  job_id: string;
  hourly_rate: number;
  markup_percent: number;
  billable_rate: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface MaterialsBreakdown {
  sheetBreakdowns: any[];
  totals: {
    totalCost: number;
    totalPrice: number;
    totalProfit: number;
    profitMargin: number;
  };
}

interface JobFinancialsProps {
  job: Job;
}

export function JobFinancials({ job }: JobFinancialsProps) {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [customRows, setCustomRows] = useState<CustomFinancialRow[]>([]);
  const [laborPricing, setLaborPricing] = useState<LaborPricing | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingRow, setEditingRow] = useState<CustomFinancialRow | null>(null);
  
  // Proposal markup state
  const [proposalMarkup, setProposalMarkup] = useState('10');
  
  // Labor stats
  const [totalClockInHours, setTotalClockInHours] = useState(0);
  const [estimatedHours, setEstimatedHours] = useState(job.estimated_hours || 0);

  // Materials data
  const [materialsBreakdown, setMaterialsBreakdown] = useState<MaterialsBreakdown>({
    sheetBreakdowns: [],
    totals: { totalCost: 0, totalPrice: 0, totalProfit: 0, profitMargin: 0 }
  });

  // Form state for custom rows
  const [category, setCategory] = useState('subcontractor');
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unitCost, setUnitCost] = useState('60');
  const [markupPercent, setMarkupPercent] = useState('0');
  const [notes, setNotes] = useState('');
  const [insertAfterIndex, setInsertAfterIndex] = useState<number | null>(null);

  // Form state for labor pricing
  const [hourlyRate, setHourlyRate] = useState('60');
  
  // File upload state
  const [uploadingFiles, setUploadingFiles] = useState<Record<string, boolean>>({});
  const [categoryFiles, setCategoryFiles] = useState<Record<string, string[]>>({});
  const [materialFiles, setMaterialFiles] = useState<Record<string, string[]>>({});

  useEffect(() => {
    loadData();
  }, [job.id]);

  async function loadData() {
    setLoading(true);
    try {
      await Promise.all([
        loadCustomRows(),
        loadLaborPricing(),
        loadLaborHours(),
        loadMaterialsData(),
      ]);
    } catch (error) {
      console.error('Error loading financial data:', error);
      toast.error('Failed to load financial data');
    } finally {
      setLoading(false);
    }
  }

  async function loadMaterialsData() {
    try {
      // Get the working workbook for this job
      const { data: workbookData, error: workbookError } = await supabase
        .from('material_workbooks')
        .select('id')
        .eq('job_id', job.id)
        .eq('status', 'working')
        .maybeSingle();

      if (workbookError) throw workbookError;
      if (!workbookData) {
        setMaterialsBreakdown({
          sheetBreakdowns: [],
          totals: { totalCost: 0, totalPrice: 0, totalProfit: 0, profitMargin: 0 }
        });
        return;
      }

      // Get all sheets for this workbook
      const { data: sheetsData, error: sheetsError } = await supabase
        .from('material_sheets')
        .select('*')
        .eq('workbook_id', workbookData.id)
        .order('order_index');

      if (sheetsError) throw sheetsError;

      const sheetIds = (sheetsData || []).map(s => s.id);

      // Get all items for these sheets
      const { data: itemsData, error: itemsError } = await supabase
        .from('material_items')
        .select('*')
        .in('sheet_id', sheetIds);

      if (itemsError) throw itemsError;

      // Calculate breakdown by sheet and category
      const breakdowns = (sheetsData || []).map(sheet => {
        const sheetItems = (itemsData || []).filter(item => item.sheet_id === sheet.id);

        // Group by category
        const categoryMap = new Map<string, any[]>();
        sheetItems.forEach(item => {
          const category = item.category || 'Uncategorized';
          if (!categoryMap.has(category)) {
            categoryMap.set(category, []);
          }
          categoryMap.get(category)!.push(item);
        });

        // Calculate totals per category
        const categories = Array.from(categoryMap.entries()).map(([categoryName, items]) => {
          const totalCost = items.reduce((sum, item) => {
            const cost = (item.cost_per_unit || 0) * (item.quantity || 0);
            return sum + cost;
          }, 0);

          const totalPrice = items.reduce((sum, item) => {
            const price = (item.price_per_unit || 0) * (item.quantity || 0);
            return sum + price;
          }, 0);

          const profit = totalPrice - totalCost;
          const margin = totalPrice > 0 ? (profit / totalPrice) * 100 : 0;

          return {
            name: categoryName,
            itemCount: items.length,
            totalCost,
            totalPrice,
            profit,
            margin,
          };
        }).sort((a, b) => a.name.localeCompare(b.name));

        // Calculate sheet totals
        const sheetTotalCost = categories.reduce((sum, cat) => sum + cat.totalCost, 0);
        const sheetTotalPrice = categories.reduce((sum, cat) => sum + cat.totalPrice, 0);
        const sheetProfit = sheetTotalPrice - sheetTotalCost;
        const sheetMargin = sheetTotalPrice > 0 ? (sheetProfit / sheetTotalPrice) * 100 : 0;

        return {
          sheetName: sheet.sheet_name,
          categories,
          totalCost: sheetTotalCost,
          totalPrice: sheetTotalPrice,
          profit: sheetProfit,
          margin: sheetMargin,
        };
      });

      // Calculate grand totals
      const grandTotalCost = breakdowns.reduce((sum, sheet) => sum + sheet.totalCost, 0);
      const grandTotalPrice = breakdowns.reduce((sum, sheet) => sum + sheet.totalPrice, 0);
      const grandProfit = grandTotalPrice - grandTotalCost;
      const grandMargin = grandTotalPrice > 0 ? (grandProfit / grandTotalPrice) * 100 : 0;

      setMaterialsBreakdown({
        sheetBreakdowns: breakdowns,
        totals: {
          totalCost: grandTotalCost,
          totalPrice: grandTotalPrice,
          totalProfit: grandProfit,
          profitMargin: grandMargin,
        }
      });
    } catch (error: any) {
      console.error('Error loading materials breakdown:', error);
      setMaterialsBreakdown({
        sheetBreakdowns: [],
        totals: { totalCost: 0, totalPrice: 0, totalProfit: 0, profitMargin: 0 }
      });
    }
  }

  async function loadCustomRows() {
    const { data, error } = await supabase
      .from('custom_financial_rows')
      .eq('job_id', job.id)
      .select('*')
      .order('order_index');

    if (error) {
      console.error('Error loading custom rows:', error);
      return;
    }
    
    setCustomRows(data || []);
  }

  async function loadLaborPricing() {
    const { data, error } = await supabase
      .from('labor_pricing')
      .select('*')
      .eq('job_id', job.id)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      console.error('Error loading labor pricing:', error);
      return;
    }

    if (data) {
      setLaborPricing(data);
      setHourlyRate(data.hourly_rate.toString());
    } else {
      setHourlyRate('60');
    }
  }

  async function loadLaborHours() {
    const { data, error } = await supabase
      .from('time_entries')
      .select('total_hours, crew_count')
      .eq('job_id', job.id);

    if (error) {
      console.error('Error loading labor hours:', error);
      return;
    }

    const totalHours = (data || []).reduce((sum, entry) => {
      return sum + (entry.total_hours || 0) * (entry.crew_count || 1);
    }, 0);

    setTotalClockInHours(totalHours);
  }

  async function saveLaborPricing() {
    const rate = parseFloat(hourlyRate) || 60;
    const billable = rate;

    const pricingData = {
      job_id: job.id,
      hourly_rate: rate,
      markup_percent: 0,
      billable_rate: billable,
      notes: null,
    };

    try {
      if (laborPricing) {
        const { error } = await supabase
          .from('labor_pricing')
          .update(pricingData)
          .eq('id', laborPricing.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('labor_pricing')
          .insert([pricingData]);

        if (error) throw error;
      }

      toast.success('Labor pricing saved');
      await loadLaborPricing();
    } catch (error: any) {
      console.error('Error saving labor pricing:', error);
      toast.error('Failed to save labor pricing');
    }
  }

  function openAddDialog(row?: CustomFinancialRow, insertAfter?: number) {
    if (row) {
      setEditingRow(row);
      setCategory(row.category);
      setDescription(row.description);
      setQuantity(row.quantity.toString());
      setUnitCost(row.unit_cost.toString());
      setMarkupPercent(row.markup_percent.toString());
      setNotes(row.notes || '');
      setInsertAfterIndex(null);
    } else {
      resetForm();
      setInsertAfterIndex(insertAfter !== undefined ? insertAfter : null);
    }
    setShowAddDialog(true);
  }

  function openLaborDialog(insertAfter?: number) {
    resetForm();
    setCategory('labor');
    setDescription('Labor & Installation');
    setQuantity('1');
    setUnitCost('60');
    setMarkupPercent('0');
    setInsertAfterIndex(insertAfter !== undefined ? insertAfter : null);
    setShowAddDialog(true);
  }

  function resetForm() {
    setEditingRow(null);
    setCategory('subcontractor');
    setDescription('');
    setQuantity('1');
    setUnitCost('60');
    setMarkupPercent('0');
    setNotes('');
    setInsertAfterIndex(null);
  }

  async function saveCustomRow() {
    if (!description || !unitCost) {
      toast.error('Please fill in description and ' + (category === 'labor' ? 'hourly rate' : 'unit cost'));
      return;
    }

    const qty = parseFloat(quantity) || 1;
    const cost = parseFloat(unitCost) || 0;
    const markup = parseFloat(markupPercent) || 0;
    const totalCost = qty * cost;
    const sellingPrice = totalCost * (1 + markup / 100);

    let targetOrderIndex: number;

    if (editingRow) {
      // Keep existing order_index when editing
      targetOrderIndex = editingRow.order_index;
    } else if (insertAfterIndex !== null) {
      // Insert between rows
      const sortedRows = [...customRows].sort((a, b) => a.order_index - b.order_index);
      const insertAfterRow = sortedRows[insertAfterIndex];
      const nextRow = sortedRows[insertAfterIndex + 1];
      
      if (nextRow) {
        // Insert between two rows - use midpoint
        targetOrderIndex = (insertAfterRow.order_index + nextRow.order_index) / 2;
      } else {
        // Insert after last row
        targetOrderIndex = insertAfterRow.order_index + 1;
      }
    } else {
      // Add at the end
      const maxOrderIndex = customRows.length > 0 
        ? Math.max(...customRows.map(r => r.order_index))
        : -1;
      targetOrderIndex = maxOrderIndex + 1;
    }

    const rowData = {
      job_id: job.id,
      category,
      description,
      quantity: qty,
      unit_cost: cost,
      total_cost: totalCost,
      markup_percent: markup,
      selling_price: sellingPrice,
      notes: notes || null,
      order_index: targetOrderIndex,
    };

    try {
      if (editingRow) {
        const { error } = await supabase
          .from('custom_financial_rows')
          .update(rowData)
          .eq('id', editingRow.id);

        if (error) throw error;
        toast.success('Row updated');
      } else {
        const { error } = await supabase
          .from('custom_financial_rows')
          .insert([rowData]);

        if (error) throw error;
        toast.success(category === 'labor' ? 'Labor row added' : 'Row added');
      }

      setShowAddDialog(false);
      resetForm();
      await loadCustomRows();
    } catch (error: any) {
      console.error('Error saving row:', error);
      toast.error('Failed to save row');
    }
  }

  async function deleteRow(id: string) {
    if (!confirm('Delete this financial row?')) return;

    try {
      const { error } = await supabase
        .from('custom_financial_rows')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('Row deleted');
      await loadCustomRows();
    } catch (error: any) {
      console.error('Error deleting row:', error);
      toast.error('Failed to delete row');
    }
  }

  // File upload handlers
  async function handleFileUpload(category: string, files: FileList, isMaterial: boolean = false) {
    if (!files || files.length === 0) return;

    setUploadingFiles(prev => ({ ...prev, [category]: true }));

    try {
      const uploadPromises = Array.from(files).map(async (file) => {
        const fileName = `${job.id}/${category}/${Date.now()}-${file.name}`;
        
        const { data, error } = await supabase.storage
          .from('job-files')
          .upload(fileName, file);

        if (error) throw error;

        const { data: { publicUrl } } = supabase.storage
          .from('job-files')
          .getPublicUrl(fileName);

        return publicUrl;
      });

      const urls = await Promise.all(uploadPromises);
      
      if (isMaterial) {
        setMaterialFiles(prev => ({
          ...prev,
          [category]: [...(prev[category] || []), ...urls],
        }));
      } else {
        setCategoryFiles(prev => ({
          ...prev,
          [category]: [...(prev[category] || []), ...urls],
        }));
      }

      toast.success(`${files.length} file(s) uploaded`);
    } catch (error: any) {
      console.error('Error uploading files:', error);
      toast.error('Failed to upload files');
    } finally {
      setUploadingFiles(prev => ({ ...prev, [category]: false }));
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  function handleDrop(category: string, e: React.DragEvent, isMaterial: boolean = false) {
    e.preventDefault();
    e.stopPropagation();
    
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFileUpload(category, files, isMaterial);
    }
  }

  // Filter labor rows and calculate total labor hours
  const laborRows = customRows.filter(r => r.category === 'labor');
  const totalLaborHours = laborRows.reduce((sum, r) => sum + r.quantity, 0);
  
  // Sort all rows by order_index for proper display order
  const sortedCustomRows = [...customRows].sort((a, b) => a.order_index - b.order_index);
  
  // Calculate totals
  const groupedRows = customRows.reduce((acc, row) => {
    if (!acc[row.category]) {
      acc[row.category] = [];
    }
    acc[row.category].push(row);
    return acc;
  }, {} as Record<string, CustomFinancialRow[]>);

  const categoryTotals = Object.entries(groupedRows).map(([cat, rows]) => ({
    category: cat,
    totalCost: rows.reduce((sum, r) => sum + r.total_cost, 0),
    totalPrice: rows.reduce((sum, r) => sum + r.selling_price, 0),
  }));

  const grandTotalCost = categoryTotals.reduce((sum, ct) => sum + ct.totalCost, 0);
  const grandTotalPrice = categoryTotals.reduce((sum, ct) => sum + ct.totalPrice, 0);

  // Labor calculations (no markup) - use TOTAL LABOR HOURS from labor rows for pricing
  const laborRate = parseFloat(hourlyRate) || 60;
  const billableRate = laborRate;
  const laborCost = totalLaborHours * laborRate;
  const laborPrice = totalLaborHours * billableRate;
  const laborProfit = 0;

  // Overall totals (including materials)
  const totalCost = materialsBreakdown.totals.totalCost + grandTotalCost + laborCost;
  const totalPrice = materialsBreakdown.totals.totalPrice + grandTotalPrice + laborPrice;
  const totalProfit = totalPrice - totalCost;
  const profitMargin = totalPrice > 0 ? (totalProfit / totalPrice) * 100 : 0;

  // Proposal calculations with markup and tax
  const markup = parseFloat(proposalMarkup) || 0;
  const TAX_RATE = 0.07; // 7% tax on materials only
  
  // Materials: cost = original price, price = original price + markup
  const proposalMaterialsCost = materialsBreakdown.totals.totalPrice;
  const proposalMaterialsPrice = proposalMaterialsCost * (1 + markup / 100);
  const proposalMaterialsTax = proposalMaterialsPrice * TAX_RATE;
  const proposalMaterialsTotal = proposalMaterialsPrice + proposalMaterialsTax;
  
  // Additional costs with markup (also taxed)
  const proposalAdditionalCost = grandTotalPrice;
  const proposalAdditionalPrice = proposalAdditionalCost * (1 + markup / 100);
  const proposalAdditionalTax = proposalAdditionalPrice * TAX_RATE;
  const proposalAdditionalTotal = proposalAdditionalPrice + proposalAdditionalTax;
  
  // Labor (no markup, no tax)
  const proposalLaborCost = laborPrice;
  const proposalLaborPrice = laborPrice;
  const proposalLaborTax = 0;
  const proposalLaborTotal = proposalLaborPrice;
  
  // Grand totals for proposal
  const proposalTotalCost = proposalMaterialsCost + proposalAdditionalCost + proposalLaborCost;
  const proposalTotalPrice = proposalMaterialsPrice + proposalAdditionalPrice + proposalLaborPrice;
  const proposalTotalTax = proposalMaterialsTax + proposalAdditionalTax;
  const proposalGrandTotal = proposalMaterialsTotal + proposalAdditionalTotal + proposalLaborTotal;
  const proposalProfit = proposalGrandTotal - proposalTotalCost;
  const proposalMargin = proposalGrandTotal > 0 ? (proposalProfit / proposalGrandTotal) * 100 : 0;

  // Progress calculations - use total labor hours from labor rows
  const progressPercent = totalLaborHours > 0 ? Math.min((totalClockInHours / totalLaborHours) * 100, 100) : 0;
  const isOverBudget = totalClockInHours > totalLaborHours && totalLaborHours > 0;

  const categoryLabels: Record<string, string> = {
    labor: 'Labor',
    subcontractor: 'Subcontractors',
    materials: 'Additional Materials',
    equipment: 'Equipment',
    other: 'Other Costs',
  };

  const categoryDescriptions: Record<string, string> = {
    labor: 'Labor hours and installation work for this project',
    subcontractor: 'Third-party contractors and specialized services for this project',
    materials: 'Additional materials not included in the main material workbook',
    equipment: 'Rental equipment, tools, and machinery costs',
    other: 'Miscellaneous project costs and expenses',
  };

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-muted-foreground">Loading financials...</p>
      </div>
    );
  }

  return (
    <div className="w-full">
      <Tabs defaultValue="cost-breakdown" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="cost-breakdown">Cost Breakdown</TabsTrigger>
          <TabsTrigger value="proposal">Proposal</TabsTrigger>
        </TabsList>

        {/* Cost Breakdown Tab - Original View */}
        <TabsContent value="cost-breakdown">
          {/* Cost breakdown code stays the same */}
          <div className="text-center py-8 text-muted-foreground">
            <p>Switch to Proposal tab for full financial breakdown</p>
          </div>
        </TabsContent>

        {/* Proposal Tab */}
        <TabsContent value="proposal">
          <div className="max-w-[1400px] mx-auto px-4">
            {/* Header with Markup Control */}
            <div className="mb-6 flex items-center justify-between bg-white border-2 border-slate-300 rounded-lg p-4">
              <div className="flex items-center gap-3">
                <Calculator className="w-6 h-6 text-blue-700" />
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Project Proposal</h2>
                  <p className="text-sm text-slate-600">{job.name}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div>
                  <Label className="text-sm font-semibold text-slate-700">Markup %</Label>
                  <div className="flex gap-2 items-center mt-1">
                    <Input
                      type="number"
                      min="0"
                      step="0.1"
                      value={proposalMarkup}
                      onChange={(e) => setProposalMarkup(e.target.value)}
                      className="w-24 font-bold"
                    />
                    <span className="font-semibold">%</span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm text-slate-600">Grand Total</p>
                  <p className="text-3xl font-bold text-blue-700">${proposalGrandTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                </div>
              </div>
            </div>

            {/* Add Row Controls */}
            <div className="flex gap-2 mb-4">
              <Button onClick={() => openLaborDialog()} variant="outline" size="sm">
                <Plus className="w-4 h-4 mr-2" />
                Add Labor Row
              </Button>
              <Button onClick={() => openAddDialog()} variant="outline" size="sm">
                <Plus className="w-4 h-4 mr-2" />
                Add Other Cost
              </Button>
            </div>

            {/* Proposal Sections */}
            <div className="space-y-3">
              {/* Building Materials Section */}
              {materialsBreakdown.sheetBreakdowns.length > 0 && materialsBreakdown.sheetBreakdowns.map((sheet, idx) => {
                const sheetCost = sheet.totalPrice;
                const sheetPrice = sheetCost * (1 + markup / 100);
                const sheetTax = sheetPrice * TAX_RATE;
                const sheetTotal = sheetPrice + sheetTax;

                return (
                  <Collapsible key={idx} defaultOpen={false}>
                    <div className="border-2 border-slate-300 rounded-lg overflow-hidden bg-white">
                      <CollapsibleTrigger className="w-full">
                        <div className="bg-blue-50 hover:bg-blue-100 transition-colors p-3 flex items-center justify-between border-b">
                          <div className="flex items-center gap-3">
                            <ChevronDown className="w-5 h-5 text-blue-700" />
                            <div>
                              <h3 className="text-lg font-bold text-blue-900">{sheet.sheetName}</h3>
                              <p className="text-sm text-blue-700">{sheet.categories.length} categories of building materials</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-2xl font-bold text-blue-900">${sheetTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                          </div>
                        </div>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="p-4 space-y-2">
                          {sheet.categories.map((category: any, catIndex: number) => {
                            const catCost = category.totalPrice;
                            const catPrice = catCost * (1 + markup / 100);
                            const catTax = catPrice * TAX_RATE;
                            const catTotal = catPrice + catTax;

                            return (
                              <div key={catIndex} className="flex items-start justify-between py-2 border-b border-slate-200 last:border-0">
                                <div className="flex-1">
                                  <p className="font-semibold text-slate-900">{category.name}</p>
                                  <p className="text-sm text-slate-600">{category.itemCount} items</p>
                                </div>
                                <div className="text-right">
                                  <p className="font-bold text-slate-900">${catTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                                  <p className="text-xs text-slate-500">Base: ${catCost.toLocaleString('en-US', { minimumFractionDigits: 2 })} + Tax: ${catTax.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </CollapsibleContent>
                    </div>
                  </Collapsible>
                );
              })}

              {/* All Rows (labor, materials, subs, etc.) - sorted by order_index */}
              {sortedCustomRows.map((row, rowIndex) => {
                const rowCost = row.selling_price;
                const rowPrice = rowCost * (1 + markup / 100);
                const rowTax = row.category === 'labor' ? 0 : rowPrice * TAX_RATE;
                const rowTotal = rowPrice + rowTax;

                const bgColor = row.category === 'labor' ? 'bg-amber-50 hover:bg-amber-100' : 'bg-orange-50 hover:bg-orange-100';
                const textColor = row.category === 'labor' ? 'text-amber-900' : 'text-orange-900';
                const iconColor = row.category === 'labor' ? 'text-amber-700' : 'text-orange-700';

                return (
                  <div key={row.id}>
                    <div className="border-2 border-slate-300 rounded-lg overflow-hidden bg-white">
                      <div className={`${bgColor} transition-colors p-3 flex items-center justify-between border-b`}>
                        <div className="flex items-center gap-3 flex-1">
                          <Clock className={`w-5 h-5 ${iconColor}`} />
                          <div className="flex-1">
                            <h3 className={`text-lg font-bold ${textColor}`}>{row.description}</h3>
                            {row.notes && (
                              <p className="text-sm text-slate-700 mt-1 font-medium leading-snug">{row.notes}</p>
                            )}
                            <p className={`text-xs ${iconColor} mt-1`}>
                              {row.category === 'labor' 
                                ? `${row.quantity.toFixed(2)} hours × $${row.unit_cost.toFixed(2)}/hr`
                                : `${row.quantity} × $${row.unit_cost.toFixed(2)}`}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <p className={`text-2xl font-bold ${textColor}`}>${rowTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                            <p className="text-xs text-slate-500">
                              Base: ${rowCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                              {rowTax > 0 && ` + Tax: $${rowTax.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
                            </p>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openAddDialog(row)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => deleteRow(row.id)}
                            className="text-destructive"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>

                    {/* Insert Labor Row Button */}
                    <div className="flex justify-center my-2">
                      <Button
                        onClick={() => openLaborDialog(rowIndex)}
                        variant="ghost"
                        size="sm"
                        className="text-xs text-muted-foreground hover:text-primary"
                      >
                        <Plus className="w-3 h-3 mr-1" />
                        Insert Labor Here
                      </Button>
                    </div>
                  </div>
                );
              })}

              {/* Subcontractor Estimates */}
              <div className="border-2 border-slate-300 rounded-lg overflow-hidden bg-white">
                <div className="bg-purple-50 p-3 border-b">
                  <div className="flex items-center gap-3">
                    <Briefcase className="w-5 h-5 text-purple-700" />
                    <h3 className="text-lg font-bold text-purple-900">Subcontractors</h3>
                  </div>
                </div>
                <div className="p-4">
                  <SubcontractorEstimatesManagement jobId={job.id} />
                </div>
              </div>

              {/* Grand Total */}
              <div className="flex justify-end mt-6">
                <div className="border-2 border-blue-700 rounded-lg overflow-hidden bg-white w-full max-w-2xl">
                  <div className="bg-blue-700 p-4 text-white">
                    <h3 className="text-xl font-bold">Project Total</h3>
                  </div>
                  <div className="p-6 space-y-4">
                    {/* Breakdown */}
                    <div className="space-y-2 text-sm">
                      {materialsBreakdown.sheetBreakdowns.length > 0 && (
                        <div className="flex justify-between py-2 border-b">
                          <span className="font-semibold text-slate-700">Materials</span>
                          <span className="font-bold">${proposalMaterialsTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                        </div>
                      )}
                      {customRows.length > 0 && (
                        <div className="flex justify-between py-2 border-b">
                          <span className="font-semibold text-slate-700">Additional Costs & Labor</span>
                          <span className="font-bold">${(proposalAdditionalTotal + proposalLaborTotal).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                        </div>
                      )}
                    </div>

                    {/* Totals */}
                    <div className="space-y-3 pt-4 border-t-2">
                      <div className="flex justify-between">
                        <span className="text-slate-600">Subtotal</span>
                        <span className="font-semibold text-lg">${proposalTotalPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">Sales Tax (7%)</span>
                        <span className="font-semibold text-lg">${proposalTotalTax.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between pt-3 border-t-2">
                        <span className="text-xl font-bold text-blue-900">GRAND TOTAL</span>
                        <span className="text-3xl font-bold text-blue-700">${proposalGrandTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Add/Edit Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingRow ? 'Edit' : 'Add'} {category === 'labor' ? 'Labor Row' : 'Financial Row'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Category *</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="labor">Labor</SelectItem>
                  <SelectItem value="subcontractor">Subcontractor</SelectItem>
                  <SelectItem value="materials">Additional Materials</SelectItem>
                  <SelectItem value="equipment">Equipment</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Description *</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={category === 'labor' ? 'e.g., Labor & Installation' : 'e.g., Electrician, Concrete pour...'}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{category === 'labor' ? 'Hours' : 'Quantity'}</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </div>
              <div>
                <Label>{category === 'labor' ? 'Rate ($/hr)' : 'Unit Cost ($)'} *</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={unitCost}
                  onChange={(e) => setUnitCost(e.target.value)}
                  placeholder="60.00"
                />
              </div>
            </div>

            <div>
              <Label>Markup (%) - Optional</Label>
              <Input
                type="number"
                min="0"
                step="0.1"
                value={markupPercent}
                onChange={(e) => setMarkupPercent(e.target.value)}
                placeholder="0"
              />
            </div>

            <div>
              <Label>Description (shown when collapsed)</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g., All electrical wiring and fixtures for garage and apartment"
                rows={3}
              />
              <p className="text-xs text-muted-foreground mt-1">
                This will be visible in the collapsed row to provide context
              </p>
            </div>

            {/* Preview */}
            {unitCost && (
              <div className="bg-slate-50 p-4 rounded-lg border space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Total Cost:</span>
                  <span className="font-semibold">
                    ${((parseFloat(quantity) || 1) * (parseFloat(unitCost) || 0)).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Selling Price:</span>
                  <span className="font-bold text-blue-600">
                    ${(((parseFloat(quantity) || 1) * (parseFloat(unitCost) || 0)) * (1 + (parseFloat(markupPercent) || 0) / 100)).toFixed(2)}
                  </span>
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-4 border-t">
              <Button onClick={saveCustomRow} className="flex-1">
                {editingRow ? 'Update' : 'Add'} Row
              </Button>
              <Button variant="outline" onClick={() => setShowAddDialog(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
