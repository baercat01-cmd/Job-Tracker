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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ChevronDown, ChevronRight, Package, Camera, FileText, ChevronDownIcon, Search, X, Plus, Minus } from 'lucide-react';
import { toast } from 'sonner';
import { createNotification, getMaterialStatusBrief } from '@/lib/notifications';
import type { Job } from '@/types';

interface Material {
  id: string;
  category_id: string;
  name: string;
  quantity: number;
  length: string | null;
  status: 'not_ordered' | 'ordered' | 'at_shop' | 'at_job' | 'installed' | 'missing';
  notes: string | null;
  updated_at: string;
}

interface Category {
  id: string;
  name: string;
  order_index: number;
  materials: Material[];
}

interface MaterialPhoto {
  id: string;
  photo_url: string;
  timestamp: string;
}

type StatusFilter = 'all' | 'not_ordered' | 'ordered' | 'at_shop' | 'at_job' | 'installed' | 'missing';

interface MaterialsListProps {
  job: Job;
  userId: string;
}

const STATUS_CONFIG = {
  not_ordered: { label: 'Not Ordered', color: 'bg-gray-500', bgClass: 'bg-gray-100 text-gray-700 border-gray-300' },
  ordered: { label: 'Ordered', color: 'bg-yellow-500', bgClass: 'bg-yellow-100 text-yellow-700 border-yellow-300' },
  at_shop: { label: 'At Shop', color: 'bg-blue-500', bgClass: 'bg-blue-100 text-blue-700 border-blue-300' },
  at_job: { label: 'At Job', color: 'bg-green-500', bgClass: 'bg-green-100 text-green-700 border-green-300' },
  installed: { label: 'Installed', color: 'bg-black', bgClass: 'bg-slate-800 text-white border-slate-800' },
  missing: { label: 'Missing', color: 'bg-red-500', bgClass: 'bg-red-100 text-red-700 border-red-300' },
};

