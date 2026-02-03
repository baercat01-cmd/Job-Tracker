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
  DollarSign,
  TrendingUp,
  Package,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { toast } from 'sonner';
import type { Job } from '@/types';
import { cleanMaterialValue } from '@/lib/utils';

interface ExtraMaterial {
  id: string;
  category_id: string;
  category_name: string;
  name: string;
  quantity: number;
  length: string | null;
  unit_cost: number | null;
  total_cost: number | null;
  status: string;
  notes: string | null;
  extra_notes: string | null;
  import_source: string;
  ordered_by: string | null;
  order_requested_at: string | null;
  created_at: string;
}

interface CategoryWithExtras {
  id: string;
  name: string;
  extras: ExtraMaterial[];
  total_cost: number;
}

interface ExtrasManagementProps {
  job: Job;
  userId: string;
}

const STATUS_OPTIONS = [
  { value: 'not_ordered', label: 'Not Ordered', color: 'bg-gray-100 text-gray-700 border-gray-300' },
  { value: 'ordered', label: 'Ordered', color: 'bg-yellow-100 text-yellow-700 border-yellow-300' },
  { value: 'ready_for_job', label: 'Ready for Job', color: 'bg-green-100 text-green-700 border-green-300' },
  { value: 'ready_to_pull', label: 'Pull from Shop', color: 'bg-purple-100 text-purple-700 border-purple-300' },
  { value: 'at_job', label: 'At Job', color: 'bg-green-100 text-green-700 border-green-300' },
  { value: 'installed', label: 'Installed', color: 'bg-slate-800 text-white border-slate-800' },
];

function getStatusColor(status: string) {
  return STATUS_OPTIONS.find(s => s.value === status)?.color || 'bg-gray-100 text-gray-700 border-gray-300';
}

