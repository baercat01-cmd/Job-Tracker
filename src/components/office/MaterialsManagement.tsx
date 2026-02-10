import { useState, useEffect } from 'react';
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
  const [expandedSheets, setExpandedSheets] = useState<Set<string>>(new Set());
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [editingItem, setEditingItem] = useState<MaterialItem | null>(null);
  const [showItemDialog, setShowItemDialog] = useState(false);
  const [showAddItemDialog, setShowAddItemDialog] = useState(false);
  const [selectedSheetId, setSelectedSheetId] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [showMoveDialog, setShowMoveDialog] = useState(false);
  const [movingItem, setMovingItem] = useState<MaterialItem | null>(null);
  const [moveToSheetId, setMoveToSheetId] = useState<string>('');
  const [moveToCategory, setMoveToCategory] = useState<string>('');
  
  // Form fields
  const [formCategory, setFormCategory] = useState('');
  const [formUsage, setFormUsage] = useState('');
  const [formSku, setFormSku] = useState('');
  const [formMaterialName, setFormMaterialName] = useState('');
  const [formQuantity, setFormQuantity] = useState('');
  const [formLength, setFormLength] = useState('');
  const [formCostPerUnit, setFormCostPerUnit] = useState('');
  const [formMarkupPercent, setFormMarkupPercent] = useState('');
  const [formPricePerUnit, setFormPricePerUnit] = useState('');
  const [formExtendedCost, setFormExtendedCost] = useState('');
  const [formExtendedPrice, setFormExtendedPrice] = useState('');
  const [formTaxable, setFormTaxable] = useState(false);
  const [formNotes, setFormNotes] = useState('');

  useEffect(() => {
    loadWorkbook();
  }, [job.id]);

  async function loadWorkbook() {
    try {
      setLoading(true);
      
      // Get working version workbook
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

      // Get sheets
      const { data: sheetsData, error: sheetsError } = await supabase
        .from('material_sheets')
        .select('*')
        .eq('workbook_id', workbookData.id)
        .order('order_index');

      if (sheetsError) throw sheetsError;

      // Get all items for all sheets
      const sheetIds = (sheetsData || []).map(s => s.id);
      const { data: itemsData, error: itemsError } = await supabase
        .from('material_items')
        .select('*')
        .in('sheet_id', sheetIds)
        .order('order_index');

      if (itemsError) throw itemsError;

      // Group items by sheet
      const sheets: MaterialSheet[] = (sheetsData || []).map(sheet => ({
        ...sheet,
        items: (itemsData || []).filter(item => item.sheet_id === sheet.id),
      }));

      setWorkbook({
        ...workbookData,
        sheets,
      });

      // Auto-expand first sheet
      if (sheets.length > 0) {
        setExpandedSheets(new Set([sheets[0].id]));
      }
    } catch (error: any) {
      console.error('Error loading workbook:', error);
      toast.error('Failed to load materials');
    } finally {
      setLoading(false);
    }
  }

  function toggleSheet(sheetId: string) {
    setExpandedSheets(prev => {
      const next = new Set(prev);
      if (next.has(sheetId)) {
        next.delete(sheetId);
      } else {
        next.add(sheetId);
      }
      return next;
    });
  }

  function toggleCategory(key: string) {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function expandAll() {
    if (!workbook) return;
    const allSheets = new Set(workbook.sheets.map(s => s.id));
    const allCategories = new Set<string>();
    workbook.sheets.forEach(sheet => {
      const categories = groupByCategory(sheet.items);
      categories.forEach(cat => {
        allCategories.add(`${sheet.id}-${cat.category}`);
      });
    });
    setExpandedSheets(allSheets);
    setExpandedCategories(allCategories);
  }

  function collapseAll() {
    setExpandedSheets(new Set());
    setExpandedCategories(new Set());
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

  function openEditItem(item: MaterialItem) {
    setEditingItem(item);
    setFormCategory(item.category);
    setFormUsage(item.usage || '');
    setFormSku(item.sku || '');
    setFormMaterialName(item.material_name);
    setFormQuantity(item.quantity.toString());
    setFormLength(item.length || '');
    setFormCostPerUnit(item.cost_per_unit?.toString() || '');
    setFormMarkupPercent(item.markup_percent ? (item.markup_percent * 100).toFixed(2) : '');
    setFormPricePerUnit(item.price_per_unit?.toString() || '');
    setFormExtendedCost(item.extended_cost?.toString() || '');
    setFormExtendedPrice(item.extended_price?.toString() || '');
    setFormTaxable(item.taxable);
    setFormNotes(item.notes || '');
    setShowItemDialog(true);
  }

  function openAddItem(sheetId: string, category: string) {
    setSelectedSheetId(sheetId);
    setSelectedCategory(category);
    setFormCategory(category);
    setFormUsage('');
    setFormSku('');
    setFormMaterialName('');
    setFormQuantity('');
    setFormLength('');
    setFormCostPerUnit('');
    setFormMarkupPercent('');
    setFormPricePerUnit('');
    setFormExtendedCost('');
    setFormExtendedPrice('');
    setFormTaxable(false);
    setFormNotes('');
    setShowAddItemDialog(true);
  }

  async function saveItem() {
    if (!formMaterialName.trim() || !formQuantity) {
      toast.error('Please enter material name and quantity');
      return;
    }

    try {
      const quantity = parseFloat(formQuantity);
      const costPerUnit = formCostPerUnit ? parseFloat(formCostPerUnit) : null;
      const pricePerUnit = formPricePerUnit ? parseFloat(formPricePerUnit) : null;
      const markupPercent = formMarkupPercent ? parseFloat(formMarkupPercent) / 100 : null;

      const itemData: any = {
        category: formCategory.trim(),
        usage: formUsage.trim() || null,
        sku: formSku.trim() || null,
        material_name: formMaterialName.trim(),
        quantity,
        length: formLength.trim() || null,
        cost_per_unit: costPerUnit,
        markup_percent: markupPercent,
        price_per_unit: pricePerUnit,
        extended_cost: costPerUnit && quantity ? costPerUnit * quantity : null,
        extended_price: pricePerUnit && quantity ? pricePerUnit * quantity : null,
        taxable: formTaxable,
        notes: formNotes.trim() || null,
        updated_at: new Date().toISOString(),
      };

      if (editingItem) {
        // Update existing
        const { error } = await supabase
          .from('material_items')
          .update(itemData)
          .eq('id', editingItem.id);

        if (error) throw error;
        toast.success('Material updated');
      } else {
        // Create new
        const sheet = workbook?.sheets.find(s => s.id === selectedSheetId);
        const maxOrder = sheet?.items.reduce((max, item) => Math.max(max, item.order_index), -1) ?? -1;

        const { error } = await supabase
          .from('material_items')
          .insert({
            ...itemData,
            sheet_id: selectedSheetId,
            order_index: maxOrder + 1,
          });

        if (error) throw error;
        toast.success('Material added');
      }

      setShowItemDialog(false);
      setShowAddItemDialog(false);
      setEditingItem(null);
      await loadWorkbook();
    } catch (error: any) {
      console.error('Error saving item:', error);
      toast.error('Failed to save material');
    }
  }

  async function deleteItem(itemId: string) {
    if (!confirm('Delete this material?')) return;

    try {
      const { error } = await supabase
        .from('material_items')
        .delete()
        .eq('id', itemId);

      if (error) throw error;
      toast.success('Material deleted');
      await loadWorkbook();
    } catch (error: any) {
      console.error('Error deleting item:', error);
      toast.error('Failed to delete material');
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
      await loadWorkbook();
    } catch (error: any) {
      console.error('Error moving item:', error);
      toast.error('Failed to move material');
    }
  }

  const filteredSheets = workbook?.sheets.map(sheet => ({
    ...sheet,
    items: sheet.items.filter(item =>
      searchTerm === '' ||
      item.material_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.category && item.category.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (item.usage && item.usage.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (item.sku && item.sku.toLowerCase().includes(searchTerm.toLowerCase()))
    ),
  })) || [];

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-muted-foreground">Loading materials...</p>
      </div>
    );
  }

  return (
    <div className="w-full -mx-2">
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

        <TabsContent value="manage" className="space-y-2">
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
              {/* Search & Controls */}
              <Card>
                <CardContent className="pt-3 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        placeholder="Search materials..."
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
                    <Button variant="outline" size="sm" onClick={expandAll}>
                      Expand All
                    </Button>
                    <Button variant="outline" size="sm" onClick={collapseAll}>
                      Collapse All
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Sheets */}
              <div className="space-y-2">
                {filteredSheets.map((sheet) => {
                  const categoryGroups = groupByCategory(sheet.items);
                  const isSheetExpanded = expandedSheets.has(sheet.id);
                  
                  return (
                    <Card key={sheet.id} className="overflow-hidden border-2">
                      <Collapsible open={isSheetExpanded} onOpenChange={() => toggleSheet(sheet.id)}>
                        <CollapsibleTrigger className="w-full">
                          <CardHeader className="bg-gradient-to-r from-indigo-50 to-indigo-100 border-b-2 border-indigo-200 hover:from-indigo-100 hover:to-indigo-150 transition-colors">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                {isSheetExpanded ? (
                                  <ChevronDown className="w-5 h-5 text-indigo-600" />
                                ) : (
                                  <ChevronRight className="w-5 h-5 text-indigo-600" />
                                )}
                                <FileSpreadsheet className="w-6 h-6 text-indigo-600" />
                                <CardTitle className="text-xl font-bold text-indigo-900">
                                  {sheet.sheet_name}
                                </CardTitle>
                                <Badge variant="secondary" className="ml-2">
                                  {sheet.items.length} items
                                </Badge>
                              </div>
                            </div>
                          </CardHeader>
                        </CollapsibleTrigger>
                        
                        <CollapsibleContent>
                          <CardContent className="p-4 space-y-3">
                            {categoryGroups.length === 0 ? (
                              <div className="text-center py-8 text-muted-foreground">
                                No materials in this sheet
                              </div>
                            ) : (
                              categoryGroups.map((catGroup) => {
                                const catKey = `${sheet.id}-${catGroup.category}`;
                                const isCategoryExpanded = expandedCategories.has(catKey);
                                
                                return (
                                  <Card key={catKey} className="border-l-4 border-l-primary">
                                    <Collapsible open={isCategoryExpanded} onOpenChange={() => toggleCategory(catKey)}>
                                      <CollapsibleTrigger className="w-full">
                                        <CardHeader className="bg-muted/30 py-3 hover:bg-muted/50 transition-colors">
                                          <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                              {isCategoryExpanded ? (
                                                <ChevronDown className="w-4 h-4" />
                                              ) : (
                                                <ChevronRight className="w-4 h-4" />
                                              )}
                                              <h3 className="font-bold text-lg">{catGroup.category}</h3>
                                              <Badge variant="outline">{catGroup.items.length} items</Badge>
                                            </div>
                                            <Button
                                              size="sm"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                openAddItem(sheet.id, catGroup.category);
                                              }}
                                              className="gradient-primary"
                                            >
                                              <Plus className="w-4 h-4 mr-1" />
                                              Add Material
                                            </Button>
                                          </div>
                                        </CardHeader>
                                      </CollapsibleTrigger>
                                      
                                      <CollapsibleContent>
                                        <div className="overflow-x-auto">
                                          <table className="w-full">
                                            <thead className="bg-muted/50 border-b text-xs">
                                              <tr>
                                                <th className="text-left p-2">Material</th>
                                                <th className="text-left p-2">Usage</th>
                                                <th className="text-left p-2">SKU</th>
                                                <th className="text-center p-2">Qty</th>
                                                <th className="text-center p-2">Length</th>
                                                <th className="text-right p-2">Cost/Unit</th>
                                                <th className="text-right p-2">Price/Unit</th>
                                                <th className="text-center p-2">Markup %</th>
                                                <th className="text-right p-2">Ext. Cost</th>
                                                <th className="text-right p-2">Ext. Price</th>
                                                <th className="text-right p-2">Actions</th>
                                              </tr>
                                            </thead>
                                            <tbody>
                                              {catGroup.items.map((item) => {
                                                const markupPercent = calculateMarkupPercent(item.cost_per_unit, item.price_per_unit);
                                                
                                                return (
                                                  <tr key={item.id} className="border-b hover:bg-muted/20">
                                                    <td className="p-2">
                                                      <div className="font-medium">{item.material_name}</div>
                                                      {item.notes && (
                                                        <div className="text-xs text-muted-foreground">{item.notes}</div>
                                                      )}
                                                    </td>
                                                    <td className="p-2 text-sm">{item.usage || '-'}</td>
                                                    <td className="p-2 text-sm font-mono">{item.sku || '-'}</td>
                                                    <td className="p-2 text-center font-semibold">{item.quantity}</td>
                                                    <td className="p-2 text-center text-sm">{item.length || '-'}</td>
                                                    <td className="p-2 text-right font-mono">
                                                      {item.cost_per_unit ? `$${item.cost_per_unit.toFixed(2)}` : '-'}
                                                    </td>
                                                    <td className="p-2 text-right font-mono">
                                                      {item.price_per_unit ? `$${item.price_per_unit.toFixed(2)}` : '-'}
                                                    </td>
                                                    <td className="p-2 text-center">
                                                      {markupPercent > 0 ? (
                                                        <Badge variant="secondary" className="bg-green-100 text-green-800">
                                                          <Percent className="w-3 h-3 mr-1" />
                                                          {markupPercent.toFixed(1)}%
                                                        </Badge>
                                                      ) : (
                                                        '-'
                                                      )}
                                                    </td>
                                                    <td className="p-2 text-right font-mono font-semibold">
                                                      {item.extended_cost ? `$${item.extended_cost.toFixed(2)}` : '-'}
                                                    </td>
                                                    <td className="p-2 text-right font-mono font-semibold text-primary">
                                                      {item.extended_price ? `$${item.extended_price.toFixed(2)}` : '-'}
                                                    </td>
                                                    <td className="p-2">
                                                      <div className="flex items-center justify-end gap-1">
                                                        <Button size="sm" variant="ghost" onClick={() => openEditItem(item)}>
                                                          <Edit className="w-4 h-4" />
                                                        </Button>
                                                        <Button size="sm" variant="ghost" onClick={() => openMoveItem(item)}>
                                                          <MoveHorizontal className="w-4 h-4" />
                                                        </Button>
                                                        <Button
                                                          size="sm"
                                                          variant="ghost"
                                                          onClick={() => deleteItem(item.id)}
                                                          className="text-destructive"
                                                        >
                                                          <Trash2 className="w-4 h-4" />
                                                        </Button>
                                                      </div>
                                                    </td>
                                                  </tr>
                                                );
                                              })}
                                            </tbody>
                                          </table>
                                        </div>
                                      </CollapsibleContent>
                                    </Collapsible>
                                  </Card>
                                );
                              })
                            )}
                          </CardContent>
                        </CollapsibleContent>
                      </Collapsible>
                    </Card>
                  );
                })}
              </div>
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

      {/* Edit/Add Item Dialog */}
      <Dialog open={showItemDialog || showAddItemDialog} onOpenChange={(open) => {
        setShowItemDialog(open);
        setShowAddItemDialog(open);
        if (!open) setEditingItem(null);
      }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingItem ? 'Edit Material' : 'Add Material'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="category">Category *</Label>
                <Input
                  id="category"
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  placeholder="e.g., Steel, Lumber, Fasteners"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="usage">Usage</Label>
                <Input
                  id="usage"
                  value={formUsage}
                  onChange={(e) => setFormUsage(e.target.value)}
                  placeholder="e.g., Wall framing, Roof panels"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="sku">SKU</Label>
                <Input
                  id="sku"
                  value={formSku}
                  onChange={(e) => setFormSku(e.target.value)}
                  placeholder="Part number or SKU"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="material-name">Material Name *</Label>
                <Input
                  id="material-name"
                  value={formMaterialName}
                  onChange={(e) => setFormMaterialName(e.target.value)}
                  placeholder="e.g., 2x4 Lumber"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="quantity">Quantity *</Label>
                <Input
                  id="quantity"
                  type="number"
                  value={formQuantity}
                  onChange={(e) => setFormQuantity(e.target.value)}
                  placeholder="0"
                  min="0"
                  step="0.01"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="length">Length</Label>
                <Input
                  id="length"
                  value={formLength}
                  onChange={(e) => setFormLength(e.target.value)}
                  placeholder="e.g., 8ft, 12ft"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cost-per-unit">Cost Per Unit</Label>
                <Input
                  id="cost-per-unit"
                  type="number"
                  value={formCostPerUnit}
                  onChange={(e) => setFormCostPerUnit(e.target.value)}
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="markup-percent">Markup %</Label>
                <Input
                  id="markup-percent"
                  type="number"
                  value={formMarkupPercent}
                  onChange={(e) => setFormMarkupPercent(e.target.value)}
                  placeholder="0"
                  min="0"
                  step="0.01"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="price-per-unit">Price Per Unit</Label>
                <Input
                  id="price-per-unit"
                  type="number"
                  value={formPricePerUnit}
                  onChange={(e) => setFormPricePerUnit(e.target.value)}
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="extended-cost">Extended Cost</Label>
                <Input
                  id="extended-cost"
                  type="number"
                  value={formExtendedCost}
                  onChange={(e) => setFormExtendedCost(e.target.value)}
                  placeholder="Auto-calculated"
                  min="0"
                  step="0.01"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="extended-price">Extended Price</Label>
                <Input
                  id="extended-price"
                  type="number"
                  value={formExtendedPrice}
                  onChange={(e) => setFormExtendedPrice(e.target.value)}
                  placeholder="Auto-calculated"
                  min="0"
                  step="0.01"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="taxable"
                checked={formTaxable}
                onChange={(e) => setFormTaxable(e.target.checked)}
                className="w-4 h-4"
              />
              <Label htmlFor="taxable" className="cursor-pointer">Taxable</Label>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                placeholder="Additional notes..."
                rows={3}
              />
            </div>

            <div className="flex gap-3 pt-4 border-t">
              <Button onClick={saveItem} className="flex-1 gradient-primary">
                {editingItem ? 'Update Material' : 'Add Material'}
              </Button>
              <Button variant="outline" onClick={() => {
                setShowItemDialog(false);
                setShowAddItemDialog(false);
                setEditingItem(null);
              }}>
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Move Item Dialog */}
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
