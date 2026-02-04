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
import { Database, Search, Plus, Package, Edit, Camera, ChevronDown, ChevronRight, Download, X } from 'lucide-react';
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

interface MaterialPiece {
  lengthFeet: number;
  lengthInches: number;
  quantity: number;
  displayLength: string;
  costPerPiece: number;
}

interface MaterialVariant {
  sku: string;
  length: string;
  quantity: number;
  unitPrice: number;
  purchaseCost: number;
}

const STATUS_OPTIONS = [
  { value: 'not_ordered', label: 'Not Ordered', color: 'bg-gray-100 text-gray-700 border-gray-300' },
  { value: 'ordered', label: 'Ordered', color: 'bg-yellow-100 text-yellow-700 border-yellow-300' },
  { value: 'ready_to_pull', label: 'Pull from Shop', color: 'bg-purple-100 text-purple-700 border-purple-300' },
  { value: 'at_shop', label: 'Ready for Job', color: 'bg-blue-100 text-blue-700 border-blue-300' },
  { value: 'at_job', label: 'At Job', color: 'bg-green-100 text-green-700 border-green-300' },
  { value: 'installed', label: 'Installed', color: 'bg-slate-800 text-white border-slate-800' },
  { value: 'missing', label: 'Missing', color: 'bg-red-100 text-red-700 border-red-300' },
  { value: 'needed', label: 'Needed', color: 'bg-orange-100 text-orange-700 border-orange-300' },
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
  const [materialPieces, setMaterialPieces] = useState<MaterialPiece[]>([]);
  const [materialVariants, setMaterialVariants] = useState<MaterialVariant[]>([]);
  const [selectedVariants, setSelectedVariants] = useState<Map<string, number>>(new Map());
  
  // Custom material state
  const [showCustomMaterialDialog, setShowCustomMaterialDialog] = useState(false);
  const [customMaterialName, setCustomMaterialName] = useState('');
  const [customMaterialQuantity, setCustomMaterialQuantity] = useState<number>(1);
  const [customMaterialLength, setCustomMaterialLength] = useState('');
  const [customMaterialNotes, setCustomMaterialNotes] = useState('');
  const [customMaterialPhoto, setCustomMaterialPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [addingCustomMaterial, setAddingCustomMaterial] = useState(false);
  const [expandedRequestIds, setExpandedRequestIds] = useState<Set<string>>(new Set());

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
        .in('import_source', ['field_catalog', 'field_custom'])
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
    setMaterialPieces([]); // Reset pieces list
    setSelectedVariants(new Map()); // Reset variant selections
    
    // Show custom length input if material doesn't have a pre-defined length
    const hasPreDefinedLength = material.part_length && material.part_length.trim() !== '';
    setShowCustomLength(!hasPreDefinedLength);
    
    // Find all variants of this material (same base name, different lengths)
    if (hasPreDefinedLength) {
      const baseName = extractBaseMaterialName(material.material_name);
      const variants = catalogMaterials
        .filter(m => {
          const mBaseName = extractBaseMaterialName(m.material_name);
          return mBaseName === baseName && m.part_length && m.part_length.trim() !== '';
        })
        .map(m => ({
          sku: m.sku,
          length: cleanMaterialValue(m.part_length || ''),
          quantity: 0,
          unitPrice: m.unit_price || 0,
          purchaseCost: m.purchase_cost || 0,
        }))
        .sort((a, b) => parseLengthForSorting(a.length) - parseLengthForSorting(b.length));
      
      setMaterialVariants(variants);
      
      // Pre-select the clicked variant with quantity 1
      const clickedVariant = variants.find(v => v.sku === material.sku);
      if (clickedVariant) {
        const initialSelection = new Map<string, number>();
        initialSelection.set(material.sku, 1);
        setSelectedVariants(initialSelection);
      }
    } else {
      setMaterialVariants([]);
    }
    
    setShowAddMaterialDialog(true);
  }
  
  // Extract base material name (remove length specifications)
  function extractBaseMaterialName(name: string): string {
    // Remove common length patterns: 10', 12', 4x4, etc.
    return name
      .replace(/\d+['"]?\s*x?\s*\d*['"]?/gi, '') // Remove dimensions like 10', 4x4, 12' x 1"
      .replace(/\d+\s*ft/gi, '') // Remove "10 ft"
      .replace(/\d+\s*inch/gi, '') // Remove "12 inch"
      .replace(/[\d\/]+"/gi, '') // Remove fractions like 1/4"
      .replace(/\s+/g, ' ') // Normalize spaces
      .trim();
  }

  function addPieceToList() {
    if (!selectedCatalogMaterial) return;
    
    const totalFeet = customLengthFeet + (customLengthInches / 12);
    
    if (totalFeet <= 0) {
      toast.error('Please specify a length greater than 0');
      return;
    }

    if (addMaterialQuantity <= 0) {
      toast.error('Quantity must be greater than 0');
      return;
    }

    // Format length display
    const feet = Math.floor(totalFeet);
    const inches = Math.round((totalFeet - feet) * 12);
    const displayLength = inches > 0 ? `${feet}' ${inches}\"` : `${feet}'`;

    // Calculate cost
    const pricePerFoot = selectedCatalogMaterial.purchase_cost || 0;
    const costPerPiece = pricePerFoot * totalFeet;

    const newPiece: MaterialPiece = {
      lengthFeet: customLengthFeet,
      lengthInches: customLengthInches,
      quantity: addMaterialQuantity,
      displayLength,
      costPerPiece,
    };

    setMaterialPieces([...materialPieces, newPiece]);
    
    // Reset inputs for next piece
    setCustomLengthFeet(0);
    setCustomLengthInches(0);
    setAddMaterialQuantity(1);
    
    toast.success('Piece added to order');
  }

  function removePiece(index: number) {
    setMaterialPieces(materialPieces.filter((_, i) => i !== index));
    toast.success('Piece removed from order');
  }

  function getTotalPiecesCount(): number {
    return materialPieces.reduce((sum, piece) => sum + piece.quantity, 0);
  }

  function getTotalCost(): number {
    return materialPieces.reduce((sum, piece) => sum + (piece.costPerPiece * piece.quantity), 0);
  }

  function updateVariantQuantity(sku: string, quantity: number) {
    const newSelection = new Map(selectedVariants);
    if (quantity > 0) {
      newSelection.set(sku, quantity);
    } else {
      newSelection.delete(sku);
    }
    setSelectedVariants(newSelection);
  }
  
  function getTotalVariantsCount(): number {
    return Array.from(selectedVariants.values()).reduce((sum, qty) => sum + qty, 0);
  }
  
  function getTotalVariantsCost(): number {
    let total = 0;
    selectedVariants.forEach((qty, sku) => {
      const variant = materialVariants.find(v => v.sku === sku);
      if (variant) {
        total += (variant.purchaseCost || 0) * qty;
      }
    });
    return total;
  }

  async function addMaterialToJob() {
    if (!selectedCatalogMaterial) return;

    // For custom length materials, require at least one piece in the list
    if (showCustomLength && materialPieces.length === 0) {
      toast.error('Please add at least one piece to your order');
      return;
    }
    
    // For variant materials, require at least one variant selected
    if (!showCustomLength && materialVariants.length > 0 && selectedVariants.size === 0) {
      toast.error('Please select at least one length with quantity');
      return;
    }

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

      if (showCustomLength) {
        // Create a separate material entry for each piece
        const materialsToInsert = materialPieces.map(piece => ({
          category_id: categoryId,
          job_id: job.id,
          name: selectedCatalogMaterial.material_name,
          quantity: piece.quantity,
          length: piece.displayLength,
          status: 'needed' as const,
          notes: addMaterialNotes || `Requested from field (SKU: ${selectedCatalogMaterial.sku})`,
          created_by: userId,
          ordered_by: userId,
          order_requested_at: new Date().toISOString(),
          import_source: 'field_catalog',
          is_extra: true,
          unit_cost: piece.costPerPiece,
          total_cost: piece.costPerPiece * piece.quantity,
        }));

        const { error: materialError } = await supabase
          .from('materials')
          .insert(materialsToInsert);

        if (materialError) throw materialError;

        // Create notification for office
        await createNotification({
          jobId: job.id,
          createdBy: userId,
          type: 'material_request',
          brief: `Field request: ${selectedCatalogMaterial.material_name} (${getTotalPiecesCount()} pieces, ${materialPieces.length} different lengths)`,
          referenceData: {
            materialName: selectedCatalogMaterial.material_name,
            sku: selectedCatalogMaterial.sku,
            totalPieces: getTotalPiecesCount(),
            uniqueLengths: materialPieces.length,
            pieces: materialPieces.map(p => `${p.quantity}x ${p.displayLength}`).join(', '),
            notes: addMaterialNotes,
          },
        });

        toast.success(`Added ${getTotalPiecesCount()} pieces in ${materialPieces.length} different lengths`);
      } else if (materialVariants.length > 0) {
        // Multi-variant material (same material, different lengths)
        const materialsToInsert = [];
        const variantDetails = [];
        
        for (const [sku, quantity] of selectedVariants.entries()) {
          const variant = materialVariants.find(v => v.sku === sku);
          if (!variant || quantity <= 0) continue;
          
          const catalogMaterial = catalogMaterials.find(m => m.sku === sku);
          if (!catalogMaterial) continue;
          
          const unit_cost = catalogMaterial.purchase_cost || 0;
          const total_cost = unit_cost * quantity;
          
          materialsToInsert.push({
            category_id: categoryId,
            job_id: job.id,
            name: catalogMaterial.material_name,
            quantity,
            length: catalogMaterial.part_length || null,
            status: 'needed',
            notes: addMaterialNotes || `Requested from field (SKU: ${catalogMaterial.sku})`,
            created_by: userId,
            ordered_by: userId,
            order_requested_at: new Date().toISOString(),
            import_source: 'field_catalog',
            is_extra: true,
            unit_cost,
            total_cost,
          });
          
          variantDetails.push(`${quantity}x ${variant.length}`);
        }
        
        if (materialsToInsert.length === 0) {
          toast.error('No materials to add');
          return;
        }
        
        const { error: materialError } = await supabase
          .from('materials')
          .insert(materialsToInsert);

        if (materialError) throw materialError;

        await createNotification({
          jobId: job.id,
          createdBy: userId,
          type: 'material_request',
          brief: `Field request: ${extractBaseMaterialName(selectedCatalogMaterial.material_name)} (${getTotalVariantsCount()} pieces, ${selectedVariants.size} lengths)`,
          referenceData: {
            materialName: extractBaseMaterialName(selectedCatalogMaterial.material_name),
            totalPieces: getTotalVariantsCount(),
            uniqueLengths: selectedVariants.size,
            variants: variantDetails.join(', '),
            notes: addMaterialNotes,
          },
        });

        toast.success(`Added ${getTotalVariantsCount()} pieces in ${selectedVariants.size} different lengths`);
      } else {
        // Standard material with pre-defined length - single entry (no variants found)
        const unit_cost = selectedCatalogMaterial.purchase_cost || 0;
        const total_cost = unit_cost * addMaterialQuantity;

        const { error: materialError } = await supabase
          .from('materials')
          .insert({
            category_id: categoryId,
            job_id: job.id,
            name: selectedCatalogMaterial.material_name,
            quantity: addMaterialQuantity,
            length: selectedCatalogMaterial.part_length || null,
            status: 'needed',
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
      }

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

  function toggleRequestExpanded(materialId: string) {
    const newExpanded = new Set(expandedRequestIds);
    if (newExpanded.has(materialId)) {
      newExpanded.delete(materialId);
    } else {
      newExpanded.add(materialId);
    }
    setExpandedRequestIds(newExpanded);
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

  async function downloadFieldRequests() {
    try {
      if (fieldRequests.length === 0) {
        toast.error('No field requests to download');
        return;
      }

      // Create CSV content
      const headers = [
        'Material Name',
        'Quantity',
        'Length',
        'Status',
        'Category',
        'Use Case',
        'Notes',
        'Ordered Date',
      ];

      const csvRows = [headers.join(',')];

      fieldRequests.forEach(material => {
        const row = [
          `"${material.name}"`,
          material.quantity,
          `"${material.length || ''}"`,
          `"${getStatusLabel(material.status)}"`,
          `"${material.category_name}"`,
          `"${material.use_case || ''}"`,
          `"${material.notes || ''}"`,
          material.order_requested_at ? new Date(material.order_requested_at).toLocaleDateString() : '',
        ];
        csvRows.push(row.join(','));
      });

      const csvContent = csvRows.join('\n');

      // Create blob and download
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      
      const fileName = `${job.name.replace(/[^a-z0-9]/gi, '_')}_field_requests_${new Date().toISOString().split('T')[0]}.csv`;
      
      link.setAttribute('href', url);
      link.setAttribute('download', fileName);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast.success(`Downloaded ${fieldRequests.length} field requests`);
    } catch (error: any) {
      console.error('Error downloading field requests:', error);
      toast.error('Failed to download field requests');
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
          status: 'needed',
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

  // Helper function to parse length for sorting
  function parseLengthForSorting(length: string | null): number {
    if (!length) return 999999; // Put items without length at the end
    
    // Extract numeric value from common length formats
    // Examples: "12'", "8' 6\"", "16 ft", "4x4", "1/4\""
    const cleaned = length.toLowerCase().replace(/[^0-9.'"x/\s-]/g, '');
    
    // Try to match feet and inches pattern (e.g., "12' 6\"" or "12'")
    const feetInchMatch = cleaned.match(/(\d+)\s*'\s*(\d+)?/);
    if (feetInchMatch) {
      const feet = parseInt(feetInchMatch[1]) || 0;
      const inches = parseInt(feetInchMatch[2]) || 0;
      return feet * 12 + inches; // Convert to total inches
    }
    
    // Try to match dimension pattern (e.g., "4x4", "2x6")
    const dimensionMatch = cleaned.match(/(\d+)\s*x\s*(\d+)/);
    if (dimensionMatch) {
      const dim1 = parseInt(dimensionMatch[1]) || 0;
      const dim2 = parseInt(dimensionMatch[2]) || 0;
      return dim1 * dim2; // Sort by area
    }
    
    // Try to match fraction pattern (e.g., "1/4\"", "3/8\"")
    const fractionMatch = cleaned.match(/(\d+)\/(\d+)/);
    if (fractionMatch) {
      const numerator = parseInt(fractionMatch[1]) || 0;
      const denominator = parseInt(fractionMatch[2]) || 1;
      return numerator / denominator; // Convert to decimal
    }
    
    // Try to extract any number
    const numberMatch = cleaned.match(/\d+/);
    if (numberMatch) {
      return parseInt(numberMatch[0]);
    }
    
    return 999999; // Unparseable lengths go to the end
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
  }).sort((a, b) => {
    // Sort by length (shortest to longest)
    const lengthA = parseLengthForSorting(a.part_length);
    const lengthB = parseLengthForSorting(b.part_length);
    return lengthA - lengthB;
  });

  return (
    <div className="space-y-4">
      {/* Custom Material Button - Top */}
      <Button
        onClick={() => setShowCustomMaterialDialog(true)}
        variant="outline"
        className="w-full h-12 border-2 border-slate-300 bg-white hover:bg-slate-50 text-green-900 font-bold"
      >
        <Plus className="w-5 h-5 mr-2" />
        Add Custom Material
      </Button>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search materials by name or SKU..."
          value={catalogSearch}
          onChange={(e) => setCatalogSearch(e.target.value)}
          className="pl-10 h-12 text-base border-2 border-slate-300"
          autoFocus
        />
      </div>

      {/* Category Filter - Always Visible */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        <Button
          variant={catalogCategory === null ? "default" : "outline"}
          size="sm"
          onClick={() => setCatalogCategory(null)}
          className={`whitespace-nowrap flex-shrink-0 font-semibold ${
            catalogCategory === null 
              ? 'bg-green-900 hover:bg-green-800 text-white' 
              : 'border-slate-300 text-green-900 hover:bg-slate-100'
          }`}
        >
          All
        </Button>
        {catalogCategories.map(cat => (
          <Button
            key={cat}
            variant={catalogCategory === cat ? "default" : "outline"}
            size="sm"
            onClick={() => setCatalogCategory(cat)}
            className={`whitespace-nowrap flex-shrink-0 font-semibold ${
              catalogCategory === cat 
                ? 'bg-green-900 hover:bg-green-800 text-white' 
                : 'border-slate-300 text-green-900 hover:bg-slate-100'
            }`}
          >
            {cat}
          </Button>
        ))}
      </div>

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
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Search className="w-4 h-4" />
                Results ({filteredCatalogMaterials.length})
              </div>
              <span className="text-xs text-muted-foreground font-normal">Sorted by length</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {filteredCatalogMaterials.map(material => (
                <div
                  key={material.sku}
                  className="flex items-center justify-between gap-3 p-3 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex-1 min-w-0 flex items-center gap-3">
                    <div className="flex-1">
                      <h4 className="font-medium text-sm leading-tight">{material.material_name}</h4>
                    </div>
                    <div className="flex-shrink-0 text-right">
                      {material.part_length ? (
                        <span className="text-base font-bold text-primary">
                          {cleanMaterialValue(material.part_length)}
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground italic">No length</span>
                      )}
                    </div>
                  </div>
                  <Button
                    onClick={() => openAddMaterialDialog(material)}
                    size="sm"
                    className="flex-shrink-0 h-8"
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
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
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <CardTitle className="text-base flex items-center gap-2">
                  <Package className="w-5 h-5 text-orange-700" />
                  Your Orders ({fieldRequests.length})
                </CardTitle>
                <p className="text-sm text-orange-700 mt-1">
                  Materials you've requested - update status as they move through the workflow
                </p>
              </div>
              <Button
                onClick={downloadFieldRequests}
                variant="outline"
                size="sm"
                className="gap-2 border-orange-300 hover:bg-orange-100"
              >
                <Download className="w-4 h-4" />
                Export
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-orange-200">
              {fieldRequests.map(material => {
                const isExpanded = expandedRequestIds.has(material.id);
                return (
                  <div
                    key={material.id}
                    className="bg-white hover:bg-orange-50/50 transition-colors"
                  >
                    {/* Compact View - Always Visible */}
                    <div
                      className="p-4 cursor-pointer"
                      onClick={() => toggleRequestExpanded(material.id)}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2 flex-wrap mb-2">
                            <h4 className="font-semibold text-base">{material.name}</h4>
                            {material.length && (
                              <span className="text-sm text-muted-foreground">
                                {cleanMaterialValue(material.length)}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className="text-xs font-semibold">
                              Qty: {material.quantity}
                            </Badge>
                            <Badge
                              variant="outline"
                              className={getStatusColor(material.status) + " text-xs font-semibold"}
                            >
                              {getStatusLabel(material.status)}
                            </Badge>
                          </div>
                        </div>
                        <div className="flex-shrink-0">
                          {isExpanded ? (
                            <ChevronDown className="w-5 h-5 text-orange-700" />
                          ) : (
                            <ChevronRight className="w-5 h-5 text-orange-700" />
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Expanded Details - Show on tap */}
                    {isExpanded && (
                      <div className="px-4 pb-4 space-y-3 border-t border-orange-200 bg-white">
                        {/* Additional Info */}
                        <div className="space-y-1 text-sm">
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="text-xs">
                              {material.category_name}
                            </Badge>
                            <Badge variant="outline" className="text-xs bg-orange-50 text-orange-700 border-orange-300">
                              🔧 Field Request
                            </Badge>
                          </div>
                          {material.use_case && (
                            <p className="text-sm text-muted-foreground">
                              Use: {material.use_case}
                            </p>
                          )}
                          {material.notes && (
                            <p className="text-xs text-muted-foreground">
                              Notes: {material.notes}
                            </p>
                          )}
                          {material.order_requested_at && (
                            <p className="text-xs text-muted-foreground">
                              Ordered: {new Date(material.order_requested_at).toLocaleString()}
                            </p>
                          )}
                        </div>

                        {/* Status Selector */}
                        <div className="pt-2">
                          <Label className="text-xs font-semibold text-orange-900 mb-2 block">
                            Update Status
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
                    )}
                  </div>
                );
              })}
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
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5" />
              {showCustomLength ? 'Order Metal Pieces' : 'Add Material to Job'}
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

              {/* Custom Length Input - Multi-piece ordering */}
              {showCustomLength && (
                <div className="space-y-3">
                  {/* Current Piece Input */}
                  <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <Edit className="w-4 h-4 text-blue-700" />
                      <Label className="text-sm font-semibold text-blue-900">
                        {materialPieces.length === 0 ? 'Add First Piece' : 'Add Another Piece'}
                      </Label>
                    </div>
                    
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

                    <div className="space-y-2">
                      <Label htmlFor="quantity" className="text-xs font-semibold text-blue-900">Quantity</Label>
                      <Input
                        id="quantity"
                        type="number"
                        min="1"
                        value={addMaterialQuantity}
                        onChange={(e) => setAddMaterialQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                        className="h-11 text-lg font-bold border-blue-300 bg-white"
                        placeholder="1"
                      />
                    </div>

                    {(customLengthFeet > 0 || customLengthInches > 0) && selectedCatalogMaterial.purchase_cost && (
                      <div className="bg-white border-2 border-green-500 rounded p-3">
                        <p className="text-xs font-semibold text-green-900 mb-1">Cost:</p>
                        <p className="text-sm text-green-800">
                          {addMaterialQuantity}x {customLengthFeet > 0 && `${customLengthFeet}'`}{customLengthInches > 0 && ` ${customLengthInches}"`}
                          {' '}= <span className="font-bold text-green-700">
                            ${((customLengthFeet + customLengthInches / 12) * selectedCatalogMaterial.purchase_cost * addMaterialQuantity).toFixed(2)}
                          </span>
                        </p>
                      </div>
                    )}

                    <Button
                      onClick={addPieceToList}
                      disabled={(customLengthFeet === 0 && customLengthInches === 0) || addMaterialQuantity <= 0}
                      className="w-full h-11 bg-blue-600 hover:bg-blue-700"
                      type="button"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Add This Piece to Order
                    </Button>
                  </div>

                  {/* List of Added Pieces */}
                  {materialPieces.length > 0 && (
                    <div className="bg-green-50 border-2 border-green-200 rounded-lg p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-semibold text-green-900">Order Summary</Label>
                        <Badge className="bg-green-700 text-white">
                          {getTotalPiecesCount()} pieces
                        </Badge>
                      </div>
                      
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {materialPieces.map((piece, index) => (
                          <div key={index} className="flex items-center justify-between bg-white rounded p-3 border border-green-300">
                            <div className="flex-1">
                              <p className="font-bold text-green-900">
                                {piece.quantity}x {piece.displayLength}
                              </p>
                              <p className="text-xs text-green-700">
                                ${piece.costPerPiece.toFixed(2)} each = ${(piece.costPerPiece * piece.quantity).toFixed(2)}
                              </p>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => removePiece(index)}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              type="button"
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        ))}
                      </div>

                      <div className="bg-white border-2 border-green-500 rounded p-3">
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-green-900">Total Order:</span>
                          <span className="text-xl font-bold text-green-700">
                            ${getTotalCost().toFixed(2)}
                          </span>
                        </div>
                        <p className="text-xs text-green-700 mt-1">
                          {getTotalPiecesCount()} total pieces • {materialPieces.length} different {materialPieces.length === 1 ? 'length' : 'lengths'}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Multi-Variant Selection (for materials with multiple lengths) */}
              {!showCustomLength && materialVariants.length > 1 && (
                <div className="space-y-3">
                  <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Package className="w-4 h-4 text-blue-700" />
                      <Label className="text-sm font-semibold text-blue-900">
                        Select Lengths & Quantities
                      </Label>
                    </div>
                    <p className="text-xs text-blue-700 mb-3">
                      Found {materialVariants.length} available lengths for this material. Select all you need:
                    </p>
                    
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {materialVariants.map((variant) => {
                        const quantity = selectedVariants.get(variant.sku) || 0;
                        const cost = (variant.purchaseCost || 0) * quantity;
                        
                        return (
                          <div
                            key={variant.sku}
                            className={`bg-white rounded-lg p-3 border-2 transition-all ${
                              quantity > 0
                                ? 'border-green-500 bg-green-50'
                                : 'border-slate-300 hover:border-blue-400'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div className="flex-1">
                                <p className="font-bold text-green-900">
                                  {variant.length}
                                </p>
                                {variant.purchaseCost > 0 && (
                                  <p className="text-xs text-green-700">
                                    ${variant.purchaseCost.toFixed(2)} each
                                  </p>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => updateVariantQuantity(variant.sku, Math.max(0, quantity - 1))}
                                  disabled={quantity === 0}
                                  className="h-8 w-8 p-0 rounded-none"
                                >
                                  -
                                </Button>
                                <Input
                                  type="number"
                                  min="0"
                                  value={quantity}
                                  onChange={(e) => updateVariantQuantity(variant.sku, Math.max(0, parseInt(e.target.value) || 0))}
                                  className="h-8 w-16 text-center font-bold rounded-none"
                                />
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => updateVariantQuantity(variant.sku, quantity + 1)}
                                  className="h-8 w-8 p-0 rounded-none"
                                >
                                  +
                                </Button>
                              </div>
                            </div>
                            {quantity > 0 && cost > 0 && (
                              <p className="text-xs text-green-700 mt-1 text-right">
                                Subtotal: ${cost.toFixed(2)}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    
                    {selectedVariants.size > 0 && (
                      <div className="bg-white border-2 border-green-500 rounded p-3 mt-3">
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-green-900">Total Order:</span>
                          <span className="text-xl font-bold text-green-700">
                            {getTotalVariantsCost() > 0 ? `$${getTotalVariantsCost().toFixed(2)}` : '-'}
                          </span>
                        </div>
                        <p className="text-xs text-green-700 mt-1">
                          {getTotalVariantsCount()} total pieces • {selectedVariants.size} different {selectedVariants.size === 1 ? 'length' : 'lengths'}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}
              
              {/* Standard material quantity (single variant or no variants) */}
              {!showCustomLength && materialVariants.length <= 1 && (
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
                </div>
              )}

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

              {!showCustomLength && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-sm text-blue-900 font-semibold mb-1">
                    📋 Field Request Process:
                  </p>
                  <ul className="text-xs text-blue-800 space-y-1 ml-4 list-disc">
                    <li>Added to "Field Requests" category</li>
                    <li>Marked as "Needed" - office will be notified</li>
                    <li>Tracked separately for job cost tracking</li>
                    <li>Your name will be recorded as requester</li>
                  </ul>
                </div>
              )}

              {showCustomLength && materialPieces.length > 0 && (
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                  <p className="text-sm text-purple-900 font-semibold mb-1">
                    ✓ Ready to Submit
                  </p>
                  <p className="text-xs text-purple-800">
                    Each piece will be created as a separate material entry for accurate tracking and inventory management.
                  </p>
                </div>
              )}

              <div className="flex flex-col gap-3 pt-4 border-t">
                <Button
                  onClick={addMaterialToJob}
                  disabled={addingMaterial || (showCustomLength && materialPieces.length === 0) || (!showCustomLength && materialVariants.length > 0 && selectedVariants.size === 0)}
                  className="h-12"
                >
                  {addingMaterial ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                      Submitting...
                    </>
                  ) : showCustomLength ? (
                    <>
                      <Package className="w-5 h-5 mr-2" />
                      Submit Order ({getTotalPiecesCount()} {getTotalPiecesCount() === 1 ? 'piece' : 'pieces'})
                    </>
                  ) : materialVariants.length > 1 ? (
                    <>
                      <Package className="w-5 h-5 mr-2" />
                      Submit Order ({getTotalVariantsCount()} {getTotalVariantsCount() === 1 ? 'piece' : 'pieces'})
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
                placeholder='e.g., 12&apos;, 6x6, 1/4"...'
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
                <li>Marked as "Needed" - office will be notified</li>
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
