// Dependencies: @dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities
import { useState, useEffect, useRef } from 'react';
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
import {
  Plus,
  Edit,
  Trash2,
  Search,
  X,
  ListChecks,
  ShoppingCart,
  PackagePlus,
  ChevronUp,
  ChevronDown,
  GripVertical,
  DollarSign,
  Camera,
  Image as ImageIcon,
} from 'lucide-react';
import { toast } from 'sonner';
// import * as XLSX from 'xlsx';
// Note: XLSX export functionality temporarily disabled - use CSV export instead
import type { Job } from '@/types';
import { MaterialsList } from '@/components/foreman/MaterialsList';
import { ExtrasManagement } from './ExtrasManagement';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatMeasurement, cleanMaterialValue } from '@/lib/utils';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';


interface Material {
  id: string;
  category_id: string;
  name: string;
  quantity: number;
  length: string | null;
  color: string | null;
  status: 'not_ordered' | 'ordered' | 'ready_to_pull' | 'ready_for_job' | 'at_job' | 'installed' | 'missing';
  notes: string | null;
  use_case: string | null;
  import_source?: string;
  date_needed_by?: string | null;
  order_by_date?: string | null;
  pull_by_date?: string | null;
  delivery_date?: string | null;
  actual_delivery_date?: string | null;
  ordered_by?: string | null;
  order_requested_at?: string | null;
  pickup_by?: string | null;
  pickup_date?: string | null;
  actual_pickup_date?: string | null;
  delivery_method?: 'pickup' | 'delivery' | null;
  bundle_name?: string;
  order_index?: number;
}

interface Category {
  id: string;
  name: string;
  order_index: number;
  parent_id?: string | null;
  materials: Material[];
  sheet_image_url?: string | null;
}

interface MaterialsManagementProps {
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
  { value: 'missing', label: 'Missing', color: 'bg-red-100 text-red-700 border-red-300' },
];

function getStatusColor(status: string) {
  return STATUS_OPTIONS.find(s => s.value === status)?.color || 'bg-gray-100 text-gray-700 border-gray-300';
}

function getStatusLabel(status: string) {
  return STATUS_OPTIONS.find(s => s.value === status)?.label || status;
}

// Sortable Material Row Component
interface SortableMaterialRowProps {
  material: Material;
  index: number;
  totalMaterials: number;
  categoryId: string;
  showColorColumn: boolean;
  onEdit: (material: Material) => void;
  onDelete: (materialId: string) => void;
  onStatusChange: (materialId: string, status: string) => void;
  onBundleAssign: (materialId: string, bundleId: string) => void;
  onMoveUp: (materialId: string, categoryId: string) => void;
  onMoveDown: (materialId: string, categoryId: string) => void;
  bundles: any[];
  materialBundleMap: Map<string, { bundleId: string; bundleName: string }>;
}

