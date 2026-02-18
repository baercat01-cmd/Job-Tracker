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
import { Plus, Trash2, DollarSign, Clock, TrendingUp, Percent, Calculator, FileSpreadsheet, ChevronDown, Briefcase, Edit, Upload, MoreVertical, List, Eye, Check, X, GripVertical, Download, History, Lock, Calendar } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { Badge } from '@/components/ui/badge';
import { SubcontractorEstimatesManagement } from './SubcontractorEstimatesManagement';
import { generateProposalHTML } from './ProposalPDFTemplate';
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
function SortableRow({ item, ...props }: any) {
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
      
      // Base cost includes ONLY materials + taxable subcontractors (NOT linked rows)
      const sheetBaseCost = sheet.totalPrice + linkedSubsTaxableTotal;
      const sheetMarkup = sheetMarkups[sheet.sheetId] || 10;
      // Final price = (materials with sheet markup) + (linked rows with their own markup)
      const sheetFinalPrice = (sheetBaseCost * (1 + sheetMarkup / 100)) + linkedRowsTotal;
      
      // Total labor for display (sheet labor + non-taxable subcontractor)
      const totalLaborCost = sheetLaborTotal + linkedSubsNonTaxableTotal;

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
                  <h3 className="text-sm font-bold text-slate-900 truncate">{sheet.sheetName}</h3>
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

            {/* Pricing */}
            <div className="flex items-center gap-3 flex-shrink-0">
              <div className="text-right">
                <div className="flex items-center gap-2 text-xs text-slate-600">
                  <span>Base: ${sheetBaseCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  <span>+</span>
                  <Input
                    type="number"
                    value={sheetMarkups[sheet.sheetId] || 10}
                    onChange={(e) => {
                      const newMarkup = parseFloat(e.target.value) || 0;
                      setSheetMarkups((prev: any) => ({ ...prev, [sheet.sheetId]: newMarkup }));
                    }}
                    className="w-14 h-5 text-xs px-1 text-center"
                    step="1"
                    min="0"
                  />
                  <span>%</span>
                </div>
                <p className="text-base font-bold text-slate-900">${sheetFinalPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                {totalLaborCost > 0 && (
                  <p className="text-xs text-amber-700 font-semibold mt-0.5">
                    Labor: ${totalLaborCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </p>
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
                  <DropdownMenuItem onClick={() => openSubcontractorDialog(sheet.sheetId, 'sheet')}>
                    <Briefcase className="w-3 h-3 mr-2" />
                    Add Subcontractor
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Description */}
          <div className="ml-10 mr-[280px]">
            <Textarea
              key={`sheet-desc-${sheet.sheetId}-${sheet.sheetDescription}`}
              defaultValue={sheet.sheetDescription || ''}
              placeholder="Click to add description..."
              className="text-xs text-slate-600 resize-none border border-transparent hover:border-slate-200 focus:border-blue-300 p-1.5 min-h-0 bg-slate-50/50 hover:bg-slate-50 focus:bg-white rounded transition-colors focus-visible:ring-1 focus-visible:ring-blue-300 focus-visible:ring-offset-0"
              rows={Math.max(2, Math.ceil((sheet.sheetDescription || '').length / 120) + 1)}
              onBlur={async (e) => {
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
          </div>

          <CollapsibleContent>
            <div className="mt-2 ml-10 space-y-3">
              {/* Material Items by Category */}
              {sheet.categories && sheet.categories.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Material Items</p>
                  {sheet.categories.map((category: any, catIdx: number) => (
                    <div key={catIdx} className="bg-slate-50 border border-slate-200 rounded p-2">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <p className="text-xs font-semibold text-slate-900">{category.name}</p>
                          <p className="text-xs text-slate-600">{category.itemCount} items</p>
                        </div>
                        <div className="flex items-center gap-4 text-xs">
                          <div className="text-right">
                            <p className="text-slate-500">Cost</p>
                            <p className="font-semibold text-slate-900">${category.totalCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-slate-500">Price</p>
                            <p className="font-bold text-blue-700">${category.totalPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {linkedRows.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide">Additional Materials</p>
                  {linkedRows.map((row: any) => {
                    const lineItems = customRowLineItems[row.id] || [];
                    const baseCost = lineItems.length > 0
                      ? lineItems.reduce((itemSum: number, item: any) => itemSum + item.total_cost, 0)
                      : row.total_cost;
                    const finalPrice = baseCost * (1 + row.markup_percent / 100);

                    return (
                      <div key={row.id} className="bg-blue-50 border border-blue-200 rounded p-2">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold text-slate-900">{row.description}</p>
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-bold text-slate-900">${finalPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                            <p className="text-xs text-slate-600">+{row.markup_percent}%</p>
                            <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => openAddDialog(row)}>
                              <Edit className="w-3 h-3" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => deleteRow(row.id)}>
                              <Trash2 className="w-3 h-3 text-red-600" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

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
                const taxableTotal = lineItems.filter((item: any) => !item.excluded && item.taxable).reduce((sum: number, item: any) => sum + item.total_price, 0);
                const nonTaxableTotal = lineItems.filter((item: any) => !item.excluded && !item.taxable).reduce((sum: number, item: any) => sum + item.total_price, 0);
                const totalWithMarkup = (taxableTotal + nonTaxableTotal) * (1 + (sub.markup_percent || 0) / 100);

                return (
                  <div key={sub.id} className="bg-purple-50 border border-purple-200 rounded p-2">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <p className="text-xs font-semibold text-slate-900">{sub.company_name}</p>
                        <p className="text-xs text-slate-600">
                          Taxable: ${taxableTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })} | 
                          Non-Taxable: ${nonTaxableTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-bold text-slate-900">
                          ${totalWithMarkup.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </p>
                        <p className="text-xs text-slate-600">+{sub.markup_percent || 0}%</p>
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
      
      // Base cost includes line items (or row total) + taxable subcontractors
      const baseLineCost = lineItems.length > 0
        ? lineItems.reduce((itemSum: number, item: any) => itemSum + item.total_cost, 0)
        : row.total_cost;
      const baseCost = baseLineCost + linkedSubsTaxableTotal;
      const finalPrice = baseCost * (1 + row.markup_percent / 100);
      
      // Total labor for display (custom labor + non-taxable subcontractor)
      const totalLaborCost = customLaborTotal + linkedSubsNonTaxableTotal;

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
                  <h3 className="text-sm font-bold text-slate-900 truncate">{row.description}</h3>
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

            {/* Pricing */}
            <div className="flex items-center gap-3 flex-shrink-0">
              <div className="text-right">
                <div className="flex items-center gap-2 text-xs text-slate-600">
                  <span>Base: ${baseCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  <span>+</span>
                  <Input
                    type="number"
                    defaultValue={row.markup_percent || 0}
                    onBlur={(e) => {
                      const newMarkup = parseFloat(e.target.value) || 0;
                      if (newMarkup !== row.markup_percent) {
                        updateCustomRowMarkup(row.id, newMarkup);
                      }
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="w-14 h-5 text-xs px-1 text-center"
                    step="1"
                    min="0"
                  />
                  <span>%</span>
                </div>
                <p className="text-base font-bold text-slate-900">${finalPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                {totalLaborCost > 0 && (
                  <p className="text-xs text-amber-700 font-semibold mt-0.5">
                    Labor: ${totalLaborCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </p>
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
          </div>

          {/* Notes */}
          <div className="ml-10 mr-[280px]">
            <Textarea
              key={`row-notes-${row.id}-${row.notes}`}
              defaultValue={row.notes || ''}
              placeholder="Click to add notes..."
              className="text-xs text-slate-600 resize-none border border-transparent hover:border-slate-200 focus:border-blue-300 p-1.5 min-h-0 bg-slate-50/50 hover:bg-slate-50 focus:bg-white rounded transition-colors focus-visible:ring-1 focus-visible:ring-blue-300 focus-visible:ring-offset-0"
              rows={Math.max(2, Math.ceil((row.notes || '').length / 120) + 1)}
              onBlur={async (e) => {
                const newValue = e.target.value.trim();
                if (newValue !== (row.notes || '')) {
                  try {
                    await supabase
                      .from('custom_financial_rows')
                      .update({ notes: newValue || null })
                      .eq('id', row.id);
                    await loadCustomRows();
                  } catch (error) {
                    console.error('Error saving notes:', error);
                  }
                }
              }}
            />
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
                    {lineItems.map((lineItem: any) => (
                      <div key={lineItem.id} className="bg-slate-50 border border-slate-200 rounded p-2">
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
                            <Badge variant={lineItem.taxable ? 'default' : 'secondary'} className="text-xs h-5">
                              {lineItem.taxable ? 'Material (Tax)' : 'Labor'}
                            </Badge>
                            <p className="text-xs font-bold text-slate-900">
                              ${lineItem.total_cost.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </p>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-5 w-5 p-0"
                              onClick={() => openLineItemDialog(row.id, lineItem)}
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
                    ))}
                  </>
                )}

                {linkedSubs.map((sub: any) => {
                  const subLineItems = subcontractorLineItems[sub.id] || [];
                  const taxableTotal = subLineItems.filter((item: any) => !item.excluded && item.taxable).reduce((sum: number, item: any) => sum + item.total_price, 0);
                  const nonTaxableTotal = subLineItems.filter((item: any) => !item.excluded && !item.taxable).reduce((sum: number, item: any) => sum + item.total_price, 0);
                  const totalWithMarkup = (taxableTotal + nonTaxableTotal) * (1 + (sub.markup_percent || 0) / 100);

                  return (
                    <div key={sub.id} className="bg-purple-50 border border-purple-200 rounded p-2">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <p className="text-xs font-semibold text-slate-900">{sub.company_name}</p>
                          <p className="text-xs text-slate-600">
                            Taxable: ${taxableTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })} | 
                            Non-Taxable: ${nonTaxableTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-bold text-slate-900">
                            ${totalWithMarkup.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </p>
                          <p className="text-xs text-slate-600">+{sub.markup_percent || 0}%</p>
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
                  <h3 className="text-sm font-bold text-slate-900 truncate">{est.company_name}</h3>
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

            {/* Pricing */}
            <div className="flex items-center gap-3 flex-shrink-0">
              <div className="text-right">
                <div className="flex items-center gap-2 text-xs text-slate-600">
                  <span>Base: ${includedTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  <span>+</span>
                  <Input
                    type="number"
                    value={estMarkup}
                    onChange={(e) => {
                      const newMarkup = parseFloat(e.target.value) || 0;
                      updateSubcontractorMarkup(est.id, newMarkup);
                    }}
                    className="w-14 h-5 text-xs px-1 text-center"
                    step="1"
                    min="0"
                  />
                  <span>%</span>
                </div>
                <p className="text-base font-bold text-slate-900">${finalPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
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
          </div>

          {/* Description */}
          <div className="ml-10 mr-[280px]">
            <Textarea
              key={`sub-scope-${est.id}-${est.scope_of_work}`}
              defaultValue={est.scope_of_work || ''}
              placeholder="Click to add description..."
              className="text-xs text-slate-600 resize-none border border-transparent hover:border-slate-200 focus:border-blue-300 p-1.5 min-h-0 bg-slate-50/50 hover:bg-slate-50 focus:bg-white rounded transition-colors focus-visible:ring-1 focus-visible:ring-blue-300 focus-visible:ring-offset-0"
              rows={Math.max(2, Math.ceil((est.scope_of_work || '').length / 120) + 1)}
              onBlur={async (e) => {
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
                          <p className={`text-xs font-semibold ${lineItem.excluded ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                            ${lineItem.total_price.toLocaleString('en-US', { minimumFractionDigits: 2 })}
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
  
  // Line item dialog state
  const [showLineItemDialog, setShowLineItemDialog] = useState(false);
  const [editingLineItem, setEditingLineItem] = useState<CustomRowLineItem | null>(null);
  const [lineItemParentRowId, setLineItemParentRowId] = useState<string | null>(null);
  const [lineItemType, setLineItemType] = useState<'material' | 'labor'>('material');
  const [lineItemForm, setLineItemForm] = useState({
    description: '',
    quantity: '1',
    unit_cost: '0',
    notes: '',
    taxable: true,
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
  const [linkedSheetId, setLinkedSheetId] = useState<string | null>(null);

  // Form state for labor pricing
  const [hourlyRate, setHourlyRate] = useState('60');
  
  // Export dialog state
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [showLineItems, setShowLineItems] = useState(false); // Default to false - no row pricing by default
  const [exportViewType, setExportViewType] = useState<'customer' | 'office'>('customer');
  const [exporting, setExporting] = useState(false);
  
  // Proposal versioning state
  const [quote, setQuote] = useState<any>(null);
  const [proposalVersions, setProposalVersions] = useState<any[]>([]);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [showCreateVersionDialog, setShowCreateVersionDialog] = useState(false);
  const [versionChangeNotes, setVersionChangeNotes] = useState('');
  const [creatingVersion, setCreatingVersion] = useState(false);
  const [initializingVersions, setInitializingVersions] = useState(false);
  
  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    loadData(false); // Initial load with spinner
    loadQuoteData(); // Load proposal/quote data
    
    // Set up polling for real-time updates (every 5 seconds)
    const pollInterval = setInterval(() => {
        loadData(true); // Silent updates during polling
        loadQuoteData(); // Also refresh quote data
    }, 5000);
    
    return () => clearInterval(pollInterval);
  }, [job.id]);

  // Auto-create quote whenever materials data changes (if no quote exists)
  useEffect(() => {
    // Only auto-create if:
    // 1. No quote exists yet
    // 2. Materials data has been loaded (not empty initial state)
    // 3. There are actual materials/rows/subcontractors
    if (!quote && !loading && (
      materialsBreakdown.sheetBreakdowns.length > 0 ||
      customRows.length > 0 ||
      subcontractorEstimates.length > 0
    )) {
      console.log('🔄 Materials detected, auto-creating quote...');
      checkAndAutoCreateQuote();
    }
  }, [materialsBreakdown, customRows, subcontractorEstimates, quote, loading]);

  async function loadQuoteData() {
    try {
      let quoteData = null;
      
      // Try 1: Direct job_id match
      const { data: directMatch, error: directError } = await supabase
        .from('quotes')
        .select('*')
        .eq('job_id', job.id)
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

      if (quoteData) {
        setQuote(quoteData);
        console.log('Quote loaded:', quoteData.proposal_number || quoteData.quote_number);
        
        const { data: versionsData, error: versionsError } = await supabase
          .from('proposal_versions')
          .select('*')
          .eq('quote_id', quoteData.id)
          .order('version_number', { ascending: false });

        if (!versionsError && versionsData) {
          setProposalVersions(versionsData || []);
          console.log('Loaded', versionsData.length, 'proposal versions');
        } else {
          setProposalVersions([]);
          console.log('No proposal versions found');
        }
      } else {
        // No quote found - will check after data loads
        console.log('No quote found for job - will check after loading data');
        setQuote(null);
        setProposalVersions([]);
      }
    } catch (error: any) {
      console.error('Error loading quote data:', error);
    }
  }

  async function openVersionHistoryDialog() {
    if (!quote) return;
    
    setLoadingVersions(true);
    setShowVersionHistory(true);
    
    try {
      const { data, error } = await supabase
        .from('proposal_versions')
        .select('*')
        .eq('quote_id', quote.id)
        .order('version_number', { ascending: false });

      if (error) throw error;
      setProposalVersions(data || []);
    } catch (error: any) {
      console.error('Error loading version history:', error);
      toast.error('Failed to load version history');
    } finally {
      setLoadingVersions(false);
    }
  }

  async function initializeVersioning() {
    if (!quote || !profile) return;

    if (!confirm(
      'Initialize version tracking for this proposal?\n\n' +
      'This will create Version 1 from the current proposal state.\n\n' +
      'Continue?'
    )) {
      return;
    }

    setInitializingVersions(true);
    
    try {
      const { data, error } = await supabase.rpc('create_proposal_version', {
        p_quote_id: quote.id,
        p_created_by: profile.id,
        p_change_notes: 'Initial version - migrated from existing proposal',
      });

      if (error) throw error;

      toast.success('Version tracking initialized! Version 1 created.');
      await loadQuoteData();
    } catch (error: any) {
      console.error('Error initializing versions:', error);
      toast.error('Failed to initialize versions: ' + error.message);
    } finally {
      setInitializingVersions(false);
    }
  }

  async function createNewProposalVersion() {
    if (!quote || !profile) return;

    setCreatingVersion(true);
    
    try {
      const { data, error } = await supabase.rpc('create_proposal_version', {
        p_quote_id: quote.id,
        p_created_by: profile.id,
        p_change_notes: versionChangeNotes || null,
      });

      if (error) throw error;

      toast.success(`Version ${data} created successfully`);
      setShowCreateVersionDialog(false);
      setVersionChangeNotes('');
      await loadQuoteData();
    } catch (error: any) {
      console.error('Error creating version:', error);
      toast.error('Failed to create version: ' + error.message);
    } finally {
      setCreatingVersion(false);
    }
  }

  async function signAndLockVersion(versionId: string) {
    if (!profile) return;

    if (!confirm(
      'Set this as the contract version?\n\n' +
      'This will:\n' +
      '• Mark Version ' + (proposalVersions.find(v => v.id === versionId)?.version_number || '') + ' as the signed contract\n' +
      '• Lock this version permanently (cannot be edited)\n' +
      '• Create a new working version for future changes\n\n' +
      'Continue?'
    )) {
      return;
    }

    try {
      // Mark version as signed
      const { error: signError } = await supabase
        .from('proposal_versions')
        .update({
          is_signed: true,
          signed_at: new Date().toISOString(),
          signed_by: profile.id,
        })
        .eq('id', versionId);

      if (signError) throw signError;

      // Get the version number that was signed
      const { data: signedVersion, error: getError } = await supabase
        .from('proposal_versions')
        .select('version_number, quote_id')
        .eq('id', versionId)
        .single();

      if (getError) throw getError;

      // Update quote to track signed version
      const { error: quoteError } = await supabase
        .from('quotes')
        .update({ signed_version: signedVersion.version_number })
        .eq('id', signedVersion.quote_id);

      if (quoteError) throw quoteError;

      // Create new working version automatically
      const { error: newVersionError } = await supabase.rpc('create_proposal_version', {
        p_quote_id: signedVersion.quote_id,
        p_created_by: profile.id,
        p_change_notes: `Created after signing version ${signedVersion.version_number}`,
      });

      if (newVersionError) throw newVersionError;

      toast.success(
        `Version ${signedVersion.version_number} signed and locked!\n` +
        `New working version ${signedVersion.version_number + 1} created.`
      );
      
      await loadQuoteData();
    } catch (error: any) {
      console.error('Error signing version:', error);
      toast.error('Failed to sign version: ' + error.message);
    }
  }

  async function checkAndAutoCreateQuote() {
    // Only run if we don't have a quote yet
    if (quote) return;
    
    try {
      console.log('🔍 Checking if auto-create quote is needed for job:', job.id);
      
      // Check 1: Materials in workbook
      const { data: workbookData, error: workbookError } = await supabase
        .from('material_workbooks')
        .select('id')
        .eq('job_id', job.id)
        .eq('status', 'working')
        .maybeSingle();
      
      if (workbookError) {
        console.error('❌ Error checking workbooks:', workbookError);
        throw workbookError;
      }
      
      let hasMaterials = false;
      if (workbookData) {
        const { data: sheetsData, error: sheetsError } = await supabase
          .from('material_sheets')
          .select('id')
          .eq('workbook_id', workbookData.id);
        
        if (sheetsError) {
          console.error('❌ Error checking sheets:', sheetsError);
          throw sheetsError;
        }
        
        if (sheetsData && sheetsData.length > 0) {
          const { count, error: countError } = await supabase
            .from('material_items')
            .select('*', { count: 'exact', head: true })
            .in('sheet_id', sheetsData.map(s => s.id));
          
          if (countError) {
            console.error('❌ Error counting materials:', countError);
            throw countError;
          }
          
          hasMaterials = (count || 0) > 0;
          console.log(`📦 Found ${count || 0} material items`);
        }
      }
      
      // Check 2: Custom financial rows
      const { count: rowsCount, error: rowsError } = await supabase
        .from('custom_financial_rows')
        .select('*', { count: 'exact', head: true })
        .eq('job_id', job.id);
      
      if (rowsError) {
        console.error('❌ Error checking custom rows:', rowsError);
        throw rowsError;
      }
      
      const hasCustomRows = (rowsCount || 0) > 0;
      console.log(`📋 Found ${rowsCount || 0} custom rows`);
      
      // Check 3: Subcontractor estimates
      const { count: subsCount, error: subsError } = await supabase
        .from('subcontractor_estimates')
        .select('*', { count: 'exact', head: true })
        .eq('job_id', job.id);
      
      if (subsError) {
        console.error('❌ Error checking subcontractors:', subsError);
        throw subsError;
      }
      
      const hasSubcontractors = (subsCount || 0) > 0;
      console.log(`👷 Found ${subsCount || 0} subcontractor estimates`);
      
      if (!hasMaterials && !hasCustomRows && !hasSubcontractors) {
        console.log('❌ No data found - skipping auto-create');
        return;
      }

      console.log('✅ Data found! Auto-creating quote...');

      // Auto-create quote for this job
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

      if (createError) {
        console.error('❌ Error auto-creating quote:', createError);
        toast.error(
          'Failed to auto-create proposal number. Please click the "Generate Proposal Number" button manually.',
          { duration: 8000 }
        );
        throw createError;
      }

      console.log('✅ Auto-created quote:', newQuote.proposal_number);
      setQuote(newQuote);
      setProposalVersions([]);
      
      toast.success(`Proposal #${newQuote.proposal_number} created automatically`);
    } catch (error: any) {
      console.error('❌ Error in checkAndAutoCreateQuote:', error);
      toast.error(
        'Could not auto-create proposal number. Use the "Generate Proposal Number" button to create it manually.',
        { duration: 8000 }
      );
    }
  }

  async function manuallyCreateQuote() {
    if (quote) {
      toast.info('Proposal number already exists');
      return;
    }

    try {
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

      // Separate standalone vs linked subcontractors
      const linkedMap: Record<string, any[]> = {};
      newData.forEach(est => {
        if (est.sheet_id) {
          if (!linkedMap[est.sheet_id]) linkedMap[est.sheet_id] = [];
          linkedMap[est.sheet_id].push(est);
        } else if (est.row_id) {
          if (!linkedMap[est.row_id]) linkedMap[est.row_id] = [];
          linkedMap[est.row_id].push(est);
        }
      });
      setLinkedSubcontractors(linkedMap);

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
    setUnitCost('60');
    setMarkupPercent('0');
    setNotes('');
    setTaxable(true);
    setLinkedSheetId(null);
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
  function openLineItemDialog(rowId: string, lineItem?: CustomRowLineItem, itemType?: 'material' | 'labor') {
    setLineItemParentRowId(rowId);
    setLineItemType(itemType || 'material');
    
    if (lineItem) {
      setEditingLineItem(lineItem);
      setLineItemForm({
        description: lineItem.description,
        quantity: lineItem.quantity.toString(),
        unit_cost: lineItem.unit_cost.toString(),
        notes: lineItem.notes || '',
        taxable: lineItem.taxable !== undefined ? lineItem.taxable : true,
      });
    } else {
      setEditingLineItem(null);
      setLineItemForm({
        description: '',
        quantity: itemType === 'labor' ? '1' : '1',
        unit_cost: itemType === 'labor' ? '60' : '0',
        notes: '',
        taxable: itemType === 'material' ? true : false, // Material is taxable, labor is not
      });
    }
    
    setShowLineItemDialog(true);
  }

  async function saveLineItem(keepDialogOpen = false) {
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
      taxable: lineItemForm.taxable,
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

      if (keepDialogOpen) {
        // Reset form for adding another item, keeping the taxable status
        const currentTaxable = lineItemForm.taxable;
        setLineItemForm({
          description: '',
          quantity: '1',
          unit_cost: '0',
          notes: '',
          taxable: currentTaxable,
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
    } catch (error: any) {
      console.error('Error updating markup:', error);
      toast.error('Failed to update markup');
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
          const sheetMarkup = sheetMarkups[sheet.sheetId] || 10;
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
      
      // The Edge Function returns HTML for print-to-PDF, open in new tab
      const blob = new Blob([data], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      toast.success('PDF preview opened! Use your browser\'s Print dialog to save as PDF.');
      
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
  
  // Filter custom rows by category for subcontractor rows
  const customSubcontractorRows = standaloneCustomRows.filter(r => r.category === 'subcontractor');
  
  // Calculate totals from standalone custom rows, splitting by taxable/non-taxable
  let customRowsTaxableTotal = 0;
  let customRowsNonTaxableTotal = 0;
  
  standaloneCustomRows.forEach(row => {
    const { taxable, nonTaxable } = getCustomRowTaxableAndNonTaxable(row);
    customRowsTaxableTotal += taxable;
    customRowsNonTaxableTotal += nonTaxable;
  });
  
  // Materials: material sheets + custom material rows (TAXABLE)
  const materialSheetsPrice = materialsBreakdown.sheetBreakdowns.reduce((sum, sheet) => {
    // Calculate cost from linked custom rows (TAXABLE portions only, with their own markup)
    const linkedRows = customRows.filter(r => (r as any).sheet_id === sheet.sheetId);
    const linkedRowsTaxableTotal = linkedRows.reduce((rowSum, row) => {
      const { taxable } = getCustomRowTaxableAndNonTaxable(row);
      return rowSum + taxable;
    }, 0);
    
    // Calculate linked subcontractors (taxable portion only)
    const linkedSubs = linkedSubcontractors[sheet.sheetId] || [];
    const linkedSubsTotal = linkedSubs.reduce((sum, sub) => {
      const lineItems = subcontractorLineItems[sub.id] || [];
      const taxableTotal = lineItems
        .filter((item: any) => !item.excluded && item.taxable)
        .reduce((itemSum: number, item: any) => itemSum + item.total_price, 0);
      const estMarkup = sub.markup_percent || 0;
      return sum + (taxableTotal * (1 + estMarkup / 100));
    }, 0);
    
    // Sheet base cost = ONLY material items + linked taxable subcontractors (NOT linked rows)
    const sheetBaseCost = sheet.totalPrice + linkedSubsTotal;
    const sheetMarkup = sheetMarkups[sheet.sheetId] || 10;
    // Final = (materials with sheet markup) + (linked rows with their own markup already applied)
    return sum + (sheetBaseCost * (1 + sheetMarkup / 100)) + linkedRowsTaxableTotal;
  }, 0);
  
  const proposalMaterialsPrice = materialSheetsPrice + customRowsTaxableTotal;
  
  // Subcontractors: only standalone estimates (not linked to sheets/rows)
  // Material type items go to materials, labor type items go to labor
  const standaloneSubcontractors = subcontractorEstimates.filter(est => !est.sheet_id && !est.row_id);
  const subcontractorTaxablePrice = standaloneSubcontractors.reduce((sum, est) => {
    const lineItems = subcontractorLineItems[est.id] || [];
    const materialsTotal = lineItems
      .filter((item: any) => !item.excluded && (item.item_type || 'material') === 'material')
      .reduce((itemSum: number, item: any) => itemSum + (item.total_price || 0), 0);
    const estMarkup = est.markup_percent || 0;
    return sum + (materialsTotal * (1 + estMarkup / 100));
  }, 0);
  
  const subcontractorNonTaxablePrice = standaloneSubcontractors.reduce((sum, est) => {
    const lineItems = subcontractorLineItems[est.id] || [];
    const laborTotal = lineItems
      .filter((item: any) => !item.excluded && (item.item_type || 'material') === 'labor')
      .reduce((itemSum: number, item: any) => itemSum + (item.total_price || 0), 0);
    const estMarkup = est.markup_percent || 0;
    return sum + (laborTotal * (1 + estMarkup / 100));
  }, 0);
  
  // Linked subcontractors (attached to sheets/rows) - labor type items go to labor
  const linkedSubcontractorNonTaxablePrice = Object.values(linkedSubcontractors).flat().reduce((sum: number, sub: any) => {
    const lineItems = subcontractorLineItems[sub.id] || [];
    const laborTotal = lineItems
      .filter((item: any) => !item.excluded && (item.item_type || 'material') === 'labor')
      .reduce((itemSum: number, item: any) => itemSum + (item.total_price || 0), 0);
    const estMarkup = sub.markup_percent || 0;
    return sum + (laborTotal * (1 + estMarkup / 100));
  }, 0);
  
  const customSubcontractorPrice = customSubcontractorRows.reduce((sum, r) => {
    const lineItems = customRowLineItems[r.id] || [];
    const baseCost = lineItems.length > 0 
      ? lineItems.reduce((itemSum, item) => itemSum + item.total_cost, 0)
      : r.total_cost;
    return sum + (baseCost * (1 + r.markup_percent / 100));
  }, 0);
  
  // Total subcontractor taxable (goes to materials section)
  const proposalSubcontractorTaxablePrice = subcontractorTaxablePrice + customSubcontractorPrice;
  
  // Total subcontractor non-taxable (goes to labor section)
  const proposalSubcontractorNonTaxablePrice = subcontractorNonTaxablePrice + linkedSubcontractorNonTaxablePrice;
  
  // Labor: sheet labor + custom row labor + custom rows non-taxable + linked rows non-taxable + non-taxable subcontractor items
  const totalSheetLaborCost = materialsBreakdown.sheetBreakdowns.reduce((sum, sheet) => {
    const labor = sheetLabor[sheet.sheetId];
    
    // Add labor from linked custom rows (NON-TAXABLE portions)
    const linkedRows = customRows.filter(r => (r as any).sheet_id === sheet.sheetId);
    const linkedRowsNonTaxableTotal = linkedRows.reduce((rowSum, row) => {
      const { nonTaxable } = getCustomRowTaxableAndNonTaxable(row);
      return rowSum + nonTaxable;
    }, 0);
    
    // Add labor from linked subcontractors (non-taxable portion)
    const linkedSubs = linkedSubcontractors[sheet.sheetId] || [];
    const linkedSubsNonTaxableTotal = linkedSubs.reduce((subSum: number, sub: any) => {
      const subLineItems = subcontractorLineItems[sub.id] || [];
      const nonTaxableTotal = subLineItems
        .filter((item: any) => !item.excluded && !item.taxable)
        .reduce((itemSum: number, item: any) => itemSum + item.total_price, 0);
      const estMarkup = sub.markup_percent || 0;
      return subSum + (nonTaxableTotal * (1 + estMarkup / 100));
    }, 0);
    
    return sum + (labor ? labor.total_labor_cost : 0) + linkedRowsNonTaxableTotal + linkedSubsNonTaxableTotal;
  }, 0);
  
  const totalCustomRowLaborCost = Object.values(customRowLabor).reduce((sum: number, labor: any) => {
    return sum + (labor.estimated_hours * labor.hourly_rate);
  }, 0);
  
  const proposalLaborPrice = totalSheetLaborCost + totalCustomRowLaborCost + customRowsNonTaxableTotal + proposalSubcontractorNonTaxablePrice;
  
  // Combine materials with taxable subcontractors for display
  const proposalMaterialsTotalWithSubcontractors = proposalMaterialsPrice + proposalSubcontractorTaxablePrice;
  
  // Calculate subtotals
  const taxableSubtotal = proposalMaterialsPrice + proposalSubcontractorTaxablePrice;
  const nonTaxableSubtotal = proposalLaborPrice;
  
  // Tax calculated only on taxable items
  const proposalTotalTax = taxableSubtotal * TAX_RATE;
  
  // Grand total
  const proposalSubtotal = taxableSubtotal + nonTaxableSubtotal;
  const proposalGrandTotal = proposalSubtotal + proposalTotalTax;

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
      {/* Proposal Version Info Banner - Show if quote exists */}
      {quote && (
        <Card className="mb-4 border-blue-200 bg-blue-50">
          <CardContent className="py-3">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-semibold text-blue-900">
                  Proposal #{quote.proposal_number || quote.quote_number}
                </span>
              </div>
              {proposalVersions.length > 0 && (
                <>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      Version {quote.current_version || 1}
                    </Badge>
                    {quote.signed_version && (
                      <Badge className="text-xs bg-emerald-600">
                        <Lock className="w-3 h-3 mr-1" />
                        Contract v{quote.signed_version}
                      </Badge>
                    )}
                  </div>
                  {quote.estimated_price && (
                    <div className="text-sm text-blue-700">
                      Contract Price: <span className="font-bold">${quote.estimated_price.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                    </div>
                  )}
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <div className="flex items-center justify-between mb-4">
          <TabsList>
            <TabsTrigger value="cost-breakdown">Cost Breakdown</TabsTrigger>
            <TabsTrigger value="proposal">Proposal</TabsTrigger>
          </TabsList>
          
          {/* Action Buttons - Only show in Proposal tab */}
          {activeTab === 'proposal' && (
            <div className="flex gap-2">
              {/* Versioning Buttons - Show if quote exists */}
              {quote ? (
                <>
                  <Button
                    size="sm"
                    onClick={() => {
                      if (proposalVersions.length === 0) {
                        // Auto-initialize on first version creation
                        initializeVersioning();
                      } else {
                        setShowCreateVersionDialog(true);
                      }
                    }}
                    disabled={initializingVersions}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    {initializingVersions ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <Plus className="w-3 h-3 mr-2" />
                        Create Version
                      </>
                    )}
                  </Button>
                  {/* Show Sign & Lock for current version only */}
                  {proposalVersions.length > 0 && !quote.signed_version && (
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
                  {proposalVersions.length > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={openVersionHistoryDialog}
                      className="border-blue-300 hover:bg-blue-100"
                    >
                      <History className="w-3 h-3 mr-2" />
                      History ({proposalVersions.length})
                    </Button>
                  )}
                </>
              ) : (
                <Button
                  size="sm"
                  onClick={manuallyCreateQuote}
                  className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold animate-pulse"
                >
                  <FileSpreadsheet className="w-4 h-4 mr-2" />
                  Click Here to Generate Proposal Number
                </Button>
              )}
              <div className="h-6 w-px bg-border" />
              <Button onClick={() => setShowExportDialog(true)} variant="default" size="sm">
                <Download className="w-4 h-4 mr-2" />
                Export PDF
              </Button>
              <Button onClick={() => openAddDialog()} variant="outline" size="sm">
                <Plus className="w-4 h-4 mr-2" />
                Add Row
              </Button>
              <Button onClick={() => setShowSubUploadDialog(true)} variant="outline" size="sm">
                <Upload className="w-4 h-4 mr-2" />
                Upload Subcontractor Estimate
              </Button>
            </div>
          )}
        </div>

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
        </TabsContent>
      </Tabs>

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
                    // Auto-set taxable based on category as a helpful default
                    if (val === 'materials') {
                      setTaxable(true);
                    } else if (val === 'labor') {
                      setTaxable(false);
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="materials">Materials</SelectItem>
                    <SelectItem value="labor">Labor</SelectItem>
                    <SelectItem value="subcontractor">Subcontractor</SelectItem>
                    <SelectItem value="equipment">Equipment</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
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

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Quantity</Label>
                <Input
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  step="0.01"
                />
              </div>
              <div>
                <Label>Unit Cost ($)</Label>
                <Input
                  type="number"
                  value={unitCost}
                  onChange={(e) => setUnitCost(e.target.value)}
                  step="0.01"
                />
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

            <div>
              <Label>Description</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Enter detailed description of the work or materials..."
                rows={3}
              />
            </div>

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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingLineItem ? 'Edit ' : 'Add '}
              {lineItemType === 'labor' ? 'Labor' : 'Line Item'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Description</Label>
              <Input
                value={lineItemForm.description}
                onChange={(e) => setLineItemForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder={lineItemType === 'labor' ? 'e.g., Installation labor, Finishing work' : 'e.g., Concrete materials'}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{lineItemType === 'labor' ? 'Hours' : 'Quantity'}</Label>
                <Input
                  type="number"
                  value={lineItemForm.quantity}
                  onChange={(e) => setLineItemForm(prev => ({ ...prev, quantity: e.target.value }))}
                  step="0.01"
                  placeholder={lineItemType === 'labor' ? 'e.g., 8' : ''}
                />
              </div>
              <div>
                <Label>{lineItemType === 'labor' ? 'Hourly Rate ($)' : 'Unit Cost ($)'}</Label>
                <Input
                  type="number"
                  value={lineItemForm.unit_cost}
                  onChange={(e) => setLineItemForm(prev => ({ ...prev, unit_cost: e.target.value }))}
                  step="0.01"
                  placeholder={lineItemType === 'labor' ? '60' : ''}
                />
              </div>
            </div>

            {lineItemType === 'labor' && (
              <div className="bg-amber-50 border border-amber-200 rounded p-3">
                <p className="text-sm font-semibold text-amber-900">
                  Total Labor Cost: ${(
                    (parseFloat(lineItemForm.quantity) || 0) * 
                    (parseFloat(lineItemForm.unit_cost) || 0)
                  ).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </p>
              </div>
            )}

            <div>
              <Label>Notes (Optional)</Label>
              <Textarea
                value={lineItemForm.notes}
                onChange={(e) => setLineItemForm(prev => ({ ...prev, notes: e.target.value }))}
                rows={2}
              />
            </div>

            {lineItemType === 'material' && (
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="lineitem-taxable"
                  checked={lineItemForm.taxable}
                  onChange={(e) => setLineItemForm(prev => ({ ...prev, taxable: e.target.checked }))}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <Label htmlFor="lineitem-taxable" className="cursor-pointer">
                  Taxable
                </Label>
                <p className="text-xs text-muted-foreground ml-2">
                  {lineItemForm.taxable ? 'Will be included in taxable subtotal' : 'Tax exempt'}
                </p>
              </div>
            )}

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
                {editingLineItem ? 'Update' : 'Save'} {lineItemType === 'labor' ? 'Labor' : 'Line Item'}
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

      {/* Create New Version Dialog */}
      <Dialog open={showCreateVersionDialog} onOpenChange={setShowCreateVersionDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Proposal Version</DialogTitle>
            <DialogDescription>
              Create a snapshot of the current proposal state. This allows you to track changes over time.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Change Notes (Optional)</Label>
              <Textarea
                value={versionChangeNotes}
                onChange={(e) => setVersionChangeNotes(e.target.value)}
                placeholder="e.g., Updated pricing for customer request, Added optional items, Changed materials..."
                rows={3}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Describe what changed in this version to help track the proposal evolution
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowCreateVersionDialog(false);
                  setVersionChangeNotes('');
                }}
                disabled={creatingVersion}
              >
                Cancel
              </Button>
              <Button onClick={createNewProposalVersion} disabled={creatingVersion}>
                {creatingVersion ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4 mr-2" />
                    Create Version
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
    </div>
  );
}