export function MaterialsList({ job, userId }: MaterialsListProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Material detail modal
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null);
  const [materialNotes, setMaterialNotes] = useState('');
  const [materialPhotos, setMaterialPhotos] = useState<MaterialPhoto[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [editQuantity, setEditQuantity] = useState<number>(0);
  const [savingQuantity, setSavingQuantity] = useState(false);
  const [editName, setEditName] = useState('');
  const [editLength, setEditLength] = useState('');
  const [editUseCase, setEditUseCase] = useState('');
  const [savingDetails, setSavingDetails] = useState(false);

  useEffect(() => {
    loadMaterials();
  }, [job.id]);

  async function loadMaterials() {
    try {
      setLoading(true);
      
      // Load categories
      const { data: categoriesData, error: categoriesError } = await supabase
        .from('materials_categories')
        .select('*')
        .eq('job_id', job.id)
        .order('order_index');

      if (categoriesError) throw categoriesError;

      // Load materials
      const { data: materialsData, error: materialsError } = await supabase
        .from('materials')
        .select('*')
        .eq('job_id', job.id)
        .order('name');

      if (materialsError) throw materialsError;

      // Group materials by category
      const categoriesWithMaterials: Category[] = (categoriesData || []).map(cat => ({
        id: cat.id,
        name: cat.name,
        order_index: cat.order_index,
        materials: (materialsData || []).filter((m: any) => m.category_id === cat.id),
      }));

      setCategories(categoriesWithMaterials);
    } catch (error: any) {
      console.error('Error loading materials:', error);
      toast.error('Failed to load materials');
    } finally {
      setLoading(false);
    }
  }

  async function loadMaterialPhotos(materialId: string) {
    try {
      const { data, error } = await supabase
        .from('material_photos')
        .select('*')
        .eq('material_id', materialId)
        .order('timestamp', { ascending: false });

      if (error) throw error;
      setMaterialPhotos(data || []);
    } catch (error: any) {
      console.error('Error loading photos:', error);
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

  function openMaterialDetail(material: Material) {
    setSelectedMaterial(material);
    setMaterialNotes(material.notes || '');
    setEditQuantity(material.quantity);
    setEditName(material.name);
    setEditLength(material.length || '');
    setEditUseCase((material as any).use_case || '');
    loadMaterialPhotos(material.id);
  }

  async function updateMaterialStatus(status: Material['status']) {
    if (!selectedMaterial) return;

    const oldStatus = selectedMaterial.status;
    
    try {
      const { error } = await supabase
        .from('materials')
        .update({ 
          status,
          updated_at: new Date().toISOString(),
        })
        .eq('id', selectedMaterial.id);

      if (error) throw error;

      toast.success(`Status updated to ${STATUS_CONFIG[status].label}`);
      setSelectedMaterial({ ...selectedMaterial, status });
      loadMaterials();
      
      // Create notification for office
      await createNotification({
        jobId: job.id,
        createdBy: userId,
        type: 'material_status',
        brief: getMaterialStatusBrief(selectedMaterial.name, oldStatus, status),
        referenceId: selectedMaterial.id,
        referenceData: { 
          materialName: selectedMaterial.name,
          oldStatus,
          newStatus: status,
        },
      });
    } catch (error: any) {
      toast.error('Failed to update status');
      console.error(error);
    }
  }

  async function updateMaterialQuantity() {
    if (!selectedMaterial) return;
    
    if (editQuantity < 0) {
      toast.error('Quantity cannot be negative');
      return;
    }

    setSavingQuantity(true);
    
    try {
      const { error } = await supabase
        .from('materials')
        .update({ 
          quantity: editQuantity,
          updated_at: new Date().toISOString(),
        })
        .eq('id', selectedMaterial.id);

      if (error) throw error;

      toast.success('Quantity updated');
      setSelectedMaterial({ ...selectedMaterial, quantity: editQuantity });
      loadMaterials();
    } catch (error: any) {
      toast.error('Failed to update quantity');
      console.error(error);
    } finally {
      setSavingQuantity(false);
    }
  }

  function adjustQuantity(delta: number) {
    const newQty = editQuantity + delta;
    if (newQty >= 0) {
      setEditQuantity(newQty);
    }
  }

  async function saveMaterialDetails() {
    if (!selectedMaterial) return;
    
    if (!editName.trim()) {
      toast.error('Material name cannot be empty');
      return;
    }

    setSavingDetails(true);
    
    try {
      const { error } = await supabase
        .from('materials')
        .update({ 
          name: editName.trim(),
          length: editLength.trim() || null,
          use_case: editUseCase.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', selectedMaterial.id);

      if (error) throw error;

      toast.success('Material details updated');
      setSelectedMaterial({ 
        ...selectedMaterial, 
        name: editName.trim(),
        length: editLength.trim() || null,
      } as any);
      loadMaterials();
    } catch (error: any) {
      toast.error('Failed to update material details');
      console.error(error);
    } finally {
      setSavingDetails(false);
    }
  }

  async function saveMaterialNotes() {
    if (!selectedMaterial) return;

    try {
      const { error } = await supabase
        .from('materials')
        .update({ 
          notes: materialNotes || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', selectedMaterial.id);

      if (error) throw error;

      toast.success('Notes saved');
      setSelectedMaterial({ ...selectedMaterial, notes: materialNotes });
      loadMaterials();
    } catch (error: any) {
      toast.error('Failed to save notes');
      console.error(error);
    }
  }

  async function uploadPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    if (!selectedMaterial || !e.target.files || e.target.files.length === 0) return;

    const file = e.target.files[0];
    
    try {
      setUploadingPhoto(true);

      // Upload to storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${selectedMaterial.id}-${Date.now()}.${fileExt}`;
      const filePath = `materials/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('job-files')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('job-files')
        .getPublicUrl(filePath);

      // Save photo record
      const { error: dbError } = await supabase
        .from('material_photos')
        .insert({
          material_id: selectedMaterial.id,
          photo_url: publicUrl,
          uploaded_by: userId,
        });

      if (dbError) throw dbError;

      toast.success('Photo uploaded');
      loadMaterialPhotos(selectedMaterial.id);
    } catch (error: any) {
      toast.error('Failed to upload photo');
      console.error(error);
    } finally {
      setUploadingPhoto(false);
    }
  }

  function getFilteredCategories() {
    return categories.map(cat => {
      let filteredMaterials = cat.materials;

      // Apply status filter
      if (statusFilter !== 'all') {
        filteredMaterials = filteredMaterials.filter(m => m.status === statusFilter);
      }

      // Apply search filter (searches name, use_case, and length)
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        filteredMaterials = filteredMaterials.filter(m => 
          m.name.toLowerCase().includes(search) ||
          ((m as any).use_case && (m as any).use_case.toLowerCase().includes(search)) ||
          (m.length && m.length.toLowerCase().includes(search))
        );
      }

      return {
        ...cat,
        materials: filteredMaterials,
      };
    }).filter(cat => cat.materials.length > 0);
  }

  const filteredCategories = getFilteredCategories();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-muted-foreground">Loading materials...</div>
      </div>
    );
  }

  if (categories.length === 0) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="text-center text-muted-foreground">
            <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No materials have been added to this job yet.</p>
            <p className="text-sm mt-2">Office staff can add material categories and items.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input
          placeholder="Search materials..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-8 pr-8 h-9 text-sm"
        />
        {searchTerm && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSearchTerm('')}
            className="absolute right-0.5 top-1/2 transform -translate-y-1/2 h-7 w-7 p-0"
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>

      {/* Status Filter Dropdown */}
      <div>
        <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
          <SelectTrigger className="h-10">
            <SelectValue>
              {statusFilter === 'all' ? (
                'All Materials'
              ) : (
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${STATUS_CONFIG[statusFilter as keyof typeof STATUS_CONFIG].color}`} />
                  {STATUS_CONFIG[statusFilter as keyof typeof STATUS_CONFIG].label}
                </div>
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Materials</SelectItem>
            {Object.entries(STATUS_CONFIG).map(([status, config]) => (
              <SelectItem key={status} value={status}>
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${config.color}`} />
                  {config.label}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Categories */}
      {filteredCategories.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No materials match the selected filter
          </CardContent>
        </Card>
      ) : (
        filteredCategories.map((category) => (
          <Card key={category.id}>
            <CardHeader
              className="cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => toggleCategory(category.id)}
            >
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  {expandedCategories.has(category.id) ? (
                    <ChevronDown className="w-5 h-5" />
                  ) : (
                    <ChevronRight className="w-5 h-5" />
                  )}
                  {category.name}
                </CardTitle>
                <Badge variant="secondary">
                  {category.materials.length} item{category.materials.length !== 1 ? 's' : ''}
                </Badge>
              </div>
            </CardHeader>

            {expandedCategories.has(category.id) && (
              <CardContent className="space-y-2">
                {category.materials.map((material) => (
                  <div
                    key={material.id}
                    className="p-4 border rounded-lg hover:bg-muted/50 transition-colors space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div 
                        className="flex-1 min-w-0 cursor-pointer" 
                        onClick={() => openMaterialDetail(material)}
                      >
                        <p className="font-medium truncate">{material.name}</p>
                        {(material as any).use_case && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Use: {(material as any).use_case}
                          </p>
                        )}
                        <div className="flex gap-3 text-sm text-muted-foreground mt-1">
                          <span>Qty: {material.quantity}</span>
                          {material.length && <span>Length: {material.length}</span>}
                        </div>
                      </div>
                      <div className="w-36 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <Select
                          value={material.status}
                          onValueChange={async (value) => {
                            try {
                              const { error } = await supabase
                                .from('materials')
                                .update({ status: value, updated_at: new Date().toISOString() })
                                .eq('id', material.id);
                              
                              if (error) throw error;
                              toast.success('Status updated');
                              loadMaterials();
                            } catch (error: any) {
                              toast.error('Failed to update status');
                              console.error(error);
                            }
                          }}
                        >
                          <SelectTrigger 
                            className={`h-9 text-xs font-semibold border-2 rounded-md ${STATUS_CONFIG[material.status].bgClass} hover:shadow-md cursor-pointer transition-all`}
                          >
                            <div className="flex items-center justify-between w-full">
                              <span>{STATUS_CONFIG[material.status].label}</span>
                              <ChevronDownIcon className="w-3.5 h-3.5 opacity-70" />
                            </div>
                          </SelectTrigger>
                          <SelectContent className="min-w-[160px]">
                            {Object.entries(STATUS_CONFIG).map(([status, config]) => (
                              <SelectItem 
                                key={status} 
                                value={status} 
                                className="text-sm cursor-pointer"
                              >
                                <div className="flex items-center gap-3">
                                  <div className={`w-4 h-4 rounded border-2 ${config.bgClass}`} />
                                  <span className="font-medium">{config.label}</span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    {material.notes && (
                      <p className="text-xs text-muted-foreground line-clamp-2" onClick={() => openMaterialDetail(material)}>
                        Note: {material.notes}
                      </p>
                    )}
                  </div>
                ))}
              </CardContent>
            )}
          </Card>
        ))
      )}

      {/* Material Detail Modal */}
      <Dialog open={!!selectedMaterial} onOpenChange={() => setSelectedMaterial(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedMaterial?.name}</DialogTitle>
          </DialogHeader>

          {selectedMaterial && (
            <div className="space-y-6">
              {/* Material Name */}
              <div className="space-y-2">
                <Label htmlFor="material-name" className="text-base font-semibold">Material Name</Label>
                <div className="flex gap-2">
                  <Input
                    id="material-name"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Enter material name..."
                    className="flex-1"
                  />
                  {editName !== selectedMaterial.name && (
                    <Button
                      onClick={saveMaterialDetails}
                      disabled={savingDetails || !editName.trim()}
                      size="sm"
                      className="gradient-primary"
                    >
                      {savingDetails ? 'Saving...' : 'Save'}
                    </Button>
                  )}
                </div>
              </div>

              {/* Use Case */}
              <div className="space-y-2">
                <Label htmlFor="material-use-case" className="text-base font-semibold">Use Case</Label>
                <div className="flex gap-2">
                  <Input
                    id="material-use-case"
                    value={editUseCase}
                    onChange={(e) => setEditUseCase(e.target.value)}
                    placeholder="Enter use case (optional)..."
                    className="flex-1"
                  />
                  {editUseCase !== ((selectedMaterial as any).use_case || '') && (
                    <Button
                      onClick={saveMaterialDetails}
                      disabled={savingDetails}
                      size="sm"
                      className="gradient-primary"
                    >
                      {savingDetails ? 'Saving...' : 'Save'}
                    </Button>
                  )}
                </div>
              </div>

              {/* Length */}
              <div className="space-y-2">
                <Label htmlFor="material-length" className="text-base font-semibold">Length</Label>
                <div className="flex gap-2">
                  <Input
                    id="material-length"
                    value={editLength}
                    onChange={(e) => setEditLength(e.target.value)}
                    placeholder="Enter length (optional)..."
                    className="flex-1"
                  />
                  {editLength !== (selectedMaterial.length || '') && (
                    <Button
                      onClick={saveMaterialDetails}
                      disabled={savingDetails}
                      size="sm"
                      className="gradient-primary"
                    >
                      {savingDetails ? 'Saving...' : 'Save'}
                    </Button>
                  )}
                </div>
              </div>
              
              {/* Quantity Editor */}
              <div className="space-y-3">
                <Label htmlFor="material-quantity" className="text-base font-semibold">Quantity</Label>
                <div className="flex gap-2">
                  <Input
                    id="material-quantity"
                    type="number"
                    min="0"
                    step="1"
                    value={editQuantity}
                    onChange={(e) => setEditQuantity(Math.max(0, parseFloat(e.target.value) || 0))}
                    placeholder="Enter quantity..."
                    className="flex-1 h-12 text-lg"
                  />
                  {editQuantity !== selectedMaterial.quantity && (
                    <Button
                      onClick={updateMaterialQuantity}
                      disabled={savingQuantity}
                      className="gradient-primary"
                    >
                      {savingQuantity ? 'Saving...' : 'Save'}
                    </Button>
                  )}
                </div>
                {editQuantity !== selectedMaterial.quantity && (
                  <div className="text-sm text-muted-foreground bg-primary/5 p-2 rounded">
                    Original: <span className="font-medium">{selectedMaterial.quantity}</span>
                    <span className="mx-1">→</span>
                    New: <span className="font-medium text-primary">{editQuantity}</span>
                    <span className="ml-2">
                      ({editQuantity > selectedMaterial.quantity ? '+' : ''}
                      {editQuantity - selectedMaterial.quantity})
                    </span>
                  </div>
                )}
              </div>

              {/* Status Update */}
              <div className="space-y-3">
                <Label className="text-base font-semibold">Update Status</Label>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(STATUS_CONFIG).map(([status, config]) => (
                    <Button
                      key={status}
                      variant={selectedMaterial.status === status ? 'default' : 'outline'}
                      onClick={() => updateMaterialStatus(status as Material['status'])}
                      className={`h-12 ${
                        selectedMaterial.status === status 
                          ? `${config.color} text-white hover:opacity-90` 
                          : ''
                      }`}
                    >
                      {config.label}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <Label htmlFor="material-notes" className="text-base font-semibold">
                  Notes
                </Label>
                <Textarea
                  id="material-notes"
                  value={materialNotes}
                  onChange={(e) => setMaterialNotes(e.target.value)}
                  placeholder="Add notes about this material..."
                  rows={3}
                  className="resize-none"
                />
                <Button
                  onClick={saveMaterialNotes}
                  variant="outline"
                  size="sm"
                  className="w-full"
                >
                  <FileText className="w-4 h-4 mr-2" />
                  Save Notes
                </Button>
              </div>

              {/* Photos */}
              <div className="space-y-3">
                <Label className="text-base font-semibold">Photos</Label>
                
                <Button
                  variant="outline"
                  className="w-full h-12"
                  disabled={uploadingPhoto}
                  onClick={() => document.getElementById('material-photo-upload')?.click()}
                >
                  <Camera className="w-5 h-5 mr-2" />
                  {uploadingPhoto ? 'Uploading...' : 'Add Photo'}
                </Button>
                <input
                  id="material-photo-upload"
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={uploadPhoto}
                  className="hidden"
                />

                {materialPhotos.length > 0 && (
                  <div className="grid grid-cols-2 gap-2">
                    {materialPhotos.map((photo) => (
                      <img
                        key={photo.id}
                        src={photo.photo_url}
                        alt="Material"
                        className="w-full aspect-square object-cover rounded-lg border"
                      />
                    ))}
                  </div>
                )}
              </div>

              <Button
                variant="outline"
                onClick={() => setSelectedMaterial(null)}
                className="w-full"
              >
                Close
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}