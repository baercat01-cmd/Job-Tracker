
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
  taxable: boolean;
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
  
  // Material sheet description editing
  const [showSheetDescDialog, setShowSheetDescDialog] = useState(false);
  const [editingSheetId, setEditingSheetId] = useState<string | null>(null);
  const [sheetDescription, setSheetDescription] = useState('');
  const [materialSheets, setMaterialSheets] = useState<any[]>([]);

  // Subcontractor estimates
  const [subcontractorEstimates, setSubcontractorEstimates] = useState<any[]>([]);

  // Tab state - persist across re-renders
  const [activeTab, setActiveTab] = useState('cost-breakdown');

  // Form state for custom rows
  const [category, setCategory] = useState('subcontractor');
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unitCost, setUnitCost] = useState('60');
  const [markupPercent, setMarkupPercent] = useState('0');
  const [notes, setNotes] = useState('');
  const [taxable, setTaxable] = useState(true);
  const [draggedRowId, setDraggedRowId] = useState<string | null>(null);
  const [dragOverRowId, setDragOverRowId] = useState<string | null>(null);

  // Form state for labor pricing
  const [hourlyRate, setHourlyRate] = useState('60');
  
  // File upload state
  const [uploadingFiles, setUploadingFiles] = useState<Record<string, boolean>>({});
  const [categoryFiles, setCategoryFiles] = useState<Record<string, string[]>>({});
  const [materialFiles, setMaterialFiles] = useState<Record<string, string[]>>({});

  useEffect(() => {
    loadData(false); // Initial load with spinner
    
    // Set up polling for real-time updates (every 5 seconds)
    const pollInterval = setInterval(() => {
      loadData(true); // Silent updates during polling
    }, 5000);
    
    return () => clearInterval(pollInterval);
  }, [job.id]);

  async function loadData(silent = false) {
    // Only show loading spinner on initial load, not during polling
    if (!silent) {
      setLoading(true);
    }
    try {
      await Promise.all([
        loadCustomRows(),
        loadLaborPricing(),
        loadLaborHours(),
        loadMaterialsData(),
        loadSubcontractorEstimates(),
      ]);
    } catch (error) {
      console.error('Error loading financial data:', error);
      if (!silent) {
        toast.error('Failed to load financial data');
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }

  async function loadSubcontractorEstimates() {
    try {
      const { data, error } = await supabase
        .from('subcontractor_estimates')
        .select('*')
        .eq('job_id', job.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      const newData = data || [];
      if (JSON.stringify(newData) !== JSON.stringify(subcontractorEstimates)) {
        setSubcontractorEstimates(newData);
      }
    } catch (error: any) {
      console.error('Error loading subcontractor estimates:', error);
      if (subcontractorEstimates.length > 0) {
        setSubcontractorEstimates([]);
      }
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

      // Store sheets data for editing
      setMaterialSheets(sheetsData || []);
      
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
          sheetId: sheet.id,
          sheetName: sheet.sheet_name,
          sheetDescription: sheet.description || '',
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
      .select('*')
      .eq('job_id', job.id)
      .order('order_index');

    if (error) {
      console.error('Error loading custom rows:', error);
      return;
    }
    
    // Only update if data actually changed to prevent unnecessary re-renders
    const newData = data || [];
    if (JSON.stringify(newData) !== JSON.stringify(customRows)) {
      setCustomRows(newData);
    }
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
      if (JSON.stringify(data) !== JSON.stringify(laborPricing)) {
        setLaborPricing(data);
        setHourlyRate(data.hourly_rate.toString());
      }
    } else {
      if (hourlyRate !== '60') {
        setHourlyRate('60');
      }
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

    if (totalHours !== totalClockInHours) {
      setTotalClockInHours(totalHours);
    }
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

  function openAddDialog(row?: CustomFinancialRow) {
    if (row) {
      setEditingRow(row);
      setCategory(row.category);
      setDescription(row.description);
      setQuantity(row.quantity.toString());
      setUnitCost(row.unit_cost.toString());
      setMarkupPercent(row.markup_percent.toString());
      setNotes(row.notes || '');
      setTaxable(row.taxable !== undefined ? row.taxable : true);
    } else {
      resetForm();
    }
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
    setTaxable(true);
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
      targetOrderIndex = editingRow.order_index;
    } else {
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
      taxable: taxable,
      order_index: targetOrderIndex,
    };

    try {
      if (editingRow) {
        const { data, error } = await supabase
          .from('custom_financial_rows')
          .update(rowData)
          .eq('id', editingRow.id)
          .select();

        if (error) throw error;
        toast.success('Row updated');
      } else {
        const { data, error } = await supabase
          .from('custom_financial_rows')
          .insert([rowData])
          .select();

        if (error) throw error;
        toast.success(category === 'labor' ? 'Labor row added' : 'Row added');
      }

      setShowAddDialog(false);
      resetForm();
      await loadCustomRows();
    } catch (error: any) {
      console.error('Error saving row:', error);
      toast.error(`Failed to save row: ${error.message || 'Unknown error'}`);
    }
  }

  function openSheetDescDialog(sheetId: string, currentDescription: string) {
    setEditingSheetId(sheetId);
    setSheetDescription(currentDescription || '');
    setShowSheetDescDialog(true);
  }

  async function saveSheetDescription() {
    if (!editingSheetId) return;

    try {
      const { error } = await supabase
        .from('material_sheets')
        .update({ description: sheetDescription || null })
        .eq('id', editingSheetId);

      if (error) throw error;

      toast.success('Description saved');
      setShowSheetDescDialog(false);
      setEditingSheetId(null);
      setSheetDescription('');
      await loadMaterialsData();
    } catch (error: any) {
      console.error('Error saving sheet description:', error);
      toast.error('Failed to save description');
    }
  }

  function handleDragStart(e: React.DragEvent, rowId: string) {
    setDraggedRowId(rowId);
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDragOver(e: React.DragEvent, rowId: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverRowId(rowId);
  }

  function handleDragLeave() {
    setDragOverRowId(null);
  }

  async function handleDrop(e: React.DragEvent, targetRowId: string) {
    e.preventDefault();
    
    if (!draggedRowId || draggedRowId === targetRowId) {
      setDraggedRowId(null);
      setDragOverRowId(null);
      return;
    }

    const draggedRow = customRows.find(r => r.id === draggedRowId);
    const targetRow = customRows.find(r => r.id === targetRowId);

    if (!draggedRow || !targetRow) {
      setDraggedRowId(null);
      setDragOverRowId(null);
      return;
    }

    try {
      // Calculate new order index (place before target)
      const sortedRows = [...customRows].sort((a, b) => a.order_index - b.order_index);
      const targetIndex = sortedRows.findIndex(r => r.id === targetRowId);
      const prevRow = sortedRows[targetIndex - 1];
      
      let newOrderIndex: number;
      if (prevRow) {
        newOrderIndex = (prevRow.order_index + targetRow.order_index) / 2;
      } else {
        newOrderIndex = targetRow.order_index - 1;
      }

      const { error } = await supabase
        .from('custom_financial_rows')
        .update({ order_index: newOrderIndex })
        .eq('id', draggedRowId);

      if (error) throw error;

      toast.success('Row moved');
      await loadCustomRows();
    } catch (error: any) {
      console.error('Error reordering row:', error);
      toast.error('Failed to reorder row');
    } finally {
      setDraggedRowId(null);
      setDragOverRowId(null);
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
  const TAX_RATE = 0.07; // 7% tax
  
  // Materials: cost = original price, price = original price + markup (always taxable)
  const proposalMaterialsCost = materialsBreakdown.totals.totalPrice;
  const proposalMaterialsPrice = proposalMaterialsCost * (1 + markup / 100);
  
  // Separate custom rows into taxable and non-taxable
  const taxableRows = customRows.filter(r => r.taxable);
  const nonTaxableRows = customRows.filter(r => !r.taxable);
  
  const taxableAdditionalCost = taxableRows.reduce((sum, r) => sum + r.selling_price, 0);
  const taxableAdditionalPrice = taxableAdditionalCost * (1 + markup / 100);
  
  const nonTaxableAdditionalCost = nonTaxableRows.reduce((sum, r) => sum + r.selling_price, 0);
  const nonTaxableAdditionalPrice = nonTaxableAdditionalCost * (1 + markup / 100);
  
  // Labor (no markup, no tax)
  const proposalLaborCost = laborPrice;
  const proposalLaborPrice = laborPrice;
  
  // Subcontractor estimates (with their individual markups, then proposal markup, taxable)
  const subcontractorBaseCost = subcontractorEstimates.reduce((sum, est) => {
    const baseAmount = est.total_amount || 0;
    const estMarkup = est.markup_percent || 0;
    return sum + (baseAmount * (1 + estMarkup / 100));
  }, 0);
  const proposalSubcontractorPrice = subcontractorBaseCost * (1 + markup / 100);
  
  // Calculate subtotals
  const taxableSubtotal = proposalMaterialsPrice + taxableAdditionalPrice + proposalSubcontractorPrice;
  const nonTaxableSubtotal = nonTaxableAdditionalPrice + proposalLaborPrice;
  
  // Tax calculated only on taxable items
  const proposalTotalTax = taxableSubtotal * TAX_RATE;
  
  // Grand total
  const proposalSubtotal = taxableSubtotal + nonTaxableSubtotal;
  const proposalGrandTotal = proposalSubtotal + proposalTotalTax;
  
  const proposalAdditionalCost = taxableAdditionalCost + nonTaxableAdditionalCost;
  const proposalAdditionalPrice = taxableAdditionalPrice + nonTaxableAdditionalPrice;
  
  const proposalTotalCost = proposalMaterialsCost + proposalAdditionalCost + proposalLaborCost + subcontractorBaseCost;
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
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="cost-breakdown">Cost Breakdown</TabsTrigger>
          <TabsTrigger value="proposal">Proposal</TabsTrigger>
        </TabsList>

        {/* Cost Breakdown Tab - Original View */}
        <TabsContent value="cost-breakdown">
          <div className="max-w-6xl mx-auto space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <FileSpreadsheet className="w-4 h-4 text-blue-600" />
                    Materials
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Cost:</span>
                      <span className="font-semibold">${materialsBreakdown.totals.totalCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Price:</span>
                      <span className="font-bold text-blue-600">${materialsBreakdown.totals.totalPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between text-sm pt-2 border-t">
                      <span className="text-muted-foreground">Profit:</span>
                      <span className="font-bold text-green-600">${materialsBreakdown.totals.totalProfit.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Clock className="w-4 h-4 text-amber-600" />
                    Labor
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Hours:</span>
                      <span className="font-semibold">{totalLaborHours.toFixed(1)} hrs</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Rate:</span>
                      <span className="font-semibold">${laborRate.toFixed(2)}/hr</span>
                    </div>
                    <div className="flex justify-between text-sm pt-2 border-t">
                      <span className="text-muted-foreground">Total:</span>
                      <span className="font-bold text-amber-600">${laborPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-green-600" />
                    Project Total
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Cost:</span>
                      <span className="font-semibold">${totalCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Price:</span>
                      <span className="font-bold text-blue-600">${totalPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between text-sm pt-2 border-t">
                      <span className="text-muted-foreground">Profit:</span>
                      <span className="font-bold text-green-600">${totalProfit.toLocaleString('en-US', { minimumFractionDigits: 2 })} ({profitMargin.toFixed(1)}%)</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Materials Breakdown */}
            {materialsBreakdown.sheetBreakdowns.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileSpreadsheet className="w-5 h-5 text-blue-600" />
                    Materials Breakdown
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    {materialsBreakdown.sheetBreakdowns.map((sheet, idx) => (
                      <div key={idx} className="border rounded-lg overflow-hidden">
                        <div className="bg-blue-50 p-3 border-b">
                          <div className="flex items-center justify-between">
                            <h3 className="font-bold text-blue-900">{sheet.sheetName}</h3>
                            <div className="text-right">
                              <p className="text-sm text-blue-700">Cost: ${sheet.totalCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                              <p className="font-bold text-blue-900">Price: ${sheet.totalPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                            </div>
                          </div>
                        </div>
                        <div className="p-4">
                          <div className="space-y-3">
                            {sheet.categories.map((category: any, catIdx: number) => (
                              <div key={catIdx} className="flex items-center justify-between py-2 border-b last:border-0">
                                <div>
                                  <p className="font-semibold text-slate-900">{category.name}</p>
                                  <p className="text-sm text-slate-600">{category.itemCount} items</p>
                                </div>
                                <div className="text-right">
                                  <div className="flex gap-4 text-sm">
                                    <div>
                                      <p className="text-muted-foreground">Cost</p>
                                      <p className="font-semibold">${category.totalCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                                    </div>
                                    <div>
                                      <p className="text-muted-foreground">Price</p>
                                      <p className="font-bold text-blue-600">${category.totalPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                                    </div>
                                    <div>
                                      <p className="text-muted-foreground">Profit</p>
                                      <p className="font-bold text-green-600">${category.profit.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Additional Costs Breakdown */}
            {customRows.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-orange-600" />
                    Additional Costs
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {Object.entries(groupedRows).map(([cat, rows]) => {
                      const catTotal = rows.reduce((sum, r) => sum + r.total_cost, 0);
                      const catPrice = rows.reduce((sum, r) => sum + r.selling_price, 0);
                      const catProfit = catPrice - catTotal;
                      
                      return (
                        <div key={cat} className="border rounded-lg overflow-hidden">
                          <div className="bg-orange-50 p-3 border-b flex items-center justify-between">
                            <h3 className="font-bold text-orange-900">{categoryLabels[cat] || cat}</h3>
                            <div className="flex gap-4 text-sm">
                              <div className="text-right">
                                <p className="text-orange-700">Cost</p>
                                <p className="font-semibold">${catTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                              </div>
                              <div className="text-right">
                                <p className="text-orange-700">Price</p>
                                <p className="font-bold text-orange-900">${catPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                              </div>
                              <div className="text-right">
                                <p className="text-orange-700">Profit</p>
                                <p className="font-bold text-green-600">${catProfit.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                              </div>
                            </div>
                          </div>
                          <div className="p-4 space-y-2">
                            {rows.map((row) => (
                              <div key={row.id} className="flex items-center justify-between py-2 border-b last:border-0">
                                <div>
                                  <p className="font-medium">{row.description}</p>
                                  <p className="text-sm text-muted-foreground">
                                    {row.quantity} × ${row.unit_cost.toFixed(2)}
                                    {row.markup_percent > 0 && (
                                      <span className="ml-2 text-green-600">+{row.markup_percent}%</span>
                                    )}
                                  </p>
                                </div>
                                <div className="flex gap-4 text-sm text-right">
                                  <div>
                                    <p className="text-muted-foreground">Cost</p>
                                    <p className="font-semibold">${row.total_cost.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                                  </div>
                                  <div>
                                    <p className="text-muted-foreground">Price</p>
                                    <p className="font-bold text-blue-600">${row.selling_price.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Progress Tracking */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-amber-600" />
                  Labor Progress
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between text-sm">
                    <span>Budgeted Hours:</span>
                    <span className="font-semibold">{totalLaborHours.toFixed(1)} hrs</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Actual Hours (Clock-ins):</span>
                    <span className={`font-semibold ${isOverBudget ? 'text-red-600' : 'text-green-600'}`}>
                      {totalClockInHours.toFixed(1)} hrs
                    </span>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Progress:</span>
                      <span className={`font-bold ${isOverBudget ? 'text-red-600' : 'text-green-600'}`}>
                        {progressPercent.toFixed(1)}%
                      </span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
                      <div
                        className={`h-full transition-all ${isOverBudget ? 'bg-red-500' : 'bg-green-500'}`}
                        style={{ width: `${Math.min(progressPercent, 100)}%` }}
                      />
                    </div>
                  </div>
                  {isOverBudget && (
                    <p className="text-sm text-red-600 font-medium">
                      ⚠️ Over budget by {(totalClockInHours - totalLaborHours).toFixed(1)} hours
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Proposal Tab */}
        <TabsContent value="proposal">
          <div className="max-w-[1400px] mx-auto px-4">
            {/* Header */}
            <div className="mb-6 bg-white border-2 border-slate-300 rounded-lg p-4 flex items-center gap-3">
              <Calculator className="w-6 h-6 text-slate-700" />
              <div>
                <h2 className="text-lg font-bold text-slate-900">Project Proposal</h2>
                <p className="text-sm text-slate-600">{job.name}</p>
              </div>
            </div>

            {/* Add Row Control */}
            <div className="flex gap-2 mb-4">
              <Button onClick={() => openAddDialog()} variant="outline" size="sm">
                <Plus className="w-4 h-4 mr-2" />
                Add Row
              </Button>
            </div>

            {/* Proposal Sections */}
            <div className="space-y-3">
              {/* Building Materials Section with Project Total beside it */}
              {materialsBreakdown.sheetBreakdowns.length > 0 && (
                <div className="flex gap-6 items-start">
                  {/* Materials Column */}
                  <div className="flex-1 space-y-3">
                    {materialsBreakdown.sheetBreakdowns.map((sheet, idx) => {
                const sheetCost = sheet.totalPrice;
                const sheetPrice = sheetCost * (1 + markup / 100);

                return (
                  <Collapsible key={idx} defaultOpen={false}>
                    <div className="border-2 border-slate-300 rounded-lg overflow-hidden bg-white">
                      <CollapsibleTrigger className="w-full">
                        <div className="bg-blue-50 hover:bg-blue-100 transition-colors p-3 flex items-center justify-between border-b">
                          <div className="flex items-center gap-3 flex-1">
                            <ChevronDown className="w-5 h-5 text-blue-700" />
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <h3 className="text-lg font-bold text-blue-900">{sheet.sheetName}</h3>
                                <Badge variant="outline" className="bg-green-100 text-green-800 border-green-300">
                                  <Percent className="w-3 h-3 mr-1" />
                                  {markup.toFixed(1)}% markup
                                </Badge>
                              </div>
                              <p className="text-sm text-slate-600 mt-1 italic min-h-[20px]">
                                {sheet.sheetDescription || '(No description provided)'}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <p className="text-xs text-slate-600 mb-1">Base: ${sheetCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                              <p className="text-2xl font-bold text-blue-900">${sheetPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={(e) => {
                                e.stopPropagation();
                                openSheetDescDialog(sheet.sheetId, sheet.sheetDescription);
                              }}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="p-4 space-y-2">
                          {sheet.categories.map((category: any, catIndex: number) => {
                            const catCost = category.totalPrice;
                            const catPrice = catCost * (1 + markup / 100);

                            return (
                              <div key={catIndex} className="flex items-start justify-between py-2 border-b border-slate-200">
                                <div className="flex-1">
                                  <p className="font-semibold text-slate-900">{category.name}</p>
                                  <p className="text-sm text-slate-600">{category.itemCount} items</p>
                                </div>
                                <div className="text-right">
                                  <p className="font-bold text-slate-900">${catPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                                  <p className="text-xs text-slate-500">Base: ${catCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
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
                  </div>

                  {/* Project Total Box */}
                  <div className="border-2 border-slate-900 rounded-lg overflow-hidden bg-white shadow-lg sticky top-4" style={{ minWidth: '400px', maxWidth: '450px' }}>
                    <div className="bg-gradient-to-r from-slate-900 to-slate-700 p-4 text-white">
                      <h3 className="text-xl font-bold flex items-center gap-2">
                        <DollarSign className="w-6 h-6 text-amber-400" />
                        Project Total
                      </h3>
                    </div>
                    <div className="p-6 space-y-4">
                      {/* Breakdown */}
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between py-2 border-b border-slate-200">
                          <span className="font-semibold text-slate-700">Materials</span>
                          <span className="font-bold text-slate-900">${proposalMaterialsPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                        </div>
                        {subcontractorEstimates.length > 0 && (
                          <div className="flex justify-between py-2 border-b border-slate-200">
                            <span className="font-semibold text-slate-700">Subcontractors</span>
                            <span className="font-bold text-slate-900">${proposalSubcontractorPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                          </div>
                        )}
                        {customRows.length > 0 && (
                          <div className="flex justify-between py-2 border-b border-slate-200">
                            <span className="font-semibold text-slate-700">Additional Costs & Labor</span>
                            <span className="font-bold text-slate-900">${(proposalAdditionalPrice + proposalLaborPrice).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                          </div>
                        )}
                      </div>

                      {/* Totals */}
                      <div className="space-y-3 pt-4 border-t-2 border-slate-200">
                        <div className="flex justify-between items-center">
                          <span className="text-slate-600">Subtotal</span>
                          <span className="font-semibold text-lg text-slate-900">${proposalSubtotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-slate-600">Sales Tax (7%)</span>
                          <span className="font-semibold text-lg text-amber-700">${proposalTotalTax.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                        </div>
                        <div className="flex justify-between items-center pt-3 border-t-2 border-amber-400 bg-gradient-to-r from-green-50 to-emerald-50 -mx-6 px-6 py-4 mt-4">
                          <span className="text-xl font-bold text-slate-900">GRAND TOTAL</span>
                          <span className="text-3xl font-bold text-green-700">${proposalGrandTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* All Rows (labor, materials, subs, etc.) - sorted by order_index - DRAG AND DROP */}
              {sortedCustomRows.map((row, rowIndex) => {
                const rowCost = row.selling_price;
                const rowPrice = rowCost * (1 + markup / 100);

                const bgColor = row.category === 'labor' ? 'bg-amber-50 hover:bg-amber-100' : 'bg-orange-50 hover:bg-orange-100';
                const textColor = row.category === 'labor' ? 'text-amber-900' : 'text-orange-900';
                const iconColor = row.category === 'labor' ? 'text-amber-700' : 'text-orange-700';
                const isDragging = draggedRowId === row.id;
                const isDragOver = dragOverRowId === row.id;

                return (
                  <div
                    key={row.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, row.id)}
                    onDragOver={(e) => handleDragOver(e, row.id)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, row.id)}
                    className={`transition-all ${
                      isDragging ? 'opacity-50 scale-95' : ''
                    } ${
                      isDragOver ? 'border-t-4 border-t-primary' : ''
                    }`}
                  >
                    <div className="border-2 border-slate-300 rounded-lg overflow-hidden bg-white cursor-move mb-2">
                      <div className={`${bgColor} transition-colors p-3 flex items-center justify-between border-b`}>
                        <div className="flex items-center gap-3 flex-1">
                          <div className="cursor-grab active:cursor-grabbing">
                            <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                            </svg>
                          </div>
                          <Clock className={`w-5 h-5 ${iconColor}`} />
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <h3 className={`text-lg font-bold ${textColor}`}>{row.description}</h3>
                              {row.markup_percent > 0 && (
                                <Badge variant="outline" className="bg-green-100 text-green-800 border-green-300">
                                  <Percent className="w-3 h-3 mr-1" />
                                  {row.markup_percent.toFixed(1)}% markup
                                </Badge>
                              )}
                              {!row.taxable && (
                                <Badge variant="outline" className="bg-slate-100 text-slate-800">
                                  No Tax
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <p className={`text-2xl font-bold ${textColor}`}>${rowPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                            <p className="text-xs text-slate-500">
                              Base: ${rowCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}
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


            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Edit Material Sheet Description Dialog */}
      <Dialog open={showSheetDescDialog} onOpenChange={setShowSheetDescDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Material Description</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Description</Label>
              <Textarea
                value={sheetDescription}
                onChange={(e) => setSheetDescription(e.target.value)}
                placeholder="e.g., All materials for the main building structure including framing, roofing, and exterior"
                rows={4}
              />
              <p className="text-xs text-muted-foreground mt-1">
                This description will appear under the material section title in the proposal
              </p>
            </div>

            <div className="flex gap-3 pt-4 border-t">
              <Button onClick={saveSheetDescription} className="flex-1">
                Save Description
              </Button>
              <Button variant="outline" onClick={() => setShowSheetDescDialog(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingRow ? 'Edit' : 'Add'} Financial Row</DialogTitle>
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

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Markup (%) *</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.1"
                  value={markupPercent}
                  onChange={(e) => setMarkupPercent(e.target.value)}
                  placeholder="0"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Individual markup for this row
                </p>
              </div>
              
              <div>
                <Label>Tax Settings</Label>
                <div className="flex items-center space-x-2 h-10">
                  <input
                    type="checkbox"
                    id="taxable"
                    checked={taxable}
                    onChange={(e) => setTaxable(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300"
                  />
                  <label htmlFor="taxable" className="text-sm font-medium cursor-pointer">
                    Subject to tax
                  </label>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {taxable ? '7% tax will be applied' : 'No tax applied'}
                </p>
              </div>
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
