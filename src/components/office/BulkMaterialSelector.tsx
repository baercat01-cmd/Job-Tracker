import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Search,
  Package,
  Tag,
  CheckSquare,
  Square,
  Plus,
} from 'lucide-react';
import { toast } from 'sonner';

interface MaterialCatalogItem {
  sku: string;
  material_name: string;
  category: string | null;
  unit_price: number | null;
  purchase_cost: number | null;
  part_length: string | null;
  raw_metadata: any;
}

interface BulkMaterialSelectorProps {
  open: boolean;
  onClose: () => void;
  sheetId: string;
  onMaterialsAdded: () => void;
}

export function BulkMaterialSelector({
  open,
  onClose,
  sheetId,
  onMaterialsAdded,
}: BulkMaterialSelectorProps) {
  const [materials, setMaterials] = useState<MaterialCatalogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedMaterials, setSelectedMaterials] = useState<Set<string>>(new Set());
  const [defaultQuantity, setDefaultQuantity] = useState('1');

  useEffect(() => {
    if (open) {
      loadMaterials();
      setSelectedMaterials(new Set());
      setSearchTerm('');
      setSelectedCategory(null);
    }
  }, [open]);

  async function loadMaterials() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('materials_catalog')
        .select('*')
        .order('category', { ascending: true })
        .order('material_name', { ascending: true });

      if (error) throw error;
      setMaterials(data || []);
    } catch (error: any) {
      console.error('Error loading materials:', error);
      toast.error('Failed to load materials catalog');
    } finally {
      setLoading(false);
    }
  }

  // Helper to clean category name
  const cleanCategory = (category: string | null): string | null => {
    if (!category) return null;
    return category
      .replace(/^USD\s*[-:]?\s*/i, '')
      .replace(/Sales\s*[-:]?\s*/gi, '')
      .replace(/^[-:]\s*/, '')
      .trim() || null;
  };

  // Get unique categories
  const categories = useMemo(() => {
    const cats = new Set<string>();
    materials.forEach(m => {
      const cleaned = cleanCategory(m.category);
      // Only add valid categories (not empty, not just numbers)
      if (cleaned && !/^[\d\$,.\s]+$/.test(cleaned)) {
        cats.add(cleaned);
      }
    });
    return Array.from(cats).sort();
  }, [materials]);

  // Filter materials by category and search
  const filteredMaterials = useMemo(() => {
    let filtered = materials;

    // Filter by category
    if (selectedCategory) {
      filtered = filtered.filter(m => cleanCategory(m.category) === selectedCategory);
    }

    // Filter by search term
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(m =>
        m.material_name.toLowerCase().includes(term) ||
        m.sku.toLowerCase().includes(term) ||
        m.part_length?.toLowerCase().includes(term)
      );
    }

    return filtered;
  }, [materials, selectedCategory, searchTerm]);

  // Materials in current category that are selected
  const selectedInCategory = useMemo(() => {
    return filteredMaterials.filter(m => selectedMaterials.has(m.sku));
  }, [filteredMaterials, selectedMaterials]);

  // Toggle individual material
  function toggleMaterial(sku: string) {
    const newSelected = new Set(selectedMaterials);
    if (newSelected.has(sku)) {
      newSelected.delete(sku);
    } else {
      newSelected.add(sku);
    }
    setSelectedMaterials(newSelected);
  }

  // Select all in current view
  function selectAllInView() {
    const newSelected = new Set(selectedMaterials);
    filteredMaterials.forEach(m => newSelected.add(m.sku));
    setSelectedMaterials(newSelected);
  }

  // Deselect all in current view
  function deselectAllInView() {
    const newSelected = new Set(selectedMaterials);
    filteredMaterials.forEach(m => newSelected.delete(m.sku));
    setSelectedMaterials(newSelected);
  }

  // Clear all selections
  function clearAllSelections() {
    setSelectedMaterials(new Set());
  }

  async function addSelectedMaterials() {
    if (selectedMaterials.size === 0) {
      toast.error('No materials selected');
      return;
    }

    const quantity = parseFloat(defaultQuantity);
    if (isNaN(quantity) || quantity <= 0) {
      toast.error('Please enter a valid quantity');
      return;
    }

    try {
      setAdding(true);

      // Get the selected material objects
      const materialsToAdd = materials.filter(m => selectedMaterials.has(m.sku));

      // Get the current max order_index for this sheet
      const { data: existingItems } = await supabase
        .from('material_items')
        .select('order_index')
        .eq('sheet_id', sheetId)
        .order('order_index', { ascending: false })
        .limit(1);

      let nextOrderIndex = (existingItems?.[0]?.order_index || 0) + 1;

      // Prepare items to insert
      const itemsToInsert = materialsToAdd.map(material => {
        // Calculate markup if we have both cost and price
        let markupPercent = null;
        if (material.purchase_cost && material.unit_price) {
          markupPercent = ((material.unit_price - material.purchase_cost) / material.purchase_cost) * 100;
        }

        const item = {
          sheet_id: sheetId,
          category: cleanCategory(material.category) || 'Uncategorized',
          sku: material.sku,
          material_name: material.material_name,
          quantity: quantity,
          length: material.part_length || null,
          cost_per_unit: material.purchase_cost || null,
          markup_percent: markupPercent,
          price_per_unit: material.unit_price || null,
          extended_cost: material.purchase_cost ? material.purchase_cost * quantity : null,
          extended_price: material.unit_price ? material.unit_price * quantity : null,
          taxable: true,
          order_index: nextOrderIndex++,
        };

        return item;
      });

      // Insert in batches of 100
      const batchSize = 100;
      let totalInserted = 0;

      for (let i = 0; i < itemsToInsert.length; i += batchSize) {
        const batch = itemsToInsert.slice(i, i + batchSize);
        
        const { error } = await supabase
          .from('material_items')
          .insert(batch);

        if (error) throw error;
        totalInserted += batch.length;
      }

      toast.success(`Added ${totalInserted} materials to sheet`);
      onMaterialsAdded();
      onClose();
      setSelectedMaterials(new Set());
      setDefaultQuantity('1');
    } catch (error: any) {
      console.error('Error adding materials:', error);
      toast.error(`Failed to add materials: ${error.message}`);
    } finally {
      setAdding(false);
    }
  }

  const allInViewSelected = filteredMaterials.length > 0 && 
    filteredMaterials.every(m => selectedMaterials.has(m.sku));

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="w-5 h-5" />
            Add Materials from Catalog
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
          {/* Search and Controls */}
          <div className="space-y-3">
            <div className="flex gap-3 items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search materials by name, SKU, or length..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Default Quantity</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.1"
                  value={defaultQuantity}
                  onChange={(e) => setDefaultQuantity(e.target.value)}
                  className="w-24"
                />
              </div>
            </div>

            {/* Category Filter Tabs */}
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

            {/* Selection Controls */}
            <div className="flex items-center justify-between bg-slate-50 px-4 py-2 rounded border">
              <div className="flex items-center gap-4">
                <span className="text-sm font-medium">
                  {selectedMaterials.size} selected
                </span>
                {selectedInCategory.length > 0 && (
                  <span className="text-xs text-muted-foreground">
                    ({selectedInCategory.length} in current view)
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={allInViewSelected ? deselectAllInView : selectAllInView}
                  disabled={filteredMaterials.length === 0}
                >
                  {allInViewSelected ? (
                    <>
                      <Square className="w-4 h-4 mr-2" />
                      Deselect All in View
                    </>
                  ) : (
                    <>
                      <CheckSquare className="w-4 h-4 mr-2" />
                      Select All in View
                    </>
                  )}
                </Button>
                {selectedMaterials.size > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={clearAllSelections}
                  >
                    Clear All
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Materials Table */}
          <div className="flex-1 overflow-auto border rounded-lg">
            <Table>
              <TableHeader className="sticky top-0 bg-white z-10 shadow-sm">
                <TableRow className="border-b-2 border-slate-200">
                  <TableHead className="w-12 bg-slate-50">
                    <Checkbox
                      checked={allInViewSelected}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          selectAllInView();
                        } else {
                          deselectAllInView();
                        }
                      }}
                      disabled={filteredMaterials.length === 0}
                    />
                  </TableHead>
                  <TableHead className="bg-slate-50 font-bold">Material Name</TableHead>
                  <TableHead className="bg-slate-50 font-bold">SKU</TableHead>
                  <TableHead className="bg-slate-50 font-bold">Length</TableHead>
                  <TableHead className="bg-slate-50 font-bold">Category</TableHead>
                  <TableHead className="text-right bg-slate-50 font-bold">Cost</TableHead>
                  <TableHead className="text-right bg-slate-50 font-bold">Price</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12">
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                        <p className="text-muted-foreground">Loading materials...</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : filteredMaterials.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                      <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p>No materials found</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredMaterials.map(material => {
                    const isSelected = selectedMaterials.has(material.sku);
                    
                    return (
                      <TableRow
                        key={material.sku}
                        className={`cursor-pointer hover:bg-slate-50 border-b border-slate-100 ${
                          isSelected ? 'bg-blue-50' : ''
                        }`}
                        onClick={() => toggleMaterial(material.sku)}
                      >
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleMaterial(material.sku)}
                          />
                        </TableCell>
                        <TableCell className="font-medium text-slate-900">
                          <div className="flex items-center gap-2">
                            <Package className="w-4 h-4 text-slate-600 flex-shrink-0" />
                            <span>{material.material_name}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Tag className="w-3 h-3 text-slate-500 flex-shrink-0" />
                            <span className="text-sm font-mono text-slate-700">{material.sku}</span>
                          </div>
                        </TableCell>
                        <TableCell className="font-semibold text-blue-700">
                          {material.part_length || '-'}
                        </TableCell>
                        <TableCell>
                          {cleanCategory(material.category) && (
                            <Badge variant="outline" className="font-medium">
                              {cleanCategory(material.category)}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-semibold text-black">
                          ${(material.purchase_cost || 0).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right font-semibold text-black">
                          ${(material.unit_price || 0).toFixed(2)}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        <DialogFooter className="border-t pt-4">
          <div className="flex items-center justify-between w-full">
            <div className="text-sm text-muted-foreground">
              {selectedMaterials.size} material{selectedMaterials.size !== 1 ? 's' : ''} selected
              {selectedMaterials.size > 0 && (
                <span className="ml-2">
                  • {defaultQuantity} qty each
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={onClose}
                disabled={adding}
              >
                Cancel
              </Button>
              <Button
                onClick={addSelectedMaterials}
                disabled={selectedMaterials.size === 0 || adding}
              >
                {adding ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    Adding...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4 mr-2" />
                    Add {selectedMaterials.size} Material{selectedMaterials.size !== 1 ? 's' : ''}
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
