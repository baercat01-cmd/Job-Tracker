import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { 
  Search, 
  Package, 
  ChevronDown, 
  ChevronRight,
  FileSpreadsheet,
  Ruler,
  DollarSign
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

interface MaterialGroup {
  material_name: string;
  category: string;
  lengths: Material[];
  expanded: boolean;
}

export function MaterialsCatalogBrowser() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [groups, setGroups] = useState<MaterialGroup[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadMaterials();
  }, []);

  useEffect(() => {
    groupMaterials();
  }, [materials, searchTerm]);

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

  /**
   * Group materials by material_name and create length hierarchy
   */
  function groupMaterials() {
    const filtered = materials.filter(m => {
      const search = searchTerm.toLowerCase();
      return (
        m.material_name.toLowerCase().includes(search) ||
        m.category.toLowerCase().includes(search) ||
        m.sku.toLowerCase().includes(search)
      );
    });

    // Group by material_name
    const groupsMap = new Map<string, MaterialGroup>();

    filtered.forEach(material => {
      const key = material.material_name;
      
      if (!groupsMap.has(key)) {
        groupsMap.set(key, {
          material_name: material.material_name,
          category: material.category,
          lengths: [material],
          expanded: false,
        });
      } else {
        groupsMap.get(key)!.lengths.push(material);
      }
    });

    // Sort lengths numerically
    groupsMap.forEach(group => {
      group.lengths.sort((a, b) => {
        const aNum = parseFloat(a.part_length) || 0;
        const bNum = parseFloat(b.part_length) || 0;
        return aNum - bNum;
      });
    });

    setGroups(Array.from(groupsMap.values()));
  }

  function toggleGroup(materialName: string) {
    setGroups(groups.map(g => 
      g.material_name === materialName 
        ? { ...g, expanded: !g.expanded }
        : g
    ));
  }

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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold">Materials Browser</h2>
          <p className="text-muted-foreground">
            {materials.length.toLocaleString()} materials • {groups.length} groups
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search materials, categories, SKU..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Material Groups */}
      <div className="space-y-2">
        {groups.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No materials found</p>
            </CardContent>
          </Card>
        ) : (
          groups.map(group => (
            <Card key={group.material_name} className="overflow-hidden">
              <CardHeader
                className="cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => toggleGroup(group.material_name)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1">
                    {group.expanded ? (
                      <ChevronDown className="w-5 h-5 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="w-5 h-5 text-muted-foreground" />
                    )}
                    <div className="flex-1">
                      <CardTitle className="text-lg">{group.material_name}</CardTitle>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline">{group.category}</Badge>
                        <Badge variant="secondary">{group.lengths.length} lengths</Badge>
                      </div>
                    </div>
                  </div>
                </div>
              </CardHeader>

              {/* Length List */}
              {group.expanded && (
                <CardContent className="pt-0">
                  <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                    {group.lengths.map(material => (
                      <button
                        key={material.sku}
                        onClick={() => setSelectedMaterial(material)}
                        className="text-left p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Ruler className="w-4 h-4 text-primary" />
                            <span className="font-semibold">{material.part_length}"</span>
                          </div>
                          {material.unit_price && (
                            <div className="flex items-center gap-1 text-sm text-muted-foreground">
                              <DollarSign className="w-3 h-3" />
                              <span>{material.unit_price.toFixed(2)}</span>
                            </div>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          SKU: {material.sku}
                        </p>
                        {material.raw_metadata.length > 1 && (
                          <Badge variant="secondary" className="mt-2 text-xs">
                            {material.raw_metadata.length} color variants
                          </Badge>
                        )}
                      </button>
                    ))}
                  </div>
                </CardContent>
              )}
            </Card>
          ))
        )}
      </div>

      {/* Material Details Dialog */}
      <Dialog open={!!selectedMaterial} onOpenChange={() => setSelectedMaterial(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedMaterial?.material_name} - {selectedMaterial?.part_length}"
            </DialogTitle>
          </DialogHeader>
          
          {selectedMaterial && (
            <div className="space-y-6">
              {/* Primary Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">SKU</p>
                  <p className="font-semibold">{selectedMaterial.sku}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Category</p>
                  <p className="font-semibold">{selectedMaterial.category}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Unit Price</p>
                  <p className="font-semibold">
                    {selectedMaterial.unit_price 
                      ? `$${selectedMaterial.unit_price.toFixed(2)}`
                      : 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Purchase Cost</p>
                  <p className="font-semibold">
                    {selectedMaterial.purchase_cost 
                      ? `$${selectedMaterial.purchase_cost.toFixed(2)}`
                      : 'N/A'}
                  </p>
                </div>
              </div>

              {/* Original Smartbuild Data */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <FileSpreadsheet className="w-4 h-4" />
                  <h3 className="font-semibold">Original Smartbuild Data</h3>
                  <Badge variant="secondary">
                    {selectedMaterial.raw_metadata.length} row(s)
                  </Badge>
                </div>

                <div className="space-y-2">
                  {selectedMaterial.raw_metadata.map((row, index) => (
                    <Card key={index} className="p-3">
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        {Object.entries(row).slice(0, 10).map(([key, value]) => (
                          <div key={key}>
                            <span className="text-muted-foreground">{key}:</span>{' '}
                            <span className="font-medium">{value as string}</span>
                          </div>
                        ))}
                        {Object.keys(row).length > 10 && (
                          <p className="col-span-2 text-xs text-muted-foreground">
                            + {Object.keys(row).length - 10} more fields
                          </p>
                        )}
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
