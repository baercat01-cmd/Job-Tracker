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
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Trash2, DollarSign, Clock, TrendingUp, Percent, Calculator, FileSpreadsheet, ChevronDown, ChevronLeft, ChevronRight, Briefcase, Edit, Upload, MoreVertical, List, Eye, Check, X, GripVertical, Download, History, Lock, LockOpen, Calendar, FileText, Settings, Printer, Send, CheckCircle, GitCompare } from 'lucide-react';
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
import { ProposalComparisonView } from './ProposalComparisonView';
import { useProposalToolbar } from '@/contexts/JobDetailProposalToolbarContext';
import { useProposalSummary } from '@/contexts/ProposalSummaryContext';
import { useDocumentPanel } from '@/contexts/DocumentPanelContext';
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
  /** When provided (e.g. combined Proposal+Materials view), sync selected proposal with parent */
  controlledQuoteId?: string | null;
  /** Notify parent when user changes proposal so materials panel can stay in sync */
  onQuoteChange?: (quoteId: string | null) => void;
}

// Sortable Row Component
function SortableRow({ item, isReadOnly, quote, ...props }: any) {
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
    openAddSubcontractorLineItemDialog,
    openEditSubcontractorLineItemDialog,
    deleteRow,
    deleteSheetLabor,
    toggleSubcontractorLineItem,
    toggleSubcontractorLineItemTaxable,
    toggleSubcontractorLineItemType,
    unlinkSubcontractor,
    updateSubcontractorMarkup,
    updateCustomRowMarkup,
    updateCustomRowBaseCost,
    updateLineItemCost,
    deleteLineItem,
    loadMaterialsData,
    loadCustomRows,
    loadSubcontractorEstimates,
    customRows,
    savingMarkupsRef,
    emptyNotesById = {},
    setEmptyNotesById = () => {},
    emptyScopeById = {},
    setEmptyScopeById = () => {},
    setComparePickerSheetId = () => {},
    setShowComparePickerDialog = () => {},
    expandedComparisons = new Set(),
    setExpandedComparisons = () => {},
    materialsBreakdown = { sheetBreakdowns: [], totals: { totalCost: 0, totalPrice: 0, totalProfit: 0, profitMargin: 0 } },
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
      
      // Calculate labor from sheet line items (with markup, same as line item display)
      const sheetLaborItems = customRowLineItems[sheet.sheetId]?.filter((item: any) => (item.item_type || 'material') === 'labor') || [];
      const sheetLaborLineItemsTotal = sheetLaborItems.reduce((sum: number, item: any) => {
        const itemMarkup = item.markup_percent ?? 0;
        return sum + (item.total_cost * (1 + itemMarkup / 100));
      }, 0);
      
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
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-base font-bold text-slate-900 truncate">{sheet.sheetName}</h3>
                  {(sheet as any).isOptional && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800 border border-amber-300">
                      Optional
                    </span>
                  )}
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
                {!isReadOnly && (
                  (sheet as any).isOptional ? (
                    <>
                      <DropdownMenuItem onClick={async () => {
                        // Always update is_option first (column is guaranteed to exist)
                        await supabase.from('material_sheets').update({ is_option: false }).eq('id', sheet.sheetId);
                        // Best-effort: clear comparison link (column may not exist on older DBs)
                        await supabase.from('material_sheets').update({ compare_to_sheet_id: null } as any).eq('id', sheet.sheetId);
                        await loadMaterialsData(quote?.id ?? null, false);
                      }}>
                        <Check className="w-3 h-3 mr-2 text-green-600" />
                        Include in Total
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => { setComparePickerSheetId(sheet.sheetId); setShowComparePickerDialog(true); }}>
                        <GitCompare className="w-3 h-3 mr-2 text-blue-600" />
                        {(sheet as any).compareToSheetId ? 'Change Comparison Section' : 'Compare with Section...'}
                      </DropdownMenuItem>
                      {(sheet as any).compareToSheetId && (
                        <DropdownMenuItem onClick={async () => {
                          await supabase.from('material_sheets').update({ compare_to_sheet_id: null } as any).eq('id', sheet.sheetId);
                          await loadMaterialsData(quote?.id ?? null, false);
                        }}>
                          <X className="w-3 h-3 mr-2 text-slate-500" />
                          Clear Comparison
                        </DropdownMenuItem>
                      )}
                    </>
                  ) : (
                    <DropdownMenuItem onClick={async () => {
                      await supabase.from('material_sheets').update({ is_option: true }).eq('id', sheet.sheetId);
                      await loadMaterialsData(quote?.id ?? null, false);
                    }}>
                      <Eye className="w-3 h-3 mr-2 text-amber-600" />
                      Mark as Optional (exclude from total)
                    </DropdownMenuItem>
                  )
                )}
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
          <div className="ml-2 flex gap-2 mt-1">
            {/* Description column (wide) */}
            <div className="flex-1 min-w-0">
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
                        await loadMaterialsData(quote?.id ?? null, !!isReadOnly);
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
            <div className="w-[100px] flex-shrink-0 text-right">
              {(sheet as any).isOptional && (
                <p className="text-xs text-amber-700 font-medium mb-0.5">Not in total</p>
              )}
              <p className="text-sm text-slate-500">Materials</p>
              <p className={`text-base font-bold ${(sheet as any).isOptional ? 'text-amber-600 line-through decoration-amber-400' : 'text-blue-700'}`}>${sheetFinalPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              {totalLaborCost > 0 && (
                <>
                  <p className="text-sm text-slate-500 mt-2">Labor</p>
                  <p className={`text-base font-bold ${(sheet as any).isOptional ? 'text-amber-600 line-through decoration-amber-400' : 'text-amber-700'}`}>${totalLaborCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </>
              )}
            </div>
          </div>

          <CollapsibleContent>
            <div className="mt-2 ml-2 space-y-3">
              {/* Material Items by Category (only required; optional categories appear in Options section below) */}
              {(() => {
                const requiredCategories = (sheet.categories || []).filter(
                  (cat: any) => !(cat.items?.every((i: any) => i.isOptional) ?? false)
                );
                return requiredCategories.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Material Items</p>
                  {requiredCategories.map((category: any, catIdx: number) => {
                    const categoryKey = `${sheet.sheetId}_${category.name}`;
                    const categoryMarkup = categoryMarkups[categoryKey] ?? (sheet.markup_percent || 10);
                    const categoryPriceWithMarkup = category.totalCost * (1 + categoryMarkup / 100);
                    
                    const categoryIsOptional = category.items?.every((i: any) => i.isOptional) ?? false;
                    return (
                      <div key={catIdx} className={`bg-slate-50 border rounded p-2 ${categoryIsOptional ? 'border-amber-300 bg-amber-50/50' : 'border-slate-200'}`}>
                        <div className="flex items-center justify-between">
                          <div className="flex-1 flex items-center gap-2 flex-wrap">
                            <p className="text-xs font-semibold text-slate-900">{category.name}</p>
                            <p className="text-xs text-slate-600">{category.itemCount} items</p>
                            {categoryIsOptional && (
                              <Badge variant="outline" className="text-amber-700 border-amber-400 bg-amber-50">Option</Badge>
                            )}
                            {!isReadOnly && (() => {
                              const handleOptionToggle = async (value: boolean) => {
                                const key = `${sheet.sheetId}_${category.name}`;
                                setOptionalCategoryOverlay(prev => ({ ...prev, [key]: value }));
                                await loadMaterialsData(quote?.id ?? null, !!isReadOnly, { [key]: value });
                                try {
                                  const { error } = await supabase
                                    .from('material_category_options')
                                    .upsert(
                                      { sheet_id: sheet.sheetId, category_name: category.name, is_optional: value },
                                      { onConflict: 'sheet_id,category_name' }
                                    );
                                  if (error) throw error;
                                  toast.success(value ? 'Section marked as option' : 'Section included in contract');
                                } catch {
                                  toast.info('Option saved locally');
                                }
                              };
                              return (
                                <div
                                  role="button"
                                  tabIndex={0}
                                  className="flex items-center gap-1.5 cursor-pointer text-slate-600 ml-auto sm:ml-0"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if ((e.target as HTMLElement).closest?.('button[role="checkbox"]')) return;
                                    handleOptionToggle(!categoryIsOptional);
                                  }}
                                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleOptionToggle(!categoryIsOptional); } }}
                                >
                                  <span className="pointer-events-none">
                                    <Checkbox
                                      checked={categoryIsOptional}
                                      onCheckedChange={(checked) => handleOptionToggle(!!checked)}
                                      className="pointer-events-auto"
                                    />
                                  </span>
                                  <span className="text-xs">Option</span>
                                </div>
                              );
                            })()}
                          </div>
                          <div className="flex items-center gap-3 text-xs">
                            <div className="text-right">
                              <p className="text-slate-500">Cost</p>
                              <p className="font-semibold text-slate-900">${category.totalCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
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
                                    await loadMaterialsData(quote?.id ?? null, !!isReadOnly);
                                    
                                    // Show success toast
                                    toast.success(`Markup updated to ${newMarkup}%`);
                                  } catch (error: any) {
                                    console.error('[MARKUP SAVE] Error updating category markup:', error);
                                    toast.error(`Failed to save markup: ${error.message || 'Unknown error'}`);
                                    // Remove from saving set
                                    savingMarkupsRef.current.delete(categoryKey);
                                    // Reload to get correct value from database
                                    await loadMaterialsData(quote?.id ?? null, !!isReadOnly);
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
                              <p className="font-bold text-blue-700">${categoryPriceWithMarkup.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
              })()}

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
                                ? `${row.quantity}h × $${row.unit_cost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/hr`
                                : `${row.quantity} × $${row.unit_cost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
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
                              <Input
                                type="number"
                                key={`linked-row-cost-${row.id}-${itemCost}`}
                                defaultValue={itemCost}
                                onBlur={(e) => {
                                  if (isReadOnly) return;
                                  const raw = parseFloat(e.target.value);
                                  if (!Number.isFinite(raw) || raw < 0) return;
                                  const v = Math.round(raw * 100) / 100;
                                  if (Math.abs(v - itemCost) < 0.01) return;
                                  updateCustomRowBaseCost(row.id, v, 0);
                                }}
                                onClick={(e) => e.stopPropagation()}
                                className="w-20 h-6 text-xs px-1.5 text-right tabular-nums"
                                step="0.01"
                                min="0"
                              />
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
                                    await loadCustomRows(quote?.id ?? null, !!isReadOnly);
                                    await loadMaterialsData(quote?.id ?? null, !!isReadOnly);
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
                              ${itemPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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

              {/* Sheet-level Line Items (material + labor) - unified list so Add Labor appears in this section */}
              {(() => {
                const sheetLineItems = (customRowLineItems[sheet.sheetId] || [])
                  .slice()
                  .sort((a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0));
                if (sheetLineItems.length === 0) return null;
                return (
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-slate-700 mb-1 flex items-center gap-2">
                      <List className="w-3 h-3" />
                      Line Items
                    </p>
                    {sheetLineItems.map((lineItem: any) => {
                      const isLabor = (lineItem.item_type || 'material') === 'labor';
                      const itemMarkup = lineItem.markup_percent || 0;
                      const itemCost = lineItem.total_cost;
                      const itemPrice = itemCost * (1 + itemMarkup / 100);
                      return (
                        <div key={lineItem.id} className={`rounded p-2 border ${isLabor ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200'}`}>
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <p className="text-xs font-semibold text-slate-900">{lineItem.description}</p>
                              <p className="text-xs text-slate-600">
                                {isLabor
                                  ? `${lineItem.quantity}h × $${(lineItem.unit_cost ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/hr`
                                  : `${lineItem.quantity} × $${(lineItem.unit_cost ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                              </p>
                              {lineItem.notes && (
                                <p className="text-xs text-slate-500 mt-0.5">{lineItem.notes}</p>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant={isLabor ? 'secondary' : 'default'} className="text-xs h-5">
                                {isLabor ? '👷 Labor' : '📦 Material'}
                              </Badge>
                              <div className="flex items-center gap-1">
                                <Input
                                  type="number"
                                  key={`sheet-li-cost-${lineItem.id}-${itemCost}`}
                                  defaultValue={itemCost}
                                  onBlur={(e) => {
                                    if (isReadOnly) return;
                                    const raw = parseFloat(e.target.value);
                                    if (!Number.isFinite(raw) || raw < 0) return;
                                    const v = Math.round(raw * 100) / 100;
                                    if (Math.abs(v - itemCost) < 0.01) return;
                                    updateLineItemCost(lineItem.id, v);
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                  className="w-20 h-6 text-xs px-1.5 text-right tabular-nums"
                                  step="0.01"
                                  min="0"
                                />
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
                                      await loadCustomRows(quote?.id ?? null, !!isReadOnly);
                                      await loadMaterialsData(quote?.id ?? null, !!isReadOnly);
                                    } catch (err: any) {
                                      console.error('Error updating markup:', err);
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
                                ${itemPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </p>
                              <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => openLineItemDialog(sheet.sheetId, lineItem, isLabor ? 'labor' : 'material')}>
                                <Edit className="w-3 h-3" />
                              </Button>
                              <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => deleteLineItem(lineItem.id)}>
                                <Trash2 className="w-3 h-3 text-red-600" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
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
                        ${sheetLabor[sheet.sheetId].total_labor_cost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                      {!isReadOnly && (
                        <>
                          <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => openLaborDialog(sheet.sheetId)}>
                            <Edit className="w-3 h-3" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => deleteSheetLabor(sheetLabor[sheet.sheetId].id)}>
                            <Trash2 className="w-3 h-3 text-red-600" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {linkedSubs.map((sub: any) => {
                const lineItems = subcontractorLineItems[sub.id] || [];
                const included = lineItems.filter((item: any) => !item.excluded);
                const materialTotal = included
                  .filter((i: any) => (i.item_type || 'material') === 'material')
                  .reduce((sum: number, i: any) => sum + (i.total_price || 0), 0);
                const laborTotal = included
                  .filter((i: any) => (i.item_type || 'material') === 'labor')
                  .reduce((sum: number, i: any) => sum + (i.total_price || 0), 0);
                const markup = 1 + (sub.markup_percent || 0) / 100;
                const materialWithMarkup = materialTotal * markup;
                const laborWithMarkup = laborTotal * markup;
                const totalWithMarkup = materialWithMarkup + laborWithMarkup;

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
                              {materialTotal > 0 && <span className="text-slate-600">Material: ${materialWithMarkup.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>}
                              {laborTotal > 0 && <span className="text-amber-700">Labor: ${laborWithMarkup.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>}
                              {materialTotal === 0 && laborTotal === 0 && <span className="text-slate-500">$0.00</span>}
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
                              ${totalWithMarkup.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
                                            await loadSubcontractorEstimates(quote?.id ?? null, !!isReadOnly);
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
                                      ${(lineItem.total_price * (1 + (lineItem.markup_percent || 0) / 100)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </p>
                                    {!isReadOnly && (
                                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-slate-500 hover:text-slate-700" onClick={() => openEditSubcontractorLineItemDialog(lineItem)} title="Edit line item">
                                        <Edit className="w-3 h-3" />
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        {!isReadOnly && (
                          <Button size="sm" variant="outline" className="mt-2 h-7 text-xs" onClick={() => openAddSubcontractorLineItemDialog(sub.id)}>
                            <Plus className="w-3 h-3 mr-1" />Add line item
                          </Button>
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

            {/* Comparison panel — only for optional sections that have a comparison target */}
            {(sheet as any).isOptional && (sheet as any).compareToSheetId && (() => {
              const baseSheet = materialsBreakdown.sheetBreakdowns.find((s: any) => s.sheetId === (sheet as any).compareToSheetId);
              if (!baseSheet) return null;

              // Calculate base sheet price using same formula as sheetFinalPrice
              const baseLinkedRows = customRows.filter((r: any) => r.sheet_id === baseSheet.sheetId);
              const baseLinkedRowsTotal = baseLinkedRows.reduce((rowSum: number, row: any) => {
                const lineItems = customRowLineItems[row.id] || [];
                const baseCost = lineItems.length > 0
                  ? lineItems.reduce((itemSum: number, item: any) => itemSum + item.total_cost, 0)
                  : row.total_cost;
                return rowSum + (baseCost * (1 + row.markup_percent / 100));
              }, 0);
              const baseLinkedSubs = linkedSubcontractors[baseSheet.sheetId] || [];
              const baseLinkedSubsTaxableTotal = baseLinkedSubs.reduce((sum: number, sub: any) => {
                const lineItems = subcontractorLineItems[sub.id] || [];
                const taxableTotal = lineItems
                  .filter((item: any) => !item.excluded && item.taxable)
                  .reduce((itemSum: number, item: any) => itemSum + item.total_price, 0);
                const estMarkup = sub.markup_percent || 0;
                return sum + (taxableTotal * (1 + estMarkup / 100));
              }, 0);
              const baseCategoryTotals = (baseSheet.categories || []).reduce((sum: number, cat: any) => {
                const categoryKey = `${baseSheet.sheetId}_${cat.name}`;
                const markup = categoryMarkups[categoryKey] ?? 10;
                return sum + (cat.totalCost * (1 + markup / 100));
              }, 0);
              const baseFinalPrice = baseCategoryTotals + baseLinkedRowsTotal + baseLinkedSubsTaxableTotal;

              // Base sheet labor
              const baseSheetLaborTotal = sheetLabor[baseSheet.sheetId] ? sheetLabor[baseSheet.sheetId].total_labor_cost : 0;
              const baseSheetLaborLineItems = customRowLineItems[baseSheet.sheetId]?.filter((item: any) => (item.item_type || 'material') === 'labor') || [];
              const baseSheetLaborLineItemsTotal = baseSheetLaborLineItems.reduce((sum: number, item: any) => {
                const markup = item.markup_percent ?? 0;
                return sum + (item.total_cost * (1 + markup / 100));
              }, 0);
              const baseLinkedSubsNonTaxableTotal = baseLinkedSubs.reduce((sum: number, sub: any) => {
                const lineItems = subcontractorLineItems[sub.id] || [];
                const nonTaxableTotal = lineItems
                  .filter((item: any) => !item.excluded && !item.taxable)
                  .reduce((itemSum: number, item: any) => itemSum + item.total_price, 0);
                const estMarkup = sub.markup_percent || 0;
                return sum + (nonTaxableTotal * (1 + estMarkup / 100));
              }, 0);
              const baseLaborCost = baseSheetLaborTotal + baseSheetLaborLineItemsTotal + baseLinkedSubsNonTaxableTotal;

              const baseTotal = baseFinalPrice + baseLaborCost;
              const optionTotal = sheetFinalPrice + totalLaborCost;
              const priceDiff = optionTotal - baseTotal;
              const isExpanded = expandedComparisons.has(sheet.sheetId);

              return (
                <div className="mt-3 border border-blue-200 rounded-lg overflow-hidden">
                  <button
                    className="w-full flex items-center justify-between px-3 py-2 bg-blue-50 hover:bg-blue-100 transition-colors text-left"
                    onClick={() => {
                      const next = new Set(expandedComparisons);
                      if (next.has(sheet.sheetId)) next.delete(sheet.sheetId);
                      else next.add(sheet.sheetId);
                      setExpandedComparisons(next);
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <GitCompare className="w-4 h-4 text-blue-600" />
                      <span className="text-sm font-semibold text-blue-800">Price Comparison</span>
                      <span className="text-xs text-blue-600">vs {baseSheet.sheetName}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-sm font-bold ${priceDiff > 0 ? 'text-red-600' : priceDiff < 0 ? 'text-green-600' : 'text-slate-600'}`}>
                        {priceDiff > 0 ? '+' : ''}{priceDiff.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                      </span>
                      <ChevronDown className={`w-4 h-4 text-blue-600 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="p-3 bg-white">
                      <table className="w-full text-sm border-collapse">
                        <thead>
                          <tr className="border-b border-slate-200">
                            <th className="text-left py-1.5 pr-3 text-slate-600 font-medium w-[35%]"></th>
                            <th className="text-right py-1.5 px-2 text-slate-700 font-semibold">{baseSheet.sheetName}</th>
                            <th className="text-right py-1.5 px-2 text-amber-800 font-semibold">{sheet.sheetName} <span className="text-xs font-normal">(option)</span></th>
                            <th className="text-right py-1.5 pl-2 text-slate-600 font-medium">Difference</th>
                          </tr>
                        </thead>
                        <tbody>
                          {/* Category rows */}
                          {(() => {
                            const allCatNames = Array.from(new Set([
                              ...(baseSheet.categories || []).map((c: any) => c.name),
                              ...(sheet.categories || []).map((c: any) => c.name),
                            ])).sort();
                            return allCatNames.map((catName: string) => {
                              const baseCat = (baseSheet.categories || []).find((c: any) => c.name === catName);
                              const optCat = (sheet.categories || []).find((c: any) => c.name === catName);
                              const baseCatMarkup = categoryMarkups[`${baseSheet.sheetId}_${catName}`] ?? 10;
                              const optCatMarkup = categoryMarkups[`${sheet.sheetId}_${catName}`] ?? 10;
                              const baseCatPrice = baseCat ? baseCat.totalCost * (1 + baseCatMarkup / 100) : 0;
                              const optCatPrice = optCat ? optCat.totalCost * (1 + optCatMarkup / 100) : 0;
                              const diff = optCatPrice - baseCatPrice;
                              return (
                                <tr key={catName} className="border-b border-slate-100">
                                  <td className="py-1.5 pr-3 text-slate-600">{catName}</td>
                                  <td className="text-right py-1.5 px-2 text-slate-800">{baseCatPrice > 0 ? '$' + baseCatPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}</td>
                                  <td className="text-right py-1.5 px-2 text-amber-800">{optCatPrice > 0 ? '$' + optCatPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}</td>
                                  <td className={`text-right py-1.5 pl-2 font-medium ${diff > 0 ? 'text-red-600' : diff < 0 ? 'text-green-600' : 'text-slate-400'}`}>
                                    {diff !== 0 ? (diff > 0 ? '+' : '') + '$' + diff.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
                                  </td>
                                </tr>
                              );
                            });
                          })()}
                          {/* Materials subtotal */}
                          <tr className="border-b border-slate-200 bg-slate-50">
                            <td className="py-1.5 pr-3 font-medium text-slate-700">Materials Total</td>
                            <td className="text-right py-1.5 px-2 font-semibold text-blue-700">${baseFinalPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td className="text-right py-1.5 px-2 font-semibold text-amber-700">${sheetFinalPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td className={`text-right py-1.5 pl-2 font-semibold ${sheetFinalPrice - baseFinalPrice > 0 ? 'text-red-600' : sheetFinalPrice - baseFinalPrice < 0 ? 'text-green-600' : 'text-slate-400'}`}>
                              {sheetFinalPrice !== baseFinalPrice ? (sheetFinalPrice - baseFinalPrice > 0 ? '+' : '') + '$' + (sheetFinalPrice - baseFinalPrice).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
                            </td>
                          </tr>
                          {/* Labor row (only if either has labor) */}
                          {(baseLaborCost > 0 || totalLaborCost > 0) && (
                            <tr className="border-b border-slate-100">
                              <td className="py-1.5 pr-3 text-slate-600">Labor</td>
                              <td className="text-right py-1.5 px-2 text-slate-800">{baseLaborCost > 0 ? '$' + baseLaborCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}</td>
                              <td className="text-right py-1.5 px-2 text-amber-800">{totalLaborCost > 0 ? '$' + totalLaborCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}</td>
                              <td className={`text-right py-1.5 pl-2 font-medium ${totalLaborCost - baseLaborCost > 0 ? 'text-red-600' : totalLaborCost - baseLaborCost < 0 ? 'text-green-600' : 'text-slate-400'}`}>
                                {totalLaborCost !== baseLaborCost ? (totalLaborCost - baseLaborCost > 0 ? '+' : '') + '$' + (totalLaborCost - baseLaborCost).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
                              </td>
                            </tr>
                          )}
                          {/* Grand total row */}
                          <tr className="bg-blue-50">
                            <td className="py-2 pr-3 font-bold text-slate-800">Section Total</td>
                            <td className="text-right py-2 px-2 font-bold text-blue-800 text-base">${baseTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td className="text-right py-2 px-2 font-bold text-amber-800 text-base">${optionTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td className={`text-right py-2 pl-2 font-bold text-base ${priceDiff > 0 ? 'text-red-600' : priceDiff < 0 ? 'text-green-600' : 'text-slate-400'}`}>
                              {priceDiff > 0 ? '+' : ''}{priceDiff.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                      <p className="text-xs text-slate-400 mt-2">
                        {priceDiff > 0
                          ? `Choosing "${sheet.sheetName}" costs ${priceDiff.toLocaleString('en-US', { style: 'currency', currency: 'USD' })} more than "${baseSheet.sheetName}".`
                          : priceDiff < 0
                          ? `Choosing "${sheet.sheetName}" saves ${Math.abs(priceDiff).toLocaleString('en-US', { style: 'currency', currency: 'USD' })} compared to "${baseSheet.sheetName}".`
                          : `"${sheet.sheetName}" and "${baseSheet.sheetName}" have the same total price.`}
                      </p>
                    </div>
                  )}
                </div>
              );
            })()}
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
          <div className="ml-2 flex gap-2 mt-1">
            {/* Description column (full width, height fits content) */}
            <div className="flex-1 min-w-0">
              <Textarea
                key={`row-notes-${row.id}-${row.notes ?? ''}`}
                defaultValue={row.notes || ''}
                placeholder="Add description..."
                className="text-sm text-slate-600 leading-tight border border-slate-200 hover:border-slate-300 focus:border-blue-400 p-1.5 bg-slate-50/50 hover:bg-slate-50 focus:bg-white rounded transition-colors focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-0 placeholder:italic placeholder:text-muted-foreground w-full min-w-0 min-h-0 resize-none"
                rows={row.notes ? (() => {
                  const lines = row.notes.split('\n');
                  const wrappedLines = lines.reduce((acc, line) => acc + Math.max(1, Math.ceil(line.length / 90)), 0);
                  return Math.max(2, wrappedLines);
                })() : 2}
                onChange={(e) => setEmptyNotesById((prev) => ({ ...prev, [row.id]: e.target.value.trim() === '' }))}
                onBlur={async (e) => {
                  if (isReadOnly) {
                    toast.error('Cannot edit in historical view');
                    e.target.value = row.notes || '';
                    return;
                  }
                  const newValue = e.target.value.trim();
                  setEmptyNotesById((prev) => ({ ...prev, [row.id]: newValue === '' }));
                  if (newValue !== (row.notes || '')) {
                    try {
                      await supabase
                        .from('custom_financial_rows')
                        .update({ notes: newValue || null })
                        .eq('id', row.id);
                      await loadCustomRows(quote?.id ?? null, !!isReadOnly);
                      await loadMaterialsData(quote?.id ?? null, !!isReadOnly);
                    } catch (error) {
                      console.error('Error saving notes:', error);
                    }
                  }
                }}
              />
            </div>

            {/* Pricing column (narrow) */}
            <div className="w-[120px] flex-shrink-0 text-right">
              {/* Only show row-level markup if NO line items exist */}
              {lineItems.length === 0 && (
                <div className="flex items-center justify-end gap-2 text-xs text-slate-600 mb-1 flex-wrap">
                  <span className="shrink-0">Base:</span>
                  <Input
                    type="number"
                    key={`base-cost-${row.id}-${baseCost}`}
                    defaultValue={baseCost}
                    onBlur={(e) => {
                      if (isReadOnly) return;
                      const raw = parseFloat(e.target.value);
                      if (!Number.isFinite(raw) || raw < 0) return;
                      const newBase = Math.round(raw * 100) / 100;
                      if (Math.abs(newBase - baseCost) < 0.01) return;
                      updateCustomRowBaseCost(row.id, newBase, linkedSubsTaxableTotal);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="w-20 h-6 text-xs px-1.5 text-right tabular-nums"
                    step="0.01"
                    min="0"
                  />
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
              <p className="text-base font-bold text-blue-700">${finalPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              {totalLaborCost > 0 && (
                <>
                  <p className="text-sm text-slate-500 mt-2">Labor</p>
                  <p className="text-base font-bold text-amber-700">${totalLaborCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </>
              )}
            </div>
          </div>

          {/* Line Items & Linked Subcontractors */}
          {(lineItems.length > 0 || linkedSubs.length > 0) && (
            <CollapsibleContent>
              <div className="mt-2 ml-2 space-y-1">
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
                                {lineItem.quantity} × ${lineItem.unit_cost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
                                <Input
                                  type="number"
                                  key={`row-li-cost-${lineItem.id}-${itemCost}`}
                                  defaultValue={itemCost}
                                  onBlur={(e) => {
                                    if (isReadOnly) return;
                                    const raw = parseFloat(e.target.value);
                                    if (!Number.isFinite(raw) || raw < 0) return;
                                    const v = Math.round(raw * 100) / 100;
                                    if (Math.abs(v - itemCost) < 0.01) return;
                                    updateLineItemCost(lineItem.id, v);
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                  className="w-20 h-6 text-xs px-1.5 text-right tabular-nums"
                                  step="0.01"
                                  min="0"
                                />
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
                                      await loadCustomRows(quote?.id ?? null, !!isReadOnly);
                                      await loadMaterialsData(quote?.id ?? null, !!isReadOnly);
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
                                ${itemPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
                  const included = subLineItems.filter((item: any) => !item.excluded);
                  const materialTotal = included
                    .filter((i: any) => (i.item_type || 'material') === 'material')
                    .reduce((sum: number, i: any) => sum + (i.total_price || 0), 0);
                  const laborTotal = included
                    .filter((i: any) => (i.item_type || 'material') === 'labor')
                    .reduce((sum: number, i: any) => sum + (i.total_price || 0), 0);
                  const markup = 1 + (sub.markup_percent || 0) / 100;
                  const materialWithMarkup = materialTotal * markup;
                  const laborWithMarkup = laborTotal * markup;
                  const totalWithMarkup = materialWithMarkup + laborWithMarkup;

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
                                {materialTotal > 0 && <span className="text-slate-600">Material: ${materialWithMarkup.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>}
                                {laborTotal > 0 && <span className="text-amber-700">Labor: ${laborWithMarkup.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>}
                                {materialTotal === 0 && laborTotal === 0 && <span className="text-slate-500">$0.00</span>}
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
                                ${totalWithMarkup.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
                                              await loadSubcontractorEstimates(quote?.id ?? null, !!isReadOnly);
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
                                        ${(lineItem.total_price * (1 + (lineItem.markup_percent || 0) / 100)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                      </p>
                                      {!isReadOnly && (
                                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-slate-500 hover:text-slate-700" onClick={() => openEditSubcontractorLineItemDialog(lineItem)} title="Edit line item">
                                          <Edit className="w-3 h-3" />
                                        </Button>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                          {!isReadOnly && (
                            <Button size="sm" variant="outline" className="mt-2 h-7 text-xs" onClick={() => openAddSubcontractorLineItemDialog(sub.id)}>
                              <Plus className="w-3 h-3 mr-1" />Add line item
                            </Button>
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
      const included = lineItems.filter((item: any) => !item.excluded);
      const materialIncludedTotal = included
        .filter((i: any) => (i.item_type || 'material') === 'material')
        .reduce((sum: number, i: any) => sum + (i.total_price || 0), 0);
      const laborIncludedTotal = included
        .filter((i: any) => (i.item_type || 'material') === 'labor')
        .reduce((sum: number, i: any) => sum + (i.total_price || 0), 0);
      const includedTotal = materialIncludedTotal + laborIncludedTotal;
      const estMarkup = est.markup_percent || 0;
      const materialWithMarkup = materialIncludedTotal * (1 + estMarkup / 100);
      const laborWithMarkup = laborIncludedTotal * (1 + estMarkup / 100);
      const finalPrice = materialWithMarkup + laborWithMarkup;

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
          <div className="ml-2 flex gap-2 mt-1">
            {/* Description column (full width, height fits content) */}
            <div className="flex-1 min-w-0">
              <Textarea
                key={`sub-scope-${est.id}-${est.scope_of_work ?? ''}`}
                defaultValue={est.scope_of_work || ''}
                placeholder="Add description..."
                className="text-sm text-slate-600 leading-tight border border-slate-200 hover:border-slate-300 focus:border-blue-400 p-1.5 bg-slate-50/50 hover:bg-slate-50 focus:bg-white rounded transition-colors focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-0 placeholder:italic placeholder:text-muted-foreground w-full min-w-0 min-h-0 resize-none"
                rows={est.scope_of_work ? (() => {
                  const lines = est.scope_of_work.split('\n');
                  const wrappedLines = lines.reduce((acc, line) => acc + Math.max(1, Math.ceil(line.length / 90)), 0);
                  return Math.max(2, wrappedLines);
                })() : 2}
                onChange={(e) => setEmptyScopeById((prev) => ({ ...prev, [est.id]: e.target.value.trim() === '' }))}
                onBlur={async (e) => {
                  if (isReadOnly) {
                    toast.error('Cannot edit in historical view');
                    e.target.value = est.scope_of_work || '';
                    return;
                  }
                  const newValue = e.target.value.trim();
                  setEmptyScopeById((prev) => ({ ...prev, [est.id]: newValue === '' }));
                  if (newValue !== (est.scope_of_work || '')) {
                    try {
                      await supabase
                        .from('subcontractor_estimates')
                        .update({ scope_of_work: newValue || null })
                        .eq('id', est.id);
                      await loadSubcontractorEstimates(quote?.id ?? null, !!isReadOnly);
                    } catch (error) {
                      console.error('Error saving scope of work:', error);
                    }
                  }
                }}
              />
            </div>

            {/* Pricing column: Material (taxable) and Labor (non-taxable) split */}
            <div className="w-[140px] flex-shrink-0 text-right">
              <div className="flex items-center justify-end gap-1 text-xs text-slate-600 mb-0.5">
                <span>+</span>
                <Input
                  type="number"
                  value={estMarkup || 0}
                  onChange={(e) => {
                    const newMarkup = parseFloat(e.target.value) || 0;
                    updateSubcontractorMarkup(est.id, newMarkup);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="w-12 h-5 text-xs px-1 text-center"
                  step="1"
                  min="0"
                />
                <span>%</span>
              </div>
              {materialIncludedTotal > 0 && (
                <div className="text-xs mb-0.5">
                  <span className="text-slate-500">Material: </span>
                  <span className="font-medium">${materialWithMarkup.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              )}
              {laborIncludedTotal > 0 && (
                <div className="text-xs mb-0.5">
                  <span className="text-slate-500">Labor: </span>
                  <span className="font-medium text-amber-700">${laborWithMarkup.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              )}
              <p className="text-sm text-slate-500 mt-1">Total</p>
              <p className="text-base font-bold text-blue-700">${finalPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
          </div>

          <CollapsibleContent>
            <div className="mt-2 ml-2 space-y-1">
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
                                  await loadSubcontractorEstimates(quote?.id ?? null, !!isReadOnly);
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
                            ${(lineItem.total_price * (1 + (lineItem.markup_percent || 0) / 100)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </p>
                          {!isReadOnly && (
                            <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-slate-500 hover:text-slate-700" onClick={() => openEditSubcontractorLineItemDialog(lineItem)} title="Edit line item">
                              <Edit className="w-3 h-3" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {!isReadOnly && (
                <Button size="sm" variant="outline" className="mt-2 h-7 text-xs" onClick={() => openAddSubcontractorLineItemDialog(est.id)}>
                  <Plus className="w-3 h-3 mr-1" />Add line item
                </Button>
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

const headerBtn = 'bg-white text-black hover:bg-slate-100 border-slate-400 text-xs h-8 px-2';

export function JobFinancials({ job, controlledQuoteId, onQuoteChange }: JobFinancialsProps) {
  const { profile } = useAuth();
  const setProposalToolbar = useProposalToolbar();
  const proposalSummaryCtx = useProposalSummary();
  const [loading, setLoading] = useState(true);
  const [initialDataLoaded, setInitialDataLoaded] = useState(false);
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
  // Track empty description boxes so we can show narrow width (width of placeholder text)
  const [emptyNotesById, setEmptyNotesById] = useState<Record<string, boolean>>({});
  const [emptyScopeById, setEmptyScopeById] = useState<Record<string, boolean>>({});

  // Tax exempt: local state so the total updates immediately; optional DB persist when column exists
  const [taxExemptChecked, setTaxExemptChecked] = useState(false);
  // true = the current checked value is confirmed saved in the DB (visible to all users on reload)
  const [taxExemptSaved, setTaxExemptSaved] = useState(false);
  // Supabase Realtime broadcast channel for instant cross-user sync
  const taxExemptChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Subcontractor dialog state
  const [showSubcontractorDialog, setShowSubcontractorDialog] = useState(false);
  const [subcontractorParentId, setSubcontractorParentId] = useState<string | null>(null);
  const [subcontractorParentType, setSubcontractorParentType] = useState<'sheet' | 'row' | null>(null);
  const [subcontractorMode, setSubcontractorMode] = useState<'select' | 'upload'>('select');
  const [selectedExistingSubcontractor, setSelectedExistingSubcontractor] = useState<string>('');

  // Add line item to subcontractor section
  const [showAddSubcontractorLineItemDialog, setShowAddSubcontractorLineItemDialog] = useState(false);
  const [addSubcontractorLineItemEstimateId, setAddSubcontractorLineItemEstimateId] = useState<string | null>(null);
  const [subLineItemDescription, setSubLineItemDescription] = useState('');
  const [subLineItemQuantity, setSubLineItemQuantity] = useState('1');
  const [subLineItemUnitPrice, setSubLineItemUnitPrice] = useState('');
  const [subLineItemType, setSubLineItemType] = useState<'material' | 'labor'>('material');
  const [subLineItemTaxable, setSubLineItemTaxable] = useState(true);
  const [showEditSubcontractorLineItemDialog, setShowEditSubcontractorLineItemDialog] = useState(false);
  const [editingSubcontractorLineItemId, setEditingSubcontractorLineItemId] = useState<string | null>(null);

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
  const [exportTheme, setExportTheme] = useState<'default' | 'premium'>('default'); // default = black & white; premium = dark green + gold
  const [exporting, setExporting] = useState(false);
  const [showPdfView, setShowPdfView] = useState(false);
  const [pdfViewHtml, setPdfViewHtml] = useState<string | null>(null);
  const [pdfViewFilename, setPdfViewFilename] = useState<string>('');
  const [pdfPrintUrl, setPdfPrintUrl] = useState<string | null>(null);
  const pdfIframeRef = useRef<HTMLIFrameElement>(null);
  
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
  const [showProposalComparison, setShowProposalComparison] = useState(false);
  const [showDeleteProposalConfirm, setShowDeleteProposalConfirm] = useState(false);
  const [deleteProposalQuoteId, setDeleteProposalQuoteId] = useState<string | null>(null);
  // Local overlay for optional categories when DB save fails (key = sheetId_categoryName)
  const [optionalCategoryOverlay, setOptionalCategoryOverlay] = useState<Record<string, boolean>>({});
  const [templateQuoteIdForNewProposal, setTemplateQuoteIdForNewProposal] = useState<string | null>(null);
  const [recoveringProposal, setRecoveringProposal] = useState(false);
  const [showMarkAsSentManualDialog, setShowMarkAsSentManualDialog] = useState(false);
  const [markAsSentManualSql, setMarkAsSentManualSql] = useState('');

  // Optional section comparison state
  const [showComparePickerDialog, setShowComparePickerDialog] = useState(false);
  const [comparePickerSheetId, setComparePickerSheetId] = useState<string | null>(null); // optional sheet being set up
  const [expandedComparisons, setExpandedComparisons] = useState<Set<string>>(new Set());
  
  // Use ref to track user's selected quote ID (persists across re-renders)
  const userSelectedQuoteIdRef = useRef<string | null>(null);
  // Track the last controlledQuoteId we synced so we only reload when the parent
  // actually changes the selection — not when allJobQuotes first populates.
  const lastSyncedControlledIdRef = useRef<string | null | undefined>(undefined);
  
  // Proposal versioning state
  const [proposalVersions, setProposalVersions] = useState<any[]>([]);
  const [viewingProposalNumber, setViewingProposalNumber] = useState<number | null>(null);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [showCreateVersionDialog, setShowCreateVersionDialog] = useState(false);
  const [versionChangeNotes, setVersionChangeNotes] = useState('');
  const [creatingVersion, setCreatingVersion] = useState(false);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [initializingVersions, setInitializingVersions] = useState(false);
  // When user explicitly unlocks a historical proposal for editing, allow edits until they lock again or switch proposal
  const [historicalUnlockedQuoteId, setHistoricalUnlockedQuoteId] = useState<string | null>(null);

  // Clear unlock when switching to a different proposal so each historical proposal starts locked
  useEffect(() => {
    if (quote?.id && quote.id !== historicalUnlockedQuoteId) setHistoricalUnlockedQuoteId(null);
  }, [quote?.id]);

  // Default locked: historical (not first), marked as sent, or locked for editing (persisted in DB for all users)
  const isDefaultLocked = !!quote && (
    (allJobQuotes.length > 0 && quote.id !== allJobQuotes[0]?.id) ||
    !!(quote as any).sent_at ||
    !!(quote as any).locked_for_editing
  );
  // Read-only when default locked and user hasn't unlocked this historical proposal for editing
  const isReadOnly = isDefaultLocked && quote?.id !== historicalUnlockedQuoteId;
  
  // Document viewer state — Building Description is quote-level only (quotes.description), not job-level
  const [showDocumentViewer, setShowDocumentViewer] = useState(false);
  const documentPanel = useDocumentPanel();
  const openDocuments = () => {
    if (documentPanel) {
      documentPanel.setShowDocumentsInPanel(true);
    } else {
      setShowDocumentViewer(true);
    }
  };
  const [buildingDescription, setBuildingDescription] = useState((quote as any)?.description ?? '');
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
    (async () => {
      // Load quote list first so the proposal shell shows immediately (fast path)
      const selectedQuote = await loadQuoteData();
      if (cancelled) return;
      setLoading(false);

      // Load financial data in background so UI is already visible
      loadData(true, selectedQuote ?? undefined).then(() => {
        if (!cancelled) setInitialDataLoaded(true);
      });

      // Do not run any automatic restore/copy that deletes or overwrites materials.
      // Materials and workbooks are only changed when the user explicitly: deletes a sheet/workbook,
      // or chooses "Restore from snapshot" / "Restore version" and confirms.
    })();
    return () => {
      cancelled = true;
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

  // Sync building description from current quote only (quotes.description) — each proposal has its own
  useEffect(() => {
    setBuildingDescription((quote as any)?.description ?? '');
  }, [quote?.id, (quote as any)?.description]);

  // Sync tax exempt from quote when quote loads (persists after refresh: loadQuoteData merges tax_exempt from API or get_job_quotes_tax_exempt RPC)
  useEffect(() => {
    if (quote == null) {
      setTaxExemptChecked(false);
      setTaxExemptSaved(false);
      return;
    }
    const taxExempt = (quote as any).tax_exempt;
    setTaxExemptChecked(taxExempt === true);
    // Value was loaded from DB → it is saved
    setTaxExemptSaved(taxExempt === true);
  }, [quote?.id, (quote as any)?.tax_exempt]);

  // Real-time broadcast: sync tax exempt across all users who have this job open
  useEffect(() => {
    if (!job?.id) return;
    const channel = supabase
      .channel(`job-tax-exempt-${job.id}`)
      .on('broadcast', { event: 'tax_exempt' }, ({ payload }) => {
        const val: boolean = !!payload.value;
        setTaxExemptChecked(val);
        setTaxExemptSaved(true);
        setQuote((prev) => prev ? { ...prev, tax_exempt: val } : prev);
        setAllJobQuotes((prev) =>
          val
            ? prev.map((q: any) => ({ ...q, tax_exempt: true }))
            : prev.map((q: any) => q.id === payload.quote_id ? { ...q, tax_exempt: false } : q),
        );
      })
      .subscribe();
    taxExemptChannelRef.current = channel;
    return () => {
      supabase.removeChannel(channel);
      taxExemptChannelRef.current = null;
    };
  }, [job?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Notify parent when proposal changes (for combined Proposal+Materials view).
  // Track last notified ID so we don't send a redundant update that re-triggers sync.
  const lastNotifiedQuoteIdRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const id = quote?.id ?? null;
    if (id !== lastNotifiedQuoteIdRef.current) {
      lastNotifiedQuoteIdRef.current = id;
      onQuoteChange?.(id);
    }
  }, [quote?.id, onQuoteChange]);

  // When parent controls quote (e.g. user switched proposal in Materials panel), sync our quote.
  // Guard with lastSyncedControlledIdRef so we only reload when the parent *changes* the selection,
  // not when allJobQuotes first populates after mount (which would double-load on every open).
  useEffect(() => {
    if (controlledQuoteId === undefined) return;
    if (!controlledQuoteId) {
      if (quote !== null) setQuote(null);
      lastSyncedControlledIdRef.current = controlledQuoteId;
      return;
    }
    // Skip if this is the same ID we already synced
    if (controlledQuoteId === lastSyncedControlledIdRef.current) return;
    const match = allJobQuotes.find(q => q.id === controlledQuoteId);
    if (match && quote?.id !== match.id) {
      lastSyncedControlledIdRef.current = controlledQuoteId;
      userSelectedQuoteIdRef.current = match.id;
      setQuote(match);
      loadData(false, match);
    } else if (match && quote?.id === match.id) {
      // Quote already matches — just mark as synced so we don't re-fire
      lastSyncedControlledIdRef.current = controlledQuoteId;
    } else if (allJobQuotes.length === 0) {
      // Quotes not loaded yet — store for loadQuoteData to pick up; mark synced so we don't double-load when list populates
      userSelectedQuoteIdRef.current = controlledQuoteId;
      lastSyncedControlledIdRef.current = controlledQuoteId;
    } else {
      // controlledQuoteId set (e.g. 3rd proposal) but not in allJobQuotes — fetch by id and load so proposal data is always shown
      lastSyncedControlledIdRef.current = controlledQuoteId;
      userSelectedQuoteIdRef.current = controlledQuoteId;
      let cancelled = false;
      supabase
        .from('quotes')
        .select('*')
        .eq('id', controlledQuoteId)
        .eq('job_id', job.id)
        .single()
        .then(({ data: fetched, error }) => {
          if (cancelled || error || !fetched) return;
          setAllJobQuotes((prev: any[]) => {
            if (prev.some((q: any) => q.id === fetched.id)) return prev;
            return [fetched, ...prev];
          });
          setQuote(fetched);
          loadData(false, fetched);
        });
      return () => { cancelled = true; };
    }
  }, [controlledQuoteId, allJobQuotes.length, quote?.id, job.id]);

  // When the materials workbook saves a change, refresh materials (and thus proposal totals) in real time
  useEffect(() => {
    const handler = (e: Event) => {
      const { jobId, quoteId } = (e as CustomEvent).detail ?? {};
      if (jobId !== job.id) return;
      if (quoteId != null && quote?.id != null && quoteId !== quote.id) return;
      const isHist = !!quote && allJobQuotes.length > 0 && quote.id !== allJobQuotes[0]?.id && quote.id !== historicalUnlockedQuoteId;
      loadMaterialsData(quote?.id ?? null, isHist);
    };
    window.addEventListener('materials-workbook-updated', handler as EventListener);
    return () => window.removeEventListener('materials-workbook-updated', handler as EventListener);
  }, [job.id, quote?.id, allJobQuotes.length, historicalUnlockedQuoteId]);

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

  /** Set the active (current) proposal as contract. Creates a version first if none exist. */
  async function setActiveProposalAsContract() {
    if (!quote || (quote as any).signed_version) return;
    if (!confirm('Set this proposal as the contract? This will create a signed version that cannot be changed.')) return;
    try {
      let versionToSign: any = proposalVersions.find((v: any) => v.version_number === (quote as any).current_version) ?? proposalVersions[0];
      if (!versionToSign && proposalVersions.length === 0) {
        const { error } = await supabase.rpc('create_proposal_version', {
          p_quote_id: quote.id,
          p_job_id: null,
          p_user_id: profile?.id || null,
          p_change_notes: 'Set as contract',
        });
        if (error) throw error;
        const { data: freshVersions } = await supabase.from('proposal_versions').select('*').eq('quote_id', quote.id).order('version_number', { ascending: false });
        versionToSign = (freshVersions || [])[0];
      }
      if (!versionToSign) {
        toast.error('No version to sign');
        return;
      }
      const { error: signErr } = await supabase
        .from('proposal_versions')
        .update({ is_signed: true, signed_at: new Date().toISOString(), signed_by: profile?.id })
        .eq('id', versionToSign.id);
      if (signErr) throw signErr;
      await supabase.from('quotes').update({ signed_version: versionToSign.version_number }).eq('id', quote.id);
      toast.success('Version signed and locked!');
      await loadProposalVersions();
      await loadQuoteData();
    } catch (error: any) {
      console.error('Error setting as contract:', error);
      toast.error(error?.message ?? 'Failed to set as contract');
    }
  }

  async function markProposalAsSent() {
    if (!quote || !profile) return;
    if ((quote as any).sent_at) {
      toast.info('This proposal is already marked as sent.');
      return;
    }
    if (!confirm('Record that this proposal was sent to the customer? The current date and time will be saved so you can see when it was sent and how long it was worked on. The proposal and materials workbook will be locked.')) return;

    const onSuccess = async () => {
      toast.success('Proposal marked as sent. Date and time recorded.');
      await loadQuoteData();
      await loadData(true);
    };

    try {
      const { error: lockErr } = await supabase
        .from('material_workbooks')
        .update({ status: 'locked', updated_at: new Date().toISOString() })
        .eq('quote_id', quote.id);

      const { error: quoteErr } = await supabase
        .from('quotes')
        .update({ sent_at: new Date().toISOString(), sent_by: profile.id })
        .eq('id', quote.id);

      if (!lockErr && !quoteErr) {
        await onSuccess();
        return;
      }

      const manualSql = `-- Run in Supabase Dashboard → SQL Editor → New query → Paste → Run
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS sent_at timestamptz, ADD COLUMN IF NOT EXISTS sent_by uuid;
UPDATE material_workbooks SET status = 'locked', updated_at = now() WHERE quote_id = '${quote.id}';
UPDATE quotes SET sent_at = now(), sent_by = '${profile.id}' WHERE id = '${quote.id}';`;
      setMarkAsSentManualSql(manualSql);
      setShowMarkAsSentManualDialog(true);
      toast.error('Update failed. Copy the SQL from the dialog and run it in Supabase SQL Editor, then refresh.');
    } catch (error: any) {
      console.error('Error marking proposal as sent:', error);
      const manualSql = `-- Run in Supabase Dashboard → SQL Editor → New query → Paste → Run
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS sent_at timestamptz, ADD COLUMN IF NOT EXISTS sent_by uuid;
UPDATE material_workbooks SET status = 'locked', updated_at = now() WHERE quote_id = '${quote.id}';
UPDATE quotes SET sent_at = now(), sent_by = '${profile.id}' WHERE id = '${quote.id}';`;
      setMarkAsSentManualSql(manualSql);
      setShowMarkAsSentManualDialog(true);
      toast.error(error?.message || 'Mark as sent failed. Use the dialog to run the SQL manually.');
    }
  }

  async function restoreJob26007FromSnapshot(quoteId: string) {
    const { data: version, error: verError } = await supabase
      .from('proposal_versions')
      .select('workbook_snapshot, financial_rows_snapshot, subcontractor_snapshot')
      .eq('quote_id', quoteId)
      .order('version_number', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (verError || !version) return;
    const hasWorkbook = version.workbook_snapshot && (version.workbook_snapshot as any).sheets?.length;
    const hasRows = Array.isArray(version.financial_rows_snapshot) && version.financial_rows_snapshot.length > 0;
    const hasSubs = Array.isArray(version.subcontractor_snapshot) && version.subcontractor_snapshot.length > 0;
    if (!hasWorkbook && !hasRows && !hasSubs) return;

    const wbSnapshot = version.workbook_snapshot as any;
    const rowsSnapshot = Array.isArray(version.financial_rows_snapshot) ? version.financial_rows_snapshot : [];
    const subsSnapshot = Array.isArray(version.subcontractor_snapshot) ? version.subcontractor_snapshot : [];

    const { data: existingRows } = await supabase.from('custom_financial_rows').select('id').eq('quote_id', quoteId);
    const rowIds = (existingRows || []).map((r: any) => r.id);
    if (rowIds.length > 0) {
      await supabase.from('custom_financial_row_items').delete().in('row_id', rowIds);
      await supabase.from('custom_financial_rows').delete().eq('quote_id', quoteId);
    }

    const { data: existingWbs } = await supabase.from('material_workbooks').select('id').eq('quote_id', quoteId);
    for (const wb of existingWbs || []) {
      const { data: sheets } = await supabase.from('material_sheets').select('id').eq('workbook_id', wb.id);
      for (const sh of sheets || []) {
        await supabase.from('material_items').delete().eq('sheet_id', sh.id);
        await supabase.from('material_sheet_labor').delete().eq('sheet_id', sh.id);
        await supabase.from('material_category_markups').delete().eq('sheet_id', sh.id);
      }
      if (sheets?.length) await supabase.from('material_sheets').delete().eq('workbook_id', wb.id);
    }
    if (existingWbs?.length) await supabase.from('material_workbooks').delete().eq('quote_id', quoteId);

    const { data: existingEsts } = await supabase.from('subcontractor_estimates').select('id').eq('quote_id', quoteId);
    const estIds = (existingEsts || []).map((e: any) => e.id);
    if (estIds.length > 0) {
      await supabase.from('subcontractor_estimate_line_items').delete().in('estimate_id', estIds);
      await supabase.from('subcontractor_estimates').delete().eq('quote_id', quoteId);
    }

    const sheetIdMap: Record<string, string> = {};
    const rowIdMap: Record<string, string> = {};

    if (wbSnapshot?.sheets?.length && profile?.id) {
      const { data: maxWb } = await supabase.from('material_workbooks').select('version_number').eq('job_id', job.id).order('version_number', { ascending: false }).limit(1).maybeSingle();
      const nextVer = (maxWb?.version_number ?? 0) + 1;
      const { data: newWb, error: wbErr } = await supabase.from('material_workbooks').insert({
        job_id: job.id, quote_id: quoteId, version_number: nextVer, status: 'working', created_by: profile.id,
      }).select('id').single();
      if (wbErr || !newWb) return;
      const sheets = (wbSnapshot.sheets || []).slice().sort((a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0));
      for (const sh of sheets) {
        const { data: newSheet, error: shErr } = await supabase.from('material_sheets').insert({
          workbook_id: newWb.id, sheet_name: sh.sheet_name ?? 'Sheet', order_index: sh.order_index ?? 0,
          is_option: sh.is_option ?? false, description: sh.description ?? null,
        }).select('id').single();
        if (shErr || !newSheet) continue;
        sheetIdMap[sh.id] = newSheet.id;
        const items = (sh.items || []).slice().sort((a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0));
        if (items.length) {
          await supabase.from('material_items').insert(items.map(({ id: _i, sheet_id: _s, created_at: _c, updated_at: _u, ...r }: any) => ({ ...r, sheet_id: newSheet.id })));
        }
      }
      const catMarkups = wbSnapshot.category_markups || {};
      for (const [key, pct] of Object.entries(catMarkups)) {
        const underscoreIdx = key.indexOf('_');
        const oldSheetId = underscoreIdx >= 0 ? key.slice(0, underscoreIdx) : key;
        const categoryName = underscoreIdx >= 0 ? key.slice(underscoreIdx + 1) : '';
        const newSheetId = sheetIdMap[oldSheetId];
        if (newSheetId != null && categoryName) {
          await supabase.from('material_category_markups').insert({ sheet_id: newSheetId, category_name: categoryName, markup_percent: Number(pct) });
        }
      }
      const sheetLabor = wbSnapshot.sheet_labor || [];
      for (const labor of sheetLabor) {
        const newSheetId = sheetIdMap[labor.sheet_id];
        if (newSheetId) {
          const { id: _i, sheet_id: _s, created_at: _c, updated_at: _u, ...r } = labor;
          await supabase.from('material_sheet_labor').insert({ ...r, sheet_id: newSheetId });
        }
      }
    }

    for (const row of rowsSnapshot) {
      const { id: _id, created_at: _c, updated_at: _u, line_items: lineItems, ...rowRest } = row;
      const newSheetId = row.sheet_id ? sheetIdMap[row.sheet_id] ?? null : null;
      const { data: newRow, error: rErr } = await supabase.from('custom_financial_rows').insert({
        job_id: job.id, quote_id: quoteId, ...rowRest, sheet_id: newSheetId,
      }).select('id').single();
      if (rErr || !newRow) continue;
      rowIdMap[row.id] = newRow.id;
      const items = row.line_items || [];
      if (items.length) {
        await supabase.from('custom_financial_row_items').insert(items.map(({ id: _i, row_id: _r, sheet_id: oldSid, created_at: _c2, updated_at: _u2, ...r }: any) => ({
          ...r, row_id: newRow.id, sheet_id: oldSid ? (sheetIdMap[oldSid] ?? null) : null,
        })));
      }
    }

    const sheetLinkedItems = rowsSnapshot.flatMap((r: any) => (r.line_items || []).filter((li: any) => li.sheet_id && !li.row_id));
    for (const item of sheetLinkedItems) {
      const newSheetId = item.sheet_id ? sheetIdMap[item.sheet_id] : null;
      if (newSheetId) {
        const { id: _i, row_id: _r, sheet_id: _s, created_at: _c, updated_at: _u, ...r } = item;
        await supabase.from('custom_financial_row_items').insert({ ...r, row_id: null, sheet_id: newSheetId });
      }
    }

    for (const est of subsSnapshot) {
      const { id: _i, line_items: lineItems, ...estRest } = est;
      const newSheetId = est.sheet_id ? sheetIdMap[est.sheet_id] ?? null : null;
      const newRowId = est.row_id ? rowIdMap[est.row_id] ?? null : null;
      const { data: newEst, error: eErr } = await supabase.from('subcontractor_estimates').insert({
        job_id: job.id, quote_id: quoteId, ...estRest, sheet_id: newSheetId, row_id: newRowId,
      }).select('id').single();
      if (eErr || !newEst) continue;
      const items = est.line_items || [];
      if (items.length) {
        await supabase.from('subcontractor_estimate_line_items').insert(items.map(({ id: _i2, estimate_id: _e, created_at: _c, updated_at: _u, ...r }: any) => ({ ...r, estimate_id: newEst.id })));
      }
    }

    toast.success('Proposal data for job #26007 restored from snapshot.');
  }

  /** Restores workbook + financial rows + subs from a proposal_versions row into the given quote. DELETES existing data for that quote. Only call after explicit user confirmation (e.g. "Restore from snapshot" dialog). */
  async function restoreSnapshotIntoQuote(versionRow: any, targetQuoteId: string) {
    const wbSnapshot = versionRow.workbook_snapshot as any;
    const rowsSnapshot = Array.isArray(versionRow.financial_rows_snapshot) ? versionRow.financial_rows_snapshot : [];
    const subsSnapshot = Array.isArray(versionRow.subcontractor_snapshot) ? versionRow.subcontractor_snapshot : [];
    if (!profile?.id) return;

    const { data: existingRows } = await supabase.from('custom_financial_rows').select('id').eq('quote_id', targetQuoteId);
    const rowIds = (existingRows || []).map((r: any) => r.id);
    if (rowIds.length > 0) {
      await supabase.from('custom_financial_row_items').delete().in('row_id', rowIds);
      await supabase.from('custom_financial_rows').delete().eq('quote_id', targetQuoteId);
    }
    const { data: existingWbs } = await supabase.from('material_workbooks').select('id').eq('quote_id', targetQuoteId);
    for (const wb of existingWbs || []) {
      const { data: sheets } = await supabase.from('material_sheets').select('id').eq('workbook_id', wb.id);
      for (const sh of sheets || []) {
        await supabase.from('material_items').delete().eq('sheet_id', sh.id);
        await supabase.from('material_sheet_labor').delete().eq('sheet_id', sh.id);
        await supabase.from('material_category_markups').delete().eq('sheet_id', sh.id);
      }
      if (sheets?.length) await supabase.from('material_sheets').delete().eq('workbook_id', wb.id);
    }
    if (existingWbs?.length) await supabase.from('material_workbooks').delete().eq('quote_id', targetQuoteId);
    const { data: existingEsts } = await supabase.from('subcontractor_estimates').select('id').eq('quote_id', targetQuoteId);
    const estIds = (existingEsts || []).map((e: any) => e.id);
    if (estIds.length > 0) {
      await supabase.from('subcontractor_estimate_line_items').delete().in('estimate_id', estIds);
      await supabase.from('subcontractor_estimates').delete().eq('quote_id', targetQuoteId);
    }

    const sheetIdMap: Record<string, string> = {};
    const rowIdMap: Record<string, string> = {};

    if (wbSnapshot?.sheets?.length) {
      const { data: maxWb } = await supabase.from('material_workbooks').select('version_number').eq('job_id', job.id).order('version_number', { ascending: false }).limit(1).maybeSingle();
      const nextVer = (maxWb?.version_number ?? 0) + 1;
      const { data: newWb, error: wbErr } = await supabase.from('material_workbooks').insert({
        job_id: job.id, quote_id: targetQuoteId, version_number: nextVer, status: 'working', created_by: profile.id,
      }).select('id').single();
      if (!wbErr && newWb) {
        const sheets = (wbSnapshot.sheets || []).slice().sort((a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0));
        for (const sh of sheets) {
          const { data: newSheet, error: shErr } = await supabase.from('material_sheets').insert({
            workbook_id: newWb.id, sheet_name: sh.sheet_name ?? 'Sheet', order_index: sh.order_index ?? 0,
            is_option: sh.is_option ?? false, description: sh.description ?? null,
          }).select('id').single();
          if (shErr || !newSheet) continue;
          sheetIdMap[sh.id] = newSheet.id;
          const items = (sh.items || []).slice().sort((a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0));
          if (items.length) await supabase.from('material_items').insert(items.map(({ id: _i, sheet_id: _s, created_at: _c, updated_at: _u, ...r }: any) => ({ ...r, sheet_id: newSheet.id })));
        }
        const catMarkups = wbSnapshot.category_markups || {};
        for (const [key, pct] of Object.entries(catMarkups)) {
          const idx = key.indexOf('_');
          const oldSheetId = idx >= 0 ? key.slice(0, idx) : key;
          const categoryName = idx >= 0 ? key.slice(idx + 1) : '';
          const newSheetId = sheetIdMap[oldSheetId];
          if (newSheetId != null && categoryName) await supabase.from('material_category_markups').insert({ sheet_id: newSheetId, category_name: categoryName, markup_percent: Number(pct) });
        }
        const sheetLabor = wbSnapshot.sheet_labor || [];
        for (const labor of sheetLabor) {
          const newSheetId = sheetIdMap[labor.sheet_id];
          if (newSheetId) {
            const { id: _i, sheet_id: _s, created_at: _c, updated_at: _u, ...r } = labor;
            await supabase.from('material_sheet_labor').insert({ ...r, sheet_id: newSheetId });
          }
        }
      }
    }

    for (const row of rowsSnapshot) {
      const { id: _id, created_at: _c, updated_at: _u, line_items: lineItems, ...rowRest } = row;
      const newSheetId = row.sheet_id ? sheetIdMap[row.sheet_id] ?? null : null;
      const { data: newRow, error: rErr } = await supabase.from('custom_financial_rows').insert({
        job_id: job.id, quote_id: targetQuoteId, ...rowRest, sheet_id: newSheetId,
      }).select('id').single();
      if (rErr || !newRow) continue;
      rowIdMap[row.id] = newRow.id;
      const items = row.line_items || [];
      if (items.length) await supabase.from('custom_financial_row_items').insert(items.map(({ id: _i, row_id: _r, sheet_id: oldSid, created_at: _c2, updated_at: _u2, ...r }: any) => ({ ...r, row_id: newRow.id, sheet_id: oldSid ? (sheetIdMap[oldSid] ?? null) : null })));
    }
    const sheetLinkedItems = rowsSnapshot.flatMap((r: any) => (r.line_items || []).filter((li: any) => li.sheet_id && !li.row_id));
    for (const item of sheetLinkedItems) {
      const newSheetId = item.sheet_id ? sheetIdMap[item.sheet_id] : null;
      if (newSheetId) {
        const { id: _i, row_id: _r, sheet_id: _s, created_at: _c, updated_at: _u, ...r } = item;
        await supabase.from('custom_financial_row_items').insert({ ...r, row_id: null, sheet_id: newSheetId });
      }
    }
    for (const est of subsSnapshot) {
      const { id: _i, line_items: lineItems, ...estRest } = est;
      const newSheetId = est.sheet_id ? sheetIdMap[est.sheet_id] ?? null : null;
      const newRowId = est.row_id ? rowIdMap[est.row_id] ?? null : null;
      const { data: newEst, error: eErr } = await supabase.from('subcontractor_estimates').insert({
        job_id: job.id, quote_id: targetQuoteId, ...estRest, sheet_id: newSheetId, row_id: newRowId,
      }).select('id').single();
      if (eErr || !newEst) continue;
      const items = est.line_items || [];
      if (items.length) await supabase.from('subcontractor_estimate_line_items').insert(items.map(({ id: _i2, estimate_id: _e, created_at: _c, updated_at: _u, ...r }: any) => ({ ...r, estimate_id: newEst.id })));
    }
  }

  /** Restore materials (and proposal data) for the current quote from the latest saved proposal snapshot for this job. */
  async function restoreMaterialsFromSnapshot() {
    if (!quote) {
      toast.error('Select or create a proposal first.');
      return;
    }
    if (!profile?.id) {
      toast.error('You must be signed in to restore.');
      return;
    }
    try {
      const { data: jobQuotes } = await supabase.from('quotes').select('id').eq('job_id', job.id);
      const quoteIds = (jobQuotes || []).map((q: any) => q.id);
      if (quoteIds.length === 0) {
        toast.error('No proposals found for this job.');
        return;
      }
      const { data: pvRows, error: pvErr } = await supabase
        .from('proposal_versions')
        .select('id, quote_id, financial_rows_snapshot, workbook_snapshot, subcontractor_snapshot')
        .in('quote_id', quoteIds)
        .order('created_at', { ascending: false })
        .limit(100);
      if (pvErr) throw pvErr;
      let withData: any = null;
      for (const r of pvRows || []) {
        const hasWb = r.workbook_snapshot && (r.workbook_snapshot as any).sheets?.length > 0;
        const hasRows = Array.isArray(r.financial_rows_snapshot) && r.financial_rows_snapshot.length > 0;
        if (hasWb || hasRows) {
          withData = r;
          break;
        }
      }
      if (!withData) {
        toast.error('No saved proposal snapshot with materials or data found for this job.');
        return;
      }
      await restoreSnapshotIntoQuote(withData, quote.id);
      await loadQuoteData();
      loadData(true, quote);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('material-workbook-restored', { detail: { quoteId: quote.id } }));
      }
      toast.success('Materials and proposal data restored from a saved snapshot.');
    } catch (e: any) {
      console.error('Restore materials failed:', e);
      toast.error('Restore failed: ' + (e?.message || 'see console'));
    }
  }

  /**
   * Policy: Proposal (quotes table) rows must never be deleted. Only child data (material_workbooks,
   * custom_financial_rows, subcontractor_estimates) may be replaced when restoring/copying into an existing quote.
   */

  /** Finds material workbooks for this job whose quote_id no longer exists (orphaned), creates a new proposal row, and reassigns those workbooks to it. Use when a proposal was accidentally deleted but materials remain. */
  async function recoverMissingProposal() {
    if (!profile?.id || !job?.id) {
      toast.error('You must be signed in to recover a proposal.');
      return;
    }
    setRecoveringProposal(true);
    try {
      const { data: jobQuotes, error: qErr } = await supabase.from('quotes').select('id').eq('job_id', job.id);
      if (qErr) throw qErr;
      const quoteIds = new Set((jobQuotes || []).map((q: any) => q.id));

      const { data: workbooks, error: wbErr } = await supabase
        .from('material_workbooks')
        .select('id, quote_id')
        .eq('job_id', job.id);
      if (wbErr) throw wbErr;

      const orphaned = (workbooks || []).filter((wb: any) => wb.quote_id && !quoteIds.has(wb.quote_id));
      if (orphaned.length === 0) {
        toast.info('No missing proposal data found. All workbooks are already linked to a proposal.');
        setRecoveringProposal(false);
        return;
      }

      const { data: rpcData, error: rpcErr } = await supabase.rpc('create_proposal_version', {
        p_quote_id: null,
        p_job_id: job.id,
        p_user_id: profile.id,
        p_change_notes: 'Recovered proposal (materials were orphaned)',
      });
      if (rpcErr) throw rpcErr;
      const newQuoteId = (rpcData as any)?.quote_id;
      if (!newQuoteId) throw new Error('No quote_id returned from create_proposal_version');

      const { error: updateErr } = await supabase
        .from('material_workbooks')
        .update({ quote_id: newQuoteId, updated_at: new Date().toISOString() })
        .in('id', orphaned.map((w: any) => w.id));
      if (updateErr) throw updateErr;

      await loadQuoteData();
      const newQuote = (await supabase.from('quotes').select('*').eq('id', newQuoteId).single()).data;
      if (newQuote) {
        setQuote(newQuote);
        userSelectedQuoteIdRef.current = newQuote.id;
        await loadData(false, newQuote);
      }
      toast.success(`Recovered proposal with ${orphaned.length} workbook(s). It appears as a new proposal in the list.`);
    } catch (e: any) {
      console.error('Recover proposal failed:', e);
      toast.error('Recover failed: ' + (e?.message || 'see console'));
    } finally {
      setRecoveringProposal(false);
    }
  }

  /** Deletes a proposal (quote) and all its data. Only allowed when job has more than one proposal. */
  async function deleteProposal(quoteIdToDelete: string) {
    if (allJobQuotes.length <= 1) {
      toast.error('Cannot delete the only proposal. A job must have at least one proposal.');
      return;
    }
    const q = allJobQuotes.find((x: any) => x.id === quoteIdToDelete);
    const label = q ? `Proposal #${q.proposal_number || q.quote_number || q.id}` : 'This proposal';
    if (!confirm(`Delete ${label}? All materials, financial rows, and subcontractor estimates for this proposal will be permanently removed.\n\nThis cannot be undone.`)) {
      return;
    }
    try {
      // Prefer server RPC so delete works even with RLS (migration: 20250312000000_delete_proposal_rpc.sql)
      const { data: rpcData, error: rpcError } = await supabase.rpc('delete_proposal', { p_quote_id: quoteIdToDelete });
      if (!rpcError && rpcData?.ok === true) {
        const remaining = allJobQuotes.filter((x: any) => x.id !== quoteIdToDelete);
        setAllJobQuotes(remaining);
        const switchTo = remaining[0];
        setQuote(switchTo);
        userSelectedQuoteIdRef.current = switchTo.id;
        await loadQuoteData();
        await loadData(false, switchTo);
        onQuoteChange?.(switchTo?.id ?? null);
        toast.success('Proposal deleted.');
        return;
      }
      // Fallback: client-side deletes (if RPC missing or failed, e.g. permission)
      let err: any = rpcError || null;
      if (rpcError) console.warn('delete_proposal RPC failed, trying client-side deletes:', rpcError.message);

      err = (await supabase.from('proposal_versions').delete().eq('quote_id', quoteIdToDelete)).error;
      if (err) throw err;

      const { data: existingRows } = await supabase.from('custom_financial_rows').select('id').eq('quote_id', quoteIdToDelete);
      const rowIds = (existingRows || []).map((r: any) => r.id);
      if (rowIds.length > 0) {
        err = (await supabase.from('custom_financial_row_items').delete().in('row_id', rowIds)).error;
        if (err) throw err;
        err = (await supabase.from('custom_financial_rows').delete().eq('quote_id', quoteIdToDelete)).error;
        if (err) throw err;
      }

      const { data: existingWbs } = await supabase.from('material_workbooks').select('id').eq('quote_id', quoteIdToDelete);
      const wbIds = (existingWbs || []).map((x: any) => x.id);
      if (wbIds.length > 0) {
        const { data: allSheets } = await supabase.from('material_sheets').select('id').in('workbook_id', wbIds);
        const sheetIds = (allSheets || []).map((s: any) => s.id);
        if (sheetIds.length > 0) {
          err = (await supabase.from('material_items').delete().in('sheet_id', sheetIds)).error;
          if (err) throw err;
          err = (await supabase.from('material_sheet_labor').delete().in('sheet_id', sheetIds)).error;
          if (err) throw err;
          err = (await supabase.from('material_category_markups').delete().in('sheet_id', sheetIds)).error;
          if (err) throw err;
          err = (await supabase.from('custom_financial_row_items').delete().in('sheet_id', sheetIds)).error;
          if (err) throw err;
          err = (await supabase.from('material_sheets').delete().in('workbook_id', wbIds)).error;
          if (err) throw err;
        }
        err = (await supabase.from('material_workbooks').delete().eq('quote_id', quoteIdToDelete)).error;
        if (err) throw err;
      }

      const { data: existingEsts } = await supabase.from('subcontractor_estimates').select('id').eq('quote_id', quoteIdToDelete);
      const estIds = (existingEsts || []).map((e: any) => e.id);
      if (estIds.length > 0) {
        err = (await supabase.from('subcontractor_estimate_line_items').delete().in('estimate_id', estIds)).error;
        if (err) throw err;
        err = (await supabase.from('subcontractor_estimates').delete().eq('quote_id', quoteIdToDelete)).error;
        if (err) throw err;
      }

      err = (await supabase.from('quotes').delete().eq('id', quoteIdToDelete)).error;
      if (err) throw err;

      const remaining = allJobQuotes.filter((x: any) => x.id !== quoteIdToDelete);
      setAllJobQuotes(remaining);
      const switchTo = remaining[0];
      setQuote(switchTo);
      userSelectedQuoteIdRef.current = switchTo.id;
      await loadQuoteData();
      await loadData(false, switchTo);
      onQuoteChange?.(switchTo?.id ?? null);
      toast.success('Proposal deleted.');
    } catch (e: any) {
      console.error('Delete proposal failed:', e);
      const msg = e?.message || (e?.error_description) || String(e);
      toast.error(msg.includes('policy') || msg.includes('RLS') || msg.includes('row-level')
        ? 'Permission denied. You may not have permission to delete proposals.'
        : 'Failed to delete proposal: ' + msg);
    }
  }

  /** Copies all proposal data (workbook, sheets, items, financial rows, subs) from source quote to target. DELETES existing data for target quote. Only call after explicit user confirmation. */
  async function copyProposalDataFromQuoteToQuote(
    sourceQuoteId: string,
    targetJobId: string,
    targetQuoteId: string
  ) {
    if (!profile?.id) return;
    const sheetIdMap: Record<string, string> = {};
    const rowIdMap: Record<string, string> = {};

    const { data: existingRows } = await supabase.from('custom_financial_rows').select('id').eq('quote_id', targetQuoteId);
    const rowIds = (existingRows || []).map((r: any) => r.id);
    if (rowIds.length > 0) {
      await supabase.from('custom_financial_row_items').delete().in('row_id', rowIds);
      await supabase.from('custom_financial_rows').delete().eq('quote_id', targetQuoteId);
    }
    const { data: existingWbs } = await supabase.from('material_workbooks').select('id').eq('quote_id', targetQuoteId);
    for (const wb of existingWbs || []) {
      const { data: sheets } = await supabase.from('material_sheets').select('id').eq('workbook_id', wb.id);
      for (const sh of sheets || []) {
        await supabase.from('material_items').delete().eq('sheet_id', sh.id);
        await supabase.from('material_sheet_labor').delete().eq('sheet_id', sh.id);
        await supabase.from('material_category_markups').delete().eq('sheet_id', sh.id);
      }
      if (sheets?.length) await supabase.from('material_sheets').delete().eq('workbook_id', wb.id);
    }
    if (existingWbs?.length) await supabase.from('material_workbooks').delete().eq('quote_id', targetQuoteId);
    const { data: existingEsts } = await supabase.from('subcontractor_estimates').select('id').eq('quote_id', targetQuoteId);
    const estIds = (existingEsts || []).map((e: any) => e.id);
    if (estIds.length > 0) {
      await supabase.from('subcontractor_estimate_line_items').delete().in('estimate_id', estIds);
      await supabase.from('subcontractor_estimates').delete().eq('quote_id', targetQuoteId);
    }

    const { data: oldWorkbooks } = await supabase.from('material_workbooks').select('*').eq('quote_id', sourceQuoteId);
    const { data: maxWb } = await supabase.from('material_workbooks').select('version_number').eq('job_id', targetJobId).order('version_number', { ascending: false }).limit(1).maybeSingle();
    let nextWbVersion = (maxWb?.version_number ?? 0) + 1;

    for (const wb of oldWorkbooks || []) {
      const { data: newWb, error: wbErr } = await supabase.from('material_workbooks').insert({
        job_id: targetJobId, quote_id: targetQuoteId, version_number: nextWbVersion++, status: 'working', created_by: profile.id,
      }).select('id').single();
      if (wbErr || !newWb) continue;
      const { data: oldSheets } = await supabase.from('material_sheets').select('*').eq('workbook_id', wb.id).order('order_index');
      for (const sheet of oldSheets || []) {
        const { data: newSheet, error: shErr } = await supabase.from('material_sheets').insert({
          workbook_id: newWb.id, sheet_name: sheet.sheet_name, order_index: sheet.order_index, is_option: sheet.is_option, description: sheet.description,
        }).select('id').single();
        if (shErr || !newSheet) continue;
        sheetIdMap[sheet.id] = newSheet.id;
        const { data: items } = await supabase.from('material_items').select('*').eq('sheet_id', sheet.id).order('order_index');
        if (items?.length) await supabase.from('material_items').insert(items.map(({ id: _i, sheet_id: _s, created_at: _c, updated_at: _u, ...r }: any) => ({ ...r, sheet_id: newSheet.id })));
        const { data: labor } = await supabase.from('material_sheet_labor').select('*').eq('sheet_id', sheet.id);
        if (labor?.length) await supabase.from('material_sheet_labor').insert(labor.map(({ id: _i, sheet_id: _s, created_at: _c, updated_at: _u, ...r }: any) => ({ ...r, sheet_id: newSheet.id })));
        const { data: markups } = await supabase.from('material_category_markups').select('*').eq('sheet_id', sheet.id);
        if (markups?.length) await supabase.from('material_category_markups').insert(markups.map(({ id: _i, sheet_id: _s, created_at: _c, updated_at: _u, ...r }: any) => ({ ...r, sheet_id: newSheet.id })));
      }
    }

    const { data: oldRows } = await supabase.from('custom_financial_rows').select('*').eq('quote_id', sourceQuoteId).order('order_index');
    for (const row of oldRows || []) {
      const { data: newRow, error: rErr } = await supabase.from('custom_financial_rows').insert({
        job_id: targetJobId, quote_id: targetQuoteId, category: row.category, description: row.description,
        quantity: row.quantity, unit_cost: row.unit_cost, total_cost: row.total_cost, markup_percent: row.markup_percent,
        selling_price: row.selling_price, notes: row.notes, order_index: row.order_index, taxable: row.taxable,
        sheet_id: row.sheet_id ? (sheetIdMap[row.sheet_id] ?? null) : null,
      }).select('id').single();
      if (rErr || !newRow) continue;
      rowIdMap[row.id] = newRow.id;
      const { data: rItems } = await supabase.from('custom_financial_row_items').select('*').eq('row_id', row.id).order('order_index');
      if (rItems?.length) {
        await supabase.from('custom_financial_row_items').insert(rItems.map(({ id: _i, row_id: _r, sheet_id: oldSid, created_at: _c, updated_at: _u, ...r }: any) => ({
          ...r, row_id: newRow.id, sheet_id: oldSid ? (sheetIdMap[oldSid] ?? null) : null,
        })));
      }
    }
    const oldSheetIdList = Object.keys(sheetIdMap);
    if (oldSheetIdList.length > 0) {
      const { data: sItems } = await supabase.from('custom_financial_row_items').select('*').in('sheet_id', oldSheetIdList).is('row_id', null);
      if (sItems?.length) {
        await supabase.from('custom_financial_row_items').insert(sItems.map(({ id: _i, row_id: _r, sheet_id: oldSid, created_at: _c, updated_at: _u, ...r }: any) => ({
          ...r, row_id: null, sheet_id: oldSid ? (sheetIdMap[oldSid] ?? null) : null,
        })));
      }
    }

    const { data: oldEstimates } = await supabase.from('subcontractor_estimates').select('*').eq('quote_id', sourceQuoteId).order('order_index');
    for (const est of oldEstimates || []) {
      const { id: _i, job_id: _j, quote_id: _q, sheet_id: es, row_id: er, created_at: _c, updated_at: _u, ...rest } = est;
      const { data: newEst, error: eErr } = await supabase.from('subcontractor_estimates').insert({
        ...rest, job_id: targetJobId, quote_id: targetQuoteId,
        sheet_id: es ? (sheetIdMap[es] ?? null) : null, row_id: er ? (rowIdMap[er] ?? null) : null,
      }).select('id').single();
      if (eErr || !newEst) continue;
      const { data: slItems } = await supabase.from('subcontractor_estimate_line_items').select('*').eq('estimate_id', est.id).order('order_index');
      if (slItems?.length) await supabase.from('subcontractor_estimate_line_items').insert(slItems.map(({ id: _i2, estimate_id: _e, created_at: _c2, updated_at: _u2, ...r }: any) => ({ ...r, estimate_id: newEst.id })));
    }

    toast.success('Materials and proposal data restored from Proposal #26019-1.');
  }

  async function loadQuoteData(): Promise<any> {
    try {
      let quoteData: any = null;
      
      // Single query: load ALL quotes for this job (tax_exempt is in * when column exists)
      const { data: allQuotes, error: allQuotesError } = await supabase
        .from('quotes')
        .select('*')
        .eq('job_id', job.id)
        .order('created_at', { ascending: false });
      
      if (allQuotesError) {
        console.error('Error loading all quotes:', allQuotesError);
        return undefined;
      }
      
      let quotesList: any[] = allQuotes || [];

      // Always merge tax_exempt from RPC so saved value persists (API may not expose column or may cache)
      if (quotesList.length > 0) {
        const { data: taxRows, error: taxErr } = await supabase.rpc('get_job_quotes_tax_exempt', { p_job_id: job.id });
        if (!taxErr && Array.isArray(taxRows) && taxRows.length > 0) {
          const byId = new Map((taxRows as { quote_id: string; tax_exempt: boolean }[]).map((r) => [r.quote_id, r.tax_exempt]));
          quotesList = quotesList.map((q: any) => (byId.has(q.id) ? { ...q, tax_exempt: byId.get(q.id) } : q));
        }
      }

      // Sort so highest proposal number is first (e.g. 26012-3 before 26012-2 before 26012-1) so job open shows latest proposal data
      quotesList.sort((a: any, b: any) => {
        const na = (a.proposal_number || a.quote_number || '').toString();
        const nb = (b.proposal_number || b.quote_number || '').toString();
        if (na === nb) return 0;
        return nb.localeCompare(na, undefined, { numeric: true });
      });

      setAllJobQuotes(quotesList);

      // When job already has quotes, use that list. Prefer user-selected; else default to first (highest proposal number).
      if (quotesList.length > 0) {
        if (userSelectedQuoteIdRef.current) {
          const selectedQuote = quotesList.find((q: any) => q.id === userSelectedQuoteIdRef.current);
          quoteData = selectedQuote ?? quotesList[0];
          if (!selectedQuote) userSelectedQuoteIdRef.current = quoteData.id;
        } else if (!quote) {
          quoteData = quotesList[0];
          userSelectedQuoteIdRef.current = quoteData.id;
        } else {
          const fromList = quotesList.find((q: any) => q.id === quote.id);
          quoteData = fromList ?? quote;
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

  /** Creates a new proposal (empty or cloned from a template). Existing proposals are never deleted or modified. */
  async function createNewProposal() {
    if (!profile) return;
    setCreatingProposal(true);

    const safetyTimeoutMs = 90000; // 90s max so loading never sticks forever
    const safetyTimer = setTimeout(() => {
      setCreatingProposal(false);
      toast.error('Proposal create took too long; you may need to refresh.');
    }, safetyTimeoutMs);

    try {
      // ── Start from blank: RPC creates new empty quote (no template) ──
      if (templateQuoteIdForNewProposal === null) {
        const { data: rpcData, error: rpcErr } = await supabase.rpc('create_proposal_version', {
          p_quote_id: null,
          p_job_id: job.id,
          p_user_id: profile.id,
          p_change_notes: proposalChangeNotes || 'New proposal (empty)',
        });
        if (rpcErr) throw new Error(rpcErr.message);
        const newQuoteId = (rpcData as any)?.quote_id;
        if (!newQuoteId) throw new Error('No quote_id returned');
        const { data: newQuote, error: fetchError } = await supabase.from('quotes').select('*').eq('id', newQuoteId).single();
        if (fetchError) throw fetchError;
        // Keep job tax-exempt: if any existing quote for this job is tax exempt, set the new quote too
        const jobTaxExempt = allJobQuotes.some((q: any) => q.tax_exempt === true) || (quote?.tax_exempt === true);
        if (jobTaxExempt && !(newQuote as any).tax_exempt) {
          await supabase.from('quotes').update({ tax_exempt: true }).eq('id', newQuoteId);
          (newQuote as any).tax_exempt = true;
        }
        setQuote(newQuote);
        userSelectedQuoteIdRef.current = newQuote.id;
        toast.success(`New proposal ${newQuote.proposal_number} created. You can add materials and rows.`);
        setShowCreateProposalDialog(false);
        setProposalChangeNotes('');
        setTemplateQuoteIdForNewProposal(quote?.id ?? null);
        clearTimeout(safetyTimer);
        setCreatingProposal(false);
        await loadQuoteData();
        await loadData(false, newQuote);
        return;
      }

      // ── Use selected proposal as template (clone without affecting the template) ──
      const sourceQuote = allJobQuotes.find((q: any) => q.id === templateQuoteIdForNewProposal) ?? (quote?.id === templateQuoteIdForNewProposal ? quote : null);
      if (!sourceQuote) {
        toast.error('Selected template not found.');
        clearTimeout(safetyTimer);
        setCreatingProposal(false);
        return;
      }
      const oldQuoteId = templateQuoteIdForNewProposal;
      const isCloningCurrent = oldQuoteId === quote?.id;

      // ── Step 0: When cloning current proposal, persist any in-memory labor (and ensure source is saved) so copy uses latest data ──
      if (isCloningCurrent) {
        try {
          // Persist labor currently in the Add/Edit Labor dialog if open for a sheet (so unsaved labor is included in copy)
          if (editingLaborSheetId && laborForm) {
            const laborData = {
              sheet_id: editingLaborSheetId,
              description: laborForm.description ?? null,
              estimated_hours: laborForm.estimated_hours ?? 0,
              hourly_rate: laborForm.hourly_rate ?? 0,
              notes: laborForm.notes ?? null,
            };
            const existing = sheetLabor[editingLaborSheetId];
            if (existing?.id) {
              await supabase.from('material_sheet_labor').update(laborData).eq('id', existing.id);
            } else {
              await supabase.from('material_sheet_labor').insert([laborData]);
            }
          }
          for (const sheet of materialSheets) {
            const sheetId = sheet.id ?? sheet.sheetId;
            if (!sheetId) continue;
            const labor = sheetLabor[sheetId];
            if (!labor) continue;
            const laborData = {
              sheet_id: sheetId,
              description: labor.description ?? null,
              estimated_hours: labor.estimated_hours ?? 0,
              hourly_rate: labor.hourly_rate ?? 0,
              notes: labor.notes ?? null,
            };
            if (labor.id) {
              await supabase.from('material_sheet_labor').update(laborData).eq('id', labor.id);
            } else {
              await supabase.from('material_sheet_labor').insert([laborData]);
            }
          }
        } catch (e) {
          console.warn('Persist source labor before copy (non-fatal):', e);
        }
      }

      // ── Step 1: Create the new quotes row (from template quote data) ──
      const quotePayload: Record<string, unknown> = {
        job_id: job.id,
        customer_name:    (sourceQuote as any).customer_name    ?? null,
        customer_address: (sourceQuote as any).customer_address ?? null,
        customer_email:   (sourceQuote as any).customer_email   ?? null,
        customer_phone:   (sourceQuote as any).customer_phone   ?? null,
        project_name:     (sourceQuote as any).project_name     ?? null,
        width:            (sourceQuote as any).width             ?? 0,
        length:           (sourceQuote as any).length            ?? 0,
        status:           'draft',
        created_by:       profile.id,
        estimated_price:  (sourceQuote as any).estimated_price   ?? null,
        tax_exempt:       (sourceQuote as any).tax_exempt === true,
      };
      const payloadWithDescription = { ...quotePayload, description: (sourceQuote as any).description ?? null };
      let result = await supabase.from('quotes').insert(payloadWithDescription).select().single();
      if (result.error && /description.*schema cache|column.*description/i.test(result.error.message)) {
        result = await supabase.from('quotes').insert(quotePayload).select().single();
      }
      if (result.error && /tax_exempt|schema cache|column.*tax_exempt/i.test(result.error.message)) {
        const { tax_exempt: _te, ...payloadWithoutTaxExempt } = quotePayload as Record<string, unknown>;
        result = await supabase.from('quotes').insert(payloadWithoutTaxExempt).select().single();
      }
      const quoteErr = result.error;
      const newQuoteRow = result.data;
      if (quoteErr || !newQuoteRow) throw new Error(`Step 1 (create quote): ${quoteErr?.message ?? 'No data returned'}`);
      const newQuoteId: string = newQuoteRow.id;
      console.log('✅ Step 1 — new quote row created:', newQuoteRow.proposal_number);

      // ── Step 2: Copy material_workbooks → sheets → items / labor / markups (single snapshot, no further reads of source) ──
      const sheetIdMap: Record<string, string> = {};
      const snapshotSheets: any[]                          = [];
      const snapshotCategoryMarkups: Record<string, number> = {};
      const snapshotSheetLabor: any[]                      = [];

      const wbSelect = `
        id,
        material_sheets (
          id, sheet_name, order_index, is_option, description,
          material_items (*),
          material_sheet_labor (*),
          material_category_markups (*)
        )
      `;
      const { data: oldWorkbooksFull, error: wbFetchErr } = await supabase
        .from('material_workbooks')
        .select(wbSelect)
        .eq('quote_id', oldQuoteId);
      if (wbFetchErr) throw new Error(`Step 2 (fetch workbooks): ${wbFetchErr.message}`);

      const { data: maxWbRow } = await supabase
        .from('material_workbooks')
        .select('version_number')
        .eq('job_id', job.id)
        .order('version_number', { ascending: false })
        .limit(1)
        .maybeSingle();
      let nextWbVersion = (maxWbRow?.version_number ?? 0) + 1;

      for (const wb of (oldWorkbooksFull || [])) {
        const { data: newWb, error: wbErr } = await supabase
          .from('material_workbooks')
          .insert({ job_id: job.id, quote_id: newQuoteId, version_number: nextWbVersion++, status: 'working', created_by: profile.id })
          .select('id').single();
        if (wbErr) throw new Error(`Step 2 (insert workbook): ${wbErr.message}`);

        const oldSheets = ((wb as any).material_sheets || []).slice().sort((a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0));
        for (const sheet of oldSheets) {
          const { data: newSheet, error: shErr } = await supabase
            .from('material_sheets')
            .insert({ workbook_id: newWb.id, sheet_name: sheet.sheet_name, order_index: sheet.order_index, is_option: sheet.is_option, description: sheet.description })
            .select('id').single();
          if (shErr) throw new Error(`Step 2 (insert sheet): ${shErr.message}`);
          sheetIdMap[sheet.id] = newSheet.id;

          const items = (sheet.material_items || []).slice().sort((a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0));
          if (items.length) {
            const { error: iErr } = await supabase.from('material_items').insert(
              items.map(({ id: _id, sheet_id: _sid, created_at: _ca, updated_at: _ua, ...r }) => ({ ...r, sheet_id: newSheet.id }))
            );
            if (iErr) throw new Error(`Step 2 (insert items): ${iErr.message}`);
          }

          const labor = sheet.material_sheet_labor || [];
          if (labor.length) {
            const { error: lErr } = await supabase.from('material_sheet_labor').insert(
              labor.map(({ id: _id, sheet_id: _sid, created_at: _ca, updated_at: _ua, ...r }: any) => ({ ...r, sheet_id: newSheet.id }))
            );
            if (lErr) throw new Error(`Step 2 (insert labor): ${lErr.message}`);
            labor.forEach((l: any) => snapshotSheetLabor.push({ ...l, sheet_id: sheet.id }));
          }

          const markups = sheet.material_category_markups || [];
          if (markups.length) {
            const { error: mErr } = await supabase.from('material_category_markups').insert(
              markups.map(({ id: _id, sheet_id: _sid, created_at: _ca, updated_at: _ua, ...r }: any) => ({ ...r, sheet_id: newSheet.id }))
            );
            if (mErr) throw new Error(`Step 2 (insert markups): ${mErr.message}`);
            markups.forEach((m: any) => { snapshotCategoryMarkups[`${sheet.id}_${m.category_name}`] = m.markup_percent; });
          }

          snapshotSheets.push({
            id: sheet.id, sheet_name: sheet.sheet_name, order_index: sheet.order_index,
            is_option: sheet.is_option, description: sheet.description,
            items,
          });
        }
      }
      console.log(`✅ Step 2 — copied ${Object.keys(sheetIdMap).length} sheets`);

      // (No lock of source proposal — leave template proposal completely unchanged so all data stays intact.)

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

      // ── Step 5: Save frozen snapshot only when cloning current proposal (not when using another as template) ──
      if (isCloningCurrent) {
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
      }

      // ── Step 6: Reload and switch UI to the new proposal ──
      const { data: newQuote, error: fetchError } = await supabase
        .from('quotes').select('*').eq('id', newQuoteId).single();
      if (fetchError) throw new Error(`Step 6 (load new quote): ${fetchError.message}`);

      setQuote(newQuote);
      userSelectedQuoteIdRef.current = newQuote.id;
      toast.success(`New proposal ${newQuote.proposal_number} created with independent data`);
      setShowCreateProposalDialog(false);
      setProposalChangeNotes('');
      setTemplateQuoteIdForNewProposal(quote?.id ?? null);
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
  async function navigateToFirstProposal() {
    if (allJobQuotes.length === 0) return;
    const firstQuote = allJobQuotes[0];
    if (quote?.id === firstQuote.id) return;
    setQuote(firstQuote);
    userSelectedQuoteIdRef.current = firstQuote.id;
    await loadData(false, firstQuote);
  }

  async function navigateToPreviousProposal() {
    if (allJobQuotes.length === 0) return;

    const currentIndex = allJobQuotes.findIndex(q => q.id === quote?.id);
    if (currentIndex < allJobQuotes.length - 1) {
      const olderQuote = allJobQuotes[currentIndex + 1];
      setQuote(olderQuote);
      userSelectedQuoteIdRef.current = olderQuote.id;
      // Pass olderQuote explicitly — avoids stale closure on quote state
      await loadData(false, olderQuote);
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
    }
  }

  async function navigateToProposal(selectedQuote: any) {
    if (!selectedQuote || selectedQuote.id === quote?.id) return;
    setQuote(selectedQuote);
    userSelectedQuoteIdRef.current = selectedQuote.id;
    await loadData(false, selectedQuote);
  }

  async function unlockHistoricalForEditing() {
    if (!quote || !isDefaultLocked) return;
    setHistoricalUnlockedQuoteId(quote.id);
    await loadData(false, quote, { forceLive: true });
    toast.success('Editing enabled for this proposal. Changes save to this proposal.');
  }

  function lockHistoricalAgain() {
    if (!quote) return;
    setHistoricalUnlockedQuoteId(null);
    setTimeout(() => loadData(false, quote), 0);
    toast.info('Proposal locked. Viewing read-only.');
  }

  async function lockProposalForEditing() {
    if (!quote?.id) return;
    const { error } = await supabase
      .from('quotes')
      .update({ locked_for_editing: true })
      .eq('id', quote.id);
    if (error) {
      console.error('Error locking proposal:', error);
      toast.error('Failed to lock. If the column is missing, run in Supabase SQL Editor: ALTER TABLE quotes ADD COLUMN IF NOT EXISTS locked_for_editing boolean DEFAULT false;');
      return;
    }
    await loadQuoteData();
    toast.success('Proposal locked for all users. Click Unlock to allow editing again.');
  }

  async function unlockProposalForEditing() {
    if (!quote?.id) return;
    const { error } = await supabase
      .from('quotes')
      .update({ locked_for_editing: false })
      .eq('id', quote.id);
    if (error) {
      console.error('Error unlocking proposal:', error);
      toast.error('Failed to unlock.');
      return;
    }
    await loadQuoteData();
    toast.success('Proposal unlocked. Edits are allowed for all users.');
  }

  function handleLockUnlock() {
    if (!quote) return;
    if (isReadOnly) {
      if ((quote as any).sent_at) {
        toast.info('Cannot unlock a proposal that has been sent to the customer.');
        return;
      }
      if ((quote as any).locked_for_editing) {
        unlockProposalForEditing();
        return;
      }
      unlockHistoricalForEditing();
    } else {
      lockProposalForEditing();
    }
  }

  async function loadData(silent = false, targetQuote?: any, options?: { forceLive?: boolean }) {
    // targetQuote must be passed explicitly from navigation functions to avoid
    // the stale-closure bug: setQuote() is async, so `quote` state hasn't
    // committed by the time the load functions run. When undefined (polling),
    // we fall back to the current `quote` state — which is acceptable for
    // polling since no navigation is in flight.
    const effectiveQuote = targetQuote !== undefined ? targetQuote : quote;
    const targetQuoteId: string | null = effectiveQuote?.id ?? null;

    // When user has unlocked a historical proposal for editing, load live data for it (or forceLive for this load)
    const isHistorical = !options?.forceLive && !!effectiveQuote
      && allJobQuotes.length > 0
      && effectiveQuote.id !== allJobQuotes[0]?.id
      && effectiveQuote.id !== historicalUnlockedQuoteId;

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
      // Locked/historical proposals: always load live data so subcontractor rows and pricing always show
      if (isHistorical && targetQuoteId) {
        console.log('📝 Loading live subcontractors for locked/historical proposal');
        isHistorical = false;
      }
      if (false && isHistorical && targetQuoteId) {
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
          isHistorical = false;
        } else {
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
      }
      
      // Live path: load estimates for this proposal OR job-level uploads (quote_id null) so subs
      // uploaded by another user or without a proposal selected appear in the proposal
      let rawData: any[] = [];
      if (targetQuoteId) {
        const [forQuote, forJob] = await Promise.all([
          supabase.from('subcontractor_estimates').select('*, subcontractor_estimate_line_items(*)').eq('quote_id', targetQuoteId).order('order_index'),
          supabase.from('subcontractor_estimates').select('*, subcontractor_estimate_line_items(*)').eq('job_id', job.id).is('quote_id', null).order('order_index'),
        ]);
        if (forQuote.error) throw forQuote.error;
        if (forJob.error) throw forJob.error;
        const quoteIds = new Set((forQuote.data || []).map((e: any) => e.id));
        const jobOnly = (forJob.data || []).filter((e: any) => !quoteIds.has(e.id));
        rawData = [...(forQuote.data || []), ...jobOnly];
      } else {
        const { data, error } = await supabase
          .from('subcontractor_estimates')
          .select('*, subcontractor_estimate_line_items(*)')
          .eq('job_id', job.id)
          .order('order_index');
        if (error) throw error;
        rawData = data || [];
      }

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

  async function loadMaterialsData(targetQuoteId: string | null = null, isHistorical: boolean = false, overlayOverride?: Record<string, boolean>) {
    const wasHistoricalRequest = isHistorical;
    try {
      // Historical (locked/older) proposals: always load live data from DB so labor and materials
      // always show. Snapshots created when cloning can be incomplete and hide labor/subs.
      if (isHistorical && targetQuoteId) {
        console.log('📝 Loading live materials for locked/historical proposal so labor and rows show');
        isHistorical = false;
      }
      if (false && isHistorical && targetQuoteId) {
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
          isHistorical = false;
        } else {
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
        
        // Load sheet labor from snapshot first
        const laborMap: Record<string, any> = {};
        if (snapshot.sheet_labor) {
          snapshot.sheet_labor.forEach((labor: any) => {
            laborMap[labor.sheet_id] = labor;
          });
        }
        // Supplement with live labor from DB so labor does not disappear when viewing a locked proposal
        const sheetIds = sheetsData.map((s: any) => s.id).filter(Boolean);
        if (sheetIds.length > 0) {
          const { data: liveLaborRows } = await supabase
            .from('material_sheet_labor')
            .select('*')
            .in('sheet_id', sheetIds);
          (liveLaborRows || []).forEach((labor: any) => {
            const total = labor.total_labor_cost ?? (Number(labor.estimated_hours || 0) * Number(labor.hourly_rate || 0));
            laborMap[labor.sheet_id] = { ...labor, total_labor_cost: total };
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
          
          // Calculate totals per category (exclude optional line items from totals)
          const categories = Array.from(categoryMap.entries()).map(([categoryName, items]) => {
            const totalCost = items
              .filter((item: any) => !(item.is_optional === true))
              .reduce((sum, item) => sum + (item.cost_per_unit || 0) * (item.quantity || 0), 0);
            const totalPrice = items
              .filter((item: any) => !(item.is_optional === true))
              .reduce((sum, item) => sum + (item.price_per_unit || 0) * (item.quantity || 0), 0);
            
            const profit = totalPrice - totalCost;
            const margin = totalPrice > 0 ? (profit / totalPrice) * 100 : 0;
            
            return {
              name: categoryName,
              itemCount: items.length,
              items: items.map((item: any) => ({
                id: item.id,
                isOptional: item.is_optional ?? false,
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
            isOptional: sheet.is_option ?? false,
            compareToSheetId: sheet.compare_to_sheet_id ?? null,
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
      }
      
      // Air-gap: when a quote is active load ONLY by quote_id; fall back to job_id only when no quote.
      console.log('📝 Loading live materials data');
      const hasQuote = targetQuoteId != null && targetQuoteId !== '';
      let workbookData: any = null;
      let workbookError: any = null;

      if (hasQuote) {
        const wbSelect = `
          id,
          material_sheets (
            *,
            material_items (*),
            material_sheet_labor (*),
            material_category_markups (*)
          )
        `;
        // For historical (locked) proposals when loading live (no snapshot), fetch workbook without status filter so we get the locked workbook and its labor
        if (wasHistoricalRequest) {
          const { data, error } = await supabase
            .from('material_workbooks')
            .select(wbSelect)
            .eq('quote_id', targetQuoteId)
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          workbookData = data;
          workbookError = error;
        } else {
          // Use newest working workbook for this quote (so re-uploaded workbook wins over copied-from-template)
          let { data, error } = await supabase
            .from('material_workbooks')
            .select(wbSelect)
            .eq('quote_id', targetQuoteId)
            .eq('status', 'working')
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          workbookData = data;
          workbookError = error;
          if (!workbookData && !workbookError) {
            const fallback = await supabase
              .from('material_workbooks')
              .select(wbSelect)
              .eq('quote_id', targetQuoteId)
              .order('updated_at', { ascending: false })
              .limit(1)
              .maybeSingle();
            workbookData = fallback.data;
          }
        }
        if (!workbookData) {
          const copied = await copyJobWorkbookToQuote(job.id, targetQuoteId);
          if (copied) workbookData = copied;
        }
        // If proposal workbook is empty (no sheets/items), use a job workbook that has content so material prices are in the proposal
        const sheetsFromWb = workbookData?.material_sheets || [];
        const itemCount = sheetsFromWb.reduce((n: number, s: any) => n + ((s.material_items || []).length), 0);
        if (workbookData && (sheetsFromWb.length === 0 || itemCount === 0)) {
          const { data: allJobWbs } = await supabase
            .from('material_workbooks')
            .select(wbSelect)
            .eq('job_id', job.id)
            .order('updated_at', { ascending: false });
          const list = allJobWbs || [];
          for (const wb of list) {
            const wbSheets = wb?.material_sheets || [];
            const wbItemCount = wbSheets.reduce((n: number, s: any) => n + ((s.material_items || []).length), 0);
            if (wbItemCount > 0) {
              workbookData = wb;
              break;
            }
          }
        }
      } else {
        const { data, error } = await supabase
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
          .eq('status', 'working')
          .maybeSingle();
        workbookData = data;
        workbookError = error;
      }

      if (workbookError) throw workbookError;
      // Air-gap: never load job-level workbook when a quote is active — each proposal stays isolated
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

      // Build labor map from nested data (include total_labor_cost so UI displays correctly)
      const laborMap: Record<string, any> = {};
      sheetsData.forEach((sheet: any) => {
        (sheet.material_sheet_labor || []).forEach((labor: any) => {
          const total = labor.total_labor_cost ?? (Number(labor.estimated_hours || 0) * Number(labor.hourly_rate || 0));
          laborMap[labor.sheet_id] = { ...labor, total_labor_cost: total };
        });
      });
      // For locked/sent proposals, nested material_sheet_labor may be missing; supplement from DB so labor always shows
      const sheetIdsForLabor = sheetsData.map((s: any) => s.id).filter(Boolean);
      if (sheetIdsForLabor.length > 0 && Object.keys(laborMap).length === 0) {
        const { data: liveLaborRows } = await supabase
          .from('material_sheet_labor')
          .select('*')
          .in('sheet_id', sheetIdsForLabor);
        (liveLaborRows || []).forEach((labor: any) => {
          const total = labor.total_labor_cost ?? (Number(labor.estimated_hours || 0) * Number(labor.hourly_rate || 0));
          laborMap[labor.sheet_id] = { ...labor, total_labor_cost: total };
        });
      }
      // Merge in any existing sheet labor not in fetch (e.g. just-saved row not yet visible) so it doesn't glitch away
      setSheetLabor(prev => {
        const next = { ...laborMap };
        if (prev && typeof prev === 'object') {
          Object.keys(prev).forEach(sid => {
            if (!(sid in next)) next[sid] = prev[sid];
          });
        }
        return next;
      });

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

      // Optional-by-category: from DB and/or local overlay (works even if DB table missing or request fails)
      const sheetIds = (sheetsData || []).map((s: any) => s.id);
      let categoryOptionsRows: any[] = [];
      try {
        if (sheetIds.length > 0) {
          const res = await supabase.from('material_category_options').select('sheet_id, category_name, is_optional').in('sheet_id', sheetIds);
          categoryOptionsRows = res.data || [];
        }
      } catch {
        categoryOptionsRows = [];
      }
      const categoryOptionalMap = new Map<string, boolean>();
      categoryOptionsRows.forEach((r: any) => {
        categoryOptionalMap.set(`${r.sheet_id}_${r.category_name}`, !!r.is_optional);
      });
      const mergedOverlay = { ...optionalCategoryOverlay, ...(overlayOverride || {}) };
      Object.entries(mergedOverlay).forEach(([key, value]) => {
        categoryOptionalMap.set(key, value);
      });

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

        // Calculate totals per category (exclude optional categories from totals)
        const categories = Array.from(categoryMap.entries()).map(([categoryName, items]) => {
          const isCategoryOptional = categoryOptionalMap.get(`${sheet.id}_${categoryName}`) === true;
          const totalCost = isCategoryOptional ? 0 : items.reduce((sum, item) => sum + (item.cost_per_unit || 0) * (item.quantity || 0), 0);
          const totalPrice = isCategoryOptional ? 0 : items.reduce((sum, item) => sum + (item.price_per_unit || 0) * (item.quantity || 0), 0);

          const profit = totalPrice - totalCost;
          const margin = totalPrice > 0 ? (profit / totalPrice) * 100 : 0;

          return {
            name: categoryName,
            itemCount: items.length,
            items: items.map((item: any) => ({
              id: item.id,
              isOptional: isCategoryOptional,
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
          isOptional: sheet.is_option ?? false,
          compareToSheetId: sheet.compare_to_sheet_id ?? null,
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

  // Normalize description for dedupe: collapse all whitespace to single space and trim.
  function normalizeDescription(description?: string | null): string {
    return (description ?? '').trim().replace(/\s+/g, ' ');
  }

  // Frontend dedupe: group by normalized description, keep single oldest (by created_at). Used so duplicate DB rows don't affect UI or totals.
  function dedupeRowsByDescription<T extends { description?: string; created_at?: string; id?: string; order_index?: number }>(rows: T[]): T[] {
    const byDesc = new Map<string, T>();
    rows.forEach(row => {
      const desc = normalizeDescription(row.description);
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
    // Locked/historical proposals: always load live data so labor and custom rows always show
    if (isHistorical && targetQuoteId) {
      console.log('📝 Loading live custom rows for locked/historical proposal');
      isHistorical = false;
    }
    if (false && isHistorical && targetQuoteId) {
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
        isHistorical = false;
      } else {
      const snapshot = versionData.financial_rows_snapshot;
      const rowsData = Array.isArray(snapshot) ? snapshot : [];
      const dedupedRows = dedupeRowsByDescription(rowsData);
      const descToRow = new Map<string, any>();
      dedupedRows.forEach((r: any) => descToRow.set(normalizeDescription(r.description), r));
      const duplicateToSurviving: Record<string, string> = {};
      rowsData.forEach((row: any) => {
        const surviving = descToRow.get(normalizeDescription(row.description));
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
    }
    
    // Normal flow: fetch rows + their line items. When viewing a proposal, include both
    // quote-specific rows and job-level rows (quote_id null) so line items added by another
    // user or without a proposal selected appear in the proposal.
    let rawRows: any[] = [];
    if (targetQuoteId) {
      const [forQuote, forJob] = await Promise.all([
        supabase.from('custom_financial_rows').select('*, custom_financial_row_items(*)').eq('quote_id', targetQuoteId).order('order_index'),
        supabase.from('custom_financial_rows').select('*, custom_financial_row_items(*)').eq('job_id', job.id).is('quote_id', null).order('order_index'),
      ]);
      if (forQuote.error) {
        console.error('Error loading custom rows (quote):', forQuote.error);
        return;
      }
      if (forJob.error) {
        console.error('Error loading custom rows (job):', forJob.error);
        return;
      }
      const quoteIds = new Set((forQuote.data || []).map((r: any) => r.id));
      const jobOnly = (forJob.data || []).filter((r: any) => !quoteIds.has(r.id));
      rawRows = [...(forQuote.data || []), ...jobOnly];
    } else {
      const { data, error } = await supabase
        .from('custom_financial_rows')
        .select('*, custom_financial_row_items(*)')
        .eq('job_id', job.id)
        .order('order_index');
      if (error) {
        console.error('Error loading custom rows:', error);
        return;
      }
      rawRows = data || [];
    }

    // Strip nested line items out of the row objects for state
    const newData: CustomFinancialRow[] = rawRows.map((row: any) => {
      const { custom_financial_row_items: _items, ...rowData } = row;
      return rowData as CustomFinancialRow;
    });

    const dedupedRows = dedupeRowsByDescription(newData);
    const descToRow = new Map<string, CustomFinancialRow>();
    dedupedRows.forEach(r => descToRow.set(normalizeDescription(r.description), r));
    const duplicateToSurviving: Record<string, string> = {};
    newData.forEach(row => {
      const surviving = descToRow.get(normalizeDescription(row.description));
      if (surviving) duplicateToSurviving[row.id] = surviving.id;
    });

    // Only remove duplicates when loading a single proposal (targetQuoteId set). Never run when
    // loading by job_id or we would treat rows from all proposals as one set and delete valid data.
    const safeToDeleteDuplicates = !isHistorical && targetQuoteId && rawRows.length > dedupedRows.length;
    const maxAutoDelete = 50;
    if (safeToDeleteDuplicates) {
      const keepIds = new Set(dedupedRows.map(r => r.id));
      const duplicateIds = rawRows.map((r: any) => r.id).filter((id: string) => !keepIds.has(id));
      if (duplicateIds.length > 0 && duplicateIds.length <= maxAutoDelete) {
        try {
          await supabase.from('custom_financial_row_items').delete().in('row_id', duplicateIds);
          await supabase.from('custom_financial_rows').delete().in('id', duplicateIds);
          toast.success(`Removed ${duplicateIds.length} duplicate row(s).`);
        } catch (delErr: any) {
          console.error('Error removing duplicate rows:', delErr);
        }
      } else if (duplicateIds.length > maxAutoDelete) {
        console.warn(`Skipped auto-delete of ${duplicateIds.length} rows (cap is ${maxAutoDelete}). Duplicates may be in this proposal only; check that you are viewing one proposal.`);
      }
    }

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

    // Fetch sheet-linked items (row_id IS NULL). Use the SAME workbook/sheet selection as loadMaterialsData
    // so Add Labor line items (saved with sheet_id from the displayed sheet) are always found on reload.
    let sheetLinkedItems: CustomRowLineItem[] = [];
    let sheetIds: string[] = [];
    if (targetQuoteId) {
      let quoteWb: any = null;
      let { data: wbData } = await supabase
        .from('material_workbooks')
        .select('id, material_sheets(id, material_items(id))')
        .eq('quote_id', targetQuoteId)
        .eq('status', 'working')
        .maybeSingle();
      quoteWb = wbData;
      if (!quoteWb) {
        const fallback = await supabase
          .from('material_workbooks')
          .select('id, material_sheets(id, material_items(id))')
          .eq('quote_id', targetQuoteId)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        quoteWb = fallback.data;
      }
      const quoteSheets = (quoteWb as any)?.material_sheets || [];
      let quoteSheetIds = quoteSheets.map((s: any) => s.id);
      const itemCount = quoteSheets.reduce((n: number, s: any) => n + ((s.material_items || []).length), 0);
      if (quoteSheetIds.length === 0 || itemCount === 0) {
        const { data: allJobWbs } = await supabase
          .from('material_workbooks')
          .select('id, material_sheets(id)')
          .eq('job_id', job.id)
          .order('updated_at', { ascending: false });
        for (const wb of allJobWbs || []) {
          const sids = ((wb as any).material_sheets || []).map((s: any) => s.id);
          if (sids.length > 0) {
            quoteSheetIds = sids;
            break;
          }
        }
      }
      sheetIds = quoteSheetIds;
    } else {
      const { data: jobWb } = await supabase
        .from('material_workbooks')
        .select('id, material_sheets(id)')
        .eq('job_id', job.id)
        .eq('status', 'working')
        .maybeSingle();
      sheetIds = ((jobWb as any)?.material_sheets || []).map((s: any) => s.id);
    }
    if (sheetIds.length > 0) {
      const { data: sheetItems } = await supabase
        .from('custom_financial_row_items')
        .select('*')
        .in('sheet_id', sheetIds)
        .is('row_id', null)
        .order('order_index');
      sheetLinkedItems = (sheetItems || []) as CustomRowLineItem[];
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
    // Merge with previous state so just-saved line items (e.g. Add Labor) are not lost if fetch is stale
    setCustomRowLineItems(prev => {
      const next: Record<string, CustomRowLineItem[]> = { ...lineItemsMap };
      if (prev && typeof prev === 'object') {
        for (const parentId of Object.keys(prev)) {
          const prevList = prev[parentId] || [];
          const baseList = next[parentId] || [];
          const baseIds = new Set(baseList.map((i: any) => i.id));
          const missing = prevList.filter((i: any) => i.id && !baseIds.has(i.id));
          if (missing.length) next[parentId] = [...baseList, ...missing];
        }
      }
      return next;
    });
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
            quote_id: quote?.id ?? null,
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
        await loadSubcontractorEstimates(quote?.id ?? null, !!isReadOnly);
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
        quote_id: quote?.id ?? null,
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
      await loadCustomRows(quote?.id ?? null, !!isReadOnly);
      await loadMaterialsData(quote?.id ?? null, !!isReadOnly);
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
      await loadMaterialsData(quote?.id ?? null, !!isReadOnly);
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
        await loadMaterialsData(quote?.id ?? null, !!isReadOnly);
      } else if (editingRowNameType === 'custom') {
        const { error } = await supabase
          .from('custom_financial_rows')
          .update({ description: tempRowName.trim() })
          .eq('id', editingRowName);

        if (error) throw error;
        await loadCustomRows(quote?.id ?? null, !!isReadOnly);
      await loadMaterialsData(quote?.id ?? null, !!isReadOnly);
      } else if (editingRowNameType === 'subcontractor') {
        const { error } = await supabase
          .from('subcontractor_estimates')
          .update({ company_name: tempRowName.trim() })
          .eq('id', editingRowName);

        if (error) throw error;
        await loadSubcontractorEstimates(quote?.id ?? null, !!isReadOnly);
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
        if (existingLabor?.id) {
          const { error } = await supabase
            .from('material_sheet_labor')
            .update(laborData)
            .eq('id', existingLabor.id);

          if (error) throw error;
          toast.success('Labor updated');
          const total = (laborData.estimated_hours ?? 0) * (laborData.hourly_rate ?? 0);
          setSheetLabor(prev => ({ ...prev, [editingLaborSheetId]: { ...existingLabor, ...laborData, total_labor_cost: total } }));
        } else {
          const { data: inserted, error } = await supabase
            .from('material_sheet_labor')
            .insert([laborData])
            .select('id, sheet_id, description, estimated_hours, hourly_rate, notes')
            .single();

          if (error) throw error;
          toast.success('Labor added');
          const total = (laborData.estimated_hours ?? 0) * (laborData.hourly_rate ?? 0);
          if (inserted) setSheetLabor(prev => ({ ...prev, [editingLaborSheetId]: { ...inserted, total_labor_cost: total } }));
        }

        setShowLaborDialog(false);
        setEditingLaborSheetId(null);
        // Brief delay so DB commit is visible to the next read; then reload to refresh totals and keep UI in sync
        await new Promise(r => setTimeout(r, 150));
        await loadMaterialsData(quote?.id ?? null, !!isReadOnly);
      } catch (error: any) {
        console.error('Error saving labor:', error);
        const msg = error?.message || error?.error_description || 'Failed to save labor';
        toast.error(msg.length > 80 ? 'Failed to save labor' : msg);
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
        await loadCustomRows(quote?.id ?? null, !!isReadOnly);
      await loadMaterialsData(quote?.id ?? null, !!isReadOnly);
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
      
      await loadMaterialsData(quote?.id ?? null, !!isReadOnly);
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
      await loadCustomRows(quote?.id ?? null, !!isReadOnly);
      await loadMaterialsData(quote?.id ?? null, !!isReadOnly);
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
      await loadCustomRows(quote?.id ?? null, !!isReadOnly);
      await loadMaterialsData(quote?.id ?? null, !!isReadOnly);
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

    // Determine if this is for a sheet or a custom row (sheet = line items under a material sheet, e.g. Add Labor from sheet dropdown)
    const isSheet = materialSheets.some(s => s.id === lineItemParentRowId) ||
      materialsBreakdown.sheetBreakdowns.some((s: any) => s.sheetId === lineItemParentRowId);
    
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
        const { data: updated, error } = await supabase
          .from('custom_financial_row_items')
          .update(itemData)
          .eq('id', editingLineItem.id)
          .select()
          .single();

        if (error) throw error;
        toast.success('Line item updated');
        if (updated) {
          setCustomRowLineItems(prev => ({
            ...prev,
            [lineItemParentRowId]: (prev[lineItemParentRowId] || []).map(it => it.id === editingLineItem.id ? updated : it),
          }));
        }
      } else {
        // Labor: always insert so user can add multiple labor rows. Material: upsert by same parent+description+qty+cost to avoid duplicates.
        const isNewLabor = actualItemType === 'labor';
        if (isNewLabor) {
          const { data: created, error } = await supabase
            .from('custom_financial_row_items')
            .insert([itemData])
            .select()
            .single();
          if (error) throw error;
          toast.success('Line item added');
          if (created) {
            setCustomRowLineItems(prev => ({
              ...prev,
              [lineItemParentRowId]: [...(prev[lineItemParentRowId] || []), created],
            }));
          }
        } else {
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
            const { data: updated, error } = await supabase
              .from('custom_financial_row_items')
              .update(itemData)
              .eq('id', existing.id)
              .select()
              .single();
            if (error) throw error;
            toast.success('Line item updated');
            if (updated) {
              setCustomRowLineItems(prev => ({
                ...prev,
                [lineItemParentRowId]: (prev[lineItemParentRowId] || []).map(it => it.id === existing.id ? updated : it),
              }));
            }
          } else {
            const { data: created, error } = await supabase
              .from('custom_financial_row_items')
              .insert([itemData])
              .select()
              .single();
            if (error) throw error;
            toast.success('Line item added');
            if (created) {
              setCustomRowLineItems(prev => ({
                ...prev,
                [lineItemParentRowId]: [...(prev[lineItemParentRowId] || []), created],
              }));
            }
          }
        }
      }

      await new Promise(r => setTimeout(r, 150));
      await loadCustomRows(quote?.id ?? null, !!isReadOnly);
      await loadMaterialsData(quote?.id ?? null, !!isReadOnly);

      if (keepDialogOpen) {
        // Reset form for adding another item, keeping type (labor/material) and defaults
        const currentItemType = lineItemForm.item_type;
        const currentTaxable = lineItemForm.taxable;
        const currentMarkup = lineItemForm.markup_percent;
        const currentLaborRate = lineItemForm.labor_rate;
        const currentLaborMarkup = lineItemForm.labor_markup_percent;
        setLineItemForm({
          description: '',
          quantity: '1',
          unit_cost: '0',
          notes: '',
          taxable: currentItemType === 'labor' ? false : currentTaxable,
          item_type: currentItemType,
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
      const msg = error?.message || error?.error_description || 'Failed to save line item';
      toast.error(msg.length > 80 ? 'Failed to save line item' : msg);
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
      await loadCustomRows(quote?.id ?? null, !!isReadOnly);
      await loadMaterialsData(quote?.id ?? null, !!isReadOnly);
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
      await loadSubcontractorEstimates(quote?.id ?? null, !!isReadOnly);
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
      await loadSubcontractorEstimates(quote?.id ?? null, !!isReadOnly);
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
      await loadSubcontractorEstimates(quote?.id ?? null, !!isReadOnly);
    } catch (error: any) {
      console.error('Error toggling item type:', error);
      toast.error('Failed to update item type');
    }
  }

  function openAddSubcontractorLineItemDialog(estimateId: string) {
    setAddSubcontractorLineItemEstimateId(estimateId);
    setSubLineItemDescription('');
    setSubLineItemQuantity('1');
    setSubLineItemUnitPrice('');
    setSubLineItemType('material');
    setSubLineItemTaxable(true);
    setShowAddSubcontractorLineItemDialog(true);
  }

  async function saveAddSubcontractorLineItem() {
    if (!addSubcontractorLineItemEstimateId || !subLineItemDescription.trim()) {
      toast.error('Enter a description');
      return;
    }
    const qty = parseFloat(subLineItemQuantity) || 0;
    const unitPrice = parseFloat(subLineItemUnitPrice) || 0;
    const totalPrice = qty * unitPrice;
    if (qty <= 0 || unitPrice < 0) {
      toast.error('Enter valid quantity and unit price');
      return;
    }
    try {
      const existing = subcontractorLineItems[addSubcontractorLineItemEstimateId] || [];
      const maxOrder = existing.length > 0
        ? Math.max(...existing.map((i: any) => i.order_index ?? 0), -1)
        : -1;
      const { error } = await supabase
        .from('subcontractor_estimate_line_items')
        .insert({
          estimate_id: addSubcontractorLineItemEstimateId,
          description: subLineItemDescription.trim(),
          quantity: qty,
          unit_price: unitPrice,
          total_price: totalPrice,
          item_type: subLineItemType,
          taxable: subLineItemType === 'labor' ? false : subLineItemTaxable,
          excluded: false,
          order_index: maxOrder + 1,
          markup_percent: 0,
        });
      if (error) throw error;
      toast.success('Line item added');
      setShowAddSubcontractorLineItemDialog(false);
      setAddSubcontractorLineItemEstimateId(null);
      await loadSubcontractorEstimates(quote?.id ?? null, !!isReadOnly);
    } catch (error: any) {
      console.error('Error adding subcontractor line item:', error);
      toast.error(error?.message || 'Failed to add line item');
    }
  }

  function openEditSubcontractorLineItemDialog(lineItem: any) {
    setSubLineItemDescription(lineItem.description ?? '');
    setSubLineItemQuantity(String(lineItem.quantity ?? 1));
    setSubLineItemUnitPrice(lineItem.unit_price != null ? String(lineItem.unit_price) : '');
    setSubLineItemType((lineItem.item_type || 'material') as 'material' | 'labor');
    setSubLineItemTaxable(lineItem.item_type === 'labor' ? false : (lineItem.taxable !== false));
    setEditingSubcontractorLineItemId(lineItem.id);
    setShowEditSubcontractorLineItemDialog(true);
  }

  async function saveEditSubcontractorLineItem() {
    if (!editingSubcontractorLineItemId || !subLineItemDescription.trim()) {
      toast.error('Enter a description');
      return;
    }
    const qty = parseFloat(subLineItemQuantity) || 0;
    const unitPrice = parseFloat(subLineItemUnitPrice) || 0;
    const totalPrice = qty * unitPrice;
    if (qty <= 0 || unitPrice < 0) {
      toast.error('Enter valid quantity and unit price');
      return;
    }
    try {
      const { error } = await supabase
        .from('subcontractor_estimate_line_items')
        .update({
          description: subLineItemDescription.trim(),
          quantity: qty,
          unit_price: unitPrice,
          total_price: totalPrice,
          item_type: subLineItemType,
          taxable: subLineItemType === 'labor' ? false : subLineItemTaxable,
        })
        .eq('id', editingSubcontractorLineItemId);
      if (error) throw error;
      toast.success('Line item updated');
      setShowEditSubcontractorLineItemDialog(false);
      setEditingSubcontractorLineItemId(null);
      await loadSubcontractorEstimates(quote?.id ?? null, !!isReadOnly);
    } catch (error: any) {
      console.error('Error updating subcontractor line item:', error);
      toast.error(error?.message || 'Failed to update line item');
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
      await loadSubcontractorEstimates(quote?.id ?? null, !!isReadOnly);
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
      await loadSubcontractorEstimates(quote?.id ?? null, !!isReadOnly);
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
      await loadSubcontractorEstimates(quote?.id ?? null, !!isReadOnly);
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
      await loadCustomRows(quote?.id ?? null, !!isReadOnly);
      await loadMaterialsData(quote?.id ?? null, !!isReadOnly);
    } catch (error: any) {
      console.error('Error updating markup:', error);
      toast.error('Failed to update markup');
    }
  }

  async function updateCustomRowBaseCost(rowId: string, newTotalBase: number, linkedSubsTotal: number) {
    if (isReadOnly) return;
    const newRowCost = Math.max(0, newTotalBase - linkedSubsTotal);
    try {
      const { error } = await supabase
        .from('custom_financial_rows')
        .update({
          total_cost: newRowCost,
          quantity: 1,
          unit_cost: newRowCost,
        })
        .eq('id', rowId);

      if (error) throw error;
      await loadCustomRows(quote?.id ?? null, !!isReadOnly);
      await loadMaterialsData(quote?.id ?? null, !!isReadOnly);
    } catch (error: any) {
      console.error('Error updating base cost:', error);
      toast.error('Failed to update cost');
    }
  }

  async function updateLineItemCost(lineItemId: string, newTotalCost: number) {
    if (isReadOnly) return;
    const value = Math.max(0, newTotalCost);
    try {
      const { error } = await supabase
        .from('custom_financial_row_items')
        .update({
          total_cost: value,
          quantity: 1,
          unit_cost: value,
        })
        .eq('id', lineItemId);

      if (error) throw error;
      await loadCustomRows(quote?.id ?? null, !!isReadOnly);
      await loadMaterialsData(quote?.id ?? null, !!isReadOnly);
    } catch (error: any) {
      console.error('Error updating line item cost:', error);
      toast.error('Failed to update cost');
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

  async function setQuoteTaxExempt(value: boolean) {
    if (!quote?.id || !job?.id || isReadOnly) return;

    // Optimistic UI update — always apply immediately so the checkbox responds
    setTaxExemptChecked(value);
    setTaxExemptSaved(false); // mark as pending until DB confirms
    setQuote((prev) => (prev ? { ...prev, tax_exempt: value } : prev));
    setAllJobQuotes(value
      ? allJobQuotes.map((q: any) => ({ ...q, tax_exempt: true }))
      : allJobQuotes.map((q) => (q.id === quote.id ? { ...q, tax_exempt: value } : q)),
    );

    const broadcastSuccess = () => {
      setTaxExemptSaved(true);
      taxExemptChannelRef.current?.send({
        type: 'broadcast',
        event: 'tax_exempt',
        payload: { value, quote_id: quote.id, job_id: job.id },
      });
    };

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    if (supabaseUrl) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token ?? '';
        const res = await fetch(`${supabaseUrl}/functions/v1/set-job-tax-exempt`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ job_id: job.id, quote_id: quote.id, value }),
        });
        const data = await res.json().catch(() => ({}));
        if (data?.ok) {
          toast.success(value ? 'Job marked tax exempt for all users.' : 'Tax applied to this proposal.');
          broadcastSuccess();
          await loadQuoteData();
          return;
        }
        if (res.status !== 200 || data?.error) {
          console.warn('Tax exempt Edge Function:', data?.error ?? res.statusText);
        }
      } catch (e) {
        console.warn('Tax exempt Edge Function request failed:', e);
      }
    }

    // Fallback 1: RPC (works when PostgREST schema cache has the function)
    const { error: rpcError } = await supabase.rpc('set_quote_tax_exempt', {
      p_job_id: job.id,
      p_quote_id: quote.id,
      p_value: value,
    });
    if (!rpcError) {
      toast.success(value ? 'Job marked tax exempt for all users.' : 'Tax applied to this proposal.');
      broadcastSuccess();
      await loadQuoteData();
      return;
    }

    // Fallback 2: direct PostgREST update (works when schema cache exposes tax_exempt)
    const { error: fallbackError } = value
      ? await supabase.from('quotes').update({ tax_exempt: true  }).eq('job_id', job.id)
      : await supabase.from('quotes').update({ tax_exempt: false }).eq('id', quote.id);

    if (!fallbackError) {
      toast.success(value ? 'Job marked tax exempt for all users.' : 'Tax applied to this proposal.');
      broadcastSuccess();
      await loadQuoteData();
      return;
    }

    // All paths failed
    console.warn('Tax exempt save failed. RPC:', rpcError?.message, '| Direct:', fallbackError?.message);
    const rpcMsg = rpcError?.message ?? 'unknown';
    const directMsg = fallbackError?.message ?? 'unknown';
    const schemaCacheError = /schema cache|Could not find the function|Could not find the.*column/i.test(rpcMsg + directMsg);
    toast.error(
      schemaCacheError
        ? `Tax exempt could not be saved. Deploy the Edge Function "set-job-tax-exempt" and run scripts/setup-tax-exempt-for-job.sql in Supabase. Optionally add DATABASE_URL secret to the function so it can save when the API schema is stale.`
        : `Tax exempt could not be saved. RPC: ${rpcMsg}. Direct update: ${directMsg}`,
      { duration: schemaCacheError ? 12000 : 20000 }
    );
  }

  /** Fetch print-ready HTML from the Edge Function for in-app PDF view. */
  async function fetchProposalPdfHtml(html: string, filename: string): Promise<string> {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    if (!supabaseUrl) throw new Error('Missing VITE_SUPABASE_URL');
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token ?? '';
    const res = await fetch(`${supabaseUrl}/functions/v1/generate-pdf`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ html, filename }),
    });
    const htmlResult = await res.text();
    if (!res.ok) throw new Error(htmlResult || res.statusText || `HTTP ${res.status}`);
    return htmlResult;
  }

  /** Open preview with raw proposal HTML (no print instructions or auto-print). Preview shows the proposal only. */
  function openPdfViewInApp(proposalHtml: string, filename: string) {
    setPdfViewHtml(proposalHtml);
    setPdfViewFilename(filename);
    const blob = new Blob([proposalHtml], { type: 'text/html; charset=utf-8' });
    setPdfPrintUrl(URL.createObjectURL(blob));
    setShowPdfView(true);
  }

  function closePdfView() {
    setShowPdfView(false);
    setPdfViewHtml(null);
    setPdfViewFilename('');
    if (pdfPrintUrl) {
      URL.revokeObjectURL(pdfPrintUrl);
      setPdfPrintUrl(null);
    }
  }

  function openPrintDialog(forPdf: boolean) {
    if (!pdfViewHtml || !pdfViewFilename) return;
    try {
      const blob = new Blob([pdfViewHtml], { type: 'text/html; charset=utf-8' });
      const blobUrl = URL.createObjectURL(blob);
      const win = window.open(blobUrl, '_blank');
      if (!win) {
        URL.revokeObjectURL(blobUrl);
        toast.error('Allow popups to print or save as PDF.');
        return;
      }
      win.focus();
      if (!forPdf) toast.info('Select your printer to print the proposal.');
      setTimeout(() => {
        try {
          if (!win.closed) win.print();
        } catch {
          toast.error('Could not open print dialog');
        }
        setTimeout(() => URL.revokeObjectURL(blobUrl), 3000);
      }, 600);
    } catch (err: any) {
      toast.error(err.message || 'Failed to open print dialog');
    }
  }

  /** Download PDF using the same print layout — opens print dialog; user chooses "Save as PDF" to get a file that matches the printout exactly. */
  function handleDownloadPdf() {
    if (!pdfViewHtml || !pdfViewFilename) return;
    openPrintDialog(true);
    toast.info('Choose "Save as PDF" in the dialog to download. The file will look exactly like the printout.', { duration: 6000 });
  }

  function handlePrintProposal() {
    openPrintDialog(false);
  }

  async function handleExportPDF() {
    setExporting(true);
    
    try {
      // Get proposal number from quote if available, otherwise use job ID
      const proposalNumber = quote?.proposal_number || job.id.split('-')[0].toUpperCase();
      
      // Prepare sections data for the template (required items first, then optional at end)
      const sections = allItemsUnsorted.map((item, index) => {
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

          // Build comparison data for optional sections that have a linked base section
          let comparisonData: any = undefined;
          if ((sheet as any).isOptional && (sheet as any).compareToSheetId) {
            const baseSheetBd = materialsBreakdown.sheetBreakdowns.find((s: any) => s.sheetId === (sheet as any).compareToSheetId);
            if (baseSheetBd) {
              const baseLinkedRows2 = customRows.filter((r: any) => r.sheet_id === baseSheetBd.sheetId);
              const baseLinkedRowsTotal2 = baseLinkedRows2.reduce((rowSum: number, row: any) => {
                const lineItems2 = customRowLineItems[row.id] || [];
                const bc = lineItems2.length > 0 ? lineItems2.reduce((s2: number, it: any) => s2 + it.total_cost, 0) : row.total_cost;
                return rowSum + (bc * (1 + row.markup_percent / 100));
              }, 0);
              const baseLinkedSubs2 = linkedSubcontractors[baseSheetBd.sheetId] || [];
              const baseLinkedSubsTotal2 = baseLinkedSubs2.reduce((s2: number, sub: any) => {
                const li2 = subcontractorLineItems[sub.id] || [];
                const tt = li2.filter((it: any) => !it.excluded && it.taxable).reduce((ss: number, it: any) => ss + it.total_price, 0);
                return s2 + (tt * (1 + (sub.markup_percent || 0) / 100));
              }, 0);
              const baseCatTotals2 = (baseSheetBd.categories || []).reduce((s2: number, cat: any) => {
                const mu = categoryMarkups[`${baseSheetBd.sheetId}_${cat.name}`] ?? 10;
                return s2 + (cat.totalCost * (1 + mu / 100));
              }, 0);
              const baseMaterialsPrice = baseCatTotals2 + baseLinkedRowsTotal2 + baseLinkedSubsTotal2;
              const baseSheetLaborData = sheetLabor[baseSheetBd.sheetId];
              const baseSheetLaborTotal2 = baseSheetLaborData ? baseSheetLaborData.total_labor_cost : 0;
              const baseSheetLaborLineItems2 = customRowLineItems[baseSheetBd.sheetId]?.filter((it: any) => (it.item_type || 'material') === 'labor') || [];
              const baseSheetLaborLineItemsTotal2 = baseSheetLaborLineItems2.reduce((s2: number, it: any) => s2 + (it.total_cost * (1 + (it.markup_percent || 0) / 100)), 0);
              const baseNonTaxable2 = baseLinkedSubs2.reduce((s2: number, sub: any) => {
                const li2 = subcontractorLineItems[sub.id] || [];
                const nt = li2.filter((it: any) => !it.excluded && !it.taxable).reduce((ss: number, it: any) => ss + it.total_price, 0);
                return s2 + (nt * (1 + (sub.markup_percent || 0) / 100));
              }, 0);
              const baseLaborPrice = baseSheetLaborTotal2 + baseSheetLaborLineItemsTotal2 + baseNonTaxable2;

              // Option sheet labor
              const optSheetLaborData = sheetLabor[sheet.sheetId];
              const optSheetLaborTotal = optSheetLaborData ? optSheetLaborData.total_labor_cost : 0;
              const optSheetLaborLineItems = customRowLineItems[sheet.sheetId]?.filter((it: any) => (it.item_type || 'material') === 'labor') || [];
              const optSheetLaborLineItemsTotal = optSheetLaborLineItems.reduce((s2: number, it: any) => s2 + (it.total_cost * (1 + (it.markup_percent || 0) / 100)), 0);
              const optLinkedSubs2 = linkedSubcontractors[sheet.sheetId] || [];
              const optNonTaxable = optLinkedSubs2.reduce((s2: number, sub: any) => {
                const li2 = subcontractorLineItems[sub.id] || [];
                const nt = li2.filter((it: any) => !it.excluded && !it.taxable).reduce((ss: number, it: any) => ss + it.total_price, 0);
                return s2 + (nt * (1 + (sub.markup_percent || 0) / 100));
              }, 0);
              const optLaborPrice = optSheetLaborTotal + optSheetLaborLineItemsTotal + optNonTaxable;

              // Category-level comparison rows
              const allCatNames = Array.from(new Set([
                ...(baseSheetBd.categories || []).map((c: any) => c.name),
                ...(sheet.categories || []).map((c: any) => c.name),
              ])).sort();
              const categoryRows = allCatNames.map((catName: string) => {
                const baseCat = (baseSheetBd.categories || []).find((c: any) => c.name === catName);
                const optCat = (sheet.categories || []).find((c: any) => c.name === catName);
                const baseMu = categoryMarkups[`${baseSheetBd.sheetId}_${catName}`] ?? 10;
                const optMu = categoryMarkups[`${sheet.sheetId}_${catName}`] ?? 10;
                return {
                  name: catName,
                  basePrice: baseCat ? baseCat.totalCost * (1 + baseMu / 100) : 0,
                  optionPrice: optCat ? optCat.totalCost * (1 + optMu / 100) : 0,
                };
              });

              comparisonData = {
                baseName: baseSheetBd.sheetName,
                optionName: sheet.sheetName,
                baseMaterialsPrice,
                optionMaterialsPrice: sheetFinalPrice,
                baseLaborPrice,
                optionLaborPrice: optLaborPrice,
                baseTotal: baseMaterialsPrice + baseLaborPrice,
                optionTotal: sheetFinalPrice + optLaborPrice,
                categoryRows,
              };
            }
          }
          
          return {
            name: sheet.sheetName,
            description: sheet.sheetDescription || '',
            price: sheetFinalPrice,
            optional: (sheet as any).isOptional ?? false,
            comparisonData,
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
        theme: exportTheme,
        taxExempt: taxExemptChecked,
      });

      console.log('Generating PDF with HTML');
      const filename = `Proposal-${proposalNumber}.pdf`;
      openPdfViewInApp(html, filename);
      toast.success('Proposal preview opened. Click "Download PDF" to save as PDF (named by proposal number).');
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
  
  // Build set of optional sheet IDs so they can be excluded from all totals
  const optionalSheetIds = new Set(
    materialsBreakdown.sheetBreakdowns.filter((s: any) => s.isOptional).map((s: any) => s.sheetId)
  );

  // Materials: material sheets + custom material rows (ALL materials, not just taxable)
  // Also track taxable-only materials for tax calculation
  let materialSheetsPrice = 0;
  let materialSheetsTaxableOnly = 0;
  
  materialsBreakdown.sheetBreakdowns.forEach(sheet => {
    // Skip optional sections — they are shown but not included in totals
    if ((sheet as any).isOptional) return;

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
      const cost = Number(cat.totalCost) || 0;
      const categoryPriceWithMarkup = cost * (1 + categoryMarkup / 100);
      return sum + categoryPriceWithMarkup;
    }, 0) || 0;
    
    // For taxable calculation, all category materials are taxable by default
    const categoryTaxableOnly = sheet.categories?.reduce((sum: number, cat: any) => {
      const categoryKey = `${sheet.sheetId}_${cat.name}`;
      const categoryMarkup = categoryMarkups[categoryKey] ?? 10;
      const cost = Number(cat.totalCost) || 0;
      const categoryPriceWithMarkup = cost * (1 + categoryMarkup / 100);
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
  // Use all sheet IDs (from sheetBreakdowns and materialSheets) so labor from line items is never missed when sheetBreakdowns is empty
  // Exclude optional sheets from labor as well
  const allSheetIds = Array.from(new Set([
    ...materialsBreakdown.sheetBreakdowns.map((s: any) => s.sheetId),
    ...materialSheets.map((s: any) => s.id),
  ])).filter(id => !!id && !optionalSheetIds.has(id));
  const totalSheetLaborCost = allSheetIds.reduce((sum, sheetId) => {
    const labor = sheetLabor[sheetId];
    
    // Add labor from sheet line items (labor type) - same formula as section display (cost + markup)
    const sheetLineItems = customRowLineItems[sheetId] || [];
    const sheetLaborLineItems = sheetLineItems.filter((item: any) => (item.item_type || 'material') === 'labor');
    const sheetLaborLineItemsTotal = sheetLaborLineItems.reduce((itemSum: number, item: any) => {
      const itemMarkup = item.markup_percent || 0;
      return itemSum + (item.total_cost * (1 + itemMarkup / 100));
    }, 0);
    
    // Add labor from linked custom rows (labor line items)
    const linkedRows = customRows.filter(r => (r as any).sheet_id === sheetId);
    const linkedRowsLaborTotal = linkedRows.reduce((rowSum, row) => {
      const lineItems = customRowLineItems[row.id] || [];
      const linkedSubs = linkedSubcontractors[row.id] || [];
      
      const laborLineItems = lineItems.filter((item: any) => (item.item_type || 'material') === 'labor');
      let rowLaborTotal = 0;
      if (lineItems.length > 0) {
        rowLaborTotal = laborLineItems.reduce((itemSum: number, item: any) => {
          const itemMarkup = item.markup_percent || 0;
          return itemSum + (item.total_cost * (1 + itemMarkup / 100));
        }, 0);
      } else if (row.category === 'labor') {
        rowLaborTotal = row.total_cost;
      }
      linkedSubs.forEach((sub: any) => {
        const subLineItems = subcontractorLineItems[sub.id] || [];
        const subLaborTotal = subLineItems
          .filter((item: any) => !item.excluded && (item.item_type || 'material') === 'labor')
          .reduce((itemSum: number, item: any) => itemSum + item.total_price, 0);
        const estMarkup = sub.markup_percent || 0;
        rowLaborTotal += subLaborTotal * (1 + estMarkup / 100);
      });
      const rowMarkup = 1 + (row.markup_percent / 100);
      return rowSum + (rowLaborTotal * rowMarkup);
    }, 0);
    
    const linkedSubs = linkedSubcontractors[sheetId] || [];
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
  
  // Custom row labor (estimated_hours * rate) only for rows that don't already have labor line items,
  // so the top labor total equals the sum of labor shown in the section (no double-count, no under-count).
  // Also exclude rows that are linked to optional sheets.
  const totalCustomRowLaborCost = Object.entries(customRowLabor).reduce((sum: number, [rowId, labor]: [string, any]) => {
    const row = customRows.find(r => r.id === rowId);
    if (row && optionalSheetIds.has((row as any).sheet_id)) return sum;
    const lineItems = customRowLineItems[rowId] || [];
    const hasLaborLineItems = lineItems.some((item: any) => (item.item_type || 'material') === 'labor');
    if (hasLaborLineItems) return sum;
    return sum + (labor.estimated_hours * labor.hourly_rate);
  }, 0);
  
  const proposalLaborPrice = totalSheetLaborCost + totalCustomRowLaborCost + customRowsLaborTotal + subcontractorLaborPrice;
  
  // Combine materials with subcontractor materials for display
  const proposalMaterialsTotalWithSubcontractors = proposalMaterialsPrice + subcontractorMaterialsPrice;
  
  // Calculate subtotals
  const materialsSubtotal = proposalMaterialsPrice + subcontractorMaterialsPrice;
  const laborSubtotal = proposalLaborPrice;
  
  // Tax: use local checkbox state so total updates immediately when user checks "Tax exempt"
  const proposalTotalTaxRaw = ((Number(proposalMaterialsTaxableOnly) || 0) + (Number(subcontractorMaterialsTaxableOnly) || 0)) * TAX_RATE;
  const proposalTotalTax = taxExemptChecked ? 0 : proposalTotalTaxRaw;
  
  // Grand total: subtotal + tax (tax is 0 when tax exempt)
  const proposalSubtotal = (Number(materialsSubtotal) || 0) + (Number(laborSubtotal) || 0);
  const proposalGrandTotal = (Number(proposalSubtotal) || 0) + (Number(proposalTotalTax) || 0);

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
  const FIELD_REQUEST_NAMES = ['Field Request', 'Field Requests', 'Crew Orders'];
  const allItemsUnsorted = [
    ...materialsBreakdown.sheetBreakdowns
      .filter(sheet => !FIELD_REQUEST_NAMES.includes(sheet.sheetName))
      .map(sheet => ({
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

  // Split into required (included in total) and optional (excluded from total) for separate rendering
  const allItems = allItemsUnsorted.filter(item => !(item.type === 'material' && (item.data as any).isOptional));
  const optionalItems = allItemsUnsorted.filter(item => item.type === 'material' && (item.data as any).isOptional);

  // Optional categories (section-level options): list for the "Options" block at bottom of proposal
  const optionalCategoriesList: { sheetName: string; categoryName: string; totalCost: number; priceWithMarkup: number }[] = [];
  materialsBreakdown.sheetBreakdowns.forEach((sheet: any) => {
    if (FIELD_REQUEST_NAMES.includes(sheet.sheetName)) return;
    (sheet.categories || []).forEach((cat: any) => {
      const isOptional = cat.items?.every((i: any) => i.isOptional) ?? false;
      if (!isOptional) return;
      const key = `${sheet.sheetId}_${cat.name}`;
      const markup = categoryMarkups[key] ?? (sheet.markup_percent ?? 10);
      const priceWithMarkup = (cat.totalCost || 0) * (1 + markup / 100);
      optionalCategoriesList.push({
        sheetName: sheet.sheetName,
        categoryName: cat.name,
        totalCost: cat.totalCost || 0,
        priceWithMarkup,
      });
    });
  });

  // Handle drag end
  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    if (!over || active.id === over.id) return;
    
    // Prevent reordering in read-only mode
    if (isReadOnly) {
      toast.error('Cannot reorder in historical view');
      return;
    }

    const oldIndex = allItemsUnsorted.findIndex(item => item.id === active.id);
    const newIndex = allItemsUnsorted.findIndex(item => item.id === over.id);

    if (oldIndex === -1 || newIndex === -1) return;

    // Reorder items
    const reorderedItems = arrayMove(allItemsUnsorted, oldIndex, newIndex);

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

  // When inside JobDetailView Proposal & Materials tab, register action buttons for the black header bar
  useEffect(() => {
    if (!setProposalToolbar) return;
    setProposalToolbar(
      <div className="flex flex-wrap items-center gap-1">
        {quote && (
          <>
            <Button size="sm" variant="outline" onClick={() => { setDeleteProposalQuoteId(quote.id); setShowDeleteProposalConfirm(true); }} className="h-8 w-8 p-0 bg-white/10 hover:bg-red-500/20 text-red-200 border-red-500/40 hover:border-red-400" title="Delete this proposal">
              <Trash2 className="w-2.5 h-2.5" />
            </Button>
            <div className="h-5 w-px bg-yellow-600/40 flex-shrink-0" aria-hidden />
          </>
        )}
        <Button onClick={() => setEditingDescription(true)} variant="outline" size="sm" className={headerBtn}>
          <Edit className="w-2.5 h-2.5 mr-0.5" />
          {buildingDescription ? 'Edit Description' : 'Add Description'}
        </Button>
        <Button size="sm" onClick={() => { if (quote) setShowCreateProposalDialog(true); else autoCreateFirstProposal(); }} disabled={creatingVersion} className="bg-white hover:bg-slate-100 text-black border border-slate-400 h-8 text-xs px-2" title="Create a new proposal (allowed even when current proposal is locked)">
          {creatingVersion ? <><span className="animate-spin mr-0.5">⏳</span>Creating...</> : <><Plus className="w-2.5 h-2.5 mr-0.5" />New Proposal</>}
        </Button>
        {quote && !(quote as any).signed_version && (
          <Button size="sm" onClick={setActiveProposalAsContract} className="bg-white hover:bg-slate-100 text-black border border-slate-400 h-8 text-xs px-2">
            <Lock className="w-2.5 h-2.5 mr-0.5" />Set as Contract
          </Button>
        )}
        {quote && (
          (quote as any).sent_at ? (
            <Button size="sm" disabled className="bg-emerald-50 text-emerald-800 border border-emerald-300 h-8 text-xs px-2 cursor-default" title="Sent to customer — see proposal header for date/time and time worked">
              <CheckCircle className="w-2.5 h-2.5 mr-0.5" />Sent
            </Button>
          ) : (
            <Button size="sm" onClick={markProposalAsSent} disabled={isReadOnly} className="bg-white hover:bg-slate-100 text-black border border-slate-400 h-8 text-xs px-2" title="Record when this proposal was sent to the customer (saves date/time and locks workbook)">
              <Send className="w-2.5 h-2.5 mr-0.5" />Mark as Sent
            </Button>
          )
        )}
        <Button onClick={() => setShowExportDialog(true)} size="sm" className="bg-white hover:bg-slate-100 text-black border border-slate-400 h-8 text-xs px-2">
          <Download className="w-2.5 h-2.5 mr-0.5" />Export PDF
        </Button>
        <Button onClick={() => openAddDialog()} variant="outline" size="sm" disabled={isReadOnly} className={headerBtn}>
          <Plus className="w-2.5 h-2.5 mr-0.5" />Add Row
        </Button>
        <Button onClick={() => setShowSubUploadDialog(true)} variant="outline" size="sm" disabled={isReadOnly} className={headerBtn}>
          <Upload className="w-2.5 h-2.5 mr-0.5" />Upload Sub
        </Button>
        {allJobQuotes.length > 1 && (
          <Button onClick={() => setShowProposalComparison(true)} variant="outline" size="sm" className="bg-white hover:bg-slate-100 text-black border border-slate-400 h-8 text-xs px-2" title="Compare two proposals side by side">
            <GitCompare className="w-2.5 h-2.5 mr-0.5" />Compare 2
          </Button>
        )}
      </div>
    );
    return () => { setProposalToolbar(null); };
  }, [setProposalToolbar, quote?.id, quote?.sent_at, quote?.locked_for_editing, allJobQuotes.length, buildingDescription, creatingVersion, isReadOnly, isDefaultLocked, historicalUnlockedQuoteId, proposalVersions?.length, quote?.signed_version]);

  // Sync proposal summary to green header bar (Proposal #, Materials, Labor, Grand Total)
  useEffect(() => {
    const setSummary = proposalSummaryCtx?.setSummary;
    if (!setSummary) return;
    if (!quote) {
      setSummary(null);
      return;
    }
    setSummary({
      proposalNumber: String(quote.proposal_number ?? quote.quote_number ?? ''),
      materials: Number(proposalMaterialsTotalWithSubcontractors) || 0,
      labor: Number(proposalLaborPrice) || 0,
      subtotal: Number(proposalSubtotal) || 0,
      tax: Number(proposalTotalTax) || 0,
      grandTotal: Number(proposalGrandTotal) || 0,
    });
    return () => setSummary(null);
  }, [proposalSummaryCtx?.setSummary, quote, proposalMaterialsTotalWithSubcontractors, proposalLaborPrice, proposalSubtotal, proposalTotalTax, proposalGrandTotal]);

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

      {/* Sticky header: project totals stay visible when scrolling (does not move with content) */}
      {quote && setProposalToolbar && (
        <div className="sticky top-0 z-10 relative flex flex-wrap items-center gap-4 py-2.5 pl-4 pr-12 mb-0 bg-white border-b border-slate-200 shadow-sm text-sm">
          <div className="flex items-center gap-0.5 rounded-md border border-slate-200 bg-slate-50 overflow-hidden">
            <Button
              variant="ghost"
              size="sm"
              onClick={navigateToPreviousProposal}
              disabled={allJobQuotes.length <= 1 || allJobQuotes.findIndex((q: any) => q.id === quote.id) >= allJobQuotes.length - 1}
              className="h-8 w-8 p-0 rounded-none text-slate-600 hover:bg-slate-200 disabled:opacity-40"
              title="Previous (older) proposal"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="min-w-[100px] px-2 py-1.5 text-center font-semibold text-slate-800 text-sm">
              Proposal #{quote.proposal_number || quote.quote_number}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={navigateToNextProposal}
              disabled={allJobQuotes.length <= 1 || allJobQuotes.findIndex((q: any) => q.id === quote.id) <= 0}
              className="h-8 w-8 p-0 rounded-none text-slate-600 hover:bg-slate-200 disabled:opacity-40"
              title="Next (newer) proposal"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
          <span className="text-slate-300">|</span>
          <span className="text-slate-600">Materials:</span>
          <span className="font-bold text-slate-900">${proposalMaterialsTotalWithSubcontractors.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          <span className="text-slate-600">Labor:</span>
          <span className="font-bold text-slate-900">${proposalLaborPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          <span className="text-slate-300">|</span>
          <span className="text-slate-600">Subtotal:</span>
          <span className="font-semibold text-slate-900">${proposalSubtotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          {taxExemptChecked ? null : (
            <span className="text-slate-600">Tax (7%): <span className="font-semibold text-amber-700">${proposalTotalTax.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></span>
          )}
          {!isReadOnly && (
            <label className="flex items-center gap-1.5 cursor-pointer text-slate-600" title={taxExemptChecked && taxExemptSaved ? 'Saved — all users will see this job as tax exempt' : taxExemptChecked ? 'Not yet saved to database' : 'Mark this job as tax exempt'}>
              <Checkbox checked={taxExemptChecked} onCheckedChange={(c) => setQuoteTaxExempt(!!c)} />
              <span className="text-xs">Tax exempt</span>
              {taxExemptChecked && taxExemptSaved && (
                <CheckCircle className="w-3 h-3 text-green-600" />
              )}
            </label>
          )}
          <span className="text-slate-300">|</span>
          <span className="text-base font-bold text-green-700">GRAND TOTAL: ${(Number.isFinite(proposalGrandTotal) ? proposalGrandTotal : 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          {quote && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleLockUnlock}
              className="absolute right-2 bottom-2 h-8 w-8 p-0 rounded-md border-slate-300 text-slate-600 hover:bg-slate-100"
              title={isReadOnly ? 'Unlock to edit' : 'Lock proposal (read-only; does not mark as sent)'}
            >
              {isReadOnly ? <Lock className="w-4 h-4" /> : <LockOpen className="w-4 h-4" />}
            </Button>
          )}
        </div>
      )}

      {/* Proposal Info Banner - Show if quote exists (hidden when summary is in green header bar) */}
      {quote && !setProposalToolbar && (
        <Card className="mb-4 border-blue-200 bg-blue-50">
          <CardContent className="py-3">
            <div className="flex items-center justify-between">
              {/* Left: Current Proposal Info */}
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-semibold text-blue-900">
                  Proposal #{quote.proposal_number || quote.quote_number}
                </span>
                {(quote as any).sent_at && (() => {
                  const sentAt = new Date((quote as any).sent_at);
                  const createdAt = (quote as any).created_at ? new Date((quote as any).created_at) : null;
                  const timeSpentMs = createdAt ? sentAt.getTime() - createdAt.getTime() : 0;
                  const timeSpentStr = timeSpentMs > 0
                    ? (() => { const h = Math.floor(timeSpentMs / 3600000); const m = Math.round((timeSpentMs % 3600000) / 60000); return h > 0 ? `${h}h ${m}m` : `${m}m`; })()
                    : '';
                  const title = timeSpentStr
                    ? `Sent to customer: ${sentAt.toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'short' })} · Time on proposal: ${timeSpentStr}`
                    : `Sent to customer: ${sentAt.toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'short' })}`;
                  return (
                    <Badge className="text-xs bg-emerald-100 border-emerald-300 text-emerald-900" title={title}>
                      <CheckCircle className="w-3 h-3 mr-1" />
                      Sent {sentAt.toLocaleDateString(undefined, { dateStyle: 'medium' })} at {sentAt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                      {timeSpentStr && <span className="ml-1">· {timeSpentStr} on proposal</span>}
                    </Badge>
                  );
                })()}
                {isReadOnly && !(quote as any).sent_at && (
                  <Badge className="text-xs bg-amber-100 border-amber-300 text-amber-900">
                    {(quote as any).locked_for_editing ? 'Locked (read-only)' : 'Historical View'}
                  </Badge>
                )}
                {isDefaultLocked && (
                  isReadOnly ? (
                    <Button size="sm" variant="outline" onClick={unlockHistoricalForEditing} className="h-7 text-xs border-amber-400 text-amber-800 hover:bg-amber-50" title="Allow editing this proposal">
                      <LockOpen className="w-3 h-3 mr-1" />Unlock for editing
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={lockHistoricalAgain} className="h-7 text-xs border-slate-400 text-slate-700 hover:bg-slate-50" title="Switch back to read-only">
                      <Lock className="w-3 h-3 mr-1" />Lock (read-only)
                    </Button>
                  )
                )}
              </div>

              {/* Right: Navigation Controls (only show if multiple proposals exist) */}
              {allJobQuotes.length > 1 && (
                <div className="flex items-center gap-3">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={navigateToFirstProposal}
                    disabled={allJobQuotes.findIndex(q => q.id === quote.id) === 0}
                    className="h-7 px-2 text-xs text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                    title="Go to first proposal"
                  >
                    First
                  </Button>
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
              {allJobQuotes.length > 1 && (
                <Button size="sm" variant="outline" onClick={() => setShowProposalComparison(true)} className="border-blue-300 text-blue-700 hover:bg-blue-50">
                  <GitCompare className="w-3 h-3 mr-1" />Compare proposals
                </Button>
              )}
              {quote && allJobQuotes.length > 1 && (
                <Button size="sm" variant="outline" onClick={() => { setDeleteProposalQuoteId(quote.id); setShowDeleteProposalConfirm(true); }} className="h-8 w-8 p-0 border-red-300 text-red-700 hover:bg-red-50" title="Delete this proposal">
                  <Trash2 className="w-3 h-3" />
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="w-full">
        {/* When toolbar is in header (Proposal & Materials tab), hide the green row */}
        {!setProposalToolbar && (
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold">Proposal Builder</h2>
          <div className="flex gap-2 items-center">
              <Button onClick={() => setEditingDescription(true)} variant="outline" size="sm" className="border-amber-300 hover:bg-amber-50">
                <Edit className="w-4 h-4 mr-2" />
                {buildingDescription ? 'Edit Building Description' : 'Add Building Description'}
              </Button>
              <div className="h-6 w-px bg-border" />
              <Button size="sm" onClick={() => { if (quote) setShowCreateProposalDialog(true); else autoCreateFirstProposal(); }} disabled={creatingVersion} className="bg-blue-600 hover:bg-blue-700" title="Create a new proposal (allowed even when current proposal is locked)">
                {creatingVersion ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />Creating...</> : <><Plus className="w-3 h-3 mr-2" />New Proposal</>}
              </Button>
              {quote && !(quote as any).signed_version && (
                <Button size="sm" onClick={setActiveProposalAsContract} className="bg-emerald-600 hover:bg-emerald-700">
                  <Lock className="w-3 h-3 mr-2" />Set as Contract
                </Button>
              )}
              {quote && (
                (quote as any).sent_at ? (
                  <Button size="sm" disabled variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-800 cursor-default">
                    <CheckCircle className="w-3 h-3 mr-2" />Sent
                  </Button>
                ) : (
                  <Button size="sm" onClick={markProposalAsSent} disabled={isReadOnly} variant="outline" className="border-slate-400">
                    <Send className="w-3 h-3 mr-2" />Mark as Sent
                  </Button>
                )
              )}
              <div className="h-6 w-px bg-border" />
              <Button onClick={() => setShowTemplateEditor(true)} variant="outline" size="sm" className="bg-purple-50 border-purple-300 text-purple-700 hover:bg-purple-100">
                <Settings className="w-4 h-4 mr-2" />Edit Template
              </Button>
              <Button onClick={openDocuments} variant="outline" size="sm" className="bg-blue-50 border-blue-300 text-blue-700 hover:bg-blue-100">
                <FileText className="w-4 h-4 mr-2" />View Documents
              </Button>
              <Button onClick={() => setShowExportDialog(true)} variant="default" size="sm">
                <Download className="w-4 h-4 mr-2" />Export PDF
              </Button>
              <Button onClick={() => openAddDialog()} variant="outline" size="sm" disabled={isReadOnly}>
                <Plus className="w-4 h-4 mr-2" />Add Row
              </Button>
              <Button onClick={() => setShowSubUploadDialog(true)} variant="outline" size="sm" disabled={isReadOnly}>
                <Upload className="w-4 h-4 mr-2" />Upload Subcontractor Estimate
              </Button>
            </div>
        </div>
        )}

        {/* Compact Project Total row above proposal (hidden when in green header bar) */}
        {!setProposalToolbar && (
        <div className="flex flex-wrap items-center gap-4 py-2 px-3 mb-3 rounded-lg bg-gradient-to-r from-slate-100 to-slate-50 border border-slate-200 text-sm">
          <span className="font-semibold text-slate-700">Materials:</span>
          <span className="font-bold text-slate-900">${proposalMaterialsTotalWithSubcontractors.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          {proposalLaborPrice > 0 && (
            <>
              <span className="font-semibold text-slate-700">Labor:</span>
              <span className="font-bold text-slate-900">${proposalLaborPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </>
          )}
          <span className="text-slate-400">|</span>
          <span className="text-slate-600">Subtotal:</span>
          <span className="font-semibold">${proposalSubtotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          {taxExemptChecked ? null : (
            <span className="text-slate-600">Tax (7%): <span className="font-semibold text-amber-700">${proposalTotalTax.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></span>
          )}
          <span className="text-slate-400">|</span>
          <span className="text-lg font-bold text-green-700">GRAND TOTAL: ${(Number.isFinite(proposalGrandTotal) ? proposalGrandTotal : 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
        )}

        {/* Proposal content — full width of container so it fits any screen */}
          <div className="w-full max-w-full mx-auto px-3 sm:px-4">
            <div className="w-full min-w-0">
              <div className="flex-1 min-w-0 space-y-1">
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={allItemsUnsorted.map(item => item.id)}
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
                        openAddSubcontractorLineItemDialog={openAddSubcontractorLineItemDialog}
                        openEditSubcontractorLineItemDialog={openEditSubcontractorLineItemDialog}
                        deleteRow={deleteRow}
                        deleteSheetLabor={deleteSheetLabor}
                        toggleSubcontractorLineItem={toggleSubcontractorLineItem}
                        toggleSubcontractorLineItemTaxable={toggleSubcontractorLineItemTaxable}
                        toggleSubcontractorLineItemType={toggleSubcontractorLineItemType}
                        unlinkSubcontractor={unlinkSubcontractor}
                        updateSubcontractorMarkup={updateSubcontractorMarkup}
                        updateCustomRowMarkup={updateCustomRowMarkup}
                        updateCustomRowBaseCost={updateCustomRowBaseCost}
                        updateLineItemCost={updateLineItemCost}
                        deleteLineItem={deleteLineItem}
                        loadMaterialsData={loadMaterialsData}
                        loadCustomRows={loadCustomRows}
                        loadSubcontractorEstimates={loadSubcontractorEstimates}
                        customRows={customRows}
                        savingMarkupsRef={savingMarkupsRef}
                        emptyNotesById={emptyNotesById}
                        setEmptyNotesById={setEmptyNotesById}
                        emptyScopeById={emptyScopeById}
                        setEmptyScopeById={setEmptyScopeById}
                        isReadOnly={isReadOnly}
                        quote={quote}
                        setComparePickerSheetId={setComparePickerSheetId}
                        setShowComparePickerDialog={setShowComparePickerDialog}
                        expandedComparisons={expandedComparisons}
                        setExpandedComparisons={setExpandedComparisons}
                        materialsBreakdown={materialsBreakdown}
                      />
                    ))}
                  </SortableContext>
                </DndContext>

                {/* Optional add-ons (categories marked as option) — at bottom of proposal, excluded from total */}
                {optionalCategoriesList.length > 0 && (
                  <div className="mt-4">
                    <div className="flex items-center gap-2 py-2 px-3 mb-2 rounded-lg bg-amber-50 border border-amber-200">
                      <span className="text-sm font-semibold text-amber-800 uppercase tracking-wide">Options</span>
                      <span className="text-xs text-amber-600 font-normal">(not included in contract total)</span>
                    </div>
                    <div className="space-y-1">
                      {optionalCategoriesList.map((opt, idx) => (
                        <div
                          key={`${opt.sheetName}-${opt.categoryName}-${idx}`}
                          className="flex items-center justify-between gap-3 py-2 px-3 rounded-lg border border-amber-200 bg-amber-50/50"
                        >
                          <span className="text-sm font-medium text-slate-800">
                            {opt.sheetName} — {opt.categoryName}
                          </span>
                          <span className="text-sm font-semibold text-amber-800">
                            ${opt.priceWithMarkup.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Optional Items Section (whole sheets marked optional) */}
                {optionalItems.length > 0 && (
                  <div className="mt-4">
                    <div className="flex items-center gap-2 py-2 px-3 mb-2 rounded-lg bg-amber-50 border border-amber-200">
                      <span className="text-sm font-semibold text-amber-800 uppercase tracking-wide">Optional Items</span>
                      <span className="text-xs text-amber-600 font-normal">(not included in proposal total)</span>
                    </div>
                    <div className="space-y-1">
                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleDragEnd}
                      >
                        <SortableContext
                          items={optionalItems.map(item => item.id)}
                          strategy={verticalListSortingStrategy}
                        >
                          {optionalItems.map((item) => (
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
                              openAddSubcontractorLineItemDialog={openAddSubcontractorLineItemDialog}
                              openEditSubcontractorLineItemDialog={openEditSubcontractorLineItemDialog}
                              deleteRow={deleteRow}
                              deleteSheetLabor={deleteSheetLabor}
                              toggleSubcontractorLineItem={toggleSubcontractorLineItem}
                              toggleSubcontractorLineItemTaxable={toggleSubcontractorLineItemTaxable}
                              toggleSubcontractorLineItemType={toggleSubcontractorLineItemType}
                              unlinkSubcontractor={unlinkSubcontractor}
                              updateSubcontractorMarkup={updateSubcontractorMarkup}
                              updateCustomRowMarkup={updateCustomRowMarkup}
                              updateCustomRowBaseCost={updateCustomRowBaseCost}
                              updateLineItemCost={updateLineItemCost}
                              deleteLineItem={deleteLineItem}
                              loadMaterialsData={loadMaterialsData}
                              loadCustomRows={loadCustomRows}
                              loadSubcontractorEstimates={loadSubcontractorEstimates}
                              customRows={customRows}
                              savingMarkupsRef={savingMarkupsRef}
                              emptyNotesById={emptyNotesById}
                              setEmptyNotesById={setEmptyNotesById}
                              emptyScopeById={emptyScopeById}
                              setEmptyScopeById={setEmptyScopeById}
                              isReadOnly={isReadOnly}
                              quote={quote}
                              setComparePickerSheetId={setComparePickerSheetId}
                              setShowComparePickerDialog={setShowComparePickerDialog}
                              expandedComparisons={expandedComparisons}
                              setExpandedComparisons={setExpandedComparisons}
                              materialsBreakdown={materialsBreakdown}
                            />
                          ))}
                        </SortableContext>
                      </DndContext>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
      </div>

      {/* Compare Picker Dialog — lets user choose which required section to compare an optional section against */}
      <Dialog open={showComparePickerDialog} onOpenChange={setShowComparePickerDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Compare with Section</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              Select the included section you want to compare this optional section against. The price difference will be shown side-by-side.
            </p>
            <div className="space-y-2">
              {allItems
                .filter(item => item.type === 'material')
                .map(item => {
                  const s = item.data as any;
                  return (
                    <button
                      key={s.sheetId}
                      className="w-full text-left px-3 py-2 rounded border border-slate-200 hover:border-blue-400 hover:bg-blue-50 transition-colors"
                      onClick={async () => {
                        if (!comparePickerSheetId) return;
                        await supabase.from('material_sheets').update({ compare_to_sheet_id: s.sheetId } as any).eq('id', comparePickerSheetId);
                        await loadMaterialsData(quote?.id ?? null, false);
                        // Auto-expand the comparison panel for this optional sheet
                        setExpandedComparisons(prev => new Set([...prev, comparePickerSheetId]));
                        setShowComparePickerDialog(false);
                        setComparePickerSheetId(null);
                      }}
                    >
                      <span className="font-medium text-slate-800">{s.sheetName}</span>
                      {s.sheetDescription && <span className="text-xs text-slate-500 ml-2">{s.sheetDescription.slice(0, 60)}</span>}
                    </button>
                  );
                })}
              {allItems.filter(item => item.type === 'material').length === 0 && (
                <p className="text-sm text-slate-400 italic">No included sections found. Add a required section first.</p>
              )}
            </div>
            <div className="flex justify-end">
              <Button variant="outline" onClick={() => { setShowComparePickerDialog(false); setComparePickerSheetId(null); }}>
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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

      {/* Mark as Sent — manual SQL fallback */}
      <Dialog open={showMarkAsSentManualDialog} onOpenChange={setShowMarkAsSentManualDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Mark as Sent — run this in Supabase</DialogTitle>
            <DialogDescription>
              Automatic mark-as-sent failed. Copy the SQL below, open Supabase Dashboard → SQL Editor, paste it, and click Run. Then refresh this page.
            </DialogDescription>
          </DialogHeader>
          <pre className="bg-slate-100 dark:bg-slate-800 p-3 rounded text-xs overflow-x-auto whitespace-pre-wrap font-mono">{markAsSentManualSql}</pre>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(markAsSentManualSql);
                  toast.success('SQL copied to clipboard');
                } catch {
                  toast.error('Could not copy');
                }
              }}
            >
              Copy SQL
            </Button>
            <Button onClick={() => { setShowMarkAsSentManualDialog(false); loadQuoteData(); loadData(true); }}>
              Done / Refresh
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add line item to subcontractor */}
      <Dialog open={showAddSubcontractorLineItemDialog} onOpenChange={(open) => { if (!open) setAddSubcontractorLineItemEstimateId(null); setShowAddSubcontractorLineItemDialog(open); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add line item to subcontractor</DialogTitle>
            <DialogDescription>
              Add a custom material or labor line item to this subcontract section.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Description</Label>
              <Input
                value={subLineItemDescription}
                onChange={(e) => setSubLineItemDescription(e.target.value)}
                placeholder="e.g., Additional trim, Installation labor"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Quantity</Label>
                <Input
                  type="number"
                  min="0"
                  step="any"
                  value={subLineItemQuantity}
                  onChange={(e) => setSubLineItemQuantity(e.target.value)}
                />
              </div>
              <div>
                <Label>Unit price ($)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={subLineItemUnitPrice}
                  onChange={(e) => setSubLineItemUnitPrice(e.target.value)}
                  placeholder="0.00"
                />
              </div>
            </div>
            <div>
              <Label>Type</Label>
              <Select value={subLineItemType} onValueChange={(v: 'material' | 'labor') => { setSubLineItemType(v); if (v === 'labor') setSubLineItemTaxable(false); }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="material">Material</SelectItem>
                  <SelectItem value="labor">Labor</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {subLineItemType === 'material' && (
              <label className="flex items-center gap-2">
                <Checkbox checked={subLineItemTaxable} onCheckedChange={(c) => setSubLineItemTaxable(!!c)} />
                <span className="text-sm">Taxable</span>
              </label>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowAddSubcontractorLineItemDialog(false)}>Cancel</Button>
              <Button onClick={saveAddSubcontractorLineItem}>Add line item</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit subcontractor line item */}
      <Dialog open={showEditSubcontractorLineItemDialog} onOpenChange={(open) => { if (!open) setEditingSubcontractorLineItemId(null); setShowEditSubcontractorLineItemDialog(open); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit line item</DialogTitle>
            <DialogDescription>
              Change description, quantity, unit price, or type for this subcontractor line item.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Description</Label>
              <Input
                value={subLineItemDescription}
                onChange={(e) => setSubLineItemDescription(e.target.value)}
                placeholder="e.g., Additional trim, Installation labor"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Quantity</Label>
                <Input
                  type="number"
                  min="0"
                  step="any"
                  value={subLineItemQuantity}
                  onChange={(e) => setSubLineItemQuantity(e.target.value)}
                />
              </div>
              <div>
                <Label>Unit price ($)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={subLineItemUnitPrice}
                  onChange={(e) => setSubLineItemUnitPrice(e.target.value)}
                  placeholder="0.00"
                />
              </div>
            </div>
            <div>
              <Label>Type</Label>
              <Select value={subLineItemType} onValueChange={(v: 'material' | 'labor') => { setSubLineItemType(v); if (v === 'labor') setSubLineItemTaxable(false); }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="material">Material</SelectItem>
                  <SelectItem value="labor">Labor</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {subLineItemType === 'material' && (
              <label className="flex items-center gap-2">
                <Checkbox checked={subLineItemTaxable} onCheckedChange={(c) => setSubLineItemTaxable(!!c)} />
                <span className="text-sm">Taxable</span>
              </label>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowEditSubcontractorLineItemDialog(false)}>Cancel</Button>
              <Button onClick={saveEditSubcontractorLineItem}>Save changes</Button>
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
                        ${((parseFloat(quantity) || 0) * (parseFloat(unitCost) || 0)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
                        ${((parseFloat(lineItemForm.quantity) || 0) * (parseFloat(lineItemForm.unit_cost) || 0)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="flex justify-between mb-1">
                      <span className="text-slate-600">Markup:</span>
                      <span className="font-semibold">
                        ${(((parseFloat(lineItemForm.quantity) || 0) * (parseFloat(lineItemForm.unit_cost) || 0)) * (parseFloat(lineItemForm.markup_percent) || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-blue-300">
                      <span className="font-bold text-blue-900">Material Price:</span>
                      <span className="font-bold text-blue-700">
                        ${(((parseFloat(lineItemForm.quantity) || 0) * (parseFloat(lineItemForm.unit_cost) || 0)) * (1 + (parseFloat(lineItemForm.markup_percent) || 0) / 100)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
                        ${((parseFloat(lineItemForm.labor_hours) || 0) * (parseFloat(lineItemForm.labor_rate) || 0)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="flex justify-between mb-1">
                      <span className="text-slate-600">Markup:</span>
                      <span className="font-semibold">
                        ${(((parseFloat(lineItemForm.labor_hours) || 0) * (parseFloat(lineItemForm.labor_rate) || 0)) * (parseFloat(lineItemForm.labor_markup_percent) || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-amber-300">
                      <span className="font-bold text-amber-900">Labor Price:</span>
                      <span className="font-bold text-amber-700">
                        ${(((parseFloat(lineItemForm.labor_hours) || 0) * (parseFloat(lineItemForm.labor_rate) || 0)) * (1 + (parseFloat(lineItemForm.labor_markup_percent) || 0) / 100)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
                      ${((parseFloat(lineItemForm.labor_hours) || 0) * (parseFloat(lineItemForm.labor_rate) || 0)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex justify-between mb-1 text-sm">
                    <span className="text-slate-600">Markup:</span>
                    <span className="font-semibold">
                      ${(((parseFloat(lineItemForm.labor_hours) || 0) * (parseFloat(lineItemForm.labor_rate) || 0)) * (parseFloat(lineItemForm.labor_markup_percent) || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-amber-300">
                    <span className="font-bold text-amber-900">Total Labor Price:</span>
                    <span className="font-bold text-amber-700 text-lg">
                      ${(((parseFloat(lineItemForm.labor_hours) || 0) * (parseFloat(lineItemForm.labor_rate) || 0)) * (1 + (parseFloat(lineItemForm.labor_markup_percent) || 0) / 100)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
                      ${((parseFloat(lineItemForm.quantity) || 0) * (parseFloat(lineItemForm.unit_cost) || 0)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex justify-between mb-1 text-sm">
                    <span className="text-slate-600">Markup:</span>
                    <span className="font-semibold">
                      ${(((parseFloat(lineItemForm.quantity) || 0) * (parseFloat(lineItemForm.unit_cost) || 0)) * (parseFloat(lineItemForm.markup_percent) || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-blue-300">
                    <span className="font-bold text-blue-900">Total Material Price:</span>
                    <span className="font-bold text-blue-700 text-lg">
                      ${(((parseFloat(lineItemForm.quantity) || 0) * (parseFloat(lineItemForm.unit_cost) || 0)) * (1 + (parseFloat(lineItemForm.markup_percent) || 0) / 100)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
                    ).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
          quoteId={quote?.id ?? undefined}
          onClose={() => {
            setShowSubUploadDialog(false);
            loadSubcontractorEstimates(quote?.id ?? null, !!isReadOnly);
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

            <div>
              <Label className="mb-2 block">Style</Label>
              <Select value={exportTheme} onValueChange={(v) => setExportTheme(v as 'default' | 'premium')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Default (black &amp; white)</SelectItem>
                  <SelectItem value="premium">Dark Green &amp; Gold</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">Premium uses dark green and gold for a modern, polished look.</p>
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

      {/* In-app PDF viewer - proposal preview */}
      <Dialog open={showPdfView} onOpenChange={(open) => { if (!open) closePdfView(); }}>
        <DialogContent className="!max-w-[95vw] w-[95vw] !h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 border-b bg-slate-50 shrink-0">
            <DialogTitle className="text-base font-semibold">Proposal Preview</DialogTitle>
            <div className="flex items-center gap-3">
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handlePrintProposal} disabled={!pdfViewHtml}>
                  <Printer className="w-4 h-4 mr-1" />Print
                </Button>
                <Button variant="outline" size="sm" onClick={handleDownloadPdf} disabled={!pdfViewHtml} title="Opens print dialog — choose Save as PDF to download a file that looks exactly like the printout">
                  <Download className="w-4 h-4 mr-1" />Export PDF
                </Button>
                <Button variant="outline" size="sm" onClick={closePdfView}>
                  Close
                </Button>
              </div>
              <p className="text-xs text-muted-foreground hidden sm:block">PDF and print use the same layout. For Export PDF, choose &quot;Save as PDF&quot; in the dialog.</p>
            </div>
          </div>
          <div className="flex-1 min-h-[400px] relative bg-white overflow-hidden">
            {pdfPrintUrl ? (
              <iframe
                ref={pdfIframeRef}
                title="Proposal preview"
                src={pdfPrintUrl}
                className="absolute inset-0 w-full h-full border-0"
              />
            ) : pdfViewHtml ? (
              <iframe
                ref={pdfIframeRef}
                title="Proposal preview"
                srcDoc={pdfViewHtml}
                className="absolute inset-0 w-full h-full border-0"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-slate-500">Loading proposal...</div>
            )}
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
                          {sub.company_name} - ${(sub.total_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
          if (open) setTemplateQuoteIdForNewProposal(quote?.id ?? null);
          if (!open) setProposalChangeNotes('');
          setShowCreateProposalDialog(open);
        }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Proposal</DialogTitle>
            <DialogDescription>
              Choose a proposal to use as a template. A new proposal will be created with its own materials and workbook; the template is not changed.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Use as template</Label>
              <Select
                value={templateQuoteIdForNewProposal ?? '__blank__'}
                onValueChange={(v) => setTemplateQuoteIdForNewProposal(v === '__blank__' ? null : v)}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select a proposal or start blank" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__blank__">Start from blank (empty proposal)</SelectItem>
                  {allJobQuotes.map((q: any) => (
                    <SelectItem key={q.id} value={q.id}>
                      Proposal #{q.proposal_number ?? q.quote_number ?? q.id?.slice(0, 8)}
                      {q.id === quote?.id ? ' (current)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                The new proposal will be fully editable. The selected template is copied only; it is not locked or modified.
              </p>
            </div>
            <div className="bg-blue-50 border border-blue-300 rounded-lg p-3 text-sm">
              <div className="flex items-start gap-2">
                <Lock className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-blue-900 mb-1">What happens:</p>
                  <ul className="text-blue-800 space-y-1 list-disc list-inside">
                    <li>A new proposal is created with an incremented number</li>
                    <li>If you chose a template, all materials, rows, and subcontractors are copied to the new proposal</li>
                    <li>The new proposal has its own independent workbook; edits do not affect the template or any other proposal</li>
                    <li>You will be switched to the new proposal to edit it</li>
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
            <div className="flex flex-col gap-3">
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowCreateProposalDialog(false);
                    setProposalChangeNotes('');
                    setTemplateQuoteIdForNewProposal(quote?.id ?? null);
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
          </div>
        </DialogContent>
      </Dialog>

      {/* Compare two proposals */}
      <Dialog open={showProposalComparison} onOpenChange={setShowProposalComparison}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <ProposalComparisonView
            job={job}
            quotes={allJobQuotes.map((q: any) => ({ id: q.id, proposal_number: q.proposal_number, quote_number: q.quote_number, created_at: q.created_at }))}
            onClose={() => setShowProposalComparison(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Delete proposal — 2-step: trash opens this dialog; user must confirm */}
      <Dialog open={showDeleteProposalConfirm} onOpenChange={(open) => { if (!open) { setShowDeleteProposalConfirm(false); setDeleteProposalQuoteId(null); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="w-5 h-5" />
              Delete proposal?
            </DialogTitle>
            <DialogDescription>
              This will permanently delete this proposal and its materials workbook. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => { setShowDeleteProposalConfirm(false); setDeleteProposalQuoteId(null); }}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (deleteProposalQuoteId) {
                  await deleteProposal(deleteProposalQuoteId);
                  setShowDeleteProposalConfirm(false);
                  setDeleteProposalQuoteId(null);
                }
              }}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete
            </Button>
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
                          {version.estimated_price ? `$${version.estimated_price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'N/A'}
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

      {/* Floating Document Viewer — only when not using the materials-panel document view */}
      {!documentPanel && (
        <FloatingDocumentViewer
          jobId={job.id}
          open={showDocumentViewer}
          onClose={() => setShowDocumentViewer(false)}
        />
      )}

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
