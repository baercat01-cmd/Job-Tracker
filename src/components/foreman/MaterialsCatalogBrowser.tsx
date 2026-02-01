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
import { Database, Search, Plus, Package, Edit, Camera, Image as ImageIcon } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { createNotification } from '@/lib/notifications';
import { cleanMaterialValue } from '@/lib/utils';
import type { Job } from '@/types';

interface CatalogMaterial {
  sku: string;
  material_name: string;
  category: string | null;
  part_length: string | null;
  unit_price: number | null; // Price per foot/unit
  purchase_cost: number | null;
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
  status: 'not_ordered' | 'ordered' | 'at_shop' | 'ready_to_pull' | 'at_job' | 'installed' | 'missing';
  notes: string | null;
  ordered_by: string | null;
  order_requested_at: string | null;
  category_name: string;
  use_case?: string;
}

const STATUS_OPTIONS = [
  { value: 'not_ordered', label: 'Not Ordered', color: 'bg-gray-100 text-gray-700 border-gray-300' },
  { value: 'ordered', label: 'Ordered', color: 'bg-yellow-100 text-yellow-700 border-yellow-300' },
  { value: 'at_shop', label: 'At Shop', color: 'bg-blue-100 text-blue-700 border-blue-300' },
  { value: 'ready_to_pull', label: 'Pull from Shop', color: 'bg-purple-100 text-purple-700 border-purple-300' },
  { value: 'at_job', label: 'At Job', color: 'bg-green-100 text-green-700 border-green-300' },
  { value: 'installed', label: 'Installed', color: 'bg-slate-800 text-white border-slate-800' },
  { value: 'missing', label: 'Missing', color: 'bg-red-100 text-red-700 border-red-300' },
];

function getStatusColor(status: string) {
  return STATUS_OPTIONS.find(s => s.value === status)?.color || 'bg-gray-100 text-gray-700 border-gray-300';
}

