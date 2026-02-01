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
  displayName?: string;
}

export function MaterialInventory() {
  const [materials, setMaterials] = useState<MaterialCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
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

  // Flatten materials - no grouping
  const flatMaterials = useMemo(() => {
    return materials.map(material => ({
      ...material,
      displayName: material.part_length 
        ? `${material.material_name} : ${material.part_length}`
        : material.material_name
    }));
  }, [materials]);

  // Get unique categories
  const categories = useMemo(() => {
    const cats = new Set<string>();
    flatMaterials.forEach(m => {
      if (m.category) cats.add(m.category);
    });
    return Array.from(cats).sort();
  }, [flatMaterials]);

  // Filter materials
  const filteredMaterials = useMemo(() => {
    let filtered = flatMaterials;

    // Filter by category
    if (selectedCategory) {
      filtered = filtered.filter(m => m.category === selectedCategory);
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

    // Sort by name then length
    return filtered.sort((a, b) => {
      const nameCompare = a.material_name.localeCompare(b.material_name);
      if (nameCompare !== 0) return nameCompare;
      return (a.part_length || '').localeCompare(b.part_length || '');
    });
  }, [flatMaterials, selectedCategory, searchTerm]);



  // Enhanced CSV parser that handles quoted values
  function parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    
    result.push(current.trim());
    return result;
  }

  async function handleImportCSV() {
    if (!importFile) {
      toast.error('Please select a file');
      return;
    }

    try {
      setImporting(true);
      const text = await importFile.text();
      const lines = text.split('\n').filter(line => line.trim());
      const headers = parseCSVLine(lines[0]).map(h => h.replace(/"/g, '').trim());

      console.log('CSV Headers found:', headers);

      // Find column indices - try multiple variations
      const itemNameIdx = headers.findIndex(h => 
        h.toLowerCase().includes('item') && h.toLowerCase().includes('name')
      );
      const skuIdx = headers.findIndex(h => h.toLowerCase() === 'sku');
      const rateIdx = headers.findIndex(h => h.toLowerCase() === 'rate');
      const purchaseRateIdx = headers.findIndex(h => 
        h.toLowerCase().includes('purchase') && h.toLowerCase().includes('rate')
      );
      const accountIdx = headers.findIndex(h => h.toLowerCase() === 'account');
      const partLengthIdx = headers.findIndex(h => 
        h.toLowerCase().includes('cf.part') && h.toLowerCase().includes('length')
      );

      console.log('Column indices:', { itemNameIdx, skuIdx, rateIdx, purchaseRateIdx, accountIdx, partLengthIdx });

      if (itemNameIdx === -1 || skuIdx === -1) {
        throw new Error(`Required columns not found. Found headers: ${headers.join(', ')}`);
      }

      // Group by SKU to handle duplicates (color variants, etc.)
      const materialsBySku = new Map<string, any>();
      let totalRows = 0;

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // Parse CSV line with proper quote handling
        const values = parseCSVLine(line).map(v => v.replace(/"/g, '').trim());
        
        const itemName = values[itemNameIdx];
        const sku = values[skuIdx];
        
        if (!itemName || !sku) continue;

        totalRows++;

        // Debug first row
        if (totalRows === 1) {
          console.log('First row sample:', {
            itemName,
            sku,
            rate: values[rateIdx],
            purchaseRate: values[purchaseRateIdx],
            account: accountIdx !== -1 ? values[accountIdx] : 'N/A',
            partLength: partLengthIdx !== -1 ? values[partLengthIdx] : 'N/A'
          });
        }

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
          // Get length from CF.Part Length column
          const partLength = partLengthIdx !== -1 ? values[partLengthIdx] : null;

          // Helper to parse price values with various formats
          const parsePrice = (value: string): number => {
            if (!value) return 0;
            // Remove USD prefix, dollar signs, commas, and whitespace
            const cleaned = value
              .replace(/USD\s*/i, '')
              .replace(/\$/g, '')
              .replace(/,/g, '')
              .trim();
            const parsed = parseFloat(cleaned);
            return isNaN(parsed) ? 0 : parsed;
          };

          // Create new entry with metadata as an array
          materialsBySku.set(sku, {
            sku: sku,
            material_name: itemName,
            category: accountIdx !== -1 ? values[accountIdx] : null,
            unit_price: rateIdx !== -1 ? parsePrice(values[rateIdx]) : 0,
            purchase_cost: purchaseRateIdx !== -1 ? parsePrice(values[purchaseRateIdx]) : 0,
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

      toast.success(`Imported ${materialsToInsert.length} unique materials from ${totalRows} rows`);
      setShowImportDialog(false);
      setImportFile(null);
      loadMaterials();
    } catch (error: any) {
      console.error('Import error:', error);
      toast.error(`Import failed: ${error.message}`);
    } finally {
      setImporting(false);
    }
  }

  const totalItems = materials.length;
  
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
            {totalItems} Materials
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
                <TableHead className="bg-slate-50 font-bold">Material Name</TableHead>
                <TableHead className="bg-slate-50 font-bold">Length</TableHead>
                <TableHead className="bg-slate-50 font-bold">SKU</TableHead>
                <TableHead className="bg-slate-50 font-bold">Category</TableHead>
                <TableHead className="text-right bg-slate-50 font-bold">Cost</TableHead>
                <TableHead className="text-right bg-slate-50 font-bold">Price</TableHead>
                <TableHead className="text-right bg-slate-50 font-bold">Markup %</TableHead>
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
                filteredMaterials.map(material => {
                  const markupDisplay = getMarkupDisplay(material.purchase_cost, material.unit_price);
                  
                  return (
                    <TableRow key={material.sku} className="hover:bg-slate-50 border-b border-slate-100">
                      <TableCell className="font-medium text-slate-900">
                        <div className="flex items-center gap-2">
                          <Package className="w-4 h-4 text-slate-600" />
                          <span>{material.material_name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-semibold text-blue-700">
                        {material.part_length || ''}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Tag className="w-3 h-3 text-slate-500" />
                          <span className="text-sm font-mono text-slate-700">{material.sku}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {material.category && (
                          <Badge variant="outline" className="font-medium">{material.category}</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-semibold text-orange-700">
                        ${(material.purchase_cost || 0).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right font-semibold text-green-700">
                        ${(material.unit_price || 0).toFixed(2)}
                      </TableCell>
                      <TableCell className={`text-right font-bold ${markupDisplay.color} ${markupDisplay.bgColor} rounded px-2`}>
                        {markupDisplay.markup.toFixed(1)}%
                      </TableCell>
                    </TableRow>
                  );
                })
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
                  Required columns: Item Name, SKU, Rate, Purchase Rate, Account, CF.Part Length
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
