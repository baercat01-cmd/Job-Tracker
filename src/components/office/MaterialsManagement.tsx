import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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
import {
  Plus,
  Edit,
  Trash2,
  Search,
  X,
  ChevronDown,
  ChevronRight,
  DollarSign,
  Upload,
  FileSpreadsheet,
  MoveHorizontal,
  Percent,
} from 'lucide-react';
import { toast } from 'sonner';
import type { Job } from '@/types';
import { ExtrasManagement } from './ExtrasManagement';
import { CrewOrdersManagement } from './CrewOrdersManagement';
import { MaterialWorkbookManager } from './MaterialWorkbookManager';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface MaterialItem {
  id: string;
  sheet_id: string;
  category: string;
  usage: string | null;
  sku: string | null;
  material_name: string;
  quantity: number;
  length: string | null;
  cost_per_unit: number | null;
  markup_percent: number | null;
  price_per_unit: number | null;
  extended_cost: number | null;
  extended_price: number | null;
  taxable: boolean;
  notes: string | null;
  order_index: number;
  status: string;
  created_at: string;
  updated_at: string;
}

interface MaterialSheet {
  id: string;
  workbook_id: string;
  sheet_name: string;
  order_index: number;
  items: MaterialItem[];
  created_at: string;
}

interface MaterialWorkbook {
  id: string;
  job_id: string;
  version_number: number;
  status: 'working' | 'locked';
  sheets: MaterialSheet[];
}

interface MaterialsManagementProps {
  job: Job;
  userId: string;
}

interface CategoryGroup {
  category: string;
  items: MaterialItem[];
}

