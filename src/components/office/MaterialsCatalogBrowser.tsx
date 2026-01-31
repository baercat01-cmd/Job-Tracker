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
  Package,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

interface Material {
  sku: string;
  material_name: string;
  category: string;
  unit_price: number | null;
  purchase_cost: number | null;
  part_length: string;
  raw_metadata: any[];
}

interface CategoryGroup {
  category: string;
  materials: Material[];
  expanded: boolean;
}

export function MaterialsCatalogBrowser() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

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

  // Group materials by category
  const categoryGroups = useMemo(() => {
    const filtered = materials.filter(m => {
      const search = searchTerm.toLowerCase();
      return (
        m.material_name.toLowerCase().includes(search) ||
        m.category.toLowerCase().includes(search) ||
        m.sku.toLowerCase().includes(search) ||
        m.part_length.toLowerCase().includes(search)
      );
    });

    // Group by category
    const groupsMap = new Map<string, Material[]>();

    filtered.forEach(material => {
      const category = material.category || 'Uncategorized';
      if (!groupsMap.has(category)) {
        groupsMap.set(category, []);
      }
      groupsMap.get(category)!.push(material);
    });

    // Convert to array and sort
    return Array.from(groupsMap.entries())
      .map(([category, materials]) => ({
        category,
        materials: materials.sort((a, b) => {
          // Sort by material name, then by length
          if (a.material_name !== b.material_name) {
            return a.material_name.localeCompare(b.material_name);
          }
          const aNum = parseFloat(a.part_length) || 0;
          const bNum = parseFloat(b.part_length) || 0;
          return aNum - bNum;
        }),
        expanded: expandedCategories.has(category)
      }))
      .sort((a, b) => a.category.localeCompare(b.category));
  }, [materials, searchTerm, expandedCategories]);

  function toggleCategory(category: string) {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(category)) {
      newExpanded.delete(category);
    } else {
      newExpanded.add(category);
    }
    setExpandedCategories(newExpanded);
  }

  function expandAll() {
    setExpandedCategories(new Set(categoryGroups.map(g => g.category)));
  }

  function collapseAll() {
    setExpandedCategories(new Set());
  }

  const totalMaterials = materials.length;
  const totalCategories = categoryGroups.length;

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
      {/* Search and Controls */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search materials, categories, SKU, length..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={expandAll}>
            <ChevronDown className="w-4 h-4 mr-2" />
            Expand All
          </Button>
          <Button variant="outline" size="sm" onClick={collapseAll}>
            <ChevronUp className="w-4 h-4 mr-2" />
            Collapse All
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span>{totalMaterials.toLocaleString()} materials</span>
        <span>•</span>
        <span>{totalCategories} categories</span>
        <span>•</span>
        <span>{expandedCategories.size} expanded</span>
      </div>

      {/* Spreadsheet Table with Scroll */}
      <Card className="border-2">
        <div className="overflow-auto" style={{ maxHeight: 'calc(100vh - 300px)' }}>
          <Table>
            <TableHeader className="sticky top-0 bg-slate-900 text-white z-10">
              <TableRow className="hover:bg-slate-900">
                <TableHead className="text-white font-bold w-[40px]"></TableHead>
                <TableHead className="text-white font-bold">SKU</TableHead>
                <TableHead className="text-white font-bold">Material Name</TableHead>
                <TableHead className="text-white font-bold">Length</TableHead>
                <TableHead className="text-white font-bold text-right">Unit Price</TableHead>
                <TableHead className="text-white font-bold text-right">Cost</TableHead>
                <TableHead className="text-white font-bold text-center">Variants</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categoryGroups.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                    <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>No materials found</p>
                  </TableCell>
                </TableRow>
              ) : (
                categoryGroups.map(group => (
                  <>
                    {/* Category Header Row */}
                    <TableRow
                      key={group.category}
                      className="bg-yellow-50 hover:bg-yellow-100 cursor-pointer border-y-2 border-yellow-500"
                      onClick={() => toggleCategory(group.category)}
                    >
                      <TableCell className="font-bold">
                        {group.expanded ? (
                          <ChevronDown className="w-5 h-5" />
                        ) : (
                          <ChevronUp className="w-5 h-5" />
                        )}
                      </TableCell>
                      <TableCell colSpan={6} className="font-bold text-lg">
                        <div className="flex items-center justify-between">
                          <span>{group.category}</span>
                          <Badge variant="secondary" className="bg-yellow-500 text-black">
                            {group.materials.length} items
                          </Badge>
                        </div>
                      </TableCell>
                    </TableRow>

                    {/* Material Rows */}
                    {group.expanded && group.materials.map((material, index) => (
                      <TableRow
                        key={material.sku}
                        className={index % 2 === 0 ? 'bg-white hover:bg-slate-50' : 'bg-slate-50 hover:bg-slate-100'}
                      >
                        <TableCell></TableCell>
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
                    ))}
                  </>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