function getStatusLabel(status: string) {
  return STATUS_OPTIONS.find(s => s.value === status)?.label || status;
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
  const [customLengthFeet, setCustomLengthFeet] = useState<number>(0);
  const [customLengthInches, setCustomLengthInches] = useState<number>(0);
  const [showCustomLength, setShowCustomLength] = useState(false);
  const [fieldRequests, setFieldRequests] = useState<FieldRequestMaterial[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  
  // Custom material state
  const [showCustomMaterialDialog, setShowCustomMaterialDialog] = useState(false);
  const [customMaterialName, setCustomMaterialName] = useState('');
  const [customMaterialQuantity, setCustomMaterialQuantity] = useState<number>(1);
  const [customMaterialLength, setCustomMaterialLength] = useState('');
  const [customMaterialNotes, setCustomMaterialNotes] = useState('');
  const [customMaterialPhoto, setCustomMaterialPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [addingCustomMaterial, setAddingCustomMaterial] = useState(false);

  useEffect(() => {
    loadCatalogMaterials();
    loadFieldRequests();
  }, [job.id]);

  async function loadCatalogMaterials() {
    try {
      setCatalogLoading(true);
      
      // Load materials from catalog (with prices for calculations)
      const { data, error } = await supabase
        .from('materials_catalog')
        .select('sku, material_name, category, part_length, unit_price, purchase_cost')
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
          use_case,
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
        use_case: m.use_case,
        category_name: m.materials_categories?.name || 'Unknown',
      }));

      setFieldRequests(requests);
    } catch (error: any) {
      console.error('Error loading field requests:', error);
    } finally {
      setLoadingRequests(false);
    }
  }

  async function updateMaterialStatus(materialId: string, newStatus: FieldRequestMaterial['status']) {
    try {
      // Optimistic update
      setFieldRequests(prev =>
        prev.map(m => m.id === materialId ? { ...m, status: newStatus } : m)
      );

      const { error } = await supabase
        .from('materials')
        .update({
          status: newStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', materialId);

      if (error) throw error;

      // Reload to ensure consistency
      await loadFieldRequests();
    } catch (error: any) {
      console.error('Error updating material status:', error);
      toast.error('Failed to update status');
      // Reload on error to revert optimistic update
      loadFieldRequests();
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
    setCustomLengthFeet(0);
    setCustomLengthInches(0);
    // Show custom length input if material doesn't have a pre-defined length
    setShowCustomLength(!material.part_length || material.part_length.trim() === '');
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

      // Calculate length and cost based on whether it's a custom length material
      let finalLength = selectedCatalogMaterial.part_length || null;
      let unit_cost = selectedCatalogMaterial.purchase_cost || 0;
      let total_cost = 0;

      if (showCustomLength) {
        // Calculate total feet from feet + inches
        const totalFeet = customLengthFeet + (customLengthInches / 12);
        
        if (totalFeet <= 0) {
          toast.error('Please specify a length greater than 0');
          setAddingMaterial(false);
          return;
        }

        // Format length as feet and inches
        const feet = Math.floor(totalFeet);
        const inches = Math.round((totalFeet - feet) * 12);
        finalLength = inches > 0 ? `${feet}' ${inches}\"` : `${feet}'`;

        // Calculate cost: unit_price is per foot, so multiply by total feet and quantity
        const pricePerFoot = selectedCatalogMaterial.purchase_cost || 0;
        const costPerPiece = pricePerFoot * totalFeet;
        unit_cost = costPerPiece; // Store the cost per piece
        total_cost = costPerPiece * addMaterialQuantity;
      } else {
        // Standard material with pre-defined length
        unit_cost = selectedCatalogMaterial.purchase_cost || 0;
        total_cost = unit_cost * addMaterialQuantity;
      }

      const { error: materialError } = await supabase
        .from('materials')
        .insert({
          category_id: categoryId,
          job_id: job.id,
          name: selectedCatalogMaterial.material_name,
          quantity: addMaterialQuantity,
          length: finalLength,
          status: 'ordered',
          notes: addMaterialNotes || `Requested from field (SKU: ${selectedCatalogMaterial.sku})`,
          created_by: userId,
          ordered_by: userId,
          order_requested_at: new Date().toISOString(),
          import_source: 'field_catalog',
          is_extra: true,
          unit_cost,
          total_cost,
        });

      if (materialError) throw materialError;

      // Create notification for office with material ID reference
      const { data: newMaterialData } = await supabase
        .from('materials')
        .select('id')
        .eq('category_id', categoryId)
        .eq('job_id', job.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      await createNotification({
        jobId: job.id,
        createdBy: userId,
        type: 'material_request',
        brief: `Field request: ${selectedCatalogMaterial.material_name} (Qty: ${addMaterialQuantity})`,
        referenceId: newMaterialData?.id || null,
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

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setCustomMaterialPhoto(file);
      // Create preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  }

  async function addCustomMaterial() {
    if (!customMaterialName.trim()) {
      toast.error('Please enter a material name');
      return;
    }

    setAddingCustomMaterial(true);

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
            order_index: 999,
            created_by: userId,
          })
          .select()
          .single();

        if (categoryError) throw categoryError;
        categoryId = newCategory.id;
      }

      // Insert the custom material
      const { data: materialData, error: materialError } = await supabase
        .from('materials')
        .insert({
          category_id: categoryId,
          job_id: job.id,
          name: customMaterialName,
          quantity: customMaterialQuantity,
          length: customMaterialLength || null,
          status: 'ordered',
          notes: customMaterialNotes || 'Custom material added from field',
          created_by: userId,
          ordered_by: userId,
          order_requested_at: new Date().toISOString(),
          import_source: 'field_custom',
          is_extra: true,
          unit_cost: 0,
          total_cost: 0,
        })
        .select()
        .single();

      if (materialError) throw materialError;

      // Upload photo if provided
      if (customMaterialPhoto && materialData) {
        const fileExt = customMaterialPhoto.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `${job.id}/materials/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('job-files')
          .upload(filePath, customMaterialPhoto);

        if (uploadError) {
          console.error('Photo upload error:', uploadError);
          toast.error('Material added but photo upload failed');
        } else {
          // Get public URL
          const { data: urlData } = supabase.storage
            .from('job-files')
            .getPublicUrl(filePath);

          // Link photo to material in material_photos table
          const { error: photoLinkError } = await supabase
            .from('material_photos')
            .insert({
              material_id: materialData.id,
              photo_url: urlData.publicUrl,
              uploaded_by: userId,
            });

          if (photoLinkError) {
            console.error('Photo link error:', photoLinkError);
          }
        }
      }

      // Create notification for office
      await createNotification({
        jobId: job.id,
        createdBy: userId,
        type: 'material_request',
        brief: `Custom material request: ${customMaterialName} (Qty: ${customMaterialQuantity})`,
        referenceId: materialData?.id || null,
        referenceData: {
          materialName: customMaterialName,
          quantity: customMaterialQuantity,
          notes: customMaterialNotes,
          hasPhoto: !!customMaterialPhoto,
        },
      });

      toast.success('Custom material added successfully');
      setShowCustomMaterialDialog(false);
      
      // Reset form
      setCustomMaterialName('');
      setCustomMaterialQuantity(1);
      setCustomMaterialLength('');
      setCustomMaterialNotes('');
      setCustomMaterialPhoto(null);
      setPhotoPreview(null);
      
      // Reload field requests
      await loadFieldRequests();
      
      // Notify parent
      if (onMaterialAdded) {
        onMaterialAdded();
      }
    } catch (error: any) {
      console.error('Error adding custom material:', error);
      toast.error('Failed to add custom material');
    } finally {
      setAddingCustomMaterial(false);
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
      {/* Header with Search at Top */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Database className="w-5 h-5 text-primary" />
            Order Materials
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Search catalog and manage your material orders
          </p>
        </CardHeader>
        <CardContent className="pb-3">
          {/* Search Bar - Always Visible at Top */}
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search materials by name or SKU..."
                value={catalogSearch}
                onChange={(e) => setCatalogSearch(e.target.value)}
                className="pl-10 h-12 text-base"
                autoFocus
              />
            </div>
            
            {/* Custom Material Button */}
            <Button
              onClick={() => setShowCustomMaterialDialog(true)}
              variant="outline"
              className="w-full h-12 border-2 border-purple-300 bg-purple-50 hover:bg-purple-100 text-purple-900 font-semibold"
            >
              <Plus className="w-5 h-5 mr-2" />
              Add Custom Material
            </Button>
          </div>

          {/* Category Filter - Only show when searching */}
          {catalogSearch && (
            <div className="flex gap-2 overflow-x-auto pb-2 mt-3">
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
        </CardContent>
      </Card>

      {/* Catalog Search Results - Show directly under search when searching */}
      {catalogSearch && catalogLoading ? (
        <Card>
          <CardContent className="py-12 text-center">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-muted-foreground">Loading catalog...</p>
          </CardContent>
        </Card>
      ) : catalogSearch && filteredCatalogMaterials.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Package className="w-16 h-16 mx-auto mb-4 opacity-50" />
            <p>No materials found matching "{catalogSearch}"</p>
          </CardContent>
        </Card>
      ) : catalogSearch ? (
        <Card className="border-2 border-green-200 bg-green-50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Search className="w-5 h-5 text-green-700" />
              Search Results ({filteredCatalogMaterials.length})
            </CardTitle>
            <p className="text-sm text-green-700 mt-1">
              Click "Add" to request any material for this job
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {filteredCatalogMaterials.map(material => (
                <Card key={material.sku} className="hover:shadow-md transition-shadow bg-white border-2 border-green-100">
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
          </CardContent>
        </Card>
      ) : null}

      {/* Ordered Materials Section - Show after search results */}
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
              Materials you've requested - update status as they move through the workflow
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {fieldRequests.map(material => (
                <Card key={material.id} className="bg-white border-2 border-orange-100">
                  <CardContent className="p-4">
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2 flex-wrap">
                            <h4 className="font-semibold text-base">{material.name}</h4>
                            {material.length && (
                              <span className="text-sm text-muted-foreground">
                                {cleanMaterialValue(material.length)}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-2 flex-wrap">
                            <Badge variant="outline" className="text-xs font-semibold">
                              Qty: {material.quantity}
                            </Badge>
                            <Badge variant="secondary" className="text-xs">
                              {material.category_name}
                            </Badge>
                            <Badge variant="outline" className="text-xs bg-orange-50 text-orange-700 border-orange-300">
                              🔧 Field Request
                            </Badge>
                          </div>
                          {material.use_case && (
                            <p className="text-sm text-muted-foreground mt-2">
                              Use: {material.use_case}
                            </p>
                          )}
                          {material.notes && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Notes: {material.notes}
                            </p>
                          )}
                          {material.order_requested_at && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Ordered: {new Date(material.order_requested_at).toLocaleString()}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Status Selector */}
                      <div className="pt-3 border-t border-orange-200">
                        <Label className="text-xs font-semibold text-orange-900 mb-2 block">
                          Material Status
                        </Label>
                        <Select
                          value={material.status}
                          onValueChange={(newStatus) => updateMaterialStatus(material.id, newStatus as FieldRequestMaterial['status'])}
                        >
                          <SelectTrigger className={`w-full h-11 font-semibold border-2 ${getStatusColor(material.status)}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {STATUS_OPTIONS.map(opt => (
                              <SelectItem key={opt.value} value={opt.value}>
                                <span className={`inline-flex items-center px-3 py-1.5 rounded font-semibold ${opt.color}`}>
                                  {opt.label}
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : !catalogSearch ? (
        <Card className="border-2 border-blue-200 bg-blue-50">
          <CardContent className="py-6 text-center">
            <Package className="w-12 h-12 mx-auto mb-3 text-blue-700 opacity-50" />
            <p className="text-sm text-blue-900 font-semibold">No orders yet</p>
            <p className="text-xs text-blue-700 mt-1">
              Use the search bar above to find and request materials
            </p>
          </CardContent>
        </Card>
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
                  {showCustomLength && selectedCatalogMaterial.purchase_cost && (
                    <>
                      <span>•</span>
                      <span className="font-semibold text-green-700">
                        ${selectedCatalogMaterial.purchase_cost.toFixed(2)}/ft
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Custom Length Input - Only for materials without pre-defined length */}
              {showCustomLength && (
                <div className="space-y-3 bg-blue-50 border-2 border-blue-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Edit className="w-4 h-4 text-blue-700" />
                    <Label className="text-sm font-semibold text-blue-900">Specify Length *</Label>
                  </div>
                  <p className="text-xs text-blue-800 mb-3">
                    This material is priced per foot. Enter the length you need:
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="feet" className="text-xs font-semibold text-blue-900">Feet</Label>
                      <Input
                        id="feet"
                        type="number"
                        min="0"
                        value={customLengthFeet}
                        onChange={(e) => setCustomLengthFeet(Math.max(0, parseInt(e.target.value) || 0))}
                        className="h-11 text-lg font-bold border-blue-300 bg-white"
                        placeholder="0"
                        autoFocus
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="inches" className="text-xs font-semibold text-blue-900">Inches</Label>
                      <Input
                        id="inches"
                        type="number"
                        min="0"
                        max="11"
                        value={customLengthInches}
                        onChange={(e) => setCustomLengthInches(Math.max(0, Math.min(11, parseInt(e.target.value) || 0)))}
                        className="h-11 text-lg font-bold border-blue-300 bg-white"
                        placeholder="0"
                      />
                    </div>
                  </div>
                  {(customLengthFeet > 0 || customLengthInches > 0) && selectedCatalogMaterial.purchase_cost && (
                    <div className="bg-white border-2 border-green-500 rounded p-3 mt-3">
                      <p className="text-xs font-semibold text-green-900 mb-1">Cost Calculation:</p>
                      <p className="text-sm text-green-800">
                        {customLengthFeet > 0 && `${customLengthFeet}'`}
                        {customLengthInches > 0 && ` ${customLengthInches}"`}
                        {' '}× ${selectedCatalogMaterial.purchase_cost.toFixed(2)}/ft
                        {' '}= <span className="font-bold text-green-700">
                          ${((customLengthFeet + customLengthInches / 12) * selectedCatalogMaterial.purchase_cost).toFixed(2)}
                        </span> per piece
                      </p>
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="quantity">Quantity (pieces) *</Label>
                <Input
                  id="quantity"
                  type="number"
                  min="1"
                  value={addMaterialQuantity}
                  onChange={(e) => setAddMaterialQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                  className="h-12"
                />
                {showCustomLength && (customLengthFeet > 0 || customLengthInches > 0) && selectedCatalogMaterial.purchase_cost && (
                  <p className="text-sm text-muted-foreground mt-2">
                    Total: {addMaterialQuantity} piece{addMaterialQuantity !== 1 ? 's' : ''} × $
                    {((customLengthFeet + customLengthInches / 12) * selectedCatalogMaterial.purchase_cost).toFixed(2)}
                    {' '}= <span className="font-bold text-green-700">
                      ${((customLengthFeet + customLengthInches / 12) * selectedCatalogMaterial.purchase_cost * addMaterialQuantity).toFixed(2)}
                    </span>
                  </p>
                )}
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

      {/* Custom Material Dialog */}
      <Dialog open={showCustomMaterialDialog} onOpenChange={setShowCustomMaterialDialog}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5" />
              Add Custom Material
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-purple-50 border-2 border-purple-200 rounded-lg p-3">
              <p className="text-sm text-purple-900 font-semibold mb-1">
                ✨ Custom Material Request
              </p>
              <p className="text-xs text-purple-800">
                Can't find what you need in the catalog? Add a custom material with photo for office review.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="custom-name">Material Name *</Label>
              <Input
                id="custom-name"
                value={customMaterialName}
                onChange={(e) => setCustomMaterialName(e.target.value)}
                placeholder="e.g., Special hinges, Custom bracket..."
                className="h-12"
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="custom-quantity">Quantity *</Label>
              <Input
                id="custom-quantity"
                type="number"
                min="1"
                value={customMaterialQuantity}
                onChange={(e) => setCustomMaterialQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                className="h-12"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="custom-length">Length/Size (Optional)</Label>
              <Input
                id="custom-length"
                value={customMaterialLength}
                onChange={(e) => setCustomMaterialLength(e.target.value)}
                placeholder="e.g., 12', 6x6, 1/4\"..."
                className="h-12"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="custom-notes">Notes/Description (Optional)</Label>
              <Textarea
                id="custom-notes"
                value={customMaterialNotes}
                onChange={(e) => setCustomMaterialNotes(e.target.value)}
                placeholder="Add details about what you need, brand, specifications, where to purchase, etc."
                rows={3}
              />
            </div>

            {/* Photo Upload */}
            <div className="space-y-2">
              <Label>Photo (Optional but Recommended)</Label>
              <div className="border-2 border-dashed rounded-lg p-4 text-center hover:border-purple-400 transition-colors bg-purple-50">
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handlePhotoChange}
                  className="hidden"
                  id="custom-material-photo"
                />
                <label htmlFor="custom-material-photo" className="cursor-pointer">
                  {photoPreview ? (
                    <div className="space-y-2">
                      <img
                        src={photoPreview}
                        alt="Preview"
                        className="w-full h-48 object-cover rounded-lg"
                      />
                      <p className="text-sm text-purple-700 font-semibold">
                        ✓ Photo attached - Click to change
                      </p>
                    </div>
                  ) : (
                    <div>
                      <Camera className="w-12 h-12 mx-auto mb-2 text-purple-600" />
                      <p className="font-medium text-purple-900 mb-1">
                        Take or Upload Photo
                      </p>
                      <p className="text-xs text-purple-700">
                        Help the office identify the exact material you need
                      </p>
                    </div>
                  )}
                </label>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-sm text-blue-900 font-semibold mb-1">
                📋 What Happens Next:
              </p>
              <ul className="text-xs text-blue-800 space-y-1 ml-4 list-disc">
                <li>Added to "Field Requests" category</li>
                <li>Marked as "Ordered" - office will be notified</li>
                <li>Office can source and price the material</li>
                <li>Photo helps office identify exact product needed</li>
              </ul>
            </div>

            <div className="flex flex-col gap-3 pt-4 border-t">
              <Button
                onClick={addCustomMaterial}
                disabled={addingCustomMaterial || !customMaterialName.trim()}
                className="h-12 bg-purple-600 hover:bg-purple-700"
              >
                {addingCustomMaterial ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    Adding...
                  </>
                ) : (
                  <>
                    <Plus className="w-5 h-5 mr-2" />
                    Add Custom Material
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowCustomMaterialDialog(false);
                  setCustomMaterialName('');
                  setCustomMaterialQuantity(1);
                  setCustomMaterialLength('');
                  setCustomMaterialNotes('');
                  setCustomMaterialPhoto(null);
                  setPhotoPreview(null);
                }}
                disabled={addingCustomMaterial}
                className="h-12"
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
