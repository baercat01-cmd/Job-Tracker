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
import { Plus, Trash2, DollarSign, Clock, TrendingUp, Percent, Calculator, FileSpreadsheet } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { Badge } from '@/components/ui/badge';
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
  
  // Labor stats
  const [totalClockInHours, setTotalClockInHours] = useState(0);
  const [estimatedHours, setEstimatedHours] = useState(job.estimated_hours || 0);

  // Form state for custom rows
  const [category, setCategory] = useState('subcontractor');
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unitCost, setUnitCost] = useState('');
  const [markupPercent, setMarkupPercent] = useState('0');
  const [notes, setNotes] = useState('');

  // Form state for labor pricing
  const [hourlyRate, setHourlyRate] = useState('60');
  
  // File upload state
  const [uploadingFiles, setUploadingFiles] = useState<Record<string, boolean>>({});
  const [categoryFiles, setCategoryFiles] = useState<Record<string, string[]>>({});

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
      ]);
    } catch (error) {
      console.error('Error loading financial data:', error);
      toast.error('Failed to load financial data');
    } finally {
      setLoading(false);
    }
  }

  async function loadCustomRows() {
    const { data, error } = await supabase
      .from('custom_financial_rows')
      .select('*')
      .eq('job_id', job.id)
      .order('category')
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

  function openAddDialog(row?: CustomFinancialRow) {
    if (row) {
      setEditingRow(row);
      setCategory(row.category);
      setDescription(row.description);
      setQuantity(row.quantity.toString());
      setUnitCost(row.unit_cost.toString());
      setMarkupPercent(row.markup_percent.toString());
      setNotes(row.notes || '');
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
    setUnitCost('');
    setMarkupPercent('0');
    setNotes('');
  }

  async function saveCustomRow() {
    if (!description || !unitCost) {
      toast.error('Please fill in description and unit cost');
      return;
    }

    const qty = parseFloat(quantity) || 1;
    const cost = parseFloat(unitCost) || 0;
    const markup = parseFloat(markupPercent) || 0;
    const totalCost = qty * cost;
    const sellingPrice = totalCost * (1 + markup / 100);

    // Calculate next order_index - always add at the bottom
    const maxOrderIndex = customRows.length > 0 
      ? Math.max(...customRows.map(r => r.order_index))
      : -1;

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
      order_index: editingRow ? editingRow.order_index : maxOrderIndex + 1,
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
        toast.success('Row added');
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
  async function handleFileUpload(category: string, files: FileList) {
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
      
      setCategoryFiles(prev => ({
        ...prev,
        [category]: [...(prev[category] || []), ...urls],
      }));

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

  function handleDrop(category: string, e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFileUpload(category, files);
    }
  }

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

  // Labor calculations (no markup)
  const laborRate = parseFloat(hourlyRate) || 60;
  const billableRate = laborRate;
  const laborCost = totalClockInHours * laborRate;
  const laborPrice = totalClockInHours * billableRate;
  const laborProfit = 0;

  // Overall totals
  const totalCost = grandTotalCost + laborCost;
  const totalPrice = grandTotalPrice + laborPrice;
  const totalProfit = totalPrice - totalCost;
  const profitMargin = totalPrice > 0 ? (totalProfit / totalPrice) * 100 : 0;

  // Progress calculations
  const progressPercent = estimatedHours > 0 ? Math.min((totalClockInHours / estimatedHours) * 100, 100) : 0;
  const isOverBudget = totalClockInHours > estimatedHours && estimatedHours > 0;

  const categoryLabels: Record<string, string> = {
    subcontractor: 'Subcontractors',
    materials: 'Additional Materials',
    equipment: 'Equipment',
    other: 'Other Costs',
  };

  const categoryDescriptions: Record<string, string> = {
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
    <div className="space-y-4">
      {/* Labor Pricing & Hours Section */}
      <Card className="border-2 border-blue-200">
        <CardHeader className="bg-gradient-to-r from-blue-50 to-blue-100">
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-blue-700" />
            Labor Pricing & Hours
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6 space-y-4">
          {/* Labor Rate Configuration */}
          <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 rounded-lg border">
            <div>
              <Label>Hourly Labor Rate ($)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={hourlyRate}
                onChange={(e) => setHourlyRate(e.target.value)}
                onBlur={saveLaborPricing}
              />
            </div>
            <div>
              <Label>Billable Rate ($/hr)</Label>
              <div className="h-10 flex items-center font-bold text-lg text-blue-700">
                ${billableRate.toFixed(2)}
              </div>
            </div>
          </div>

          {/* Hours Progress */}
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="p-4 bg-primary/5 rounded-lg border">
              <div className="text-3xl font-bold text-primary">{estimatedHours.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground mt-1 uppercase tracking-wide">Estimated Hours</p>
            </div>
            <div className="p-4 bg-muted/50 rounded-lg border">
              <div className="text-3xl font-bold">{totalClockInHours.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground mt-1 uppercase tracking-wide">Clock-In Hours</p>
            </div>
            <div className={`p-4 rounded-lg border ${
              isOverBudget 
                ? 'bg-destructive/10 border-destructive/30' 
                : 'bg-success/10 border-success/30'
            }`}>
              <div className={`text-3xl font-bold ${
                isOverBudget ? 'text-destructive' : 'text-success'
              }`}>
                {isOverBudget ? '+' : ''}{(totalClockInHours - estimatedHours).toFixed(2)}
              </div>
              <p className="text-xs text-muted-foreground mt-1 uppercase tracking-wide">
                {isOverBudget ? 'Over Budget' : 'Remaining'}
              </p>
            </div>
          </div>

          {/* Labor Financial Summary */}
          <div className="grid grid-cols-2 gap-4 p-4 bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg border-2 border-green-200">
            <div className="text-center">
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Labor Cost</p>
              <p className="text-2xl font-bold">${laborCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
              <p className="text-xs text-muted-foreground">{totalClockInHours.toFixed(2)} hrs × ${laborRate.toFixed(2)}/hr</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Total Labor Billing</p>
              <p className="text-2xl font-bold text-blue-600">${laborPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
              <p className="text-xs text-muted-foreground">Direct rate, no markup</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Custom Financial Rows */}
      <Card className="border-2 border-slate-200">
        <CardHeader className="bg-gradient-to-r from-slate-50 to-slate-100 flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Calculator className="w-5 h-5 text-slate-700" />
            Additional Costs
          </CardTitle>
          <Button onClick={() => openAddDialog()} size="sm">
            <Plus className="w-4 h-4 mr-2" />
            Add Row
          </Button>
        </CardHeader>
        <CardContent className="pt-6">
          {customRows.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <DollarSign className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>No additional costs added yet</p>
              <Button onClick={() => openAddDialog()} variant="outline" className="mt-4">
                <Plus className="w-4 h-4 mr-2" />
                Add First Row
              </Button>
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(groupedRows).map(([cat, rows]) => {
                const hasMultipleItems = rows.length > 1;
                
                return (
                  <div 
                    key={cat} 
                    className="border-2 rounded-lg overflow-hidden"
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(cat, e)}
                  >
                    <div className="bg-gradient-to-r from-slate-100 to-slate-50 px-4 py-3 border-b-2">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="font-bold text-lg text-slate-900 mb-1">
                            {categoryLabels[cat] || cat}
                          </h3>
                          <p className="text-sm text-slate-600">
                            {categoryDescriptions[cat] || 'Custom costs for this category'}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="file"
                            multiple
                            onChange={(e) => e.target.files && handleFileUpload(cat, e.target.files)}
                            className="hidden"
                            id={`file-upload-${cat}`}
                          />
                          <label htmlFor={`file-upload-${cat}`}>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="cursor-pointer"
                              asChild
                            >
                              <span>
                                {uploadingFiles[cat] ? (
                                  <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin mr-2" />
                                ) : (
                                  <Plus className="w-4 h-4 mr-2" />
                                )}
                                Attach Files
                              </span>
                            </Button>
                          </label>
                          <Badge variant="secondary">{rows.length} items</Badge>
                        </div>
                      </div>
                      {categoryFiles[cat] && categoryFiles[cat].length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {categoryFiles[cat].map((url, idx) => (
                            <a
                              key={idx}
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                            >
                              <FileSpreadsheet className="w-3 h-3" />
                              File {idx + 1}
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className={hasMultipleItems ? "divide-y" : ""}>
                      {rows.map((row) => (
                        <div key={row.id} className="p-4 hover:bg-slate-50 transition-colors">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="font-medium text-slate-900">{row.description}</div>
                              {row.notes && (
                                <div className="text-sm text-muted-foreground mt-1">{row.notes}</div>
                              )}
                              <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                                <span>Qty: {row.quantity}</span>
                                <span>Unit Cost: ${row.unit_cost.toFixed(2)}</span>
                                <span>Markup: {row.markup_percent.toFixed(1)}%</span>
                              </div>
                            </div>
                            <div className="text-right ml-4">
                              <div className="font-bold text-lg text-slate-900">
                                ${row.selling_price.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                              </div>
                              <div className="text-sm text-muted-foreground">
                                Cost: ${row.total_cost.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                              </div>
                              <div className="flex gap-2 mt-2 justify-end">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => openAddDialog(row)}
                                >
                                  Edit
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
                      ))}
                    </div>
                    <div className="bg-slate-50 px-4 py-2 text-center text-sm text-muted-foreground border-t">
                      Drag and drop files here to attach to this category
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Grand Total Summary */}
      <Card className="border-2 border-slate-900">
        <CardHeader className="bg-gradient-to-r from-slate-900 to-slate-800 text-white">
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Financial Summary
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="space-y-4">
            {/* Category Breakdown */}
            <div className="space-y-2">
              <div className="flex items-center justify-between py-2 border-b font-semibold">
                <span>Labor ({totalClockInHours.toFixed(2)} hrs)</span>
                <div className="flex items-center gap-6">
                  <span className="text-muted-foreground">${laborCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  <span className="min-w-[120px] text-right">${laborPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
              {categoryTotals.map((ct) => (
                <div key={ct.category} className="flex items-center justify-between py-2 border-b">
                  <span>{categoryLabels[ct.category] || ct.category}</span>
                  <div className="flex items-center gap-6">
                    <span className="text-muted-foreground">${ct.totalCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                    <span className="min-w-[120px] text-right">${ct.totalPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Grand Totals */}
            <div className="grid grid-cols-4 gap-4 p-4 bg-gradient-to-r from-slate-900 to-slate-800 text-white rounded-lg mt-6">
              <div className="text-center">
                <p className="text-xs uppercase tracking-wide mb-1 opacity-80">Total Cost</p>
                <p className="text-2xl font-bold">${totalCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
              </div>
              <div className="text-center">
                <p className="text-xs uppercase tracking-wide mb-1 opacity-80">Total Price</p>
                <p className="text-2xl font-bold">${totalPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
              </div>
              <div className="text-center">
                <p className="text-xs uppercase tracking-wide mb-1 opacity-80">Total Profit</p>
                <p className="text-2xl font-bold text-yellow-400">${totalProfit.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
              </div>
              <div className="text-center">
                <p className="text-xs uppercase tracking-wide mb-1 opacity-80">Profit Margin</p>
                <div className="flex items-center justify-center gap-2">
                  <Percent className="w-5 h-5 text-green-400" />
                  <p className="text-2xl font-bold text-green-400">{profitMargin.toFixed(1)}%</p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

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
                placeholder="e.g., Electrician, Concrete pour, Crane rental..."
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Quantity</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </div>
              <div>
                <Label>Unit Cost ($) *</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={unitCost}
                  onChange={(e) => setUnitCost(e.target.value)}
                  placeholder="0.00"
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
              <Label>Notes</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional notes..."
                rows={2}
              />
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
