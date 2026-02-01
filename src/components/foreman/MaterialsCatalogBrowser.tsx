import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Database, Search, Plus, Package } from 'lucide-react';
import { toast } from 'sonner';
import { createNotification } from '@/lib/notifications';
import { cleanMaterialValue } from '@/lib/utils';
import type { Job } from '@/types';

interface CatalogMaterial {
  sku: string;
  material_name: string;
  category: string | null;
  part_length: string | null;
}

interface MaterialsCatalogBrowserProps {
  job: Job;
  userId: string;
  onMaterialAdded?: () => void;
}

interface FieldRequestMaterial {
  id: string;
  name: string;
  quantity: number;
  length: string | null;
  status: string;
  notes: string | null;
  ordered_by: string | null;
  order_requested_at: string | null;
  category_name: string;
}

export function MaterialsCatalogBrowser({ job, userId, onMaterialAdded }: MaterialsCatalogBrowserProps) {
  const [catalogMaterials, setCatalogMaterials] = useState<CatalogMaterial[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogCategory, setCatalogCategory] = useState<string | null>(null);
  const [catalogCategories, setCatalogCategories] = useState<string[]>([]);
  const [showAddMaterialDialog, setShowAddMaterialDialog] = useState(false);
  const [selectedCatalogMaterial, setSelectedCatalogMaterial] = useState<CatalogMaterial | null>(null);
  const [addMaterialQuantity, setAddMaterialQuantity] = useState<number>(1);
  const [addMaterialNotes, setAddMaterialNotes] = useState('');
  const [addingMaterial, setAddingMaterial] = useState(false);
  const [fieldRequests, setFieldRequests] = useState<FieldRequestMaterial[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);

  useEffect(() => {
    loadCatalogMaterials();
    loadFieldRequests();
  }, [job.id]);

  async function loadCatalogMaterials() {
    try {
      setCatalogLoading(true);
      
      // Load materials from catalog (without prices for field users)
      const { data, error } = await supabase
        .from('materials_catalog')
        .select('sku, material_name, category, part_length')
        .order('material_name', { ascending: true });

      if (error) throw error;

      setCatalogMaterials(data || []);

      // Extract unique categories
      const cats = new Set<string>();
      (data || []).forEach((m: CatalogMaterial) => {
        if (m.category) {
          const cleaned = cleanCatalogCategory(m.category);
          if (cleaned && !/^[\d\$,.\s]+$/.test(cleaned)) {
            cats.add(cleaned);
          }
        }
      });
      setCatalogCategories(Array.from(cats).sort());
    } catch (error: any) {
      console.error('Error loading catalog:', error);
      toast.error('Failed to load materials catalog');
    } finally {
      setCatalogLoading(false);
    }
  }

  async function loadFieldRequests() {
    try {
      setLoadingRequests(true);
      
      const { data, error } = await supabase
        .from('materials')
        .select(`
          id,
          name,
          quantity,
          length,
          status,
          notes,
          ordered_by,
          order_requested_at,
          materials_categories!inner(name)
        `)
        .eq('job_id', job.id)
        .eq('import_source', 'field_catalog')
        .order('order_requested_at', { ascending: false });

      if (error) throw error;

      const requests: FieldRequestMaterial[] = (data || []).map((m: any) => ({
        id: m.id,
        name: m.name,
        quantity: m.quantity,
        length: m.length,
        status: m.status,
        notes: m.notes,
        ordered_by: m.ordered_by,
        order_requested_at: m.order_requested_at,
        category_name: m.materials_categories?.name || 'Unknown',
      }));

      setFieldRequests(requests);
    } catch (error: any) {
      console.error('Error loading field requests:', error);
    } finally {
      setLoadingRequests(false);
    }
  }

  function cleanCatalogCategory(category: string | null): string | null {
    if (!category) return null;
    return category
      .replace(/^USD\s*[-:]?\s*/i, '')
      .replace(/Sales\s*[-:]?\s*/gi, '')
      .replace(/^[-:]\s*/, '')
      .trim() || null;
  }

  function openAddMaterialDialog(material: CatalogMaterial) {
    setSelectedCatalogMaterial(material);
    setAddMaterialQuantity(1);
    setAddMaterialNotes('');
    setShowAddMaterialDialog(true);
  }

  async function addMaterialToJob() {
    if (!selectedCatalogMaterial) return;

    setAddingMaterial(true);

    try {
      // First, check if we have a "Field Requests" category for this job
      let categoryId: string | null = null;
      
      const { data: existingCategory } = await supabase
        .from('materials_categories')
        .select('id')
        .eq('job_id', job.id)
        .eq('name', 'Field Requests')
        .single();

      if (existingCategory) {
        categoryId = existingCategory.id;
      } else {
        // Create "Field Requests" category
        const { data: newCategory, error: categoryError } = await supabase
          .from('materials_categories')
          .insert({
            job_id: job.id,
            name: 'Field Requests',
            order_index: 999, // Put at the end
            created_by: userId,
          })
          .select()
          .single();

        if (categoryError) throw categoryError;
        categoryId = newCategory.id;
      }

      // Add material to job with 'ordered' status and tracking
      const { error: materialError } = await supabase
        .from('materials')
        .insert({
          category_id: categoryId,
          job_id: job.id,
          name: selectedCatalogMaterial.material_name,
          quantity: addMaterialQuantity,
          length: selectedCatalogMaterial.part_length,
          status: 'ordered',
          notes: addMaterialNotes || `Requested from field (SKU: ${selectedCatalogMaterial.sku})`,
          created_by: userId,
          ordered_by: userId,
          order_requested_at: new Date().toISOString(),
          import_source: 'field_catalog',
        });

      if (materialError) throw materialError;

      // Create notification for office
      await createNotification({
        jobId: job.id,
        createdBy: userId,
        type: 'material_request',
        brief: `Field request: ${selectedCatalogMaterial.material_name} (Qty: ${addMaterialQuantity})`,
        referenceData: {
          materialName: selectedCatalogMaterial.material_name,
          sku: selectedCatalogMaterial.sku,
          quantity: addMaterialQuantity,
          notes: addMaterialNotes,
        },
      });

      toast.success('Material request sent to office');
      setShowAddMaterialDialog(false);
      setSelectedCatalogMaterial(null);
      
      // Reload field requests
      await loadFieldRequests();
      
      // Notify parent to reload materials
      if (onMaterialAdded) {
        onMaterialAdded();
      }
    } catch (error: any) {
      console.error('Error adding material:', error);
      toast.error('Failed to add material');
    } finally {
      setAddingMaterial(false);
    }
  }

  async function loadFieldRequests() {
    try {
      setLoadingRequests(true);
      
      const { data, error } = await supabase
        .from('materials')
        .select(`
          id,
          name,
          quantity,
          length,
          status,
          notes,
          ordered_by,
          order_requested_at,
          materials_categories!inner(name)
        `)
        .eq('job_id', job.id)
        .eq('import_source', 'field_catalog')
        .order('order_requested_at', { ascending: false });

      if (error) throw error;

      const requests: FieldRequestMaterial[] = (data || []).map((m: any) => ({
        id: m.id,
        name: m.name,
        quantity: m.quantity,
        length: m.length,
        status: m.status,
        notes: m.notes,
        ordered_by: m.ordered_by,
        order_requested_at: m.order_requested_at,
        category_name: m.materials_categories?.name || 'Unknown',
      }));

      setFieldRequests(requests);
    } catch (error: any) {
      console.error('Error loading field requests:', error);
    } finally {
      setLoadingRequests(false);
    }
  }

  // Filter catalog materials
  const filteredCatalogMaterials = catalogMaterials.filter(m => {
    // Category filter
    if (catalogCategory && cleanCatalogCategory(m.category) !== catalogCategory) {
      return false;
    }
    
    // Search filter
    if (catalogSearch) {
      const term = catalogSearch.toLowerCase();
      return (
        m.material_name.toLowerCase().includes(term) ||
        m.sku.toLowerCase().includes(term) ||
        (m.part_length && m.part_length.toLowerCase().includes(term))
      );
    }
    
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Database className="w-5 h-5 text-primary" />
            Order Materials
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            View your orders and search catalog for additional materials
          </p>
        </CardHeader>
      </Card>

      {/* Field Requests Section */}
      {loadingRequests ? (
        <Card>
          <CardContent className="py-8 text-center">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-muted-foreground">Loading your orders...</p>
          </CardContent>
        </Card>
      ) : fieldRequests.length > 0 ? (
        <Card className="border-2 border-orange-200 bg-orange-50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="w-5 h-5 text-orange-700" />
              Your Orders ({fieldRequests.length})
            </CardTitle>
            <p className="text-sm text-orange-700 mt-1">
              Materials you've requested from the catalog
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {fieldRequests.map(material => {
                const statusConfig = {
                  not_ordered: { label: 'Not Ordered', color: 'bg-gray-100 text-gray-700' },
                  ordered: { label: 'Ordered', color: 'bg-yellow-100 text-yellow-700' },
                  at_shop: { label: 'At Shop', color: 'bg-blue-100 text-blue-700' },
                  ready_to_pull: { label: 'Pull from Shop', color: 'bg-purple-100 text-purple-700' },
                  at_job: { label: 'At Job', color: 'bg-green-100 text-green-700' },
                  installed: { label: 'Installed', color: 'bg-slate-800 text-white' },
                  missing: { label: 'Missing', color: 'bg-red-100 text-red-700' },
                }[material.status] || { label: material.status, color: 'bg-gray-100 text-gray-700' };

                return (
                  <Card key={material.id} className="bg-white">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2">
                            <h4 className="font-semibold text-sm truncate">{material.name}</h4>
                            {material.length && (
                              <span className="text-xs text-muted-foreground whitespace-nowrap">
                                {cleanMaterialValue(material.length)}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <Badge variant="outline" className="text-xs">
                              Qty: {material.quantity}
                            </Badge>
                            <Badge className={`text-xs ${statusConfig.color}`}>
                              {statusConfig.label}
                            </Badge>
                            <Badge variant="secondary" className="text-xs">
                              {material.category_name}
                            </Badge>
                          </div>
                          {material.notes && (
                            <p className="text-xs text-muted-foreground mt-2">
                              {material.notes}
                            </p>
                          )}
                          {material.order_requested_at && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Ordered: {new Date(material.order_requested_at).toLocaleString()}
                            </p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-2 border-blue-200 bg-blue-50">
          <CardContent className="py-6 text-center">
            <Package className="w-12 h-12 mx-auto mb-3 text-blue-700 opacity-50" />
            <p className="text-sm text-blue-900 font-semibold">No orders yet</p>
            <p className="text-xs text-blue-700 mt-1">
              Search the catalog below to request materials
            </p>
          </CardContent>
        </Card>
      )}

      {/* Divider */}
      <div className="relative py-2">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-slate-300"></div>
        </div>
        <div className="relative flex justify-center">
          <span className="bg-slate-50 px-3 text-sm font-semibold text-slate-700">
            Search Catalog
          </span>
        </div>
      </div>

      {/* Category Filter - Only show when searching */}
      {catalogSearch && (
        <div className="flex gap-2 overflow-x-auto pb-2">
          <Button
            variant={catalogCategory === null ? "default" : "outline"}
            size="sm"
            onClick={() => setCatalogCategory(null)}
            className="whitespace-nowrap flex-shrink-0"
          >
            All
          </Button>
          {catalogCategories.map(cat => (
            <Button
              key={cat}
              variant={catalogCategory === cat ? "default" : "outline"}
              size="sm"
              onClick={() => setCatalogCategory(cat)}
              className="whitespace-nowrap flex-shrink-0"
            >
              {cat}
            </Button>
          ))}
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search materials by name or SKU..."
          value={catalogSearch}
          onChange={(e) => setCatalogSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Materials List - Only show when searching */}
      {catalogSearch && catalogLoading ? (
        <Card>
          <CardContent className="py-12 text-center">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-muted-foreground">Loading catalog...</p>
          </CardContent>
        </Card>
      ) : filteredCatalogMaterials.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Package className="w-16 h-16 mx-auto mb-4 opacity-50" />
            <p>No materials found matching "{catalogSearch}"</p>
          </CardContent>
        </Card>
      ) : catalogSearch ? (
        <div className="space-y-2">
          {filteredCatalogMaterials.map(material => (
            <Card key={material.sku} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <h4 className="font-semibold text-sm truncate">{material.material_name}</h4>
                      {material.part_length && (
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {cleanMaterialValue(material.part_length)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="text-xs">
                        {material.sku}
                      </Badge>
                      {cleanCatalogCategory(material.category) && (
                        <Badge variant="secondary" className="text-xs">
                          {cleanCatalogCategory(material.category)}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <Button
                    onClick={() => openAddMaterialDialog(material)}
                    size="sm"
                    className="flex-shrink-0"
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Add
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      {/* Add Material Dialog */}
      <Dialog open={showAddMaterialDialog} onOpenChange={setShowAddMaterialDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5" />
              Add Material to Job
            </DialogTitle>
          </DialogHeader>
          {selectedCatalogMaterial && (
            <div className="space-y-4">
              <div className="bg-muted/50 border rounded-lg p-4">
                <h4 className="font-semibold mb-1">{selectedCatalogMaterial.material_name}</h4>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>SKU: {selectedCatalogMaterial.sku}</span>
                  {selectedCatalogMaterial.part_length && (
                    <>
                      <span>•</span>
                      <span>{cleanMaterialValue(selectedCatalogMaterial.part_length)}</span>
                    </>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="quantity">Quantity *</Label>
                <Input
                  id="quantity"
                  type="number"
                  min="1"
                  value={addMaterialQuantity}
                  onChange={(e) => setAddMaterialQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                  className="h-12"
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Notes (Optional)</Label>
                <Textarea
                  id="notes"
                  value={addMaterialNotes}
                  onChange={(e) => setAddMaterialNotes(e.target.value)}
                  placeholder="Add any notes about this material request..."
                  rows={3}
                />
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-sm text-blue-900 font-semibold mb-1">
                  📋 Field Request Process:
                </p>
                <ul className="text-xs text-blue-800 space-y-1 ml-4 list-disc">
                  <li>Added to "Field Requests" category</li>
                  <li>Marked as "Ordered" - office will be notified</li>
                  <li>Tracked separately for job cost tracking</li>
                  <li>Your name will be recorded as requester</li>
                </ul>
              </div>

              <div className="flex flex-col gap-3 pt-4 border-t">
                <Button
                  onClick={addMaterialToJob}
                  disabled={addingMaterial}
                  className="h-12"
                >
                  {addingMaterial ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                      Adding...
                    </>
                  ) : (
                    <>
                      <Plus className="w-5 h-5 mr-2" />
                      Add to Job
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowAddMaterialDialog(false)}
                  disabled={addingMaterial}
                  className="h-12"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
