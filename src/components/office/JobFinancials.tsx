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
import { Plus, Trash2, DollarSign, Clock, TrendingUp, Percent, Calculator, FileSpreadsheet, ChevronDown, Briefcase, Edit, Upload, MoreVertical, List, Eye, Check, X, GripVertical, Download, History, Lock, Calendar, FileText, Settings } from 'lucide-react';
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
          ? lineItems.reduce((itemSum: number, item: any) => itemSum + item.total_cost, 0)
          : row.total_cost;
        return rowSum + (baseCost * (1 + row.markup_percent / 100));
      }, 0);
      
      // Calculate linked subcontractors - taxable only for base cost
      const linkedSubsTaxableTotal = linkedSubs.reduce((sum: number, sub: any) => {
        const lineItems = subcontractorLineItems[sub.id] || [];
        const taxableTotal = lineItems
          .filter((item: any) => !item.excluded && item.taxable)
          .reduce((itemSum: number, item: any) => itemSum + item.total_price, 0);
        const estMarkup = sub.markup_percent || 0;
        return sum + (taxableTotal * (1 + estMarkup / 100));
      }, 0);
      
      // Calculate linked subcontractors - non-taxable (labor)
      const linkedSubsNonTaxableTotal = linkedSubs.reduce((sum: number, sub: any) => {
        const lineItems = subcontractorLineItems[sub.id] || [];
        const nonTaxableTotal = lineItems
          .filter((item: any) => !item.excluded && !item.taxable)
          .reduce((itemSum: number, item: any) => itemSum + item.total_price, 0);
        const estMarkup = sub.markup_percent || 0;
        return sum + (nonTaxableTotal * (1 + estMarkup / 100));
      }, 0);
      
      // Calculate sheet labor
      const sheetLaborTotal = sheetLabor[sheet.sheetId] ? sheetLabor[sheet.sheetId].total_labor_cost : 0;
      
      // Calculate labor from sheet line items
      const sheetLaborItems = customRowLineItems[sheet.sheetId]?.filter((item: any) => (item.item_type || 'material') === 'labor') || [];
      const sheetLaborLineItemsTotal = sheetLaborItems.reduce((sum: number, item: any) => sum + item.total_cost, 0);
      
      // Calculate total materials with category markups (NO sheet-level markup)
      const categoryTotals = sheet.categories?.reduce((sum: number, cat: any) => {
        const categoryKey = `${sheet.sheetId}_${cat.name}`;
        const categoryMarkup = categoryMarkups[categoryKey] ?? 10;
        const categoryPriceWithMarkup = cat.totalCost * (1 + categoryMarkup / 100);
        return sum + categoryPriceWithMarkup;
      }, 0) || 0;
      
      // Final price = (materials with category markups) + (linked rows with their own markup) + (linked subs)
      const sheetFinalPrice = categoryTotals + linkedRowsTotal + linkedSubsTaxableTotal;
      
      // Total labor for display (legacy sheet labor + sheet labor line items + non-taxable subcontractor)
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
              <p className="text-base font-bold text-blue-700">${sheetFinalPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
              {totalLaborCost > 0 && (
                <>
                  <p className="text-sm text-slate-500 mt-2">Labor</p>
                  <p className="text-base font-bold text-amber-700">${totalLaborCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
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
                              <p className="font-semibold text-slate-900">${category.totalCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
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
                    const itemMarkup = row.markup_percent || 0;
                    const itemCost = row.total_cost;
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
                        {sheetLabor[sheet.sheetId].estimated_hours}h × ${sheetLabor[sheet.sheetId].hourly_rate}/hr
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-bold text-slate-900">
                        ${sheetLabor[sheet.sheetId].total_labor_cost.toLocaleString('en-US', { minimumFractionDigits: 2 })}
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
                  .reduce((sum: number, item: any) => sum + item.total_price, 0);
                const totalWithMarkup = includedTotal * (1 + (sub.markup_percent || 0) / 100);

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
                              <span className="text-slate-600">Base: ${includedTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
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
                              ${totalWithMarkup.toLocaleString('en-US', { minimumFractionDigits: 2 })}
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
      
      // Calculate material line items total WITH individual markups
      const materialLineItemsTotal = materialLineItems.reduce((sum: number, item: any) => {
        const itemMarkup = item.markup_percent || 0;
        return sum + (item.total_cost * (1 + itemMarkup / 100));
      }, 0);
      
      // Calculate labor line items total WITH individual markups
      const laborLineItemsTotal = laborLineItems.reduce((sum: number, item: any) => {
        const itemMarkup = item.markup_percent || 0;
        return sum + (item.total_cost * (1 + itemMarkup / 100));
      }, 0);
      
      // Calculate linked subcontractors - taxable (materials)
      const linkedSubsTaxableTotal = linkedSubs.reduce((sum: number, sub: any) => {
        const subLineItems = subcontractorLineItems[sub.id] || [];
        const taxableTotal = subLineItems
          .filter((item: any) => !item.excluded && item.taxable)
          .reduce((itemSum: number, item: any) => itemSum + item.total_price, 0);
        const estMarkup = sub.markup_percent || 0;
        return sum + (taxableTotal * (1 + estMarkup / 100));
      }, 0);
      
      // Calculate linked subcontractors - non-taxable (labor)
      const linkedSubsNonTaxableTotal = linkedSubs.reduce((sum: number, sub: any) => {
        const subLineItems = subcontractorLineItems[sub.id] || [];
        const nonTaxableTotal = subLineItems
          .filter((item: any) => !item.excluded && !item.taxable)
          .reduce((itemSum: number, item: any) => itemSum + item.total_price, 0);
        const estMarkup = sub.markup_percent || 0;
        return sum + (nonTaxableTotal * (1 + estMarkup / 100));
      }, 0);
      
      // Calculate custom row labor
      const customLaborTotal = customRowLabor[row.id] 
        ? (customRowLabor[row.id].estimated_hours * customRowLabor[row.id].hourly_rate)
        : 0;
      
      // When line items exist, use their marked-up totals directly (NO row-level markup)
      // When no line items, use row total with row markup
      const finalPrice = lineItems.length > 0
        ? materialLineItemsTotal + linkedSubsTaxableTotal
        : (row.total_cost + linkedSubsTaxableTotal) * (1 + row.markup_percent / 100);
      
      // Base cost for display (without markup)
      const baseCost = lineItems.length > 0
        ? lineItems.reduce((sum: number, item: any) => sum + item.total_cost, 0) + linkedSubsTaxableTotal
        : row.total_cost + linkedSubsTaxableTotal;
      
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
                  <span>Base: ${baseCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
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
              <p className="text-base font-bold text-blue-700">${finalPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
              {totalLaborCost > 0 && (
                <>
                  <p className="text-sm text-slate-500 mt-2">Labor</p>
                  <p className="text-base font-bold text-amber-700">${totalLaborCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
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
                      const itemMarkup = lineItem.markup_percent || 0;
                      const itemCost = lineItem.total_cost;
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
                    .reduce((sum: number, item: any) => sum + item.total_price, 0);
                  const totalWithMarkup = includedTotal * (1 + (sub.markup_percent || 0) / 100);

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
                                <span className="text-slate-600">Base: ${includedTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
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
                                ${totalWithMarkup.toLocaleString('en-US', { minimumFractionDigits: 2 })}
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
        .reduce((itemSum: number, item: any) => itemSum + (item.total_price || 0), 0);
      const estMarkup = est.markup_percent || 0;
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
                <span>Base: ${includedTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
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
              <p className="text-base font-bold text-blue-700">${finalPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
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
  const [savingLineItem, setSavingLineItem] = useState(false);
  const savingLineItemRef = useRef(false);
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
  
  // Proposal versioning state
  const [proposalVersions, setProposalVersions] = useState<any[]>([]);
  const [viewingProposalNumber, setViewingProposalNumber] = useState<number | null>(null);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [showCreateVersionDialog, setShowCreateVersionDialog] = useState(false);
  const [versionChangeNotes, setVersionChangeNotes] = useState('');
  const [creatingVersion, setCreatingVersion] = useState(false);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [initializingVersions, setInitializingVersions] = useState(false);
  
  // Computed: Read-only mode when viewing historical proposal (not the most recent)
  const isReadOnly = quote && allJobQuotes.length > 0 && quote.id !== allJobQuotes[0]?.id;
  
  // Document viewer state
  const [showDocumentViewer, setShowDocumentViewer] = useState(false);
  const [buildingDescription, setBuildingDescription] = useState((quote as any)?.description || '');
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
    let cancelled = false;
    let pollInterval: ReturnType<typeof setInterval> | null = null;
    (async () => {
      // Load quote first so we have the correct proposal; then load financials once with that quote
      const selectedQuote = await loadQuoteData();
      if (cancelled) return;
      await loadData(false, selectedQuote ?? undefined);
      if (cancelled) return;
      pollInterval = setInterval(async () => {
        if (cancelled) return;
        await loadQuoteData();
        loadData(true); // silent refresh
      }, 5000);
    })();
    return () => {
      cancelled = true;
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [job.id]);

  // Load proposal versions when quote changes
  useEffect(() => {
    if (quote) {
      loadProposalVersions();
    } else {
      setProposalVersions([]);
    }
  }, [quote?.id]);

  // Sync building description whenever the active proposal changes
  useEffect(() => {
    setBuildingDescription((quote as any)?.description || '');
  }, [quote?.id]);

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

  // This effect has been replaced by the simpler loading-based auto-create above

  async function initializeVersioning() {
    if (!quote) return;
    
    setInitializingVersions(true);
    try {
      console.log('🚀 Initializing versioning system for quote:', quote.id);
      
      // Create initial snapshot using Edge Function
      const { data, error } = await supabase.functions.invoke('create-proposal-version', {
        body: { quoteId: quote.id }
      });
      
      if (error) throw error;
      
      toast.success('Version 1 created successfully!');
      await loadProposalVersions();
    } catch (error: any) {
      console.error('Error initializing versioning:', error);
      toast.error('Failed to initialize versioning: ' + error.message);
    } finally {
      setInitializingVersions(false);
    }
  }

  async function loadProposalVersions() {
    if (!quote) return;
    
    try {
      const { data, error } = await supabase
        .from('proposal_versions')
        .select('*')
        .eq('quote_id', quote.id)
        .order('version_number', { ascending: false });
      
      if (error) throw error;
      setProposalVersions(data || []);
    } catch (error: any) {
      console.error('Error loading proposal versions:', error);
    }
  }

  async function createNewProposalVersion() {
    setCreatingVersion(true);
    try {
      // Build change notes
      let changeNotes = versionChangeNotes.trim();
      if (viewingProposalNumber !== null) {
        const baseNote = `Based on version ${viewingProposalNumber}`;
        changeNotes = changeNotes ? `${baseNote}. ${changeNotes}` : baseNote;
      }
      
      // Call database function with either quote_id OR job_id
      // If no quote exists, the function will create one automatically
      const { data, error } = await supabase.rpc('create_proposal_version', {
        p_quote_id: quote?.id || null,
        p_job_id: quote ? null : job.id,
        p_user_id: profile?.id || null,
        p_change_notes: changeNotes || null
      });
      
      if (error) throw error;
      
      console.log('✅ Version created:', data);
      
      toast.success('Proposal version created successfully!');
      
      // If we just created the first quote/version, reload quote data
      if (!quote) {
        await loadQuoteData();
      }
      
      // Reset state and reload
      setShowCreateVersionDialog(false);
      setVersionChangeNotes('');
      setViewingProposalNumber(null);
      await loadProposalVersions();
    } catch (error: any) {
      console.error('Error creating proposal version:', error);
      toast.error('Failed to create version: ' + error.message);
    } finally {
      setCreatingVersion(false);
    }
  }

  async function signAndLockVersion(versionId: string) {
    if (!confirm('Sign and lock this version? This cannot be undone.')) return;
    
    try {
      const { error } = await supabase
        .from('proposal_versions')
        .update({
          is_signed: true,
          signed_at: new Date().toISOString(),
          signed_by: profile?.id
        })
        .eq('id', versionId);
      
      if (error) throw error;
      
      // Update quote to mark this version as signed
      const version = proposalVersions.find(v => v.id === versionId);
      if (version) {
        await supabase
          .from('quotes')
          .update({ signed_version: version.version_number })
          .eq('id', quote.id);
      }
      
      toast.success('Version signed and locked!');
      await loadProposalVersions();
      await loadQuoteData();
    } catch (error: any) {
      console.error('Error signing version:', error);
      toast.error('Failed to sign version');
    }
  }

  async function loadQuoteData(): Promise<any> {
    try {
      let quoteData: any = null;
      
      // Single query: load ALL quotes for this job (for navigation + selected quote)
      const { data: allQuotes, error: allQuotesError } = await supabase
        .from('quotes')
        .select('*')
        .eq('job_id', job.id)
        .order('created_at', { ascending: false });
      
      if (allQuotesError) {
        console.error('Error loading all quotes:', allQuotesError);
        return undefined;
      }
      
      const quotesList = allQuotes || [];
      setAllJobQuotes(quotesList);

      // When job already has quotes, use that list (no second query)
      if (quotesList.length > 0) {
        if (userSelectedQuoteIdRef.current) {
          const selectedQuote = quotesList.find((q: any) => q.id === userSelectedQuoteIdRef.current);
          quoteData = selectedQuote ?? quotesList[0];
          if (!selectedQuote) userSelectedQuoteIdRef.current = quoteData.id;
        } else if (!quote) {
          quoteData = quotesList[0];
          userSelectedQuoteIdRef.current = quoteData.id;
        } else {
          quoteData = quote;
        }
        setQuote(quoteData);
        return quoteData;
      }

      // No quotes linked to job yet — try to find an unlinked quote to link
      {
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
          setQuote(quoteData);
          userSelectedQuoteIdRef.current = quoteData.id;
        } else {
          setQuote(null);
          userSelectedQuoteIdRef.current = null;
        }
      }
      return quoteData;
    } catch (error: any) {
      console.error('Error loading quote data:', error);
      return undefined;
    }
  }

  async function createNewProposal() {
    if (!quote || !profile) return;
    setCreatingProposal(true);

    const oldQuoteId = quote.id;
    const safetyTimeoutMs = 90000; // 90s max so loading never sticks forever
    const safetyTimer = setTimeout(() => {
      setCreatingProposal(false);
      toast.error('Proposal create took too long; you may need to refresh.');
    }, safetyTimeoutMs);

    try {
      // ── Step 1: Create the new quotes row ──
      // The DB trigger auto-assigns the incremented proposal_number (YYNNN-Z)
      const { data: newQuoteRow, error: quoteErr } = await supabase
        .from('quotes')
        .insert({
          job_id: job.id,
          customer_name:    (quote as any).customer_name    ?? null,
          customer_address: (quote as any).customer_address ?? null,
          customer_email:   (quote as any).customer_email   ?? null,
          customer_phone:   (quote as any).customer_phone   ?? null,
          project_name:     (quote as any).project_name     ?? null,
          width:            (quote as any).width             ?? 0,
          length:           (quote as any).length            ?? 0,
          status:           'draft',
          created_by:       profile.id,
        })
        .select()
        .single();
      if (quoteErr) throw new Error(`Step 1 (create quote): ${quoteErr.message}`);
      const newQuoteId: string = newQuoteRow.id;
      console.log('✅ Step 1 — new quote row created:', newQuoteRow.proposal_number);

      // ── Step 2: Copy material_workbooks → sheets → items / labor / markups ──
      const sheetIdMap: Record<string, string> = {};
      const snapshotSheets: any[]                          = [];
      const snapshotCategoryMarkups: Record<string, number> = {};
      const snapshotSheetLabor: any[]                      = [];

      const { data: oldWorkbooks, error: wbFetchErr } = await supabase
        .from('material_workbooks').select('*').eq('quote_id', oldQuoteId);
      if (wbFetchErr) throw new Error(`Step 2 (fetch workbooks): ${wbFetchErr.message}`);

      // Find the highest version_number already used for this job so new workbooks don't collide
      const { data: maxWbRow } = await supabase
        .from('material_workbooks')
        .select('version_number')
        .eq('job_id', job.id)
        .order('version_number', { ascending: false })
        .limit(1)
        .maybeSingle();
      let nextWbVersion = (maxWbRow?.version_number ?? 0) + 1;

      for (const wb of (oldWorkbooks || [])) {
        const { data: newWb, error: wbErr } = await supabase
          .from('material_workbooks')
          .insert({ job_id: job.id, quote_id: newQuoteId, version_number: nextWbVersion++, status: 'working', created_by: profile.id })
          .select('id').single();
        if (wbErr) throw new Error(`Step 2 (insert workbook): ${wbErr.message}`);

        const { data: oldSheets, error: shFetchErr } = await supabase
          .from('material_sheets').select('*').eq('workbook_id', wb.id).order('order_index');
        if (shFetchErr) throw new Error(`Step 2 (fetch sheets): ${shFetchErr.message}`);

        for (const sheet of (oldSheets || [])) {
          const { data: newSheet, error: shErr } = await supabase
            .from('material_sheets')
            .insert({ workbook_id: newWb.id, sheet_name: sheet.sheet_name, order_index: sheet.order_index, is_option: sheet.is_option, description: sheet.description })
            .select('id').single();
          if (shErr) throw new Error(`Step 2 (insert sheet): ${shErr.message}`);
          sheetIdMap[sheet.id] = newSheet.id;

          // Items
          const { data: items, error: iFetchErr } = await supabase
            .from('material_items').select('*').eq('sheet_id', sheet.id).order('order_index');
          if (iFetchErr) throw new Error(`Step 2 (fetch items): ${iFetchErr.message}`);
          if (items?.length) {
            const { error: iErr } = await supabase.from('material_items').insert(
              items.map(({ id: _id, sheet_id: _sid, created_at: _ca, updated_at: _ua, ...r }) => ({ ...r, sheet_id: newSheet.id }))
            );
            if (iErr) throw new Error(`Step 2 (insert items): ${iErr.message}`);
          }

          // Labor
          const { data: labor, error: lFetchErr } = await supabase
            .from('material_sheet_labor').select('*').eq('sheet_id', sheet.id);
          if (lFetchErr) throw new Error(`Step 2 (fetch labor): ${lFetchErr.message}`);
          if (labor?.length) {
            const { error: lErr } = await supabase.from('material_sheet_labor').insert(
              labor.map(({ id: _id, sheet_id: _sid, created_at: _ca, updated_at: _ua, ...r }) => ({ ...r, sheet_id: newSheet.id }))
            );
            if (lErr) throw new Error(`Step 2 (insert labor): ${lErr.message}`);
            labor.forEach(l => snapshotSheetLabor.push({ ...l, sheet_id: sheet.id }));
          }

          // Category markups
          const { data: markups, error: mFetchErr } = await supabase
            .from('material_category_markups').select('*').eq('sheet_id', sheet.id);
          if (mFetchErr) throw new Error(`Step 2 (fetch markups): ${mFetchErr.message}`);
          if (markups?.length) {
            const { error: mErr } = await supabase.from('material_category_markups').insert(
              markups.map(({ id: _id, sheet_id: _sid, created_at: _ca, updated_at: _ua, ...r }) => ({ ...r, sheet_id: newSheet.id }))
            );
            if (mErr) throw new Error(`Step 2 (insert markups): ${mErr.message}`);
            markups.forEach(m => { snapshotCategoryMarkups[`${sheet.id}_${m.category_name}`] = m.markup_percent; });
          }

          snapshotSheets.push({
            id: sheet.id, sheet_name: sheet.sheet_name, order_index: sheet.order_index,
            is_option: sheet.is_option, description: sheet.description,
            items: (items || []),
          });
        }
      }
      console.log(`✅ Step 2 — copied ${Object.keys(sheetIdMap).length} sheets`);

      // ── Step 2b: Lock the old proposal's workbooks so edits only affect the new proposal ──
      const { error: lockErr } = await supabase
        .from('material_workbooks')
        .update({ status: 'locked', updated_at: new Date().toISOString() })
        .eq('quote_id', oldQuoteId);
      if (lockErr) console.warn('⚠️ Could not lock old workbooks (non-fatal):', lockErr.message);
      else console.log('✅ Step 2b — locked old proposal workbooks');

      // ── Step 3: Copy custom_financial_rows and their line items ──
      const rowIdMap: Record<string, string> = {};
      const snapshotFinancialRows: any[] = [];

      const { data: oldRows, error: rowFetchErr } = await supabase
        .from('custom_financial_rows').select('*').eq('quote_id', oldQuoteId).order('order_index');
      if (rowFetchErr) throw new Error(`Step 3 (fetch rows): ${rowFetchErr.message}`);

      for (const row of (oldRows || [])) {
        const { data: newRow, error: rErr } = await supabase
          .from('custom_financial_rows')
          .insert({
            job_id: job.id, quote_id: newQuoteId,
            category: row.category, description: row.description,
            quantity: row.quantity, unit_cost: row.unit_cost, total_cost: row.total_cost,
            markup_percent: row.markup_percent, selling_price: row.selling_price,
            notes: row.notes, order_index: row.order_index, taxable: row.taxable,
            sheet_id: row.sheet_id ? (sheetIdMap[row.sheet_id] ?? null) : null,
          })
          .select('id').single();
        if (rErr) throw new Error(`Step 3 (insert row): ${rErr.message}`);
        rowIdMap[row.id] = newRow.id;

        const { data: rItems, error: riFetchErr } = await supabase
          .from('custom_financial_row_items').select('*').eq('row_id', row.id).order('order_index');
        if (riFetchErr) throw new Error(`Step 3 (fetch row items): ${riFetchErr.message}`);
        if (rItems?.length) {
          const { error: riErr } = await supabase.from('custom_financial_row_items').insert(
            rItems.map(({ id: _id, row_id: _rid, sheet_id: oldSid, created_at: _ca, updated_at: _ua, ...r }) => ({
              ...r, row_id: newRow.id, sheet_id: oldSid ? (sheetIdMap[oldSid] ?? null) : null,
            }))
          );
          if (riErr) throw new Error(`Step 3 (insert row items): ${riErr.message}`);
        }
        snapshotFinancialRows.push({ ...row, line_items: rItems || [] });
      }

      // Sheet-linked line items (row_id IS NULL, sheet_id IS NOT NULL)
      const oldSheetIdList = Object.keys(sheetIdMap);
      if (oldSheetIdList.length > 0) {
        const { data: sItems, error: siFetchErr } = await supabase
          .from('custom_financial_row_items').select('*').in('sheet_id', oldSheetIdList).is('row_id', null);
        if (siFetchErr) throw new Error(`Step 3 (fetch sheet items): ${siFetchErr.message}`);
        if (sItems?.length) {
          const { error: siErr } = await supabase.from('custom_financial_row_items').insert(
            sItems.map(({ id: _id, row_id: _rid, sheet_id: oldSid, created_at: _ca, updated_at: _ua, ...r }) => ({
              ...r, row_id: null, sheet_id: oldSid ? (sheetIdMap[oldSid] ?? null) : null,
            }))
          );
          if (siErr) throw new Error(`Step 3 (insert sheet items): ${siErr.message}`);
        }
      }
      console.log(`✅ Step 3 — copied ${oldRows?.length ?? 0} financial rows`);

      // ── Step 4: Copy subcontractor_estimates and their line items ──
      const snapshotSubcontractors: any[] = [];

      const { data: oldEstimates, error: estFetchErr } = await supabase
        .from('subcontractor_estimates').select('*').eq('quote_id', oldQuoteId).order('order_index');
      if (estFetchErr) throw new Error(`Step 4 (fetch estimates): ${estFetchErr.message}`);

      for (const est of (oldEstimates || [])) {
        const { id: _id, job_id: _jid, quote_id: _qid, sheet_id: estOldSheetId, row_id: estOldRowId, created_at: _ca, updated_at: _ua, ...estRest } = est;
        const { data: newEst, error: eErr } = await supabase
          .from('subcontractor_estimates')
          .insert({
            ...estRest,
            job_id: job.id, quote_id: newQuoteId,
            sheet_id: estOldSheetId ? (sheetIdMap[estOldSheetId] ?? null) : null,
            row_id:   estOldRowId   ? (rowIdMap[estOldRowId]     ?? null) : null,
          })
          .select('id').single();
        if (eErr) throw new Error(`Step 4 (insert estimate): ${eErr.message}`);

        const { data: sItems, error: slFetchErr } = await supabase
          .from('subcontractor_estimate_line_items').select('*').eq('estimate_id', est.id).order('order_index');
        if (slFetchErr) throw new Error(`Step 4 (fetch sub line items): ${slFetchErr.message}`);
        if (sItems?.length) {
          const { error: slErr } = await supabase.from('subcontractor_estimate_line_items').insert(
            sItems.map(({ id: _id, estimate_id: _eid, created_at: _ca, updated_at: _ua, ...r }) => ({ ...r, estimate_id: newEst.id }))
          );
          if (slErr) throw new Error(`Step 4 (insert sub line items): ${slErr.message}`);
        }
        snapshotSubcontractors.push({ ...estRest, id: est.id, line_items: sItems || [] });
      }
      console.log(`✅ Step 4 — copied ${oldEstimates?.length ?? 0} subcontractor estimates`);

      // ── Step 5: Save frozen snapshot of the OLD proposal to proposal_versions ──
      const nextVersion = (proposalVersions?.length ?? 0) + 1;
      const { error: snapErr } = await supabase.from('proposal_versions').insert({
        quote_id:                  oldQuoteId,
        version_number:            nextVersion,
        customer_name:             (quote as any).customer_name    ?? null,
        customer_address:          (quote as any).customer_address ?? null,
        customer_email:            (quote as any).customer_email   ?? null,
        customer_phone:            (quote as any).customer_phone   ?? null,
        project_name:              (quote as any).project_name     ?? null,
        width:                     (quote as any).width             ?? 0,
        length:                    (quote as any).length            ?? 0,
        estimated_price:           (quote as any).estimated_price  ?? null,
        workbook_snapshot:         { sheets: snapshotSheets, category_markups: snapshotCategoryMarkups, sheet_labor: snapshotSheetLabor },
        financial_rows_snapshot:   snapshotFinancialRows,
        subcontractor_snapshot:    snapshotSubcontractors,
        change_notes:              proposalChangeNotes || 'New proposal version',
        created_by:                profile.id,
      });
      if (snapErr) console.warn('⚠️ Snapshot save failed (non-fatal):', snapErr.message);
      else console.log('✅ Step 5 — snapshot saved to proposal_versions');

      // ── Step 6: Reload and switch UI to the new proposal ──
      const { data: newQuote, error: fetchError } = await supabase
        .from('quotes').select('*').eq('id', newQuoteId).single();
      if (fetchError) throw new Error(`Step 6 (load new quote): ${fetchError.message}`);

      setQuote(newQuote);
      userSelectedQuoteIdRef.current = newQuote.id;
      toast.success(`New proposal ${newQuote.proposal_number} created with independent data`);
      setShowCreateProposalDialog(false);
      setProposalChangeNotes('');
      setCreatingProposal(false); // Clear loading so dialog/button don't hang if reload is slow

      // Reload quote list and financials in background (with timeout so we never hang indefinitely)
      const reloadTimeout = 30000; // 30s
      await Promise.race([
        (async () => {
          await loadQuoteData();
          await loadData(false, newQuote);
        })(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Reload timeout')), reloadTimeout)),
      ]).catch((err) => {
        console.warn('Proposal created but reload failed or timed out:', err?.message);
        toast.error('Proposal created but data may need a refresh.');
        void loadQuoteData();
        void loadData(false, newQuote);
      });
    } catch (error: any) {
      console.error('❌ createNewProposal error:', error?.message);
      toast.error('Failed to create new proposal: ' + (error?.message ?? 'Unknown error'));
    } finally {
      clearTimeout(safetyTimer);
      setCreatingProposal(false);
    }
  }

  async function autoCreateFirstProposal() {
    // Only run if we don't have a quote yet
    if (quote) return;
    
    try {
      console.log('🔍 Auto-creating first proposal for job:', job.id);

      // Check if a quote already exists for this job
      const { data: existingQuote, error: fetchError } = await supabase
        .from('quotes')
        .select('*')
        .eq('job_id', job.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (fetchError && fetchError.code !== 'PGRST116') {
        console.error('❌ Error fetching existing quote:', fetchError);
        throw fetchError;
      }

      if (existingQuote) {
        console.log('✅ Found existing quote:', existingQuote.proposal_number);
        setQuote(existingQuote);
        return;
      }

      console.log('📝 Creating first proposal with -1 suffix...');

      // Create first proposal using the database function
      // This will auto-generate proposal number with -1 suffix
      const { data, error } = await supabase.rpc('create_proposal_version', {
        p_quote_id: null,
        p_job_id: job.id,
        p_user_id: profile?.id || null,
        p_change_notes: 'Initial proposal'
      });

      if (error) {
        console.error('❌ Error auto-creating first proposal:', error);
        throw error;
      }

      console.log('✅ Auto-created first proposal');
      
      // Reload quote data to get the newly created quote
      await loadQuoteData();
      
      toast.success('First proposal created automatically');
    } catch (error: any) {
      console.error('❌ Error in autoCreateFirstProposal:', error);
      // Silent failure - user can create manually if needed
      console.log('Will show manual create button instead');
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
      setProposalVersions([]);
      
      toast.success(`Proposal #${newQuote.proposal_number} created!`);
    } catch (error: any) {
      console.error('Error creating quote:', error);
      toast.error('Failed to create proposal number');
    }
  }

  // Proposal navigation functions
  async function navigateToPreviousProposal() {
    if (allJobQuotes.length === 0) return;
    
    const currentIndex = allJobQuotes.findIndex(q => q.id === quote?.id);
    if (currentIndex < allJobQuotes.length - 1) {
      const olderQuote = allJobQuotes[currentIndex + 1];
      setQuote(olderQuote);
      userSelectedQuoteIdRef.current = olderQuote.id;
      // Pass olderQuote explicitly — avoids stale closure on quote state
      await loadData(false, olderQuote);
      toast.info(`📖 Viewing proposal ${olderQuote.proposal_number}`);
    }
  }

  async function navigateToNextProposal() {
    if (allJobQuotes.length === 0) return;
    
    const currentIndex = allJobQuotes.findIndex(q => q.id === quote?.id);
    if (currentIndex > 0) {
      const newerQuote = allJobQuotes[currentIndex - 1];
      setQuote(newerQuote);
      userSelectedQuoteIdRef.current = newerQuote.id;
      // Pass newerQuote explicitly — avoids stale closure on quote state
      await loadData(false, newerQuote);
      const isNowCurrent = currentIndex === 1;
      if (isNowCurrent) {
        toast.info(`✏️ Viewing current proposal ${newerQuote.proposal_number} - editing enabled`);
      } else {
        toast.info(`📖 Viewing proposal ${newerQuote.proposal_number}`);
      }
    }
  }

  async function loadData(silent = false, targetQuote?: any) {
    // targetQuote must be passed explicitly from navigation functions to avoid
    // the stale-closure bug: setQuote() is async, so `quote` state hasn't
    // committed by the time the load functions run. When undefined (polling),
    // we fall back to the current `quote` state — which is acceptable for
    // polling since no navigation is in flight.
    const effectiveQuote = targetQuote !== undefined ? targetQuote : quote;
    const targetQuoteId: string | null = effectiveQuote?.id ?? null;

    // Compute isHistorical using allJobQuotes — this is safe because allJobQuotes
    // is only updated by loadQuoteData() and doesn't change during navigation.
    const isHistorical = !!effectiveQuote
      && allJobQuotes.length > 0
      && effectiveQuote.id !== allJobQuotes[0]?.id;

    if (!silent) {
      setLoading(true);
    }
    try {
      await Promise.all([
        loadCustomRows(targetQuoteId, isHistorical),
        loadLaborPricing(),
        loadLaborHours(),
        loadMaterialsData(targetQuoteId, isHistorical),
        loadSubcontractorEstimates(targetQuoteId, isHistorical),
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

  async function loadSubcontractorEstimates(targetQuoteId: string | null = null, isHistorical: boolean = false) {
    try {
      // Historical path: serve data from the frozen snapshot only
      if (isHistorical && targetQuoteId) {
        console.log('📖 Loading subcontractors from historical snapshot');
        
        const { data: versionData, error: versionError } = await supabase
          .from('proposal_versions')
          .select('subcontractor_snapshot')
          .eq('quote_id', targetQuoteId)
          .order('version_number', { ascending: false })
          .limit(1)
          .maybeSingle();
        
        if (versionError) {
          console.error('Error loading proposal version for subcontractors:', versionError);
          throw versionError;
        }
        
        if (!versionData || !versionData.subcontractor_snapshot) {
          console.log('No subcontractor snapshot found for this proposal');
          setSubcontractorEstimates([]);
          setSubcontractorLineItems({});
          setLinkedSubcontractors({});
          return;
        }
        
        const snapshot = versionData.subcontractor_snapshot;
        const estimatesData = Array.isArray(snapshot) ? snapshot : [];
        
        if (JSON.stringify(estimatesData) !== JSON.stringify(subcontractorEstimates)) {
          setSubcontractorEstimates(estimatesData);
        }
        
        const linkedMap: Record<string, any[]> = {};
        const lineItemsMap: Record<string, any[]> = {};
        
        estimatesData.forEach((est: any) => {
          if (est.sheet_id) {
            if (!linkedMap[est.sheet_id]) linkedMap[est.sheet_id] = [];
            linkedMap[est.sheet_id].push(est);
          } else if (est.row_id) {
            if (!linkedMap[est.row_id]) linkedMap[est.row_id] = [];
            linkedMap[est.row_id].push(est);
          }
          if (est.line_items && Array.isArray(est.line_items)) {
            lineItemsMap[est.id] = est.line_items;
          }
        });
        
        setLinkedSubcontractors(linkedMap);
        setSubcontractorLineItems(lineItemsMap);
        console.log('✅ Loaded subcontractors from snapshot');
        return;
      }
      
      // Live path: single nested query — no .in() needed
      let estimatesQuery = supabase
        .from('subcontractor_estimates')
        .select('*, subcontractor_estimate_line_items(*)');
      estimatesQuery = targetQuoteId
        ? estimatesQuery.eq('quote_id', targetQuoteId)
        : estimatesQuery.eq('job_id', job.id);
      const { data, error } = await estimatesQuery.order('order_index');

      if (error) throw error;
      const rawData = data || [];

      // Strip the nested relation out so state only holds flat estimate objects
      const estimatesOnly = rawData.map((est: any) => {
        const { subcontractor_estimate_line_items: _items, ...estimateData } = est;
        return estimateData;
      });

      if (JSON.stringify(estimatesOnly) !== JSON.stringify(subcontractorEstimates)) {
        setSubcontractorEstimates(estimatesOnly);
      }

      // Build linked-subcontractors map
      const linkedMap: Record<string, any[]> = {};
      estimatesOnly.forEach((est: any) => {
        if (est.sheet_id) {
          if (!linkedMap[est.sheet_id]) linkedMap[est.sheet_id] = [];
          linkedMap[est.sheet_id].push(est);
        } else if (est.row_id) {
          if (!linkedMap[est.row_id]) linkedMap[est.row_id] = [];
          linkedMap[est.row_id].push(est);
        }
      });
      setLinkedSubcontractors(linkedMap);

      // Build line-items map directly from the nested response
      const lineItemsMap: Record<string, any[]> = {};
      rawData.forEach((est: any) => {
        if (est.subcontractor_estimate_line_items?.length > 0) {
          lineItemsMap[est.id] = est.subcontractor_estimate_line_items;
        }
      });
      setSubcontractorLineItems(lineItemsMap);
    } catch (error: any) {
      console.error('Error loading subcontractor estimates:', error);
      if (subcontractorEstimates.length > 0) {
        setSubcontractorEstimates([]);
      }
    }
  }

  /** Copy a job's existing material workbook into this proposal so materials appear in the proposal by default. */
  async function copyJobWorkbookToQuote(jobId: string, quoteId: string): Promise<any | null> {
    if (!profile?.id) return null;
    // Find any workbook for this job that isn't already for this quote (prefer working)
    const { data: sourceWb, error: srcErr } = await supabase
      .from('material_workbooks')
      .select('id')
      .eq('job_id', jobId)
      .or(`quote_id.is.null,quote_id.neq.${quoteId}`)
      .order('status', { ascending: false }) // 'working' > 'locked' if we use enum ordering
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (srcErr || !sourceWb) return null;

    const { data: fullWb, error: fullErr } = await supabase
      .from('material_workbooks')
      .select(`
        id,
        material_sheets (
          *,
          material_items (*),
          material_sheet_labor (*),
          material_category_markups (*)
        )
      `)
      .eq('id', sourceWb.id)
      .single();
    if (fullErr || !fullWb?.material_sheets?.length) return null;

    const { data: maxRow } = await supabase
      .from('material_workbooks')
      .select('version_number')
      .eq('job_id', jobId)
      .order('version_number', { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextVersion = (maxRow?.version_number ?? 0) + 1;

    const { data: newWb, error: insErr } = await supabase
      .from('material_workbooks')
      .insert({
        job_id: jobId,
        quote_id: quoteId,
        version_number: nextVersion,
        status: 'working',
        created_by: profile.id,
      })
      .select('id')
      .single();
    if (insErr || !newWb) return null;

    const sheetIdMap: Record<string, string> = {};
    const sheets = (fullWb.material_sheets || []).slice().sort((a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0));

    for (const sheet of sheets) {
      const { data: newSheet, error: shErr } = await supabase
        .from('material_sheets')
        .insert({
          workbook_id: newWb.id,
          sheet_name: sheet.sheet_name,
          order_index: sheet.order_index ?? 0,
          is_option: sheet.is_option ?? false,
          description: sheet.description ?? null,
        })
        .select('id')
        .single();
      if (shErr || !newSheet) continue;
      sheetIdMap[sheet.id] = newSheet.id;

      const items = (sheet.material_items || []).slice().sort((a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0));
      if (items.length) {
        const itemRows = items.map(({ id: _id, sheet_id: _s, created_at: _ca, updated_at: _ua, ...r }: any) => ({ ...r, sheet_id: newSheet.id }));
        await supabase.from('material_items').insert(itemRows);
      }
      const labor = sheet.material_sheet_labor || [];
      if (labor.length) {
        const laborRows = labor.map(({ id: _id, sheet_id: _s, created_at: _ca, updated_at: _ua, ...r }: any) => ({ ...r, sheet_id: newSheet.id }));
        await supabase.from('material_sheet_labor').insert(laborRows);
      }
      const markups = sheet.material_category_markups || [];
      if (markups.length) {
        const markupRows = markups.map(({ id: _id, sheet_id: _s, created_at: _ca, updated_at: _ua, ...r }: any) => ({ ...r, sheet_id: newSheet.id }));
        await supabase.from('material_category_markups').insert(markupRows);
      }
    }

    const { data: created, error: fetchErr } = await supabase
      .from('material_workbooks')
      .select(`
        id,
        material_sheets (
          *,
          material_items (*),
          material_sheet_labor (*),
          material_category_markups (*)
        )
      `)
      .eq('id', newWb.id)
      .single();
    if (fetchErr || !created) return null;
    return created;
  }

  async function loadMaterialsData(targetQuoteId: string | null = null, isHistorical: boolean = false) {
    try {
      // Historical path: serve data from the frozen snapshot only
      if (isHistorical && targetQuoteId) {
        console.log('📖 Loading materials from historical snapshot');
        
        const { data: versionData, error: versionError } = await supabase
          .from('proposal_versions')
          .select('workbook_snapshot')
          .eq('quote_id', targetQuoteId)
          .order('version_number', { ascending: false })
          .limit(1)
          .maybeSingle();
        
        if (versionError) {
          console.error('Error loading proposal version:', versionError);
          throw versionError;
        }
        
        if (!versionData || !versionData.workbook_snapshot) {
          console.log('No snapshot found for this proposal');
          setMaterialsBreakdown({
            sheetBreakdowns: [],
            totals: { totalCost: 0, totalPrice: 0, totalProfit: 0, profitMargin: 0 }
          });
          setMaterialSheets([]);
          setSheetLabor({});
          setCategoryMarkups({});
          return;
        }
        
        // Parse and use the snapshot data
        const snapshot = versionData.workbook_snapshot;
        const sheetsData = snapshot.sheets || [];
        
        // Store sheets data
        setMaterialSheets(sheetsData);
        
        // Load category markups from snapshot
        const categoryMarkupsMap: Record<string, number> = {};
        if (snapshot.category_markups) {
          Object.entries(snapshot.category_markups).forEach(([key, value]) => {
            categoryMarkupsMap[key] = value as number;
          });
        }
        setCategoryMarkups(categoryMarkupsMap);
        
        // Load sheet labor from snapshot
        const laborMap: Record<string, any> = {};
        if (snapshot.sheet_labor) {
          snapshot.sheet_labor.forEach((labor: any) => {
            laborMap[labor.sheet_id] = labor;
          });
        }
        setSheetLabor(laborMap);
        
        // Build materials breakdown from snapshot
        const breakdowns = sheetsData.map((sheet: any) => {
          const sheetItems = sheet.items || [];
          
          // Group by category
          const categoryMap = new Map<string, any[]>();
          sheetItems.forEach((item: any) => {
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
              items: items.map((item: any) => ({
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
        
        setMaterialsBreakdown({
          sheetBreakdowns: breakdowns,
          totals: {
            totalCost: grandTotalCost,
            totalPrice: grandTotalPrice,
            totalProfit: grandProfit,
            profitMargin: grandMargin,
          }
        });
        
        console.log('✅ Loaded materials from snapshot');
        return;
      }
      
      // Normal flow: one nested query fetches the workbook, all sheets, all items,
      // all labor rows, and all category markups — no .in() needed.
      // When the job has multiple proposals, always load by quote_id so we never
      // edit another proposal's data; fall back to job_id only when there's no quote.
      console.log('📝 Loading live materials data');
      const materialsQuoteId = targetQuoteId ?? (allJobQuotes.length > 0 ? allJobQuotes[0].id : null);

      let wbQuery = supabase
        .from('material_workbooks')
        .select(`
          id,
          material_sheets (
            *,
            material_items (*),
            material_sheet_labor (*),
            material_category_markups (*)
          )
        `)
        .eq('status', 'working');
      wbQuery = materialsQuoteId
        ? wbQuery.eq('quote_id', materialsQuoteId)
        : wbQuery.eq('job_id', job.id);
      let { data: workbookData, error: workbookError } = await wbQuery.maybeSingle();

      if (workbookError) throw workbookError;
      // Fallback: for this quote, try any workbook (e.g. locked) so proposal still shows materials
      if (!workbookData && materialsQuoteId) {
        const { data: fallbackForQuote } = await supabase
          .from('material_workbooks')
          .select(`
            id,
            material_sheets (
              *,
              material_items (*),
              material_sheet_labor (*),
              material_category_markups (*)
            )
          `)
          .eq('job_id', job.id)
          .eq('quote_id', materialsQuoteId)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (fallbackForQuote) workbookData = fallbackForQuote;
      }
      // If this proposal still has no workbook but the job has materials, copy job materials into this proposal
      if (!workbookData && materialsQuoteId) {
        const copied = await copyJobWorkbookToQuote(job.id, materialsQuoteId);
        if (copied) workbookData = copied;
      }
      // Last resort: show job-level workbook (quote_id null or any) so materials appear in proposal
      if (!workbookData && materialsQuoteId) {
        const { data: jobLevelWb } = await supabase
          .from('material_workbooks')
          .select(`
            id,
            material_sheets (
              *,
              material_items (*),
              material_sheet_labor (*),
              material_category_markups (*)
            )
          `)
          .eq('job_id', job.id)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (jobLevelWb) workbookData = jobLevelWb;
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

      const sheetsData: any[] = (workbookData.material_sheets || [])
        .slice()
        .sort((a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0));

      // Build flat sheet objects (strip nested children for state storage)
      const sheetsFlat = sheetsData.map(({ material_items: _i, material_sheet_labor: _l, material_category_markups: _m, ...s }: any) => s);
      if (JSON.stringify(sheetsFlat) !== JSON.stringify(materialSheets)) {
        setMaterialSheets(sheetsFlat);
      }

      // Build labor map from nested data
      const laborMap: Record<string, any> = {};
      sheetsData.forEach((sheet: any) => {
        (sheet.material_sheet_labor || []).forEach((labor: any) => {
          laborMap[labor.sheet_id] = labor;
        });
      });
      if (JSON.stringify(laborMap) !== JSON.stringify(sheetLabor)) {
        setSheetLabor(laborMap);
      }

      // Build category markups map, preserving any in-progress saves
      const freshMarkups: Record<string, number> = {};
      sheetsData.forEach((sheet: any) => {
        (sheet.material_category_markups || []).forEach((cm: any) => {
          freshMarkups[`${cm.sheet_id}_${cm.category_name}`] = cm.markup_percent;
        });
      });
      savingMarkupsRef.current.forEach(key => {
        if (categoryMarkups[key] !== undefined) freshMarkups[key] = categoryMarkups[key];
      });
      if (JSON.stringify(freshMarkups) !== JSON.stringify(categoryMarkups)) {
        setCategoryMarkups(freshMarkups);
      }

      // itemsData is still needed for breakdown calculation below — collect from nested sheets
      const itemsData: any[] = sheetsData.flatMap((sheet: any) => sheet.material_items || []);
      
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

  // Frontend dedupe: group by description, keep single oldest (by created_at). Used so duplicate DB rows don't affect UI or totals.
  function dedupeRowsByDescription<T extends { description?: string; created_at?: string; id?: string; order_index?: number }>(rows: T[]): T[] {
    const byDesc = new Map<string, T>();
    rows.forEach(row => {
      const desc = (row.description ?? '').trim();
      const existing = byDesc.get(desc);
      const rowCreated = row.created_at ?? '';
      const existingCreated = existing?.created_at ?? '';
      if (!existing || rowCreated < existingCreated || (rowCreated === existingCreated && (row.id ?? '') < (existing.id ?? ''))) {
        byDesc.set(desc, row);
      }
    });
    return Array.from(byDesc.values()).sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
  }

  // Dedupe line items by (parentId, description) so the same description can exist in different sections.
  function dedupeLineItemsByParentAndDescription(
    items: CustomRowLineItem[],
    getEffectiveParentId: (item: CustomRowLineItem) => string | null
  ): CustomRowLineItem[] {
    const byKey = new Map<string, CustomRowLineItem>();
    items.forEach(item => {
      const parentId = getEffectiveParentId(item);
      if (parentId == null) return;
      const desc = (item.description ?? '').trim();
      const key = `${parentId}_${desc}`;
      const existing = byKey.get(key);
      const itemCreated = item.created_at ?? '';
      const existingCreated = existing?.created_at ?? '';
      if (!existing || itemCreated < existingCreated || (itemCreated === existingCreated && (item.id ?? '') < (existing.id ?? ''))) {
        byKey.set(key, item);
      }
    });
    return Array.from(byKey.values());
  }

  async function loadCustomRows(targetQuoteId: string | null = null, isHistorical: boolean = false) {
    // Check if we're viewing a historical proposal (read-only mode)
    if (isHistorical && targetQuoteId) {
      console.log('📖 Loading custom rows from historical snapshot for proposal:', targetQuoteId);
      
      const { data: versionData, error: versionError } = await supabase
        .from('proposal_versions')
        .select('financial_rows_snapshot')
        .eq('quote_id', targetQuoteId)
        .order('version_number', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (versionError) {
        console.error('Error loading proposal version for custom rows:', versionError);
        return;
      }
      
      if (!versionData || !versionData.financial_rows_snapshot) {
        console.log('No custom rows snapshot found for this proposal');
        setCustomRows([]);
        setCustomRowLineItems({});
        setCustomRowLabor({});
        return;
      }
      
      const snapshot = versionData.financial_rows_snapshot;
      const rowsData = Array.isArray(snapshot) ? snapshot : [];
      const dedupedRows = dedupeRowsByDescription(rowsData);
      const descToRow = new Map<string, any>();
      dedupedRows.forEach((r: any) => descToRow.set((r.description ?? '').trim(), r));
      const duplicateToSurviving: Record<string, string> = {};
      rowsData.forEach((row: any) => {
        const surviving = descToRow.get((row.description ?? '').trim());
        if (surviving) duplicateToSurviving[row.id] = surviving.id;
      });

      const laborMap: Record<string, any> = {};
      dedupedRows.forEach((row: any) => {
        if (row.notes) {
          try {
            const parsed = JSON.parse(row.notes);
            if (parsed.labor) laborMap[row.id] = parsed.labor;
          } catch { /* skip */ }
        }
      });

      const allLineItems: CustomRowLineItem[] = [];
      rowsData.forEach((row: any) => {
        if (row.line_items && Array.isArray(row.line_items)) {
          row.line_items.forEach((li: any) => allLineItems.push(li));
        }
      });
      const getEffectiveParentId = (item: CustomRowLineItem) => {
        if (item.row_id) return duplicateToSurviving[item.row_id] ?? item.row_id;
        return item.sheet_id ?? null;
      };
      const dedupedLineItems = dedupeLineItemsByParentAndDescription(allLineItems, getEffectiveParentId);
      const lineItemsMap: Record<string, CustomRowLineItem[]> = {};
      dedupedLineItems.forEach(item => {
        const parentId = getEffectiveParentId(item);
        if (parentId) {
          if (!lineItemsMap[parentId]) lineItemsMap[parentId] = [];
          lineItemsMap[parentId].push(item);
        }
      });

      if (JSON.stringify(dedupedRows) !== JSON.stringify(customRows)) setCustomRows(dedupedRows);
      setCustomRowLabor(laborMap);
      setCustomRowLineItems(lineItemsMap);
      console.log('✅ Loaded custom rows from snapshot (deduped)');
      return;
    }
    
    // Normal flow: nested select fetches rows + their line items in one request.
    // Sheet-linked items (row_id IS NULL) are fetched in a separate focused query.
    let rowsQuery = supabase
      .from('custom_financial_rows')
      .select('*, custom_financial_row_items(*)');
    rowsQuery = targetQuoteId
      ? rowsQuery.eq('quote_id', targetQuoteId)
      : rowsQuery.eq('job_id', job.id);
    const { data, error } = await rowsQuery.order('order_index');

    if (error) {
      console.error('Error loading custom rows:', error);
      return;
    }

    const rawRows = data || [];

    // Strip nested line items out of the row objects for state
    const newData: CustomFinancialRow[] = rawRows.map((row: any) => {
      const { custom_financial_row_items: _items, ...rowData } = row;
      return rowData as CustomFinancialRow;
    });

    const dedupedRows = dedupeRowsByDescription(newData);
    const descToRow = new Map<string, CustomFinancialRow>();
    dedupedRows.forEach(r => descToRow.set((r.description ?? '').trim(), r));
    const duplicateToSurviving: Record<string, string> = {};
    newData.forEach(row => {
      const surviving = descToRow.get((row.description ?? '').trim());
      if (surviving) duplicateToSurviving[row.id] = surviving.id;
    });

    const laborMap: Record<string, any> = {};
    dedupedRows.forEach(row => {
      if (row.notes) {
        try {
          const parsed = JSON.parse(row.notes);
          if (parsed.labor) laborMap[row.id] = parsed.labor;
        } catch { /* skip */ }
      }
    });
    setCustomRowLabor(laborMap);

    if (JSON.stringify(dedupedRows) !== JSON.stringify(customRows)) {
      setCustomRows(dedupedRows);
    }

    // Collect row-linked line items from the nested response
    const rowLinkedItems: CustomRowLineItem[] = rawRows.flatMap((row: any) =>
      (row.custom_financial_row_items || []) as CustomRowLineItem[]
    );

    // Fetch sheet-linked items (row_id IS NULL) via a focused workbook lookup
    let sheetLinkedItems: CustomRowLineItem[] = [];
    let wbQuery = supabase
      .from('material_workbooks')
      .select('id, material_sheets(id)')
      .eq('status', 'working');
    wbQuery = targetQuoteId
      ? wbQuery.eq('quote_id', targetQuoteId)
      : wbQuery.eq('job_id', job.id);
    const { data: wbData } = await wbQuery.maybeSingle();

    if (wbData) {
      const sheetIds: string[] = ((wbData as any).material_sheets || []).map((s: any) => s.id);
      if (sheetIds.length > 0) {
        const { data: sheetItems } = await supabase
          .from('custom_financial_row_items')
          .select('*')
          .in('sheet_id', sheetIds)
          .is('row_id', null)
          .order('order_index');
        sheetLinkedItems = (sheetItems || []) as CustomRowLineItem[];
      }
    }

    const allLineItems = [...rowLinkedItems, ...sheetLinkedItems];

    const getEffectiveParentId = (item: CustomRowLineItem) => {
      if (item.row_id) return duplicateToSurviving[item.row_id] ?? item.row_id;
      return item.sheet_id ?? null;
    };
    const dedupedLineItems = dedupeLineItemsByParentAndDescription(allLineItems, getEffectiveParentId);
    const lineItemsMap: Record<string, CustomRowLineItem[]> = {};
    dedupedLineItems.forEach(item => {
      const parentId = getEffectiveParentId(item);
      if (parentId) {
        if (!lineItemsMap[parentId]) lineItemsMap[parentId] = [];
        lineItemsMap[parentId].push(item);
      }
    });
    setCustomRowLineItems(lineItemsMap);
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
        
        // Create subcontractor estimate
        const { data: estData, error: estError } = await supabase
          .from('subcontractor_estimates')
          .insert([{
            job_id: job.id,
            company_name: description,
            total_amount: totalCost,
            markup_percent: markup,
            scope_of_work: notes || null,
            order_index: maxOrderIndex + 1,
            sheet_id: linkedSheetId || null,
            extraction_status: 'completed',
          }])
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
        taxable: taxable, // Use the taxable state from checkbox
        order_index: targetOrderIndex,
        sheet_id: linkedSheetId || null,
      };

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
    if (savingLineItemRef.current) return;
    savingLineItemRef.current = true;
    setSavingLineItem(true);

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
        // Strict upsert: only INSERT if no row exists with same parent + key fields
        const parentCol = isSheet ? 'sheet_id' : 'row_id';
        const { data: existing } = await supabase
          .from('custom_financial_row_items')
          .select('id')
          .eq(parentCol, lineItemParentRowId)
          .eq('description', itemData.description)
          .eq('quantity', itemData.quantity)
          .eq('unit_cost', itemData.unit_cost)
          .limit(1)
          .maybeSingle();

        if (existing?.id) {
          const { error } = await supabase
            .from('custom_financial_row_items')
            .update(itemData)
            .eq('id', existing.id);
          if (error) throw error;
          toast.success('Line item updated');
        } else {
          const { error } = await supabase
            .from('custom_financial_row_items')
            .insert([itemData]);
          if (error) throw error;
          toast.success('Line item added');
        }
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
    } finally {
      savingLineItemRef.current = false;
      setSavingLineItem(false);
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
    if (!quote) {
      toast.error('No active proposal to save description to');
      return;
    }
    try {
      const { error } = await supabase
        .from('quotes')
        .update({ description: buildingDescription })
        .eq('id', quote.id);

      if (error) throw error;
      // Keep local quote object in sync without a full reload
      (quote as any).description = buildingDescription;
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
    
    // Calculate category totals with individual markups (NO sheet-level markup)
    const categoryTotals = sheet.categories?.reduce((sum: number, cat: any) => {
      const categoryKey = `${sheet.sheetId}_${cat.name}`;
      const categoryMarkup = categoryMarkups[categoryKey] ?? 10;
      const categoryPriceWithMarkup = cat.totalCost * (1 + categoryMarkup / 100);
      return sum + categoryPriceWithMarkup;
    }, 0) || 0;
    
    // For taxable calculation, all category materials are taxable by default
    const categoryTaxableOnly = sheet.categories?.reduce((sum: number, cat: any) => {
      const categoryKey = `${sheet.sheetId}_${cat.name}`;
      const categoryMarkup = categoryMarkups[categoryKey] ?? 10;
      const categoryPriceWithMarkup = cat.totalCost * (1 + categoryMarkup / 100);
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
    return sum + (labor.estimated_hours * labor.hourly_rate);
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
        <Card className="mb-4 border-blue-200 bg-blue-50">
          <CardContent className="py-3">
            <div className="flex items-center justify-between">
              {/* Left: Current Proposal Info */}
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-semibold text-blue-900">
                  Proposal #{quote.proposal_number || quote.quote_number}
                </span>
                {isReadOnly && (
                  <Badge className="text-xs bg-amber-100 border-amber-300 text-amber-900">
                    Historical View
                  </Badge>
                )}
              </div>

              {/* Right: Navigation Controls (only show if multiple proposals exist) */}
              {allJobQuotes.length > 1 && (
                <div className="flex items-center gap-3">
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
              {/* Versioning Buttons - Always show "Create Version" */}
              <Button
                size="sm"
                onClick={() => {
                  if (quote) {
                    setShowCreateProposalDialog(true);
                  } else {
                    autoCreateFirstProposal();
                  }
                }}
                disabled={creatingVersion || isReadOnly}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {creatingVersion ? (
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
              {/* Show Sign & Lock for current version only */}
              {quote && proposalVersions.length > 0 && !quote.signed_version && (
                <Button
                  size="sm"
                  onClick={() => {
                    const currentVersion = proposalVersions.find(v => v.version_number === quote.current_version);
                    if (currentVersion) signAndLockVersion(currentVersion.id);
                  }}
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  <Lock className="w-3 h-3 mr-2" />
                  Set as Contract
                </Button>
              )}
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
                      <span className="font-bold text-slate-900">${proposalMaterialsTotalWithSubcontractors.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                    </div>
                    {proposalLaborPrice > 0 && (
                      <div className="flex justify-between py-2 border-b border-slate-200">
                        <span className="font-semibold text-slate-700">Labor</span>
                        <span className="font-bold text-slate-900">${proposalLaborPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
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
                <Button variant="outline" onClick={() => saveLineItem(true)} disabled={savingLineItem}>
                  <Plus className="w-4 h-4 mr-2" />
                  Save & Add Another
                </Button>
              )}
              <Button onClick={() => saveLineItem(false)} disabled={savingLineItem}>
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
      <Dialog open={showCreateProposalDialog} onOpenChange={setShowCreateProposalDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Proposal</DialogTitle>
            <DialogDescription>
              This will lock the current proposal (saving a snapshot of all materials and pricing) and create a new proposal with an incremented number that you can continue editing.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-300 rounded-lg p-3 text-sm">
              <div className="flex items-start gap-2">
                <Lock className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-blue-900 mb-1">What happens:</p>
                  <ul className="text-blue-800 space-y-1 list-disc list-inside">
                    <li>Current proposal ({quote?.proposal_number}) will be locked with a snapshot</li>
                    <li>All data will be <strong>fully duplicated</strong> for the new proposal</li>
                    <li>New proposal gets its own independent materials, rows, and estimates</li>
                    <li>Current proposal&apos;s workbook is locked so edits never affect it again</li>
                    <li>You will be switched to the new proposal; changes apply only to the new one</li>
                  </ul>
                </div>
              </div>
            </div>
            <div>
              <Label>Notes (Optional)</Label>
              <Textarea
                value={proposalChangeNotes}
                onChange={(e) => setProposalChangeNotes(e.target.value)}
                placeholder="e.g., Updated pricing per customer request, Added garage door options, Changed roof color..."
                rows={3}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Document what changed in this new proposal version
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowCreateProposalDialog(false);
                  setProposalChangeNotes('');
                }}
                disabled={creatingProposal}
              >
                Cancel
              </Button>
              <Button onClick={createNewProposal} disabled={creatingProposal}>
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

      {/* Proposal Version History Dialog */}
      <Dialog open={showVersionHistory} onOpenChange={setShowVersionHistory}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="w-5 h-5" />
              Proposal Version History
            </DialogTitle>
            <DialogDescription>
              View all versions of this proposal. Signed versions are locked and cannot be modified.
            </DialogDescription>
          </DialogHeader>

          {loadingVersions ? (
            <div className="py-12 text-center">
              <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-muted-foreground">Loading version history...</p>
            </div>
          ) : proposalVersions.length === 0 ? (
            <div className="py-12 text-center">
              <History className="w-16 h-16 mx-auto text-muted-foreground/50 mb-4" />
              <p className="text-lg font-medium text-muted-foreground">No versions found</p>
              <p className="text-sm text-muted-foreground mt-2">
                Versions are automatically created when proposals are modified
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {proposalVersions.map((version) => (
                <Card key={version.id} className={version.is_signed ? 'border-emerald-300 bg-emerald-50' : ''}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-lg">Version {version.version_number}</CardTitle>
                          {version.is_signed && (
                            <Badge className="bg-emerald-600">
                              <Lock className="w-3 h-3 mr-1" />
                              Signed
                            </Badge>
                          )}
                          {version.version_number === quote?.current_version && !version.is_signed && (
                            <Badge variant="outline" className="bg-blue-100 text-blue-700">
                              Current
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                          <Calendar className="w-3 h-3" />
                          <span>
                            {new Date(version.created_at).toLocaleDateString('en-US', {
                              month: 'long',
                              day: 'numeric',
                              year: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                        {version.is_signed && version.signed_at && (
                          <div className="flex items-center gap-2 mt-1 text-sm text-emerald-700 font-medium">
                            <Lock className="w-3 h-3" />
                            <span>
                              Signed on {new Date(version.signed_at).toLocaleDateString('en-US', {
                                month: 'long',
                                day: 'numeric',
                                year: 'numeric',
                              })}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2">
                        {!version.is_signed && version.version_number === quote?.current_version && (
                          <Button
                            size="sm"
                            onClick={() => signAndLockVersion(version.id)}
                            className="bg-emerald-600 hover:bg-emerald-700"
                          >
                            <Lock className="w-3 h-3 mr-2" />
                            Sign & Lock
                          </Button>
                        )}
                        <Button size="sm" variant="outline">
                          <Eye className="w-3 h-3 mr-2" />
                          View Details
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-xs text-muted-foreground">Customer</Label>
                        <p className="font-medium">{version.customer_name || 'N/A'}</p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Project</Label>
                        <p className="font-medium">{version.project_name || 'N/A'}</p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Size</Label>
                        <p className="font-medium">
                          {version.width}' × {version.length}'
                        </p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Estimated Price</Label>
                        <p className="font-medium text-green-700">
                          {version.estimated_price ? `$${version.estimated_price.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : 'N/A'}
                        </p>
                      </div>
                    </div>
                    {version.change_notes && (
                      <div className="pt-3 border-t">
                        <Label className="text-xs text-muted-foreground">Notes</Label>
                        <p className="text-sm mt-1">{version.change_notes}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
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
                  setBuildingDescription((quote as any)?.description || '');
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
