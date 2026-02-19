import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  ArrowLeft,
  FileSpreadsheet,
  Plus,
  Trash2,
  RefreshCw,
  Search,
  Tag,
  Package,
  Pencil,
} from 'lucide-react';
import { toast } from 'sonner';
import { BulkMaterialSelector } from '@/components/office/BulkMaterialSelector';

interface MaterialItem {
  id: string;
  sheet_id: string;
  category: string;
  usage: string | null;
  sku: string | null;
  material_name: string;
  quantity: number;
  length: string | null;
  color: string | null;
  cost_per_unit: number | null;
  markup_percent: number | null;
  price_per_unit: number | null;
  extended_cost: number | null;
  extended_price: number | null;
  taxable: boolean;
  notes: string | null;
  order_index: number;
}

interface MaterialSheet {
  id: string;
  workbook_id: string;
  sheet_name: string;
  order_index: number;
  description: string | null;
  is_option: boolean;
  markup_percent: number;
}

interface MaterialWorkbook {
  id: string;
  job_id: string;
  version_number: number;
  status: string;
  created_at: string;
}

interface MaterialCatalogItem {
  sku: string;
  material_name: string;
  category: string | null;
  unit_price: number | null;
  purchase_cost: number | null;
  part_length: string | null;
  raw_metadata: any;
}