export function ExtrasManagement({ job, userId }: ExtrasManagementProps) {
  const [categories, setCategories] = useState<CategoryWithExtras[]>([]);
  const [allCategories, setAllCategories] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  
  // Add/Edit Material Dialog
  const [showMaterialDialog, setShowMaterialDialog] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<ExtraMaterial | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [materialName, setMaterialName] = useState('');
  const [materialQuantity, setMaterialQuantity] = useState('');
  const [materialLength, setMaterialLength] = useState('');
  const [materialUnitCost, setMaterialUnitCost] = useState('');
  const [materialStatus, setMaterialStatus] = useState('not_ordered');
  const [materialNotes, setMaterialNotes] = useState('');
  const [materialExtraNotes, setMaterialExtraNotes] = useState('');
  const [savingMaterial, setSavingMaterial] = useState(false);

  // Catalog browser for adding from catalog
  const [showCatalogDialog, setShowCatalogDialog] = useState(false);
  const [catalogMaterials, setCatalogMaterials] = useState<any[]>([]);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [selectedCatalogMaterial, setSelectedCatalogMaterial] = useState<any>(null);
  const [catalogQuantity, setCatalogQuantity] = useState('1');

  useEffect(() => {
    loadExtras();
    loadAllCategories();
  }, [job.id]);

  async function loadAllCategories() {
    try {
      const { data, error } = await supabase
        .from('materials_categories')
        .select('id, name')
        .eq('job_id', job.id)
        .order('order_index');

      if (error) throw error;
      setAllCategories(data || []);
    } catch (error: any) {
      console.error('Error loading categories:', error);
    }
  }

  async function loadExtras() {
    try {
      setLoading(true);

      // Load all materials that are marked as extras or from field catalog
      const { data: materialsData, error: materialsError } = await supabase
        .from('materials')
        .select(`
          *,
          materials_categories!inner(name)
        `)
        .eq('job_id', job.id)
        .or('is_extra.eq.true,import_source.eq.field_catalog')
        .order('created_at', { ascending: false });

      if (materialsError) throw materialsError;

      // Group by category
      const categoryMap = new Map<string, ExtraMaterial[]>();
      
      (materialsData || []).forEach((material: any) => {
        const categoryId = material.category_id;
        const categoryName = material.materials_categories?.name || 'Unknown';
        
        if (!categoryMap.has(categoryId)) {
          categoryMap.set(categoryId, []);
        }

        const extraMaterial: ExtraMaterial = {
          id: material.id,
          category_id: categoryId,
          category_name: categoryName,
          name: material.name,
          quantity: material.quantity,
          length: material.length,
          unit_cost: material.unit_cost,
          total_cost: material.total_cost,
          status: material.status,
          notes: material.notes,
          extra_notes: material.extra_notes,
          import_source: material.import_source,
          ordered_by: material.ordered_by,
          order_requested_at: material.order_requested_at,
          created_at: material.created_at,
        };

        categoryMap.get(categoryId)!.push(extraMaterial);
      });

      // Convert to array with totals
      const categoriesWithExtras: CategoryWithExtras[] = Array.from(categoryMap.entries()).map(([id, extras]) => {
        const total_cost = extras.reduce((sum, m) => sum + (m.total_cost || 0), 0);
        return {
          id,
          name: extras[0]?.category_name || 'Unknown',
          extras,
          total_cost,
        };
      });

      setCategories(categoriesWithExtras);
    } catch (error: any) {
      console.error('Error loading extras:', error);
      toast.error('Failed to load extras');
    } finally {
      setLoading(false);
    }
  }

  async function loadCatalog() {
    try {
      const { data, error } = await supabase
        .from('materials_catalog')
        .select('*')
        .order('material_name');

      if (error) throw error;
      setCatalogMaterials(data || []);
    } catch (error: any) {
      console.error('Error loading catalog:', error);
      toast.error('Failed to load catalog');
    }
  }

  function openAddMaterialDialog() {
    setEditingMaterial(null);
    setSelectedCategoryId('');
    setMaterialName('');
    setMaterialQuantity('');
    setMaterialLength('');
    setMaterialUnitCost('');
    setMaterialStatus('not_ordered');
    setMaterialNotes('');
    setMaterialExtraNotes('');
    setShowMaterialDialog(true);
  }

  function openEditMaterialDialog(material: ExtraMaterial) {
    setEditingMaterial(material);
    setSelectedCategoryId(material.category_id);
    setMaterialName(material.name);
    setMaterialQuantity(material.quantity.toString());
    setMaterialLength(material.length || '');
    setMaterialUnitCost(material.unit_cost?.toString() || '');
    setMaterialStatus(material.status);
    setMaterialNotes(material.notes || '');
    setMaterialExtraNotes(material.extra_notes || '');
    setShowMaterialDialog(true);
  }

  function openCatalogDialog() {
    loadCatalog();
    setCatalogSearch('');
    setSelectedCatalogMaterial(null);
    setShowCatalogDialog(true);
  }

  async function saveMaterial() {
    if (!materialName.trim() || !materialQuantity || !selectedCategoryId) {
      toast.error('Please enter material name, quantity, and category');
      return;
    }

    setSavingMaterial(true);

    try {
      const quantity = parseFloat(materialQuantity);
      const unit_cost = materialUnitCost ? parseFloat(materialUnitCost) : null;
      const total_cost = unit_cost ? unit_cost * quantity : null;

      if (editingMaterial) {
        // Update existing extra
        const { error } = await supabase
          .from('materials')
          .update({
            category_id: selectedCategoryId,
            name: materialName.trim(),
            quantity,
            length: materialLength.trim() || null,
            unit_cost,
            total_cost,
            status: materialStatus,
            notes: materialNotes.trim() || null,
            extra_notes: materialExtraNotes.trim() || null,
            is_extra: true,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingMaterial.id);

        if (error) throw error;
        toast.success('Extra material updated');
      } else {
        // Create new extra
        const { error } = await supabase
          .from('materials')
          .insert({
            job_id: job.id,
            category_id: selectedCategoryId,
            name: materialName.trim(),
            quantity,
            length: materialLength.trim() || null,
            unit_cost,
            total_cost,
            status: materialStatus,
            notes: materialNotes.trim() || null,
            extra_notes: materialExtraNotes.trim() || null,
            is_extra: true,
            import_source: 'office_extra',
            created_by: userId,
            ordered_by: userId,
            order_requested_at: new Date().toISOString(),
          });

        if (error) throw error;
        toast.success('Extra material added');
      }

      setShowMaterialDialog(false);
      loadExtras();
    } catch (error: any) {
      console.error('Error saving material:', error);
      toast.error('Failed to save material');
    } finally {
      setSavingMaterial(false);
    }
  }

  async function addFromCatalog() {
    if (!selectedCatalogMaterial || !selectedCategoryId) {
      toast.error('Please select a material and category');
      return;
    }

    try {
      const quantity = parseFloat(catalogQuantity);
      const unit_cost = selectedCatalogMaterial.purchase_cost || 0;
      const total_cost = unit_cost * quantity;

      const { error } = await supabase
        .from('materials')
        .insert({
          job_id: job.id,
          category_id: selectedCategoryId,
          name: selectedCatalogMaterial.material_name,
          quantity,
          length: selectedCatalogMaterial.part_length,
          unit_cost,
          total_cost,
          status: 'not_ordered',
          notes: `SKU: ${selectedCatalogMaterial.sku}`,
          is_extra: true,
          import_source: 'catalog_extra',
          created_by: userId,
          ordered_by: userId,
          order_requested_at: new Date().toISOString(),
        });

      if (error) throw error;

      toast.success('Material added from catalog');
      setShowCatalogDialog(false);
      loadExtras();
    } catch (error: any) {
      console.error('Error adding from catalog:', error);
      toast.error('Failed to add material');
    }
  }

  async function deleteMaterial(materialId: string) {
    if (!confirm('Delete this extra material? This cannot be undone.')) return;

    try {
      const { error } = await supabase
        .from('materials')
        .delete()
        .eq('id', materialId);

      if (error) throw error;

      toast.success('Extra material deleted');
      loadExtras();
    } catch (error: any) {
      console.error('Error deleting material:', error);
      toast.error('Failed to delete material');
    }
  }

  async function updateMaterialStatus(materialId: string, newStatus: string) {
    try {
      const { error } = await supabase
        .from('materials')
        .update({
          status: newStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('id', materialId);

      if (error) throw error;

      loadExtras();
    } catch (error: any) {
      console.error('Error updating status:', error);
      toast.error('Failed to update status');
    }
  }

  function toggleCategory(categoryId: string) {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(categoryId)) {
      newExpanded.delete(categoryId);
    } else {
      newExpanded.add(categoryId);
    }
    setExpandedCategories(newExpanded);
  }

  const totalExtras = categories.reduce((sum, cat) => sum + cat.total_cost, 0);
  const filteredCatalog = catalogMaterials.filter(m =>
    catalogSearch === '' ||
    m.material_name.toLowerCase().includes(catalogSearch.toLowerCase()) ||
    m.sku.toLowerCase().includes(catalogSearch.toLowerCase())
  );

  if (loading) {
    return <div className="text-center py-8">Loading extras...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Summary Card */}
      <Card className="border-2 border-green-200 bg-gradient-to-br from-green-50 to-emerald-50">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <DollarSign className="w-6 h-6 text-green-700" />
              <span className="text-xl">Job Extras Summary</span>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={openCatalogDialog} variant="outline" size="sm">
                <Package className="w-4 h-4 mr-2" />
                Add from Catalog
              </Button>
              <Button onClick={openAddMaterialDialog} className="bg-green-600 hover:bg-green-700">
                <Plus className="w-4 h-4 mr-2" />
                Add Extra Material
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-3xl font-bold text-green-700">
                ${totalExtras.toFixed(2)}
              </div>
              <div className="text-sm text-green-600 mt-1">Total Extra Costs</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-green-700">
                {categories.reduce((sum, cat) => sum + cat.extras.length, 0)}
              </div>
              <div className="text-sm text-green-600 mt-1">Extra Materials</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-green-700">
                {categories.length}
              </div>
              <div className="text-sm text-green-600 mt-1">Categories</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Categories with Extras */}
      {categories.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <TrendingUp className="w-16 h-16 mx-auto mb-4 opacity-50 text-muted-foreground" />
            <p className="text-muted-foreground">No extra materials yet</p>
            <p className="text-sm text-muted-foreground mt-2">
              Add materials from catalog or create custom extras to track additional job costs
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {categories.map(category => {
            const isExpanded = expandedCategories.has(category.id);
            
            return (
              <Card key={category.id} className="border-2 border-green-200">
                <CardHeader
                  className="bg-green-50 cursor-pointer hover:bg-green-100 transition-colors"
                  onClick={() => toggleCategory(category.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {isExpanded ? (
                        <ChevronDown className="w-5 h-5 text-green-700" />
                      ) : (
                        <ChevronRight className="w-5 h-5 text-green-700" />
                      )}
                      <div>
                        <h3 className="text-lg font-semibold text-green-900">{category.name}</h3>
                        <p className="text-sm text-green-700">
                          {category.extras.length} item{category.extras.length !== 1 ? 's' : ''}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-green-700">
                        ${category.total_cost.toFixed(2)}
                      </div>
                      <div className="text-xs text-green-600">Category Total</div>
                    </div>
                  </div>
                </CardHeader>

                {isExpanded && (
                  <CardContent className="p-0">
                    <table className="w-full">
                      <thead className="bg-muted/50 border-b">
                        <tr>
                          <th className="text-left p-3">Material</th>
                          <th className="text-center p-3">Qty</th>
                          <th className="text-center p-3">Unit Cost</th>
                          <th className="text-center p-3">Total Cost</th>
                          <th className="text-center p-3">Source</th>
                          <th className="text-center p-3">Status</th>
                          <th className="text-right p-3">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {category.extras.map(material => (
                          <tr key={material.id} className="border-b hover:bg-muted/30">
                            <td className="p-3">
                              <div>
                                <div className="font-medium">{cleanMaterialValue(material.name)}</div>
                                {material.length && (
                                  <div className="text-sm text-muted-foreground">
                                    {cleanMaterialValue(material.length)}
                                  </div>
                                )}
                                {material.extra_notes && (
                                  <div className="text-xs text-green-700 mt-1">
                                    {material.extra_notes}
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="p-3 text-center font-semibold">{material.quantity}</td>
                            <td className="p-3 text-center">
                              {material.unit_cost ? `$${material.unit_cost.toFixed(2)}` : '-'}
                            </td>
                            <td className="p-3 text-center font-bold text-green-700">
                              {material.total_cost ? `$${material.total_cost.toFixed(2)}` : '-'}
                            </td>
                            <td className="p-3 text-center">
                              {material.import_source === 'field_catalog' ? (
                                <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-300">
                                  🔧 Field
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-300">
                                  💼 Office
                                </Badge>
                              )}
                            </td>
                            <td className="p-3">
                              <Select
                                value={material.status}
                                onValueChange={(newStatus) => updateMaterialStatus(material.id, newStatus)}
                              >
                                <SelectTrigger className={`h-8 text-xs ${getStatusColor(material.status)}`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {STATUS_OPTIONS.map(opt => (
                                    <SelectItem key={opt.value} value={opt.value}>
                                      <span className={`px-2 py-1 rounded text-xs ${opt.color}`}>
                                        {opt.label}
                                      </span>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="p-3">
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => openEditMaterialDialog(material)}
                                >
                                  <Edit className="w-4 h-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => deleteMaterial(material.id)}
                                  className="text-destructive"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Add/Edit Material Dialog */}
      <Dialog open={showMaterialDialog} onOpenChange={setShowMaterialDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {editingMaterial ? (
                <>
                  <Edit className="w-5 h-5" />
                  Edit Extra Material
                </>
              ) : (
                <>
                  <Plus className="w-5 h-5" />
                  Add Extra Material
                </>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Category *</Label>
              <Select value={selectedCategoryId} onValueChange={setSelectedCategoryId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {allCategories.map(cat => (
                    <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Material Name *</Label>
              <Input
                value={materialName}
                onChange={(e) => setMaterialName(e.target.value)}
                placeholder="e.g., Additional 2x4 Lumber"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Quantity *</Label>
                <Input
                  type="number"
                  value={materialQuantity}
                  onChange={(e) => setMaterialQuantity(e.target.value)}
                  placeholder="0"
                  min="0"
                  step="0.01"
                />
              </div>
              <div className="space-y-2">
                <Label>Length</Label>
                <Input
                  value={materialLength}
                  onChange={(e) => setMaterialLength(e.target.value)}
                  placeholder="e.g., 8ft"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Unit Cost ($)</Label>
              <Input
                type="number"
                value={materialUnitCost}
                onChange={(e) => setMaterialUnitCost(e.target.value)}
                placeholder="0.00"
                min="0"
                step="0.01"
              />
              <p className="text-xs text-muted-foreground">
                Total cost will be automatically calculated: {materialUnitCost && materialQuantity ? 
                  `$${(parseFloat(materialUnitCost) * parseFloat(materialQuantity)).toFixed(2)}` : '$0.00'}
              </p>
            </div>

            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={materialStatus} onValueChange={setMaterialStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Why is this an extra?</Label>
              <Textarea
                value={materialExtraNotes}
                onChange={(e) => setMaterialExtraNotes(e.target.value)}
                placeholder="e.g., Client requested additional work, design change, unforeseen issue..."
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label>Additional Notes</Label>
              <Textarea
                value={materialNotes}
                onChange={(e) => setMaterialNotes(e.target.value)}
                placeholder="Any other notes about this material..."
                rows={2}
              />
            </div>

            <div className="flex gap-3 pt-4 border-t">
              <Button onClick={saveMaterial} disabled={savingMaterial} className="flex-1 bg-green-600 hover:bg-green-700">
                {savingMaterial ? 'Saving...' : (editingMaterial ? 'Update Material' : 'Add Material')}
              </Button>
              <Button variant="outline" onClick={() => setShowMaterialDialog(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Catalog Browser Dialog */}
      <Dialog open={showCatalogDialog} onOpenChange={setShowCatalogDialog}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Material from Catalog</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              placeholder="Search catalog..."
              value={catalogSearch}
              onChange={(e) => setCatalogSearch(e.target.value)}
            />

            <div className="max-h-96 overflow-y-auto space-y-2">
              {filteredCatalog.map(material => (
                <Card
                  key={material.sku}
                  className={`cursor-pointer transition-all ${
                    selectedCatalogMaterial?.sku === material.sku
                      ? 'border-2 border-green-500 bg-green-50'
                      : 'hover:bg-muted/50'
                  }`}
                  onClick={() => setSelectedCatalogMaterial(material)}
                >
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">{material.material_name}</div>
                        <div className="text-sm text-muted-foreground">SKU: {material.sku}</div>
                        {material.part_length && (
                          <div className="text-sm text-muted-foreground">
                            Length: {cleanMaterialValue(material.part_length)}
                          </div>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-green-700">
                          ${material.purchase_cost?.toFixed(2) || '0.00'}
                        </div>
                        <div className="text-xs text-muted-foreground">per unit</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {selectedCatalogMaterial && (
              <div className="border-t pt-4 space-y-4">
                <div className="space-y-2">
                  <Label>Category *</Label>
                  <Select value={selectedCategoryId} onValueChange={setSelectedCategoryId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {allCategories.map(cat => (
                        <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Quantity</Label>
                  <Input
                    type="number"
                    value={catalogQuantity}
                    onChange={(e) => setCatalogQuantity(e.target.value)}
                    min="1"
                    step="1"
                  />
                </div>

                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <div className="text-sm font-semibold text-green-900">Total Cost:</div>
                  <div className="text-2xl font-bold text-green-700">
                    ${((selectedCatalogMaterial.purchase_cost || 0) * parseFloat(catalogQuantity || '1')).toFixed(2)}
                  </div>
                </div>

                <Button
                  onClick={addFromCatalog}
                  className="w-full bg-green-600 hover:bg-green-700"
                  disabled={!selectedCategoryId}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add to Extras
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
