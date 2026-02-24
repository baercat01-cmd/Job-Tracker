import { useState, useEffect, useRef } from 'react';
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
  DialogDescription,
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
import { Plus, Trash2, DollarSign, Clock, TrendingUp, Percent, Calculator, FileSpreadsheet, ChevronDown, Briefcase, Edit, Upload, MoreVertical, List, Eye, Check, X, GripVertical, Download, Lock, FileText, Settings } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { Badge } from '@/components/ui/badge';
import { SubcontractorEstimatesManagement } from './SubcontractorEstimatesManagement';
import { generateProposalHTML } from './ProposalPDFTemplate';
import { FloatingDocumentViewer } from './FloatingDocumentViewer';
import { ProposalTemplateEditor } from './ProposalTemplateEditor';
import { BulkMaterialMover } from './BulkMaterialMover';
import type { Job } from '@/types';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

/** Safe number for totals (avoids NaN when data shape differs, e.g. historical snapshot) */
function toNum(x: any): number {
  if (x == null) return 0;
  const v = Number(x);
  return Number.isNaN(v) ? 0 : v;
}

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
  taxable: boolean;
  markup_percent?: number;
  item_type?: 'material' | 'labor';
  sheet_id?: string;
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

// Sortable Row Component
function SortableRow({ item, isReadOnly, ...props }: any) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const {
    sheetMarkups,
    setSheetMarkups,
    categoryMarkups,
    setCategoryMarkups,
    customRowLineItems,
    sheetLabor,
    customRowLabor,
    subcontractorLineItems,
    linkedSubcontractors,
    editingRowName,
    editingRowNameType,
    tempRowName,
    setTempRowName,
    startEditingRowName,
    saveRowName,
    cancelEditingRowName,
    openSheetDescDialog,
    openLaborDialog,
    openAddDialog,
    openLineItemDialog,
    openSubcontractorDialog,
    deleteRow,
    deleteSheetLabor,
    toggleSubcontractorLineItem,
    toggleSubcontractorLineItemTaxable,
    toggleSubcontractorLineItemType,
    unlinkSubcontractor,
    updateSubcontractorMarkup,
    updateCustomRowMarkup,
    deleteLineItem,
    loadMaterialsData,
    loadCustomRows,
    loadSubcontractorEstimates,
    customRows,
    savingMarkupsRef,
  } = props;

  const content = (() => {
    if (item.type === 'material') {
      const sheet = item.data;
      const linkedRows = customRows.filter((r: any) => r.sheet_id === sheet.sheetId);
      const linkedSubs = linkedSubcontractors[sheet.sheetId] || [];
      
      // Calculate linked rows total (with their own markup already applied)
      const linkedRowsTotal = linkedRows.reduce((rowSum: number, row: any) => {
        const lineItems = customRowLineItems[row.id] || [];
        const baseCost = lineItems.length > 0
          ? lineItems.reduce((itemSum: number, item: any) => itemSum + toNum(item.total_cost), 0)
          : toNum(row.total_cost);
        return rowSum + (baseCost * (1 + toNum(row.markup_percent) / 100));
      }, 0);
      
      const linkedSubsTaxableTotal = linkedSubs.reduce((sum: number, sub: any) => {
        const lineItems = subcontractorLineItems[sub.id] || [];
        const taxableTotal = lineItems
          .filter((item: any) => !item.excluded && item.taxable)
          .reduce((itemSum: number, item: any) => itemSum + toNum(item.total_price), 0);
        return sum + (taxableTotal * (1 + toNum(sub.markup_percent) / 100));
      }, 0);
      
      const linkedSubsNonTaxableTotal = linkedSubs.reduce((sum: number, sub: any) => {
        const lineItems = subcontractorLineItems[sub.id] || [];
        const nonTaxableTotal = lineItems
          .filter((item: any) => !item.excluded && !item.taxable)
          .reduce((itemSum: number, item: any) => itemSum + toNum(item.total_price), 0);
        return sum + (nonTaxableTotal * (1 + toNum(sub.markup_percent) / 100));
      }, 0);
      
      const sheetLaborTotal = sheetLabor[sheet.sheetId] ? toNum(sheetLabor[sheet.sheetId].total_labor_cost) : 0;
      const sheetLaborItems = customRowLineItems[sheet.sheetId]?.filter((item: any) => (item.item_type || 'material') === 'labor') || [];
      const sheetLaborLineItemsTotal = sheetLaborItems.reduce((sum: number, item: any) => sum + toNum(item.total_cost), 0);
      
      const categoryTotals = sheet.categories?.reduce((sum: number, cat: any) => {
        const categoryKey = `${sheet.sheetId}_${cat.name}`;
        const categoryMarkup = categoryMarkups[categoryKey] ?? 10;
        const categoryPriceWithMarkup = toNum(cat.totalCost) * (1 + categoryMarkup / 100);
        return sum + categoryPriceWithMarkup;
      }, 0) || 0;
      
      const sheetFinalPrice = categoryTotals + linkedRowsTotal + linkedSubsTaxableTotal;
      const totalLaborCost = sheetLaborTotal + sheetLaborLineItemsTotal + linkedSubsNonTaxableTotal;

      return (
        <Collapsible className="border rounded bg-white py-1 px-2">
          <div className="flex items-start gap-2">
            {/* Drag Handle */}
            <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing py-1">
              <GripVertical className="w-4 h-4 text-slate-400" />
            </div>

            {/* Chevron */}
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="p-0 h-auto hover:bg-transparent">
                <ChevronDown className="w-4 h-4 text-slate-600" />
              </Button>
            </CollapsibleTrigger>

            {/* Title */}
            <div className="flex-1 min-w-0">
              {editingRowName === sheet.sheetId && editingRowNameType === 'sheet' ? (
                <div className="flex items-center gap-1">
                  <Input
                    value={tempRowName}
                    onChange={(e) => setTempRowName(e.target.value)}
                    className="h-7 text-sm font-bold"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveRowName();
                      if (e.key === 'Escape') cancelEditingRowName();
                    }}
                  />
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={saveRowName}>
                    <Check className="w-3 h-3 text-green-600" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={cancelEditingRowName}>
                    <X className="w-3 h-3 text-red-600" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-slate-900 truncate">{sheet.sheetName}</h3>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 hover:bg-slate-100"
                    onClick={() => startEditingRowName(sheet.sheetId, 'sheet', sheet.sheetName)}
                  >
                    <Edit className="w-3 h-3 text-slate-500" />
                  </Button>
                </div>
              )}
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => openSheetDescDialog(sheet.sheetId, sheet.sheetDescription)}>
                  <Edit className="w-3 h-3 mr-2" />
                  Edit Description
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => openAddDialog(undefined, sheet.sheetId, 'materials')}>
                  <Plus className="w-3 h-3 mr-2" />
                  Add Material Row
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => openLineItemDialog(sheet.sheetId, undefined, 'labor')}>
                  <DollarSign className="w-3 h-3 mr-2" />
                  Add Labor
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => openLineItemDialog(sheet.sheetId, undefined, 'combined')}>
                  <Plus className="w-3 h-3 mr-2" />
                  Add Material + Labor
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => openSubcontractorDialog(sheet.sheetId, 'sheet')}>
                  <Briefcase className="w-3 h-3 mr-2" />
                  Add Subcontractor
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Two-column layout: Description + Pricing */}
          <div className="ml-10 flex gap-4 mt-1">
            {/* Description column (wide) */}
            <div className="flex-1">
              {sheet.sheetDescription ? (
                <Textarea
                  key={`sheet-desc-${sheet.sheetId}-${sheet.sheetDescription}`}
                  defaultValue={sheet.sheetDescription || ''}
                  placeholder="Click to add description..."
                  className="text-sm text-slate-600 leading-tight border border-slate-200 hover:border-slate-300 focus:border-blue-400 p-1.5 bg-slate-50/50 hover:bg-slate-50 focus:bg-white rounded transition-colors focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-0"
                  rows={(() => {
                    const lines = sheet.sheetDescription.split('\n');
                    const lineCount = lines.length;
                    // Estimate wrapped lines (assume ~90 chars per line with current width)
                    const wrappedLines = lines.reduce((acc, line) => acc + Math.max(1, Math.ceil(line.length / 90)), 0);
                    return Math.max(2, wrappedLines);
                  })()}
                  onBlur={async (e) => {
                    if (isReadOnly) {
                      toast.error('Cannot edit in historical view');
                      e.target.value = sheet.sheetDescription || '';
                      return;
                    }
                    const newValue = e.target.value.trim();
                    if (newValue !== (sheet.sheetDescription || '')) {
                      try {
                        await supabase
                          .from('material_sheets')
                          .update({ description: newValue || null })
                          .eq('id', sheet.sheetId);
                        await loadMaterialsData();
                      } catch (error) {
                        console.error('Error saving description:', error);
                      }
                    }
                  }}
                />
              ) : (
                <div 
                  className="text-xs text-muted-foreground italic cursor-pointer hover:text-foreground py-1"
                  onClick={() => openSheetDescDialog(sheet.sheetId, '')}
                >
                  No description
                </div>
              )}
            </div>

            {/* Pricing column (narrow) */}
            <div className="w-[240px] flex-shrink-0 text-right">
              <p className="text-sm text-slate-500">Materials</p>
              <p className="text-base font-bold text-blue-700">${toNum(sheetFinalPrice).toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
              {toNum(totalLaborCost) > 0 && (
                <>
                  <p className="text-sm text-slate-500 mt-2">Labor</p>
                  <p className="text-base font-bold text-amber-700">${toNum(totalLaborCost).toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                </>
              )}
            </div>
          </div>

          <CollapsibleContent>
            <div className="mt-2 ml-10 space-y-3">
              {/* Material Items by Category */}
              {sheet.categories && sheet.categories.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Material Items</p>
                  {sheet.categories.map((category: any, catIdx: number) => {
                    const categoryKey = `${sheet.sheetId}_${category.name}`;
                    const categoryMarkup = categoryMarkups[categoryKey] ?? (sheet.markup_percent || 10);
                    const categoryPriceWithMarkup = category.totalCost * (1 + categoryMarkup / 100);
                    
                    return (
                      <div key={catIdx} className="bg-slate-50 border border-slate-200 rounded p-2">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <p className="text-xs font-semibold text-slate-900">{category.name}</p>
                            <p className="text-xs text-slate-600">{category.itemCount} items</p>
                          </div>
                          <div className="flex items-center gap-3 text-xs">
                            <div className="text-right">
                              <p className="text-slate-500">Cost</p>
                              <p className="font-semibold text-slate-900">${toNum(category.totalCost).toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-slate-500">+</span>
                              <Input
                                type="number"
                                value={categoryMarkup}
                                onChange={async (e) => {
                                  const newMarkup = parseFloat(e.target.value) || 0;
                                  const categoryKey = `${sheet.sheetId}_${category.name}`;
                                  
                                  // Update local state immediately for responsive UI
                                  setCategoryMarkups(prev => ({
                                    ...prev,
                                    [categoryKey]: newMarkup
                                  }));
                                  
                                  try {
                                    // Mark this markup as being saved
                                    savingMarkupsRef.current.add(categoryKey);
                                    
                                    console.log(`[MARKUP SAVE] Starting save: ${newMarkup}% for category "${category.name}" in sheet ${sheet.sheetId}`);
                                    
                                    // Save to database with explicit conflict resolution
                                    const { data: upsertData, error: upsertError } = await supabase
                                      .from('material_category_markups')
                                      .upsert({
                                        sheet_id: sheet.sheetId,
                                        category_name: category.name,
                                        markup_percent: newMarkup,
                                        updated_at: new Date().toISOString(),
                                      }, {
                                        onConflict: 'sheet_id,category_name',
                                        ignoreDuplicates: false,
                                      })
                                      .select();
                                    
                                    if (upsertError) {
                                      console.error('[MARKUP SAVE] Database error:', upsertError);
                                      throw upsertError;
                                    }
                                    
                                    console.log('[MARKUP SAVE] Database response:', upsertData);
                                    console.log('[MARKUP SAVE] ✅ Markup saved successfully');
                                    
                                    // Small delay for database replication
                                    await new Promise(resolve => setTimeout(resolve, 300));
                                    
                                    // Remove from saving set BEFORE reload
                                    savingMarkupsRef.current.delete(categoryKey);
                                    
                                    // Reload to get fresh data
                                    await loadMaterialsData();
                                    
                                    // Show success toast
                                    toast.success(`Markup updated to ${newMarkup}%`);
                                  } catch (error: any) {
                                    console.error('[MARKUP SAVE] Error updating category markup:', error);
                                    toast.error(`Failed to save markup: ${error.message || 'Unknown error'}`);
                                    // Remove from saving set
                                    savingMarkupsRef.current.delete(categoryKey);
                                    // Reload to get correct value from database
                                    await loadMaterialsData();
                                  }
                                }}
                                onClick={(e) => e.stopPropagation()}
                                onFocus={(e) => e.target.select()}
                                className="w-14 h-5 text-xs px-1 text-center"
                                step="1"
                                min="0"
                              />
                              <span className="text-slate-500">%</span>
                            </div>
                            <div className="text-right">
                              <p className="text-slate-500">Price</p>
                              <p className="font-bold text-blue-700">${categoryPriceWithMarkup.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {linkedRows.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-slate-700 mb-1 flex items-center gap-2">
                    <List className="w-3 h-3" />
                    Line Items
                  </p>
                  {linkedRows.map((row: any) => {
                    const isLabor = row.category === 'labor';
                    const itemMarkup = toNum(row.markup_percent);
                    const itemCost = toNum(row.total_cost);
                    const itemPrice = itemCost * (1 + itemMarkup / 100);
                    
                    return (
                      <div key={row.id} className={`rounded p-2 border ${isLabor ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200'}`}>
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <p className="text-xs font-semibold text-slate-900">{row.description}</p>
                            <p className="text-xs text-slate-600">
                              {isLabor 
                                ? `${row.quantity}h × $${row.unit_cost.toLocaleString('en-US', { minimumFractionDigits: 2 })}/hr`
                                : `${row.quantity} × $${row.unit_cost.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
                              }
                            </p>
                            {row.notes && (
                              <p className="text-xs text-slate-500 mt-1">{row.notes}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant={isLabor ? 'secondary' : 'default'} className="text-xs h-5">
                              {isLabor ? '👷 Labor' : '📦 Material'}
                            </Badge>
                            {!isLabor && (
                              <div className="flex items-center gap-1">
                              <span className="text-xs text-slate-600">${itemCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                              <span className="text-xs text-slate-500">+</span>
                              <Input
                                type="number"
                                value={itemMarkup}
                                onChange={async (e) => {
                                  const newMarkup = parseFloat(e.target.value) || 0;
                                  try {
                                    const { error } = await supabase
                                      .from('custom_financial_rows')
                                      .update({ markup_percent: newMarkup })
                                      .eq('id', row.id);
                                    if (error) throw error;
                                    await loadCustomRows();
                                    await loadMaterialsData();
                                  } catch (error: any) {
                                    console.error('Error updating markup:', error);
                                    toast.error('Failed to update markup');
                                  }
                                }}
                                onClick={(e) => e.stopPropagation()}
                                className="w-14 h-5 text-xs px-1 text-center"
                                step="1"
                                min="0"
                              />
                              <span className="text-xs text-slate-500">%</span>
                              </div>
                            )}
                            <p className="text-xs font-bold text-blue-700">
                              ${itemPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </p>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-5 w-5 p-0"
                              onClick={() => openAddDialog(row)}
                            >
                              <Edit className="w-3 h-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-5 w-5 p-0"
                              onClick={() => deleteRow(row.id)}
                            >
                              <Trash2 className="w-3 h-3 text-red-600" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Sheet Labor Line Items - Display as open rows */}
              {(() => {
                const sheetLaborItems = customRowLineItems[sheet.sheetId]?.filter((item: any) => (item.item_type || 'material') === 'labor') || [];
                
                if (sheetLaborItems.length === 0) return null;
                
                return (
                  <div className="space-y-1">
                    {sheetLaborItems.map((laborItem: any) => (
                      <div key={laborItem.id} className="bg-amber-50 border border-amber-200 rounded p-2">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <p className="text-xs font-semibold text-slate-900">{laborItem.description}</p>
                            <p className="text-xs text-slate-600">
                              {laborItem.quantity}h × ${laborItem.unit_cost.toLocaleString('en-US', { minimumFractionDigits: 2 })}/hr
                            </p>
                            {laborItem.notes && (
                              <p className="text-xs text-slate-500 mt-0.5">{laborItem.notes}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-bold text-slate-900">
                              ${laborItem.total_cost.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </p>
                            <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => openLineItemDialog(sheet.sheetId, laborItem, 'labor')}>
                              <Edit className="w-3 h-3" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => deleteLineItem(laborItem.id)}>
                              <Trash2 className="w-3 h-3 text-red-600" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}

              {/* Legacy Sheet Labor (for backward compatibility) */}
              {sheetLabor[sheet.sheetId] && (
                <div className="bg-amber-50 border border-amber-200 rounded p-2">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <p className="text-xs font-semibold text-slate-900">{sheetLabor[sheet.sheetId].description}</p>
                      <p className="text-xs text-slate-600">
                        {sheetLabor[sheet.sheetId].estimated_hours}h × ${toNum(sheetLabor[sheet.sheetId].hourly_rate)}/hr
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-bold text-slate-900">
                        ${toNum(sheetLabor[sheet.sheetId].total_labor_cost).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </p>
                      <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => openLaborDialog(sheet.sheetId)}>
                        <Edit className="w-3 h-3" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => deleteSheetLabor(sheetLabor[sheet.sheetId].id)}>
                        <Trash2 className="w-3 h-3 text-red-600" />
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {linkedSubs.map((sub: any) => {
                const lineItems = subcontractorLineItems[sub.id] || [];
                const includedTotal = lineItems
                  .filter((item: any) => !item.excluded)
                  .reduce((sum: number, item: any) => sum + toNum(item.total_price), 0);
                const totalWithMarkup = includedTotal * (1 + toNum(sub.markup_percent) / 100);

                return (
                  <Collapsible key={sub.id} className="bg-purple-50 border border-purple-200 rounded p-2">
                    <div className="flex items-start gap-2">
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="sm" className="p-0 h-auto hover:bg-transparent">
                          <ChevronDown className="w-4 h-4 text-slate-600" />
                        </Button>
                      </CollapsibleTrigger>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold text-slate-900">{sub.company_name}</p>
                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1 text-xs">
                              <span className="text-slate-600">Base: ${toNum(includedTotal).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                              <span className="text-slate-500">+</span>
                              <Input
                                type="number"
                                value={sub.markup_percent || 0}
                                onChange={(e) => {
                                  const newMarkup = parseFloat(e.target.value) || 0;
                                  updateSubcontractorMarkup(sub.id, newMarkup);
                                }}
                                onClick={(e) => e.stopPropagation()}
                                className="w-14 h-5 text-xs px-1 text-center"
                                step="1"
                                min="0"
                              />
                              <span className="text-slate-500">%</span>
                            </div>
                            <p className="text-xs font-bold text-slate-900">
                              ${toNum(totalWithMarkup).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </p>
                            {sub.pdf_url && (
                              <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => window.open(sub.pdf_url, '_blank')}>
                                <Eye className="w-3 h-3 text-blue-600" />
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => unlinkSubcontractor(sub.id)}>
                              <Trash2 className="w-3 h-3 text-red-600" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                    {sub.scope_of_work && (
                      <div className="ml-8 mt-1">
                        <p className="text-xs text-slate-600">{sub.scope_of_work}</p>
                      </div>
                    )}
                    <CollapsibleContent>
                      <div className="ml-8 mt-2 space-y-1">
                        {lineItems.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-slate-700 mb-1 flex items-center gap-2">
                              <List className="w-3 h-3" />
                              Line Items
                              <span className="text-slate-500">({lineItems.filter((item: any) => !item.excluded).length} of {lineItems.length} included)</span>
                            </p>
                            {lineItems.map((lineItem: any) => (
                              <div key={lineItem.id} className={`p-2 rounded mb-1 ${lineItem.excluded ? 'bg-red-50' : 'bg-slate-50'}`}>
                                <div className="flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    checked={!lineItem.excluded}
                                    onChange={() => toggleSubcontractorLineItem(lineItem.id, lineItem.excluded)}
                                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                    title="Include in price"
                                  />
                                  <p className={`text-xs flex-1 ${lineItem.excluded ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                                    {lineItem.description}
                                  </p>
                                  <div className="flex items-center gap-2">
                                    <Badge
                                      variant="outline"
                                      className={`text-xs h-5 cursor-pointer hover:bg-slate-100 ${lineItem.excluded ? 'opacity-50' : ''}`}
                                      onClick={() => !lineItem.excluded && toggleSubcontractorLineItemType(lineItem.id, lineItem.item_type || 'material')}
                                      title="Click to toggle between Material and Labor"
                                    >
                                      {(lineItem.item_type || 'material') === 'labor' ? '👷 Labor' : '📦 Material'}
                                    </Badge>
                                    {(lineItem.item_type || 'material') === 'material' && (
                                      <>
                                        <Badge variant={lineItem.taxable ? 'default' : 'secondary'} className="text-xs h-5">
                                          {lineItem.taxable ? 'Tax' : 'No Tax'}
                                        </Badge>
                                        <input
                                          type="checkbox"
                                          checked={lineItem.taxable}
                                          onChange={() => toggleSubcontractorLineItemTaxable(lineItem.id, lineItem.taxable)}
                                          className="rounded border-slate-300 text-green-600 focus:ring-green-500"
                                          title="Taxable"
                                          disabled={lineItem.excluded}
                                        />
                                      </>
                                    )}
                                    <div className="flex items-center gap-1">
                                      <span className="text-xs text-slate-500">+</span>
                                      <Input
                                        type="number"
                                        value={lineItem.markup_percent || 0}
                                        onChange={async (e) => {
                                          const newMarkup = parseFloat(e.target.value) || 0;
                                          try {
                                            const { error } = await supabase
                                              .from('subcontractor_estimate_line_items')
                                              .update({ markup_percent: newMarkup })
                                              .eq('id', lineItem.id);
                                            if (error) throw error;
                                            await loadSubcontractorEstimates();
                                          } catch (error: any) {
                                            console.error('Error updating line item markup:', error);
                                            toast.error('Failed to update markup');
                                          }
                                        }}
                                        onClick={(e) => e.stopPropagation()}
                                        className="w-14 h-5 text-xs px-1 text-center"
                                        step="1"
                                        min="0"
                                        disabled={lineItem.excluded}
                                      />
                                      <span className="text-xs text-slate-500">%</span>
                                    </div>
                                    <p className={`text-xs font-semibold ${lineItem.excluded ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                                      ${(lineItem.total_price * (1 + (lineItem.markup_percent || 0) / 100)).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        {sub.exclusions && (
                          <div className="mt-3 pt-3 border-t border-slate-200">
                            <p className="text-xs font-semibold text-red-700 mb-1">Exclusions</p>
                            <p className="text-xs text-slate-600">{sub.exclusions}</p>
                          </div>
                        )}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                );
              })}
            </div>
          </CollapsibleContent>
        </Collapsible>
      );
    } else if (item.type === 'custom') {
      const row = item.data;
      const lineItems = customRowLineItems[row.id] || [];
      const linkedSubs = linkedSubcontractors[row.id] || [];
      
      // Separate line items by type (use item_type, not taxable)
      const materialLineItems = lineItems.filter((item: any) => (item.item_type || 'material') === 'material');
      const laborLineItems = lineItems.filter((item: any) => (item.item_type || 'material') === 'labor');
      
      const materialLineItemsTotal = materialLineItems.reduce((sum: number, item: any) => {
        return sum + (toNum(item.total_cost) * (1 + toNum(item.markup_percent) / 100));
      }, 0);
      
      const laborLineItemsTotal = laborLineItems.reduce((sum: number, item: any) => {
        return sum + (toNum(item.total_cost) * (1 + toNum(item.markup_percent) / 100));
      }, 0);
      
      const linkedSubsTaxableTotal = linkedSubs.reduce((sum: number, sub: any) => {
        const subLineItems = subcontractorLineItems[sub.id] || [];
        const taxableTotal = subLineItems
          .filter((item: any) => !item.excluded && item.taxable)
          .reduce((itemSum: number, item: any) => itemSum + toNum(item.total_price), 0);
        return sum + (taxableTotal * (1 + toNum(sub.markup_percent) / 100));
      }, 0);
      
      const linkedSubsNonTaxableTotal = linkedSubs.reduce((sum: number, sub: any) => {
        const subLineItems = subcontractorLineItems[sub.id] || [];
        const nonTaxableTotal = subLineItems
          .filter((item: any) => !item.excluded && !item.taxable)
          .reduce((itemSum: number, item: any) => itemSum + toNum(item.total_price), 0);
        return sum + (nonTaxableTotal * (1 + toNum(sub.markup_percent) / 100));
      }, 0);
      
      const customLaborTotal = customRowLabor[row.id]
        ? (toNum(customRowLabor[row.id].estimated_hours) * toNum(customRowLabor[row.id].hourly_rate))
        : 0;
      
      const finalPrice = lineItems.length > 0
        ? materialLineItemsTotal + linkedSubsTaxableTotal
        : (toNum(row.total_cost) + linkedSubsTaxableTotal) * (1 + toNum(row.markup_percent) / 100);
      
      const baseCost = lineItems.length > 0
        ? lineItems.reduce((sum: number, item: any) => sum + toNum(item.total_cost), 0) + linkedSubsTaxableTotal
        : toNum(row.total_cost) + linkedSubsTaxableTotal;
      
      // Total labor for display (labor line items + custom labor + non-taxable subcontractor)
      const totalLaborCost = laborLineItemsTotal + customLaborTotal + linkedSubsNonTaxableTotal;

      return (
        <Collapsible className="border rounded bg-white py-1 px-2">
          <div className="flex items-start gap-2">
            {/* Drag Handle */}
            <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing py-1">
              <GripVertical className="w-4 h-4 text-slate-400" />
            </div>

            {/* Chevron (only if has line items or linked subs) */}
            {(lineItems.length > 0 || linkedSubs.length > 0) && (
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="p-0 h-auto hover:bg-transparent">
                  <ChevronDown className="w-4 h-4 text-slate-600" />
                </Button>
              </CollapsibleTrigger>
            )}

            {/* Title */}
            <div className="flex-1 min-w-0">
              {editingRowName === row.id && editingRowNameType === 'custom' ? (
                <div className="flex items-center gap-1">
                  <Input
                    value={tempRowName}
                    onChange={(e) => setTempRowName(e.target.value)}
                    className="h-7 text-sm font-bold"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveRowName();
                      if (e.key === 'Escape') cancelEditingRowName();
                    }}
                  />
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={saveRowName}>
                    <Check className="w-3 h-3 text-green-600" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={cancelEditingRowName}>
                    <X className="w-3 h-3 text-red-600" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-slate-900 truncate">{row.description}</h3>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 hover:bg-slate-100"
                    onClick={() => startEditingRowName(row.id, 'custom', row.description)}
                  >
                    <Edit className="w-3 h-3 text-slate-500" />
                  </Button>
                  {row.category === 'labor' && <Badge variant="secondary" className="text-xs">Labor</Badge>}
                  {(lineItems.length > 0 || linkedSubs.length > 0) && (
                    <Badge variant="outline" className="text-xs">
                      {lineItems.length + linkedSubs.length} item{(lineItems.length + linkedSubs.length) !== 1 ? 's' : ''}
                    </Badge>
                  )}
                </div>
              )}
            </div>

            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => openAddDialog(row)}>
                  <Edit className="w-3 h-3 mr-2" />
                  Edit Description
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => openLineItemDialog(row.id, undefined, 'material')}>
                  <Plus className="w-3 h-3 mr-2" />
                  Add Material Row
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => openLineItemDialog(row.id, undefined, 'labor')}>
                  <DollarSign className="w-3 h-3 mr-2" />
                  Add Labor
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => openLineItemDialog(row.id, undefined, 'combined')}>
                  <Plus className="w-3 h-3 mr-2" />
                  Add Material + Labor
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => openSubcontractorDialog(row.id, 'row')}>
                  <Briefcase className="w-3 h-3 mr-2" />
                  Add Subcontractor
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => deleteRow(row.id)}>
                  <Trash2 className="w-3 h-3 mr-2" />
                  Delete Row
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Two-column layout: Description + Pricing */}
          <div className="ml-10 flex gap-4 mt-1">
            {/* Description column (wide) */}
            <div className="flex-1">
              {row.notes ? (
                <Textarea
                  key={`row-notes-${row.id}-${row.notes}`}
                  defaultValue={row.notes || ''}
                  placeholder="Click to add notes..."
                  className="text-sm text-slate-600 leading-tight border border-slate-200 hover:border-slate-300 focus:border-blue-400 p-1.5 bg-slate-50/50 hover:bg-slate-50 focus:bg-white rounded transition-colors focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-0"
                  rows={(() => {
                    const lines = row.notes.split('\n');
                    const lineCount = lines.length;
                    // Estimate wrapped lines (assume ~90 chars per line with current width)
                    const wrappedLines = lines.reduce((acc, line) => acc + Math.max(1, Math.ceil(line.length / 90)), 0);
                    return Math.max(2, wrappedLines);
                  })()}
                  onBlur={async (e) => {
                    if (isReadOnly) {
                      toast.error('Cannot edit in historical view');
                      e.target.value = row.notes || '';
                      return;
                    }
                    const newValue = e.target.value.trim();
                    if (newValue !== (row.notes || '')) {
                      try {
                        await supabase
                          .from('custom_financial_rows')
                          .update({ notes: newValue || null })
                          .eq('id', row.id);
                        await loadCustomRows();
                        await loadMaterialsData();
                      } catch (error) {
                        console.error('Error saving notes:', error);
                      }
                    }
                  }}
                />
              ) : (
                <div className="text-xs text-muted-foreground italic py-1">
                  No description
                </div>
              )}
            </div>

            {/* Pricing column (narrow) */}
            <div className="w-[240px] flex-shrink-0 text-right">
              {/* Only show row-level markup if NO line items exist */}
              {lineItems.length === 0 && (
                <div className="flex items-center justify-end gap-2 text-xs text-slate-600 mb-1">
                  <span>Base: ${toNum(baseCost).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  <span>+</span>
                  <Input
                    type="number"
                    value={row.markup_percent || 0}
                    onChange={(e) => {
                      const newMarkup = parseFloat(e.target.value) || 0;
                      updateCustomRowMarkup(row.id, newMarkup);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="w-14 h-5 text-xs px-1 text-center"
                    step="1"
                    min="0"
                  />
                  <span>%</span>
                </div>
              )}
              <p className="text-sm text-slate-500">Materials</p>
              <p className="text-base font-bold text-blue-700">${toNum(finalPrice).toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
              {totalLaborCost > 0 && (
                <>
                  <p className="text-sm text-slate-500 mt-2">Labor</p>
                  <p className="text-base font-bold text-amber-700">${toNum(totalLaborCost).toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                </>
              )}
            </div>
          </div>

          {/* Line Items & Linked Subcontractors */}
          {(lineItems.length > 0 || linkedSubs.length > 0) && (
            <CollapsibleContent>
              <div className="mt-2 ml-10 space-y-1">
                {lineItems.length > 0 && (
                  <>
                    <p className="text-xs font-semibold text-slate-700 mb-1 flex items-center gap-2">
                      <List className="w-3 h-3" />
                      Line Items
                    </p>
                    {lineItems.map((lineItem: any) => {
                      const isLabor = (lineItem as any).item_type === 'labor';
                      const itemMarkup = toNum(lineItem.markup_percent);
                      const itemCost = toNum(lineItem.total_cost);
                      const itemPrice = itemCost * (1 + itemMarkup / 100);
                      
                      return (
                        <div key={lineItem.id} className={`rounded p-2 border ${isLabor ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200'}`}>
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <p className="text-xs font-semibold text-slate-900">{lineItem.description}</p>
                              <p className="text-xs text-slate-600">
                                {lineItem.quantity} × ${lineItem.unit_cost.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                              </p>
                              {lineItem.notes && (
                                <p className="text-xs text-slate-500 mt-1">{lineItem.notes}</p>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant={isLabor ? 'secondary' : 'default'} className="text-xs h-5">
                                {isLabor ? '👷 Labor' : '📦 Material'}
                              </Badge>
                              <div className="flex items-center gap-1">
                                <span className="text-xs text-slate-600">${itemCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                                <span className="text-xs text-slate-500">+</span>
                                <Input
                                  type="number"
                                  value={itemMarkup}
                                  onChange={async (e) => {
                                    const newMarkup = parseFloat(e.target.value) || 0;
                                    try {
                                      const { error } = await supabase
                                        .from('custom_financial_row_items')
                                        .update({ markup_percent: newMarkup })
                                        .eq('id', lineItem.id);
                                      if (error) throw error;
                                      await loadCustomRows();
                                      await loadMaterialsData();
                                    } catch (error: any) {
                                      console.error('Error updating markup:', error);
                                      toast.error('Failed to update markup');
                                    }
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                  className="w-14 h-5 text-xs px-1 text-center"
                                  step="1"
                                  min="0"
                                />
                                <span className="text-xs text-slate-500">%</span>
                              </div>
                              <p className="text-xs font-bold text-blue-700">
                                ${itemPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                              </p>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-5 w-5 p-0"
                                onClick={() => openLineItemDialog(row.id, lineItem, isLabor ? 'labor' : 'material')}
                              >
                                <Edit className="w-3 h-3" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-5 w-5 p-0"
                                onClick={() => deleteLineItem(lineItem.id)}
                              >
                                <Trash2 className="w-3 h-3 text-red-600" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}

                {linkedSubs.map((sub: any) => {
                  const subLineItems = subcontractorLineItems[sub.id] || [];
                  const includedTotal = subLineItems
                    .filter((item: any) => !item.excluded)
                    .reduce((sum: number, item: any) => sum + toNum(item.total_price), 0);
                  const totalWithMarkup = includedTotal * (1 + toNum(sub.markup_percent) / 100);

                  return (
                    <Collapsible key={sub.id} className="bg-purple-50 border border-purple-200 rounded p-2">
                      <div className="flex items-start gap-2">
                        <CollapsibleTrigger asChild>
                          <Button variant="ghost" size="sm" className="p-0 h-auto hover:bg-transparent">
                            <ChevronDown className="w-4 h-4 text-slate-600" />
                          </Button>
                        </CollapsibleTrigger>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-semibold text-slate-900">{sub.company_name}</p>
                            <div className="flex items-center gap-2">
                              <div className="flex items-center gap-1 text-xs">
                                <span className="text-slate-600">Base: ${toNum(includedTotal).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                                <span className="text-slate-500">+</span>
                                <Input
                                  type="number"
                                  value={sub.markup_percent || 0}
                                  onChange={(e) => {
                                    const newMarkup = parseFloat(e.target.value) || 0;
                                    updateSubcontractorMarkup(sub.id, newMarkup);
                                  }}
                                  className="w-14 h-5 text-xs px-1 text-center"
                                  step="1"
                                  min="0"
                                />
                                <span className="text-slate-500">%</span>
                              </div>
                              <p className="text-xs font-bold text-slate-900">
                                ${toNum(totalWithMarkup).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                              </p>
                              {sub.pdf_url && (
                                <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => window.open(sub.pdf_url, '_blank')}>
                                  <Eye className="w-3 h-3 text-blue-600" />
                                </Button>
                              )}
                              <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => unlinkSubcontractor(sub.id)}>
                                <Trash2 className="w-3 h-3 text-red-600" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                      {sub.scope_of_work && (
                        <div className="ml-8 mt-1">
                          <p className="text-xs text-slate-600">{sub.scope_of_work}</p>
                        </div>
                      )}
                      <CollapsibleContent>
                        <div className="ml-8 mt-2 space-y-1">
                          {subLineItems.length > 0 && (
                            <div>
                              <p className="text-xs font-semibold text-slate-700 mb-1 flex items-center gap-2">
                                <List className="w-3 h-3" />
                                Line Items
                                <span className="text-slate-500">({subLineItems.filter((item: any) => !item.excluded).length} of {subLineItems.length} included)</span>
                              </p>
                              {subLineItems.map((lineItem: any) => (
                                <div key={lineItem.id} className={`p-2 rounded mb-1 ${lineItem.excluded ? 'bg-red-50' : 'bg-slate-50'}`}>
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="checkbox"
                                      checked={!lineItem.excluded}
                                      onChange={() => toggleSubcontractorLineItem(lineItem.id, lineItem.excluded)}
                                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                      title="Include in price"
                                    />
                                    <p className={`text-xs flex-1 ${lineItem.excluded ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                                      {lineItem.description}
                                    </p>
                                    <div className="flex items-center gap-2">
                                      <Badge
                                        variant="outline"
                                        className={`text-xs h-5 cursor-pointer hover:bg-slate-100 ${lineItem.excluded ? 'opacity-50' : ''}`}
                                        onClick={() => !lineItem.excluded && toggleSubcontractorLineItemType(lineItem.id, lineItem.item_type || 'material')}
                                        title="Click to toggle between Material and Labor"
                                      >
                                        {(lineItem.item_type || 'material') === 'labor' ? '👷 Labor' : '📦 Material'}
                                      </Badge>
                                      {(lineItem.item_type || 'material') === 'material' && (
                                        <>
                                          <Badge variant={lineItem.taxable ? 'default' : 'secondary'} className="text-xs h-5">
                                            {lineItem.taxable ? 'Tax' : 'No Tax'}
                                          </Badge>
                                          <input
                                            type="checkbox"
                                            checked={lineItem.taxable}
                                            onChange={() => toggleSubcontractorLineItemTaxable(lineItem.id, lineItem.taxable)}
                                            className="rounded border-slate-300 text-green-600 focus:ring-green-500"
                                            title="Taxable"
                                            disabled={lineItem.excluded}
                                          />
                                        </>
                                      )}
                                      <div className="flex items-center gap-1">
                                        <span className="text-xs text-slate-500">+</span>
                                        <Input
                                          type="number"
                                          value={lineItem.markup_percent || 0}
                                          onChange={async (e) => {
                                            const newMarkup = parseFloat(e.target.value) || 0;
                                            try {
                                              const { error } = await supabase
                                                .from('subcontractor_estimate_line_items')
                                                .update({ markup_percent: newMarkup })
                                                .eq('id', lineItem.id);
                                              if (error) throw error;
                                              await loadSubcontractorEstimates();
                                            } catch (error: any) {
                                              console.error('Error updating line item markup:', error);
                                              toast.error('Failed to update markup');
                                            }
                                          }}
                                          onClick={(e) => e.stopPropagation()}
                                          className="w-14 h-5 text-xs px-1 text-center"
                                          step="1"
                                          min="0"
                                          disabled={lineItem.excluded}
                                        />
                                        <span className="text-xs text-slate-500">%</span>
                                      </div>
                                      <p className={`text-xs font-semibold ${lineItem.excluded ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                                        ${(lineItem.total_price * (1 + (lineItem.markup_percent || 0) / 100)).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                          {sub.exclusions && (
                            <div className="mt-3 pt-3 border-t border-slate-200">
                              <p className="text-xs font-semibold text-red-700 mb-1">Exclusions</p>
                              <p className="text-xs text-slate-600">{sub.exclusions}</p>
                            </div>
                          )}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  );
                })}
              </div>
            </CollapsibleContent>
          )}
        </Collapsible>
      );
    } else if (item.type === 'subcontractor') {
      const est = item.data;
      const lineItems = subcontractorLineItems[est.id] || [];
      const includedTotal = lineItems
        .filter((item: any) => !item.excluded)
        .reduce((itemSum: number, item: any) => itemSum + toNum(item.total_price), 0);
      const estMarkup = toNum(est.markup_percent);
      const finalPrice = includedTotal * (1 + estMarkup / 100);

      return (
        <Collapsible className="border rounded bg-white py-1 px-2">
          <div className="flex items-start gap-2">
            {/* Drag Handle */}
            <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing py-1">
              <GripVertical className="w-4 h-4 text-slate-400" />
            </div>

            {/* Chevron */}
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="p-0 h-auto hover:bg-transparent">
                <ChevronDown className="w-4 h-4 text-slate-600" />
              </Button>
            </CollapsibleTrigger>

            {/* Title */}
            <div className="flex-1 min-w-0">
              {editingRowName === est.id && editingRowNameType === 'subcontractor' ? (
                <div className="flex items-center gap-1">
                  <Input
                    value={tempRowName}
                    onChange={(e) => setTempRowName(e.target.value)}
                    className="h-7 text-sm font-bold"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveRowName();
                      if (e.key === 'Escape') cancelEditingRowName();
                    }}
                  />
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={saveRowName}>
                    <Check className="w-3 h-3 text-green-600" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={cancelEditingRowName}>
                    <X className="w-3 h-3 text-red-600" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-slate-900 truncate">{est.company_name}</h3>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 hover:bg-slate-100"
                    onClick={() => startEditingRowName(est.id, 'subcontractor', est.company_name)}
                  >
                    <Edit className="w-3 h-3 text-slate-500" />
                  </Button>
                </div>
              )}
            </div>

            {est.pdf_url && (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0"
                onClick={() => window.open(est.pdf_url, '_blank')}
              >
                <Eye className="w-4 h-4 text-blue-600" />
              </Button>
            )}
          </div>

          {/* Two-column layout: Description + Pricing */}
          <div className="ml-10 flex gap-4 mt-1">
            {/* Description column (wide) */}
            <div className="flex-1">
              {est.scope_of_work ? (
                <Textarea
                  key={`sub-scope-${est.id}-${est.scope_of_work}`}
                  defaultValue={est.scope_of_work || ''}
                  placeholder="Click to add description..."
                  className="text-sm text-slate-600 leading-tight border border-slate-200 hover:border-slate-300 focus:border-blue-400 p-1.5 bg-slate-50/50 hover:bg-slate-50 focus:bg-white rounded transition-colors focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-0"
                  rows={(() => {
                    const lines = est.scope_of_work.split('\n');
                    const lineCount = lines.length;
                    // Estimate wrapped lines (assume ~90 chars per line with current width)
                    const wrappedLines = lines.reduce((acc, line) => acc + Math.max(1, Math.ceil(line.length / 90)), 0);
                    return Math.max(2, wrappedLines);
                  })()}
                  onBlur={async (e) => {
                    if (isReadOnly) {
                      toast.error('Cannot edit in historical view');
                      e.target.value = est.scope_of_work || '';
                      return;
                    }
                    const newValue = e.target.value.trim();
                    if (newValue !== (est.scope_of_work || '')) {
                      try {
                        await supabase
                          .from('subcontractor_estimates')
                          .update({ scope_of_work: newValue || null })
                          .eq('id', est.id);
                        await loadSubcontractorEstimates();
                      } catch (error) {
                        console.error('Error saving scope of work:', error);
                      }
                    }
                  }}
                />
              ) : (
                <div className="text-xs text-muted-foreground italic py-1">
                  No description
                </div>
              )}
            </div>

            {/* Pricing column (narrow) */}
            <div className="w-[240px] flex-shrink-0 text-right">
              <div className="flex items-center justify-end gap-2 text-xs text-slate-600 mb-1">
                <span>Base: ${toNum(includedTotal).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                <span>+</span>
                <Input
                  type="number"
                  value={estMarkup || 0}
                  onChange={(e) => {
                    const newMarkup = parseFloat(e.target.value) || 0;
                    updateSubcontractorMarkup(est.id, newMarkup);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="w-14 h-5 text-xs px-1 text-center"
                  step="1"
                  min="0"
                />
                <span>%</span>
              </div>
              <p className="text-sm text-slate-500">Total</p>
              <p className="text-base font-bold text-blue-700">${toNum(finalPrice).toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
            </div>
          </div>

          <CollapsibleContent>
            <div className="mt-2 ml-10 space-y-1">
              {lineItems.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-700 mb-1 flex items-center gap-2">
                    <List className="w-3 h-3" />
                    Line Items
                    <span className="text-slate-500">({lineItems.filter((item: any) => !item.excluded).length} of {lineItems.length} included)</span>
                  </p>
                  {lineItems.map((lineItem: any) => (
                    <div key={lineItem.id} className={`p-2 rounded mb-1 ${lineItem.excluded ? 'bg-red-50' : 'bg-slate-50'}`}>
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={!lineItem.excluded}
                          onChange={() => toggleSubcontractorLineItem(lineItem.id, lineItem.excluded)}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          title="Include in price"
                        />
                        <p className={`text-xs flex-1 ${lineItem.excluded ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                          {lineItem.description}
                        </p>
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className={`text-xs h-5 cursor-pointer hover:bg-slate-100 ${lineItem.excluded ? 'opacity-50' : ''}`}
                            onClick={() => !lineItem.excluded && toggleSubcontractorLineItemType(lineItem.id, lineItem.item_type || 'material')}
                            title="Click to toggle between Material and Labor"
                          >
                            {(lineItem.item_type || 'material') === 'labor' ? '👷 Labor' : '📦 Material'}
                          </Badge>
                          {(lineItem.item_type || 'material') === 'material' && (
                            <>
                              <Badge variant={lineItem.taxable ? 'default' : 'secondary'} className="text-xs h-5">
                                {lineItem.taxable ? 'Tax' : 'No Tax'}
                              </Badge>
                              <input
                                type="checkbox"
                                checked={lineItem.taxable}
                                onChange={() => toggleSubcontractorLineItemTaxable(lineItem.id, lineItem.taxable)}
                                className="rounded border-slate-300 text-green-600 focus:ring-green-500"
                                title="Taxable"
                                disabled={lineItem.excluded}
                              />
                            </>
                          )}
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-slate-500">+</span>
                            <Input
                              type="number"
                              value={lineItem.markup_percent || 0}
                              onChange={async (e) => {
                                const newMarkup = parseFloat(e.target.value) || 0;
                                try {
                                  const { error } = await supabase
                                    .from('subcontractor_estimate_line_items')
                                    .update({ markup_percent: newMarkup })
                                    .eq('id', lineItem.id);
                                  if (error) throw error;
                                  await loadSubcontractorEstimates();
                                } catch (error: any) {
                                  console.error('Error updating line item markup:', error);
                                  toast.error('Failed to update markup');
                                }
                              }}
                              onClick={(e) => e.stopPropagation()}
                              className="w-14 h-5 text-xs px-1 text-center"
                              step="1"
                              min="0"
                              disabled={lineItem.excluded}
                            />
                            <span className="text-xs text-slate-500">%</span>
                          </div>
                          <p className={`text-xs font-semibold ${lineItem.excluded ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                            ${(lineItem.total_price * (1 + (lineItem.markup_percent || 0) / 100)).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {est.exclusions && (
                <div className="mt-3 pt-3 border-t border-slate-200">
                  <p className="text-xs font-semibold text-red-700 mb-1">Exclusions</p>
                  <p className="text-xs text-slate-600">{est.exclusions}</p>
                </div>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      );
    }
    return null;
  })();

  return (
    <div ref={setNodeRef} style={style} className="group">
      {content}
    </div>
  );
}

interface ComparisonItem {
  name: string;
  sku?: string;
  lockedQty: number;
  lockedCost: number;
  lockedPrice: number;
  workingQty: number;
  workingCost: number;
  workingPrice: number;
  status: 'added' | 'removed' | 'changed' | 'unchanged';
}

interface SheetComparison {
  sheetName: string;
  items: ComparisonItem[];
  lockedTotal: number;
  workingTotal: number;
}

function ContractComparison({ quoteId, jobId }: { quoteId: string; jobId: string }) {
  const [loading, setLoading] = useState(true);
  const [sheets, setSheets] = useState<SheetComparison[]>([]);
  const [overallLocked, setOverallLocked] = useState(0);
  const [overallWorking, setOverallWorking] = useState(0);

  useEffect(() => {
    loadComparison();
  }, [quoteId]);

  async function loadComparison() {
    setLoading(true);
    try {
      let lockedWb: { id: string } | null = null;
      let workingWb: { id: string } | null = null;
      const { data: locked1 } = await supabase
        .from('material_workbooks')
        .select('id')
        .eq('quote_id', quoteId)
        .eq('status', 'locked')
        .maybeSingle();
      if (locked1) lockedWb = locked1;
      else {
        const { data: lockedF } = await supabase.from('material_workbooks').select('id').eq('status', 'locked').limit(1);
        if (lockedF?.[0]) lockedWb = lockedF[0];
      }
      const { data: working1 } = await supabase
        .from('material_workbooks')
        .select('id')
        .eq('quote_id', quoteId)
        .eq('status', 'working')
        .maybeSingle();
      if (working1) workingWb = working1;
      else {
        const { data: workingF } = await supabase.from('material_workbooks').select('id').eq('status', 'working').limit(1);
        if (workingF?.[0]) workingWb = workingF[0];
      }

      if (!lockedWb || !workingWb) {
        setSheets([]);
        setLoading(false);
        return;
      }

      // Load all sheets and items for both workbooks
      const [lockedSheets, workingSheets] = await Promise.all([
        supabase.from('material_sheets').select('*').eq('workbook_id', lockedWb.id).order('order_index'),
        supabase.from('material_sheets').select('*').eq('workbook_id', workingWb.id).order('order_index'),
      ]);

      const lockedSheetList = lockedSheets.data || [];
      const workingSheetList = workingSheets.data || [];

      const allLockedIds = lockedSheetList.map(s => s.id);
      const allWorkingIds = workingSheetList.map(s => s.id);

      const [lockedItemsRes, workingItemsRes] = await Promise.all([
        allLockedIds.length > 0
          ? supabase.from('material_items').select('*').in('sheet_id', allLockedIds)
          : { data: [] },
        allWorkingIds.length > 0
          ? supabase.from('material_items').select('*').in('sheet_id', allWorkingIds)
          : { data: [] },
      ]);

      const lockedItems = lockedItemsRes.data || [];
      const workingItems = workingItemsRes.data || [];

      // Match sheets by name
      const allSheetNames = new Set([
        ...lockedSheetList.map(s => s.sheet_name),
        ...workingSheetList.map(s => s.sheet_name),
      ]);

      let totalLocked = 0;
      let totalWorking = 0;
      const comparisons: SheetComparison[] = [];

      for (const name of allSheetNames) {
        const lockedSheet = lockedSheetList.find(s => s.sheet_name === name);
        const workingSheet = workingSheetList.find(s => s.sheet_name === name);

        const lItems = lockedSheet
          ? lockedItems.filter(i => i.sheet_id === lockedSheet.id)
          : [];
        const wItems = workingSheet
          ? workingItems.filter(i => i.sheet_id === workingSheet.id)
          : [];

        // Build lookup by SKU or name
        const lMap = new Map<string, any>();
        lItems.forEach(i => lMap.set(i.sku || i.material_name, i));
        const wMap = new Map<string, any>();
        wItems.forEach(i => wMap.set(i.sku || i.material_name, i));

        const allKeys = new Set([...lMap.keys(), ...wMap.keys()]);
        const items: ComparisonItem[] = [];
        let sheetLocked = 0;
        let sheetWorking = 0;

        for (const key of allKeys) {
          const l = lMap.get(key);
          const w = wMap.get(key);

          const lQty = l ? toNum(l.quantity) : 0;
          const lCost = l ? toNum(l.cost_per_unit) * lQty : 0;
          const lPrice = l ? toNum(l.price_per_unit) * lQty : 0;
          const wQty = w ? toNum(w.quantity) : 0;
          const wCost = w ? toNum(w.cost_per_unit) * wQty : 0;
          const wPrice = w ? toNum(w.price_per_unit) * wQty : 0;

          let status: ComparisonItem['status'] = 'unchanged';
          if (!l) status = 'added';
          else if (!w) status = 'removed';
          else if (lQty !== wQty || lCost !== wCost || lPrice !== wPrice) status = 'changed';

          sheetLocked += lPrice;
          sheetWorking += wPrice;

          items.push({
            name: (l || w).material_name,
            sku: (l || w).sku,
            lockedQty: lQty,
            lockedCost: lCost,
            lockedPrice: lPrice,
            workingQty: wQty,
            workingCost: wCost,
            workingPrice: wPrice,
            status,
          });
        }

        totalLocked += sheetLocked;
        totalWorking += sheetWorking;

        comparisons.push({
          sheetName: name,
          items: items.sort((a, b) => {
            const order = { removed: 0, changed: 1, added: 2, unchanged: 3 };
            return order[a.status] - order[b.status];
          }),
          lockedTotal: sheetLocked,
          workingTotal: sheetWorking,
        });
      }

      setSheets(comparisons);
      setOverallLocked(totalLocked);
      setOverallWorking(totalWorking);
    } catch (err: any) {
      console.error('Error loading comparison:', err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="py-8 text-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-muted-foreground">Loading comparison...</p>
      </div>
    );
  }

  if (sheets.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        No workbook data available for comparison.
      </div>
    );
  }

  const diff = overallWorking - overallLocked;
  const diffPct = overallLocked > 0 ? (diff / overallLocked) * 100 : 0;

  const statusColors: Record<string, string> = {
    added: 'bg-green-50 text-green-800',
    removed: 'bg-red-50 text-red-800 line-through',
    changed: 'bg-amber-50 text-amber-900',
    unchanged: '',
  };

  const statusLabels: Record<string, string> = {
    added: 'Added',
    removed: 'Removed',
    changed: 'Changed',
    unchanged: '',
  };

  return (
    <div className="space-y-6">
      {/* Overall Summary */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="py-3 text-center">
            <p className="text-xs text-blue-700 font-medium">Contract Price</p>
            <p className="text-lg font-bold text-blue-900">
              ${toNum(overallLocked).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </p>
          </CardContent>
        </Card>
        <Card className="border-purple-200 bg-purple-50">
          <CardContent className="py-3 text-center">
            <p className="text-xs text-purple-700 font-medium">Actual Price</p>
            <p className="text-lg font-bold text-purple-900">
              ${toNum(overallWorking).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </p>
          </CardContent>
        </Card>
        <Card className={`border ${diff > 0 ? 'border-red-200 bg-red-50' : diff < 0 ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-gray-50'}`}>
          <CardContent className="py-3 text-center">
            <p className={`text-xs font-medium ${diff > 0 ? 'text-red-700' : diff < 0 ? 'text-green-700' : 'text-gray-700'}`}>Difference</p>
            <p className={`text-lg font-bold ${diff > 0 ? 'text-red-900' : diff < 0 ? 'text-green-900' : 'text-gray-900'}`}>
              {diff >= 0 ? '+' : ''}${toNum(diff).toLocaleString('en-US', { minimumFractionDigits: 2 })}
              <span className="text-sm font-normal ml-1">({diffPct >= 0 ? '+' : ''}{diffPct.toFixed(1)}%)</span>
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Per-sheet breakdown */}
      {sheets.map((sheet) => {
        const sDiff = sheet.workingTotal - sheet.lockedTotal;
        const changedCount = sheet.items.filter(i => i.status !== 'unchanged').length;
        return (
          <div key={sheet.sheetName} className="border rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 bg-slate-100 border-b">
              <span className="font-semibold text-sm">{sheet.sheetName}</span>
              <div className="flex items-center gap-3 text-xs">
                {changedCount > 0 && (
                  <Badge variant="outline" className="text-amber-700 border-amber-300">
                    {changedCount} change{changedCount > 1 ? 's' : ''}
                  </Badge>
                )}
                <span className="text-slate-600">
                  Contract: ${toNum(sheet.lockedTotal).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
                <span className="text-slate-600">
                  Actual: ${toNum(sheet.workingTotal).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
                <span className={sDiff > 0 ? 'text-red-700 font-semibold' : sDiff < 0 ? 'text-green-700 font-semibold' : 'text-slate-500'}>
                  {sDiff >= 0 ? '+' : ''}${toNum(sDiff).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 border-b text-left">
                  <th className="px-3 py-1.5 font-medium text-slate-600">Item</th>
                  <th className="px-3 py-1.5 font-medium text-slate-600 text-right">Contract Qty</th>
                  <th className="px-3 py-1.5 font-medium text-slate-600 text-right">Contract Price</th>
                  <th className="px-3 py-1.5 font-medium text-slate-600 text-right">Actual Qty</th>
                  <th className="px-3 py-1.5 font-medium text-slate-600 text-right">Actual Price</th>
                  <th className="px-3 py-1.5 font-medium text-slate-600 text-right">Diff</th>
                  <th className="px-3 py-1.5 font-medium text-slate-600 text-center w-20">Status</th>
                </tr>
              </thead>
              <tbody>
                {sheet.items.map((item, idx) => {
                  const itemDiff = item.workingPrice - item.lockedPrice;
                  return (
                    <tr key={idx} className={`border-b last:border-0 ${statusColors[item.status]}`}>
                      <td className="px-3 py-1.5">
                        {item.name}
                        {item.sku && <span className="text-slate-400 ml-1">({item.sku})</span>}
                      </td>
                      <td className="px-3 py-1.5 text-right">{item.lockedQty}</td>
                      <td className="px-3 py-1.5 text-right">${toNum(item.lockedPrice).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                      <td className="px-3 py-1.5 text-right">{item.workingQty}</td>
                      <td className="px-3 py-1.5 text-right">${toNum(item.workingPrice).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                      <td className={`px-3 py-1.5 text-right font-medium ${itemDiff > 0 ? 'text-red-700' : itemDiff < 0 ? 'text-green-700' : ''}`}>
                        {itemDiff !== 0 ? `${itemDiff >= 0 ? '+' : ''}$${toNum(itemDiff).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '-'}
                      </td>
                      <td className="px-3 py-1.5 text-center">
                        {item.status !== 'unchanged' && (
                          <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${
                            item.status === 'added' ? 'bg-green-200 text-green-900' :
                            item.status === 'removed' ? 'bg-red-200 text-red-900' :
                            'bg-amber-200 text-amber-900'
                          }`}>
                            {statusLabels[item.status]}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
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
  const savingMarkupsRef = useRef<Set<string>>(new Set());
  
  // Line item dialog state
  const [showLineItemDialog, setShowLineItemDialog] = useState(false);
  const [editingLineItem, setEditingLineItem] = useState<CustomRowLineItem | null>(null);
  const [lineItemParentRowId, setLineItemParentRowId] = useState<string | null>(null);
  const [lineItemType, setLineItemType] = useState<'material' | 'labor' | 'combined'>('material');
  const [lineItemForm, setLineItemForm] = useState({
    description: '',
    quantity: '1',
    unit_cost: '0',
    notes: '',
    taxable: true,
    item_type: 'material' as 'material' | 'labor',
    markup_percent: '10',
    // Labor fields for combined items
    labor_hours: '0',
    labor_rate: '60',
    labor_markup_percent: '10',
  });
  
  // Individual row markups state
  const [sheetMarkups, setSheetMarkups] = useState<Record<string, number>>({});
  const [categoryMarkups, setCategoryMarkups] = useState<Record<string, number>>({});
  
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

  // Row name editing state (for inline editing)
  const [editingRowName, setEditingRowName] = useState<string | null>(null);
  const [editingRowNameType, setEditingRowNameType] = useState<'sheet' | 'custom' | 'subcontractor' | null>(null);
  const [tempRowName, setTempRowName] = useState('');

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
  const [linkedSubcontractors, setLinkedSubcontractors] = useState<Record<string, any[]>>({});
  
  // Subcontractor dialog state
  const [showSubcontractorDialog, setShowSubcontractorDialog] = useState(false);
  const [subcontractorParentId, setSubcontractorParentId] = useState<string | null>(null);
  const [subcontractorParentType, setSubcontractorParentType] = useState<'sheet' | 'row' | null>(null);
  const [subcontractorMode, setSubcontractorMode] = useState<'select' | 'upload'>('select');
  const [selectedExistingSubcontractor, setSelectedExistingSubcontractor] = useState<string>('');

  // Remove tab state - this is now a single-view component (Proposal only)

  // Form state for custom rows
  const [category, setCategory] = useState('subcontractor');
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unitCost, setUnitCost] = useState('60');
  const [markupPercent, setMarkupPercent] = useState('0');
  const [notes, setNotes] = useState('');
  const [taxable, setTaxable] = useState(true);
  const [linkedSheetId, setLinkedSheetId] = useState<string | null>(null);

  // Form state for labor pricing
  const [hourlyRate, setHourlyRate] = useState('60');
  
  // Export dialog state
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [showLineItems, setShowLineItems] = useState(false); // Default to false - no row pricing by default
  const [exportViewType, setExportViewType] = useState<'customer' | 'office'>('customer');
  const [exporting, setExporting] = useState(false);
  
  // Proposal state - each proposal is independent
  const [currentProposal, setCurrentProposal] = useState<any>(null);
  const [allProposals, setAllProposals] = useState<any[]>([]);
  const [creatingNewProposal, setCreatingNewProposal] = useState(false);
  const [loadingProposalData, setLoadingProposalData] = useState(false);
  
  // Proposal/Quote state
  const [quote, setQuote] = useState<any>(null);
  const [allJobQuotes, setAllJobQuotes] = useState<any[]>([]); // All quotes for this job
  const [creatingProposal, setCreatingProposal] = useState(false);
  const [proposalChangeNotes, setProposalChangeNotes] = useState('');
  const [showCreateProposalDialog, setShowCreateProposalDialog] = useState(false);
  
  // Use ref to track user's selected quote ID (persists across polling cycles)
  const userSelectedQuoteIdRef = useRef<string | null>(null);

  // Backend may not have quote_id on these tables (OnSpace). When we get 400, stop using quote_id so proposals don't spam errors.
  const quoteIdSupport = useRef({ material_workbooks: true, custom_financial_rows: true, subcontractor_estimates: true });
  function isQuoteIdError(e: any) {
    const msg = String(e?.message || '');
    return e && (e?.code === '42703' || msg.includes('quote_id') || (e as any)?.status === 400);
  }

  // Per-quote in-memory cache so editing one proposal does not change another (isolation without backend quote_id).
  type ProposalCache = {
    customRows: CustomFinancialRow[];
    materialSheets: any[];
    subcontractorEstimates: any[];
    customRowLineItems: Record<string, CustomRowLineItem[]>;
    sheetLabor: Record<string, any>;
    sheetMarkups: Record<string, number>;
    categoryMarkups: Record<string, number>;
    materialsBreakdown: MaterialsBreakdown;
    linkedSubcontractors: Record<string, any[]>;
    subcontractorLineItems: Record<string, any[]>;
    customRowLabor: Record<string, any>;
  };
  const proposalCacheRef = useRef<Record<string, ProposalCache>>({});
  const previousQuoteIdRef = useRef<string | null>(null);
  const [cachePendingForQuoteId, setCachePendingForQuoteId] = useState<string | null>(null);
  
  // Contract comparison state
  const [showComparisonView, setShowComparisonView] = useState(false);
  // Source quote ID for "Create from This" flow
  const [createFromQuoteId, setCreateFromQuoteId] = useState<string | null>(null);
  
  const n = toNum;

  // A proposal is read-only only when it has been signed as a contract
  const isReadOnly = !!(quote?.is_signed);
  
  // Document viewer state
  const [showDocumentViewer, setShowDocumentViewer] = useState(false);
  const [buildingDescription, setBuildingDescription] = useState(job.description || '');
  const [editingDescription, setEditingDescription] = useState(false);
  
  // Template editor state
  const [showTemplateEditor, setShowTemplateEditor] = useState(false);
  
  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    // Clear previous job's data so we don't briefly show it when switching jobs
    setCustomRows([]);
    setCustomRowLabor({});
    setCustomRowLineItems({});
    setSubcontractorEstimates([]);
    setSubcontractorLineItems({});
    setLinkedSubcontractors({});
    setMaterialsBreakdown({
      sheetBreakdowns: [],
      totals: { totalCost: 0, totalPrice: 0, totalProfit: 0, profitMargin: 0 },
    });
    setMaterialSheets([]);
    setSheetLabor({});
    setSheetMarkups({});
    setCategoryMarkups({});
    setQuote(null);
    userSelectedQuoteIdRef.current = null;
    previousQuoteIdRef.current = null;
    proposalCacheRef.current = {};

    loadQuoteData(); // Load proposal/quote first so quote is set before we load financial data

    // Poll only refreshes quote list; do NOT call loadData here — it would use a stale quote and overwrite historical view
    const pollInterval = setInterval(() => {
      loadQuoteData();
    }, 5000);

    return () => clearInterval(pollInterval);
  }, [job.id]);

  // Load financial data when a quote is selected. Use per-quote cache so editing one proposal does not change another.
  useEffect(() => {
    if (!quote?.id) return;
    const prevId = previousQuoteIdRef.current;
    // Save current state to previous quote's cache before switching
    if (prevId && prevId !== quote.id) {
      proposalCacheRef.current[prevId] = {
        customRows,
        materialSheets,
        subcontractorEstimates,
        customRowLineItems,
        sheetLabor,
        sheetMarkups,
        categoryMarkups,
        materialsBreakdown,
        linkedSubcontractors,
        subcontractorLineItems,
        customRowLabor,
      };
    }
    previousQuoteIdRef.current = quote.id;

    const cached = proposalCacheRef.current[quote.id];
    if (cached) {
      setCustomRows(cached.customRows ?? []);
      setMaterialSheets(cached.materialSheets ?? []);
      setSubcontractorEstimates(cached.subcontractorEstimates ?? []);
      setCustomRowLineItems(cached.customRowLineItems ?? {});
      setSheetLabor(cached.sheetLabor ?? {});
      setSheetMarkups(cached.sheetMarkups ?? {});
      setCategoryMarkups(cached.categoryMarkups ?? {});
      setMaterialsBreakdown(cached.materialsBreakdown ?? { sheetBreakdowns: [], totals: { totalCost: 0, totalPrice: 0, totalProfit: 0, profitMargin: 0 } });
      setLinkedSubcontractors(cached.linkedSubcontractors ?? {});
      setSubcontractorLineItems(cached.subcontractorLineItems ?? {});
      setCustomRowLabor(cached.customRowLabor ?? {});
      return;
    }

    loadData(false).then(() => setCachePendingForQuoteId(quote.id));
  }, [quote?.id]);

  // After loadData completes, write current state to this quote's cache
  useEffect(() => {
    if (!cachePendingForQuoteId || !quote?.id || quote.id !== cachePendingForQuoteId) return;
    proposalCacheRef.current[quote.id] = {
      customRows,
      materialSheets,
      subcontractorEstimates,
      customRowLineItems,
      sheetLabor,
      sheetMarkups,
      categoryMarkups,
      materialsBreakdown,
      linkedSubcontractors,
      subcontractorLineItems,
      customRowLabor,
    };
    setCachePendingForQuoteId(null);
  }, [cachePendingForQuoteId, quote?.id, customRows, materialSheets, subcontractorEstimates, customRowLineItems, sheetLabor, sheetMarkups, categoryMarkups, materialsBreakdown, linkedSubcontractors, subcontractorLineItems, customRowLabor]);

  // Auto-create first proposal (with -1 suffix) for new jobs
  useEffect(() => {
    if (!loading && !quote) {
      // Small delay to ensure all data is loaded
      const timer = setTimeout(() => {
        autoCreateFirstProposal();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [loading, quote]);

  async function loadQuoteData() {
    try {
      let quoteData = null;
      
      // Load ALL quotes for this job (for navigation)
      const { data: allQuotes, error: allQuotesError } = await supabase
        .from('quotes')
        .select('*')
        .eq('job_id', job.id)
        .order('created_at', { ascending: false });
      
      if (allQuotesError) {
        console.error('Error loading all quotes:', allQuotesError);
        return;
      }
      
      // Store all quotes for navigation
      setAllJobQuotes(allQuotes || []);
      
      // Try 1: Direct job_id match (get the most recent one)
      const { data: directMatch, error: directError } = await supabase
        .from('quotes')
        .select('*')
        .eq('job_id', job.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (directError && directError.code !== 'PGRST116') {
        console.error('Error loading quote by job_id:', directError);
      }

      if (directMatch) {
        quoteData = directMatch;
        console.log('Found quote by job_id:', quoteData.id);
      } else {
        // Try 2: Exact customer name and address match
        const { data: exactMatches, error: exactError } = await supabase
          .from('quotes')
          .select('*')
          .eq('customer_name', job.client_name)
          .eq('customer_address', job.address)
          .order('created_at', { ascending: false })
          .limit(1);

        if (!exactError && exactMatches && exactMatches.length > 0) {
          quoteData = exactMatches[0];
          console.log('Found quote by exact match:', quoteData.id);
        } else {
          // Try 3: Case-insensitive partial match
          const { data: allQuotes, error: allError } = await supabase
            .from('quotes')
            .select('*')
            .is('job_id', null)
            .order('created_at', { ascending: false });

          if (!allError && allQuotes) {
            // Find best match by comparing customer names (case-insensitive)
            const normalizedJobName = job.client_name.toLowerCase().trim();
            const normalizedJobAddress = job.address.toLowerCase().trim();
            
            const match = allQuotes.find(q => {
              const qName = (q.customer_name || '').toLowerCase().trim();
              const qAddress = (q.customer_address || '').toLowerCase().trim();
              return qName === normalizedJobName && qAddress === normalizedJobAddress;
            });

            if (match) {
              quoteData = match;
              console.log('Found quote by case-insensitive match:', quoteData.id);
            } else {
              // Try 4: Match by customer name only (if unique)
              const nameMatches = allQuotes.filter(q => 
                (q.customer_name || '').toLowerCase().trim() === normalizedJobName
              );
              
              if (nameMatches.length === 1) {
                quoteData = nameMatches[0];
                console.log('Found quote by unique customer name:', quoteData.id);
              }
            }
          }
        }
        
        // If we found a match via fallback, link it to the job
        if (quoteData) {
          console.log('Linking quote', quoteData.id, 'to job', job.id);
          const { error: updateError } = await supabase
            .from('quotes')
            .update({ job_id: job.id })
            .eq('id', quoteData.id);
            
          if (updateError) {
            console.error('Error linking quote to job:', updateError);
          } else {
            console.log('Successfully linked quote to job');
          }
        }
      }

      // If we have quotes, use the most recent one by default (unless user navigated to a different one)
      if (allQuotes && allQuotes.length > 0) {
        // Check if user has manually selected a specific quote
        if (userSelectedQuoteIdRef.current) {
          // User has navigated to a specific quote - keep it selected
          const selectedQuote = allQuotes.find(q => q.id === userSelectedQuoteIdRef.current);
          if (selectedQuote) {
            quoteData = selectedQuote;
            setQuote(quoteData);
            console.log('Keeping user-selected quote:', quoteData.proposal_number);
          } else {
            // Selected quote not in list (e.g. transient): keep current quote so historical view doesn't disappear
            userSelectedQuoteIdRef.current = null;
            if (quote) {
              quoteData = quote;
              console.log('Selected quote not in list, keeping current view');
            } else {
              quoteData = allQuotes[0];
              setQuote(quoteData);
              userSelectedQuoteIdRef.current = quoteData.id;
            }
          }
        } else if (!quote) {
          // No user selection and no current quote, use the most recent
          quoteData = allQuotes[0];
          setQuote(quoteData);
          userSelectedQuoteIdRef.current = quoteData.id;
          console.log('Loaded most recent quote:', quoteData.proposal_number);
        } else {
          // No user selection but quote exists, keep current quote
          quoteData = quote;
          console.log('Keeping current quote:', quoteData.proposal_number);
        }
      } else {
        console.log('No quotes found for job');
        // Only clear selection when we have no quotes; if ref is set, keep current quote to avoid flicker from transient empty response
        if (!userSelectedQuoteIdRef.current) {
          setQuote(null);
        }
        userSelectedQuoteIdRef.current = null;
      }
    } catch (error: any) {
      console.error('Error loading quote data:', error);
    }
  }

  async function createNewProposal(sourceQuoteId?: string) {
    if (!profile) return;

    const srcId = sourceQuoteId || createFromQuoteId || quote?.id;
    if (!srcId) {
      toast.error('No source proposal to duplicate from');
      return;
    }

    setCreatingProposal(true);
    
    try {
      // Determine next proposal number
      const maxSuffix = allJobQuotes.reduce((max, q) => {
        const parts = (q.proposal_number || '').split('-');
        const num = parseInt(parts[parts.length - 1], 10);
        return isNaN(num) ? max : Math.max(max, num);
      }, 0);
      const nextSuffix = maxSuffix + 1;

      // Load the source quote for metadata
      const { data: srcQuote, error: srcErr } = await supabase
        .from('quotes')
        .select('*')
        .eq('id', srcId)
        .single();
      if (srcErr || !srcQuote) throw srcErr || new Error('Source proposal not found');

      // Build the new proposal number: keep prefix, bump suffix
      const prefix = (srcQuote.proposal_number || '').split('-').slice(0, -1).join('-');
      const newProposalNumber = prefix ? `${prefix}-${nextSuffix}` : `${job.id.slice(0, 6)}-${nextSuffix}`;

      // 1. Create new quote row
      const { data: newQuote, error: quoteErr } = await supabase
        .from('quotes')
        .insert({
          job_id: job.id,
          customer_name: srcQuote.customer_name,
          customer_address: srcQuote.customer_address,
          customer_email: srcQuote.customer_email,
          customer_phone: srcQuote.customer_phone,
          project_name: srcQuote.project_name,
          building_description: srcQuote.building_description,
          width: srcQuote.width,
          length: srcQuote.length,
          status: 'draft',
          proposal_number: newProposalNumber,
          created_by: profile.id,
        })
        .select()
        .single();
      if (quoteErr || !newQuote) throw quoteErr || new Error('Failed to create new proposal');

      // 2. Duplicate material workbooks (working copy from source)
      const { data: srcWorkbooks } = await supabase
        .from('material_workbooks')
        .select('*')
        .eq('quote_id', srcId)
        .eq('status', 'working');

      for (const wb of srcWorkbooks || []) {
        const { data: newWb, error: wbErr } = await supabase
          .from('material_workbooks')
          .insert({
            job_id: wb.job_id,
            quote_id: newQuote.id,
            name: wb.name,
            status: 'working',
          })
          .select()
          .single();
        if (wbErr || !newWb) continue;

        // 3. Duplicate sheets
        const { data: srcSheets } = await supabase
          .from('material_sheets')
          .select('*')
          .eq('workbook_id', wb.id)
          .order('order_index');

        const sheetIdMap: Record<string, string> = {};
        for (const sheet of srcSheets || []) {
          const { data: newSheet, error: sheetErr } = await supabase
            .from('material_sheets')
            .insert({
              workbook_id: newWb.id,
              sheet_name: sheet.sheet_name,
              description: sheet.description,
              order_index: sheet.order_index,
            })
            .select()
            .single();
          if (sheetErr || !newSheet) continue;
          sheetIdMap[sheet.id] = newSheet.id;

          // 4. Duplicate items
          const { data: srcItems } = await supabase
            .from('material_items')
            .select('*')
            .eq('sheet_id', sheet.id);
          if (srcItems && srcItems.length > 0) {
            await supabase.from('material_items').insert(
              srcItems.map(item => ({
                sheet_id: newSheet.id,
                material_name: item.material_name,
                sku: item.sku,
                category: item.category,
                quantity: item.quantity,
                unit: item.unit,
                cost_per_unit: item.cost_per_unit,
                price_per_unit: item.price_per_unit,
                notes: item.notes,
                order_index: item.order_index,
              }))
            );
          }

          // 5. Duplicate sheet labor
          const { data: srcLabor } = await supabase
            .from('material_sheet_labor')
            .select('*')
            .eq('sheet_id', sheet.id);
          if (srcLabor && srcLabor.length > 0) {
            await supabase.from('material_sheet_labor').insert(
              srcLabor.map(l => ({
                sheet_id: newSheet.id,
                description: l.description,
                estimated_hours: l.estimated_hours,
                hourly_rate: l.hourly_rate,
                notes: l.notes,
              }))
            );
          }

          // 6. Duplicate category markups
          const { data: srcMarkups } = await supabase
            .from('material_category_markups')
            .select('*')
            .eq('sheet_id', sheet.id);
          if (srcMarkups && srcMarkups.length > 0) {
            await supabase.from('material_category_markups').insert(
              srcMarkups.map(m => ({
                sheet_id: newSheet.id,
                category_name: m.category_name,
                markup_percent: m.markup_percent,
              }))
            );
          }
        }
      }

      // 7. Duplicate custom financial rows
      const { data: srcRows } = await supabase
        .from('custom_financial_rows')
        .select('*')
        .eq('quote_id', srcId)
        .order('order_index');

      const rowIdMap: Record<string, string> = {};
      for (const row of srcRows || []) {
        const { data: newRow, error: rowErr } = await supabase
          .from('custom_financial_rows')
          .insert({
            job_id: job.id,
            quote_id: newQuote.id,
            category: row.category,
            description: row.description,
            quantity: row.quantity,
            unit_cost: row.unit_cost,
            total_cost: row.total_cost,
            markup_percent: row.markup_percent,
            selling_price: row.selling_price,
            notes: row.notes,
            order_index: row.order_index,
            taxable: row.taxable,
            sheet_id: row.sheet_id,
          })
          .select()
          .single();
        if (rowErr || !newRow) continue;
        rowIdMap[row.id] = newRow.id;

        // 8. Duplicate row line items
        const { data: srcLineItems } = await supabase
          .from('custom_financial_row_items')
          .select('*')
          .eq('row_id', row.id)
          .order('order_index');
        if (srcLineItems && srcLineItems.length > 0) {
          await supabase.from('custom_financial_row_items').insert(
            srcLineItems.map(li => ({
              row_id: newRow.id,
              sheet_id: li.sheet_id,
              description: li.description,
              quantity: li.quantity,
              unit_cost: li.unit_cost,
              total_cost: li.total_cost,
              notes: li.notes,
              order_index: li.order_index,
              taxable: li.taxable,
              markup_percent: li.markup_percent,
              item_type: li.item_type,
            }))
          );
        }
      }

      // 9. Duplicate subcontractor estimates
      const { data: srcEstimates } = await supabase
        .from('subcontractor_estimates')
        .select('*')
        .eq('quote_id', srcId)
        .order('order_index');

      for (const est of srcEstimates || []) {
        const { data: newEst, error: estErr } = await supabase
          .from('subcontractor_estimates')
          .insert({
            job_id: job.id,
            quote_id: newQuote.id,
            company_name: est.company_name,
            contact_name: est.contact_name,
            email: est.email,
            phone: est.phone,
            total_amount: est.total_amount,
            markup_percent: est.markup_percent,
            notes: est.notes,
            exclusions: est.exclusions,
            order_index: est.order_index,
            sheet_id: est.sheet_id,
            row_id: est.row_id,
          })
          .select()
          .single();
        if (estErr || !newEst) continue;

        // 10. Duplicate estimate line items
        const { data: srcSubItems } = await supabase
          .from('subcontractor_estimate_line_items')
          .select('*')
          .eq('estimate_id', est.id)
          .order('order_index');
        if (srcSubItems && srcSubItems.length > 0) {
          await supabase.from('subcontractor_estimate_line_items').insert(
            srcSubItems.map(si => ({
              estimate_id: newEst.id,
              description: si.description,
              quantity: si.quantity,
              unit_price: si.unit_price,
              total_price: si.total_price,
              notes: si.notes,
              order_index: si.order_index,
              excluded: si.excluded,
              taxable: si.taxable,
              item_type: si.item_type,
              markup_percent: si.markup_percent,
            }))
          );
        }
      }

      setQuote(newQuote);
      userSelectedQuoteIdRef.current = newQuote.id;
      
      toast.success(`New proposal ${newQuote.proposal_number} created with independent data`);
      setShowCreateProposalDialog(false);
      setProposalChangeNotes('');
      setCreateFromQuoteId(null);
      
      await loadQuoteData();
      await loadData(false);
    } catch (error: any) {
      console.error('Error creating new proposal:', error);
      toast.error('Failed to create new proposal: ' + error.message);
    } finally {
      setCreatingProposal(false);
    }
  }

  async function autoCreateFirstProposal() {
    if (quote) return;
    
    try {
      const { data: existingQuote, error: fetchError } = await supabase
        .from('quotes')
        .select('*')
        .eq('job_id', job.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (fetchError && fetchError.code !== 'PGRST116') throw fetchError;

      if (existingQuote) {
        setQuote(existingQuote);
        return;
      }

      // Create first proposal directly (no RPC)
      const { data: newQuote, error: createError } = await supabase
        .from('quotes')
        .insert({
          job_id: job.id,
          customer_name: job.client_name,
          customer_address: job.address,
          project_name: job.name,
          status: 'draft',
          width: 0,
          length: 0,
          proposal_number: `${job.id.slice(0, 6)}-1`,
          created_by: profile?.id,
        })
        .select()
        .single();

      if (createError) throw createError;

      setQuote(newQuote);
      userSelectedQuoteIdRef.current = newQuote.id;
      await loadQuoteData();
      toast.success('First proposal created automatically');
    } catch (error: any) {
      console.error('Error in autoCreateFirstProposal:', error);
    }
  }

  async function signAsContract() {
    if (!quote || quote.is_signed) return;
    if (!confirm('Sign this proposal as a contract? The workbook will be locked and a working copy created.')) return;

    try {
      // 1. Mark the quote as signed
      const { error: signErr } = await supabase
        .from('quotes')
        .update({ is_signed: true, signed_at: new Date().toISOString() })
        .eq('id', quote.id);
      if (signErr) throw signErr;

      // 2. Find the current working workbook and lock it
      let currentWb: any = null;
      if (quoteIdSupport.current.material_workbooks) {
        const { data: cwb1 } = await supabase
          .from('material_workbooks')
          .select('*')
          .eq('quote_id', quote.id)
          .eq('status', 'working')
          .maybeSingle();
        if (cwb1) currentWb = cwb1;
      }
      if (!currentWb) {
        const { data: cwbF } = await supabase
          .from('material_workbooks')
          .select('*')
          .eq('job_id', job.id)
          .eq('status', 'working')
          .limit(1);
        if (cwbF?.[0]) currentWb = cwbF[0];
      }

      if (currentWb) {
        await supabase
          .from('material_workbooks')
          .update({ status: 'locked' })
          .eq('id', currentWb.id);

        // 3. Duplicate the workbook as a new working copy
        const newWbPayload: Record<string, unknown> = {
          job_id: currentWb.job_id,
          name: currentWb.name,
          status: 'working',
        };
        if (quoteIdSupport.current.material_workbooks && quote?.id) newWbPayload.quote_id = quote.id;
        const { data: newWb, error: wbErr } = await supabase
          .from('material_workbooks')
          .insert(newWbPayload)
          .select()
          .single();

        if (!wbErr && newWb) {
          const { data: srcSheets } = await supabase
            .from('material_sheets')
            .select('*')
            .eq('workbook_id', currentWb.id)
            .order('order_index');

          for (const sheet of srcSheets || []) {
            const { data: newSheet } = await supabase
              .from('material_sheets')
              .insert({
                workbook_id: newWb.id,
                sheet_name: sheet.sheet_name,
                description: sheet.description,
                order_index: sheet.order_index,
              })
              .select()
              .single();
            if (!newSheet) continue;

            const { data: srcItems } = await supabase
              .from('material_items')
              .select('*')
              .eq('sheet_id', sheet.id);
            if (srcItems && srcItems.length > 0) {
              await supabase.from('material_items').insert(
                srcItems.map(item => ({
                  sheet_id: newSheet.id,
                  material_name: item.material_name,
                  sku: item.sku,
                  category: item.category,
                  quantity: item.quantity,
                  unit: item.unit,
                  cost_per_unit: item.cost_per_unit,
                  price_per_unit: item.price_per_unit,
                  notes: item.notes,
                  order_index: item.order_index,
                }))
              );
            }

            const { data: srcLabor } = await supabase
              .from('material_sheet_labor')
              .select('*')
              .eq('sheet_id', sheet.id);
            if (srcLabor && srcLabor.length > 0) {
              await supabase.from('material_sheet_labor').insert(
                srcLabor.map(l => ({
                  sheet_id: newSheet.id,
                  description: l.description,
                  estimated_hours: l.estimated_hours,
                  hourly_rate: l.hourly_rate,
                  notes: l.notes,
                }))
              );
            }

            const { data: srcMarkups } = await supabase
              .from('material_category_markups')
              .select('*')
              .eq('sheet_id', sheet.id);
            if (srcMarkups && srcMarkups.length > 0) {
              await supabase.from('material_category_markups').insert(
                srcMarkups.map(m => ({
                  sheet_id: newSheet.id,
                  category_name: m.category_name,
                  markup_percent: m.markup_percent,
                }))
              );
            }
          }
        }
      }

      // Refresh quote to pick up is_signed flag
      const { data: updatedQuote } = await supabase
        .from('quotes')
        .select('*')
        .eq('id', quote.id)
        .single();
      if (updatedQuote) {
        setQuote(updatedQuote);
      }

      toast.success('Proposal signed as contract! Working copy created for tracking.');
      await loadData(false);
    } catch (error: any) {
      console.error('Error signing as contract:', error);
      toast.error('Failed to sign as contract: ' + error.message);
    }
  }

  async function manuallyCreateQuote() {
    if (quote) {
      toast.info('Proposal number already exists');
      return;
    }

    try {
      // Double-check for existing quote before creating
      const { data: existingQuote } = await supabase
        .from('quotes')
        .select('*')
        .eq('job_id', job.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingQuote) {
        setQuote(existingQuote);
        toast.info(`Using existing proposal #${existingQuote.proposal_number}`);
        return;
      }

      const { data: newQuote, error: createError } = await supabase
        .from('quotes')
        .insert({
          job_id: job.id,
          customer_name: job.client_name,
          customer_address: job.address,
          project_name: job.name,
          status: 'draft',
          width: 0,
          length: 0,
          created_by: profile?.id,
        })
        .select()
        .single();

      if (createError) throw createError;

      setQuote(newQuote);
      
      toast.success(`Proposal #${newQuote.proposal_number} created!`);
    } catch (error: any) {
      console.error('Error creating quote:', error);
      toast.error('Failed to create proposal number');
    }
  }

  // Proposal navigation: set quote and ref; the effect (quote?.id) will load data for the selected quote
  function navigateToPreviousProposal() {
    if (allJobQuotes.length === 0) return;
    const currentIndex = allJobQuotes.findIndex(q => q.id === quote?.id);
    if (currentIndex < allJobQuotes.length - 1) {
      const olderQuote = allJobQuotes[currentIndex + 1];
      userSelectedQuoteIdRef.current = olderQuote.id;
      setQuote(olderQuote);
      toast.info(`📖 Viewing proposal ${olderQuote.proposal_number}`);
    }
  }

  function navigateToNextProposal() {
    if (allJobQuotes.length === 0) return;
    const currentIndex = allJobQuotes.findIndex(q => q.id === quote?.id);
    if (currentIndex > 0) {
      const newerQuote = allJobQuotes[currentIndex - 1];
      userSelectedQuoteIdRef.current = newerQuote.id;
      setQuote(newerQuote);
      const isNowCurrent = currentIndex === 1;
      if (isNowCurrent) {
        toast.info(`✏️ Viewing current proposal ${newerQuote.proposal_number} - editing enabled`);
      } else {
        toast.info(`📖 Viewing proposal ${newerQuote.proposal_number}`);
      }
    }
  }

  async function loadData(silent = false) {
    if (!silent) {
      setLoading(true);
    }
    try {
      const results = await Promise.allSettled([
        loadCustomRows(),
        loadLaborPricing(),
        loadLaborHours(),
        loadMaterialsData(),
        loadSubcontractorEstimates(),
      ]);
      const failures = results.filter(r => r.status === 'rejected');
      if (failures.length > 0) {
        failures.forEach(f => console.error('Loader failed:', (f as PromiseRejectedResult).reason));
        if (!silent) {
          toast.error('Some financial data failed to load – check console for details');
        }
      }
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
      if (!quote?.id) {
        setSubcontractorEstimates([]);
        setSubcontractorLineItems({});
        setLinkedSubcontractors({});
        return;
      }

      // Load all estimates for this job to find this quote's data or a source to duplicate from
      let allEstimates: any[] | null = null;
      const { data: est1, error: estErr1 } = await supabase
        .from('subcontractor_estimates')
        .select('*')
        .eq('job_id', job.id)
        .order('order_index');
      if (estErr1) {
        console.warn('subcontractor_estimates query with job_id failed, trying select all:', estErr1.message || estErr1);
        const { data: est2, error: estErr2 } = await supabase
          .from('subcontractor_estimates')
          .select('*')
          .order('order_index');
        if (estErr2) throw estErr2;
        allEstimates = (est2 || []).filter((e: any) => e.job_id === job.id);
      } else {
        allEstimates = est1;
      }
      if (!allEstimates) allEstimates = [];

      let rowsForQuote = (allEstimates || []).filter((r: any) => r.quote_id === quote.id);
      // Do NOT reuse legacy (quote_id null) estimates as this quote's — duplicate so edits only affect this proposal.

      // Find best source estimates to fill from (legacy null first, then the quote with the most estimates)
      const otherEstimates = (allEstimates || []).filter((r: any) => r.quote_id !== quote.id);
      let sourceEstimates: any[] = [];
      if (otherEstimates.length > 0) {
        const legacyEsts = otherEstimates.filter((r: any) => r.quote_id == null);
        if (legacyEsts.length > 0) {
          sourceEstimates = legacyEsts;
        } else {
          const bestQid = otherEstimates.reduce((best: { id: string; count: number } | null, r: any) => {
            const qid = r.quote_id;
            if (!qid) return best;
            const cnt = otherEstimates.filter((x: any) => x.quote_id === qid).length;
            if (!best || cnt > best.count) return { id: qid, count: cnt };
            return best;
          }, null)?.id;
          if (bestQid) sourceEstimates = otherEstimates.filter((r: any) => r.quote_id === bestQid);
        }
      }

      // Copy missing estimates (match by company_name to avoid duplicates); only when backend supports quote_id
      if (sourceEstimates.length > 0 && quoteIdSupport.current.subcontractor_estimates) {
        try {
          const existingNames = new Set(rowsForQuote.map((e: any) => e.company_name));
          const missingEsts = sourceEstimates.filter((e: any) => !existingNames.has(e.company_name));
          if (missingEsts.length > 0) {
            const newEstimates: any[] = [];
            for (const est of missingEsts) {
              const estPayload: Record<string, unknown> = {
                job_id: job.id,
                company_name: est.company_name,
                contact_name: est.contact_name,
                email: est.email,
                phone: est.phone,
                total_amount: est.total_amount,
                markup_percent: est.markup_percent,
                notes: est.notes,
                exclusions: est.exclusions,
                order_index: est.order_index,
                sheet_id: null,
                row_id: null,
              };
              if (quoteIdSupport.current.subcontractor_estimates && quote?.id) estPayload.quote_id = quote.id;
              const { data: newEst, error: estErr } = await supabase
                .from('subcontractor_estimates')
                .insert(estPayload)
                .select()
                .single();
              if (estErr) {
                if (isQuoteIdError(estErr)) quoteIdSupport.current.subcontractor_estimates = false;
                continue;
              }
              if (!newEst) continue;
              newEstimates.push(newEst);
              const { data: srcSubItems } = await supabase
                .from('subcontractor_estimate_line_items')
                .select('*')
                .eq('estimate_id', est.id)
                .order('order_index');
              if (srcSubItems?.length) {
                await supabase.from('subcontractor_estimate_line_items').insert(
                  srcSubItems.map((si: any) => ({
                    estimate_id: newEst.id,
                    description: si.description,
                    quantity: si.quantity,
                    unit_price: si.unit_price,
                    total_price: si.total_price,
                    notes: si.notes,
                    order_index: si.order_index,
                    excluded: si.excluded,
                    taxable: si.taxable,
                    item_type: si.item_type,
                    markup_percent: si.markup_percent,
                  }))
                );
              }
            }
            rowsForQuote = [...rowsForQuote, ...newEstimates];
          }
        } catch (dupErr: any) {
          console.error('Subcontractor estimates fill failed:', dupErr);
          if (isQuoteIdError(dupErr)) quoteIdSupport.current.subcontractor_estimates = false;
          if (rowsForQuote.length === 0 && sourceEstimates.length > 0) {
            rowsForQuote = [...sourceEstimates];
          }
        }
      }
      if (rowsForQuote.length === 0 && sourceEstimates.length > 0 && !quoteIdSupport.current.subcontractor_estimates) {
        rowsForQuote = [...sourceEstimates];
      }

      const newData = rowsForQuote;
      const deduped = newData.filter((e: any, i: number, a: any[]) => a.findIndex((x: any) => x.id === e.id) === i);
      if (JSON.stringify(deduped) !== JSON.stringify(subcontractorEstimates)) {
        setSubcontractorEstimates(deduped);
      }

      const linkedMap: Record<string, any[]> = {};
      deduped.forEach(est => {
        if (est.sheet_id) {
          if (!linkedMap[est.sheet_id]) linkedMap[est.sheet_id] = [];
          linkedMap[est.sheet_id].push(est);
        } else if (est.row_id) {
          if (!linkedMap[est.row_id]) linkedMap[est.row_id] = [];
          linkedMap[est.row_id].push(est);
        }
      });
      setLinkedSubcontractors(linkedMap);

      if (deduped.length > 0) {
        const estimateIds = deduped.map(e => e.id);
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
      } else {
        setSubcontractorLineItems({});
      }
    } catch (error: any) {
      console.error('Error loading subcontractor estimates:', error);
    }
  }

  async function loadMaterialsData() {
    try {
      if (!quote?.id) {
        setMaterialsBreakdown({ sheetBreakdowns: [], totals: { totalCost: 0, totalPrice: 0, totalProfit: 0, profitMargin: 0 } });
        setMaterialSheets([]);
        setSheetLabor({});
        setSheetMarkups({});
        return;
      }

      // Load the working workbook for this quote; if multiple exist, use the one with the most sheets
      let workbookData: { id: string } | undefined;
      let wbForQuoteList: { id: string }[] | null = null;
      let wbErr1: any = null;
      let wbData1: { id: string }[] | null = null;
      if (quoteIdSupport.current.material_workbooks) {
        const res = await supabase
          .from('material_workbooks')
          .select('id')
          .eq('job_id', job.id)
          .eq('status', 'working')
          .eq('quote_id', quote.id);
        wbErr1 = res.error;
        wbData1 = res.data;
      }
      const useFallback = wbErr1 || !quoteIdSupport.current.material_workbooks;
      if (useFallback) {
        if (wbErr1 && isQuoteIdError(wbErr1)) quoteIdSupport.current.material_workbooks = false;
        if (wbErr1) console.warn('material_workbooks query failed, trying without quote_id:', wbErr1.message || wbErr1);
        const { data: fallbackList } = await supabase
          .from('material_workbooks')
          .select('id')
          .eq('job_id', job.id)
          .eq('status', 'working');
        if (fallbackList?.length) {
          if (fallbackList.length === 1) {
            wbForQuoteList = fallbackList;
          } else {
            const wbIds = fallbackList.map((w: any) => w.id);
            const { data: sheetRows } = await supabase
              .from('material_sheets')
              .select('id, workbook_id')
              .in('workbook_id', wbIds);
            const countByWb: Record<string, number> = {};
            (sheetRows || []).forEach((s: any) => { countByWb[s.workbook_id] = (countByWb[s.workbook_id] || 0) + 1; });
            const sheetIdsAll = (sheetRows || []).map((s: any) => s.id);
            let laborCountByWb: Record<string, number> = {};
            if (sheetIdsAll.length > 0) {
              const { data: laborRows } = await supabase
                .from('material_sheet_labor')
                .select('sheet_id')
                .in('sheet_id', sheetIdsAll);
              const sheetToWb: Record<string, string> = {};
              (sheetRows || []).forEach((s: any) => { sheetToWb[s.id] = s.workbook_id; });
              (laborRows || []).forEach((l: any) => {
                const wbId = sheetToWb[l.sheet_id];
                if (wbId) laborCountByWb[wbId] = (laborCountByWb[wbId] || 0) + 1;
              });
            }
            const best = fallbackList.reduce((a: any, b: any) => {
              const scoreA = (countByWb[a.id] || 0) + (laborCountByWb[a.id] || 0);
              const scoreB = (countByWb[b.id] || 0) + (laborCountByWb[b.id] || 0);
              return scoreA >= scoreB ? a : b;
            });
            wbForQuoteList = [best];
          }
        } else {
          wbForQuoteList = null;
        }
      } else if (wbData1?.length) {
        wbForQuoteList = wbData1;
      }

      if (wbForQuoteList?.length) {
        if (wbForQuoteList.length === 1) {
          workbookData = wbForQuoteList[0];
        } else {
          const { data: allSheetsForJob } = await supabase
            .from('material_sheets')
            .select('workbook_id')
            .in('workbook_id', wbForQuoteList.map((w: any) => w.id));
          const countByWb: Record<string, number> = {};
          (allSheetsForJob || []).forEach((s: any) => { countByWb[s.workbook_id] = (countByWb[s.workbook_id] || 0) + 1; });
          const best = wbForQuoteList.reduce((a: any, b: any) => (countByWb[a.id] || 0) >= (countByWb[b.id] || 0) ? a : b);
          workbookData = best;
        }
      }
      if (!workbookData) {
        // No workbook for this quote yet. Find the workbook for this job that has the MOST sheets and duplicate from it.
        try {
          let allJobWbs: { id: string; job_id: string; name?: string }[] | null = null;
          const { data: jobWbs1, error: jobWbsErr } = await supabase
            .from('material_workbooks')
            .select('id, job_id, name')
            .eq('job_id', job.id);
          if (jobWbsErr) {
            const { data: jobWbs2 } = await supabase.from('material_workbooks').select('id, job_id, name');
            allJobWbs = (jobWbs2 || []).filter((w: any) => w.job_id === job.id);
          } else {
            allJobWbs = jobWbs1;
          }
          if (!allJobWbs?.length) { /* no workbooks at all */ } else {
            const { data: allSheets } = await supabase
              .from('material_sheets')
              .select('workbook_id')
              .in('workbook_id', allJobWbs.map((w: any) => w.id));
            const sheetCountByWb: Record<string, number> = {};
            (allSheets || []).forEach((s: any) => { sheetCountByWb[s.workbook_id] = (sheetCountByWb[s.workbook_id] || 0) + 1; });
            const fullestWb = allJobWbs.reduce((a: any, b: any) => (sheetCountByWb[a.id] || 0) >= (sheetCountByWb[b.id] || 0) ? a : b);
            const sourceWb = fullestWb;

          if (sourceWb) {
            const wbPayload: Record<string, unknown> = {
              job_id: sourceWb.job_id,
              name: sourceWb.name ?? undefined,
              status: 'working',
            };
            if (quoteIdSupport.current.material_workbooks && quote?.id) wbPayload.quote_id = quote.id;
            const { data: newWb, error: wbErr } = await supabase
              .from('material_workbooks')
              .insert(wbPayload)
              .select('id')
              .single();
            if (wbErr) {
              if (isQuoteIdError(wbErr)) quoteIdSupport.current.material_workbooks = false;
              throw wbErr;
            }
            if (newWb) {
              const { data: srcSheets } = await supabase
                .from('material_sheets')
                .select('*')
                .eq('workbook_id', sourceWb.id)
                .order('order_index');
              for (const sheet of srcSheets || []) {
                const { data: newSheet, error: sheetErr } = await supabase
                  .from('material_sheets')
                  .insert({
                    workbook_id: newWb.id,
                    sheet_name: sheet.sheet_name,
                    description: sheet.description,
                    order_index: sheet.order_index,
                  })
                  .select('id')
                  .single();
                if (sheetErr || !newSheet) continue;
                const { data: srcItems } = await supabase.from('material_items').select('*').eq('sheet_id', sheet.id);
                if (srcItems?.length) {
                  await supabase.from('material_items').insert(
                    srcItems.map((item: any) => ({
                      sheet_id: newSheet.id,
                      material_name: item.material_name,
                      sku: item.sku,
                      category: item.category,
                      quantity: item.quantity,
                      unit: item.unit,
                      cost_per_unit: item.cost_per_unit,
                      price_per_unit: item.price_per_unit,
                      notes: item.notes,
                      order_index: item.order_index,
                    }))
                  );
                }
                const { data: srcLabor } = await supabase.from('material_sheet_labor').select('*').eq('sheet_id', sheet.id);
                if (srcLabor?.length) {
                  await supabase.from('material_sheet_labor').insert(
                    srcLabor.map((l: any) => ({
                      sheet_id: newSheet.id,
                      description: l.description,
                      estimated_hours: l.estimated_hours,
                      hourly_rate: l.hourly_rate,
                      notes: l.notes,
                    }))
                  );
                }
                const { data: srcMarkups } = await supabase.from('material_category_markups').select('*').eq('sheet_id', sheet.id);
                if (srcMarkups?.length) {
                  await supabase.from('material_category_markups').insert(
                    srcMarkups.map((m: any) => ({
                      sheet_id: newSheet.id,
                      category_name: m.category_name,
                      markup_percent: m.markup_percent,
                    }))
                  );
                }
              }
              workbookData = { id: newWb.id };
            }
          }
          }
        } catch (dupErr: any) {
          console.error('Workbook duplicate failed:', dupErr);
        }
      }

      // If we used fallback (e.g. no quote_id on backend), duplicate the shared workbook for this quote so edits only affect this proposal (only when backend supports quote_id)
      if (workbookData && wbErr1 && quoteIdSupport.current.material_workbooks) {
        try {
          const { data: wbRow } = await supabase.from('material_workbooks').select('id, job_id, name').eq('id', workbookData.id).single();
          if (wbRow) {
            const { data: newWb, error: wbErr } = await supabase
              .from('material_workbooks')
              .insert({
                job_id: wbRow.job_id,
                quote_id: quote.id,
                name: wbRow.name ?? undefined,
                status: 'working',
              })
              .select('id')
              .single();
            if (!wbErr && newWb) {
              const { data: srcSheets } = await supabase
                .from('material_sheets')
                .select('*')
                .eq('workbook_id', wbRow.id)
                .order('order_index');
              for (const sheet of srcSheets || []) {
                const { data: newSheet, error: sheetErr } = await supabase
                  .from('material_sheets')
                  .insert({
                    workbook_id: newWb.id,
                    sheet_name: sheet.sheet_name,
                    description: sheet.description,
                    order_index: sheet.order_index,
                  })
                  .select('id')
                  .single();
                if (sheetErr || !newSheet) continue;
                const { data: srcItems } = await supabase.from('material_items').select('*').eq('sheet_id', sheet.id);
                if (srcItems?.length) {
                  await supabase.from('material_items').insert(
                    srcItems.map((item: any) => ({
                      sheet_id: newSheet.id,
                      material_name: item.material_name,
                      sku: item.sku,
                      category: item.category,
                      quantity: item.quantity,
                      unit: item.unit,
                      cost_per_unit: item.cost_per_unit,
                      price_per_unit: item.price_per_unit,
                      notes: item.notes,
                      order_index: item.order_index,
                    }))
                  );
                }
                const { data: srcLabor } = await supabase.from('material_sheet_labor').select('*').eq('sheet_id', sheet.id);
                if (srcLabor?.length) {
                  await supabase.from('material_sheet_labor').insert(
                    srcLabor.map((l: any) => ({
                      sheet_id: newSheet.id,
                      description: l.description,
                      estimated_hours: l.estimated_hours,
                      hourly_rate: l.hourly_rate,
                      notes: l.notes,
                    }))
                  );
                }
                const { data: srcMarkups } = await supabase.from('material_category_markups').select('*').eq('sheet_id', sheet.id);
                if (srcMarkups?.length) {
                  await supabase.from('material_category_markups').insert(
                    srcMarkups.map((m: any) => ({
                      sheet_id: newSheet.id,
                      category_name: m.category_name,
                      markup_percent: m.markup_percent,
                    }))
                  );
                }
              }
              workbookData = { id: newWb.id };
            }
          }
        } catch (e: any) {
          if (isQuoteIdError(e)) quoteIdSupport.current.material_workbooks = false;
          console.warn('Duplicate fallback workbook for quote failed (backend may not have quote_id):', e?.message || e);
        }
      }

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

      // Self-healing: copy any sheets from the job's FULLEST workbook that this workbook is missing
      try {
        const { data: currentSheets } = await supabase
          .from('material_sheets')
          .select('sheet_name')
          .eq('workbook_id', workbookData.id);
        const currentSheetNames = new Set((currentSheets || []).map((s: any) => s.sheet_name));

        let allJobWbs2: { id: string }[] | null = null;
        const { data: otherWbs1, error: otherWbsErr } = await supabase
          .from('material_workbooks')
          .select('id')
          .eq('job_id', job.id)
          .neq('id', workbookData.id);
        if (otherWbsErr) {
          const { data: otherWbs2 } = await supabase.from('material_workbooks').select('id, job_id');
          allJobWbs2 = (otherWbs2 || []).filter((w: any) => w.id !== workbookData.id && w.job_id === job.id).map(w => ({ id: w.id }));
        } else {
          allJobWbs2 = otherWbs1;
        }
        if (!allJobWbs2?.length) { /* no other workbooks */ } else {
          const { data: otherSheetsAll } = await supabase
            .from('material_sheets')
            .select('workbook_id')
            .in('workbook_id', allJobWbs2.map((w: any) => w.id));
          const countByWb: Record<string, number> = {};
          (otherSheetsAll || []).forEach((s: any) => { countByWb[s.workbook_id] = (countByWb[s.workbook_id] || 0) + 1; });
          const fullestOtherId = Object.entries(countByWb).sort((a, b) => b[1] - a[1])[0]?.[0];
          if (fullestOtherId) {
            const { data: sourceSheets } = await supabase
              .from('material_sheets')
              .select('*')
              .eq('workbook_id', fullestOtherId)
              .order('order_index');

            for (const sheet of sourceSheets || []) {
              if (currentSheetNames.has(sheet.sheet_name)) continue;
              const { data: newSheet, error: sheetInsertErr } = await supabase
                .from('material_sheets')
                .insert({
                  workbook_id: workbookData.id,
                  sheet_name: sheet.sheet_name,
                  description: sheet.description,
                  order_index: sheet.order_index,
                })
                .select('id')
                .single();
              if (sheetInsertErr) {
                console.warn('Fill sheet insert failed:', sheet.sheet_name, sheetInsertErr);
                continue;
              }
              if (!newSheet) continue;
              currentSheetNames.add(sheet.sheet_name);

              const { data: srcItems } = await supabase.from('material_items').select('*').eq('sheet_id', sheet.id);
              if (srcItems?.length) {
                const { error: itemsErr } = await supabase.from('material_items').insert(
                  srcItems.map((item: any) => ({
                    sheet_id: newSheet.id,
                    material_name: item.material_name,
                    sku: item.sku,
                    category: item.category,
                    quantity: item.quantity,
                    unit: item.unit,
                    cost_per_unit: item.cost_per_unit,
                    price_per_unit: item.price_per_unit,
                    notes: item.notes,
                    order_index: item.order_index,
                  }))
                );
                if (itemsErr) console.warn('Fill material_items failed:', sheet.sheet_name, itemsErr);
              }
              const { data: srcLabor } = await supabase.from('material_sheet_labor').select('*').eq('sheet_id', sheet.id);
              if (srcLabor?.length) {
                await supabase.from('material_sheet_labor').insert(
                  srcLabor.map((l: any) => ({
                    sheet_id: newSheet.id,
                    description: l.description,
                    estimated_hours: l.estimated_hours,
                    hourly_rate: l.hourly_rate,
                    notes: l.notes,
                  }))
                );
              }
              const { data: srcMarkups } = await supabase.from('material_category_markups').select('*').eq('sheet_id', sheet.id);
              if (srcMarkups?.length) {
                await supabase.from('material_category_markups').insert(
                  srcMarkups.map((m: any) => ({
                    sheet_id: newSheet.id,
                    category_name: m.category_name,
                    markup_percent: m.markup_percent,
                  }))
                );
              }
            }
          }
        }
      } catch (fillErr: any) {
        console.error('Fill missing sheets failed:', fillErr);
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

      // Get all items for these sheets
      const { data: itemsData, error: itemsError } = await supabase
        .from('material_items')
        .select('*')
        .in('sheet_id', sheetIds);

      if (itemsError) throw itemsError;

      // Store sheets data for editing (dedupe by id to avoid duplicate sections)
      const sheetsList = sheetsData || [];
      const dedupedSheets = sheetsList.filter((s: any, i: number, a: any[]) => a.findIndex((x: any) => x.id === s.id) === i);
      if (JSON.stringify(dedupedSheets) !== JSON.stringify(materialSheets)) {
        setMaterialSheets(dedupedSheets);
      }

      // Load category markups (but don't overwrite values currently being saved)
      if (sheetIds.length > 0) {
        const { data: categoryMarkupsData, error: categoryMarkupsError } = await supabase
          .from('material_category_markups')
          .select('*')
          .in('sheet_id', sheetIds);

        if (!categoryMarkupsError && categoryMarkupsData) {
          // Build final markups: start with fresh database values
          const finalMarkups: Record<string, number> = {};
          
          // Add all database values
          categoryMarkupsData.forEach(cm => {
            const key = `${cm.sheet_id}_${cm.category_name}`;
            finalMarkups[key] = cm.markup_percent;
          });
          
          // Override with in-progress values that are currently being saved
          savingMarkupsRef.current.forEach(key => {
            if (categoryMarkups[key] !== undefined) {
              finalMarkups[key] = categoryMarkups[key];
            }
          });
          
          // Only update state if values actually changed
          if (JSON.stringify(finalMarkups) !== JSON.stringify(categoryMarkups)) {
            setCategoryMarkups(finalMarkups);
          }
        }
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

        // Calculate totals per category (cost only, price will use category markups)
        const categories = Array.from(categoryMap.entries()).map(([categoryName, items]) => {
          const totalCost = items.reduce((sum, item) => {
            const cost = (item.cost_per_unit || 0) * (item.quantity || 0);
            return sum + cost;
          }, 0);

          // Price calculation is now handled in the UI with category-specific markups
          const totalPrice = items.reduce((sum, item) => {
            const price = (item.price_per_unit || 0) * (item.quantity || 0);
            return sum + price;
          }, 0);

          const profit = totalPrice - totalCost;
          const margin = totalPrice > 0 ? (profit / totalPrice) * 100 : 0;

          return {
            name: categoryName,
            itemCount: items.length,
            items: items.map(item => ({
              material_name: item.material_name,
              sku: item.sku,
              quantity: item.quantity || 0,
              cost_per_unit: item.cost_per_unit || 0,
              price_per_unit: item.price_per_unit || 0,
              extended_cost: (item.cost_per_unit || 0) * (item.quantity || 0),
              extended_price: (item.price_per_unit || 0) * (item.quantity || 0),
            })),
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
    if (!quote?.id) {
      setCustomRows([]);
      setCustomRowLabor({});
      setCustomRowLineItems({});
      return;
    }

    // Load all rows for this job to find this quote's rows or a source to duplicate from
    let allRows: any[] | null = null;
    const { data: rows1, error: err1 } = await supabase
      .from('custom_financial_rows')
      .select('*')
      .eq('job_id', job.id)
      .order('order_index');
    if (err1) {
      console.warn('custom_financial_rows query with job_id failed, trying select all:', err1.message || err1);
      const { data: rows2, error: err2 } = await supabase
        .from('custom_financial_rows')
        .select('*')
        .order('order_index');
      if (err2) {
        console.error('Error loading custom rows:', err2);
        return;
      }
      allRows = (rows2 || []).filter((r: any) => r.job_id === job.id);
    } else {
      allRows = rows1;
    }

    if (allRows === null) {
      setCustomRows([]);
      setCustomRowLabor({});
      setCustomRowLineItems({});
      return;
    }

    let rowsForQuote = (allRows || []).filter((r: any) => r.quote_id === quote.id);
    // Do NOT reuse legacy (quote_id null) rows as this quote's rows — duplicate them so edits only affect this proposal.

    // Find the best source rows to duplicate from (legacy null first, then any other quote)
    const otherRows = (allRows || []).filter((r: any) => r.quote_id !== quote.id);
    let sourceRows: any[] = [];
    if (otherRows.length > 0) {
      const legacyRows = otherRows.filter((r: any) => r.quote_id == null);
      if (legacyRows.length > 0) {
        sourceRows = legacyRows;
      } else {
        const bestQuoteId = otherRows.reduce((best: { id: string; count: number } | null, r: any) => {
          const qid = r.quote_id;
          if (!qid) return best;
          const cnt = otherRows.filter((x: any) => x.quote_id === qid).length;
          if (!best || cnt > best.count) return { id: qid, count: cnt };
          return best;
        }, null)?.id;
        if (bestQuoteId) {
          sourceRows = otherRows.filter((r: any) => r.quote_id === bestQuoteId);
        }
      }
    }

    // If no rows for this quote at all, duplicate everything from source (only when backend supports quote_id)
    // If this quote has FEWER rows than the source, copy missing ones (match by description+category)
    if (sourceRows.length > 0 && quoteIdSupport.current.custom_financial_rows) {
      try {
        const existingDescs = new Set(rowsForQuote.map((r: any) => `${r.category}|||${r.description}`));
        const missingRows = sourceRows.filter((r: any) => !existingDescs.has(`${r.category}|||${r.description}`));

        if (missingRows.length > 0) {
          const newRows: any[] = [];
          for (const row of missingRows) {
            const rowPayload: Record<string, unknown> = {
              job_id: job.id,
              category: row.category,
              description: row.description,
              quantity: row.quantity,
              unit_cost: row.unit_cost,
              total_cost: row.total_cost,
              markup_percent: row.markup_percent,
              selling_price: row.selling_price,
              notes: row.notes,
              order_index: row.order_index,
              taxable: row.taxable,
              sheet_id: null,
            };
            if (quoteIdSupport.current.custom_financial_rows && quote?.id) rowPayload.quote_id = quote.id;
            const { data: newRow, error: rowErr } = await supabase
              .from('custom_financial_rows')
              .insert(rowPayload)
              .select()
              .single();
            if (rowErr) {
              if (isQuoteIdError(rowErr)) quoteIdSupport.current.custom_financial_rows = false;
              continue;
            }
            if (!newRow) continue;
            newRows.push(newRow);
            const { data: srcLineItems } = await supabase
              .from('custom_financial_row_items')
              .select('*')
              .eq('row_id', row.id)
              .order('order_index');
            if (srcLineItems?.length) {
              await supabase.from('custom_financial_row_items').insert(
                srcLineItems.map((li: any) => ({
                  row_id: newRow.id,
                  sheet_id: null,
                  description: li.description,
                  quantity: li.quantity,
                  unit_cost: li.unit_cost,
                  total_cost: li.total_cost,
                  notes: li.notes,
                  order_index: li.order_index,
                  taxable: li.taxable,
                  markup_percent: li.markup_percent,
                  item_type: li.item_type,
                }))
              );
            }
          }
          rowsForQuote = [...rowsForQuote, ...newRows];
        }
      } catch (dupErr: any) {
        console.error('Custom rows fill failed:', dupErr);
        if (isQuoteIdError(dupErr)) quoteIdSupport.current.custom_financial_rows = false;
        // Backend may not have quote_id; show shared rows so UI still works
        if (rowsForQuote.length === 0 && sourceRows.length > 0) {
          rowsForQuote = [...sourceRows];
        }
      }
    }
    if (rowsForQuote.length === 0 && sourceRows.length > 0 && !quoteIdSupport.current.custom_financial_rows) {
      rowsForQuote = [...sourceRows];
    }

    const newData = rowsForQuote;
    const deduped = newData.filter((r: any, i: number, a: any[]) => a.findIndex((x: any) => x.id === r.id) === i);
    if (JSON.stringify(deduped) !== JSON.stringify(customRows)) {
      setCustomRows(deduped);
    }

    const laborMap: Record<string, any> = {};
    deduped.forEach(row => {
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

    // Load line items for custom rows AND material sheets
    const rowIds = deduped.map(r => r.id);

    let wbData: { id: string } | null = null;
    if (quoteIdSupport.current.material_workbooks && quote?.id) {
      const { data: wbList, error: wbErr } = await supabase
        .from('material_workbooks')
        .select('id')
        .eq('job_id', job.id)
        .eq('quote_id', quote.id)
        .eq('status', 'working')
        .limit(1);
      if (!wbErr && wbList?.[0]) wbData = wbList[0];
    }
    if (!wbData) {
      const { data: wbFallback } = await supabase
        .from('material_workbooks')
        .select('id')
        .eq('job_id', job.id)
        .eq('status', 'working')
        .limit(1);
      if (wbFallback?.[0]) wbData = wbFallback[0];
    }

    let sheetIds: string[] = [];
    if (wbData) {
      const { data: sheets } = await supabase
        .from('material_sheets')
        .select('id')
        .eq('workbook_id', wbData.id);
      if (sheets) {
        sheetIds = sheets.map(s => s.id);
      }
    }

    const orConditions: string[] = [];
    if (rowIds.length > 0) {
      orConditions.push(`row_id.in.(${rowIds.join(',')})`);
    }
    if (sheetIds.length > 0) {
      orConditions.push(`sheet_id.in.(${sheetIds.join(',')})`);
    }

    if (orConditions.length > 0) {
      const { data: lineItemsData, error: lineItemsError } = await supabase
        .from('custom_financial_row_items')
        .select('*')
        .or(orConditions.join(','))
        .order('order_index');

      if (!lineItemsError && lineItemsData) {
        const lineItemsMap: Record<string, CustomRowLineItem[]> = {};
        lineItemsData.forEach(item => {
          const parentId = item.row_id || item.sheet_id;
          if (parentId) {
            if (!lineItemsMap[parentId]) {
              lineItemsMap[parentId] = [];
            }
            lineItemsMap[parentId].push(item);
          }
        });
        setCustomRowLineItems(lineItemsMap);
      }
    } else {
      setCustomRowLineItems({});
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

  function openAddDialog(row?: CustomFinancialRow, sheetId?: string, categoryType?: 'materials' | 'labor') {
    if (row) {
      setEditingRow(row);
      setCategory(row.category);
      setDescription(row.description);
      setQuantity(row.quantity.toString());
      setUnitCost(row.unit_cost.toString());
      setMarkupPercent(row.markup_percent.toString());
      setNotes(row.notes || '');
      setTaxable(row.taxable !== undefined ? row.taxable : true);
      setLinkedSheetId((row as any).sheet_id || null);
    } else {
      resetForm();
      if (sheetId) {
        // If opening from a material sheet, pre-populate category and link
        const cat = categoryType || 'materials';
        setCategory(cat);
        setTaxable(cat === 'materials'); // Materials default to taxable, labor to non-taxable
        setLinkedSheetId(sheetId);
      }
    }
    setShowAddDialog(true);
  }

  function resetForm() {
    setEditingRow(null);
    setCategory('subcontractor');
    setDescription('');
    setQuantity('1');
    setUnitCost('0'); // Default to 0 - user can add line items without base cost
    setMarkupPercent('0');
    setNotes('');
    setTaxable(true);
    setLinkedSheetId(null);
  }

  async function saveCustomRow() {
    if (isReadOnly) {
      toast.error('Cannot edit in historical view');
      return;
    }
    
    if (!description || !unitCost) {
      toast.error('Please fill in description and ' + (category === 'labor' ? 'hourly rate' : 'unit cost'));
      return;
    }

    const qty = parseFloat(quantity) || 1;
    const cost = parseFloat(unitCost) || 0;
    const markup = parseFloat(markupPercent) || 0;
    const totalCost = qty * cost;
    const sellingPrice = totalCost * (1 + markup / 100);

    try {
      // If category is subcontractor, create a subcontractor_estimate instead
      if (category === 'subcontractor' && !editingRow) {
        // Get max order_index for subcontractor estimates
        const maxOrderIndex = subcontractorEstimates.length > 0
          ? Math.max(...subcontractorEstimates.map(s => s.order_index))
          : -1;
        
        // Create subcontractor estimate (scoped to current proposal)
        const subPayload: Record<string, unknown> = {
          job_id: job.id,
          company_name: description,
          total_amount: totalCost,
          markup_percent: markup,
          scope_of_work: notes || null,
          order_index: maxOrderIndex + 1,
          sheet_id: linkedSheetId || null,
          extraction_status: 'completed',
        };
        if (quote?.id && quoteIdSupport.current.subcontractor_estimates) subPayload.quote_id = quote.id;
        const { data: estData, error: estError } = await supabase
          .from('subcontractor_estimates')
          .insert([subPayload])
          .select()
          .single();

        if (estError) throw estError;

        // Create a single line item for the total
        const { error: lineError } = await supabase
          .from('subcontractor_estimate_line_items')
          .insert([{
            estimate_id: estData.id,
            description: description,
            quantity: qty,
            unit_price: cost,
            total_price: totalCost,
            taxable: taxable,
            excluded: false,
            order_index: 0,
          }]);

        if (lineError) throw lineError;

        toast.success('Subcontractor added');
        setShowAddDialog(false);
        resetForm();
        await loadSubcontractorEstimates();
        return;
      }

      // For all other categories (or editing existing custom row)
      let targetOrderIndex: number;

      if (editingRow) {
        targetOrderIndex = editingRow.order_index;
      } else {
        const maxOrderIndex = customRows.length > 0 
          ? Math.max(...customRows.map(r => r.order_index))
          : -1;
        targetOrderIndex = maxOrderIndex + 1;
      }

      const rowData: Record<string, unknown> = {
        job_id: job.id,
        category,
        description,
        quantity: qty,
        unit_cost: cost,
        total_cost: totalCost,
        markup_percent: markup,
        selling_price: sellingPrice,
        notes: notes || null,
        taxable: taxable, // Use the taxable state from checkbox
        order_index: targetOrderIndex,
        sheet_id: linkedSheetId || null,
      };
      if (quote?.id && quoteIdSupport.current.custom_financial_rows) rowData.quote_id = quote.id;

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
      await loadMaterialsData();
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

  // Row name editing functions
  function startEditingRowName(id: string, type: 'sheet' | 'custom' | 'subcontractor', currentName: string) {
    setEditingRowName(id);
    setEditingRowNameType(type);
    setTempRowName(currentName);
  }

  function cancelEditingRowName() {
    setEditingRowName(null);
    setEditingRowNameType(null);
    setTempRowName('');
  }

  async function saveRowName() {
    if (!editingRowName || !editingRowNameType || !tempRowName.trim()) {
      toast.error('Please enter a name');
      return;
    }

    try {
      if (editingRowNameType === 'sheet') {
        const { error } = await supabase
          .from('material_sheets')
          .update({ sheet_name: tempRowName.trim() })
          .eq('id', editingRowName);

        if (error) throw error;
        await loadMaterialsData();
      } else if (editingRowNameType === 'custom') {
        const { error } = await supabase
          .from('custom_financial_rows')
          .update({ description: tempRowName.trim() })
          .eq('id', editingRowName);

        if (error) throw error;
        await loadCustomRows();
      await loadMaterialsData();
      } else if (editingRowNameType === 'subcontractor') {
        const { error } = await supabase
          .from('subcontractor_estimates')
          .update({ company_name: tempRowName.trim() })
          .eq('id', editingRowName);

        if (error) throw error;
        await loadSubcontractorEstimates();
      }

      toast.success('Name updated');
      cancelEditingRowName();
    } catch (error: any) {
      console.error('Error updating name:', error);
      toast.error('Failed to update name');
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
      await loadMaterialsData();
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
      await loadMaterialsData();
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
      await loadMaterialsData();
    } catch (error: any) {
      console.error('Error deleting row:', error);
      toast.error('Failed to delete row');
    }
  }

  // Line item functions
  function openLineItemDialog(parentId: string, lineItem?: CustomRowLineItem, itemType?: 'material' | 'labor' | 'combined') {
    setLineItemParentRowId(parentId);
    setLineItemType(itemType || 'combined');
    
    if (lineItem) {
      setEditingLineItem(lineItem);
      
      // Try to parse labor data from notes
      let laborData = { hours: 0, rate: 60, markup: 10 };
      let actualNotes = lineItem.notes || '';
      
      if (lineItem.notes) {
        try {
          const parsed = JSON.parse(lineItem.notes);
          if (parsed.labor) {
            laborData = {
              hours: parsed.labor.hours || 0,
              rate: parsed.labor.rate || 60,
              markup: parsed.labor.markup || 10,
            };
            actualNotes = parsed.notes || '';
          }
        } catch {
          // Not JSON, use as regular notes
        }
      }
      
      setLineItemForm({
        description: lineItem.description,
        quantity: lineItem.quantity.toString(),
        unit_cost: lineItem.unit_cost.toString(),
        notes: actualNotes,
        taxable: lineItem.taxable !== undefined ? lineItem.taxable : true,
        item_type: (lineItem as any).item_type || 'material',
        markup_percent: (lineItem.markup_percent ?? 10).toString(),
        labor_hours: laborData.hours.toString(),
        labor_rate: laborData.rate.toString(),
        labor_markup_percent: laborData.markup.toString(),
      });
    } else {
      setEditingLineItem(null);
      // Set default item_type based on dialog type
      const defaultItemType = itemType === 'labor' ? 'labor' : 'material';
      setLineItemForm({
        description: '',
        quantity: '1',
        unit_cost: '0',
        notes: '',
        taxable: defaultItemType === 'material',
        item_type: defaultItemType,
        markup_percent: '10',
        labor_hours: '0',
        labor_rate: '60',
        labor_markup_percent: '10',
      });
    }
    
    setShowLineItemDialog(true);
  }

  async function saveLineItem(keepDialogOpen = false) {
    if (!lineItemParentRowId || !lineItemForm.description) {
      toast.error('Please fill in description');
      return;
    }

    // Determine if this is for a sheet or a custom row
    const isSheet = materialSheets.some(s => s.id === lineItemParentRowId);
    
    // Calculate costs based on line item type
    let totalCost = 0;
    let qty = 0;
    let cost = 0;
    let markup = 0;
    let actualItemType = lineItemForm.item_type;
    let notesData = lineItemForm.notes || null;
    
    if (lineItemType === 'labor') {
      // Labor-only item
      const laborHours = parseFloat(lineItemForm.labor_hours) || 0;
      const laborRate = parseFloat(lineItemForm.labor_rate) || 0;
      totalCost = laborHours * laborRate;
      qty = laborHours;
      cost = laborRate;
      markup = parseFloat(lineItemForm.labor_markup_percent) || 0;
      actualItemType = 'labor';
    } else if (lineItemType === 'combined') {
      // Combined material + labor
      const materialQty = parseFloat(lineItemForm.quantity) || 0;
      const materialCost = parseFloat(lineItemForm.unit_cost) || 0;
      const materialTotal = materialQty * materialCost;
      
      const laborHours = parseFloat(lineItemForm.labor_hours) || 0;
      const laborRate = parseFloat(lineItemForm.labor_rate) || 0;
      const laborTotal = laborHours * laborRate;
      
      totalCost = materialTotal + laborTotal;
      qty = materialQty;
      cost = materialCost;
      markup = parseFloat(lineItemForm.markup_percent) || 0;
      actualItemType = 'material'; // Combined items are primarily material
      
      // Store labor data in notes if present
      if (laborHours > 0) {
        notesData = JSON.stringify({
          labor: {
            hours: laborHours,
            rate: laborRate,
            markup: parseFloat(lineItemForm.labor_markup_percent) || 0,
          },
          notes: lineItemForm.notes || '',
        });
      }
    } else {
      // Material-only item
      qty = parseFloat(lineItemForm.quantity) || 0;
      cost = parseFloat(lineItemForm.unit_cost) || 0;
      totalCost = qty * cost;
      markup = parseFloat(lineItemForm.markup_percent) || 0;
      actualItemType = 'material';
    }
    
    const itemData = {
      row_id: isSheet ? null : lineItemParentRowId,
      sheet_id: isSheet ? lineItemParentRowId : null,
      description: lineItemForm.description,
      quantity: qty,
      unit_cost: cost,
      total_cost: totalCost,
      notes: notesData,
      taxable: actualItemType === 'labor' ? false : lineItemForm.taxable,
      item_type: actualItemType,
      markup_percent: markup,
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

      await loadCustomRows();
      await loadMaterialsData();

      if (keepDialogOpen) {
        // Reset form for adding another item, keeping the taxable status and appropriate defaults
        const currentTaxable = lineItemForm.taxable;
        const currentMarkup = lineItemForm.markup_percent;
        const currentLaborRate = lineItemForm.labor_rate;
        const currentLaborMarkup = lineItemForm.labor_markup_percent;
        
        setLineItemForm({
          description: '',
          quantity: '1',
          unit_cost: '0',
          notes: '',
          taxable: currentTaxable,
          item_type: 'material',
          markup_percent: currentMarkup,
          labor_hours: '0',
          labor_rate: currentLaborRate,
          labor_markup_percent: currentLaborMarkup,
        });
        setEditingLineItem(null);
      } else {
        setShowLineItemDialog(false);
        setEditingLineItem(null);
        setLineItemParentRowId(null);
      }
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
      await loadMaterialsData();
    } catch (error: any) {
      console.error('Error deleting line item:', error);
      toast.error('Failed to delete line item');
    }
  }

  async function toggleSubcontractorLineItem(lineItemId: string, currentExcluded: boolean) {
    try {
      const { error } = await supabase
        .from('subcontractor_estimate_line_items')
        .update({ excluded: !currentExcluded })
        .eq('id', lineItemId);

      if (error) throw error;
      await loadSubcontractorEstimates();
    } catch (error: any) {
      console.error('Error toggling line item:', error);
      toast.error('Failed to update line item');
    }
  }

  async function toggleSubcontractorLineItemTaxable(lineItemId: string, currentTaxable: boolean) {
    try {
      const { error } = await supabase
        .from('subcontractor_estimate_line_items')
        .update({ taxable: !currentTaxable })
        .eq('id', lineItemId);

      if (error) throw error;
      await loadSubcontractorEstimates();
    } catch (error: any) {
      console.error('Error toggling taxable status:', error);
      toast.error('Failed to update taxable status');
    }
  }

  async function toggleSubcontractorLineItemType(lineItemId: string, currentType: string) {
    try {
      const newType = currentType === 'material' ? 'labor' : 'material';
      const updates: any = { item_type: newType };
      
      // Labor is always non-taxable
      if (newType === 'labor') {
        updates.taxable = false;
      }
      
      const { error } = await supabase
        .from('subcontractor_estimate_line_items')
        .update(updates)
        .eq('id', lineItemId);

      if (error) throw error;
      await loadSubcontractorEstimates();
    } catch (error: any) {
      console.error('Error toggling item type:', error);
      toast.error('Failed to update item type');
    }
  }

  function openSubcontractorDialog(parentId: string, parentType: 'sheet' | 'row') {
    setSubcontractorParentId(parentId);
    setSubcontractorParentType(parentType);
    setSubcontractorMode('select');
    setSelectedExistingSubcontractor('');
    setShowSubcontractorDialog(true);
  }

  async function linkExistingSubcontractor() {
    if (!selectedExistingSubcontractor || !subcontractorParentId || !subcontractorParentType) {
      toast.error('Please select a subcontractor');
      return;
    }

    try {
      const updateData = subcontractorParentType === 'sheet'
        ? { sheet_id: subcontractorParentId, row_id: null }
        : { row_id: subcontractorParentId, sheet_id: null };

      const { error } = await supabase
        .from('subcontractor_estimates')
        .update(updateData)
        .eq('id', selectedExistingSubcontractor);

      if (error) throw error;
      toast.success('Subcontractor linked');
      setShowSubcontractorDialog(false);
      await loadSubcontractorEstimates();
    } catch (error: any) {
      console.error('Error linking subcontractor:', error);
      toast.error('Failed to link subcontractor');
    }
  }

  async function unlinkSubcontractor(estimateId: string) {
    if (!confirm('Unlink this subcontractor?')) return;

    try {
      const { error } = await supabase
        .from('subcontractor_estimates')
        .update({ sheet_id: null, row_id: null })
        .eq('id', estimateId);

      if (error) throw error;
      toast.success('Subcontractor unlinked');
      await loadSubcontractorEstimates();
    } catch (error: any) {
      console.error('Error unlinking subcontractor:', error);
      toast.error('Failed to unlink subcontractor');
    }
  }

  async function updateSubcontractorMarkup(estimateId: string, newMarkup: number) {
    try {
      const { error } = await supabase
        .from('subcontractor_estimates')
        .update({ markup_percent: newMarkup })
        .eq('id', estimateId);

      if (error) throw error;
      await loadSubcontractorEstimates();
    } catch (error: any) {
      console.error('Error updating markup:', error);
      toast.error('Failed to update markup');
    }
  }

  async function updateCustomRowMarkup(rowId: string, newMarkup: number) {
    try {
      const { error } = await supabase
        .from('custom_financial_rows')
        .update({ markup_percent: newMarkup })
        .eq('id', rowId);

      if (error) throw error;
      await loadCustomRows();
      await loadMaterialsData();
    } catch (error: any) {
      console.error('Error updating markup:', error);
      toast.error('Failed to update markup');
    }
  }

  async function saveBuildingDescription() {
    try {
      const { error } = await supabase
        .from('jobs')
        .update({ description: buildingDescription })
        .eq('id', job.id);

      if (error) throw error;
      toast.success('Building description saved');
      setEditingDescription(false);
    } catch (error: any) {
      console.error('Error saving description:', error);
      toast.error('Failed to save description');
    }
  }

  async function handleExportPDF() {
    setExporting(true);
    
    try {
      // Get proposal number from quote if available, otherwise use job ID
      const proposalNumber = quote?.proposal_number || job.id.split('-')[0].toUpperCase();
      
      // Prepare sections data for the template
      const sections = allItems.map((item, index) => {
        if (item.type === 'material') {
          const sheet = item.data;
          const linkedRows = customRows.filter((r: any) => r.sheet_id === sheet.sheetId);
          const linkedSubs = linkedSubcontractors[sheet.sheetId] || [];
          
          const linkedRowsTotal = linkedRows.reduce((sum: number, row: any) => {
            const lineItems = customRowLineItems[row.id] || [];
            const baseCost = lineItems.length > 0
              ? lineItems.reduce((itemSum: number, item: any) => itemSum + item.total_cost, 0)
              : row.total_cost;
            return sum + (baseCost * (1 + row.markup_percent / 100));
          }, 0);
          
          const linkedSubsTaxableTotal = linkedSubs.reduce((sum: number, sub: any) => {
            const lineItems = subcontractorLineItems[sub.id] || [];
            const taxableTotal = lineItems
              .filter((item: any) => !item.excluded && item.taxable)
              .reduce((itemSum: number, item: any) => itemSum + item.total_price, 0);
            const estMarkup = sub.markup_percent || 0;
            return sum + (taxableTotal * (1 + estMarkup / 100));
          }, 0);
          
          const sheetBaseCost = sheet.totalPrice + linkedRowsTotal + linkedSubsTaxableTotal;
          const sheetMarkup = sheet.markup_percent || 10;
          const sheetFinalPrice = sheetBaseCost * (1 + sheetMarkup / 100);
          
          return {
            name: sheet.sheetName,
            description: sheet.sheetDescription || '',
            price: sheetFinalPrice,
            items: showLineItems ? sheet.categories?.map((cat: any) => ({
              description: cat.name,
              quantity: cat.itemCount,
              unit: 'items',
              price: cat.totalPrice
            })) : undefined
          };
        } else if (item.type === 'custom') {
          const row = item.data;
          const lineItems = customRowLineItems[row.id] || [];
          const linkedSubs = linkedSubcontractors[row.id] || [];
          
          const linkedSubsTaxableTotal = linkedSubs.reduce((sum: number, sub: any) => {
            const subLineItems = subcontractorLineItems[sub.id] || [];
            const taxableTotal = subLineItems
              .filter((item: any) => !item.excluded && item.taxable)
              .reduce((itemSum: number, item: any) => itemSum + item.total_price, 0);
            const estMarkup = sub.markup_percent || 0;
            return sum + (taxableTotal * (1 + estMarkup / 100));
          }, 0);
          
          const baseLineCost = lineItems.length > 0
            ? lineItems.reduce((itemSum: number, item: any) => itemSum + item.total_cost, 0)
            : row.total_cost;
          const baseCost = baseLineCost + linkedSubsTaxableTotal;
          const finalPrice = baseCost * (1 + row.markup_percent / 100);
          
          return {
            name: row.description,
            description: row.notes || '',
            price: finalPrice,
            items: showLineItems && lineItems.length > 0 ? lineItems.map((li: any) => ({
              description: li.description,
              quantity: li.quantity,
              unit: '',
              price: li.total_cost
            })) : undefined
          };
        } else if (item.type === 'subcontractor') {
          const est = item.data;
          const lineItems = subcontractorLineItems[est.id] || [];
          const includedTotal = lineItems
            .filter((item: any) => !item.excluded)
            .reduce((sum: number, item: any) => sum + item.total_price, 0);
          const estMarkup = est.markup_percent || 0;
          const finalPrice = includedTotal * (1 + estMarkup / 100);
          
          return {
            name: est.company_name,
            description: est.scope_of_work || '',
            price: finalPrice,
            items: showLineItems ? lineItems
              .filter((item: any) => !item.excluded)
              .map((li: any) => ({
                description: li.description,
                quantity: li.quantity || 1,
                unit: li.unit_price ? '' : '',
                price: li.total_price
              })) : undefined
          };
        }
        return null;
      }).filter(Boolean);

      // Generate HTML using the template
      const isOfficeView = exportViewType === 'office';
      const html = generateProposalHTML({
        proposalNumber,
        date: new Date().toLocaleDateString(),
        job: {
          client_name: job.client_name,
          address: job.address,
          name: job.name,
          customer_phone: job.customer_phone,
          description: buildingDescription,
        },
        sections,
        totals: {
          materials: proposalMaterialsTotalWithSubcontractors,
          labor: proposalLaborPrice,
          subtotal: proposalSubtotal,
          tax: proposalTotalTax,
          grandTotal: proposalGrandTotal,
        },
        showLineItems: isOfficeView ? true : showLineItems,
        showSectionPrices: isOfficeView ? false : showLineItems, // Customer version: controlled by checkbox, Office view: always false
        showInternalDetails: isOfficeView,
      });

      console.log('Generating PDF with HTML');
      
      const { data, error } = await supabase.functions.invoke('generate-pdf', {
        body: { 
          html,
          filename: `Proposal-${proposalNumber}.pdf`
        }
      });

      if (error) {
        // Properly extract error details from Edge Function
        let errorMessage = error.message;
        if (error instanceof Error && 'context' in error) {
          try {
            const context = (error as any).context;
            const statusCode = context?.status ?? 500;
            const textContent = await context?.text();
            errorMessage = `[Code: ${statusCode}] ${textContent || error.message || 'Unknown error'}`;
          } catch {
            errorMessage = error.message || 'Failed to read response';
          }
        }
        throw new Error(errorMessage);
      }
      
      // The Edge Function returns HTML, open in new tab for viewing
      const blob = new Blob([data], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      toast.success('Proposal opened in new tab. You can print or save as PDF from the browser menu.');
      
      setShowExportDialog(false);
    } catch (error: any) {
      console.error('Error exporting PDF:', error);
      toast.error(`Failed to export PDF: ${error.message || 'Unknown error'}`);
    } finally {
      setExporting(false);
    }
  }

  // Calculate custom row total from line items (if any) or from quantity * unit_cost
  function getCustomRowTotal(row: CustomFinancialRow): number {
    const lineItems = customRowLineItems[row.id] || [];
    if (lineItems.length > 0) {
      const itemsTotal = lineItems.reduce((sum, item) => sum + n(item.total_cost), 0);
      return itemsTotal * (1 + n(row.markup_percent) / 100);
    }
    return n(row.selling_price) || n(row.total_cost);
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
      return sum + lineItems.reduce((itemSum, item) => itemSum + n(item.total_cost), 0);
    }
    return sum + n(row.total_cost);
  }, 0);

  const grandTotalPrice = customRows.reduce((sum, row) => sum + getCustomRowTotal(row), 0);

  // Labor calculations (no markup) - use TOTAL LABOR HOURS from labor rows for pricing
  const laborRate = parseFloat(hourlyRate) || 60;
  const billableRate = laborRate;
  const laborCost = totalLaborHours * laborRate;
  const laborPrice = totalLaborHours * billableRate;
  const laborProfit = 0;

  // Overall totals (including materials) - use n() so historical view never shows NaN
  const totalCost = n(materialsBreakdown.totals.totalCost) + grandTotalCost + laborCost;
  const totalPrice = n(materialsBreakdown.totals.totalPrice) + grandTotalPrice + laborPrice;
  const totalProfit = totalPrice - totalCost;
  const profitMargin = totalPrice > 0 ? (totalProfit / totalPrice) * 100 : 0;

  // Proposal calculations with individual markups and tax
  const TAX_RATE = 0.07; // 7% tax
  
  // Helper function to calculate taxable and non-taxable portions of a custom row
  function getCustomRowTaxableAndNonTaxable(row: CustomFinancialRow) {
    const lineItems = customRowLineItems[row.id] || [];
    const linkedSubs = linkedSubcontractors[row.id] || [];
    
    let taxableTotal = 0;
    let nonTaxableTotal = 0;
    
    if (lineItems.length > 0) {
      // If has line items, separate by taxable status
      lineItems.forEach(item => {
        if (item.taxable) {
          taxableTotal += item.total_cost;
        } else {
          nonTaxableTotal += item.total_cost;
        }
      });
    } else {
      // No line items - use row's own cost and taxable setting
      if (row.taxable) {
        taxableTotal = row.total_cost;
      } else {
        nonTaxableTotal = row.total_cost;
      }
    }
    
    // Add linked subcontractors
    linkedSubs.forEach((sub: any) => {
      const subLineItems = subcontractorLineItems[sub.id] || [];
      const subTaxableTotal = subLineItems
        .filter((item: any) => !item.excluded && item.taxable)
        .reduce((sum: number, item: any) => sum + item.total_price, 0);
      const subNonTaxableTotal = subLineItems
        .filter((item: any) => !item.excluded && !item.taxable)
        .reduce((sum: number, item: any) => sum + item.total_price, 0);
      const estMarkup = sub.markup_percent || 0;
      taxableTotal += subTaxableTotal * (1 + estMarkup / 100);
      nonTaxableTotal += subNonTaxableTotal * (1 + estMarkup / 100);
    });
    
    // Apply row markup to both portions
    const rowMarkup = 1 + (row.markup_percent / 100);
    return {
      taxable: taxableTotal * rowMarkup,
      nonTaxable: nonTaxableTotal * rowMarkup,
    };
  }
  
  // Get all custom rows that are NOT linked to sheets (standalone rows)
  const standaloneCustomRows = customRows.filter(r => !(r as any).sheet_id);
  
  // Calculate totals from standalone custom rows, splitting by material vs labor
  let customRowsMaterialsTotal = 0;
  let customRowsMaterialsTaxableOnly = 0;
  let customRowsLaborTotal = 0;
  
  standaloneCustomRows.forEach(row => {
    const lineItems = customRowLineItems[row.id] || [];
    const linkedSubs = linkedSubcontractors[row.id] || [];
    
    // Separate line items by type (use item_type, not taxable)
    const materialLineItems = lineItems.filter((item: any) => (item.item_type || 'material') === 'material');
    const laborLineItems = lineItems.filter((item: any) => (item.item_type || 'material') === 'labor');
    
    // Calculate material portions
    let rowMaterialsTotal = 0;
    let rowMaterialsTaxableOnly = 0;
    if (lineItems.length > 0) {
      // Sum all material line items
      rowMaterialsTotal = materialLineItems.reduce((sum: number, item: any) => sum + item.total_cost, 0);
      // Sum only taxable material line items
      rowMaterialsTaxableOnly = materialLineItems
        .filter((item: any) => item.taxable)
        .reduce((sum: number, item: any) => sum + item.total_cost, 0);
    } else if (row.category !== 'labor') {
      // No line items and not a labor row = material row
      rowMaterialsTotal = row.total_cost;
      rowMaterialsTaxableOnly = row.taxable ? row.total_cost : 0;
    }
    
    // Calculate labor portion - WITH MARKUP
    let rowLaborTotal = 0;
    if (lineItems.length > 0) {
      rowLaborTotal = laborLineItems.reduce((sum: number, item: any) => {
        const itemMarkup = item.markup_percent || 0;
        return sum + (item.total_cost * (1 + itemMarkup / 100));
      }, 0);
    } else if (row.category === 'labor') {
      rowLaborTotal = row.total_cost;
    }
    
    // Add linked subcontractors (separate materials from labor)
    linkedSubs.forEach((sub: any) => {
      const subLineItems = subcontractorLineItems[sub.id] || [];
      // Material items (can be taxable or non-taxable)
      const subMaterialsTotal = subLineItems
        .filter((item: any) => !item.excluded && (item.item_type || 'material') === 'material')
        .reduce((sum: number, item: any) => sum + item.total_price, 0);
      const subMaterialsTaxableOnly = subLineItems
        .filter((item: any) => !item.excluded && (item.item_type || 'material') === 'material' && item.taxable)
        .reduce((sum: number, item: any) => sum + item.total_price, 0);
      // Labor items (always non-taxable)
      const subLaborTotal = subLineItems
        .filter((item: any) => !item.excluded && (item.item_type || 'material') === 'labor')
        .reduce((sum: number, item: any) => sum + item.total_price, 0);
      
      const estMarkup = sub.markup_percent || 0;
      rowMaterialsTotal += subMaterialsTotal * (1 + estMarkup / 100);
      rowMaterialsTaxableOnly += subMaterialsTaxableOnly * (1 + estMarkup / 100);
      rowLaborTotal += subLaborTotal * (1 + estMarkup / 100);
    });
    
    // Apply row markup to all portions
    const rowMarkup = 1 + (row.markup_percent / 100);
    customRowsMaterialsTotal += rowMaterialsTotal * rowMarkup;
    customRowsMaterialsTaxableOnly += rowMaterialsTaxableOnly * rowMarkup;
    customRowsLaborTotal += rowLaborTotal * rowMarkup;
  });
  
  // Materials: material sheets + custom material rows (ALL materials, not just taxable)
  // Also track taxable-only materials for tax calculation
  let materialSheetsPrice = 0;
  let materialSheetsTaxableOnly = 0;
  
  materialsBreakdown.sheetBreakdowns.forEach(sheet => {
    // Calculate cost from linked custom rows (ALL materials, with their own markup)
    const linkedRows = customRows.filter(r => (r as any).sheet_id === sheet.sheetId);
    let linkedRowsMaterialsTotal = 0;
    let linkedRowsMaterialsTaxableOnly = 0;
    
    linkedRows.forEach(row => {
      const lineItems = customRowLineItems[row.id] || [];
      const linkedSubs = linkedSubcontractors[row.id] || [];
      
      // Separate line items by type
      const materialLineItems = lineItems.filter((item: any) => (item.item_type || 'material') === 'material');
      
      // Calculate material portions
      let rowMaterialsTotal = 0;
      let rowMaterialsTaxableOnly = 0;
      if (lineItems.length > 0) {
        rowMaterialsTotal = materialLineItems.reduce((sum: number, item: any) => sum + item.total_cost, 0);
        rowMaterialsTaxableOnly = materialLineItems
          .filter((item: any) => item.taxable)
          .reduce((sum: number, item: any) => sum + item.total_cost, 0);
      } else if (row.category !== 'labor') {
        rowMaterialsTotal = row.total_cost;
        rowMaterialsTaxableOnly = row.taxable ? row.total_cost : 0;
      }
      
      // Add linked subcontractors (materials only)
      linkedSubs.forEach((sub: any) => {
        const subLineItems = subcontractorLineItems[sub.id] || [];
        const subMaterialsTotal = subLineItems
          .filter((item: any) => !item.excluded && (item.item_type || 'material') === 'material')
          .reduce((sum: number, item: any) => sum + item.total_price, 0);
        const subMaterialsTaxableOnly = subLineItems
          .filter((item: any) => !item.excluded && (item.item_type || 'material') === 'material' && item.taxable)
          .reduce((sum: number, item: any) => sum + item.total_price, 0);
        const estMarkup = sub.markup_percent || 0;
        rowMaterialsTotal += subMaterialsTotal * (1 + estMarkup / 100);
        rowMaterialsTaxableOnly += subMaterialsTaxableOnly * (1 + estMarkup / 100);
      });
      
      // Apply row markup
      const rowMarkup = 1 + (row.markup_percent / 100);
      linkedRowsMaterialsTotal += rowMaterialsTotal * rowMarkup;
      linkedRowsMaterialsTaxableOnly += rowMaterialsTaxableOnly * rowMarkup;
    });
    
    // Calculate linked subcontractors (materials only, both taxable and non-taxable)
    const linkedSubs = linkedSubcontractors[sheet.sheetId] || [];
    let linkedSubsMaterialsTotal = 0;
    let linkedSubsMaterialsTaxableOnly = 0;
    linkedSubs.forEach(sub => {
      const lineItems = subcontractorLineItems[sub.id] || [];
      const materialsTotal = lineItems
        .filter((item: any) => !item.excluded && (item.item_type || 'material') === 'material')
        .reduce((sum: number, item: any) => sum + item.total_price, 0);
      const materialsTaxableOnly = lineItems
        .filter((item: any) => !item.excluded && (item.item_type || 'material') === 'material' && item.taxable)
        .reduce((sum: number, item: any) => sum + item.total_price, 0);
      const estMarkup = sub.markup_percent || 0;
      linkedSubsMaterialsTotal += materialsTotal * (1 + estMarkup / 100);
      linkedSubsMaterialsTaxableOnly += materialsTaxableOnly * (1 + estMarkup / 100);
    });
    
    const categoryTotals = sheet.categories?.reduce((sum: number, cat: any) => {
      const categoryKey = `${sheet.sheetId}_${cat.name}`;
      const categoryMarkup = categoryMarkups[categoryKey] ?? 10;
      const categoryPriceWithMarkup = n(cat.totalCost) * (1 + categoryMarkup / 100);
      return sum + categoryPriceWithMarkup;
    }, 0) || 0;
    
    const categoryTaxableOnly = sheet.categories?.reduce((sum: number, cat: any) => {
      const categoryKey = `${sheet.sheetId}_${cat.name}`;
      const categoryMarkup = categoryMarkups[categoryKey] ?? 10;
      const categoryPriceWithMarkup = n(cat.totalCost) * (1 + categoryMarkup / 100);
      return sum + categoryPriceWithMarkup;
    }, 0) || 0;
    
    // Final = (materials with category markups) + (linked rows with their own markup) + (linked subs)
    materialSheetsPrice += categoryTotals + linkedRowsMaterialsTotal + linkedSubsMaterialsTotal;
    materialSheetsTaxableOnly += categoryTaxableOnly + linkedRowsMaterialsTaxableOnly + linkedSubsMaterialsTaxableOnly;
  });
  
  const proposalMaterialsPrice = materialSheetsPrice + customRowsMaterialsTotal;
  const proposalMaterialsTaxableOnly = materialSheetsTaxableOnly + customRowsMaterialsTaxableOnly;
  
  // Subcontractors: only standalone estimates (not linked to sheets/rows)
  // Material type items go to materials, labor type items go to labor
  const standaloneSubcontractors = subcontractorEstimates.filter(est => !est.sheet_id && !est.row_id);
  let subcontractorMaterialsPrice = 0;
  let subcontractorMaterialsTaxableOnly = 0;
  let subcontractorLaborPrice = 0;
  
  standaloneSubcontractors.forEach(est => {
    const lineItems = subcontractorLineItems[est.id] || [];
    // All materials (taxable + non-taxable)
    const materialsTotal = lineItems
      .filter((item: any) => !item.excluded && (item.item_type || 'material') === 'material')
      .reduce((sum: number, item: any) => sum + (item.total_price || 0), 0);
    // Taxable materials only
    const materialsTaxableOnly = lineItems
      .filter((item: any) => !item.excluded && (item.item_type || 'material') === 'material' && item.taxable)
      .reduce((sum: number, item: any) => sum + (item.total_price || 0), 0);
    // Labor
    const laborTotal = lineItems
      .filter((item: any) => !item.excluded && (item.item_type || 'material') === 'labor')
      .reduce((sum: number, item: any) => sum + (item.total_price || 0), 0);
    
    const estMarkup = est.markup_percent || 0;
    subcontractorMaterialsPrice += materialsTotal * (1 + estMarkup / 100);
    subcontractorMaterialsTaxableOnly += materialsTaxableOnly * (1 + estMarkup / 100);
    subcontractorLaborPrice += laborTotal * (1 + estMarkup / 100);
  });
  
  // Labor: sheet labor + sheet labor line items + custom row labor + custom rows labor + linked rows labor + subcontractor labor items
  const totalSheetLaborCost = materialsBreakdown.sheetBreakdowns.reduce((sum, sheet) => {
    const labor = sheetLabor[sheet.sheetId];
    
    // Add labor from sheet line items (labor type)
    const sheetLineItems = customRowLineItems[sheet.sheetId] || [];
    const sheetLaborLineItems = sheetLineItems.filter((item: any) => (item.item_type || 'material') === 'labor');
    const sheetLaborLineItemsTotal = sheetLaborLineItems.reduce((itemSum: number, item: any) => {
      const itemMarkup = item.markup_percent || 0;
      return itemSum + (item.total_cost * (1 + itemMarkup / 100));
    }, 0);
    
    // Add labor from linked custom rows (labor line items)
    const linkedRows = customRows.filter(r => (r as any).sheet_id === sheet.sheetId);
    const linkedRowsLaborTotal = linkedRows.reduce((rowSum, row) => {
      const lineItems = customRowLineItems[row.id] || [];
      const linkedSubs = linkedSubcontractors[row.id] || [];
      
      // Separate line items by type
      const laborLineItems = lineItems.filter((item: any) => (item.item_type || 'material') === 'labor');
      
      // Calculate labor portion - WITH MARKUP
      let rowLaborTotal = 0;
      if (lineItems.length > 0) {
        rowLaborTotal = laborLineItems.reduce((itemSum: number, item: any) => {
          const itemMarkup = item.markup_percent || 0;
          return itemSum + (item.total_cost * (1 + itemMarkup / 100));
        }, 0);
      } else if (row.category === 'labor') {
        rowLaborTotal = row.total_cost;
      }
      
      // Add linked subcontractors (labor portion)
      linkedSubs.forEach((sub: any) => {
        const subLineItems = subcontractorLineItems[sub.id] || [];
        const subLaborTotal = subLineItems
          .filter((item: any) => !item.excluded && (item.item_type || 'material') === 'labor')
          .reduce((itemSum: number, item: any) => itemSum + item.total_price, 0);
        const estMarkup = sub.markup_percent || 0;
        rowLaborTotal += subLaborTotal * (1 + estMarkup / 100);
      });
      
      // Apply row markup
      const rowMarkup = 1 + (row.markup_percent / 100);
      return rowSum + (rowLaborTotal * rowMarkup);
    }, 0);
    
    // Add labor from linked subcontractors (labor portion)
    const linkedSubs = linkedSubcontractors[sheet.sheetId] || [];
    const linkedSubsLaborTotal = linkedSubs.reduce((subSum: number, sub: any) => {
      const subLineItems = subcontractorLineItems[sub.id] || [];
      const laborTotal = subLineItems
        .filter((item: any) => !item.excluded && (item.item_type || 'material') === 'labor')
        .reduce((itemSum: number, item: any) => itemSum + item.total_price, 0);
      const estMarkup = sub.markup_percent || 0;
      return subSum + (laborTotal * (1 + estMarkup / 100));
    }, 0);
    
    return sum + (labor ? labor.total_labor_cost : 0) + sheetLaborLineItemsTotal + linkedRowsLaborTotal + linkedSubsLaborTotal;
  }, 0);
  
  const totalCustomRowLaborCost = Object.values(customRowLabor).reduce((sum: number, labor: any) => {
    return sum + (n(labor?.estimated_hours) * n(labor?.hourly_rate));
  }, 0);
  
  const proposalLaborPrice = totalSheetLaborCost + totalCustomRowLaborCost + customRowsLaborTotal + subcontractorLaborPrice;
  
  // Combine materials with subcontractor materials for display
  const proposalMaterialsTotalWithSubcontractors = proposalMaterialsPrice + subcontractorMaterialsPrice;
  
  // Calculate subtotals
  const materialsSubtotal = proposalMaterialsPrice + subcontractorMaterialsPrice;
  const laborSubtotal = proposalLaborPrice;
  
  // Tax calculated only on TAXABLE materials (includes taxable portion of custom rows already)
  const proposalTotalTax = (proposalMaterialsTaxableOnly + subcontractorMaterialsTaxableOnly) * TAX_RATE;
  
  // Grand total
  const proposalSubtotal = materialsSubtotal + laborSubtotal;
  const proposalGrandTotal = proposalSubtotal + proposalTotalTax;

  // Progress calculations - use total labor hours from labor rows
  const progressPercent = totalLaborHours > 0 ? Math.min((totalClockInHours / totalLaborHours) * 100, 100) : 0;
  const isOverBudget = totalClockInHours > totalLaborHours && totalLaborHours > 0;

  const categoryLabels: Record<string, string> = {
    line_items: 'Line Items',
    labor: 'Labor',
    subcontractor: 'Subcontractors',
    materials: 'Additional Materials',
    equipment: 'Equipment',
    other: 'Other Costs',
  };

  const categoryDescriptions: Record<string, string> = {
    line_items: 'Container for individual line items with their own pricing and markups',
    labor: 'Labor hours and installation work for this project',
    subcontractor: 'Third-party contractors and specialized services for this project',
    materials: 'Additional materials not included in the main material workbook',
    equipment: 'Rental equipment, tools, and machinery costs',
    other: 'Miscellaneous project costs and expenses',
  };

  // Create unified list of all proposal items sorted by order_index (only standalone subs)
  const allItems = [
    ...materialsBreakdown.sheetBreakdowns.map(sheet => ({
      type: 'material' as const,
      id: sheet.sheetId,
      orderIndex: sheet.orderIndex,
      data: sheet,
    })),
    // Only include custom rows that are NOT linked to sheets
    ...customRows.filter(row => !(row as any).sheet_id).map(row => ({
      type: 'custom' as const,
      id: row.id,
      orderIndex: row.order_index,
      data: row,
    })),
    // Only include standalone subcontractors (not linked to sheets/rows)
    ...subcontractorEstimates.filter(est => !est.sheet_id && !est.row_id).map(est => ({
      type: 'subcontractor' as const,
      id: est.id,
      orderIndex: est.order_index,
      data: est,
    })),
  ].sort((a, b) => a.orderIndex - b.orderIndex);

  // Handle drag end
  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    if (!over || active.id === over.id) return;
    
    // Prevent reordering in read-only mode
    if (isReadOnly) {
      toast.error('Cannot reorder in historical view');
      return;
    }

    const oldIndex = allItems.findIndex(item => item.id === active.id);
    const newIndex = allItems.findIndex(item => item.id === over.id);

    if (oldIndex === -1 || newIndex === -1) return;

    // Reorder items
    const reorderedItems = arrayMove(allItems, oldIndex, newIndex);

    // Update order_index for all affected items
    const updates = reorderedItems.map((item, index) => {
      if (item.type === 'material') {
        return supabase
          .from('material_sheets')
          .update({ order_index: index })
          .eq('id', item.id);
      } else if (item.type === 'custom') {
        return supabase
          .from('custom_financial_rows')
          .update({ order_index: index })
          .eq('id', item.id);
      } else if (item.type === 'subcontractor') {
        return supabase
          .from('subcontractor_estimates')
          .update({ order_index: index })
          .eq('id', item.id);
      }
      return null;
    }).filter(Boolean);

    try {
      await Promise.all(updates);
      toast.success('Order updated');
      await loadData(true);
    } catch (error: any) {
      console.error('Error updating order:', error);
      toast.error('Failed to update order');
    }
  }

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

      
      {/* Proposal Info Banner - Show if quote exists */}
      {quote && (
        <Card className={`mb-4 ${quote.is_signed ? 'border-emerald-300 bg-emerald-50' : 'border-blue-200 bg-blue-50'}`}>
          <CardContent className="py-3">
            <div className="flex items-center justify-between">
              {/* Left: Current Proposal Info */}
              <div className="flex items-center gap-2">
                <FileSpreadsheet className={`w-4 h-4 ${quote.is_signed ? 'text-emerald-600' : 'text-blue-600'}`} />
                <span className={`text-sm font-semibold ${quote.is_signed ? 'text-emerald-900' : 'text-blue-900'}`}>
                  Proposal #{quote.proposal_number || quote.quote_number}
                </span>
                {quote.is_signed && (
                  <Badge className="text-xs bg-emerald-100 border-emerald-400 text-emerald-900">
                    <Lock className="w-3 h-3 mr-1" />
                    Signed Contract
                  </Badge>
                )}
              </div>

              {/* Right: Navigation + Actions */}
              <div className="flex items-center gap-2">
                {/* Create from This button */}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setCreateFromQuoteId(quote.id);
                    setShowCreateProposalDialog(true);
                  }}
                  className="h-7 text-xs border-blue-300 hover:bg-blue-100"
                >
                  <Plus className="w-3 h-3 mr-1" />
                  Create from This
                </Button>

                {/* Sign as Contract button (only for unsigned proposals) */}
                {!quote.is_signed && (
                  <Button
                    size="sm"
                    onClick={signAsContract}
                    className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700"
                  >
                    <Lock className="w-3 h-3 mr-1" />
                    Sign as Contract
                  </Button>
                )}

                {/* View Contract Comparison (only for signed proposals) */}
                {quote.is_signed && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowComparisonView(true)}
                    className="h-7 text-xs border-emerald-400 hover:bg-emerald-100"
                  >
                    <TrendingUp className="w-3 h-3 mr-1" />
                    Compare Contract vs Actual
                  </Button>
                )}

                {/* Navigation Controls */}
                {allJobQuotes.length > 1 && (
                  <div className="flex items-center gap-2 ml-2 pl-2 border-l border-blue-200">
                    <span className="text-xs text-blue-700 font-medium">
                      {allJobQuotes.findIndex(q => q.id === quote.id) + 1} of {allJobQuotes.length}
                    </span>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={navigateToPreviousProposal}
                        disabled={allJobQuotes.findIndex(q => q.id === quote.id) === allJobQuotes.length - 1}
                        className="h-7 w-7 p-0 border-blue-300 hover:bg-blue-100"
                        title="Previous Proposal (Older)"
                      >
                        <ChevronDown className="w-4 h-4 rotate-90" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={navigateToNextProposal}
                        disabled={allJobQuotes.findIndex(q => q.id === quote.id) === 0}
                        className="h-7 w-7 p-0 border-blue-300 hover:bg-blue-100"
                        title="Next Proposal (Newer)"
                      >
                        <ChevronDown className="w-4 h-4 -rotate-90" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="w-full">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold">Proposal Builder</h2>
          
          {/* Action Buttons */}
          <div className="flex gap-2 items-center">
              {/* Building Description Edit Button */}
              <Button
                onClick={() => setEditingDescription(true)}
                variant="outline"
                size="sm"
                className="border-amber-300 hover:bg-amber-50"
              >
                <Edit className="w-4 h-4 mr-2" />
                {buildingDescription ? 'Edit Building Description' : 'Add Building Description'}
              </Button>
              <div className="h-6 w-px bg-border" />
              <Button
                size="sm"
                onClick={() => {
                  if (quote) {
                    setCreateFromQuoteId(quote.id);
                    setShowCreateProposalDialog(true);
                  } else {
                    autoCreateFirstProposal();
                  }
                }}
                disabled={creatingProposal}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {creatingProposal ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus className="w-3 h-3 mr-2" />
                    {quote ? 'Create New Proposal' : 'Create Proposal'}
                  </>
                )}
              </Button>
              <div className="h-6 w-px bg-border" />
              <Button onClick={() => setShowTemplateEditor(true)} variant="outline" size="sm" className="bg-purple-50 border-purple-300 text-purple-700 hover:bg-purple-100">
                <Settings className="w-4 h-4 mr-2" />
                Edit Template
              </Button>
              <Button onClick={() => setShowDocumentViewer(true)} variant="outline" size="sm" className="bg-blue-50 border-blue-300 text-blue-700 hover:bg-blue-100">
                <FileText className="w-4 h-4 mr-2" />
                View Documents
              </Button>
              <Button onClick={() => setShowExportDialog(true)} variant="default" size="sm">
                <Download className="w-4 h-4 mr-2" />
                Export PDF
              </Button>
              <Button onClick={() => openAddDialog()} variant="outline" size="sm" disabled={isReadOnly}>
                <Plus className="w-4 h-4 mr-2" />
                Add Row
              </Button>
              <Button onClick={() => setShowSubUploadDialog(true)} variant="outline" size="sm" disabled={isReadOnly}>
                <Upload className="w-4 h-4 mr-2" />
                Upload Subcontractor Estimate
              </Button>
            </div>
        </div>

        {/* Proposal Content - Single View */}
          <div className="max-w-[1400px] mx-auto px-4">
            <div className="flex gap-4 items-start">
              {/* Main Content Column */}
              <div className="flex-1 min-w-0 space-y-1">
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={allItems.map(item => item.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {allItems.map((item) => (
                      <SortableRow
                        key={item.id}
                        item={item}
                        sheetMarkups={sheetMarkups}
                        setSheetMarkups={setSheetMarkups}
                        categoryMarkups={categoryMarkups}
                        setCategoryMarkups={setCategoryMarkups}
                        customRowLineItems={customRowLineItems}
                        sheetLabor={sheetLabor}
                        customRowLabor={customRowLabor}
                        subcontractorLineItems={subcontractorLineItems}
                        linkedSubcontractors={linkedSubcontractors}
                        editingRowName={editingRowName}
                        editingRowNameType={editingRowNameType}
                        tempRowName={tempRowName}
                        setTempRowName={setTempRowName}
                        startEditingRowName={startEditingRowName}
                        saveRowName={saveRowName}
                        cancelEditingRowName={cancelEditingRowName}
                        openSheetDescDialog={openSheetDescDialog}
                        openLaborDialog={openLaborDialog}
                        openAddDialog={openAddDialog}
                        openLineItemDialog={openLineItemDialog}
                        openSubcontractorDialog={openSubcontractorDialog}
                        deleteRow={deleteRow}
                        deleteSheetLabor={deleteSheetLabor}
                        toggleSubcontractorLineItem={toggleSubcontractorLineItem}
                        toggleSubcontractorLineItemTaxable={toggleSubcontractorLineItemTaxable}
                        toggleSubcontractorLineItemType={toggleSubcontractorLineItemType}
                        unlinkSubcontractor={unlinkSubcontractor}
                        updateSubcontractorMarkup={updateSubcontractorMarkup}
                        updateCustomRowMarkup={updateCustomRowMarkup}
                        deleteLineItem={deleteLineItem}
                        loadMaterialsData={loadMaterialsData}
                        loadCustomRows={loadCustomRows}
                        loadSubcontractorEstimates={loadSubcontractorEstimates}
                        customRows={customRows}
                        savingMarkupsRef={savingMarkupsRef}
                        isReadOnly={isReadOnly}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
              </div>

              {/* Project Total Box - Fixed Width Sidebar */}
              <div className="border-2 border-slate-900 rounded-lg overflow-hidden bg-white shadow-lg sticky top-4 w-80 flex-shrink-0">
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
                      <span className="font-bold text-slate-900">${n(proposalMaterialsTotalWithSubcontractors).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                    </div>
                    {n(proposalLaborPrice) > 0 && (
                      <div className="flex justify-between py-2 border-b border-slate-200">
                        <span className="font-semibold text-slate-700">Labor</span>
                        <span className="font-bold text-slate-900">${n(proposalLaborPrice).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                      </div>
                    )}
                  </div>

                  {/* Totals - n() ensures historical view never shows NaN */}
                  <div className="space-y-3 pt-4 border-t-2 border-slate-200">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-600">Subtotal</span>
                      <span className="font-semibold text-lg text-slate-900">${n(proposalSubtotal).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-600">Sales Tax (7%)</span>
                      <span className="font-semibold text-lg text-amber-700">${n(proposalTotalTax).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between items-center pt-3 border-t-2 border-amber-400 bg-gradient-to-r from-green-50 to-emerald-50 -mx-6 px-6 py-4 mt-4">
                      <span className="text-xl font-bold text-slate-900">GRAND TOTAL</span>
                      <span className="text-3xl font-bold text-green-700">${n(proposalGrandTotal).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
      </div>

      {/* Dialogs remain unchanged - copying from original */}
      {/* Sheet Description Dialog */}
      <Dialog open={showSheetDescDialog} onOpenChange={setShowSheetDescDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Description</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              value={sheetDescription}
              onChange={(e) => setSheetDescription(e.target.value)}
              placeholder="Enter description..."
              rows={4}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowSheetDescDialog(false)}>
                Cancel
              </Button>
              <Button onClick={saveSheetDescription}>
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Labor Dialog */}
      <Dialog open={showLaborDialog} onOpenChange={setShowLaborDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingLaborSheetId || editingLaborRowId ? 'Edit Labor' : 'Add Labor'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Description</Label>
              <Input
                value={laborForm.description}
                onChange={(e) => setLaborForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder="e.g., Labor & Installation"
              />
            </div>
            <div>
              <Label>Estimated Hours</Label>
              <Input
                type="number"
                value={laborForm.estimated_hours}
                onChange={(e) => setLaborForm(prev => ({ ...prev, estimated_hours: parseFloat(e.target.value) || 0 }))}
                step="0.5"
                min="0"
              />
            </div>
            <div>
              <Label>Hourly Rate ($)</Label>
              <Input
                type="number"
                value={laborForm.hourly_rate}
                onChange={(e) => setLaborForm(prev => ({ ...prev, hourly_rate: parseFloat(e.target.value) || 60 }))}
                step="1"
                min="0"
              />
            </div>
            <div>
              <Label>Notes (Optional)</Label>
              <Textarea
                value={laborForm.notes}
                onChange={(e) => setLaborForm(prev => ({ ...prev, notes: e.target.value }))}
                rows={2}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowLaborDialog(false)}>
                Cancel
              </Button>
              <Button onClick={saveSheetLabor}>
                Save Labor
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Custom Row Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingRow ? 'Edit Row' : 'Add Custom Row'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {!linkedSheetId && (
              <div>
                <Label>Category</Label>
                <Select 
                  value={category} 
                  onValueChange={(val) => {
                    setCategory(val);
                    // Auto-set fields based on category
                    if (val === 'materials') {
                      setTaxable(true);
                    } else if (val === 'labor') {
                      setTaxable(false);
                    } else if (val === 'line_items') {
                      // Line items container - no base cost
                      setQuantity('1');
                      setUnitCost('0');
                      setMarkupPercent('0');
                      setTaxable(true);
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="line_items">📋 Line Items Container</SelectItem>
                    <SelectItem value="materials">Materials</SelectItem>
                    <SelectItem value="labor">Labor</SelectItem>
                    <SelectItem value="subcontractor">Subcontractor</SelectItem>
                    <SelectItem value="equipment">Equipment</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
                {category === 'line_items' && (
                  <p className="text-xs text-blue-600 mt-2 bg-blue-50 border border-blue-200 rounded p-2">
                    <strong>Line Items Container:</strong> This row has no base cost. Add individual line items below, each with their own pricing, markup, and tax settings.
                  </p>
                )}
              </div>
            )}

            <div>
              <Label>Name</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g., Gutters, Electrical Work, Concrete"
              />
            </div>

            {category !== 'line_items' && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Quantity</Label>
                    <Input
                      type="number"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      step="0.01"
                      min="0"
                    />
                  </div>
                  <div>
                    <Label>Unit Cost ($)</Label>
                    <Input
                      type="number"
                      value={unitCost}
                      onChange={(e) => setUnitCost(e.target.value)}
                      step="0.01"
                      min="0"
                    />
                  </div>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded p-3">
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-600 font-medium">Base Cost:</span>
                      <span className="font-bold text-blue-700">
                        ${((parseFloat(quantity) || 0) * (parseFloat(unitCost) || 0)).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mt-2">
                      💡 <strong>Tip:</strong> Set Quantity or Unit Cost to $0 if you only want to use line items for this section.
                      The section can have a base cost AND line items, or just line items alone.
                    </p>
                  </div>
                </div>

                <div>
                  <Label>Markup %</Label>
                  <Input
                    type="number"
                    value={markupPercent}
                    onChange={(e) => setMarkupPercent(e.target.value)}
                    step="1"
                    min="0"
                  />
                </div>
              </>
            )}

            {category === 'line_items' && (
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-300 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <List className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                  <div className="space-y-2 text-sm">
                    <p className="font-semibold text-blue-900">Line Items Only Section</p>
                    <p className="text-slate-700">This row serves as a container. After creating it, you can:</p>
                    <ul className="list-disc list-inside text-slate-600 space-y-1 ml-2">
                      <li>Add individual line items with their own pricing</li>
                      <li>Set different markup percentages for each item</li>
                      <li>Control taxable status per line item</li>
                      <li>Mix material and labor items in the same section</li>
                    </ul>
                    <p className="text-blue-700 font-medium mt-3">
                      ✓ No base cost • ✓ No row-level markup • ✓ Full line item control
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div>
              <Label>Description</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Enter detailed description of the work or materials..."
                rows={3}
              />
            </div>

            {category !== 'line_items' && (
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="row-taxable"
                  checked={taxable}
                  onChange={(e) => setTaxable(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <Label htmlFor="row-taxable" className="cursor-pointer">
                  Taxable
                </Label>
                <p className="text-xs text-muted-foreground ml-2">
                  {taxable 
                    ? 'Will be included in taxable subtotal (materials)' 
                    : 'Will be excluded from tax calculation (labor)'}
                </p>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowAddDialog(false)}>
                Cancel
              </Button>
              <Button onClick={saveCustomRow}>
                {editingRow ? 'Update' : 'Add'} Row
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Line Item Dialog */}
      <Dialog open={showLineItemDialog} onOpenChange={setShowLineItemDialog}>
        <DialogContent className={lineItemType === 'combined' ? "max-w-4xl" : "max-w-lg"}>
          <DialogHeader>
            <DialogTitle>
              {editingLineItem ? 'Edit Line Item' : 'Add Line Item'}
            </DialogTitle>
            <DialogDescription>
              {lineItemType === 'material' && 'Add material costs with markup and tax options'}
              {lineItemType === 'labor' && 'Add labor hours and rates'}
              {lineItemType === 'combined' && 'Add material costs, labor hours, or both in a single line item'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Description</Label>
              <Input
                value={lineItemForm.description}
                onChange={(e) => setLineItemForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder={lineItemType === 'labor' ? "e.g., Installation Labor" : "e.g., Concrete Foundation with Installation"}
              />
            </div>

            {/* Conditional layout based on type */}
            {lineItemType === 'combined' ? (
              /* Two-column layout for Combined */
              <div className="grid grid-cols-2 gap-6">
                {/* Material Section */}
                <div className="space-y-4 border-r pr-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-2 h-2 rounded-full bg-blue-600" />
                    <h3 className="text-sm font-semibold text-blue-900">Material</h3>
                  </div>
                  
                  <div>
                    <Label>Quantity</Label>
                    <Input
                      type="number"
                      value={lineItemForm.quantity}
                      onChange={(e) => setLineItemForm(prev => ({ ...prev, quantity: e.target.value }))}
                      step="0.01"
                      min="0"
                      placeholder="0"
                    />
                  </div>
                  
                  <div>
                    <Label>Unit Cost ($)</Label>
                    <Input
                      type="number"
                      value={lineItemForm.unit_cost}
                      onChange={(e) => setLineItemForm(prev => ({ ...prev, unit_cost: e.target.value }))}
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                    />
                  </div>
                  
                  <div>
                    <Label>Markup %</Label>
                    <Input
                      type="number"
                      value={lineItemForm.markup_percent}
                      onChange={(e) => setLineItemForm(prev => ({ ...prev, markup_percent: e.target.value }))}
                      step="1"
                      min="0"
                      placeholder="10"
                    />
                  </div>
                  
                  <div className="bg-blue-50 border border-blue-200 rounded p-3 text-xs">
                    <div className="flex justify-between mb-1">
                      <span className="text-slate-600">Cost:</span>
                      <span className="font-semibold">
                        ${((parseFloat(lineItemForm.quantity) || 0) * (parseFloat(lineItemForm.unit_cost) || 0)).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="flex justify-between mb-1">
                      <span className="text-slate-600">Markup:</span>
                      <span className="font-semibold">
                        ${(((parseFloat(lineItemForm.quantity) || 0) * (parseFloat(lineItemForm.unit_cost) || 0)) * (parseFloat(lineItemForm.markup_percent) || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-blue-300">
                      <span className="font-bold text-blue-900">Material Price:</span>
                      <span className="font-bold text-blue-700">
                        ${(((parseFloat(lineItemForm.quantity) || 0) * (parseFloat(lineItemForm.unit_cost) || 0)) * (1 + (parseFloat(lineItemForm.markup_percent) || 0) / 100)).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="lineitem-taxable"
                      checked={lineItemForm.taxable}
                      onChange={(e) => setLineItemForm(prev => ({ ...prev, taxable: e.target.checked }))}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <Label htmlFor="lineitem-taxable" className="cursor-pointer text-xs">
                      Taxable (materials only)
                    </Label>
                  </div>
                </div>
                
                {/* Labor Section */}
                <div className="space-y-4 pl-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-2 h-2 rounded-full bg-amber-600" />
                    <h3 className="text-sm font-semibold text-amber-900">Labor</h3>
                  </div>
                  
                  <div>
                    <Label>Hours</Label>
                    <Input
                      type="number"
                      value={lineItemForm.labor_hours}
                      onChange={(e) => setLineItemForm(prev => ({ ...prev, labor_hours: e.target.value }))}
                      step="0.5"
                      min="0"
                      placeholder="0"
                    />
                  </div>
                  
                  <div>
                    <Label>Hourly Rate ($)</Label>
                    <Input
                      type="number"
                      value={lineItemForm.labor_rate}
                      onChange={(e) => setLineItemForm(prev => ({ ...prev, labor_rate: e.target.value }))}
                      step="1"
                      min="0"
                      placeholder="60"
                    />
                  </div>
                  
                  <div>
                    <Label>Markup %</Label>
                    <Input
                      type="number"
                      value={lineItemForm.labor_markup_percent}
                      onChange={(e) => setLineItemForm(prev => ({ ...prev, labor_markup_percent: e.target.value }))}
                      step="1"
                      min="0"
                      placeholder="10"
                    />
                  </div>
                  
                  <div className="bg-amber-50 border border-amber-200 rounded p-3 text-xs">
                    <div className="flex justify-between mb-1">
                      <span className="text-slate-600">Cost:</span>
                      <span className="font-semibold">
                        ${((parseFloat(lineItemForm.labor_hours) || 0) * (parseFloat(lineItemForm.labor_rate) || 0)).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="flex justify-between mb-1">
                      <span className="text-slate-600">Markup:</span>
                      <span className="font-semibold">
                        ${(((parseFloat(lineItemForm.labor_hours) || 0) * (parseFloat(lineItemForm.labor_rate) || 0)) * (parseFloat(lineItemForm.labor_markup_percent) || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-amber-300">
                      <span className="font-bold text-amber-900">Labor Price:</span>
                      <span className="font-bold text-amber-700">
                        ${(((parseFloat(lineItemForm.labor_hours) || 0) * (parseFloat(lineItemForm.labor_rate) || 0)) * (1 + (parseFloat(lineItemForm.labor_markup_percent) || 0) / 100)).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                  
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                    Labor is automatically non-taxable
                  </p>
                </div>
              </div>
            ) : lineItemType === 'labor' ? (
              /* Labor-only layout */
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2 h-2 rounded-full bg-amber-600" />
                  <h3 className="text-sm font-semibold text-amber-900">Labor Details</h3>
                </div>
                
                <div>
                  <Label>Hours</Label>
                  <Input
                    type="number"
                    value={lineItemForm.labor_hours}
                    onChange={(e) => setLineItemForm(prev => ({ ...prev, labor_hours: e.target.value }))}
                    step="0.5"
                    min="0"
                    placeholder="0"
                  />
                </div>
                
                <div>
                  <Label>Hourly Rate ($)</Label>
                  <Input
                    type="number"
                    value={lineItemForm.labor_rate}
                    onChange={(e) => setLineItemForm(prev => ({ ...prev, labor_rate: e.target.value }))}
                    step="1"
                    min="0"
                    placeholder="60"
                  />
                </div>
                
                <div>
                  <Label>Markup %</Label>
                  <Input
                    type="number"
                    value={lineItemForm.labor_markup_percent}
                    onChange={(e) => setLineItemForm(prev => ({ ...prev, labor_markup_percent: e.target.value }))}
                    step="1"
                    min="0"
                    placeholder="10"
                  />
                </div>
                
                <div className="bg-amber-50 border border-amber-200 rounded p-3">
                  <div className="flex justify-between mb-1 text-sm">
                    <span className="text-slate-600">Cost:</span>
                    <span className="font-semibold">
                      ${((parseFloat(lineItemForm.labor_hours) || 0) * (parseFloat(lineItemForm.labor_rate) || 0)).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex justify-between mb-1 text-sm">
                    <span className="text-slate-600">Markup:</span>
                    <span className="font-semibold">
                      ${(((parseFloat(lineItemForm.labor_hours) || 0) * (parseFloat(lineItemForm.labor_rate) || 0)) * (parseFloat(lineItemForm.labor_markup_percent) || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-amber-300">
                    <span className="font-bold text-amber-900">Total Labor Price:</span>
                    <span className="font-bold text-amber-700 text-lg">
                      ${(((parseFloat(lineItemForm.labor_hours) || 0) * (parseFloat(lineItemForm.labor_rate) || 0)) * (1 + (parseFloat(lineItemForm.labor_markup_percent) || 0) / 100)).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
                
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                  Labor is automatically non-taxable
                </p>
              </div>
            ) : (
              /* Material-only layout */
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2 h-2 rounded-full bg-blue-600" />
                  <h3 className="text-sm font-semibold text-blue-900">Material Details</h3>
                </div>
                
                <div>
                  <Label>Quantity</Label>
                  <Input
                    type="number"
                    value={lineItemForm.quantity}
                    onChange={(e) => setLineItemForm(prev => ({ ...prev, quantity: e.target.value }))}
                    step="0.01"
                    min="0"
                    placeholder="0"
                  />
                </div>
                
                <div>
                  <Label>Unit Cost ($)</Label>
                  <Input
                    type="number"
                    value={lineItemForm.unit_cost}
                    onChange={(e) => setLineItemForm(prev => ({ ...prev, unit_cost: e.target.value }))}
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                  />
                </div>
                
                <div>
                  <Label>Markup %</Label>
                  <Input
                    type="number"
                    value={lineItemForm.markup_percent}
                    onChange={(e) => setLineItemForm(prev => ({ ...prev, markup_percent: e.target.value }))}
                    step="1"
                    min="0"
                    placeholder="10"
                  />
                </div>
                
                <div className="bg-blue-50 border border-blue-200 rounded p-3">
                  <div className="flex justify-between mb-1 text-sm">
                    <span className="text-slate-600">Cost:</span>
                    <span className="font-semibold">
                      ${((parseFloat(lineItemForm.quantity) || 0) * (parseFloat(lineItemForm.unit_cost) || 0)).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex justify-between mb-1 text-sm">
                    <span className="text-slate-600">Markup:</span>
                    <span className="font-semibold">
                      ${(((parseFloat(lineItemForm.quantity) || 0) * (parseFloat(lineItemForm.unit_cost) || 0)) * (parseFloat(lineItemForm.markup_percent) || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-blue-300">
                    <span className="font-bold text-blue-900">Total Material Price:</span>
                    <span className="font-bold text-blue-700 text-lg">
                      ${(((parseFloat(lineItemForm.quantity) || 0) * (parseFloat(lineItemForm.unit_cost) || 0)) * (1 + (parseFloat(lineItemForm.markup_percent) || 0) / 100)).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="lineitem-taxable"
                    checked={lineItemForm.taxable}
                    onChange={(e) => setLineItemForm(prev => ({ ...prev, taxable: e.target.checked }))}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <Label htmlFor="lineitem-taxable" className="cursor-pointer text-sm">
                    Taxable
                  </Label>
                </div>
              </div>
            )}
            
            {/* Combined Total - only show for combined type */}
            {lineItemType === 'combined' && (
              <div className="bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-300 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-green-900">Combined Total Price</p>
                    <p className="text-xs text-green-700">Material + Labor (with markups)</p>
                  </div>
                  <p className="text-2xl font-bold text-green-700">
                    ${(
                      (((parseFloat(lineItemForm.quantity) || 0) * (parseFloat(lineItemForm.unit_cost) || 0)) * (1 + (parseFloat(lineItemForm.markup_percent) || 0) / 100)) +
                      (((parseFloat(lineItemForm.labor_hours) || 0) * (parseFloat(lineItemForm.labor_rate) || 0)) * (1 + (parseFloat(lineItemForm.labor_markup_percent) || 0) / 100))
                    ).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </div>
            )}
            
            <div>
              <Label>Notes (Optional)</Label>
              <Textarea
                value={lineItemForm.notes}
                onChange={(e) => setLineItemForm(prev => ({ ...prev, notes: e.target.value }))}
                rows={2}
                placeholder="Additional details about this line item..."
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowLineItemDialog(false)}>
                Cancel
              </Button>
              {!editingLineItem && (
                <Button variant="outline" onClick={() => saveLineItem(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Save & Add Another
                </Button>
              )}
              <Button onClick={() => saveLineItem(false)}>
                {editingLineItem ? 'Update' : 'Save'} Line Item
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Subcontractor Upload Dialog */}
      {showSubUploadDialog && (
        <SubcontractorEstimatesManagement
          jobId={job.id}
          quoteId={null}
          onClose={() => {
            setShowSubUploadDialog(false);
            loadSubcontractorEstimates();
          }}
        />
      )}

      {/* Export PDF Dialog */}
      <Dialog open={showExportDialog} onOpenChange={setShowExportDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Export Proposal as PDF</DialogTitle>
            <DialogDescription>
              Choose the version to export: Customer version for clients or Office view with detailed pricing.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="mb-2 block">Export Version</Label>
              <Select value={exportViewType} onValueChange={(v) => setExportViewType(v as 'customer' | 'office')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="customer">Customer Version</SelectItem>
                  <SelectItem value="office">Office View (Internal)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {exportViewType === 'customer' && (
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="show-line-items"
                  checked={showLineItems}
                  onChange={(e) => setShowLineItems(e.target.checked)}
                  className="rounded"
                />
                <Label htmlFor="show-line-items">Show section prices</Label>
              </div>
            )}

            <div className="bg-blue-50 border border-blue-200 rounded p-3 text-xs">
              {exportViewType === 'office' ? (
                <>
                  <p className="font-semibold text-blue-900 mb-1">Office View includes:</p>
                  <ul className="list-disc list-inside text-blue-800 space-y-0.5">
                    <li>All line items with individual unit prices and totals</li>
                    <li>Detailed breakdown for each section</li>
                    <li>No payment terms or signature sections</li>
                    <li>Internal use only - NOT for customer distribution</li>
                  </ul>
                </>
              ) : (
                <>
                  <p className="font-semibold text-blue-900 mb-1">Customer Version includes:</p>
                  <ul className="list-disc list-inside text-blue-800 space-y-0.5">
                    <li>Section descriptions without line item details</li>
                    <li>Optional section pricing</li>
                    <li>Payment terms and signature areas</li>
                    <li>Professional customer-facing format</li>
                  </ul>
                </>
              )}
            </div>
            
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowExportDialog(false)} disabled={exporting}>
                Cancel
              </Button>
              <Button onClick={handleExportPDF} disabled={exporting}>
                {exporting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    Exporting...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4 mr-2" />
                    Export {exportViewType === 'office' ? 'Office View' : 'Customer PDF'}
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Link Subcontractor Dialog */}
      <Dialog open={showSubcontractorDialog} onOpenChange={setShowSubcontractorDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Subcontractor to Row</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Tabs value={subcontractorMode} onValueChange={(v) => setSubcontractorMode(v as 'select' | 'upload')}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="select">Select Existing</TabsTrigger>
                <TabsTrigger value="upload">Upload New</TabsTrigger>
              </TabsList>
              
              <TabsContent value="select" className="space-y-4">
                <div>
                  <Label>Select Subcontractor</Label>
                  <Select value={selectedExistingSubcontractor} onValueChange={setSelectedExistingSubcontractor}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a subcontractor..." />
                    </SelectTrigger>
                    <SelectContent>
                      {subcontractorEstimates.filter(s => !s.sheet_id && !s.row_id).map(sub => (
                        <SelectItem key={sub.id} value={sub.id}>
                          {sub.company_name} - ${(sub.total_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setShowSubcontractorDialog(false)}>
                    Cancel
                  </Button>
                  <Button onClick={linkExistingSubcontractor}>
                    Link Subcontractor
                  </Button>
                </div>
              </TabsContent>
              
              <TabsContent value="upload">
                <div className="text-center py-4">
                  <p className="text-sm text-muted-foreground mb-4">
                    Upload a new subcontractor estimate that will be automatically linked to this row.
                  </p>
                  <Button onClick={() => {
                    setShowSubcontractorDialog(false);
                    setShowSubUploadDialog(true);
                  }}>
                    <Upload className="w-4 h-4 mr-2" />
                    Upload Estimate
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create New Proposal Dialog */}
      <Dialog open={showCreateProposalDialog} onOpenChange={(open) => {
        setShowCreateProposalDialog(open);
        if (!open) setCreateFromQuoteId(null);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Proposal</DialogTitle>
            <DialogDescription>
              {createFromQuoteId
                ? `This will create a new proposal duplicated from ${allJobQuotes.find(q => q.id === createFromQuoteId)?.proposal_number || 'the selected proposal'}.`
                : 'This will create a new proposal with all data duplicated from the current one.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-300 rounded-lg p-3 text-sm">
              <div className="flex items-start gap-2">
                <Plus className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-blue-900 mb-1">What happens:</p>
                  <ul className="text-blue-800 space-y-1 list-disc list-inside">
                    <li>All materials, rows, and estimates are <strong>fully duplicated</strong></li>
                    <li>New proposal gets its own independent data</li>
                    <li>Source proposal is not modified</li>
                    <li>Complete "air gap" - zero interference between proposals</li>
                  </ul>
                </div>
              </div>
            </div>
            <div>
              <Label>Notes (Optional)</Label>
              <Textarea
                value={proposalChangeNotes}
                onChange={(e) => setProposalChangeNotes(e.target.value)}
                placeholder="e.g., Updated pricing per customer request, Added garage door options..."
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowCreateProposalDialog(false);
                  setProposalChangeNotes('');
                  setCreateFromQuoteId(null);
                }}
                disabled={creatingProposal}
              >
                Cancel
              </Button>
              <Button onClick={() => createNewProposal(createFromQuoteId || undefined)} disabled={creatingProposal}>
                {creatingProposal ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4 mr-2" />
                    Create New Proposal
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Contract vs Working Comparison Dialog */}
      <Dialog open={showComparisonView} onOpenChange={setShowComparisonView}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Contract vs Actual Comparison
            </DialogTitle>
            <DialogDescription>
              Detailed breakdown of differences between the original signed contract and the current working version.
            </DialogDescription>
          </DialogHeader>
          {quote?.is_signed && (
            <ContractComparison quoteId={quote.id} jobId={job.id} />
          )}
        </DialogContent>
      </Dialog>

      {/* Floating Document Viewer */}
      <FloatingDocumentViewer
        jobId={job.id}
        open={showDocumentViewer}
        onClose={() => setShowDocumentViewer(false)}
      />

      {/* Template Editor */}
      <ProposalTemplateEditor
        open={showTemplateEditor}
        onClose={() => setShowTemplateEditor(false)}
      />

      {/* Building Description Dialog */}
      <Dialog open={editingDescription} onOpenChange={setEditingDescription}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Building Description</DialogTitle>
            <DialogDescription>
              Add a brief description of the building that will appear at the top of the proposal.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Description</Label>
              <Textarea
                value={buildingDescription}
                onChange={(e) => setBuildingDescription(e.target.value)}
                placeholder="Enter building description...\n\nExample: 72' x 116' pole building with 20' sidewalls, 5:12 roof pitch, and 16' wide x 14' tall overhead doors."
                rows={6}
                className="mt-2"
              />
              <p className="text-xs text-muted-foreground mt-2">
                This description will appear at the top of the proposal, inside the "Work to be Completed" section.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setEditingDescription(false);
                  setBuildingDescription(job.description || '');
                }}
              >
                Cancel
              </Button>
              <Button onClick={saveBuildingDescription}>
                Save Description
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
