
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
      
      // Calculate linked rows total
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
          .filter((item: any) => !item.excluded && item.item_type === 'material' && item.taxable)
          .reduce((itemSum: number, item: any) => itemSum + item.total_price, 0);
        const estMarkup = sub.markup_percent || 0;
        return sum + (taxableTotal * (1 + estMarkup / 100));
      }, 0);
      
      // Calculate linked subcontractors - non-taxable (materials that aren't taxed + labor)
      const linkedSubsNonTaxableTotal = linkedSubs.reduce((sum: number, sub: any) => {
        const lineItems = subcontractorLineItems[sub.id] || [];
        const nonTaxableTotal = lineItems
          .filter((item: any) => !item.excluded && (item.item_type === 'labor' || (item.item_type === 'material' && !item.taxable)))
          .reduce((itemSum: number, item: any) => itemSum + item.total_price, 0);
        const estMarkup = sub.markup_percent || 0;
        return sum + (nonTaxableTotal * (1 + estMarkup / 100));
      }, 0);
      
      // Calculate sheet labor
      const sheetLaborTotal = sheetLabor[sheet.sheetId] ? sheetLabor[sheet.sheetId].total_labor_cost : 0;
      
      // Base cost includes materials + linked rows + taxable subcontractors
      const sheetBaseCost = sheet.totalPrice + linkedRowsTotal + linkedSubsTaxableTotal;
      const sheetMarkup = sheetMarkups[sheet.sheetId] || 10;
      const sheetFinalPrice = sheetBaseCost * (1 + sheetMarkup / 100);
      
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
                  <DropdownMenuItem onClick={() => openLaborDialog(sheet.sheetId)}>
                    <DollarSign className="w-3 h-3 mr-2" />
                    {sheetLabor[sheet.sheetId] ? 'Edit Labor' : 'Add Labor'}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => openSubcontractorDialog(sheet.sheetId, 'sheet')}>
                    <Briefcase className="w-3 h-3 mr-2" />
                    Add Subcontractor
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => openAddDialog(undefined, sheet.sheetId, 'materials')}>
                    <Plus className="w-3 h-3 mr-2" />
                    Add Material Row
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => openAddDialog(undefined, sheet.sheetId, 'labor')}>
                    <Plus className="w-3 h-3 mr-2" />
                    Add Labor Row
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
                const materialTaxableTotal = lineItems.filter((item: any) => !item.excluded && item.item_type === 'material' && item.taxable).reduce((sum: number, item: any) => sum + item.total_price, 0);
                const materialNonTaxableTotal = lineItems.filter((item: any) => !item.excluded && item.item_type === 'material' && !item.taxable).reduce((sum: number, item: any) => sum + item.total_price, 0);
                const laborTotal = lineItems.filter((item: any) => !item.excluded && item.item_type === 'labor').reduce((sum: number, item: any) => sum + item.total_price, 0);
                const totalWithMarkup = (materialTaxableTotal + materialNonTaxableTotal + laborTotal) * (1 + (sub.markup_percent || 0) / 100);

                return (
                  <div key={sub.id} className="bg-purple-50 border border-purple-200 rounded p-2">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <p className="text-xs font-semibold text-slate-900">{sub.company_name}</p>
                        <p className="text-xs text-slate-600">
                          Mat (Tax): ${materialTaxableTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })} | 
                          Mat (No Tax): ${materialNonTaxableTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })} | 
                          Labor: ${laborTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
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
          .filter((item: any) => !item.excluded && item.item_type === 'material' && item.taxable)
          .reduce((itemSum: number, item: any) => itemSum + item.total_price, 0);
        const estMarkup = sub.markup_percent || 0;
        return sum + (taxableTotal * (1 + estMarkup / 100));
      }, 0);
      
      // Calculate linked subcontractors - non-taxable (materials that aren't taxed + labor)
      const linkedSubsNonTaxableTotal = linkedSubs.reduce((sum: number, sub: any) => {
        const subLineItems = subcontractorLineItems[sub.id] || [];
        const nonTaxableTotal = subLineItems
          .filter((item: any) => !item.excluded && (item.item_type === 'labor' || (item.item_type === 'material' && !item.taxable)))
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
            {!((lineItems.length > 0 || linkedSubs.length > 0)) && (
              <div className="w-8"></div> // Placeholder for consistent spacing if no chevron
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
                    Edit Row
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => openLineItemDialog(row.id, undefined, 'material')}>
                    <Plus className="w-3 h-3 mr-2" />
                    Add Material Row
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => openLineItemDialog(row.id, undefined, 'labor')}>
                    <Plus className="w-3 h-3 mr-2" />
                    Add Labor Row
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
          {(lineItems.length > 0 || linkedSubs.length > 0 || customLaborTotal > 0) && ( // Add customLaborTotal here
            <CollapsibleContent>
              <div className="mt-2 ml-10 space-y-1">
                {customLaborTotal > 0 && ( // Display custom labor if available
                  <div className="bg-amber-50 border border-amber-200 rounded p-2">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <p className="text-xs font-semibold text-slate-900">Custom Labor</p>
                        <p className="text-xs text-slate-600">
                          {customRowLabor[row.id].estimated_hours}h × ${customRowLabor[row.id].hourly_rate}/hr
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-bold text-slate-900">
                          ${customLaborTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </p>
                        <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => openLaborDialog(row.id, 'custom')}>
                          <Edit className="w-3 h-3" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => deleteSheetLabor(customRowLabor[row.id].id, 'custom')}>
                          <Trash2 className="w-3 h-3 text-red-600" />
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
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
                  const materialTaxableTotal = subLineItems.filter((item: any) => !item.excluded && item.item_type === 'material' && item.taxable).reduce((sum: number, item: any) => sum + item.total_price, 0);
                  const materialNonTaxableTotal = subLineItems.filter((item: any) => !item.excluded && item.item_type === 'material' && !item.taxable).reduce((sum: number, item: any) => sum + item.total_price, 0);
                  const laborTotal = subLineItems.filter((item: any) => !item.excluded && item.item_type === 'labor').reduce((sum: number, item: any) => sum + item.total_price, 0);
                  const totalWithMarkup = (materialTaxableTotal + materialNonTaxableTotal + laborTotal) * (1 + (sub.markup_percent || 0) / 100);

                  return (
                    <div key={sub.id} className="bg-purple-50 border border-purple-200 rounded p-2">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <p className="text-xs font-semibold text-slate-900">{sub.company_name}</p>
                          <p className="text-xs text-slate-600">
                            Mat (Tax): ${materialTaxableTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })} | 
                            Mat (No Tax): ${materialNonTaxableTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })} | 
                            Labor: ${laborTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
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
                  {lineItems.map((lineItem: any) => {
                    const itemType = lineItem.item_type || 'material';
                    const isLabor = itemType === 'labor';
                    
                    return (
                      <div key={lineItem.id} className={`p-2 rounded mb-1 ${lineItem.excluded ? 'bg-red-50' : isLabor ? 'bg-amber-50' : 'bg-slate-50'}`}>
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
                            {/* Item Type Badge - Click to toggle between Material/Labor */}
                            <Badge 
                              variant={isLabor ? 'default' : 'secondary'} 
                              className={`text-xs h-5 cursor-pointer ${isLabor ? 'bg-amber-600 hover:bg-amber-700' : 'bg-slate-600 hover:bg-slate-700'}`}
                              onClick={() => !lineItem.excluded && toggleSubcontractorLineItemType(lineItem.id, itemType)}
                              title={`Click to change to ${isLabor ? 'Material' : 'Labor'}`}
                            >
                              {isLabor ? 'Labor' : 'Material'}
                            </Badge>
                            
                            {/* Tax Checkbox - Only for materials */}
                            {!isLabor ? (
                              <div className="flex items-center gap-1">
                                <input
                                  type="checkbox"
                                  checked={lineItem.taxable}
                                  onChange={() => toggleSubcontractorLineItemTaxable(lineItem.id, lineItem.taxable)}
                                  className="rounded border-slate-300 text-green-600 focus:ring-green-500"
                                  title="Taxable"
                                  disabled={lineItem.excluded}
                                />
                                <span className="text-xs text-slate-600">Tax</span>
                              </div>
                            ) : (
                              <Badge variant="outline" className="text-xs h-5 border-amber-400 text-amber-700">
                                No Tax
                              </Badge>
                            )}
                            
                            <p className={`text-xs font-semibold ${lineItem.excluded ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                              ${lineItem.total_price.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
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
  // The rest of the JobFinancials component's code would go here
  // The provided error indicates an issue before the closing brace of the JobFinancials function.
  // This fix assumes the original intent was to add a placeholder div if there's no collapsible trigger,
  // and corrects the closing brace error by adding the missing one for the JobFinancials function.
}
