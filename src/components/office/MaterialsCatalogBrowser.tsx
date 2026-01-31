import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
  Package
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Material {
  sku: string;
  material_name: string;
  category: string;
  unit_price: number | null;
  purchase_cost: number | null;
  part_length: string;
  raw_metadata: any[];
}

export function MaterialsCatalogBrowser() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('');

  useEffect(() => {
    loadMaterials();
  }, []);

  async function loadMaterials() {
    try {
      const { data, error } = await supabase
        .from('materials_catalog')
        .select('*')
        .order('category', { ascending: true })
        .order('material_name', { ascending: true });

      if (error) throw error;
      setMaterials(data || []);
    } catch (error) {
      console.error('Error loading materials:', error);
    } finally {
      setLoading(false);
    }
  }

  // Get unique categories
  const categories = useMemo(() => {
    const categorySet = new Set<string>();
    materials.forEach(m => {
      categorySet.add(m.category || 'Uncategorized');
    });
    return Array.from(categorySet).sort();
  }, [materials]);

  // Set initial category when data loads
  useEffect(() => {
    if (categories.length > 0 && !selectedCategory) {
      setSelectedCategory(categories[0]);
    }
  }, [categories, selectedCategory]);

  // Filter materials by selected category and search term
  const filteredMaterials = useMemo(() => {
    let filtered = materials.filter(m => {
      const category = m.category || 'Uncategorized';
      return category === selectedCategory;
    });

    // Apply search filter
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(m => (
        m.material_name.toLowerCase().includes(search) ||
        m.sku.toLowerCase().includes(search) ||
        m.part_length.toLowerCase().includes(search)
      ));
    }

    // Sort by material name, then by length
    return filtered.sort((a, b) => {
      if (a.material_name !== b.material_name) {
        return a.material_name.localeCompare(b.material_name);
      }
      const aNum = parseFloat(a.part_length) || 0;
      const bNum = parseFloat(b.part_length) || 0;
      return aNum - bNum;
    });
  }, [materials, selectedCategory, searchTerm]);

  const totalMaterials = materials.length;

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
    <div className="space-y-4">
      {/* Search Bar */}
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
      <div className="border-b">
        <div className="flex items-center gap-2 overflow-x-auto pb-2">
          {categories.map(category => {
            const count = materials.filter(m => (m.category || 'Uncategorized') === category).length;
            return (
              <Button
                key={category}
                variant={selectedCategory === category ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedCategory(category)}
                className={cn(
                  'flex items-center gap-2 whitespace-nowrap',
                  selectedCategory === category && 'bg-yellow-500 hover:bg-yellow-600 text-black font-bold'
                )}
              >
                {category}
                <Badge 
                  variant="secondary" 
                  className={cn(
                    'text-xs',
                    selectedCategory === category ? 'bg-yellow-700 text-white' : ''
                  )}
                >
                  {count}
                </Badge>
              </Button>
            );
          })}
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span>{totalMaterials.toLocaleString()} total materials</span>
        <span>•</span>
        <span>{categories.length} categories</span>
        <span>•</span>
        <span className="font-semibold text-foreground">{filteredMaterials.length} showing</span>
      </div>

      {/* Materials Table */}
      <Card className="border-2">
        <div className="overflow-auto" style={{ maxHeight: 'calc(100vh - 350px)' }}>
          <Table>
            <TableHeader className="sticky top-0 bg-slate-900 text-white z-10">
              <TableRow className="hover:bg-slate-900">
                <TableHead className="text-white font-bold">SKU</TableHead>
                <TableHead className="text-white font-bold">Material Name</TableHead>
                <TableHead className="text-white font-bold">Length</TableHead>
                <TableHead className="text-white font-bold text-right">Unit Price</TableHead>
                <TableHead className="text-white font-bold text-right">Cost</TableHead>
                <TableHead className="text-white font-bold text-center">Variants</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredMaterials.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                    <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>{searchTerm ? 'No materials found matching your search' : 'No materials in this category'}</p>
                  </TableCell>
                </TableRow>
              ) : (
                filteredMaterials.map((material, index) => (
                  <TableRow
                    key={material.sku}
                    className={index % 2 === 0 ? 'bg-white hover:bg-slate-50' : 'bg-slate-50 hover:bg-slate-100'}
                  >
                    <TableCell className="font-mono text-sm">{material.sku}</TableCell>
                    <TableCell className="font-medium">{material.material_name}</TableCell>
                    <TableCell className="font-semibold">{material.part_length}"</TableCell>
                    <TableCell className="text-right">
                      {material.unit_price ? (
                        <span className="font-semibold text-green-700">
                          ${material.unit_price.toFixed(2)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {material.purchase_cost ? (
                        <span className="text-slate-700">
                          ${material.purchase_cost.toFixed(2)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {material.raw_metadata.length > 1 ? (
                        <Badge variant="outline" className="text-xs">
                          {material.raw_metadata.length}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
