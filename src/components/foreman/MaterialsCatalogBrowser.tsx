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
import { Database, Search, Plus, Package, Edit, Camera, ChevronDown, ChevronRight, Download, X, Trash2 } from 'lucide-react';
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
  unit_price: number | null;
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
];

function getStatusColor(status: string) {
  return STATUS_OPTIONS.find(s => s.value === status)?.color || 'bg-gray-100 text-gray-700 border-gray-300';
}

function getStatusLabel(status: string) {
  return STATUS_OPTIONS.find(s => s.value === status)?.label || status;
}

export function MaterialsCatalogBrowser({ job, userId, onMaterialAdded }: MaterialsCatalogBrowserProps) {
  const [catalogMaterials, setCatalogMaterials] = useState<CatalogMaterial[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogCategory, setCatalogCategory] = useState<string | null>(null);
  const [catalogCategories, setCatalogCategories] = useState<string[]>([]);
  const [showAddMaterialDialog, setShowAddMaterialDialog] = useState(false);
  const [selectedCatalogMaterial, setSelectedCatalogMaterial] = useState<CatalogMaterial | null>(null);
  const [addMaterialQuantity, setAddMaterialQuantity] = useState<number | ''>('');
  const [addMaterialNotes, setAddMaterialNotes] = useState('');
  const [addMaterialColor, setAddMaterialColor] = useState('');
  const [materialIsExtra, setMaterialIsExtra] = useState(false);
  const [addingMaterial, setAddingMaterial] = useState(false);
  const [customLengthFeet, setCustomLengthFeet] = useState<number | ''>('');
  const [customLengthInches, setCustomLengthInches] = useState<number | ''>('');
  const [showCustomLength, setShowCustomLength] = useState(false);
  const [fieldRequests, setFieldRequests] = useState<FieldRequestMaterial[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [materialPieces, setMaterialPieces] = useState<MaterialPiece[]>([]);
  const [materialVariants, setMaterialVariants] = useState<MaterialVariant[]>([]);
  const [selectedVariants, setSelectedVariants] = useState<Map<string, number>>(new Map());
  
  // Edit material state
  const [editingMaterial, setEditingMaterial] = useState<FieldRequestMaterial | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editName, setEditName] = useState('');
  const [editQuantity, setEditQuantity] = useState<number | ''>('');
  const [editLength, setEditLength] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  
  // Custom material state
  const [showCustomMaterialDialog, setShowCustomMaterialDialog] = useState(false);
  const [customMaterialName, setCustomMaterialName] = useState('');
  const [customMaterialQuantity, setCustomMaterialQuantity] = useState<number | ''>('');
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
      
      const { data, error } = await supabase
        .from('materials_catalog')
        .select('sku, material_name, category, part_length, unit_price, purchase_cost')
        .order('material_name', { ascending: true });

      if (error) throw error;

      setCatalogMaterials(data || []);

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

      await loadFieldRequests();
    } catch (error: any) {
      console.error('Error updating material status:', error);
      toast.error('Failed to update status');
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
    setAddMaterialQuantity('');
    setAddMaterialNotes('');
    setAddMaterialColor('');
    setMaterialIsExtra(false);
    setCustomLengthFeet('');
    setCustomLengthInches('');
    setMaterialPieces([]);
    setSelectedVariants(new Map());
    
    const hasPreDefinedLength = material.part_length && material.part_length.trim() !== '';
    setShowCustomLength(!hasPreDefinedLength);
    
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
  
  function extractBaseMaterialName(name: string): string {
    return name
      .replace(/\d+['"]?\s*x?\s*\d*['"]?/gi, '')
      .replace(/\d+\s*ft/gi, '')
      .replace(/\d+\s*inch/gi, '')
      .replace(/[\d\/]+"/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function addPieceToList() {
    if (!selectedCatalogMaterial) return;
    
    const feet = typeof customLengthFeet === 'number' ? customLengthFeet : 0;
    const inches = typeof customLengthInches === 'number' ? customLengthInches : 0;
    const totalFeet = feet + (inches / 12);
    
    if (totalFeet <= 0) {
      toast.error('Please specify a length greater than 0');
      return;
    }

    const qty = typeof addMaterialQuantity === 'number' ? addMaterialQuantity : 0;
    if (qty <= 0) {
      toast.error('Quantity must be greater than 0');
      return;
    }

    const displayFeet = Math.floor(totalFeet);
    const displayInches = Math.round((totalFeet - displayFeet) * 12);
    const displayLength = displayInches > 0 ? `${displayFeet}' ${displayInches}\"` : `${displayFeet}'`;

    const pricePerFoot = selectedCatalogMaterial.purchase_cost || 0;
    const costPerPiece = pricePerFoot * totalFeet;

    const newPiece: MaterialPiece = {
      lengthFeet: feet,
      lengthInches: inches,
      quantity: qty,
      displayLength,
      costPerPiece,
    };

    setMaterialPieces([...materialPieces, newPiece]);
    
    setCustomLengthFeet('');
    setCustomLengthInches('');
    setAddMaterialQuantity('');
    
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

    if (showCustomLength && materialPieces.length === 0) {
      toast.error('Please add at least one piece to your order');
      return;
    }
    
    if (!showCustomLength && materialVariants.length > 0 && selectedVariants.size === 0) {
      toast.error('Please select at least one length with quantity');
      return;
    }

    setAddingMaterial(true);

    try {
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

      if (showCustomLength) {
        const materialsToInsert = materialPieces.map(piece => ({
          category_id: categoryId,
          job_id: job.id,
          name: selectedCatalogMaterial.material_name,
          quantity: piece.quantity,
          length: piece.displayLength,
          color: addMaterialColor.trim() || null,
          status: 'not_ordered' as const,
          notes: addMaterialNotes || `Requested from field (SKU: ${selectedCatalogMaterial.sku})`,
          created_by: userId,
          ordered_by: userId,
          order_requested_at: new Date().toISOString(),
          import_source: 'field_catalog',
          is_extra: materialIsExtra,
          unit_cost: piece.costPerPiece,
          total_cost: piece.costPerPiece * piece.quantity,
        }));

        const { error: materialError } = await supabase
          .from('materials')
          .insert(materialsToInsert);

        if (materialError) throw materialError;

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
            color: addMaterialColor.trim() || null,
            status: 'not_ordered',
            notes: addMaterialNotes || `Requested from field (SKU: ${catalogMaterial.sku})`,
            created_by: userId,
            ordered_by: userId,
            order_requested_at: new Date().toISOString(),
            import_source: 'field_catalog',
            is_extra: materialIsExtra,
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
        const qty = typeof addMaterialQuantity === 'number' ? addMaterialQuantity : 1;
        const unit_cost = selectedCatalogMaterial.purchase_cost || 0;
        const total_cost = unit_cost * qty;

        const { error: materialError } = await supabase
          .from('materials')
          .insert({
            category_id: categoryId,
            job_id: job.id,
            name: selectedCatalogMaterial.material_name,
            quantity: qty,
            length: selectedCatalogMaterial.part_length || null,
            color: addMaterialColor.trim() || null,
            status: 'not_ordered',
            notes: addMaterialNotes || `Requested from field (SKU: ${selectedCatalogMaterial.sku})`,
            created_by: userId,
            ordered_by: userId,
            order_requested_at: new Date().toISOString(),
            import_source: 'field_catalog',
            is_extra: materialIsExtra,
            unit_cost,
            total_cost,
          });

        if (materialError) throw materialError;

        await createNotification({
          jobId: job.id,
          createdBy: userId,
          type: 'material_request',
          brief: `Field request: ${selectedCatalogMaterial.material_name} (Qty: ${qty})`,
          referenceData: {
            materialName: selectedCatalogMaterial.material_name,
            sku: selectedCatalogMaterial.sku,
            quantity: qty,
            notes: addMaterialNotes,
          },
        });

        toast.success('Material request sent to office');
      }

      setShowAddMaterialDialog(false);
      setSelectedCatalogMaterial(null);
      
      await loadFieldRequests();
      
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

      const qty = typeof customMaterialQuantity === 'number' ? customMaterialQuantity : 1;

      const { data: materialData, error: materialError } = await supabase
        .from('materials')
        .insert({
          category_id: categoryId,
          job_id: job.id,
          name: customMaterialName,
          quantity: qty,
          length: customMaterialLength || null,
          status: 'not_ordered',
          notes: customMaterialNotes || 'Custom material added from field',
          created_by: userId,
          ordered_by: userId,
          order_requested_at: new Date().toISOString(),
          import_source: 'field_custom',
          is_extra: false,
          unit_cost: 0,
          total_cost: 0,
        })
        .select()
        .single();

      if (materialError) throw materialError;

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
          const { data: urlData } = supabase.storage
            .from('job-files')
            .getPublicUrl(filePath);

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

      await createNotification({
        jobId: job.id,
        createdBy: userId,
        type: 'material_request',
        brief: `Custom material request: ${customMaterialName} (Qty: ${qty})`,
        referenceId: materialData?.id || null,
        referenceData: {
          materialName: customMaterialName,
          quantity: qty,
          notes: customMaterialNotes,
          hasPhoto: !!customMaterialPhoto,
        },
      });

      toast.success('Custom material added successfully');
      setShowCustomMaterialDialog(false);
      
      setCustomMaterialName('');
      setCustomMaterialQuantity('');
      setCustomMaterialLength('');
      setCustomMaterialNotes('');
      setCustomMaterialPhoto(null);
      setPhotoPreview(null);
      
      await loadFieldRequests();
      
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

  function parseLengthForSorting(length: string | null): number {
    if (!length) return 999999;
    
    const cleaned = length.toLowerCase().replace(/[^0-9.'"x/\s-]/g, '');
    
    const feetInchMatch = cleaned.match(/(\d+)\s*'\s*(\d+)?/);
    if (feetInchMatch) {
      const feet = parseInt(feetInchMatch[1]) || 0;
      const inches = parseInt(feetInchMatch[2]) || 0;
      return feet * 12 + inches;
    }
    
    const dimensionMatch = cleaned.match(/(\d+)\s*x\s*(\d+)/);
    if (dimensionMatch) {
      const dim1 = parseInt(dimensionMatch[1]) || 0;
      const dim2 = parseInt(dimensionMatch[2]) || 0;
      return dim1 * dim2;
    }
    
    const fractionMatch = cleaned.match(/(\d+)\/(\d+)/);
    if (fractionMatch) {
      const numerator = parseInt(fractionMatch[1]) || 0;
      const denominator = parseInt(fractionMatch[2]) || 1;
      return numerator / denominator;
    }
    
    const numberMatch = cleaned.match(/\d+/);
    if (numberMatch) {
      return parseInt(numberMatch[0]);
    }
    
    return 999999;
  }

  const filteredCatalogMaterials = catalogMaterials.filter(m => {
    if (catalogCategory && cleanCatalogCategory(m.category) !== catalogCategory) {
      return false;
    }
    
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
    const lengthA = parseLengthForSorting(a.part_length);
    const lengthB = parseLengthForSorting(b.part_length);
    return lengthA - lengthB;
  });

  return (
    <div className="space-y-3 sm:space-y-4">
      <Button
        onClick={() => setShowCustomMaterialDialog(true)}
        variant="outline"
        className="w-full h-14 sm:h-12 border-2 border-slate-300 bg-white hover:bg-slate-50 text-green-900 font-bold text-base"
      >
        <Plus className="w-5 h-5 mr-2" />
        Add Custom Material
      </Button>

      <div className="relative">
        <Search className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 w-5 h-5 sm:w-4 sm:h-4 text-muted-foreground" />
        <Input
          placeholder="Search materials..."
          value={catalogSearch}
          onChange={(e) => setCatalogSearch(e.target.value)}
          className="pl-11 sm:pl-10 h-14 sm:h-12 text-base sm:text-base border-2 border-slate-300"
          autoFocus
        />
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
        <Button
          variant={catalogCategory === null ? "default" : "outline"}
          size="sm"
          onClick={() => setCatalogCategory(null)}
          className={`whitespace-nowrap flex-shrink-0 font-semibold h-11 px-4 text-sm ${
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
            className={`whitespace-nowrap flex-shrink-0 font-semibold h-11 px-4 text-sm ${
              catalogCategory === cat 
                ? 'bg-green-900 hover:bg-green-800 text-white' 
                : 'border-slate-300 text-green-900 hover:bg-slate-100'
            }`}
          >
            {cat}
          </Button>
        ))}
      </div>

      {catalogSearch && catalogLoading ? (
        <Card>
          <CardContent className="py-12 text-center">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-sm sm:text-base text-muted-foreground">Loading catalog...</p>
          </CardContent>
        </Card>
      ) : catalogSearch && filteredCatalogMaterials.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Package className="w-16 h-16 mx-auto mb-4 opacity-50" />
            <p className="text-sm sm:text-base">No materials found matching "{catalogSearch}"</p>
          </CardContent>
        </Card>
      ) : catalogSearch ? (
        <Card className="overflow-hidden">
          <CardHeader className="pb-2 px-3 sm:px-6">
            <CardTitle className="text-sm sm:text-base flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Search className="w-4 h-4" />
                Results ({filteredCatalogMaterials.length})
              </div>
              <span className="text-xs text-muted-foreground font-normal hidden sm:inline">Sorted by length</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y overflow-x-hidden">
              {filteredCatalogMaterials.map(material => (
                <div
                  key={material.sku}
                  className="flex items-start gap-2 p-3 sm:p-4 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex-1 min-w-0 space-y-1">
                    <h4 className="font-medium text-sm sm:text-base leading-tight break-words pr-2">{material.material_name}</h4>
                    {material.part_length && (
                      <div className="text-base sm:text-lg font-bold text-primary">
                        {cleanMaterialValue(material.part_length)}
                      </div>
                    )}
                  </div>
                  <Button
                    onClick={() => openAddMaterialDialog(material)}
                    size="sm"
                    className="flex-shrink-0 h-11 w-11 sm:h-10 sm:w-auto sm:px-4 p-0"
                  >
                    <Plus className="w-5 h-5 sm:w-4 sm:h-4" />
                    <span className="hidden sm:inline ml-2">Add</span>
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {loadingRequests ? (
        <Card>
          <CardContent className="py-8 text-center">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-sm sm:text-base text-muted-foreground">Loading your orders...</p>
          </CardContent>
        </Card>
      ) : fieldRequests.length > 0 ? (
        <Card className="border-2 border-orange-200 bg-orange-50 overflow-hidden">
          <CardHeader className="pb-3 px-3 sm:px-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                  <Package className="w-5 h-5 text-orange-700" />
                  Your Orders ({fieldRequests.length})
                </CardTitle>
                <p className="text-xs sm:text-sm text-orange-700 mt-1">
                  Materials you've requested - update status as they move through the workflow
                </p>
              </div>
              <Button
                onClick={downloadFieldRequests}
                variant="outline"
                size="sm"
                className="gap-2 border-orange-300 hover:bg-orange-100 h-11 px-4 w-full sm:w-auto"
              >
                <Download className="w-4 h-4" />
                <span>Export</span>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0 overflow-x-hidden">
            <div className="divide-y divide-orange-200">
              {fieldRequests.map(material => {
                const isExpanded = expandedRequestIds.has(material.id);
                return (
                  <div
                    key={material.id}
                    className="bg-white hover:bg-orange-50/50 transition-colors"
                  >
                    <div
                      className="p-3 sm:p-4 cursor-pointer"
                      onClick={() => toggleRequestExpanded(material.id)}
                    >
                      <div className="flex items-start gap-2 sm:gap-3">
                        <div className="flex-1 min-w-0 space-y-2">
                          <div className="space-y-1">
                            <h4 className="font-semibold text-base sm:text-lg leading-tight break-words">{material.name}</h4>
                            {material.length && (
                              <div className="text-xs sm:text-sm text-muted-foreground">
                                {cleanMaterialValue(material.length)}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap">
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
                            <ChevronDown className="w-6 h-6 sm:w-5 sm:h-5 text-orange-700" />
                          ) : (
                            <ChevronRight className="w-6 h-6 sm:w-5 sm:h-5 text-orange-700" />
                          )}
                        </div>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="px-3 sm:px-4 pb-3 sm:pb-4 space-y-3 border-t border-orange-200 bg-white overflow-x-hidden">
                        <div className="space-y-1.5 text-sm">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Badge variant="secondary" className="text-xs">
                              {material.category_name}
                            </Badge>
                            <Badge variant="outline" className="text-xs bg-orange-50 text-orange-700 border-orange-300">
                              🔧 Field Request
                            </Badge>
                          </div>
                          {material.use_case && (
                            <p className="text-xs sm:text-sm text-muted-foreground break-words">
                              Use: {material.use_case}
                            </p>
                          )}
                          {material.notes && (
                            <p className="text-xs text-muted-foreground break-words">
                              Notes: {material.notes}
                            </p>
                          )}
                          {material.order_requested_at && (
                            <p className="text-xs text-muted-foreground">
                              Ordered: {new Date(material.order_requested_at).toLocaleDateString()}
                            </p>
                          )}
                        </div>

                        <div className="flex flex-col sm:flex-row gap-2 pt-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingMaterial(material);
                              setEditName(material.name);
                              setEditQuantity(material.quantity);
                              setEditLength(material.length || '');
                              setEditNotes(material.notes || '');
                              setShowEditDialog(true);
                            }}
                            className="flex-1 h-11"
                          >
                            <Edit className="w-4 h-4 mr-2" />
                            Edit
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (!confirm('Delete this material request?')) return;
                              try {
                                const { error } = await supabase
                                  .from('materials')
                                  .delete()
                                  .eq('id', material.id);
                                if (error) throw error;
                                toast.success('Material deleted');
                                loadFieldRequests();
                                if (onMaterialAdded) onMaterialAdded();
                              } catch (error: any) {
                                console.error('Error deleting material:', error);
                                toast.error('Failed to delete material');
                              }
                            }}
                            className="flex-1 h-11"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete
                          </Button>
                        </div>
                        
                        <div className="pt-2">
                          <Label className="text-xs sm:text-sm font-semibold text-orange-900 mb-2 block">
                            Update Status
                          </Label>
                          <Select
                            value={material.status}
                            onValueChange={(newStatus) => updateMaterialStatus(material.id, newStatus as FieldRequestMaterial['status'])}
                          >
                            <SelectTrigger className={`w-full h-12 sm:h-11 font-semibold border-2 text-sm ${getStatusColor(material.status)}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {STATUS_OPTIONS.map(opt => (
                                <SelectItem key={opt.value} value={opt.value}>
                                  <span className={`inline-flex items-center px-3 py-1.5 rounded font-semibold text-xs sm:text-sm ${opt.color}`}>
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

      {/* Edit Material Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Material Request</DialogTitle>
          </DialogHeader>
          {editingMaterial && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Material Name *</Label>
                <Input
                  id="edit-name"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="h-10"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-quantity">Quantity *</Label>
                  <Input
                    id="edit-quantity"
                    type="number"
                    min="0"
                    value={editQuantity}
                    onChange={(e) => setEditQuantity(e.target.value === '' ? '' : Math.max(0, parseFloat(e.target.value) || 0))}
                    className="h-10"
                    placeholder="0"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-length">Length</Label>
                  <Input
                    id="edit-length"
                    value={editLength}
                    onChange={(e) => setEditLength(e.target.value)}
                    className="h-10"
                    placeholder="e.g., 12'"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-notes">Notes</Label>
                <Textarea
                  id="edit-notes"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  rows={3}
                />
              </div>

              <div className="flex gap-2 pt-4">
                <Button
                  onClick={async () => {
                    if (!editName.trim() || editQuantity === '' || editQuantity <= 0) {
                      toast.error('Please enter valid name and quantity');
                      return;
                    }
                    setSavingEdit(true);
                    try {
                      const { error } = await supabase
                        .from('materials')
                        .update({
                          name: editName.trim(),
                          quantity: editQuantity,
                          length: editLength.trim() || null,
                          notes: editNotes.trim() || null,
                          updated_at: new Date().toISOString(),
                        })
                        .eq('id', editingMaterial.id);

                      if (error) throw error;
                      toast.success('Material updated');
                      setShowEditDialog(false);
                      loadFieldRequests();
                      if (onMaterialAdded) onMaterialAdded();
                    } catch (error: any) {
                      console.error('Error updating material:', error);
                      toast.error('Failed to update material');
                    } finally {
                      setSavingEdit(false);
                    }
                  }}
                  disabled={savingEdit}
                  className="flex-1"
                >
                  {savingEdit ? 'Saving...' : 'Save Changes'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowEditDialog(false)}
                  disabled={savingEdit}
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
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5" />
              Add Custom Material
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="custom-name">Material Name *</Label>
              <Input
                id="custom-name"
                value={customMaterialName}
                onChange={(e) => setCustomMaterialName(e.target.value)}
                placeholder="e.g., Special fasteners"
                className="h-10"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="custom-quantity">Quantity</Label>
                <Input
                  id="custom-quantity"
                  type="number"
                  min="1"
                  value={customMaterialQuantity}
                  onChange={(e) => setCustomMaterialQuantity(e.target.value === '' ? '' : Math.max(1, parseFloat(e.target.value) || 1))}
                  placeholder="1"
                  className="h-10"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="custom-length">Length (optional)</Label>
                <Input
                  id="custom-length"
                  value={customMaterialLength}
                  onChange={(e) => setCustomMaterialLength(e.target.value)}
                  placeholder="e.g., 12'"
                  className="h-10"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="custom-notes">Notes</Label>
              <Textarea
                id="custom-notes"
                value={customMaterialNotes}
                onChange={(e) => setCustomMaterialNotes(e.target.value)}
                placeholder="Any additional details..."
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="custom-photo">Photo (optional)</Label>
              <Input
                id="custom-photo"
                type="file"
                accept="image/*"
                onChange={handlePhotoChange}
                className="h-10 cursor-pointer"
              />
              {photoPreview && (
                <div className="relative w-full h-40 rounded-lg overflow-hidden border-2 border-green-500">
                  <img
                    src={photoPreview}
                    alt="Preview"
                    className="w-full h-full object-cover"
                  />
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => {
                      setCustomMaterialPhoto(null);
                      setPhotoPreview(null);
                    }}
                    className="absolute top-2 right-2"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-4">
              <Button
                onClick={addCustomMaterial}
                disabled={addingCustomMaterial}
                className="flex-1"
              >
                {addingCustomMaterial ? 'Adding...' : 'Add Material'}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowCustomMaterialDialog(false);
                  setCustomMaterialName('');
                  setCustomMaterialQuantity('');
                  setCustomMaterialLength('');
                  setCustomMaterialNotes('');
                  setCustomMaterialPhoto(null);
                  setPhotoPreview(null);
                }}
                disabled={addingCustomMaterial}
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Material from Catalog Dialog - Mobile Optimized */}
      <Dialog open={showAddMaterialDialog} onOpenChange={setShowAddMaterialDialog}>
        <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto p-3 sm:p-6">
          <DialogHeader className="space-y-2">
            <DialogTitle className="flex items-start gap-2 text-base sm:text-lg leading-tight">
              <Package className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <span className="break-words">{selectedCatalogMaterial?.material_name}</span>
            </DialogTitle>
          </DialogHeader>
          {selectedCatalogMaterial && (
            <div className="space-y-3 sm:space-y-4">
              {/* Material Info */}
              <div className="bg-muted/50 p-2 sm:p-3 rounded-lg">
                <div className="font-semibold text-sm sm:text-base break-words">{selectedCatalogMaterial.material_name}</div>
                <div className="text-xs sm:text-sm text-muted-foreground mt-1">SKU: {selectedCatalogMaterial.sku}</div>
                {selectedCatalogMaterial.part_length && (
                  <div className="text-xs sm:text-sm text-muted-foreground">
                    Length: {cleanMaterialValue(selectedCatalogMaterial.part_length)}
                  </div>
                )}
                {selectedCatalogMaterial.purchase_cost && (
                  <div className="text-sm font-semibold text-green-700 mt-1">
                    ${selectedCatalogMaterial.purchase_cost.toFixed(2)} per unit
                  </div>
                )}
              </div>

              {/* Custom Length Section */}
              {showCustomLength && (
                <div className="space-y-3 sm:space-y-4 border-2 border-blue-200 bg-blue-50 p-3 sm:p-4 rounded-lg">
                  <h4 className="font-semibold text-blue-900 text-sm sm:text-base">Add Custom Length Pieces</h4>
                  
                  <div className="grid grid-cols-2 gap-2 sm:gap-3">
                    <div className="space-y-1.5 sm:space-y-2">
                      <Label className="text-xs sm:text-sm">Length (Feet)</Label>
                      <Input
                        type="number"
                        min="0"
                        value={customLengthFeet}
                        onChange={(e) => setCustomLengthFeet(e.target.value === '' ? '' : Math.max(0, parseFloat(e.target.value) || 0))}
                        placeholder="0"
                        className="h-10 sm:h-11 text-base"
                      />
                    </div>
                    <div className="space-y-1.5 sm:space-y-2">
                      <Label className="text-xs sm:text-sm">Length (Inches)</Label>
                      <Input
                        type="number"
                        min="0"
                        max="11"
                        value={customLengthInches}
                        onChange={(e) => setCustomLengthInches(e.target.value === '' ? '' : Math.max(0, Math.min(11, parseFloat(e.target.value) || 0)))}
                        placeholder="0"
                        className="h-10 sm:h-11 text-base"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5 sm:space-y-2">
                    <Label className="text-xs sm:text-sm">Quantity for this length</Label>
                    <Input
                      type="number"
                      min="1"
                      value={addMaterialQuantity}
                      onChange={(e) => setAddMaterialQuantity(e.target.value === '' ? '' : Math.max(1, parseFloat(e.target.value) || 1))}
                      placeholder="1"
                      className="h-10 sm:h-11 text-base"
                    />
                  </div>

                  <Button
                    onClick={addPieceToList}
                    className="w-full bg-blue-600 hover:bg-blue-700 h-11 sm:h-12 text-sm sm:text-base"
                  >
                    <Plus className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
                    Add Piece to Order
                  </Button>

                  {materialPieces.length > 0 && (
                    <div className="mt-3 sm:mt-4 space-y-2">
                      <h5 className="font-semibold text-blue-900 text-sm sm:text-base">Pieces in Order:</h5>
                      <div className="space-y-2">
                        {materialPieces.map((piece, index) => (
                          <div key={index} className="flex items-center justify-between bg-white p-2 sm:p-3 rounded border">
                            <div className="flex-1 min-w-0">
                              <span className="font-semibold text-sm sm:text-base">{piece.quantity}x</span>
                              <span className="ml-1 sm:ml-2 text-sm sm:text-base">{piece.displayLength}</span>
                              <div className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                                @ ${piece.costPerPiece.toFixed(2)} each
                              </div>
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => removePiece(index)}
                              className="text-destructive flex-shrink-0 h-8 w-8 p-0"
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                      <div className="bg-green-50 border border-green-200 p-2 sm:p-3 rounded">
                        <div className="text-sm sm:text-base font-semibold text-green-900">
                          Total: {getTotalPiecesCount()} pieces • ${getTotalCost().toFixed(2)}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Variant Selection Section */}
              {!showCustomLength && materialVariants.length > 0 && (
                <div className="space-y-3 sm:space-y-4 border-2 border-purple-200 bg-purple-50 p-3 sm:p-4 rounded-lg">
                  <h4 className="font-semibold text-purple-900 text-sm sm:text-base">Select Lengths & Quantities</h4>
                  <p className="text-xs sm:text-sm text-purple-700">Choose the lengths you need and enter quantities for each</p>
                  
                  <div className="space-y-2">
                    {materialVariants.map((variant) => (
                      <div key={variant.sku} className="flex items-center gap-2 sm:gap-3 bg-white p-2 sm:p-3 rounded border">
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-sm sm:text-base">{variant.length}</div>
                          <div className="text-xs sm:text-sm text-muted-foreground">
                            ${variant.purchaseCost.toFixed(2)} per piece
                          </div>
                        </div>
                        <div className="w-20 sm:w-24">
                          <Input
                            type="number"
                            min="0"
                            value={selectedVariants.get(variant.sku) || ''}
                            onChange={(e) => {
                              const qty = e.target.value === '' ? 0 : Math.max(0, parseInt(e.target.value) || 0);
                              updateVariantQuantity(variant.sku, qty);
                            }}
                            placeholder="0"
                            className="h-10 sm:h-11 text-base text-center"
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  {selectedVariants.size > 0 && (
                    <div className="bg-green-50 border border-green-200 p-2 sm:p-3 rounded">
                      <div className="text-sm sm:text-base font-semibold text-green-900">
                        Total: {getTotalVariantsCount()} pieces • ${getTotalVariantsCost().toFixed(2)}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Simple Quantity (fallback for materials without variants or custom length) */}
              {!showCustomLength && materialVariants.length === 0 && (
                <div className="space-y-1.5 sm:space-y-2">
                  <Label className="text-xs sm:text-sm">Quantity</Label>
                  <Input
                    type="number"
                    min="1"
                    value={addMaterialQuantity}
                    onChange={(e) => setAddMaterialQuantity(e.target.value === '' ? '' : Math.max(1, parseFloat(e.target.value) || 1))}
                    placeholder="1"
                    className="h-10 sm:h-11 text-base"
                  />
                </div>
              )}

              {/* Color Field - For Metal, Trim, Fasteners */}
              <div className="space-y-1.5 sm:space-y-2">
                <Label className="text-xs sm:text-sm flex items-center gap-2">
                  Color
                  <Badge variant="outline" className="text-xs">For Metal/Trim/Fasteners</Badge>
                </Label>
                <Input
                  type="text"
                  value={addMaterialColor}
                  onChange={(e) => setAddMaterialColor(e.target.value)}
                  placeholder="e.g., Galvalume, White, Brown"
                  className="h-10 sm:h-11 text-base"
                />
                <p className="text-xs text-muted-foreground">Leave blank if not applicable</p>
              </div>

              {/* Extra Material Checkbox */}
              <div className="space-y-1.5 sm:space-y-2 border-2 border-orange-200 bg-orange-50 p-3 rounded-lg">
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    id="material-is-extra"
                    checked={materialIsExtra}
                    onChange={(e) => setMaterialIsExtra(e.target.checked)}
                    className="mt-1 w-5 h-5 rounded border-orange-300 text-orange-600 focus:ring-orange-500 focus:ring-2 cursor-pointer"
                  />
                  <div className="flex-1">
                    <Label htmlFor="material-is-extra" className="text-sm sm:text-base font-semibold text-orange-900 cursor-pointer">
                      This is EXTRA material (not in original estimate)
                    </Label>
                    <p className="text-xs sm:text-sm text-orange-700 mt-1">
                      Check this box if this material is beyond the original job scope and should be billed separately.
                    </p>
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-1.5 sm:space-y-2">
                <Label className="text-xs sm:text-sm">Notes (optional)</Label>
                <Textarea
                  value={addMaterialNotes}
                  onChange={(e) => setAddMaterialNotes(e.target.value)}
                  placeholder="Any additional notes about this order..."
                  rows={2}
                  className="text-base resize-none"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 pt-3 sm:pt-4 border-t">
                <Button
                  onClick={addMaterialToJob}
                  disabled={addingMaterial}
                  className="flex-1 bg-green-600 hover:bg-green-700 h-11 sm:h-12 text-sm sm:text-base font-semibold"
                >
                  {addingMaterial ? (
                    <>
                      <div className="w-4 h-4 sm:w-5 sm:h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                      Adding...
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
                      Add to Order
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowAddMaterialDialog(false)}
                  disabled={addingMaterial}
                  className="h-11 sm:h-12 text-sm sm:text-base"
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
