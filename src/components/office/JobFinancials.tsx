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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Trash2, DollarSign, Clock, TrendingUp, Percent, Calculator, FileSpreadsheet, ChevronDown, Briefcase, Edit, Upload, MoreVertical, List } from 'lucide-react';
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

interface CustomRowLineItem {
  id: string;
  row_id: string;
  description: string;
  quantity: number;
  unit_cost: number;
  total_cost: number;
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
  const [customRowLineItems, setCustomRowLineItems] = useState<Record<string, CustomRowLineItem[]>>({});
  const [laborPricing, setLaborPricing] = useState<LaborPricing | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showSubUploadDialog, setShowSubUploadDialog] = useState(false);
  const [editingRow, setEditingRow] = useState<CustomFinancialRow | null>(null);
  
  // Line item dialog state
  const [showLineItemDialog, setShowLineItemDialog] = useState(false);
  const [editingLineItem, setEditingLineItem] = useState<CustomRowLineItem | null>(null);
  const [lineItemParentRowId, setLineItemParentRowId] = useState<string | null>(null);
  const [lineItemForm, setLineItemForm] = useState({
    description: '',
    quantity: '1',
    unit_cost: '0',
    notes: '',
  });
  
  // Individual row markups state
  const [sheetMarkups, setSheetMarkups] = useState<Record<string, number>>({});
  
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
  const [sheetLabor, setSheetLabor] = useState<Record<string, any>>({});
  const [customRowLabor, setCustomRowLabor] = useState<Record<string, any>>({});

  // Labor dialog state
  const [showLaborDialog, setShowLaborDialog] = useState(false);
  const [editingLaborSheetId, setEditingLaborSheetId] = useState<string | null>(null);
  const [editingLaborRowId, setEditingLaborRowId] = useState<string | null>(null);
  const [laborForm, setLaborForm] = useState({
    description: 'Labor & Installation',
    estimated_hours: 0,
    hourly_rate: 60,
    notes: '',
  });

  // Subcontractor estimates
  const [subcontractorEstimates, setSubcontractorEstimates] = useState<any[]>([]);
  const [subcontractorLineItems, setSubcontractorLineItems] = useState<Record<string, any[]>>({});

  // Tab state - persist across re-renders using localStorage
  const [activeTab, setActiveTab] = useState(() => {
    const saved = localStorage.getItem(`job-financials-tab-${job.id}`);
    return saved || 'cost-breakdown';
  });

  // Save tab selection to localStorage whenever it changes
  const handleTabChange = (value: string) => {
    setActiveTab(value);
    localStorage.setItem(`job-financials-tab-${job.id}`, value);
  };

  // Form state for custom rows
  const [category, setCategory] = useState('subcontractor');
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unitCost, setUnitCost] = useState('60');
  const [markupPercent, setMarkupPercent] = useState('0');
  const [notes, setNotes] = useState('');
  const [taxable, setTaxable] = useState(true);

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
        .order('order_index');

      if (error) throw error;
      const newData = data || [];
      // Only update if data actually changed
      if (JSON.stringify(newData) !== JSON.stringify(subcontractorEstimates)) {
        setSubcontractorEstimates(newData);
      }

      // Load line items for all estimates
      if (newData.length > 0) {
        const estimateIds = newData.map(e => e.id);
        const { data: lineItemsData, error: lineItemsError } = await supabase
          .from('subcontractor_estimate_line_items')
          .select('*')
          .in('estimate_id', estimateIds)
          .order('order_index');

        if (!lineItemsError && lineItemsData) {
          const lineItemsMap: Record<string, any[]> = {};
          lineItemsData.forEach(item => {
            if (!lineItemsMap[item.estimate_id]) {
              lineItemsMap[item.estimate_id] = [];
            }
            lineItemsMap[item.estimate_id].push(item);
          });
          setSubcontractorLineItems(lineItemsMap);
        }
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
        setMaterialSheets([]);
        setSheetLabor({});
        setSheetMarkups({});
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

      // Get labor data for all sheets
      const { data: laborData, error: laborError } = await supabase
        .from('material_sheet_labor')
        .select('*')
        .in('sheet_id', sheetIds);

      if (!laborError && laborData) {
        const laborMap: Record<string, any> = {};
        laborData.forEach(labor => {
          laborMap[labor.sheet_id] = labor;
        });
        if (JSON.stringify(laborMap) !== JSON.stringify(sheetLabor)) {
          setSheetLabor(laborMap);
        }
      }

      // Initialize sheet markups (default 10% for materials)
      const markupsMap: Record<string, number> = {};
      (sheetsData || []).forEach(sheet => {
        markupsMap[sheet.id] = 10; // Default 10% markup for materials
      });
      setSheetMarkups(markupsMap);

      // Get all items for these sheets
      const { data: itemsData, error: itemsError } = await supabase
        .from('material_items')
        .select('*')
        .in('sheet_id', sheetIds);

      if (itemsError) throw itemsError;

      // Store sheets data for editing
      if (JSON.stringify(sheetsData || []) !== JSON.stringify(materialSheets)) {
        setMaterialSheets(sheetsData || []);
      }
      
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
          orderIndex: sheet.order_index,
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

      // Only update if data actually changed to prevent unnecessary re-renders
      const newBreakdown = {
        sheetBreakdowns: breakdowns,
        totals: {
          totalCost: grandTotalCost,
          totalPrice: grandTotalPrice,
          totalProfit: grandProfit,
          profitMargin: grandMargin,
        }
      };
      
      if (JSON.stringify(newBreakdown) !== JSON.stringify(materialsBreakdown)) {
        setMaterialsBreakdown(newBreakdown);
      }
    } catch (error: any) {
      console.error('Error loading materials breakdown:', error);
      // Only update if not already empty
      if (materialsBreakdown.sheetBreakdowns.length > 0 || materialsBreakdown.totals.totalCost !== 0) {
        setMaterialsBreakdown({
          sheetBreakdowns: [],
          totals: { totalCost: 0, totalPrice: 0, totalProfit: 0, profitMargin: 0 }
        });
        setMaterialSheets([]);
      }
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

    // Load labor data for custom rows (store in notes field as JSON)
    const laborMap: Record<string, any> = {};
    newData.forEach(row => {
      if (row.notes) {
        try {
          const parsed = JSON.parse(row.notes);
          if (parsed.labor) {
            laborMap[row.id] = parsed.labor;
          }
        } catch {
          // Not JSON, skip
        }
      }
    });
    setCustomRowLabor(laborMap);

    // Load line items for custom rows
    if (newData.length > 0) {
      const rowIds = newData.map(r => r.id);
      const { data: lineItemsData, error: lineItemsError } = await supabase
        .from('custom_financial_row_items')
        .select('*')
        .in('row_id', rowIds)
        .order('order_index');

      if (!lineItemsError && lineItemsData) {
        const lineItemsMap: Record<string, CustomRowLineItem[]> = {};
        lineItemsData.forEach(item => {
          if (!lineItemsMap[item.row_id]) {
            lineItemsMap[item.row_id] = [];
          }
          lineItemsMap[item.row_id].push(item);
        });
        setCustomRowLineItems(lineItemsMap);
      }
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

  function openLaborDialog(sheetId?: string, rowId?: string) {
    if (sheetId) {
      const existingLabor = sheetLabor[sheetId];
      setEditingLaborSheetId(sheetId);
      setEditingLaborRowId(null);
      
      if (existingLabor) {
        setLaborForm({
          description: existingLabor.description,
          estimated_hours: existingLabor.estimated_hours,
          hourly_rate: existingLabor.hourly_rate,
          notes: existingLabor.notes || '',
        });
      } else {
        setLaborForm({
          description: 'Labor & Installation',
          estimated_hours: 0,
          hourly_rate: 60,
          notes: '',
        });
      }
    } else if (rowId) {
      const existingLabor = customRowLabor[rowId];
      setEditingLaborRowId(rowId);
      setEditingLaborSheetId(null);
      
      if (existingLabor) {
        setLaborForm({
          description: existingLabor.description,
          estimated_hours: existingLabor.estimated_hours,
          hourly_rate: existingLabor.hourly_rate,
          notes: existingLabor.notes || '',
        });
      } else {
        setLaborForm({
          description: 'Labor & Installation',
          estimated_hours: 0,
          hourly_rate: 60,
          notes: '',
        });
      }
    }
    
    setShowLaborDialog(true);
  }

  async function saveSheetLabor() {
    if (editingLaborSheetId) {
      // Save material sheet labor
      const existingLabor = sheetLabor[editingLaborSheetId];
      const laborData = {
        sheet_id: editingLaborSheetId,
        description: laborForm.description,
        estimated_hours: laborForm.estimated_hours,
        hourly_rate: laborForm.hourly_rate,
        notes: laborForm.notes || null,
      };

      try {
        if (existingLabor) {
          const { error } = await supabase
            .from('material_sheet_labor')
            .update(laborData)
            .eq('id', existingLabor.id);

          if (error) throw error;
          toast.success('Labor updated');
        } else {
          const { error } = await supabase
            .from('material_sheet_labor')
            .insert([laborData]);

          if (error) throw error;
          toast.success('Labor added');
        }

        setShowLaborDialog(false);
        await loadMaterialsData();
      } catch (error: any) {
        console.error('Error saving labor:', error);
        toast.error('Failed to save labor');
      }
    } else if (editingLaborRowId) {
      // Save custom row labor (store in notes as JSON)
      try {
        const row = customRows.find(r => r.id === editingLaborRowId);
        if (!row) return;

        const laborData = {
          description: laborForm.description,
          estimated_hours: laborForm.estimated_hours,
          hourly_rate: laborForm.hourly_rate,
          notes: laborForm.notes || '',
        };

        const notesData = { labor: laborData };

        const { error } = await supabase
          .from('custom_financial_rows')
          .update({ notes: JSON.stringify(notesData) })
          .eq('id', editingLaborRowId);

        if (error) throw error;
        toast.success('Labor added');
        setShowLaborDialog(false);
        await loadCustomRows();
      } catch (error: any) {
        console.error('Error saving labor:', error);
        toast.error('Failed to save labor');
      }
    }
  }

  async function deleteSheetLabor(laborId: string) {
    if (!confirm('Delete labor for this section?')) return;

    try {
      const { error } = await supabase
        .from('material_sheet_labor')
        .delete()
        .eq('id', laborId);

      if (error) throw error;
      toast.success('Labor deleted');
      
      await loadMaterialsData();
    } catch (error: any) {
      console.error('Error deleting labor:', error);
      toast.error('Failed to delete labor');
    }
  }

  async function deleteCustomRowLabor(rowId: string) {
    if (!confirm('Delete labor for this row?')) return;

    try {
      const { error } = await supabase
        .from('custom_financial_rows')
        .update({ notes: null })
        .eq('id', rowId);

      if (error) throw error;
      toast.success('Labor deleted');
      await loadCustomRows();
    } catch (error: any) {
      console.error('Error deleting labor:', error);
      toast.error('Failed to delete labor');
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

  // Line item functions
  function openLineItemDialog(rowId: string, lineItem?: CustomRowLineItem) {
    setLineItemParentRowId(rowId);
    
    if (lineItem) {
      setEditingLineItem(lineItem);
      setLineItemForm({
        description: lineItem.description,
        quantity: lineItem.quantity.toString(),
        unit_cost: lineItem.unit_cost.toString(),
        notes: lineItem.notes || '',
      });
    } else {
      setEditingLineItem(null);
      setLineItemForm({
        description: '',
        quantity: '1',
        unit_cost: '0',
        notes: '',
      });
    }
    
    setShowLineItemDialog(true);
  }

  async function saveLineItem() {
    if (!lineItemParentRowId || !lineItemForm.description) {
      toast.error('Please fill in description');
      return;
    }

    const qty = parseFloat(lineItemForm.quantity) || 1;
    const cost = parseFloat(lineItemForm.unit_cost) || 0;
    const totalCost = qty * cost;

    const itemData = {
      row_id: lineItemParentRowId,
      description: lineItemForm.description,
      quantity: qty,
      unit_cost: cost,
      total_cost: totalCost,
      notes: lineItemForm.notes || null,
      order_index: editingLineItem 
        ? editingLineItem.order_index 
        : (customRowLineItems[lineItemParentRowId]?.length || 0),
    };

    try {
      if (editingLineItem) {
        const { error } = await supabase
          .from('custom_financial_row_items')
          .update(itemData)
          .eq('id', editingLineItem.id);

        if (error) throw error;
        toast.success('Line item updated');
      } else {
        const { error } = await supabase
          .from('custom_financial_row_items')
          .insert([itemData]);

        if (error) throw error;
        toast.success('Line item added');
      }

      setShowLineItemDialog(false);
      setEditingLineItem(null);
      setLineItemParentRowId(null);
      await loadCustomRows();
    } catch (error: any) {
      console.error('Error saving line item:', error);
      toast.error('Failed to save line item');
    }
  }

  async function deleteLineItem(id: string) {
    if (!confirm('Delete this line item?')) return;

    try {
      const { error } = await supabase
        .from('custom_financial_row_items')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('Line item deleted');
      await loadCustomRows();
    } catch (error: any) {
      console.error('Error deleting line item:', error);
      toast.error('Failed to delete line item');
    }
  }

  // Calculate custom row total from line items (if any) or from quantity * unit_cost
  function getCustomRowTotal(row: CustomFinancialRow): number {
    const lineItems = customRowLineItems[row.id] || [];
    if (lineItems.length > 0) {
      // If has line items, sum their totals
      const itemsTotal = lineItems.reduce((sum, item) => sum + item.total_cost, 0);
      return itemsTotal * (1 + row.markup_percent / 100);
    } else {
      // Otherwise use the row's own selling price
      return row.selling_price;
    }
  }

  // Filter labor rows and calculate total labor hours
  const laborRows = customRows.filter(r => r.category === 'labor');
  const totalLaborHours = laborRows.reduce((sum, r) => sum + r.quantity, 0);
  
  // Sort all rows by order_index for proper display order
  const sortedCustomRows = [...customRows].sort((a, b) => a.order_index - b.order_index);
  
  // Calculate totals (using line items where applicable)
  const grandTotalCost = customRows.reduce((sum, row) => {
    const lineItems = customRowLineItems[row.id] || [];
    if (lineItems.length > 0) {
      return sum + lineItems.reduce((itemSum, item) => itemSum + item.total_cost, 0);
    }
    return sum + row.total_cost;
  }, 0);

  const grandTotalPrice = customRows.reduce((sum, row) => {
    return sum + getCustomRowTotal(row);
  }, 0);

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

  // Proposal calculations with individual markups and tax
  const TAX_RATE = 0.07; // 7% tax
  
  // Materials: calculate with individual sheet markups
  const proposalMaterialsCost = materialsBreakdown.totals.totalPrice;
  const proposalMaterialsPrice = materialsBreakdown.sheetBreakdowns.reduce((sum, sheet) => {
    const sheetCost = sheet.totalPrice;
    const sheetMarkup = sheetMarkups[sheet.sheetId] || 10;
    return sum + (sheetCost * (1 + sheetMarkup / 100));
  }, 0);
  
  // Separate custom rows into taxable and non-taxable (using calculated totals)
  const taxableRows = customRows.filter(r => r.taxable);
  const nonTaxableRows = customRows.filter(r => !r.taxable);
  
  const taxableAdditionalCost = taxableRows.reduce((sum, r) => {
    const lineItems = customRowLineItems[r.id] || [];
    if (lineItems.length > 0) {
      const itemsTotal = lineItems.reduce((itemSum, item) => itemSum + item.total_cost, 0);
      return sum + itemsTotal;
    }
    return sum + r.total_cost;
  }, 0);
  const taxableAdditionalPrice = taxableRows.reduce((sum, r) => {
    const lineItems = customRowLineItems[r.id] || [];
    const baseCost = lineItems.length > 0 
      ? lineItems.reduce((itemSum, item) => itemSum + item.total_cost, 0)
      : r.total_cost;
    return sum + (baseCost * (1 + r.markup_percent / 100));
  }, 0);
  
  const nonTaxableAdditionalCost = nonTaxableRows.reduce((sum, r) => {
    const lineItems = customRowLineItems[r.id] || [];
    if (lineItems.length > 0) {
      const itemsTotal = lineItems.reduce((itemSum, item) => itemSum + item.total_cost, 0);
      return sum + itemsTotal;
    }
    return sum + r.total_cost;
  }, 0);
  const nonTaxableAdditionalPrice = nonTaxableRows.reduce((sum, r) => {
    const lineItems = customRowLineItems[r.id] || [];
    const baseCost = lineItems.length > 0 
      ? lineItems.reduce((itemSum, item) => itemSum + item.total_cost, 0)
      : r.total_cost;
    return sum + (baseCost * (1 + r.markup_percent / 100));
  }, 0);
  
  // Labor from sheet labor (no markup, no tax) - calculate total from all sheet labor
  const totalSheetLaborCost = materialsBreakdown.sheetBreakdowns.reduce((sum, sheet) => {
    const labor = sheetLabor[sheet.sheetId];
    return sum + (labor ? labor.total_labor_cost : 0);
  }, 0);
  
  // Labor from custom rows (no markup, no tax)
  const totalCustomRowLaborCost = Object.values(customRowLabor).reduce((sum: number, labor: any) => {
    return sum + (labor.estimated_hours * labor.hourly_rate);
  }, 0);
  
  const proposalLaborCost = totalSheetLaborCost + totalCustomRowLaborCost;
  const proposalLaborPrice = totalSheetLaborCost + totalCustomRowLaborCost;
  
  // Subcontractor estimates (with their individual markups, taxable)
  const subcontractorBaseCost = subcontractorEstimates.reduce((sum, est) => {
    return sum + (est.total_amount || 0);
  }, 0);
  const proposalSubcontractorPrice = subcontractorEstimates.reduce((sum, est) => {
    const baseAmount = est.total_amount || 0;
    const estMarkup = est.markup_percent || 0;
    return sum + (baseAmount * (1 + estMarkup / 100));
  }, 0);
  
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
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="cost-breakdown">Cost Breakdown</TabsTrigger>
          <TabsTrigger value="proposal">Proposal</TabsTrigger>
        </TabsList>

        {/* Cost Breakdown Tab - Materials Only */}
        <TabsContent value="cost-breakdown">
          <div className="max-w-6xl mx-auto space-y-6">
            {/* Summary Card - Materials Only */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg font-medium flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-blue-600" />
                  Materials Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-6">
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Total Cost</p>
                    <p className="text-2xl font-semibold">${materialsBreakdown.totals.totalCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Total Price</p>
                    <p className="text-2xl font-bold text-blue-600">${materialsBreakdown.totals.totalPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Profit</p>
                    <p className="text-2xl font-bold text-green-600">${materialsBreakdown.totals.totalProfit.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                    <p className="text-xs text-muted-foreground">Margin: {materialsBreakdown.totals.profitMargin.toFixed(1)}%</p>
                  </div>
                </div>
              </CardContent>
            </Card>

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

            {/* Add Row Controls */}
            <div className="flex gap-2 mb-4">
              <Button onClick={() => openAddDialog()} variant="outline" size="sm">
                <Plus className="w-4 h-4 mr-2" />
                Add Row
              </Button>
              <Button onClick={() => setShowSubUploadDialog(true)} variant="outline" size="sm">
                <Upload className="w-4 h-4 mr-2" />
                Upload Subcontractor Estimate
              </Button>
            </div>

            {/* Proposal Layout: Content on left, Project Total on right */}
            <div className="flex gap-6 items-start">
              {/* All Rows Column - Mixed materials, custom rows, and subcontractor estimates */}
              <div className="flex-1 space-y-3">
                {/* Create unified list of all items sorted by order_index */}
                {(() => {
                  const allItems = [
                    ...materialsBreakdown.sheetBreakdowns.map(sheet => ({
                      type: 'material' as const,
                      id: sheet.sheetId,
                      orderIndex: sheet.orderIndex,
                      data: sheet,
                    })),
                    ...customRows.map(row => ({
                      type: 'custom' as const,
                      id: row.id,
                      orderIndex: row.order_index,
                      data: row,
                    })),
                    ...subcontractorEstimates.map(est => ({
                      type: 'subcontractor' as const,
                      id: est.id,
                      orderIndex: est.order_index,
                      data: est,
                    })),
                  ].sort((a, b) => a.orderIndex - b.orderIndex);

                  return allItems.map((item) => {
                    if (item.type === 'material') {
                      const sheet = item.data as typeof materialsBreakdown.sheetBreakdowns[0];
                      const sheetCost = sheet.totalPrice;
                      const sheetMarkup = sheetMarkups[sheet.sheetId] || 10;
                      const sheetPrice = sheetCost * (1 + sheetMarkup / 100);

                      return (
                        <div key={item.id}>
                          <Collapsible defaultOpen={false}>
                            <div className="border-2 border-slate-300 rounded-lg overflow-hidden bg-white cursor-move mb-2">
                              <CollapsibleTrigger className="w-full">
                                <div className="bg-slate-50 hover:bg-slate-100 transition-colors p-3 flex items-center gap-2 border-b">
                                  {/* Left: Chevron + Title - FIXED WIDTH */}
                                  <div className="flex items-center gap-2" style={{ width: '280px', minWidth: '280px' }}>
                                    <ChevronDown className="w-5 h-5 text-slate-700 flex-shrink-0" />
                                    <div className="flex-1 min-w-0">
                                      <h3 className="text-lg font-bold text-slate-900 truncate">{sheet.sheetName}</h3>
                                      {sheetLabor[sheet.sheetId] && (
                                        <p className="text-sm text-amber-700 font-semibold">Labor</p>
                                      )}
                                    </div>
                                  </div>

                                  {/* Middle: Description */}
                                  <div className="flex-1 min-w-0 px-4">
                                    <p className="text-sm text-slate-600 italic">
                                      {sheet.sheetDescription || '(No description provided)'}
                                    </p>
                                  </div>

                                  {/* Right: Markup + Pricing + Actions */}
                                  <div className="flex items-center gap-3" style={{ minWidth: '420px' }}>
                                    {/* Editable Markup */}
                                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                      <Input
                                        type="number"
                                        min="0"
                                        step="0.1"
                                        value={sheetMarkup}
                                        onChange={(e) => {
                                          const newMarkup = parseFloat(e.target.value) || 0;
                                          setSheetMarkups(prev => ({ ...prev, [sheet.sheetId]: newMarkup }));
                                        }}
                                        className="w-16 h-8 text-sm text-center"
                                      />
                                      <span className="text-xs font-semibold text-green-700">%</span>
                                    </div>
                                    
                                    <div className="text-right flex-1">
                                      <div className="flex items-center justify-end gap-2 mb-1">
                                        <p className="text-xs text-slate-600">Base: ${sheetCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                                      </div>
                                      <p className="text-2xl font-bold text-slate-900">${sheetPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                                      {sheetLabor[sheet.sheetId] && (
                                        <p className="text-sm text-amber-700 font-semibold mt-1">
                                          ${sheetLabor[sheet.sheetId].total_labor_cost.toFixed(2)}
                                        </p>
                                      )}
                                    </div>
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                        <Button size="sm" variant="ghost">
                                          <MoreVertical className="w-4 h-4" />
                                        </Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="end">
                                        <DropdownMenuItem
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            openLaborDialog(sheet.sheetId);
                                          }}
                                        >
                                          <Clock className="w-4 h-4 mr-2" />
                                          {sheetLabor[sheet.sheetId] ? 'Edit Labor' : 'Add Labor'}
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            openSheetDescDialog(sheet.sheetId, sheet.sheetDescription);
                                          }}
                                        >
                                          <Edit className="w-4 h-4 mr-2" />
                                          Edit Description
                                        </DropdownMenuItem>
                                      </DropdownMenuContent>
                                    </DropdownMenu>
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
                        </div>
                      );
                    } else if (item.type === 'subcontractor') {
                      // Subcontractor estimate row with detailed breakdown
                      const est = item.data as any;
                      const lineItems = subcontractorLineItems[est.id] || [];
                      const estCost = est.total_amount || 0;
                      const estMarkup = est.markup_percent || 0;
                      const finalPrice = estCost * (1 + estMarkup / 100);

                      // Group line items by category
                      const itemsByCategory = lineItems.reduce((acc: Record<string, any[]>, item: any) => {
                        // Infer category from description (Materials, Labor, etc.)
                        let category = 'Items';
                        const desc = item.description.toLowerCase();
                        if (desc.includes('material') || desc.includes('fixture') || desc.includes('parts')) {
                          category = 'Materials';
                        } else if (desc.includes('labor') || desc.includes('install')) {
                          category = 'Labor';
                        }
                        
                        if (!acc[category]) acc[category] = [];
                        acc[category].push(item);
                        return acc;
                      }, {});

                      // Count excluded items
                      const excludedCount = lineItems.filter((item: any) => item.excluded).length;
                      const includedTotal = lineItems
                        .filter((item: any) => !item.excluded)
                        .reduce((sum: number, item: any) => sum + (item.total_price || 0), 0);

                      return (
                        <div key={item.id}>
                          <Collapsible defaultOpen={false}>
                            <div className="border-2 border-slate-300 rounded-lg overflow-hidden bg-white cursor-move mb-2">
                              <CollapsibleTrigger className="w-full">
                                <div className="bg-slate-50 hover:bg-slate-100 transition-colors p-3 flex items-center gap-2 border-b">
                                  {/* Left: Chevron + Title - FIXED WIDTH */}
                                  <div className="flex items-center gap-2" style={{ width: '280px', minWidth: '280px' }}>
                                    <ChevronDown className="w-5 h-5 text-slate-700 flex-shrink-0" />
                                    <div className="flex-1 min-w-0">
                                      <h3 className="text-lg font-bold text-slate-900 truncate">{est.company_name || 'Subcontractor'}</h3>
                                    </div>
                                  </div>

                                  {/* Middle: Description/Notes */}
                                  <div className="flex-1 min-w-0 px-4">
                                    <p className="text-sm text-slate-600 italic">
                                      {est.scope_of_work || '(No description provided)'}
                                    </p>
                                  </div>

                                  {/* Right: Markup + Pricing */}
                                  <div className="flex items-center gap-3" style={{ minWidth: '420px' }}>
                                    {/* Editable Markup */}
                                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                      <Input
                                        type="number"
                                        min="0"
                                        step="0.1"
                                        value={estMarkup}
                                        onChange={async (e) => {
                                          const newMarkup = parseFloat(e.target.value) || 0;
                                          try {
                                            const { error } = await supabase
                                              .from('subcontractor_estimates')
                                              .update({ markup_percent: newMarkup })
                                              .eq('id', est.id);
                                            
                                            if (error) throw error;
                                            await loadSubcontractorEstimates();
                                          } catch (error: any) {
                                            console.error('Error updating markup:', error);
                                            toast.error('Failed to update markup');
                                          }
                                        }}
                                        className="w-16 h-8 text-sm text-center"
                                      />
                                      <span className="text-xs font-semibold text-green-700">%</span>
                                    </div>
                                    
                                    <div className="text-right flex-1">
                                      <p className="text-xs text-slate-600">Base: ${estCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                                      <p className="text-2xl font-bold text-slate-900">${finalPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                                    </div>
                                  </div>
                                </div>
                              </CollapsibleTrigger>
                              
                              <CollapsibleContent>
                                <div className="p-4 space-y-4">
                                  {/* Line Items by Category */}
                                  {Object.entries(itemsByCategory).map(([category, items]: [string, any]) => (
                                    <div key={category} className="space-y-2">
                                      <div className="flex items-center gap-2 mb-2">
                                        <Briefcase className="w-4 h-4 text-slate-700" />
                                        <h4 className="font-semibold text-slate-900">{category}</h4>
                                        <Badge variant="outline" className="bg-slate-100 text-slate-700">
                                          {items.length} item{items.length > 1 ? 's' : ''}
                                        </Badge>
                                        {items.some((item: any) => !item.excluded) && (
                                          <Badge variant="outline" className="bg-green-50 border-green-300 text-green-800">
                                            {items.filter((item: any) => !item.excluded).length} included
                                          </Badge>
                                        )}
                                      </div>
                                      <div className="space-y-1">
                                        {items.map((lineItem: any) => (
                                          <div
                                            key={lineItem.id}
                                            className={`flex items-start justify-between py-2 px-3 rounded ${
                                              lineItem.excluded ? 'bg-slate-100 line-through text-slate-500' : 'bg-white'
                                            }`}
                                          >
                                            <div className="flex items-start gap-2 flex-1">
                                              <input
                                                type="checkbox"
                                                checked={!lineItem.excluded}
                                                readOnly
                                                className="mt-1 w-4 h-4 rounded border-slate-300"
                                              />
                                              <p className="text-sm">{lineItem.description}</p>
                                            </div>
                                            <p className={`text-sm font-semibold ${lineItem.excluded ? 'text-slate-500' : 'text-slate-900'}`}>
                                              ${lineItem.total_price.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                            </p>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  ))}

                                  {/* Exclusions */}
                                  {est.exclusions && (
                                    <div className="border-t pt-4">
                                      <h4 className="font-semibold text-slate-900 mb-2">Exclusions</h4>
                                      <p className="text-sm text-slate-600">{est.exclusions}</p>
                                    </div>
                                  )}
                                </div>
                              </CollapsibleContent>
                            </div>
                          </Collapsible>
                        </div>
                      );
                    } else {
                      // Custom row (labor, materials, equipment, etc.) - NOW WITH LINE ITEMS
                      const row = item.data as CustomFinancialRow;
                      const lineItems = customRowLineItems[row.id] || [];
                      const hasLineItems = lineItems.length > 0;
                      
                      // Calculate total from line items or use row total
                      const baseCost = hasLineItems 
                        ? lineItems.reduce((sum, item) => sum + item.total_cost, 0)
                        : row.total_cost;
                      const rowPrice = baseCost * (1 + row.markup_percent / 100);
                      const rowLabor = customRowLabor[row.id];

                      return (
                        <div key={item.id}>
                          <Collapsible defaultOpen={false}>
                            <div className="border-2 border-slate-300 rounded-lg overflow-hidden bg-white mb-2">
                              <CollapsibleTrigger className="w-full">
                                <div className="bg-slate-50 hover:bg-slate-100 transition-colors p-3 flex items-center gap-2 border-b">
                                  {/* Left: Chevron + Title - FIXED WIDTH */}
                                  <div className="flex items-center gap-2" style={{ width: '280px', minWidth: '280px' }}>
                                    <ChevronDown className="w-5 h-5 text-slate-700 flex-shrink-0" />
                                    <div className="flex-1 min-w-0">
                                      <h3 className="text-lg font-bold text-slate-900 truncate">{row.description}</h3>
                                      {hasLineItems && (
                                        <p className="text-xs text-slate-600">{lineItems.length} item{lineItems.length > 1 ? 's' : ''}</p>
                                      )}
                                      {rowLabor && (
                                        <p className="text-sm text-amber-700 font-semibold">Labor</p>
                                      )}
                                    </div>
                                  </div>

                                  {/* Middle: Description/Notes */}
                                  <div className="flex-1 min-w-0 px-4">
                                    <p className="text-sm text-slate-600 italic">
                                      {row.notes && !rowLabor ? row.notes : '(No description provided)'}
                                    </p>
                                  </div>

                                  {/* Right: Markup + Pricing + Actions */}
                                  <div className="flex items-center gap-3" style={{ minWidth: '420px' }}>
                                    {/* Editable Markup */}
                                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                      <Input
                                        type="number"
                                        min="0"
                                        step="0.1"
                                        value={row.markup_percent}
                                        onChange={async (e) => {
                                          const newMarkup = parseFloat(e.target.value) || 0;
                                          try {
                                            const { error } = await supabase
                                              .from('custom_financial_rows')
                                              .update({ markup_percent: newMarkup })
                                              .eq('id', row.id);
                                            
                                            if (error) throw error;
                                            await loadCustomRows();
                                          } catch (error: any) {
                                            console.error('Error updating markup:', error);
                                            toast.error('Failed to update markup');
                                          }
                                        }}
                                        className="w-16 h-8 text-sm text-center"
                                      />
                                      <span className="text-xs font-semibold text-green-700">%</span>
                                    </div>
                                    
                                    <div className="text-right flex-1">
                                      <div className="flex items-center justify-end gap-2 mb-1">
                                        <p className="text-xs text-slate-600">Base: ${baseCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                                      </div>
                                      <p className="text-2xl font-bold text-slate-900">${rowPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                                      {rowLabor && (
                                        <p className="text-sm text-amber-700 font-semibold mt-1">
                                          ${(rowLabor.estimated_hours * rowLabor.hourly_rate).toFixed(2)}
                                        </p>
                                      )}
                                    </div>
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                        <Button size="sm" variant="ghost">
                                          <MoreVertical className="w-4 h-4" />
                                        </Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="end">
                                        <DropdownMenuItem
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            openLineItemDialog(row.id);
                                          }}
                                        >
                                          <List className="w-4 h-4 mr-2" />
                                          Add Line Item
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            openLaborDialog(undefined, row.id);
                                          }}
                                        >
                                          <Clock className="w-4 h-4 mr-2" />
                                          {rowLabor ? 'Edit Labor' : 'Add Labor'}
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            openAddDialog(row);
                                          }}
                                        >
                                          <Edit className="w-4 h-4 mr-2" />
                                          Edit Row
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            deleteRow(row.id);
                                          }}
                                          className="text-destructive focus:text-destructive"
                                        >
                                          <Trash2 className="w-4 h-4 mr-2" />
                                          Delete Row
                                        </DropdownMenuItem>
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  </div>
                                </div>
                              </CollapsibleTrigger>
                              
                              {/* Line Items Content */}
                              <CollapsibleContent>
                                <div className="p-4">
                                  {hasLineItems ? (
                                    <div className="space-y-2">
                                      {lineItems.map((lineItem) => (
                                        <div key={lineItem.id} className="flex items-center justify-between py-2 px-3 bg-slate-50 rounded">
                                          <div className="flex-1">
                                            <p className="font-medium text-slate-900">{lineItem.description}</p>
                                            <p className="text-xs text-slate-600">
                                              {lineItem.quantity} × ${lineItem.unit_cost.toFixed(2)} = ${lineItem.total_cost.toFixed(2)}
                                            </p>
                                            {lineItem.notes && (
                                              <p className="text-xs text-slate-500 mt-1">{lineItem.notes}</p>
                                            )}
                                          </div>
                                          <div className="flex items-center gap-2">
                                            <p className="font-bold text-slate-900">${lineItem.total_cost.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                                            <Button
                                              size="sm"
                                              variant="ghost"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                openLineItemDialog(row.id, lineItem);
                                              }}
                                            >
                                              <Edit className="w-4 h-4" />
                                            </Button>
                                            <Button
                                              size="sm"
                                              variant="ghost"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                deleteLineItem(lineItem.id);
                                              }}
                                            >
                                              <Trash2 className="w-4 h-4 text-destructive" />
                                            </Button>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <div className="text-center py-4 text-sm text-muted-foreground">
                                      No line items. Click "Add Line Item" to add detailed breakdown.
                                    </div>
                                  )}
                                </div>
                              </CollapsibleContent>
                            </div>
                          </Collapsible>
                        </div>
                      );
                    }
                  });
                })()}
              </div>

              {/* Project Total Box - Sticky on Right Side */}
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
          </div>
        </TabsContent>
      </Tabs>

      {/* Subcontractor Upload Dialog */}
      <Dialog open={showSubUploadDialog} onOpenChange={setShowSubUploadDialog}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Upload Subcontractor Estimate</DialogTitle>
          </DialogHeader>
          <SubcontractorEstimatesManagement jobId={job.id} />
        </DialogContent>
      </Dialog>

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

      {/* Labor Dialog */}
      <Dialog open={showLaborDialog} onOpenChange={setShowLaborDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              {(editingLaborSheetId && sheetLabor[editingLaborSheetId]) || (editingLaborRowId && customRowLabor[editingLaborRowId]) ? 'Edit' : 'Add'} Labor
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Description</Label>
              <Input
                value={laborForm.description}
                onChange={(e) => setLaborForm({ ...laborForm, description: e.target.value })}
                placeholder="Labor & Installation"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Estimated Hours</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.5"
                  value={laborForm.estimated_hours}
                  onChange={(e) => setLaborForm({ ...laborForm, estimated_hours: parseFloat(e.target.value) || 0 })}
                  placeholder="40"
                />
              </div>
              <div>
                <Label>Hourly Rate ($)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={laborForm.hourly_rate}
                  onChange={(e) => setLaborForm({ ...laborForm, hourly_rate: parseFloat(e.target.value) || 60 })}
                  placeholder="60.00"
                />
              </div>
            </div>

            <div>
              <Label>Notes (Optional)</Label>
              <Textarea
                value={laborForm.notes}
                onChange={(e) => setLaborForm({ ...laborForm, notes: e.target.value })}
                placeholder="Additional notes about this labor..."
                rows={3}
              />
            </div>

            {/* Preview */}
            {laborForm.estimated_hours > 0 && laborForm.hourly_rate > 0 && (
              <div className="bg-amber-50 border border-amber-300 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Labor Cost</p>
                    <p className="text-2xl font-bold text-amber-700">
                      ${(laborForm.estimated_hours * laborForm.hourly_rate).toFixed(2)}
                    </p>
                  </div>
                  <DollarSign className="w-8 h-8 text-amber-500" />
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-4 border-t">
              {editingLaborSheetId && sheetLabor[editingLaborSheetId] && (
                <Button
                  variant="outline"
                  className="text-destructive"
                  onClick={() => {
                    deleteSheetLabor(sheetLabor[editingLaborSheetId].id);
                    setShowLaborDialog(false);
                  }}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete
                </Button>
              )}
              {editingLaborRowId && customRowLabor[editingLaborRowId] && (
                <Button
                  variant="outline"
                  className="text-destructive"
                  onClick={() => {
                    deleteCustomRowLabor(editingLaborRowId);
                    setShowLaborDialog(false);
                  }}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete
                </Button>
              )}
              <Button onClick={saveSheetLabor} className="flex-1">
                {(editingLaborSheetId && sheetLabor[editingLaborSheetId]) || (editingLaborRowId && customRowLabor[editingLaborRowId]) ? 'Update' : 'Add'} Labor
              </Button>
              <Button variant="outline" onClick={() => setShowLaborDialog(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Line Item Dialog */}
      <Dialog open={showLineItemDialog} onOpenChange={setShowLineItemDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingLineItem ? 'Edit' : 'Add'} Line Item</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Description *</Label>
              <Input
                value={lineItemForm.description}
                onChange={(e) => setLineItemForm({ ...lineItemForm, description: e.target.value })}
                placeholder="e.g., Excavator rental, Skid steer..."
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Quantity</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={lineItemForm.quantity}
                  onChange={(e) => setLineItemForm({ ...lineItemForm, quantity: e.target.value })}
                />
              </div>
              <div>
                <Label>Unit Cost ($)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={lineItemForm.unit_cost}
                  onChange={(e) => setLineItemForm({ ...lineItemForm, unit_cost: e.target.value })}
                  placeholder="0.00"
                />
              </div>
            </div>

            <div>
              <Label>Notes (Optional)</Label>
              <Textarea
                value={lineItemForm.notes}
                onChange={(e) => setLineItemForm({ ...lineItemForm, notes: e.target.value })}
                placeholder="Additional notes about this item..."
                rows={3}
              />
            </div>

            {/* Preview */}
            {lineItemForm.unit_cost && (
              <div className="bg-slate-50 p-4 rounded-lg border">
                <div className="flex justify-between text-sm">
                  <span>Total Cost:</span>
                  <span className="font-bold text-blue-600">
                    ${((parseFloat(lineItemForm.quantity) || 1) * (parseFloat(lineItemForm.unit_cost) || 0)).toFixed(2)}
                  </span>
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-4 border-t">
              <Button onClick={saveLineItem} className="flex-1">
                {editingLineItem ? 'Update' : 'Add'} Line Item
              </Button>
              <Button variant="outline" onClick={() => setShowLineItemDialog(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Row Dialog */}
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
                placeholder={category === 'labor' ? 'e.g., Labor & Installation' : 'e.g., Equipment, Materials...'}
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