function SortableMaterialRow({
  material,
  index,
  totalMaterials,
  categoryId,
  showColorColumn,
  onEdit,
  onDelete,
  onStatusChange,
  onBundleAssign,
  onMoveUp,
  onMoveDown,
  bundles,
  materialBundleMap,
}: SortableMaterialRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `material-${material.id}` });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <tr ref={setNodeRef} style={style} className="border-b hover:bg-muted/30 transition-colors">
      <td className="p-1">
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing p-0.5 hover:bg-muted rounded flex items-center justify-center"
        >
          <GripVertical className="w-3.5 h-3.5 text-muted-foreground" />
        </div>
      </td>
      <td className="p-1">
        <div className="flex flex-col gap-0.5">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onMoveUp(material.id, categoryId)}
            disabled={index === 0}
            className="h-4 w-full p-0"
          >
            <ChevronUp className="w-3 h-3" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onMoveDown(material.id, categoryId)}
            disabled={index === totalMaterials - 1}
            className="h-4 w-full p-0"
          >
            <ChevronDown className="w-3 h-3" />
          </Button>
        </div>
      </td>
      <td className="p-2">
        <div className="font-medium truncate">{cleanMaterialValue(material.name)}</div>
        <div className="flex items-center gap-1 mt-1 flex-wrap">
          {material.bundle_name && (
            <Badge variant="secondary" className="text-xs">
              📦 {material.bundle_name}
            </Badge>
          )}
          {material.import_source === 'field_catalog' && (
            <Badge variant="outline" className="text-xs bg-orange-50 text-orange-700 border-orange-300 font-semibold">
              🔧 Field Request
            </Badge>
          )}
        </div>
      </td>
      <td className="p-2 text-sm text-muted-foreground truncate">
        {material.use_case || '-'}
      </td>
      <td className="p-2 text-center font-semibold">
        {material.quantity}
      </td>
      <td className="p-2 text-center">
        {cleanMaterialValue(material.length) || '-'}
      </td>
      {showColorColumn && (
        <td className="p-2 text-center truncate">
          {material.color || '-'}
        </td>
      )}
      <td className="p-2">
        <div className="flex justify-center">
          <Select
            value={materialBundleMap.get(material.id)?.bundleId || 'NONE'}
            onValueChange={(bundleId) => onBundleAssign(material.id, bundleId)}
          >
            <SelectTrigger className="w-full h-8 text-xs">
              <SelectValue placeholder="None" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="NONE">
                <span className="text-muted-foreground text-xs">No bundle</span>
              </SelectItem>
              {bundles.map(bundle => (
                <SelectItem key={bundle.id} value={bundle.id}>
                  <span className="text-xs">{bundle.name}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </td>
      <td className="p-2">
        <div className="flex justify-center">
          <Select
            value={material.status}
            onValueChange={(newStatus) => onStatusChange(material.id, newStatus)}
          >
            <SelectTrigger className={`w-full h-8 font-medium border-2 text-xs whitespace-nowrap ${getStatusColor(material.status)}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>
                  <span className={`inline-flex items-center px-2 py-1 rounded text-xs whitespace-nowrap ${opt.color}`}>
                    {opt.label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </td>
      <td className="p-2">
        <div className="flex items-center justify-end gap-1">
          <Button size="sm" variant="ghost" onClick={() => onEdit(material)}>
            <Edit className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onDelete(material.id)}
            className="text-destructive"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </td>
    </tr>
  );
}

// Sortable Category Card Component
interface SortableCategoryCardProps {
  category: Category;
  catIndex: number;
  totalCategories: number;
  onAddMaterial: (categoryId: string) => void;
  onEditMaterial: (material: Material) => void;
  onDeleteMaterial: (materialId: string) => void;
  onStatusChange: (materialId: string, status: string) => void;
  onBundleAssign: (materialId: string, bundleId: string) => void;
  onMoveMaterialUp: (materialId: string, categoryId: string) => void;
  onMoveMaterialDown: (materialId: string, categoryId: string) => void;
  onMoveCategoryUp: (categoryId: string) => void;
  onMoveCategoryDown: (categoryId: string) => void;
  bundles: any[];
  materialBundleMap: Map<string, { bundleId: string; bundleName: string }>;
  getFilteredAndSortedMaterials: (materials: Material[]) => Material[];
}

function SortableCategoryCard({
  category,
  catIndex,
  totalCategories,
  onAddMaterial,
  onEditMaterial,
  onDeleteMaterial,
  onStatusChange,
  onBundleAssign,
  onMoveMaterialUp,
  onMoveMaterialDown,
  onMoveCategoryUp,
  onMoveCategoryDown,
  bundles,
  materialBundleMap,
  getFilteredAndSortedMaterials,
}: SortableCategoryCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef: setCategoryRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `category-${category.id}` });

  const categoryStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const filteredMaterials = getFilteredAndSortedMaterials(category.materials);
  const isColorCategory = /trim|metal|fastener/i.test(category.name);
  const showColorColumn = isColorCategory || filteredMaterials.some(m => m.color);

  return (
    <Card ref={setCategoryRef} style={categoryStyle} className="overflow-hidden">
      <CardHeader className="bg-gradient-to-r from-primary/10 to-primary/5 border-b-2 border-primary/20">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div
              {...attributes}
              {...listeners}
              className="cursor-grab active:cursor-grabbing p-1 hover:bg-primary/10 rounded"
            >
              <GripVertical className="w-5 h-5 text-muted-foreground" />
            </div>
            <div className="flex flex-col gap-1">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onMoveCategoryUp(category.id)}
                disabled={catIndex === 0}
                className="h-5 w-7 p-0"
              >
                <ChevronUp className="w-4 h-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onMoveCategoryDown(category.id)}
                disabled={catIndex === totalCategories - 1}
                className="h-5 w-7 p-0"
              >
                <ChevronDown className="w-4 h-4" />
              </Button>
            </div>
            <CardTitle className="text-xl font-bold">{category.name}</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => onAddMaterial(category.id)} className="gradient-primary">
              <Plus className="w-4 h-4 mr-2" />
              Add Material
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {filteredMaterials.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            No materials in this category
          </div>
        ) : (
          <SortableContext
            items={filteredMaterials.map(m => `material-${m.id}`)}
            strategy={verticalListSortingStrategy}
          >
            <table className="w-full table-fixed">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="text-left p-1 w-8 text-xs">Drag</th>
                  <th className="text-left p-1 w-10 text-xs">Move</th>
                  <th className="text-left p-2 w-1/5">Material Name</th>
                  <th className="text-left p-2 w-1/6">Use Case</th>
                  <th className="text-center p-2 w-16">Qty</th>
                  <th className="text-center p-2 w-20">Length</th>
                  {showColorColumn && <th className="text-center p-2 w-24">Color</th>}
                  <th className="text-center p-2 font-semibold w-32">
                    <div className="flex items-center justify-center gap-1">
                      <PackagePlus className="w-4 h-4" />
                      Bundle
                    </div>
                  </th>
                  <th className="text-center p-2 w-36">Status</th>
                  <th className="text-right p-2 w-24">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredMaterials.map((material, index) => (
                  <SortableMaterialRow
                    key={material.id}
                    material={material}
                    index={index}
                    totalMaterials={filteredMaterials.length}
                    categoryId={category.id}
                    showColorColumn={showColorColumn}
                    onEdit={onEditMaterial}
                    onDelete={onDeleteMaterial}
                    onStatusChange={onStatusChange}
                    onBundleAssign={onBundleAssign}
                    onMoveUp={onMoveMaterialUp}
                    onMoveDown={onMoveMaterialDown}
                    bundles={bundles}
                    materialBundleMap={materialBundleMap}
                  />
                ))}
              </tbody>
            </table>
          </SortableContext>
        )}
      </CardContent>
    </Card>
  );
}

export function MaterialsManagement({ job, userId }: MaterialsManagementProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'manage' | 'bundles'>('manage');
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const scrollPositionRef = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Search & Filter
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterFieldRequests, setFilterFieldRequests] = useState(false);

  // Sorting
  const [sortBy, setSortBy] = useState<'order' | 'name' | 'useCase' | 'quantity' | 'length' | 'color'>('order');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Category modal
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [categoryName, setCategoryName] = useState('');
  const [parentCategoryId, setParentCategoryId] = useState<string>('');
  const [categorySheetImage, setCategorySheetImage] = useState<File | null>(null);
  const [categorySheetPreview, setCategorySheetPreview] = useState<string | null>(null);
  const [selectedChildCategories, setSelectedChildCategories] = useState<string[]>([]);
  const [isCreatingParent, setIsCreatingParent] = useState(false);
  const [newChildCategories, setNewChildCategories] = useState('');

  // Material modal
  const [showMaterialModal, setShowMaterialModal] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);
  const [materialName, setMaterialName] = useState('');
  const [materialQuantity, setMaterialQuantity] = useState('');
  const [materialLength, setMaterialLength] = useState('');
  const [materialColor, setMaterialColor] = useState('');
  const [materialUseCase, setMaterialUseCase] = useState('');
  const [materialStatus, setMaterialStatus] = useState('not_ordered');
  const [materialPhotos, setMaterialPhotos] = useState<File[]>([]);
  const [existingPhotos, setExistingPhotos] = useState<any[]>([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);

  // Material bundles
  const [materialBundleMap, setMaterialBundleMap] = useState<Map<string, { bundleId: string; bundleName: string }>>(new Map());
  const [bundles, setBundles] = useState<any[]>([]);

  useEffect(() => {
    loadMaterials();
    loadBundles();

    // Subscribe to real-time material changes
    const materialsChannel = supabase
      .channel('office_materials_changes')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'materials', filter: `job_id=eq.${job.id}` },
        () => {
          console.log('Material change detected in office - reloading materials');
          loadMaterials();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(materialsChannel);
    };
  }, [job.id]);

  async function loadMaterials() {
    try {
      // CRITICAL: Only set loading on FIRST load
      // Background refetch keeps materials visible while fetching updates
      if (categories.length === 0) {
        setLoading(true);
      }

      const { data: categoriesData, error: categoriesError } = await supabase
        .from('materials_categories')
        .select('*')
        .eq('job_id', job.id)
        .order('order_index');

      if (categoriesError) throw categoriesError;

      const { data: materialsData, error: materialsError } = await supabase
        .from('materials')
        .select('*')
        .eq('job_id', job.id)
        .order('order_index')
        .order('name');

      if (materialsError) throw materialsError;

      // Enrich materials with bundle information
      const enrichedMaterials = (materialsData || []).map((material: any) => {
        const bundleInfo = materialBundleMap.get(material.id);
        return {
          ...material,
          bundle_name: bundleInfo?.bundleName,
        };
      });

      const categoriesWithMaterials: Category[] = (categoriesData || []).map(cat => ({
        id: cat.id,
        name: cat.name,
        parent_id: (cat as any).parent_id,
        order_index: cat.order_index,
        sheet_image_url: (cat as any).sheet_image_url,
        materials: enrichedMaterials.filter((m: any) => m.category_id === cat.id),
      }));

      setCategories(categoriesWithMaterials);
    } catch (error: any) {
      console.error('Error loading materials:', error);
      toast.error('Failed to load materials');
      // Keep existing data visible on error
    } finally {
      // Only clear loading if we set it (initial load)
      if (categories.length === 0) {
        setLoading(false);
      }
    }
  }

  async function loadBundles() {
    try {
      // Load bundles
      const { data: bundlesData, error: bundlesError } = await supabase
        .from('material_bundles')
        .select('*')
        .eq('job_id', job.id)
        .order('name');

      if (bundlesError) throw bundlesError;

      setBundles(bundlesData || []);

      // Load bundle items
      const { data: itemsData, error: itemsError } = await supabase
        .from('material_bundle_items')
        .select('*')
        .in('bundle_id', (bundlesData || []).map(b => b.id));

      if (itemsError) throw itemsError;

      // Create a map of material ID to bundle info
      const bundleMap = new Map<string, { bundleId: string; bundleName: string }>();

      (bundlesData || []).forEach((bundle: any) => {
        const bundleItems = (itemsData || []).filter((item: any) => item.bundle_id === bundle.id);
        bundleItems.forEach((item: any) => {
          bundleMap.set(item.material_id, {
            bundleId: bundle.id,
            bundleName: bundle.name
          });
        });
      });

      setMaterialBundleMap(bundleMap);

      // Reload materials to show bundle info
      if (bundleMap.size > 0) {
        loadMaterials();
      }
    } catch (error: any) {
      console.error('Error loading bundles:', error);
    }
  }

  async function assignMaterialToBundle(materialId: string, bundleId: string) {
    try {
      const currentBundleInfo = materialBundleMap.get(materialId);

      // If already in a bundle, remove from old bundle
      if (currentBundleInfo) {
        const { error: deleteError } = await supabase
          .from('material_bundle_items')
          .delete()
          .eq('material_id', materialId);

        if (deleteError) throw deleteError;
      }

      // If bundleId is not empty/none, add to new bundle
      if (bundleId && bundleId !== 'NONE') {
        const { error: insertError } = await supabase
          .from('material_bundle_items')
          .insert({
            bundle_id: bundleId,
            material_id: materialId,
          });

        if (insertError) throw insertError;

        const bundle = bundles.find(b => b.id === bundleId);
        // Silent success - bundle assignment updated
      } else if (currentBundleInfo) {
        // Silent success - bundle removal completed
      }

      // Reload bundles and materials
      await loadBundles();
      await loadMaterials();
    } catch (error: any) {
      console.error('Error assigning material to bundle:', error);
      toast.error('Failed to update bundle assignment');
    }
  }

  async function moveCategoryUp(categoryId: string) {
    const currentIndex = filteredCategories.findIndex(cat => cat.id === categoryId);
    if (currentIndex <= 0) return;

    try {
      const current = filteredCategories[currentIndex];
      const above = filteredCategories[currentIndex - 1];

      await Promise.all([
        supabase
          .from('materials_categories')
          .update({ order_index: above.order_index })
          .eq('id', current.id),
        supabase
          .from('materials_categories')
          .update({ order_index: current.order_index })
          .eq('id', above.id)
      ]);

      // Silent success - category reordered
      loadMaterials();
    } catch (error: any) {
      toast.error('Failed to reorder categories');
      console.error(error);
    }
  }

  async function moveCategoryDown(categoryId: string) {
    const currentIndex = filteredCategories.findIndex(cat => cat.id === categoryId);
    if (currentIndex === -1 || currentIndex >= filteredCategories.length - 1) return;

    try {
      const current = filteredCategories[currentIndex];
      const below = filteredCategories[currentIndex + 1];

      await Promise.all([
        supabase
          .from('materials_categories')
          .update({ order_index: below.order_index })
          .eq('id', current.id),
        supabase
          .from('materials_categories')
          .update({ order_index: current.order_index })
          .eq('id', below.id)
      ]);

      // Silent success - category reordered
      loadMaterials();
    } catch (error: any) {
      toast.error('Failed to reorder categories');
      console.error(error);
    }
  }

  async function moveMaterialUp(materialId: string, categoryId: string) {
    const category = categories.find(cat => cat.id === categoryId);
    if (!category) return;

    const filteredMaterials = getFilteredAndSortedMaterials(category.materials);
    const currentIndex = filteredMaterials.findIndex(mat => mat.id === materialId);
    if (currentIndex <= 0) return;

    try {
      const current = filteredMaterials[currentIndex];
      const above = filteredMaterials[currentIndex - 1];

      await Promise.all([
        supabase
          .from('materials')
          .update({ order_index: above.order_index })
          .eq('id', current.id),
        supabase
          .from('materials')
          .update({ order_index: current.order_index })
          .eq('id', above.id)
      ]);

      // Silent success - material reordered
      loadMaterials();
    } catch (error: any) {
      toast.error('Failed to reorder materials');
      console.error(error);
    }
  }

  async function moveMaterialDown(materialId: string, categoryId: string) {
    const category = categories.find(cat => cat.id === categoryId);
    if (!category) return;

    const filteredMaterials = getFilteredAndSortedMaterials(category.materials);
    const currentIndex = filteredMaterials.findIndex(mat => mat.id === materialId);
    if (currentIndex === -1 || currentIndex >= filteredMaterials.length - 1) return;

    try {
      const current = filteredMaterials[currentIndex];
      const below = filteredMaterials[currentIndex + 1];

      await Promise.all([
        supabase
          .from('materials')
          .update({ order_index: below.order_index })
          .eq('id', current.id),
        supabase
          .from('materials')
          .update({ order_index: current.order_index })
          .eq('id', below.id)
      ]);

      // Silent success - material reordered
      loadMaterials();
    } catch (error: any) {
      toast.error('Failed to reorder materials');
      console.error(error);
    }
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveDragId(event.active.id as string);
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveDragId(null);

    if (!over || active.id === over.id) return;

    // Save scroll position before reload - use window scroll since container isn't scrollable
    scrollPositionRef.current = window.scrollY;

    const activeId = active.id as string;
    const overId = over.id as string;

    // Check if we're dragging a material
    if (activeId.startsWith('material-')) {
      const materialId = activeId.replace('material-', '');
      
      // Find source category and material
      let sourceCategoryId: string | null = null;
      let sourceMaterial: Material | null = null;
      for (const cat of categories) {
        const material = cat.materials.find(m => m.id === materialId);
        if (material) {
          sourceCategoryId = cat.id;
          sourceMaterial = material;
          break;
        }
      }

      if (!sourceCategoryId || !sourceMaterial) return;

      // Find target category and position
      let targetCategoryId: string | null = null;
      let targetMaterialId: string | null = null;

      // Check if dropped on another material
      if (overId.startsWith('material-')) {
        targetMaterialId = overId.replace('material-', '');
        for (const cat of categories) {
          if (cat.materials.find(m => m.id === targetMaterialId)) {
            targetCategoryId = cat.id;
            break;
          }
        }
      }
      // Check if dropped on a category header
      else if (overId.startsWith('category-')) {
        targetCategoryId = overId.replace('category-', '');
      }

      if (!targetCategoryId) return;

      try {
        const sourceCategory = categories.find(c => c.id === sourceCategoryId)!;
        const targetCategory = categories.find(c => c.id === targetCategoryId)!;

        // Get sorted materials from both categories
        const sourceMaterials = [...sourceCategory.materials].sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
        const targetMaterials = [...targetCategory.materials].sort((a, b) => (a.order_index || 0) - (b.order_index || 0));

        if (sourceCategoryId === targetCategoryId) {
          // Same category - reorder within category
          const oldIndex = sourceMaterials.findIndex(m => m.id === materialId);
          const newIndex = targetMaterialId 
            ? sourceMaterials.findIndex(m => m.id === targetMaterialId)
            : sourceMaterials.length - 1;

          if (oldIndex === newIndex) return;

          const reorderedMaterials = arrayMove(sourceMaterials, oldIndex, newIndex);

          // Update order_index for all materials in this category
          await Promise.all(
            reorderedMaterials.map((material, index) =>
              supabase
                .from('materials')
                .update({ order_index: index, updated_at: new Date().toISOString() })
                .eq('id', material.id)
            )
          );
        } else {
          // Different category - move material to new category
          // Remove from source
          const updatedSourceMaterials = sourceMaterials.filter(m => m.id !== materialId);
          
          // Add to target at appropriate position
          const targetIndex = targetMaterialId 
            ? targetMaterials.findIndex(m => m.id === targetMaterialId)
            : targetMaterials.length;
          
          const updatedTargetMaterials = [...targetMaterials];
          updatedTargetMaterials.splice(targetIndex, 0, sourceMaterial);

          // Update source category materials
          await Promise.all(
            updatedSourceMaterials.map((material, index) =>
              supabase
                .from('materials')
                .update({ order_index: index, updated_at: new Date().toISOString() })
                .eq('id', material.id)
            )
          );

          // Update target category materials (including the moved one)
          await Promise.all(
            updatedTargetMaterials.map((material, index) =>
              supabase
                .from('materials')
                .update({
                  category_id: targetCategoryId,
                  order_index: index,
                  updated_at: new Date().toISOString()
                })
                .eq('id', material.id)
            )
          );
        }

        // Reload materials and restore scroll position
        await loadMaterials();
        
        // Use requestAnimationFrame to ensure DOM is fully rendered
        requestAnimationFrame(() => {
          window.scrollTo({ top: scrollPositionRef.current, behavior: 'instant' });
        });
      } catch (error: any) {
        console.error('Error moving material:', error);
        toast.error('Failed to move material');
      }
    }
    // Check if we're dragging a category
    if (activeId.startsWith('category-') && overId.startsWith('category-')) {
      const activeCatId = activeId.replace('category-', '');
      const overCatId = overId.replace('category-', '');

      const oldIndex = filteredCategories.findIndex(cat => cat.id === activeCatId);
      const newIndex = filteredCategories.findIndex(cat => cat.id === overCatId);

      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;

      const reorderedCategories = arrayMove(filteredCategories, oldIndex, newIndex);
      
      try {
        // Update order_index for all affected categories
        await Promise.all(
          reorderedCategories.map((cat, index) =>
            supabase
              .from('materials_categories')
              .update({ order_index: index })
              .eq('id', cat.id)
          )
        );

        // Reload materials and restore scroll position
        await loadMaterials();
        
        // Use requestAnimationFrame to ensure DOM is fully rendered
        requestAnimationFrame(() => {
          window.scrollTo({ top: scrollPositionRef.current, behavior: 'instant' });
        });
      } catch (error: any) {
        console.error('Error reordering categories:', error);
        toast.error('Failed to reorder categories');
      }
    }
  }

  // Restore scroll position after any material reload
  useEffect(() => {
    if (!loading && scrollPositionRef.current > 0) {
      // Small delay to ensure rendering is complete
      const timer = setTimeout(() => {
        window.scrollTo({ top: scrollPositionRef.current, behavior: 'instant' });
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [loading, categories]);

  function openAddMaterial(categoryId: string) {
    setSelectedCategoryId(categoryId);
    setEditingMaterial(null);
    setMaterialName('');
    setMaterialQuantity('');
    setMaterialLength('');
    setMaterialColor('');
    setMaterialUseCase('');
    setMaterialStatus('not_ordered');
    setMaterialPhotos([]);
    setExistingPhotos([]);
    setShowMaterialModal(true);
  }

  async function openEditMaterial(material: Material) {
    setSelectedCategoryId(material.category_id);
    setEditingMaterial(material);
    setMaterialName(material.name);
    setMaterialQuantity(material.quantity.toString());
    setMaterialLength(material.length || '');
    setMaterialColor(material.color || '');
    setMaterialUseCase((material as any).use_case || '');
    setMaterialStatus(material.status);
    setMaterialPhotos([]);
    
    // Load existing photos
    try {
      const { data: photos, error } = await supabase
        .from('material_photos')
        .select('*')
        .eq('material_id', material.id)
        .order('timestamp', { ascending: false });
      
      if (!error) {
        setExistingPhotos(photos || []);
      }
    } catch (error) {
      console.error('Error loading material photos:', error);
    }
    
    setShowMaterialModal(true);
  }

  async function saveMaterial() {
    if (!materialName.trim() || !materialQuantity) {
      toast.error('Please enter material name and quantity');
      return;
    }

    if (!selectedCategoryId) {
      toast.error('Please select a category');
      return;
    }

    try {
      let materialId: string;
      
      if (editingMaterial) {
        // Update existing (including category)
        const { error } = await supabase
          .from('materials')
          .update({
            category_id: selectedCategoryId,
            name: materialName.trim(),
            quantity: parseFloat(materialQuantity),
            length: materialLength.trim() || null,
            color: materialColor.trim() || null,
            use_case: materialUseCase.trim() || null,
            status: materialStatus,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingMaterial.id);

        if (error) throw error;
        materialId = editingMaterial.id;
        toast.success('Material updated');
      } else {
        // Create new - get max order_index for this category
        const { data: maxOrderData } = await supabase
          .from('materials')
          .select('order_index')
          .eq('category_id', selectedCategoryId)
          .order('order_index', { ascending: false })
          .limit(1)
          .single();

        const nextOrderIndex = (maxOrderData?.order_index ?? -1) + 1;

        const { data, error } = await supabase
          .from('materials')
          .insert({
            job_id: job.id,
            category_id: selectedCategoryId,
            name: materialName.trim(),
            quantity: parseFloat(materialQuantity),
            length: materialLength.trim() || null,
            color: materialColor.trim() || null,
            use_case: materialUseCase.trim() || null,
            status: materialStatus,
            created_by: userId,
            import_source: 'manual',
            order_index: nextOrderIndex,
          })
          .select()
          .single();

        if (error) throw error;
        materialId = data.id;
        toast.success('Material added');
      }

      // Upload photos if any
      if (materialPhotos.length > 0) {
        setUploadingPhotos(true);
        await uploadMaterialPhotos(materialId);
      }

      setShowMaterialModal(false);
      loadMaterials();
    } catch (error: any) {
      toast.error('Failed to save material');
      console.error(error);
    } finally {
      setUploadingPhotos(false);
    }
  }

  async function uploadMaterialPhotos(materialId: string) {
    try {
      for (const file of materialPhotos) {
        // Upload to storage
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `${job.id}/${materialId}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('job-files')
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        // Get public URL
        const { data: { publicUrl } } = supabase.storage
          .from('job-files')
          .getPublicUrl(filePath);

        // Save to material_photos table
        const { error: dbError } = await supabase
          .from('material_photos')
          .insert({
            material_id: materialId,
            photo_url: publicUrl,
            uploaded_by: userId,
          });

        if (dbError) throw dbError;
      }
      
      if (materialPhotos.length > 0) {
        toast.success(`${materialPhotos.length} photo(s) uploaded`);
      }
    } catch (error: any) {
      console.error('Error uploading photos:', error);
      toast.error('Failed to upload some photos');
    }
  }

  async function deletePhoto(photoId: string, photoUrl: string) {
    if (!confirm('Delete this photo?')) return;

    try {
      // Delete from database
      const { error: dbError } = await supabase
        .from('material_photos')
        .delete()
        .eq('id', photoId);

      if (dbError) throw dbError;

      // Delete from storage
      const path = photoUrl.split('/job-files/')[1];
      if (path) {
        await supabase.storage.from('job-files').remove([path]);
      }

      // Update local state
      setExistingPhotos(existingPhotos.filter(p => p.id !== photoId));
      toast.success('Photo deleted');
    } catch (error: any) {
      console.error('Error deleting photo:', error);
      toast.error('Failed to delete photo');
    }
  }

  async function deleteMaterial(materialId: string) {
    if (!confirm('Delete this material?')) return;

    try {
      const { error } = await supabase
        .from('materials')
        .delete()
        .eq('id', materialId);

      if (error) throw error;
      toast.success('Material deleted');
      loadMaterials();
    } catch (error: any) {
      toast.error('Failed to delete material');
      console.error(error);
    }
  }

  async function handleQuickStatusChange(materialId: string, newStatusValue: string) {
    try {
      // Optimistically update local state first
      setCategories(prevCategories =>
        prevCategories.map(category => ({
          ...category,
          materials: category.materials.map(material =>
            material.id === materialId
              ? { ...material, status: newStatusValue as Material['status'] } // Type assertion here
              : material
          )
        }))
      );

      const { error } = await supabase
        .from('materials')
        .update({
          status: newStatusValue,
          updated_at: new Date().toISOString()
        })
        .eq('id', materialId);

      if (error) throw error;

      // Silent success - status updated

      // Reload to ensure data consistency
      await loadMaterials();
    } catch (error: any) {
      console.error('Error updating status:', error);
      toast.error('Failed to update status');
      // Reload on error to revert optimistic update
      loadMaterials();
    }
  }

  // Helper functions
  function getFilteredAndSortedMaterials(categoryMaterials: Material[]) {
    let filtered = categoryMaterials.filter(material => {
      const matchesSearch = searchTerm === '' ||
        material.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (material.use_case && material.use_case.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (material.length && material.length.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchesStatus = filterStatus === 'all' || material.status === filterStatus;
      
      const matchesFieldRequest = !filterFieldRequests || material.import_source === 'field_catalog';

      return matchesSearch && matchesStatus && matchesFieldRequest;
    });

    filtered.sort((a, b) => {
      let compareA: any;
      let compareB: any;

      switch (sortBy) {
        case 'order':
          // Sort by order_index (default/manual order)
          compareA = a.order_index ?? 0;
          compareB = b.order_index ?? 0;
          break;
        case 'name':
          compareA = a.name.toLowerCase();
          compareB = b.name.toLowerCase();
          break;
        case 'useCase':
          compareA = (a.use_case || '').toLowerCase();
          compareB = (b.use_case || '').toLowerCase();
          break;
        case 'quantity':
          compareA = a.quantity;
          compareB = b.quantity;
          break;
        case 'length':
          compareA = (a.length || '').toLowerCase();
          compareB = (b.length || '').toLowerCase();
          break;
        case 'color':
          compareA = (a.color || '').toLowerCase();
          compareB = (b.color || '').toLowerCase();
          break;
        default:
          return 0;
      }

      if (compareA < compareB) return sortDirection === 'asc' ? -1 : 1;
      if (compareA > compareB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }

  const getDisplayCategories = () => {
    if (filterCategory === 'all') {
      return categories;
    }

    const selectedCategory = categories.find(cat => cat.id === filterCategory);
    if (!selectedCategory) return [];

    const isParent = categories.some(cat => cat.parent_id === selectedCategory.id);
    if (isParent) {
      return categories.filter(cat => cat.parent_id === selectedCategory.id);
    }

    return [selectedCategory];
  };

  const filteredCategories = getDisplayCategories();

  const activeDragItem = activeDragId
    ? categories
        .flatMap(cat => cat.materials)
        .find(m => `material-${m.id}` === activeDragId)
    : null;

  // CRITICAL: Never blank the materials view during data refresh
  // Show a subtle loading indicator overlay instead of replacing content
  const isInitialLoad = loading && categories.length === 0;
  
  if (isInitialLoad) {
    return <div className="text-center py-8">Loading materials...</div>;
  }

  return (
    <>
      <div ref={containerRef} className="w-full -mx-2">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'manage' | 'bundles')} className="space-y-2">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-gradient-to-r from-slate-50 to-slate-100 p-3 rounded-lg border-2 border-slate-200">
            <TabsList className="grid w-full grid-cols-4 h-14 bg-white shadow-sm">
              <TabsTrigger 
                value="manage" 
                className="flex flex-col sm:flex-row items-center gap-1 sm:gap-2 text-base font-semibold data-[state=active]:bg-gradient-to-br data-[state=active]:from-blue-600 data-[state=active]:to-blue-500 data-[state=active]:text-white transition-all shadow-sm"
              >
                <ListChecks className="w-5 h-5" />
                <span className="text-xs sm:text-base">Manage Materials</span>
              </TabsTrigger>
              <TabsTrigger 
                value="bundles" 
                className="flex flex-col sm:flex-row items-center gap-1 sm:gap-2 text-base font-semibold data-[state=active]:bg-gradient-to-br data-[state=active]:from-purple-600 data-[state=active]:to-purple-500 data-[state=active]:text-white transition-all shadow-sm"
              >
                <ShoppingCart className="w-5 h-5" />
                <span className="text-xs sm:text-base">Material Bundles</span>
              </TabsTrigger>
              <TabsTrigger 
                value="field-orders" 
                className="flex flex-col sm:flex-row items-center gap-1 sm:gap-2 text-base font-semibold data-[state=active]:bg-gradient-to-br data-[state=active]:from-orange-600 data-[state=active]:to-orange-500 data-[state=active]:text-white transition-all shadow-sm"
              >
                <PackagePlus className="w-5 h-5" />
                <span className="text-xs sm:text-base">Crew Orders</span>
                {categories.flatMap(c => c.materials).filter(m => m.import_source === 'field_catalog').length > 0 && (
                  <Badge variant="secondary" className="bg-orange-100 text-orange-800">
                    {categories.flatMap(c => c.materials).filter(m => m.import_source === 'field_catalog').length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger 
                value="extras" 
                className="flex flex-col sm:flex-row items-center gap-1 sm:gap-2 text-base font-semibold data-[state=active]:bg-gradient-to-br data-[state=active]:from-green-600 data-[state=active]:to-green-500 data-[state=active]:text-white transition-all shadow-sm"
              >
                <DollarSign className="w-5 h-5" />
                <span className="text-xs sm:text-base">Extras</span>
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="manage" className="space-y-2">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              {/* Search & Filter Bar */}
              <Card>
                <CardContent className="pt-3 pb-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Button
                      variant={filterFieldRequests ? "default" : "outline"}
                      size="sm"
                      onClick={() => setFilterFieldRequests(!filterFieldRequests)}
                      className={filterFieldRequests ? "bg-orange-600 hover:bg-orange-700" : ""}
                    >
                      🔧 Field Requests Only
                      {filterFieldRequests && (
                        <Badge variant="secondary" className="ml-2">
                          {categories.flatMap(c => c.materials).filter(m => m.import_source === 'field_catalog').length}
                        </Badge>
                      )}
                    </Button>
                    {filterFieldRequests && (
                      <p className="text-sm text-muted-foreground">
                        Showing materials requested by crew from field
                      </p>
                    )}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        placeholder="Search materials, usage, or length..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-9 pr-9"
                      />
                      {searchTerm && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSearchTerm('')}
                          className="absolute right-1 top-1/2 transform -translate-y-1/2 h-7 w-7 p-0"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      )}
                    </div>

                    <Select value={filterCategory} onValueChange={setFilterCategory}>
                      <SelectTrigger>
                        <SelectValue placeholder="All Categories" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Categories</SelectItem>
                        {categories.map(cat => (
                          <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select value={filterStatus} onValueChange={setFilterStatus}>
                      <SelectTrigger>
                        <SelectValue placeholder="All Statuses" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Statuses</SelectItem>
                        {STATUS_OPTIONS.map(opt => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              {/* Materials Table */}
              <SortableContext
                items={filteredCategories.map(cat => `category-${cat.id}`)}
                strategy={verticalListSortingStrategy}
              >
                {filteredCategories.length === 0 ? (
                  <Card>
                    <CardContent className="py-8 text-center">
                      <p className="text-muted-foreground">No categories yet. Create a category to get started.</p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-2">
                    {filteredCategories.map((category, catIndex) => (
                      <SortableCategoryCard
                        key={category.id}
                        category={category}
                        catIndex={catIndex}
                        totalCategories={filteredCategories.length}
                        onAddMaterial={openAddMaterial}
                        onEditMaterial={openEditMaterial}
                        onDeleteMaterial={deleteMaterial}
                        onStatusChange={handleQuickStatusChange}
                        onBundleAssign={assignMaterialToBundle}
                        onMoveMaterialUp={moveMaterialUp}
                        onMoveMaterialDown={moveMaterialDown}
                        onMoveCategoryUp={moveCategoryUp}
                        onMoveCategoryDown={moveCategoryDown}
                        bundles={bundles}
                        materialBundleMap={materialBundleMap}
                        getFilteredAndSortedMaterials={getFilteredAndSortedMaterials}
                      />
                    ))}
                  </div>
                )}
              </SortableContext>

              <DragOverlay>
                {activeDragItem ? (
                  <div className="bg-white border-2 border-primary shadow-xl rounded-lg p-3 opacity-90">
                    <div className="font-medium">{activeDragItem.name}</div>
                    <div className="text-sm text-muted-foreground">Qty: {activeDragItem.quantity}</div>
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          </TabsContent>

          <TabsContent value="bundles" className="space-y-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2">
                  <ShoppingCart className="w-5 h-5" />
                  Material Bundles
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-2">
                  Create and manage material bundles by grouping related materials together.
                </p>
              </CardHeader>
              <CardContent className="pt-3">
                <MaterialsList
                  job={job}
                  userId={userId}
                  userRole="office"
                  allowBundleCreation={true}
                  defaultTab="bundles"
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="field-orders" className="space-y-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2">
                  <PackagePlus className="w-5 h-5 text-orange-600" />
                  Crew Orders
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-2">
                  Materials requested by crew from the field - tracked separately for job cost management
                </p>
              </CardHeader>
              <CardContent className="pt-3">
                {categories.flatMap(c => c.materials).filter(m => m.import_source === 'field_catalog').length === 0 ? (
                  <div className="text-center py-12">
                    <PackagePlus className="w-16 h-16 mx-auto mb-4 opacity-50 text-muted-foreground" />
                    <p className="text-muted-foreground">No crew orders yet</p>
                    <p className="text-sm text-muted-foreground mt-2">
                      Crew can order materials from their Order tab in the field
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {categories
                      .filter(cat => cat.materials.some(m => m.import_source === 'field_catalog'))
                      .map(category => {
                        const fieldMaterials = category.materials.filter(m => m.import_source === 'field_catalog');
                        return (
                          <Card key={category.id} className="border-2 border-orange-200 bg-orange-50">
                            <CardHeader className="pb-3">
                              <CardTitle className="text-base text-orange-900 flex items-center justify-between">
                                <span>{category.name}</span>
                                <Badge variant="secondary" className="bg-orange-100 text-orange-800">
                                  {fieldMaterials.length} {fieldMaterials.length === 1 ? 'order' : 'orders'}
                                </Badge>
                              </CardTitle>
                            </CardHeader>
                            <CardContent>
                              <div className="bg-white rounded-lg border border-orange-200">
                                <table className="w-full">
                                  <thead className="bg-orange-100 border-b border-orange-200">
                                    <tr>
                                      <th className="text-left p-2 text-xs font-semibold text-orange-900">Material</th>
                                      <th className="text-center p-2 text-xs font-semibold text-orange-900">Qty</th>
                                      <th className="text-center p-2 text-xs font-semibold text-orange-900">Ordered By</th>
                                      <th className="text-center p-2 text-xs font-semibold text-orange-900">When</th>
                                      <th className="text-center p-2 text-xs font-semibold text-orange-900">Status</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {fieldMaterials.map((material, index) => (
                                      <tr key={material.id} className={index % 2 === 0 ? 'bg-white' : 'bg-orange-50/30'}>
                                        <td className="p-2">
                                          <div>
                                            <div className="font-medium text-sm">{cleanMaterialValue(material.name)}</div>
                                            {material.length && (
                                              <div className="text-xs text-muted-foreground">
                                                {cleanMaterialValue(material.length)}
                                              </div>
                                            )}
                                            {material.notes && (
                                              <div className="text-xs text-muted-foreground mt-1">
                                                {material.notes}
                                              </div>
                                            )}
                                          </div>
                                        </td>
                                        <td className="p-2 text-center font-semibold">{material.quantity}</td>
                                        <td className="p-2 text-center text-sm">
                                          {material.ordered_by ? (
                                            <Badge variant="outline" className="text-xs">
                                              User ID: {material.ordered_by.substring(0, 8)}...
                                            </Badge>
                                          ) : '-'}
                                        </td>
                                        <td className="p-2 text-center text-xs text-muted-foreground">
                                          {material.order_requested_at ? new Date(material.order_requested_at).toLocaleDateString() : '-'}
                                        </td>
                                        <td className="p-2">
                                          <div className="flex justify-center">
                                            <Select
                                              value={material.status}
                                              onValueChange={(newStatus) => handleQuickStatusChange(material.id, newStatus)}
                                            >
                                              <SelectTrigger className={`w-full h-8 font-medium border-2 text-xs whitespace-nowrap ${getStatusColor(material.status)}`}>
                                                <SelectValue />
                                              </SelectTrigger>
                                              <SelectContent>
                                                {STATUS_OPTIONS.map(opt => (
                                                  <SelectItem key={opt.value} value={opt.value}>
                                                    <span className={`inline-flex items-center px-2 py-1 rounded text-xs whitespace-nowrap ${opt.color}`}>
                                                      {opt.label}
                                                    </span>
                                                  </SelectItem>
                                                ))}
                                              </SelectContent>
                                            </Select>
                                          </div>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })
                    }
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="extras" className="space-y-2">
            <ExtrasManagement job={job} userId={userId} />
          </TabsContent>
        </Tabs>
      </div>

      {/* Material Edit/Add Dialog */}
      <Dialog open={showMaterialModal} onOpenChange={setShowMaterialModal}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {editingMaterial ? (
                <>
                  <Edit className="w-5 h-5" />Edit Material
                </>
              ) : (
                <>
                  <Plus className="w-5 h-5" />Add Material
                </>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="material-category">Category *</Label>
              <Select value={selectedCategoryId} onValueChange={setSelectedCategoryId}>
                <SelectTrigger id="material-category">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map(cat => (
                    <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="material-name">Material Name *</Label>
              <Input
                id="material-name"
                value={materialName}
                onChange={(e) => setMaterialName(e.target.value)}
                placeholder="e.g., 2x4 Lumber"
                autoFocus
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="material-quantity">Quantity *</Label>
                <Input
                  id="material-quantity"
                  type="number"
                  value={materialQuantity}
                  onChange={(e) => setMaterialQuantity(e.target.value)}
                  placeholder="0"
                  min="0"
                  step="0.01"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="material-length">Length</Label>
                <Input
                  id="material-length"
                  type="text"
                  value={materialLength}
                  onChange={(e) => setMaterialLength(e.target.value)}
                  placeholder="e.g., 8ft, 12ft, 16ft"
                />
                <p className="text-xs text-muted-foreground mt-1">Enter as shown in your material sheets (e.g., 8ft, 10', 12ft)</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="material-color">Color</Label>
              <Input
                id="material-color"
                value={materialColor}
                onChange={(e) => setMaterialColor(e.target.value)}
                placeholder="e.g., Galvalume"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="material-use-case">Use Case / Location</Label>
              <Input
                id="material-use-case"
                value={materialUseCase}
                onChange={(e) => setMaterialUseCase(e.target.value)}
                placeholder="e.g., Wall framing, Roof panels"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="material-status">Status</Label>
              <Select value={materialStatus} onValueChange={setMaterialStatus}>
                <SelectTrigger id="material-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <span className={`inline-flex items-center px-2 py-1 rounded text-xs ${opt.color}`}>
                        {opt.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Photo Upload */}
            <div className="space-y-2">
              <Label htmlFor="material-photos" className="flex items-center gap-2">
                <Camera className="w-4 h-4" />
                Photos
              </Label>
              <Input
                id="material-photos"
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => {
                  if (e.target.files) {
                    setMaterialPhotos(Array.from(e.target.files));
                  }
                }}
                className="cursor-pointer"
              />
              <p className="text-xs text-muted-foreground">Upload photos of this material</p>
              
              {/* Preview new photos */}
              {materialPhotos.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {materialPhotos.map((file, index) => (
                    <div key={index} className="relative w-20 h-20 rounded-lg overflow-hidden border-2 border-green-500">
                      <img
                        src={URL.createObjectURL(file)}
                        alt={`New photo ${index + 1}`}
                        className="w-full h-full object-cover"
                      />
                      <Badge className="absolute top-0 right-0 bg-green-500 text-white text-xs">New</Badge>
                    </div>
                  ))}
                </div>
              )}
              
              {/* Display existing photos */}
              {existingPhotos.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Existing Photos:</p>
                  <div className="flex flex-wrap gap-2">
                    {existingPhotos.map((photo) => (
                      <div key={photo.id} className="relative w-20 h-20 rounded-lg overflow-hidden border-2 border-slate-300 group">
                        <img
                          src={photo.photo_url}
                          alt="Material photo"
                          className="w-full h-full object-cover"
                        />
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => deletePhoto(photo.id, photo.photo_url)}
                          className="absolute inset-0 w-full h-full opacity-0 group-hover:opacity-90 transition-opacity flex items-center justify-center"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-4 border-t">
              <Button onClick={saveMaterial} disabled={uploadingPhotos} className="flex-1 gradient-primary">
                {uploadingPhotos ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    Uploading Photos...
                  </>
                ) : (
                  <>{editingMaterial ? 'Update Material' : 'Add Material'}</>
                )}
              </Button>
              <Button variant="outline" onClick={() => setShowMaterialModal(false)} disabled={uploadingPhotos}>
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
