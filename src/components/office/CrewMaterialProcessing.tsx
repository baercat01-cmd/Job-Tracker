import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Calendar, User, Clock, AlertTriangle, Package, Palette, ArrowRight, CheckCircle, Image as ImageIcon } from 'lucide-react';
import { toast } from 'sonner';

interface CrewMaterial {
  id: string;
  category_id?: string;
  name: string;
  quantity: number;
  length: string | null;
  status: string;
  color: string | null;
  date_needed_by: string | null;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  ordered_by: string | null;
  order_requested_at: string | null;
  notes: string | null;
  use_case?: string;
  import_source?: string;
  created_at: string;
  categories?: {
    name: string;
  };
  user_profiles?: {
    username: string;
  };
}

interface MaterialPhoto {
  id: string;
  material_id: string;
  photo_url: string;
  uploaded_by: string;
  timestamp: string;
  user_profiles?: {
    username: string;
  };
}

interface MaterialSheet {
  id: string;
  workbook_id: string;
  sheet_name: string;
}

interface CrewMaterialProcessingProps {
  jobId: string;
}

const PRIORITY_CONFIG = {
  low: { label: 'Low', color: 'bg-gray-100 text-gray-700 border-gray-300' },
  medium: { label: 'Medium', color: 'bg-blue-100 text-blue-700 border-blue-300' },
  high: { label: 'High', color: 'bg-orange-100 text-orange-700 border-orange-300' },
  urgent: { label: 'Urgent', color: 'bg-red-100 text-red-700 border-red-300' },
};

