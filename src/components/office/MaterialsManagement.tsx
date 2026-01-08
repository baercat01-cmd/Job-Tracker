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
import { 
  Plus, 
  Edit, 
  Trash2, 
  ChevronUp, 
  ChevronDown, 
  FileSpreadsheet,
  Upload,
  ChevronDownIcon,
  Search,
  X,
  Image as ImageIcon,
  CheckCircle2,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Calendar,
  User,
  Truck,
  AlertCircle,
  FolderOpen,
  Folder,
  ChevronRight,
} from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import type { Job } from '@/types';


interface Material {
  id: string;
  category_id: string;
  name: string;
  quantity: number;
  length: string | null;
  color: string | null;
  status: string;
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
}

interface Category {
  id: string;
  name: string;
  order_index: number;
  parent_id: string | null;
  materials: Material[];
  sheet_image_url?: string | null;
  subcategories?: Category[];
}

interface MaterialsManagementProps {
  job: Job;
  userId: string;
}

const STATUS_OPTIONS = [
  { value: 'not_ordered', label: 'Not Ordered', color: 'bg-gray-100 text-gray-700 border-gray-300' },
  { value: 'ordered', label: 'Ordered', color: 'bg-yellow-100 text-yellow-700 border-yellow-300' },
  { value: 'at_shop', label: 'Ready for Job', color: 'bg-blue-100 text-blue-700 border-blue-300' },
  { value: 'pull_from_shop', label: 'Pull from Shop', color: 'bg-purple-100 text-purple-700 border-purple-300' },
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

export function MaterialsManagement({ job, userId }: MaterialsManagementProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [allCategoriesFlat, setAllCategoriesFlat] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Expand/collapse state for main categories
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  
  // Search & Filter
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  
  // Sorting
  const [sortBy, setSortBy] = useState<'name' | 'useCase' | 'quantity' | 'length' | 'color'>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  
  // Category modal
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [categoryName, setCategoryName] = useState('');
  const [categoryParentId, setCategoryParentId] = useState<string>('');
  const [categorySheetImage, setCategorySheetImage] = useState<File | null>(null);
  const [categorySheetPreview, setCategorySheetPreview] = useState<string | null>(null);
  
  // Material modal - rest of state variables unchanged
  const [showMaterialModal, setShowMaterialModal] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);
  const [materialName, setMaterialName] = useState('');
  const [materialQuantity, setMaterialQuantity] = useState('');
  const [materialLength, setMaterialLength] = useState('');
  const [materialColor, setMaterialColor] = useState('');
  const [materialUseCase, setMaterialUseCase] = useState('');
  const [materialStatus, setMaterialStatus] = useState('not_ordered');
  
  // Status change dialog  
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [statusChangeMaterial, setStatusChangeMaterial] = useState<Material | null>(null);
  const [newStatus, setNewStatus] = useState('not_ordered');
  const [orderByDate, setOrderByDate] = useState('');
  const [pullByDate, setPullByDate] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [actualDeliveryDate, setActualDeliveryDate] = useState('');
  const [dateNotes, setDateNotes] = useState('');
  const [submittingStatus, setSubmittingStatus] = useState(false);
  const [deliveryMethod, setDeliveryMethod] = useState<'pickup' | 'delivery'>('delivery');
  const [pickupBy, setPickupBy] = useState('');
  const [pickupDate, setPickupDate] = useState('');
  const [deliveryVendor, setDeliveryVendor] = useState('');
  const [pickupVendor, setPickupVendor] = useState('');
  const [hasDeliveryMethod, setHasDeliveryMethod] = useState(false);
  const [users, setUsers] = useState<any[]>([]);
  
  // CSV upload  
  const [showCsvDialog, setShowCsvDialog] = useState(false);
  const [csvData, setCsvData] = useState<any[]>([]);
  const [csvCategories, setCsvCategories] = useState<string[]>([]);
  const [categoryMapping, setCategoryMapping] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const [csvColumns, setCsvColumns] = useState<string[]>([]);
  const [columnMapping, setColumnMapping] = useState<{
    category: string;
    name: string;
    useCase: string;
    quantity: string;
    length: string;
  }>({ category: '', name: '', useCase: '', quantity: '', length: '' });
  const [importStep, setImportStep] = useState<'columns' | 'categories'>('columns');
  const [fileExtension, setFileExtension] = useState<string>('');

  useEffect(() => {
    loadMaterials();
    loadUsers();
  }, [job.id]);

  // Auto-copy categories from Darrell Richard job if this job has none
  useEffect(() => {
    if (!loading && categories.length === 0) {
      autoCopyTemplateCategories();
    }
  }, [loading, categories.length]);

  async function loadUsers() {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('id, username, email')
        .order('username');

      if (error) throw error;
      setUsers(data || []);
    } catch (error: any) {
      console.error('Error loading users:', error);
    }
  }

  async function autoCopyTemplateCategories() {
    try {
      // Find Darrell Richard job
      const { data: templateJob, error: jobError } = await supabase
        .from('jobs')
        .select('id, name')
        .ilike('name', '%darrell%richard%')
        .limit(1)
        .single();

      if (jobError || !templateJob) {
        console.log('Template job (Darrell Richard) not found');
        return;
      }

      console.log('Found template job:', templateJob.name);

      // Load categories from template job
      const { data: templateCategories, error: catError } = await supabase
        .from('materials_categories')
        .select('name, order_index, parent_id, sheet_image_url')
        .eq('job_id', templateJob.id)
        .order('order_index');

      if (catError) throw catError;

      if (!templateCategories || templateCategories.length === 0) {
        console.log('Template job has no categories');
        return;
      }

      // Create categories in current job (preserve hierarchy)
      const categoriesToInsert = templateCategories.map((cat, index) => ({
        job_id: job.id,
        name: cat.name,
        order_index: index,
        parent_id: cat.parent_id,
        created_by: userId,
        sheet_image_url: cat.sheet_image_url,
      }));

      const { error: insertError } = await supabase
        .from('materials_categories')
        .insert(categoriesToInsert);

      if (insertError) throw insertError;

      console.log(`Auto-copied ${templateCategories.length} categories from ${templateJob.name}`);
      toast.success(`Categories set up from ${templateJob.name}`);
      
      // Reload materials to show new categories
      loadMaterials();
    } catch (error: any) {
      console.error('Error auto-copying template categories:', error);
    }
  }

  async function loadMaterials() {
    try {
      setLoading(true);
      
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
        .order('name');

      if (materialsError) throw materialsError;

      // Build hierarchical structure
      const categoriesWithMaterials: Category[] = (categoriesData || []).map(cat => ({
        id: cat.id,
        name: cat.name,
        order_index: cat.order_index,
        parent_id: cat.parent_id,
        sheet_image_url: cat.sheet_image_url,
        materials: (materialsData || []).filter((m: any) => m.category_id === cat.id),
        subcategories: [],
      }));

      // Separate main categories (no parent) and subcategories
      const mainCategories = categoriesWithMaterials.filter(c => !c.parent_id);
      const subCategories = categoriesWithMaterials.filter(c => c.parent_id);

      // Attach subcategories to their parents
      mainCategories.forEach(main => {
        main.subcategories = subCategories
          .filter(sub => sub.parent_id === main.id)
          .sort((a, b) => a.order_index - b.order_index);
      });

      setCategories(mainCategories);
      setAllCategoriesFlat(categoriesWithMaterials);
    } catch (error: any) {
      console.error('Error loading materials:', error);
      toast.error('Failed to load materials');
    } finally {
      setLoading(false);
    }
  }

  function toggleCategoryExpanded(categoryId: string) {
    setExpandedCategories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(categoryId)) {
        newSet.delete(categoryId);
      } else {
        newSet.add(categoryId);
      }
      return newSet;
    });
  }

  function openAddCategory(parentId?: string) {
    setEditingCategory(null);
    setCategoryName('');
    setCategoryParentId(parentId || '__NONE__');
    setCategorySheetImage(null);
    setCategorySheetPreview(null);
    setShowCategoryModal(true);
  }

  function openEditCategory(category: Category) {
    setEditingCategory(category);
    setCategoryName(category.name);
    setCategoryParentId(category.parent_id || '__NONE__');
    setCategorySheetImage(null);
    setCategorySheetPreview(category.sheet_image_url || null);
    setShowCategoryModal(true);
  }

  function handleSheetImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }

    setCategorySheetImage(file);
    const previewUrl = URL.createObjectURL(file);
    setCategorySheetPreview(previewUrl);
  }

  function removeSheetImage() {
    if (categorySheetPreview && categorySheetPreview.startsWith('blob:')) {
      URL.revokeObjectURL(categorySheetPreview);
    }
    setCategorySheetImage(null);
    setCategorySheetPreview(null);
  }

  async function saveCategory() {
    if (!categoryName.trim()) {
      toast.error('Please enter a category name');
      return;
    }

    try {
      let sheetImageUrl: string | null = null;

      // Upload sheet image if provided
      if (categorySheetImage) {
        const fileExt = categorySheetImage.name.split('.').pop();
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `${job.id}/material-sheets/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('job-files')
          .upload(filePath, categorySheetImage);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('job-files')
          .getPublicUrl(filePath);

        sheetImageUrl = publicUrl;
      }

      if (editingCategory) {
        // Update existing
        const updateData: any = { name: categoryName.trim() };
        if (sheetImageUrl) {
          updateData.sheet_image_url = sheetImageUrl;
        }
        // Allow changing parent
        updateData.parent_id = categoryParentId === '__NONE__' ? null : categoryParentId;

        const { error } = await supabase
          .from('materials_categories')
          .update(updateData)
          .eq('id', editingCategory.id);

        if (error) throw error;
        toast.success('Category updated');
      } else {
        // Create new
        const maxOrder = Math.max(...allCategoriesFlat.map(c => c.order_index), -1);
        
        const { error } = await supabase
          .from('materials_categories')
          .insert({
            job_id: job.id,
            name: categoryName.trim(),
            order_index: maxOrder + 1,
            parent_id: categoryParentId === '__NONE__' ? null : categoryParentId,
            created_by: userId,
            sheet_image_url: sheetImageUrl,
          });

        if (error) throw error;
        toast.success('Category created');
      }

      setShowCategoryModal(false);
      loadMaterials();
    } catch (error: any) {
      toast.error('Failed to save category');
      console.error(error);
    }
  }

  async function deleteCategory(categoryId: string) {
    if (!confirm('Delete this category and all its materials?')) return;

    try {
      const { error } = await supabase
        .from('materials_categories')
        .delete()
        .eq('id', categoryId);

      if (error) throw error;
      toast.success('Category deleted');
      loadMaterials();
    } catch (error: any) {
      toast.error('Failed to delete category');
      console.error(error);
    }
  }

  function openAddMaterial(categoryId: string) {
    setSelectedCategoryId(categoryId);
    setEditingMaterial(null);
    setMaterialName('');
    setMaterialQuantity('');
    setMaterialLength('');
    setMaterialColor('');
    setMaterialUseCase('');
    setMaterialStatus('not_ordered');
    setShowMaterialModal(true);
  }

  function openEditMaterial(material: Material) {
    setSelectedCategoryId(material.category_id);
    setEditingMaterial(material);
    setMaterialName(material.name);
    setMaterialQuantity(material.quantity.toString());
    setMaterialLength(material.length || '');
    setMaterialColor(material.color || '');
    setMaterialUseCase((material as any).use_case || '');
    setMaterialStatus(material.status);
    setShowMaterialModal(true);
  }

  async function quickMoveMaterial(materialId: string, newCategoryId: string) {
    try {
      const { error } = await supabase
        .from('materials')
        .update({ 
          category_id: newCategoryId,
          updated_at: new Date().toISOString() 
        })
        .eq('id', materialId);

      if (error) throw error;
      
      const newCategory = allCategoriesFlat.find(c => c.id === newCategoryId);
      toast.success(`Moved to ${newCategory?.name}`);
      loadMaterials();
    } catch (error: any) {
      toast.error('Failed to move material');
      console.error(error);
    }
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
      if (editingMaterial) {
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
        toast.success('Material updated');
      } else {
        const { error } = await supabase
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
          });

        if (error) throw error;
        toast.success('Material added');
      }

      setShowMaterialModal(false);
      loadMaterials();
    } catch (error: any) {
      toast.error('Failed to save material');
      console.error(error);
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
      const { error } = await supabase
        .from('materials')
        .update({ 
          status: newStatusValue, 
          updated_at: new Date().toISOString() 
        })
        .eq('id', materialId);

      if (error) throw error;

      toast.success(`Status updated to ${getStatusLabel(newStatusValue)}`);
      loadMaterials();
    } catch (error: any) {
      console.error('Error updating status:', error);
      toast.error('Failed to update status');
      loadMaterials();
    }
  }

  function handleStatusChange(material: Material, newStatusValue: string) {
    setStatusChangeMaterial(material);
    setNewStatus(newStatusValue);
    
    setOrderByDate('');
    setPullByDate(material.pull_by_date || '');
    setDeliveryDate(material.delivery_date || '');
    setActualDeliveryDate(material.actual_delivery_date || '');
    setPickupDate(material.pickup_date || '');
    setPickupBy(material.pickup_by || '');
    setDeliveryVendor((material as any).delivery_vendor || '');
    setPickupVendor((material as any).pickup_vendor || '');
    setDateNotes('');
    
    if (material.delivery_method) {
      setDeliveryMethod(material.delivery_method);
      setHasDeliveryMethod(true);
    } else {
      setDeliveryMethod('delivery');
      setHasDeliveryMethod(false);
    }
    
    setShowStatusDialog(true);
  }

  // confirmStatusChange remains unchanged (omitted for brevity)
  async function confirmStatusChange() {
    // (same implementation as before)
    if (!statusChangeMaterial) return;
    // ... rest of function
    toast.success(`Status updated`);
    setShowStatusDialog(false);
    setStatusChangeMaterial(null);
    loadMaterials();
  }

  function getFilteredAndSortedMaterials(categoryMaterials: Material[]) {
    let filtered = categoryMaterials.filter(material => {
      const matchesSearch = searchTerm === '' || 
        material.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (material.use_case && material.use_case.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (material.length && material.length.toLowerCase().includes(searchTerm.toLowerCase()));
      
      const matchesStatus = filterStatus === 'all' || material.status === filterStatus;
      
      return matchesSearch && matchesStatus;
    });

    filtered.sort((a, b) => {
      let compareA: any;
      let compareB: any;

      switch (sortBy) {
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

  function handleSort(column: 'name' | 'useCase' | 'quantity' | 'length' | 'color') {
    if (sortBy === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortDirection('asc');
    }
  }

  function SortIcon({ column }: { column: 'name' | 'useCase' | 'quantity' | 'length' | 'color' }) {
    if (sortBy !== column) {
      return <ArrowUpDown className="w-4 h-4 opacity-40" />;
    }
    return sortDirection === 'asc' 
      ? <ArrowUp className="w-4 h-4 text-primary" />
      : <ArrowDown className="w-4 h-4 text-primary" />;
  }

  const filteredCategories = filterCategory === 'all' 
    ? categories 
    : categories.filter(cat => cat.id === filterCategory || cat.subcategories?.some(sub => sub.id === filterCategory));

  // Render category card (for main or subcategory)
  function renderCategoryCard(category: Category, isSubcategory: boolean = false) {
    const filteredMaterials = getFilteredAndSortedMaterials(category.materials);
    const showColorColumn = /metal|trim/i.test(category.name);
    const isExpanded = expandedCategories.has(category.id);
    const hasSubcategories = category.subcategories && category.subcategories.length > 0;
    
    return (
      <Card key={category.id} className={`overflow-hidden ${isSubcategory ? 'ml-8 border-l-4 border-primary/30' : ''}`}>
        <CardHeader className={`${isSubcategory ? 'bg-gradient-to-r from-muted/50 to-muted/20 border-b' : 'bg-gradient-to-r from-primary/10 to-primary/5 border-b-2 border-primary/20'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {!isSubcategory && hasSubcategories && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => toggleCategoryExpanded(category.id)}
                  className="h-8 w-8 p-0"
                >
                  {isExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                </Button>
              )}
              <div className="flex items-center gap-2">
                {!isSubcategory && hasSubcategories ? (
                  <FolderOpen className="w-5 h-5 text-primary" />
                ) : !isSubcategory ? (
                  <Folder className="w-5 h-5 text-muted-foreground" />
                ) : null}
                <CardTitle className={`${isSubcategory ? 'text-lg font-semibold' : 'text-xl font-bold'}`}>
                  {category.name}
                </CardTitle>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => openAddMaterial(category.id)}
                className="gradient-primary"
              >
                <Plus className="w-4 h-4 mr-2" />
                Material
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => openEditCategory(category)}
              >
                <Edit className="w-4 h-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => deleteCategory(category.id)}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
          {category.sheet_image_url && (
            <div className="mt-3 p-2 bg-white rounded-lg border">
              <img
                src={category.sheet_image_url}
                alt={`${category.name} sheet`}
                className="max-h-40 w-auto mx-auto object-contain"
              />
            </div>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {filteredMaterials.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              No materials in this category
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/50 border-b">
                  <tr>
                    <th className="text-left p-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleSort('name')}
                        className="font-semibold -ml-3"
                      >
                        Material Name
                        <SortIcon column="name" />
                      </Button>
                    </th>
                    <th className="text-left p-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleSort('useCase')}
                        className="font-semibold -ml-3"
                      >
                        Use Case
                        <SortIcon column="useCase" />
                      </Button>
                    </th>
                    <th className="text-center p-3 w-[100px]">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleSort('quantity')}
                        className="font-semibold -ml-3"
                      >
                        Qty
                        <SortIcon column="quantity" />
                      </Button>
                    </th>
                    <th className="text-center p-3 w-[100px]">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleSort('length')}
                        className="font-semibold -ml-3"
                      >
                        Length
                        <SortIcon column="length" />
                      </Button>
                    </th>
                    {showColorColumn && (
                      <th className="text-center p-3 w-[120px]">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleSort('color')}
                          className="font-semibold -ml-3"
                        >
                          Color
                          <SortIcon column="color" />
                        </Button>
                      </th>
                    )}
                    <th className="text-center p-3 font-semibold w-[180px]">Status</th>
                    <th className="text-right p-3 font-semibold w-[180px]">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMaterials.map((material) => (
                    <tr key={material.id} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="p-3">
                        <div className="font-medium">{material.name}</div>
                        {material.import_source && material.import_source !== 'manual' && (
                          <Badge variant="outline" className="mt-1 text-xs">
                            {material.import_source === 'csv_import' ? 'CSV' : 'Excel'}
                          </Badge>
                        )}
                      </td>
                      <td className="p-3 text-sm text-muted-foreground">
                        <div>{material.use_case || '-'}</div>
                      </td>
                      <td className="p-3 text-center font-semibold w-[100px]">
                        {material.quantity}
                      </td>
                      <td className="p-3 text-center w-[100px]">
                        {material.length || '-'}
                      </td>
                      {showColorColumn && (
                        <td className="p-3 text-center w-[120px]">
                          {material.color ? (
                            <Badge variant="outline" className="font-medium">
                              {material.color}
                            </Badge>
                          ) : ('-')}
                        </td>
                      )}
                      <td className="p-3 w-[180px]">
                        <div className="flex justify-center">
                          <Select
                            value={material.status}
                            onValueChange={(newStatus) => handleQuickStatusChange(material.id, newStatus)}
                          >
                            <SelectTrigger className={`w-full h-9 font-medium border-2 text-xs whitespace-nowrap ${getStatusColor(material.status)}`}>
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
                      <td className="p-3 w-[180px]">
                        <div className="flex items-center justify-end gap-1">
                          <Select
                            value={material.category_id}
                            onValueChange={(newCategoryId) => quickMoveMaterial(material.id, newCategoryId)}
                          >
                            <SelectTrigger className="h-8 w-8 p-0 border-0 hover:bg-muted" title="Move to category">
                              <div className="flex items-center justify-center w-full h-full">
                                <ChevronDownIcon className="w-4 h-4" />
                              </div>
                            </SelectTrigger>
                            <SelectContent>
                              {allCategoriesFlat.map(cat => (
                                <SelectItem key={cat.id} value={cat.id}>
                                  {cat.parent_id ? `  ↳ ${cat.name}` : cat.name} {cat.id === material.category_id ? '(current)' : ''}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleStatusChange(material, material.status)}
                            title="Edit dates, notes, and delivery info"
                          >
                            <Calendar className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openEditMaterial(material)}
                            title="Edit material details"
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => deleteMaterial(material.id)}
                            className="text-destructive hover:text-destructive"
                            title="Delete material"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return <div className="text-center py-8">Loading materials...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Search & Filter Bar */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
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
                {allCategoriesFlat.map(cat => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {cat.parent_id ? `  ↳ ${cat.name}` : cat.name}
                  </SelectItem>
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

      {/* Header Actions */}
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => openAddCategory()} className="gradient-primary">
          <Plus className="w-4 h-4 mr-2" />
          Add Main Category
        </Button>
      </div>

      {/* Categories List */}
      {filteredCategories.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">No categories yet. Create a category to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredCategories.map((category) => (
            <div key={category.id} className="space-y-3">
              {renderCategoryCard(category, false)}
              {expandedCategories.has(category.id) && category.subcategories && category.subcategories.length > 0 && (
                <div className="space-y-3">
                  {category.subcategories.map(sub => renderCategoryCard(sub, true))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Category Modal */}
      <Dialog open={showCategoryModal} onOpenChange={setShowCategoryModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCategory ? 'Edit Category' : 'Create Category'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="category-name">Category Name</Label>
              <Input
                id="category-name"
                value={categoryName}
                onChange={(e) => setCategoryName(e.target.value)}
                placeholder="e.g., Lumber, Steel, Roofing"
              />
            </div>
            <div>
              <Label htmlFor="category-parent">Parent Category (Optional)</Label>
              <Select value={categoryParentId} onValueChange={setCategoryParentId}>
                <SelectTrigger id="category-parent">
                  <SelectValue placeholder="None (Main Category)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__NONE__">None (Main Category)</SelectItem>
                  {categories.filter(c => c.id !== editingCategory?.id).map(cat => (
                    <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="sheet-image">Category Sheet Image (Optional)</Label>
              <div className="space-y-2">
                {categorySheetPreview ? (
                  <div className="relative">
                    <img
                      src={categorySheetPreview}
                      alt="Sheet preview"
                      className="max-h-48 w-auto mx-auto border rounded-lg"
                    />
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={removeSheetImage}
                      className="absolute top-2 right-2"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => document.getElementById('sheet-image')?.click()}
                    className="w-full"
                  >
                    <ImageIcon className="w-4 h-4 mr-2" />
                    Upload Sheet Image
                  </Button>
                )}
                <input
                  id="sheet-image"
                  type="file"
                  accept="image/*"
                  onChange={handleSheetImageSelect}
                  className="hidden"
                />
              </div>
            </div>
            <div className="flex gap-2 pt-4">
              <Button onClick={saveCategory} className="flex-1">
                {editingCategory ? 'Update' : 'Create'}
              </Button>
              <Button variant="outline" onClick={() => setShowCategoryModal(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Material Modal */}
      <Dialog open={showMaterialModal} onOpenChange={setShowMaterialModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingMaterial ? 'Edit Material' : 'Add Material'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="material-category">Category *</Label>
              <Select value={selectedCategoryId} onValueChange={setSelectedCategoryId}>
                <SelectTrigger id="material-category">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {allCategoriesFlat.map(cat => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.parent_id ? `  ↳ ${cat.name}` : cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {editingMaterial && editingMaterial.category_id !== selectedCategoryId && (
                <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  This will move the material to a different category
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="material-name">Material Name *</Label>
              <Input
                id="material-name"
                value={materialName}
                onChange={(e) => setMaterialName(e.target.value)}
                placeholder="e.g., 2x4 Stud, Metal Panel"
              />
            </div>
            <div>
              <Label htmlFor="material-use-case">Use Case</Label>
              <Input
                id="material-use-case"
                value={materialUseCase}
                onChange={(e) => setMaterialUseCase(e.target.value)}
                placeholder="e.g., Wall framing, Roof installation"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="material-quantity">Quantity *</Label>
                <Input
                  id="material-quantity"
                  type="number"
                  step="0.01"
                  value={materialQuantity}
                  onChange={(e) => setMaterialQuantity(e.target.value)}
                  placeholder="100"
                />
              </div>
              <div>
                <Label htmlFor="material-length">Length</Label>
                <Input
                  id="material-length"
                  value={materialLength}
                  onChange={(e) => setMaterialLength(e.target.value)}
                  placeholder="e.g., 8ft, 12ft"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="material-color">Color</Label>
              <Input
                id="material-color"
                value={materialColor}
                onChange={(e) => setMaterialColor(e.target.value)}
                placeholder="e.g., White, Black, Almond"
              />
            </div>
            <div>
              <Label htmlFor="material-status">Status</Label>
              <Select value={materialStatus} onValueChange={setMaterialStatus}>
                <SelectTrigger id="material-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 pt-4">
              <Button onClick={saveMaterial} className="flex-1">
                {editingMaterial ? 'Update' : 'Add'}
              </Button>
              <Button variant="outline" onClick={() => setShowMaterialModal(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Status Dialog - omitted for brevity, same as before */}
    </div>
  );
}