export function MaterialsManagement({ job, userId }: MaterialsManagementProps) {
  const [workbook, setWorkbook] = useState<MaterialWorkbook | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'manage' | 'extras' | 'upload'>('manage');
  const [activeSheetId, setActiveSheetId] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [showMoveDialog, setShowMoveDialog] = useState(false);
  const [movingItem, setMovingItem] = useState<MaterialItem | null>(null);
  const [moveToSheetId, setMoveToSheetId] = useState<string>('');
  const [moveToCategory, setMoveToCategory] = useState<string>('');
  const [editingCell, setEditingCell] = useState<{ itemId: string; field: string } | null>(null);
  const [cellValue, setCellValue] = useState('');
  const scrollPositionRef = useRef<number>(0);

  useEffect(() => {
    loadWorkbook();
  }, [job.id]);

  async function loadWorkbook() {
    try {
      setLoading(true);
      
      const { data: workbookData, error: workbookError } = await supabase
        .from('material_workbooks')
        .select('*')
        .eq('job_id', job.id)
        .eq('status', 'working')
        .maybeSingle();

      if (workbookError) throw workbookError;

      if (!workbookData) {
        setWorkbook(null);
        setLoading(false);
        return;
      }

      const { data: sheetsData, error: sheetsError } = await supabase
        .from('material_sheets')
        .select('*')
        .eq('workbook_id', workbookData.id)
        .order('order_index');

      if (sheetsError) throw sheetsError;

      const sheetIds = (sheetsData || []).map(s => s.id);
      const { data: itemsData, error: itemsError } = await supabase
        .from('material_items')
        .select('*')
        .in('sheet_id', sheetIds)
        .order('order_index');

      if (itemsError) throw itemsError;

      const sheets: MaterialSheet[] = (sheetsData || []).map(sheet => ({
        ...sheet,
        items: (itemsData || []).filter(item => item.sheet_id === sheet.id),
      }));

      setWorkbook({
        ...workbookData,
        sheets,
      });

      if (sheets.length > 0 && !activeSheetId) {
        setActiveSheetId(sheets[0].id);
      }
    } catch (error: any) {
      console.error('Error loading workbook:', error);
      toast.error('Failed to load materials');
    } finally {
      setLoading(false);
    }
  }

  function handleSheetChange(sheetId: string) {
    setActiveSheetId(sheetId);
  }

  function groupByCategory(items: MaterialItem[]): CategoryGroup[] {
    const categoryMap = new Map<string, MaterialItem[]>();
    
    items.forEach(item => {
      const category = item.category || 'Uncategorized';
      if (!categoryMap.has(category)) {
        categoryMap.set(category, []);
      }
      categoryMap.get(category)!.push(item);
    });

    return Array.from(categoryMap.entries())
      .map(([category, items]) => ({
        category,
        items: items.sort((a, b) => a.order_index - b.order_index),
      }))
      .sort((a, b) => a.category.localeCompare(b.category));
  }

  function calculateMarkupPercent(cost: number | null, price: number | null): number {
    if (!cost || !price || cost === 0) return 0;
    return ((price - cost) / cost) * 100;
  }

  function startCellEdit(itemId: string, field: string, currentValue: any) {
    setEditingCell({ itemId, field });
    setCellValue(currentValue?.toString() || '');
  }

  async function saveCellEdit(item: MaterialItem) {
    if (!editingCell) return;

    try {
      const { field } = editingCell;
      let value: any = cellValue;

      if (['quantity', 'cost_per_unit', 'price_per_unit'].includes(field)) {
        value = parseFloat(cellValue) || null;
      } else if (field === 'markup_percent') {
        value = parseFloat(cellValue) / 100 || null;
      }

      const updateData: any = {
        [field]: value,
        updated_at: new Date().toISOString(),
      };

      if (field === 'quantity' || field === 'cost_per_unit') {
        const qty = field === 'quantity' ? value : item.quantity;
        const cost = field === 'cost_per_unit' ? value : item.cost_per_unit;
        updateData.extended_cost = qty && cost ? qty * cost : null;
      }
      if (field === 'quantity' || field === 'price_per_unit') {
        const qty = field === 'quantity' ? value : item.quantity;
        const price = field === 'price_per_unit' ? value : item.price_per_unit;
        updateData.extended_price = qty && price ? qty * price : null;
      }

      // Save current scroll position
      scrollPositionRef.current = window.scrollY;

      // Optimistic update - update local state immediately
      if (workbook) {
        const updatedWorkbook = {
          ...workbook,
          sheets: workbook.sheets.map(sheet => ({
            ...sheet,
            items: sheet.items.map(i => 
              i.id === item.id 
                ? { ...i, ...updateData }
                : i
            ),
          })),
        };
        setWorkbook(updatedWorkbook);
      }

      setEditingCell(null);
      setCellValue('');

      // Save to database in background
      const { error } = await supabase
        .from('material_items')
        .update(updateData)
        .eq('id', item.id);

      if (error) {
        console.error('Error saving cell:', error);
        toast.error('Failed to save');
        // Reload on error to revert optimistic update
        await loadWorkbook();
      }

      // Restore scroll position
      requestAnimationFrame(() => {
        window.scrollTo({ top: scrollPositionRef.current, behavior: 'instant' });
      });

    } catch (error: any) {
      console.error('Error saving cell:', error);
      toast.error('Failed to save');
      await loadWorkbook();
    }
  }

  function cancelCellEdit() {
    setEditingCell(null);
    setCellValue('');
  }

  async function updateStatus(itemId: string, newStatus: string) {
    try {
      // Save current scroll position
      scrollPositionRef.current = window.scrollY;

      // Optimistic update
      if (workbook) {
        const updatedWorkbook = {
          ...workbook,
          sheets: workbook.sheets.map(sheet => ({
            ...sheet,
            items: sheet.items.map(i => 
              i.id === itemId 
                ? { ...i, status: newStatus, updated_at: new Date().toISOString() }
                : i
            ),
          })),
        };
        setWorkbook(updatedWorkbook);
      }

      const { error } = await supabase
        .from('material_items')
        .update({
          status: newStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('id', itemId);

      if (error) throw error;

      // Restore scroll position
      requestAnimationFrame(() => {
        window.scrollTo({ top: scrollPositionRef.current, behavior: 'instant' });
      });
    } catch (error: any) {
      console.error('Error updating status:', error);
      toast.error('Failed to update status');
      await loadWorkbook();
    }
  }

  function getStatusColor(status: string): string {
    switch (status) {
      case 'ordered':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'received':
        return 'bg-green-100 text-green-800 border-green-300';
      case 'not_ordered':
      default:
        return 'bg-slate-100 text-slate-800 border-slate-300';
    }
  }

  async function deleteItem(itemId: string) {
    if (!confirm('Delete this material?')) return;

    try {
      // Save current scroll position
      scrollPositionRef.current = window.scrollY;

      // Optimistic update
      if (workbook) {
        const updatedWorkbook = {
          ...workbook,
          sheets: workbook.sheets.map(sheet => ({
            ...sheet,
            items: sheet.items.filter(i => i.id !== itemId),
          })),
        };
        setWorkbook(updatedWorkbook);
      }

      const { error } = await supabase
        .from('material_items')
        .delete()
        .eq('id', itemId);

      if (error) throw error;
      toast.success('Material deleted');

      // Restore scroll position
      requestAnimationFrame(() => {
        window.scrollTo({ top: scrollPositionRef.current, behavior: 'instant' });
      });
    } catch (error: any) {
      console.error('Error deleting item:', error);
      toast.error('Failed to delete material');
      await loadWorkbook();
    }
  }

  function openMoveItem(item: MaterialItem) {
    setMovingItem(item);
    setMoveToSheetId(item.sheet_id);
    setMoveToCategory(item.category);
    setShowMoveDialog(true);
  }

  async function moveItem() {
    if (!movingItem) return;

    try {
      // Save current scroll position
      scrollPositionRef.current = window.scrollY;

      const { error } = await supabase
        .from('material_items')
        .update({
          sheet_id: moveToSheetId,
          category: moveToCategory,
          updated_at: new Date().toISOString(),
        })
        .eq('id', movingItem.id);

      if (error) throw error;
      toast.success('Material moved');
      setShowMoveDialog(false);
      setMovingItem(null);
      
      // Reload to reflect move across sheets
      await loadWorkbook();

      // Restore scroll position after reload
      requestAnimationFrame(() => {
        window.scrollTo({ top: scrollPositionRef.current, behavior: 'instant' });
      });
    } catch (error: any) {
      console.error('Error moving item:', error);
      toast.error('Failed to move material');
    }
  }

  const activeSheet = workbook?.sheets.find(s => s.id === activeSheetId);
  const filteredItems = activeSheet?.items.filter(item =>
    searchTerm === '' ||
    item.material_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (item.category && item.category.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (item.usage && item.usage.toLowerCase().includes(searchTerm.toLowerCase()))
  ) || [];
  
  const categoryGroups = groupByCategory(filteredItems);

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-muted-foreground">Loading materials...</p>
      </div>
    );
  }

  return (
    <div className="w-full overflow-x-auto">
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="space-y-2">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-gradient-to-r from-slate-50 to-slate-100 p-3 rounded-lg border-2 border-slate-200">
          <TabsList className="grid w-full grid-cols-3 h-14 bg-white shadow-sm flex-1">
            <TabsTrigger value="manage" className="flex flex-col sm:flex-row items-center gap-1 sm:gap-2 text-base font-semibold">
              <FileSpreadsheet className="w-5 h-5" />
              <span className="text-xs sm:text-base">Material Workbook</span>
            </TabsTrigger>
            <TabsTrigger value="extras" className="flex flex-col sm:flex-row items-center gap-1 sm:gap-2 text-base font-semibold">
              <DollarSign className="w-5 h-5" />
              <span className="text-xs sm:text-base">Extras</span>
            </TabsTrigger>
            <TabsTrigger value="upload" className="flex flex-col sm:flex-row items-center gap-1 sm:gap-2 text-base font-semibold">
              <Upload className="w-5 h-5" />
              <span className="text-xs sm:text-base">Upload New</span>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="manage" className="space-y-3">
          {!workbook ? (
            <Card>
              <CardContent className="py-12 text-center">
                <FileSpreadsheet className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                <h3 className="text-lg font-semibold mb-2">No Material Workbook</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Upload an Excel workbook to get started with material management
                </p>
                <Button onClick={() => setActiveTab('upload')} className="gradient-primary">
                  <Upload className="w-4 h-4 mr-2" />
                  Upload Workbook
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              <Card className="border-2">
                <CardContent className="p-0">
                  <div className="bg-gradient-to-r from-slate-100 to-slate-50 border-b-2">
                    <div className="flex items-center gap-1 px-2 py-1 overflow-x-auto">
                      {workbook.sheets.map((sheet) => (
                        <Button
                          key={sheet.id}
                          variant={activeSheetId === sheet.id ? 'default' : 'ghost'}
                          size="sm"
                          onClick={() => handleSheetChange(sheet.id)}
                          className={`flex items-center gap-2 min-w-[140px] justify-start font-semibold ${activeSheetId === sheet.id ? 'bg-white shadow-md border-2 border-primary' : 'hover:bg-white/50'}`}
                        >
                          <FileSpreadsheet className="w-4 h-4" />
                          {sheet.sheet_name}
                          <Badge variant="secondary" className="ml-auto text-xs">
                            {sheet.items.length}
                          </Badge>
                        </Button>
                      ))}
                    </div>
                  </div>

                  <div className="p-3 bg-white border-b">
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          placeholder="Search materials in current sheet..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="pl-9 pr-9"
                        />
                        {searchTerm && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSearchTerm('')}
                            className="absolute right-1 top-1/2 transform -translate-y-1/2 h-7 w-7 p-0"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="overflow-x-auto w-full">
                    {categoryGroups.length === 0 ? (
                      <div className="text-center py-12 text-muted-foreground">
                        <FileSpreadsheet className="w-16 h-16 mx-auto mb-3 opacity-50" />
                        <p>No materials in this sheet</p>
                      </div>
                    ) : (
                      <table className="border-collapse" style={{ width: 'auto', minWidth: '100%' }}>
                        <thead className="bg-gradient-to-r from-slate-800 to-slate-700 text-white sticky top-0 z-10">
                          <tr>
                            <th className="text-left p-3 font-bold border-r border-slate-600 whitespace-nowrap">Material</th>
                            <th className="text-left p-3 font-bold border-r border-slate-600 whitespace-nowrap">Usage</th>
                            <th className="text-center p-3 font-bold border-r border-slate-600 whitespace-nowrap">Qty</th>
                            <th className="text-center p-3 font-bold border-r border-slate-600 whitespace-nowrap">Length</th>
                            <th className="text-right p-3 font-bold border-r border-slate-600 whitespace-nowrap">Cost/Unit</th>
                            <th className="text-center p-3 font-bold border-r border-slate-600 whitespace-nowrap">Markup %</th>
                            <th className="text-right p-3 font-bold border-r border-slate-600 whitespace-nowrap">Price/Unit</th>
                            <th className="text-right p-3 font-bold border-r border-slate-600 whitespace-nowrap">Ext. Cost</th>
                            <th className="text-right p-3 font-bold border-r border-slate-600 whitespace-nowrap">Ext. Price</th>
                            <th className="text-center p-3 font-bold border-r border-slate-600 whitespace-nowrap">Status</th>
                            <th className="text-center p-3 font-bold whitespace-nowrap">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {categoryGroups.map((catGroup, catIndex) => (
                            <>
                              <tr key={`cat-${catIndex}`} className="bg-gradient-to-r from-indigo-100 to-indigo-50 border-y-2 border-indigo-300">
                                <td colSpan={11} className="p-3">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <FileSpreadsheet className="w-5 h-5 text-indigo-700" />
                                      <h3 className="font-bold text-lg text-indigo-900">{catGroup.category}</h3>
                                      <Badge variant="outline" className="bg-white">
                                        {catGroup.items.length} items
                                      </Badge>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                              {catGroup.items.map((item, itemIndex) => {
                                const markupPercent = calculateMarkupPercent(item.cost_per_unit, item.price_per_unit);
                                const isEven = itemIndex % 2 === 0;
                                const isEditingThisCell = (field: string) => 
                                  editingCell?.itemId === item.id && editingCell?.field === field;
                                
                                return (
                                  <tr
                                    key={item.id}
                                    className={`border-b hover:bg-blue-50 transition-colors ${
                                      isEven ? 'bg-white' : 'bg-slate-50/50'
                                    }`}
                                  >
                                    <td className="p-1 border-r whitespace-nowrap">
                                      {isEditingThisCell('material_name') ? (
                                        <Input
                                          value={cellValue}
                                          onChange={(e) => setCellValue(e.target.value)}
                                          onBlur={() => saveCellEdit(item)}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter') saveCellEdit(item);
                                            if (e.key === 'Escape') cancelCellEdit();
                                          }}
                                          autoFocus
                                          className="h-8 text-sm"
                                        />
                                      ) : (
                                        <div 
                                          onClick={() => startCellEdit(item.id, 'material_name', item.material_name)}
                                          className="font-medium text-sm cursor-pointer hover:bg-blue-100 p-2 rounded min-h-[32px] max-w-[400px]"
                                        >
                                          {item.material_name}
                                          {item.notes && (
                                            <div className="text-xs text-muted-foreground mt-1">{item.notes}</div>
                                          )}
                                        </div>
                                      )}
                                    </td>

                                    <td className="p-1 border-r whitespace-nowrap">
                                      {isEditingThisCell('usage') ? (
                                        <Input
                                          value={cellValue}
                                          onChange={(e) => setCellValue(e.target.value)}
                                          onBlur={() => saveCellEdit(item)}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter') saveCellEdit(item);
                                            if (e.key === 'Escape') cancelCellEdit();
                                          }}
                                          autoFocus
                                          className="h-8 text-sm"
                                        />
                                      ) : (
                                        <div
                                          onClick={() => startCellEdit(item.id, 'usage', item.usage)}
                                          className="text-sm cursor-pointer hover:bg-blue-100 p-2 rounded min-h-[32px]"
                                        >
                                          {item.usage || '-'}
                                        </div>
                                      )}
                                    </td>

                                    <td className="p-1 border-r whitespace-nowrap">
                                      {isEditingThisCell('quantity') ? (
                                        <Input
                                          type="number"
                                          value={cellValue}
                                          onChange={(e) => setCellValue(e.target.value)}
                                          onBlur={() => saveCellEdit(item)}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter') saveCellEdit(item);
                                            if (e.key === 'Escape') cancelCellEdit();
                                          }}
                                          autoFocus
                                          className="h-8 text-sm text-center"
                                        />
                                      ) : (
                                        <div
                                          onClick={() => startCellEdit(item.id, 'quantity', item.quantity)}
                                          className="text-center font-semibold cursor-pointer hover:bg-blue-100 p-2 rounded min-h-[32px]"
                                        >
                                          {item.quantity}
                                        </div>
                                      )}
                                    </td>

                                    <td className="p-1 border-r whitespace-nowrap">
                                      {isEditingThisCell('length') ? (
                                        <Input
                                          value={cellValue}
                                          onChange={(e) => setCellValue(e.target.value)}
                                          onBlur={() => saveCellEdit(item)}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter') saveCellEdit(item);
                                            if (e.key === 'Escape') cancelCellEdit();
                                          }}
                                          autoFocus
                                          className="h-8 text-sm text-center"
                                        />
                                      ) : (
                                        <div
                                          onClick={() => startCellEdit(item.id, 'length', item.length)}
                                          className="text-center text-sm cursor-pointer hover:bg-blue-100 p-2 rounded min-h-[32px]"
                                        >
                                          {item.length || '-'}
                                        </div>
                                      )}
                                    </td>

                                    <td className="p-1 border-r whitespace-nowrap">
                                      {isEditingThisCell('cost_per_unit') ? (
                                        <Input
                                          type="number"
                                          step="0.01"
                                          value={cellValue}
                                          onChange={(e) => setCellValue(e.target.value)}
                                          onBlur={() => saveCellEdit(item)}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter') saveCellEdit(item);
                                            if (e.key === 'Escape') cancelCellEdit();
                                          }}
                                          autoFocus
                                          className="h-8 text-sm text-right"
                                        />
                                      ) : (
                                        <div
                                          onClick={() => startCellEdit(item.id, 'cost_per_unit', item.cost_per_unit)}
                                          className="text-right font-mono text-sm cursor-pointer hover:bg-blue-100 p-2 rounded min-h-[32px]"
                                        >
                                          {item.cost_per_unit ? `$${item.cost_per_unit.toFixed(2)}` : '-'}
                                        </div>
                                      )}
                                    </td>

                                    <td className="p-2 text-center border-r">
                                      {markupPercent > 0 ? (
                                        <Badge variant="secondary" className="bg-green-100 text-green-800 font-semibold">
                                          <Percent className="w-3 h-3 mr-1" />
                                          {markupPercent.toFixed(1)}%
                                        </Badge>
                                      ) : (
                                        '-'
                                      )}
                                    </td>

                                    <td className="p-1 border-r whitespace-nowrap">
                                      {isEditingThisCell('price_per_unit') ? (
                                        <Input
                                          type="number"
                                          step="0.01"
                                          value={cellValue}
                                          onChange={(e) => setCellValue(e.target.value)}
                                          onBlur={() => saveCellEdit(item)}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter') saveCellEdit(item);
                                            if (e.key === 'Escape') cancelCellEdit();
                                          }}
                                          autoFocus
                                          className="h-8 text-sm text-right"
                                        />
                                      ) : (
                                        <div
                                          onClick={() => startCellEdit(item.id, 'price_per_unit', item.price_per_unit)}
                                          className="text-right font-mono text-sm cursor-pointer hover:bg-blue-100 p-2 rounded min-h-[32px]"
                                        >
                                          {item.price_per_unit ? `$${item.price_per_unit.toFixed(2)}` : '-'}
                                        </div>
                                      )}
                                    </td>

                                    <td className="p-2 text-right font-mono font-semibold text-sm border-r bg-slate-100/50">
                                      {item.extended_cost ? `$${item.extended_cost.toFixed(2)}` : '-'}
                                    </td>

                                    <td className="p-2 text-right font-mono font-bold text-sm text-primary border-r bg-slate-100/50">
                                      {item.extended_price ? `$${item.extended_price.toFixed(2)}` : '-'}
                                    </td>

                                    <td className="p-1 border-r whitespace-nowrap">
                                      <Select
                                        value={item.status || 'not_ordered'}
                                        onValueChange={(value) => updateStatus(item.id, value)}
                                      >
                                        <SelectTrigger className={`h-8 text-xs font-semibold border-2 ${getStatusColor(item.status || 'not_ordered')}`}>
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="not_ordered">Not Ordered</SelectItem>
                                          <SelectItem value="ordered">Ordered</SelectItem>
                                          <SelectItem value="received">Received</SelectItem>
                                        </SelectContent>
                                      </Select>
                                    </td>

                                    <td className="p-1">
                                      <div className="flex items-center justify-center gap-1">
                                        <Button size="sm" variant="ghost" onClick={() => openMoveItem(item)} title="Move">
                                          <MoveHorizontal className="w-4 h-4" />
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          onClick={() => deleteItem(item.id)}
                                          className="text-destructive hover:bg-destructive/10"
                                          title="Delete"
                                        >
                                          <Trash2 className="w-4 h-4" />
                                        </Button>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="extras" className="space-y-2">
          <ExtrasManagement job={job} userId={userId} />
        </TabsContent>

        <TabsContent value="upload" className="space-y-2">
          <MaterialWorkbookManager jobId={job.id} />
        </TabsContent>
      </Tabs>

      <Dialog open={showMoveDialog} onOpenChange={setShowMoveDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Move Material</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Move <strong>{movingItem?.material_name}</strong> to a different sheet or category
            </p>

            <div className="space-y-2">
              <Label htmlFor="move-sheet">Sheet</Label>
              <Select value={moveToSheetId} onValueChange={setMoveToSheetId}>
                <SelectTrigger id="move-sheet">
                  <SelectValue placeholder="Select sheet" />
                </SelectTrigger>
                <SelectContent>
                  {workbook?.sheets.map(sheet => (
                    <SelectItem key={sheet.id} value={sheet.id}>
                      {sheet.sheet_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="move-category">Category</Label>
              <Input
                id="move-category"
                value={moveToCategory}
                onChange={(e) => setMoveToCategory(e.target.value)}
                placeholder="Enter category name"
              />
            </div>

            <div className="flex gap-3 pt-4 border-t">
              <Button onClick={moveItem} className="flex-1">
                <MoveHorizontal className="w-4 h-4 mr-2" />
                Move Material
              </Button>
              <Button variant="outline" onClick={() => setShowMoveDialog(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