export function WorkbookDetailPage() {
  const { workbookId } = useParams<{ workbookId: string }>();
  const navigate = useNavigate();
  
  const [workbook, setWorkbook] = useState<MaterialWorkbook | null>(null);
  const [sheets, setSheets] = useState<MaterialSheet[]>([]);
  const [items, setItems] = useState<Record<string, MaterialItem[]>>({});
  const [loading, setLoading] = useState(true);
  
  // Swap material dialog
  const [showSwapDialog, setShowSwapDialog] = useState(false);
  const [swappingItem, setSwappingItem] = useState<MaterialItem | null>(null);
  const [catalogMaterials, setCatalogMaterials] = useState<MaterialCatalogItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  
  // Bulk selector
  const [showBulkSelector, setShowBulkSelector] = useState(false);
  const [selectedSheetId, setSelectedSheetId] = useState<string>('');
  
  // Editing
  const [editingItem, setEditingItem] = useState<MaterialItem | null>(null);
  const [editQuantity, setEditQuantity] = useState('');

  useEffect(() => {
    if (workbookId) {
      loadWorkbook();
    }
  }, [workbookId]);

  async function loadWorkbook() {
    if (!workbookId) return;
    
    try {
      setLoading(true);
      
      // Load workbook
      const { data: workbookData, error: workbookError } = await supabase
        .from('material_workbooks')
        .select('*')
        .eq('id', workbookId)
        .single();
      
      if (workbookError) throw workbookError;
      setWorkbook(workbookData);
      
      // Load sheets
      const { data: sheetsData, error: sheetsError } = await supabase
        .from('material_sheets')
        .select('*')
        .eq('workbook_id', workbookId)
        .order('order_index');
      
      if (sheetsError) throw sheetsError;
      setSheets(sheetsData || []);
      
      // Load items for each sheet
      const itemsBySheet: Record<string, MaterialItem[]> = {};
      
      for (const sheet of sheetsData || []) {
        const { data: itemsData, error: itemsError } = await supabase
          .from('material_items')
          .select('*')
          .eq('sheet_id', sheet.id)
          .order('order_index');
        
        if (itemsError) throw itemsError;
        itemsBySheet[sheet.id] = itemsData || [];
      }
      
      setItems(itemsBySheet);
    } catch (error: any) {
      console.error('Error loading workbook:', error);
      toast.error('Failed to load workbook');
    } finally {
      setLoading(false);
    }
  }

  async function loadCatalogMaterials() {
    try {
      const { data, error } = await supabase
        .from('materials_catalog')
        .select('*')
        .order('material_name');
      
      if (error) throw error;
      setCatalogMaterials(data || []);
    } catch (error: any) {
      console.error('Error loading catalog:', error);
      toast.error('Failed to load materials catalog');
    }
  }

  function startSwapMaterial(item: MaterialItem) {
    setSwappingItem(item);
    setSearchTerm('');
    setSelectedCategory(null);
    setShowSwapDialog(true);
    loadCatalogMaterials();
  }

  async function swapMaterial(newMaterial: MaterialCatalogItem) {
    if (!swappingItem) return;
    
    try {
      // Calculate markup if we have both cost and price
      let markupPercent = null;
      if (newMaterial.purchase_cost && newMaterial.unit_price) {
        markupPercent = ((newMaterial.unit_price - newMaterial.purchase_cost) / newMaterial.purchase_cost) * 100;
      }
      
      // Preserve usage and quantity, swap everything else
      const { error } = await supabase
        .from('material_items')
        .update({
          sku: newMaterial.sku,
          material_name: newMaterial.material_name,
          category: cleanCategory(newMaterial.category) || swappingItem.category,
          length: newMaterial.part_length,
          cost_per_unit: newMaterial.purchase_cost,
          markup_percent: markupPercent,
          price_per_unit: newMaterial.unit_price,
          extended_cost: newMaterial.purchase_cost ? newMaterial.purchase_cost * swappingItem.quantity : null,
          extended_price: newMaterial.unit_price ? newMaterial.unit_price * swappingItem.quantity : null,
        })
        .eq('id', swappingItem.id);
      
      if (error) throw error;
      
      toast.success(`Material swapped: ${newMaterial.material_name}`);
      setShowSwapDialog(false);
      setSwappingItem(null);
      await loadWorkbook();
    } catch (error: any) {
      console.error('Error swapping material:', error);
      toast.error('Failed to swap material');
    }
  }

  async function deleteItem(itemId: string, sheetId: string) {
    if (!confirm('Delete this material item?')) return;
    
    try {
      const { error } = await supabase
        .from('material_items')
        .delete()
        .eq('id', itemId);
      
      if (error) throw error;
      
      toast.success('Item deleted');
      await loadWorkbook();
    } catch (error: any) {
      console.error('Error deleting item:', error);
      toast.error('Failed to delete item');
    }
  }

  function startEditQuantity(item: MaterialItem) {
    setEditingItem(item);
    setEditQuantity(item.quantity.toString());
  }

  async function saveQuantity() {
    if (!editingItem) return;
    
    const newQuantity = parseFloat(editQuantity);
    if (isNaN(newQuantity) || newQuantity <= 0) {
      toast.error('Please enter a valid quantity');
      return;
    }
    
    try {
      const { error } = await supabase
        .from('material_items')
        .update({
          quantity: newQuantity,
          extended_cost: editingItem.cost_per_unit ? editingItem.cost_per_unit * newQuantity : null,
          extended_price: editingItem.price_per_unit ? editingItem.price_per_unit * newQuantity : null,
        })
        .eq('id', editingItem.id);
      
      if (error) throw error;
      
      toast.success('Quantity updated');
      setEditingItem(null);
      setEditQuantity('');
      await loadWorkbook();
    } catch (error: any) {
      console.error('Error updating quantity:', error);
      toast.error('Failed to update quantity');
    }
  }

  function cleanCategory(category: string | null): string | null {
    if (!category) return null;
    return category
      .replace(/^USD\s*[-:]?\s*/i, '')
      .replace(/Sales\s*[-:]?\s*/gi, '')
      .replace(/^[-:]\s*/, '')
      .trim() || null;
  }

  const categories = Array.from(
    new Set(
      catalogMaterials
        .map(m => cleanCategory(m.category))
        .filter(c => c && !/^[\d\$,.\s]+$/.test(c))
    )
  ).sort();

  const filteredMaterials = catalogMaterials.filter(m => {
    // Filter by category
    if (selectedCategory && cleanCategory(m.category) !== selectedCategory) {
      return false;
    }
    
    // Filter by search
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      return (
        m.material_name.toLowerCase().includes(term) ||
        m.sku.toLowerCase().includes(term) ||
        m.part_length?.toLowerCase().includes(term)
      );
    }
    
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading workbook...</p>
        </div>
      </div>
    );
  }

  if (!workbook) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <p className="text-lg text-muted-foreground mb-4">Workbook not found</p>
          <Button onClick={() => navigate(-1)}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            onClick={() => navigate(-1)}
            variant="outline"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <FileSpreadsheet className="w-8 h-8" />
              Material Workbook - Version {workbook.version_number}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {workbook.status === 'working' ? (
                <Badge className="bg-green-100 text-green-800">Working Version - Editable</Badge>
              ) : (
                <Badge variant="outline">Locked Version - Read Only</Badge>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Sheets */}
      {sheets.map(sheet => {
        const sheetItems = items[sheet.id] || [];
        
        return (
          <Card key={sheet.id}>
            <CardHeader className="bg-slate-50">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  {sheet.sheet_name}
                  {sheet.is_option && (
                    <Badge variant="outline" className="bg-blue-100 text-blue-800">Option</Badge>
                  )}
                </CardTitle>
                <Button
                  onClick={() => {
                    setSelectedSheetId(sheet.id);
                    setShowBulkSelector(true);
                  }}
                  size="sm"
                  className="bg-green-600 hover:bg-green-700"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Materials
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Category</TableHead>
                    <TableHead>Material</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Usage</TableHead>
                    <TableHead>Length</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Cost/Unit</TableHead>
                    <TableHead className="text-right">Price/Unit</TableHead>
                    <TableHead className="text-right">Ext. Price</TableHead>
                    <TableHead className="text-center">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sheetItems.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center py-12 text-muted-foreground">
                        <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
                        <p>No materials in this sheet</p>
                        <Button
                          onClick={() => {
                            setSelectedSheetId(sheet.id);
                            setShowBulkSelector(true);
                          }}
                          size="sm"
                          className="mt-4"
                        >
                          <Plus className="w-4 h-4 mr-2" />
                          Add Materials
                        </Button>
                      </TableCell>
                    </TableRow>
                  ) : (
                    sheetItems.map(item => (
                      <TableRow key={item.id} className="hover:bg-slate-50">
                        <TableCell>
                          <Badge variant="outline">{item.category}</Badge>
                        </TableCell>
                        <TableCell className="font-medium">{item.material_name}</TableCell>
                        <TableCell>
                          {item.sku && (
                            <div className="flex items-center gap-1">
                              <Tag className="w-3 h-3 text-slate-500" />
                              <span className="text-sm font-mono">{item.sku}</span>
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{item.usage || '-'}</TableCell>
                        <TableCell className="font-semibold text-blue-700">{item.length || '-'}</TableCell>
                        <TableCell className="text-right">
                          {editingItem?.id === item.id ? (
                            <div className="flex items-center gap-1 justify-end">
                              <Input
                                type="number"
                                min="0"
                                step="0.1"
                                value={editQuantity}
                                onChange={(e) => setEditQuantity(e.target.value)}
                                className="w-20 h-8"
                                autoFocus
                              />
                              <Button onClick={saveQuantity} size="sm" className="h-8 px-2">
                                Save
                              </Button>
                              <Button
                                onClick={() => {
                                  setEditingItem(null);
                                  setEditQuantity('');
                                }}
                                size="sm"
                                variant="ghost"
                                className="h-8 px-2"
                              >
                                Cancel
                              </Button>
                            </div>
                          ) : (
                            <button
                              onClick={() => startEditQuantity(item)}
                              className="font-semibold hover:text-blue-600 transition-colors"
                            >
                              {item.quantity}
                            </button>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          ${(item.cost_per_unit || 0).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          ${(item.price_per_unit || 0).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right font-bold">
                          ${(item.extended_price || 0).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              onClick={() => startSwapMaterial(item)}
                              size="sm"
                              variant="outline"
                              className="h-8 px-2"
                              title="Swap Material"
                            >
                              <RefreshCw className="w-4 h-4" />
                            </Button>
                            <Button
                              onClick={() => deleteItem(item.id, sheet.id)}
                              size="sm"
                              variant="ghost"
                              className="h-8 px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        );
      })}

      {/* Bulk Material Selector */}
      {selectedSheetId && (
        <BulkMaterialSelector
          open={showBulkSelector}
          onClose={() => {
            setShowBulkSelector(false);
            setSelectedSheetId('');
          }}
          sheetId={selectedSheetId}
          onMaterialsAdded={() => {
            loadWorkbook();
            setShowBulkSelector(false);
            setSelectedSheetId('');
          }}
        />
      )}

      {/* Swap Material Dialog */}
      <Dialog open={showSwapDialog} onOpenChange={setShowSwapDialog}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="w-5 h-5" />
              Swap Material: {swappingItem?.material_name}
            </DialogTitle>
          </DialogHeader>

          {swappingItem && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-sm font-semibold text-blue-900 mb-2">Current Material:</p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm text-blue-800">
                <div><span className="font-medium">Material:</span> {swappingItem.material_name}</div>
                <div><span className="font-medium">SKU:</span> {swappingItem.sku || 'N/A'}</div>
                <div><span className="font-medium">Usage:</span> {swappingItem.usage || 'N/A'}</div>
                <div><span className="font-medium">Quantity:</span> {swappingItem.quantity} (preserved)</div>
              </div>
              <p className="text-xs text-blue-700 mt-2">
                Select a replacement material below. Usage and quantity will be preserved.
              </p>
            </div>
          )}

          <div className="space-y-3 flex-1 overflow-hidden flex flex-col">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search materials by name, SKU, or length..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Category Tabs */}
            <div className="border-b border-slate-200">
              <div className="flex items-center gap-1 overflow-x-auto pb-0">
                <button
                  onClick={() => setSelectedCategory(null)}
                  className={`px-4 py-2 font-medium text-sm whitespace-nowrap border-b-2 transition-colors ${
                    selectedCategory === null
                      ? 'border-blue-600 text-blue-600 bg-blue-50'
                      : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
                  }`}
                >
                  All Categories
                </button>
                {categories.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-4 py-2 font-medium text-sm whitespace-nowrap border-b-2 transition-colors ${
                      selectedCategory === cat
                        ? 'border-blue-600 text-blue-600 bg-blue-50'
                        : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Materials Table */}
            <div className="flex-1 overflow-auto border rounded-lg">
              <Table>
                <TableHeader className="sticky top-0 bg-white z-10 shadow-sm">
                  <TableRow className="border-b-2 border-slate-200">
                    <TableHead className="bg-slate-50">Material Name</TableHead>
                    <TableHead className="bg-slate-50">SKU</TableHead>
                    <TableHead className="bg-slate-50">Length</TableHead>
                    <TableHead className="bg-slate-50">Category</TableHead>
                    <TableHead className="text-right bg-slate-50">Cost</TableHead>
                    <TableHead className="text-right bg-slate-50">Price</TableHead>
                    <TableHead className="text-center bg-slate-50">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredMaterials.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                        <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
                        <p>No materials found</p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredMaterials.map(material => (
                      <TableRow key={material.sku} className="hover:bg-slate-50">
                        <TableCell className="font-medium">{material.material_name}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Tag className="w-3 h-3 text-slate-500" />
                            <span className="text-sm font-mono">{material.sku}</span>
                          </div>
                        </TableCell>
                        <TableCell className="font-semibold text-blue-700">
                          {material.part_length || '-'}
                        </TableCell>
                        <TableCell>
                          {cleanCategory(material.category) && (
                            <Badge variant="outline">{cleanCategory(material.category)}</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          ${(material.purchase_cost || 0).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          ${(material.unit_price || 0).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-center">
                          <Button
                            onClick={() => swapMaterial(material)}
                            size="sm"
                            className="bg-blue-600 hover:bg-blue-700"
                          >
                            <RefreshCw className="w-4 h-4 mr-2" />
                            Swap
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="border-t pt-4">
            <Button
              onClick={() => {
                setShowSwapDialog(false);
                setSwappingItem(null);
              }}
              variant="outline"
              className="w-full"
            >
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