export function CrewMaterialProcessing({ jobId }: CrewMaterialProcessingProps) {
  const [materials, setMaterials] = useState<CrewMaterial[]>([]);
  const [sheets, setSheets] = useState<MaterialSheet[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMaterial, setSelectedMaterial] = useState<CrewMaterial | null>(null);
  const [materialPhotos, setMaterialPhotos] = useState<MaterialPhoto[]>([]);
  const [showMoveDialog, setShowMoveDialog] = useState(false);
  
  // Move dialog state
  const [targetSheet, setTargetSheet] = useState('');
  const [targetCategory, setTargetCategory] = useState('');
  const [newSku, setNewSku] = useState('');
  const [newUsage, setNewUsage] = useState('');
  const [newCostPerUnit, setNewCostPerUnit] = useState('');
  const [newMarkup, setNewMarkup] = useState('35');
  const [moving, setMoving] = useState(false);

  useEffect(() => {
    loadCrewMaterials();
    loadWorkbookSheets();

    // Subscribe to changes
    const channel = supabase
      .channel('crew_materials_changes')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'materials', filter: `job_id=eq.${jobId}` },
        () => {
          loadCrewMaterials();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [jobId]);

  async function loadCrewMaterials() {
    try {
      setLoading(true);

      // Load from deprecated materials table (crew field requests)
      const { data, error } = await supabase
        .from('materials')
        .select(`
          *,
          categories:materials_categories(name),
          user_profiles:ordered_by(username)
        `)
        .eq('job_id', jobId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Filter for materials actually ordered by crew (must have both ordered_by and order_requested_at)
      const crewMaterials = (data || []).filter((mat: any) => 
        mat.ordered_by !== null && mat.order_requested_at !== null
      );

      setMaterials(crewMaterials);
    } catch (error: any) {
      console.error('Error loading crew materials:', error);
      toast.error('Failed to load crew materials');
    } finally {
      setLoading(false);
    }
  }

  async function loadWorkbookSheets() {
    try {
      // Get working workbook
      const { data: workbookData } = await supabase
        .from('material_workbooks')
        .select('id')
        .eq('job_id', jobId)
        .eq('status', 'working')
        .maybeSingle();

      if (!workbookData) {
        setSheets([]);
        return;
      }

      // Get sheets
      const { data: sheetsData } = await supabase
        .from('material_sheets')
        .select('*')
        .eq('workbook_id', workbookData.id)
        .order('order_index');

      setSheets(sheetsData || []);
    } catch (error: any) {
      console.error('Error loading sheets:', error);
    }
  }

  async function openMoveDialog(material: CrewMaterial) {
    setSelectedMaterial(material);
    setTargetSheet('');
    setTargetCategory(material.categories?.name || 'Materials');
    setNewSku('');
    setNewUsage(material.use_case || '');
    setNewCostPerUnit('');
    setNewMarkup('35');

    // Load photos for this material
    try {
      const { data: photosData, error: photosError } = await supabase
        .from('material_photos')
        .select(`
          *,
          user_profiles:uploaded_by(username)
        `)
        .eq('material_id', material.id);

      if (photosError) throw photosError;
      setMaterialPhotos(photosData || []);
    } catch (error: any) {
      console.error('Error loading material photos:', error);
      setMaterialPhotos([]);
    }

    setShowMoveDialog(true);
  }

  async function moveToWorkbook() {
    if (!selectedMaterial || !targetSheet) {
      toast.error('Please select a target sheet');
      return;
    }

    if (!targetCategory.trim()) {
      toast.error('Please enter a category');
      return;
    }

    setMoving(true);

    try {
      const costPerUnit = parseFloat(newCostPerUnit) || null;
      const markup = parseFloat(newMarkup) || 35;
      const pricePerUnit = costPerUnit ? costPerUnit * (1 + markup / 100) : null;
      const extendedCost = costPerUnit ? costPerUnit * selectedMaterial.quantity : null;
      const extendedPrice = pricePerUnit ? pricePerUnit * selectedMaterial.quantity : null;

      // Get max order_index for target sheet
      const { data: maxData } = await supabase
        .from('material_items')
        .select('order_index')
        .eq('sheet_id', targetSheet)
        .order('order_index', { ascending: false })
        .limit(1)
        .maybeSingle();

      const nextOrderIndex = (maxData?.order_index || -1) + 1;

      // Insert into material_items (workbook system)
      const { data: newItem, error: insertError } = await supabase
        .from('material_items')
        .insert({
          sheet_id: targetSheet,
          category: targetCategory.trim(),
          usage: newUsage.trim() || null,
          sku: newSku.trim() || null,
          material_name: selectedMaterial.name,
          quantity: selectedMaterial.quantity,
          length: selectedMaterial.length,
          cost_per_unit: costPerUnit,
          markup_percent: markup / 100, // Store as decimal (0.35 for 35%)
          price_per_unit: pricePerUnit,
          extended_cost: extendedCost,
          extended_price: extendedPrice,
          taxable: true,
          notes: selectedMaterial.notes,
          order_index: nextOrderIndex,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      // Migrate photos from old material to new material_items
      if (materialPhotos.length > 0 && newItem) {
        // Store photo references in notes or create a photo link system
        const photoUrls = materialPhotos.map(p => p.photo_url);
        const photoNotes = materialPhotos.length > 0 
          ? `\n\nCrew Photos (${materialPhotos.length}): ${photoUrls.join(', ')}` 
          : '';

        // Update the item with photo information in notes
        await supabase
          .from('material_items')
          .update({
            notes: (selectedMaterial.notes || '') + photoNotes,
          })
          .eq('id', newItem.id);
      }

      // Delete from old materials table
      const { error: deleteError } = await supabase
        .from('materials')
        .delete()
        .eq('id', selectedMaterial.id);

      if (deleteError) throw deleteError;

      toast.success('Material moved to workbook');
      setShowMoveDialog(false);
      loadCrewMaterials();
    } catch (error: any) {
      console.error('Error moving material:', error);
      toast.error('Failed to move material');
    } finally {
      setMoving(false);
    }
  }

  async function deleteMaterial(materialId: string) {
    if (!confirm('Delete this crew material request?')) return;

    try {
      const { error } = await supabase
        .from('materials')
        .delete()
        .eq('id', materialId);

      if (error) throw error;

      toast.success('Material deleted');
      loadCrewMaterials();
    } catch (error: any) {
      console.error('Error deleting material:', error);
      toast.error('Failed to delete material');
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (materials.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <Package className="w-16 h-16 mx-auto mb-4 opacity-50" />
          <p className="text-lg font-semibold mb-2">No Crew Material Requests</p>
          <p className="text-sm">Crew-ordered materials will appear here for processing</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Crew Material Requests</h3>
          <p className="text-sm text-muted-foreground">
            {materials.length} material{materials.length !== 1 ? 's' : ''} ordered by crew
          </p>
        </div>
        {sheets.length === 0 && (
          <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50">
            <AlertTriangle className="w-3 h-3 mr-1" />
            No workbook sheets available
          </Badge>
        )}
      </div>

      {/* Materials List */}
      <div className="space-y-3">
        {materials.map(material => (
          <Card key={material.id} className="border-2 hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h4 className="font-semibold text-base">{material.name}</h4>
                  {material.categories && (
                    <p className="text-sm text-muted-foreground">{material.categories.name}</p>
                  )}
                  {material.use_case && (
                    <p className="text-sm text-muted-foreground mt-1">Use: {material.use_case}</p>
                  )}
                  {material.notes && (
                    <p className="text-sm text-muted-foreground mt-1 italic">"{material.notes}"</p>
                  )}

                  <div className="flex items-center gap-4 mt-3 flex-wrap">
                    {/* Quantity */}
                    <div className="flex items-center gap-2">
                      <Package className="w-4 h-4 text-muted-foreground" />
                      <Badge variant="outline">{material.quantity} qty</Badge>
                    </div>

                    {/* Length */}
                    {material.length && (
                      <div className="text-sm">
                        <span className="text-muted-foreground">Length:</span> {material.length}
                      </div>
                    )}

                    {/* Color */}
                    {material.color && (
                      <div className="flex items-center gap-1">
                        <Palette className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm font-medium">{material.color}</span>
                      </div>
                    )}

                    {/* Priority */}
                    <Badge className={PRIORITY_CONFIG[material.priority || 'medium'].color}>
                      {PRIORITY_CONFIG[material.priority || 'medium'].label}
                    </Badge>

                    {/* Date Needed By */}
                    {material.date_needed_by && (
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm">
                          Need by: {new Date(material.date_needed_by).toLocaleDateString()}
                        </span>
                      </div>
                    )}

                    {/* Ordered By */}
                    {material.user_profiles && (
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm">{material.user_profiles.username}</span>
                      </div>
                    )}

                    {/* Order Date */}
                    {material.order_requested_at && (
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm">
                          {new Date(material.order_requested_at).toLocaleDateString()}
                        </span>
                      </div>
                    )}

                    {/* Crew Ordered Badge */}
                    <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-300">
                      Crew Ordered
                    </Badge>
                  </div>

                  {/* Show photo count if available */}
                  <PhotoPreview materialId={material.id} />
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2 ml-4">
                  <Button
                    size="sm"
                    onClick={() => openMoveDialog(material)}
                    disabled={sheets.length === 0}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    <ArrowRight className="w-4 h-4 mr-1" />
                    Move to Workbook
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => deleteMaterial(material.id)}
                    className="text-destructive"
                  >
                    Delete
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Move to Workbook Dialog */}
      <Dialog open={showMoveDialog} onOpenChange={setShowMoveDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Move to Material Workbook</DialogTitle>
          </DialogHeader>
          {selectedMaterial && (
            <div className="space-y-4">
              <div className="bg-slate-50 p-3 rounded-lg border">
                <h4 className="font-semibold mb-1">{selectedMaterial.name}</h4>
                <p className="text-sm text-muted-foreground">
                  Qty: {selectedMaterial.quantity}
                  {selectedMaterial.length && ` • Length: ${selectedMaterial.length}`}
                </p>
              </div>

              <div>
                <Label>Target Sheet *</Label>
                <Select value={targetSheet} onValueChange={setTargetSheet}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select sheet..." />
                  </SelectTrigger>
                  <SelectContent>
                    {sheets.map(sheet => (
                      <SelectItem key={sheet.id} value={sheet.id}>
                        {sheet.sheet_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Category *</Label>
                <Input
                  value={targetCategory}
                  onChange={(e) => setTargetCategory(e.target.value)}
                  placeholder="e.g., Framing, Roofing, Electrical..."
                />
              </div>

              <div>
                <Label>SKU (Optional)</Label>
                <Input
                  value={newSku}
                  onChange={(e) => setNewSku(e.target.value)}
                  placeholder="Enter SKU..."
                />
              </div>

              <div>
                <Label>Usage (Optional)</Label>
                <Input
                  value={newUsage}
                  onChange={(e) => setNewUsage(e.target.value)}
                  placeholder="e.g., Main building, Porch..."
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Cost per Unit ($)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={newCostPerUnit}
                    onChange={(e) => setNewCostPerUnit(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <Label>Markup (%)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.1"
                    value={newMarkup}
                    onChange={(e) => setNewMarkup(e.target.value)}
                  />
                </div>
              </div>

              {/* Photos Preview */}
              {materialPhotos.length > 0 && (
                <div className="border rounded-lg p-3 bg-blue-50">
                  <div className="flex items-center gap-2 mb-2">
                    <ImageIcon className="w-4 h-4 text-blue-700" />
                    <span className="text-sm font-semibold text-blue-900">
                      {materialPhotos.length} Photo{materialPhotos.length !== 1 ? 's' : ''} from Crew
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {materialPhotos.slice(0, 6).map((photo) => (
                      <a
                        key={photo.id}
                        href={photo.photo_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="relative aspect-square rounded-lg overflow-hidden border-2 border-blue-200 hover:border-blue-400 transition-colors"
                      >
                        <img
                          src={photo.photo_url}
                          alt="Material photo"
                          className="w-full h-full object-cover"
                        />
                      </a>
                    ))}
                  </div>
                  {materialPhotos.length > 6 && (
                    <p className="text-xs text-blue-700 mt-2">
                      +{materialPhotos.length - 6} more photo{materialPhotos.length - 6 !== 1 ? 's' : ''}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-2">
                    ℹ️ Photos will be linked to this material in the workbook
                  </p>
                </div>
              )}

              {/* Preview */}
              {newCostPerUnit && (
                <div className="bg-green-50 p-3 rounded-lg border border-green-200 space-y-1">
                  <div className="flex justify-between text-sm">
                    <span>Extended Cost:</span>
                    <span className="font-semibold">
                      ${((parseFloat(newCostPerUnit) || 0) * selectedMaterial.quantity).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Extended Price:</span>
                    <span className="font-bold text-green-700">
                      ${(((parseFloat(newCostPerUnit) || 0) * selectedMaterial.quantity) * (1 + (parseFloat(newMarkup) || 0) / 100)).toFixed(2)}
                    </span>
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-4 border-t">
                <Button
                  onClick={moveToWorkbook}
                  disabled={moving || !targetSheet}
                  className="flex-1"
                >
                  {moving ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                      Moving...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Move to Workbook
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowMoveDialog(false)}
                  disabled={moving}
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

// Small component to show photo count for a material
function PhotoPreview({ materialId }: { materialId: string }) {
  const [photoCount, setPhotoCount] = useState<number>(0);

  useEffect(() => {
    async function loadPhotoCount() {
      const { count, error } = await supabase
        .from('material_photos')
        .select('*', { count: 'exact', head: true })
        .eq('material_id', materialId);

      if (!error && count) {
        setPhotoCount(count);
      }
    }

    loadPhotoCount();
  }, [materialId]);

  if (photoCount === 0) return null;

  return (
    <div className="mt-2">
      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-300">
        <ImageIcon className="w-3 h-3 mr-1" />
        {photoCount} Photo{photoCount !== 1 ? 's' : ''}
      </Badge>
    </div>
  );
}
