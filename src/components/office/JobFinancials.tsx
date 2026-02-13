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
import { Plus, Trash2, DollarSign, Clock, TrendingUp, Percent, Calculator, FileSpreadsheet, ChevronDown, Briefcase, Edit, Upload, MoreVertical, List, Eye, Check, X, GripVertical } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { Badge } from '@/components/ui/badge';
import { SubcontractorEstimatesManagement } from './SubcontractorEstimatesManagement';
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
    deleteRow,
    deleteSheetLabor,
    toggleSubcontractorLineItem,
    updateSubcontractorMarkup,
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
      const linkedRowsTotal = linkedRows.reduce((rowSum: number, row: any) => {
        const lineItems = customRowLineItems[row.id] || [];
        const baseCost = lineItems.length > 0
          ? lineItems.reduce((itemSum: number, item: any) => itemSum + item.total_cost, 0)
          : row.total_cost;
        return rowSum + (baseCost * (1 + row.markup_percent / 100));
      }, 0);
      const sheetBaseCost = sheet.totalPrice + linkedRowsTotal;
      const sheetMarkup = sheetMarkups[sheet.sheetId] || 10;
      const sheetFinalPrice = sheetBaseCost * (1 + sheetMarkup / 100);

      return (
        <Collapsible className="border rounded bg-white p-2">
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
                  <DropdownMenuItem onClick={() => openAddDialog(undefined, sheet.sheetId)}>
                    <Plus className="w-3 h-3 mr-2" />
                    Add Material Row
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Description */}
          <div className="mt-1 ml-10 mr-[360px]">
            <Textarea
              value={sheet.sheetDescription}
              placeholder="Click to add description..."
              className="text-xs text-slate-600 resize-none border border-transparent hover:border-slate-200 focus:border-blue-300 p-2 min-h-0 bg-slate-50/50 hover:bg-slate-50 focus:bg-white rounded transition-colors focus-visible:ring-1 focus-visible:ring-blue-300 focus-visible:ring-offset-0"
              rows={Math.max(1, Math.ceil((sheet.sheetDescription || '').length / 100))}
              onChange={(e) => {
                const textarea = e.target;
                textarea.onblur = async () => {
                  try {
                    await supabase
                      .from('material_sheets')
                      .update({ description: e.target.value || null })
                      .eq('id', sheet.sheetId);
                    await loadMaterialsData();
                  } catch (error) {
                    console.error('Error saving description:', error);
                  }
                };
              }}
              style={{
                maxHeight: '120px',
                overflowY: (sheet.sheetDescription || '').length > 500 ? 'auto' : 'hidden'
              }}
            />
          </div>

          <CollapsibleContent>
            <div className="mt-2 ml-10 space-y-1">
              {linkedRows.length > 0 && (
                <div className="space-y-1 mb-2">
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
            </div>
          </CollapsibleContent>
        </Collapsible>
      );
    } else if (item.type === 'custom') {
      const row = item.data;
      const lineItems = customRowLineItems[row.id] || [];
      const baseCost = lineItems.length > 0
        ? lineItems.reduce((itemSum: number, item: any) => itemSum + item.total_cost, 0)
        : row.total_cost;
      const finalPrice = baseCost * (1 + row.markup_percent / 100);

      return (
        <Collapsible className="border rounded bg-white p-2">
          <div className="flex items-start gap-2">
            {/* Drag Handle */}
            <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing py-1">
              <GripVertical className="w-4 h-4 text-slate-400" />
            </div>

            {/* Chevron (only if has line items) */}
            {lineItems.length > 0 && (
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
                  {lineItems.length > 0 && (
                    <Badge variant="outline" className="text-xs">
                      {lineItems.length} item{lineItems.length !== 1 ? 's' : ''}
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
                  <span>+{row.markup_percent}%</span>
                </div>
                <p className="text-base font-bold text-slate-900">${finalPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
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
                  <DropdownMenuItem onClick={() => openLineItemDialog(row.id)}>
                    <Plus className="w-3 h-3 mr-2" />
                    Add Line Item
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
          {row.notes && (
            <div className="mt-1 ml-10 mr-[360px]">
              <Textarea
                value={row.notes}
                placeholder="Click to add notes..."
                className="text-xs text-slate-600 resize-none border border-transparent hover:border-slate-200 focus:border-blue-300 p-2 min-h-0 bg-slate-50/50 hover:bg-slate-50 focus:bg-white rounded transition-colors focus-visible:ring-1 focus-visible:ring-blue-300 focus-visible:ring-offset-0"
                rows={Math.max(1, Math.ceil((row.notes || '').length / 100))}
                onChange={(e) => {
                  const textarea = e.target;
                  textarea.onblur = async () => {
                    try {
                      await supabase
                        .from('custom_financial_rows')
                        .update({ notes: e.target.value || null })
                        .eq('id', row.id);
                      await loadCustomRows();
                    } catch (error) {
                      console.error('Error saving notes:', error);
                    }
                  };
                }}
                style={{
                  maxHeight: '120px',
                  overflowY: (row.notes || '').length > 500 ? 'auto' : 'hidden'
                }}
              />
            </div>
          )}

          {/* Line Items */}
          {lineItems.length > 0 && (
            <CollapsibleContent>
              <div className="mt-2 ml-10 space-y-1">
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
        <Collapsible className="border rounded bg-white p-2">
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
          <div className="mt-1 ml-10 mr-[360px]">
            <Textarea
              value={est.scope_of_work || ''}
              placeholder="Click to add description..."
              className="text-xs text-slate-600 resize-none border border-transparent hover:border-slate-200 focus:border-blue-300 p-2 min-h-0 bg-slate-50/50 hover:bg-slate-50 focus:bg-white rounded transition-colors focus-visible:ring-1 focus-visible:ring-blue-300 focus-visible:ring-offset-0"
              rows={Math.max(1, Math.ceil((est.scope_of_work || '').length / 100))}
              onChange={(e) => {
                const textarea = e.target;
                textarea.onblur = async () => {
                  try {
                    await supabase
                      .from('subcontractor_estimates')
                      .update({ scope_of_work: e.target.value || null })
                      .eq('id', est.id);
                    await loadSubcontractorEstimates();
                  } catch (error) {
                    console.error('Error saving scope of work:', error);
                  }
                };
              }}
              style={{
                maxHeight: '120px',
                overflowY: (est.scope_of_work || '').length > 500 ? 'auto' : 'hidden'
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
                        />
                        <p className={`text-xs flex-1 ${lineItem.excluded ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                          {lineItem.description}
                        </p>
                        <p className={`text-xs font-semibold ${lineItem.excluded ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                          ${lineItem.total_price.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </p>
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
  
  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

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

  function openAddDialog(row?: CustomFinancialRow, sheetId?: string) {
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
        setCategory('materials');
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
      sheet_id: linkedSheetId || null,
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
  
  // Separate custom rows by category (exclude sheet-linked rows as they're already in materials)
  const customMaterialRows = customRows.filter(r => r.category === 'materials' && !(r as any).sheet_id);
  const customSubcontractorRows = customRows.filter(r => r.category === 'subcontractor' && !(r as any).sheet_id);
  const customLaborRows = customRows.filter(r => 
    (r.category === 'labor' || !r.taxable) && 
    r.category !== 'materials' && 
    r.category !== 'subcontractor' && 
    !(r as any).sheet_id
  );
  
  // Materials: material sheets + custom material rows (TAXABLE)
  const materialSheetsPrice = materialsBreakdown.sheetBreakdowns.reduce((sum, sheet) => {
    // Calculate cost from linked custom rows (already have their own markups applied)
    const linkedRows = customRows.filter(r => (r as any).sheet_id === sheet.sheetId);
    const linkedRowsTotal = linkedRows.reduce((rowSum, row) => {
      const lineItems = customRowLineItems[row.id] || [];
      const baseCost = lineItems.length > 0 
        ? lineItems.reduce((itemSum, item) => itemSum + item.total_cost, 0)
        : row.total_cost;
      return rowSum + (baseCost * (1 + row.markup_percent / 100));
    }, 0);
    
    // Sheet base cost = material items + linked custom rows
    const sheetBaseCost = sheet.totalPrice + linkedRowsTotal;
    const sheetMarkup = sheetMarkups[sheet.sheetId] || 10;
    return sum + (sheetBaseCost * (1 + sheetMarkup / 100));
  }, 0);
  
  const customMaterialsPrice = customMaterialRows.reduce((sum, r) => {
    const lineItems = customRowLineItems[r.id] || [];
    const baseCost = lineItems.length > 0 
      ? lineItems.reduce((itemSum, item) => itemSum + item.total_cost, 0)
      : r.total_cost;
    return sum + (baseCost * (1 + r.markup_percent / 100));
  }, 0);
  
  const proposalMaterialsPrice = materialSheetsPrice + customMaterialsPrice;
  
  // Subcontractors: estimates + custom subcontractor rows (TAXABLE)
  const subcontractorEstimatesPrice = subcontractorEstimates.reduce((sum, est) => {
    const lineItems = subcontractorLineItems[est.id] || [];
    const includedTotal = lineItems
      .filter((item: any) => !item.excluded)
      .reduce((itemSum: number, item: any) => itemSum + (item.total_price || 0), 0);
    const estMarkup = est.markup_percent || 0;
    return sum + (includedTotal * (1 + estMarkup / 100));
  }, 0);
  
  const customSubcontractorPrice = customSubcontractorRows.reduce((sum, r) => {
    const lineItems = customRowLineItems[r.id] || [];
    const baseCost = lineItems.length > 0 
      ? lineItems.reduce((itemSum, item) => itemSum + item.total_cost, 0)
      : r.total_cost;
    return sum + (baseCost * (1 + r.markup_percent / 100));
  }, 0);
  
  const proposalSubcontractorPrice = subcontractorEstimatesPrice + customSubcontractorPrice;
  
  // Labor: sheet labor + custom row labor + custom labor rows (NON-TAXABLE)
  const totalSheetLaborCost = materialsBreakdown.sheetBreakdowns.reduce((sum, sheet) => {
    const labor = sheetLabor[sheet.sheetId];
    return sum + (labor ? labor.total_labor_cost : 0);
  }, 0);
  
  const totalCustomRowLaborCost = Object.values(customRowLabor).reduce((sum: number, labor: any) => {
    return sum + (labor.estimated_hours * labor.hourly_rate);
  }, 0);
  
  const customLaborPrice = customLaborRows.reduce((sum, r) => {
    const lineItems = customRowLineItems[r.id] || [];
    const baseCost = lineItems.length > 0 
      ? lineItems.reduce((itemSum, item) => itemSum + item.total_cost, 0)
      : r.total_cost;
    return sum + (baseCost * (1 + r.markup_percent / 100));
  }, 0);
  
  const proposalLaborPrice = totalSheetLaborCost + totalCustomRowLaborCost + customLaborPrice;
  
  // Calculate subtotals
  const taxableSubtotal = proposalMaterialsPrice + proposalSubcontractorPrice;
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

  // Create unified list of all proposal items sorted by order_index
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
    ...subcontractorEstimates.map(est => ({
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
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <div className="flex items-center justify-between mb-4">
          <TabsList>
            <TabsTrigger value="cost-breakdown">Cost Breakdown</TabsTrigger>
            <TabsTrigger value="proposal">Proposal</TabsTrigger>
          </TabsList>
          
          {/* Action Buttons - Only show in Proposal tab */}
          {activeTab === 'proposal' && (
            <div className="flex gap-2">
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
                        deleteRow={deleteRow}
                        deleteSheetLabor={deleteSheetLabor}
                        toggleSubcontractorLineItem={toggleSubcontractorLineItem}
                        updateSubcontractorMarkup={updateSubcontractorMarkup}
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
                      <span className="font-bold text-slate-900">${proposalMaterialsPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                    </div>
                    {proposalSubcontractorPrice > 0 && (
                      <div className="flex justify-between py-2 border-b border-slate-200">
                        <span className="font-semibold text-slate-700">Subcontractors</span>
                        <span className="font-bold text-slate-900">${proposalSubcontractorPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                      </div>
                    )}
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
                <Select value={category} onValueChange={setCategory}>
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
              <Label>Description</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g., Additional concrete work"
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
              <Label>Notes (Optional)</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="taxable"
                checked={taxable}
                onChange={(e) => setTaxable(e.target.checked)}
                className="rounded"
              />
              <Label htmlFor="taxable">Taxable</Label>
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
            <DialogTitle>{editingLineItem ? 'Edit Line Item' : 'Add Line Item'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Description</Label>
              <Input
                value={lineItemForm.description}
                onChange={(e) => setLineItemForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder="e.g., Concrete materials"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Quantity</Label>
                <Input
                  type="number"
                  value={lineItemForm.quantity}
                  onChange={(e) => setLineItemForm(prev => ({ ...prev, quantity: e.target.value }))}
                  step="0.01"
                />
              </div>
              <div>
                <Label>Unit Cost ($)</Label>
                <Input
                  type="number"
                  value={lineItemForm.unit_cost}
                  onChange={(e) => setLineItemForm(prev => ({ ...prev, unit_cost: e.target.value }))}
                  step="0.01"
                />
              </div>
            </div>

            <div>
              <Label>Notes (Optional)</Label>
              <Textarea
                value={lineItemForm.notes}
                onChange={(e) => setLineItemForm(prev => ({ ...prev, notes: e.target.value }))}
                rows={2}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowLineItemDialog(false)}>
                Cancel
              </Button>
              <Button onClick={saveLineItem}>
                {editingLineItem ? 'Update' : 'Add'} Line Item
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
    </div>
  );
}
