import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { 
  ChevronDown, 
  ChevronRight, 
  Search, 
  Upload,
  Package,
  DollarSign,
  Tag,
  FileText
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

interface GroupedMaterial {
  parent_name: string;
  category: string | null;
  items: MaterialCatalogItem[];
}

export function MaterialInventory() {
  const [materials, setMaterials] = useState<MaterialCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    loadMaterials();
  }, []);

  async function loadMaterials() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('materials_catalog')
        .select('*')
        .order('material_name', { ascending: true });

      if (error) throw error;
      setMaterials(data || []);
    } catch (error: any) {
      console.error('Error loading materials:', error);
      toast.error('Failed to load materials');
    } finally {
      setLoading(false);
    }
  }

  // Group materials by name
  const groupedMaterials = useMemo(() => {
    const groups = new Map<string, GroupedMaterial>();

    materials.forEach(material => {
      const key = material.material_name;
      if (!groups.has(key)) {
        groups.set(key, {
          parent_name: key,
          category: material.category,
          items: [],
        });
      }
      groups.get(key)!.items.push(material);
    });

    return Array.from(groups.values());
  }, [materials]);

  // Get unique categories
  const categories = useMemo(() => {
    const cats = new Set<string>();
    materials.forEach(m => {
      if (m.category) cats.add(m.category);
    });
    return Array.from(cats).sort();
  }, [materials]);

  // Filter materials
  const filteredGroups = useMemo(() => {
    let filtered = groupedMaterials;

    // Filter by category
    if (selectedCategory) {
      filtered = filtered.filter(g => g.category === selectedCategory);
    }

    // Filter by search term
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(g =>
        g.parent_name.toLowerCase().includes(term) ||
        g.items.some(item => 
          item.sku.toLowerCase().includes(term) ||
          item.part_length?.toLowerCase().includes(term)
        )
      );
    }

    return filtered;
  }, [groupedMaterials, selectedCategory, searchTerm]);

  function toggleParent(parentName: string) {
    const newExpanded = new Set(expandedParents);
    if (newExpanded.has(parentName)) {
      newExpanded.delete(parentName);
    } else {
      newExpanded.add(parentName);
    }
    setExpandedParents(newExpanded);
  }

  async function handleImportCSV() {
    if (!importFile) {
      toast.error('Please select a file');
      return;
    }

    try {
      setImporting(true);
      const text = await importFile.text();
      const lines = text.split('\n');
      const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));

      console.log('📋 CSV Headers found:', headers);

      // Helper function to find column index (case-insensitive, flexible matching)
      const findColumnIndex = (possibleNames: string[]): number => {
        for (const name of possibleNames) {
          const idx = headers.findIndex(h => 
            h.toLowerCase().trim() === name.toLowerCase().trim()
          );
          if (idx !== -1) return idx;
        }
        return -1;
      };

      // Find column indices with multiple possible names
      const itemNameIdx = findColumnIndex(['Item Name', 'ItemName', 'Name', 'Material Name']);
      const skuIdx = findColumnIndex(['SKU', 'Item ID', 'ItemID', 'ID']);
      const rateIdx = findColumnIndex(['Rate', 'Price', 'Unit Price', 'Selling Price']);
      const purchaseRateIdx = findColumnIndex(['Purchase Rate', 'Cost', 'Purchase Cost', 'Purchase Price']);
      const accountIdx = findColumnIndex(['Account', 'Category', 'Type']);

      console.log('📊 Column indices:', {
        itemName: itemNameIdx,
        sku: skuIdx,
        rate: rateIdx,
        purchaseRate: purchaseRateIdx,
        account: accountIdx
      });

      if (itemNameIdx === -1 || skuIdx === -1) {
        throw new Error(`Required columns not found. Found headers: ${headers.join(', ')}`);
      }

      // Group by SKU to handle duplicates (color variants, etc.)
      const materialsBySku = new Map<string, any>();
      let totalRows = 0;

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // Parse CSV line (basic implementation - may need enhancement for complex CSVs)
        const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
        
        const itemName = values[itemNameIdx];
        const sku = values[skuIdx];
        
        if (!itemName || !sku) continue;

        totalRows++;

        // Create raw metadata object with ALL columns for this row
        const rowMetadata: any = {};
        headers.forEach((header, idx) => {
          rowMetadata[header] = values[idx] || '';
        });

        // If this SKU already exists, add to the metadata array
        if (materialsBySku.has(sku)) {
          const existing = materialsBySku.get(sku);
          // Add this row's metadata to the array
          existing.raw_metadata.push(rowMetadata);
        } else {
          // Extract length from item name or SKU if present
          const lengthMatch = itemName.match(/(\d+['"]?\s*(?:LVL|x|ft|in)?)/i) || 
                             sku.match(/(\d+['"]?)/);
          const partLength = lengthMatch ? lengthMatch[1] : null;

          // Helper to parse price values that may have "USD" prefix, currency symbols, etc.
          const parsePrice = (value: string): number => {
            if (!value || value === '') return 0;
            // Remove currency symbols, "USD" prefix, commas, and whitespace
            const cleaned = value
              .replace(/USD\s*/i, '')
              .replace(/\$/g, '')
              .replace(/,/g, '')
              .trim();
            const parsed = parseFloat(cleaned);
            const result = isNaN(parsed) ? 0 : parsed;
            return result;
          };

          const unitPrice = rateIdx !== -1 ? parsePrice(values[rateIdx]) : 0;
          const purchaseCost = purchaseRateIdx !== -1 ? parsePrice(values[purchaseRateIdx]) : 0;

          // Debug first few rows
          if (totalRows <= 3) {
            console.log(`Row ${totalRows} pricing:`, {
              sku,
              itemName,
              rawRate: values[rateIdx],
              rawPurchaseRate: values[purchaseRateIdx],
              parsedUnitPrice: unitPrice,
              parsedPurchaseCost: purchaseCost
            });
          }

          // Create new entry with metadata as an array
          materialsBySku.set(sku, {
            sku: sku,
            material_name: itemName,
            category: accountIdx !== -1 ? values[accountIdx] : null,
            unit_price: unitPrice,
            purchase_cost: purchaseCost,
            part_length: partLength,
            raw_metadata: [rowMetadata], // Store as array to preserve all variants
          });
        }
      }

      // Convert to array of unique materials
      const materialsToInsert = Array.from(materialsBySku.values());

      // Insert in batches of 500
      const batchSize = 500;
      for (let i = 0; i < materialsToInsert.length; i += batchSize) {
        const batch = materialsToInsert.slice(i, i + batchSize);
        const { error } = await supabase
          .from('materials_catalog')
          .upsert(batch, { onConflict: 'sku' });

        if (error) throw error;
      }

      console.log('✅ Import complete:', {
        uniqueMaterials: materialsToInsert.length,
        totalRows,
        sampleMaterial: materialsToInsert[0]
      });
      
      toast.success(`Imported ${materialsToInsert.length} unique materials from ${totalRows} rows`);
      setShowImportDialog(false);
      setImportFile(null);
      await loadMaterials();
    } catch (error: any) {
      console.error('Import error:', error);
      toast.error(`Import failed: ${error.message}`);
    } finally {
      setImporting(false);
    }
  }

  const totalItems = materials.length;
  const totalParents = groupedMaterials.length;

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Package className="w-12 h-12 mx-auto mb-4 opacity-50 animate-pulse" />
          <p className="text-muted-foreground">Loading materials catalog...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between bg-gradient-to-r from-slate-900 via-black to-slate-900 text-white rounded-lg p-4 shadow-lg border-2 border-yellow-500">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Material Inventory</h2>
          <p className="text-yellow-400">
            {totalParents} Materials • {totalItems} SKU Variants
          </p>
        </div>
        <Button 
          onClick={() => setShowImportDialog(true)}
          className="bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-600 hover:to-yellow-700 text-black font-semibold shadow-lg border-2 border-yellow-400"
        >
          <Upload className="w-4 h-4 mr-2" />
          Import CSV
        </Button>
      </div>

      {/* Category Filter Bar */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        <Button
          variant={selectedCategory === null ? 'default' : 'outline'}
          onClick={() => setSelectedCategory(null)}
          className="whitespace-nowrap"
        >
          All Categories
        </Button>
        {categories.map(cat => (
          <Button
            key={cat}
            variant={selectedCategory === cat ? 'default' : 'outline'}
            onClick={() => setSelectedCategory(cat)}
            className="whitespace-nowrap"
          >
            {cat}
          </Button>
        ))}
      </div>

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

      {/* Materials List */}
      <Card>
        <CardContent className="p-0 max-h-[calc(100vh-300px)] overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-white z-10 shadow-sm">
              <TableRow className="border-b-2 border-slate-200">
                <TableHead className="w-12 bg-slate-50"></TableHead>
                <TableHead className="bg-slate-50 font-bold">Material Name & Length</TableHead>
                <TableHead className="bg-slate-50 font-bold">SKU</TableHead>
                <TableHead className="bg-slate-50 font-bold">Category</TableHead>
                <TableHead className="text-right bg-slate-50 font-bold">Cost</TableHead>
                <TableHead className="text-right bg-slate-50 font-bold">Price</TableHead>
                <TableHead className="text-right bg-slate-50 font-bold">Markup %</TableHead>
                <TableHead className="text-right bg-slate-50 font-bold">Variants</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredGroups.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                    <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>No materials found</p>
                  </TableCell>
                </TableRow>
              ) : (
                filteredGroups.map(group => (
                  <MaterialRow
                    key={group.parent_name}
                    group={group}
                    isExpanded={expandedParents.has(group.parent_name)}
                    onToggle={() => toggleParent(group.parent_name)}
                  />
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Import Dialog */}
      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import Materials from CSV</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Upload your Smartbuild Items.csv file. The system will:
              </p>
              <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
                <li>Group materials by Item Name</li>
                <li>Preserve all SKU variants with pricing</li>
                <li>Store complete metadata for export</li>
                <li>Update existing SKUs if found</li>
              </ul>
            </div>

            <div className="border-2 border-dashed rounded-lg p-8 text-center">
              <input
                type="file"
                accept=".csv"
                onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                className="hidden"
                id="csv-upload"
              />
              <label htmlFor="csv-upload" className="cursor-pointer">
                <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <p className="font-medium mb-2">
                  {importFile ? importFile.name : 'Click to select CSV file'}
                </p>
                <p className="text-xs text-muted-foreground">
                  Required columns: Item Name, SKU, Rate, Purchase Rate, Account
                </p>
              </label>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowImportDialog(false);
                  setImportFile(null);
                }}
                disabled={importing}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={handleImportCSV}
                disabled={!importFile || importing}
                className="flex-1"
              >
                {importing ? 'Importing...' : 'Import'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MaterialRow({ 
  group, 
  isExpanded, 
  onToggle 
}: { 
  group: GroupedMaterial; 
  isExpanded: boolean; 
  onToggle: () => void;
}) {
  // Calculate average cost and price for parent row
  const costs = group.items
    .map(i => i.purchase_cost)
    .filter((c): c is number => c !== null && c > 0);
  const prices = group.items
    .map(i => i.unit_price)
    .filter((p): p is number => p !== null && p > 0);
  
  const avgCost = costs.length > 0 ? costs.reduce((a, b) => a + b, 0) / costs.length : 0;
  const avgPrice = prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : 0;
  const avgMarkup = avgCost > 0 ? ((avgPrice - avgCost) / avgCost) * 100 : 0;

  // Helper function to calculate markup and determine color
  const getMarkupDisplay = (cost: number | null, price: number | null) => {
    if (!cost || cost === 0 || !price) {
      return { markup: 0, color: 'text-slate-400', bgColor: 'bg-slate-100' };
    }
    
    const markup = ((price - cost) / cost) * 100;
    
    // Color coding based on margin
    if (markup < 20) {
      return { markup, color: 'text-red-700 font-bold', bgColor: 'bg-red-50' };
    } else if (markup < 30) {
      return { markup, color: 'text-orange-700 font-semibold', bgColor: 'bg-orange-50' };
    } else {
      return { markup, color: 'text-green-700', bgColor: 'bg-green-50' };
    }
  };

  const parentMarkupDisplay = getMarkupDisplay(avgCost, avgPrice);

  return (
    <>
      {/* Parent Row */}
      <TableRow 
        className="cursor-pointer hover:bg-slate-100 border-b border-slate-200"
        onClick={onToggle}
      >
        <TableCell className="bg-slate-50">
          {isExpanded ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </TableCell>
        <TableCell className="font-bold text-slate-900">
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4 text-slate-600" />
            {group.parent_name}
          </div>
        </TableCell>
        <TableCell className="text-slate-600">—</TableCell>
        <TableCell>
          {group.category && (
            <Badge variant="outline" className="font-medium">{group.category}</Badge>
          )}
        </TableCell>
        <TableCell className="text-right font-medium text-slate-700">
          ${avgCost.toFixed(2)}
        </TableCell>
        <TableCell className="text-right font-medium text-slate-700">
          ${avgPrice.toFixed(2)}
        </TableCell>
        <TableCell className={`text-right ${parentMarkupDisplay.color} ${parentMarkupDisplay.bgColor} rounded px-2`}>
          {parentMarkupDisplay.markup.toFixed(1)}%
        </TableCell>
        <TableCell className="text-right">
          <Badge className="bg-slate-900 text-white">{group.items.length}</Badge>
        </TableCell>
      </TableRow>

      {/* Sub-Material Rows */}
      {isExpanded && group.items.map(item => {
        const itemMarkupDisplay = getMarkupDisplay(item.purchase_cost, item.unit_price);
        
        return (
          <TableRow key={item.sku} className="bg-slate-50/50 hover:bg-slate-100 border-b border-slate-100">
            <TableCell className="bg-slate-50"></TableCell>
            <TableCell className="pl-8">
              <div className="flex items-center gap-2">
                <span className="text-slate-900 font-medium">
                  {group.parent_name}
                  {item.part_length && (
                    <span className="text-blue-700 font-bold"> : {item.part_length}</span>
                  )}
                </span>
              </div>
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-1">
                <Tag className="w-3 h-3 text-slate-500" />
                <span className="text-sm font-mono text-slate-700">{item.sku}</span>
              </div>
            </TableCell>
            <TableCell>
              {group.category && (
                <span className="text-xs text-slate-500">{group.category}</span>
              )}
            </TableCell>
            <TableCell className="text-right font-semibold text-orange-700">
              ${(item.purchase_cost || 0).toFixed(2)}
            </TableCell>
            <TableCell className="text-right font-semibold text-green-700">
              ${(item.unit_price || 0).toFixed(2)}
            </TableCell>
            <TableCell className={`text-right font-bold ${itemMarkupDisplay.color} ${itemMarkupDisplay.bgColor} rounded px-2`}>
              {itemMarkupDisplay.markup.toFixed(1)}%
            </TableCell>
            <TableCell className="text-right">
              {item.raw_metadata && Array.isArray(item.raw_metadata) && item.raw_metadata.length > 1 && (
                <Badge variant="outline" className="text-xs">
                  {item.raw_metadata.length} variants
                </Badge>
              )}
            </TableCell>
          </TableRow>
        );
      })}
    </>
  );
}
