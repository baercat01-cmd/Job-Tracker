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
  ListChecks,
  Calendar,
  ShoppingCart,
  User,
  Truck,
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
  const [loading, setLoading] = useState(true);
  
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
  const [categorySheetImage, setCategorySheetImage] = useState<File | null>(null);
  const [categorySheetPreview, setCategorySheetPreview] = useState<string | null>(null);
  
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
  
  // Status change dialog with dates
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
  
  // Bulk status change
  const [showBulkStatusDialog, setShowBulkStatusDialog] = useState(false);
  const [bulkStatusTarget, setBulkStatusTarget] = useState('not_ordered');
  const [bulkStatusUpdating, setBulkStatusUpdating] = useState(false);
  
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

      const categoriesWithMaterials: Category[] = (categoriesData || []).map(cat => ({
        id: cat.id,
        name: cat.name,
        order_index: cat.order_index,
        sheet_image_url: (cat as any).sheet_image_url,
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

  function openAddCategory() {
    setEditingCategory(null);
    setCategoryName('');
    setCategorySheetImage(null);
    setCategorySheetPreview(null);
    setShowCategoryModal(true);
  }

  function openEditCategory(category: Category) {
    setEditingCategory(category);
    setCategoryName(category.name);
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

        const { error } = await supabase
          .from('materials_categories')
          .update(updateData)
          .eq('id', editingCategory.id);

        if (error) throw error;
        toast.success('Category updated');
      } else {
        // Create new
        const maxOrder = Math.max(...categories.map(c => c.order_index), -1);
        
        const { error } = await supabase
          .from('materials_categories')
          .insert({
            job_id: job.id,
            name: categoryName.trim(),
            order_index: maxOrder + 1,
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

  async function moveCategoryUp(category: Category) {
    const prevCategory = categories
      .filter(c => c.order_index < category.order_index)
      .sort((a, b) => b.order_index - a.order_index)[0];

    if (!prevCategory) return;

    try {
      await supabase
        .from('materials_categories')
        .update({ order_index: prevCategory.order_index })
        .eq('id', category.id);

      await supabase
        .from('materials_categories')
        .update({ order_index: category.order_index })
        .eq('id', prevCategory.id);

      loadMaterials();
    } catch (error: any) {
      toast.error('Failed to reorder');
      console.error(error);
    }
  }

  async function moveCategoryDown(category: Category) {
    const nextCategory = categories
      .filter(c => c.order_index > category.order_index)
      .sort((a, b) => a.order_index - b.order_index)[0];

    if (!nextCategory) return;

    try {
      await supabase
        .from('materials_categories')
        .update({ order_index: nextCategory.order_index })
        .eq('id', category.id);

      await supabase
        .from('materials_categories')
        .update({ order_index: category.order_index })
        .eq('id', nextCategory.id);

      loadMaterials();
    } catch (error: any) {
      toast.error('Failed to reorder');
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

  async function saveMaterial() {
    if (!materialName.trim() || !materialQuantity) {
      toast.error('Please enter material name and quantity');
      return;
    }

    try {
      if (editingMaterial) {
        // Update existing
        const { error } = await supabase
          .from('materials')
          .update({
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
        // Create new - mark as manual entry
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
      // Optimistically update local state first
      setCategories(prevCategories => 
        prevCategories.map(category => ({
          ...category,
          materials: category.materials.map(material => 
            material.id === materialId 
              ? { ...material, status: newStatusValue }
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

      toast.success(`Status updated to ${getStatusLabel(newStatusValue)}`);
      
      // Reload to ensure data consistency
      await loadMaterials();
    } catch (error: any) {
      console.error('Error updating status:', error);
      toast.error('Failed to update status');
      // Reload on error to revert optimistic update
      loadMaterials();
    }
  }

  function handleStatusChange(material: Material, newStatusValue: string) {
    setStatusChangeMaterial(material);
    setNewStatus(newStatusValue);
    
    // Pre-populate existing data (except order by date which should be blank)
    setOrderByDate(''); // Always blank by default
    setPullByDate(material.pull_by_date || '');
    setDeliveryDate(material.delivery_date || '');
    setActualDeliveryDate(material.actual_delivery_date || '');
    setPickupDate(material.pickup_date || '');
    setPickupBy(material.pickup_by || '');
    setDeliveryVendor((material as any).delivery_vendor || '');
    setPickupVendor((material as any).pickup_vendor || '');
    setDateNotes('');
    
    // Set delivery method if exists
    if (material.delivery_method) {
      setDeliveryMethod(material.delivery_method);
      setHasDeliveryMethod(true);
    } else {
      setDeliveryMethod('delivery');
      setHasDeliveryMethod(false);
    }
    
    setShowStatusDialog(true);
  }

  async function confirmStatusChange() {
    if (!statusChangeMaterial) return;

    // Validate only if delivery method is selected
    if (newStatus === 'ordered' && hasDeliveryMethod) {
      if (deliveryMethod === 'pickup') {
        if (!pickupBy) {
          toast.error('Please assign a user for pickup');
          return;
        }
        if (!pickupDate) {
          toast.error('Please set a pickup date');
          return;
        }
      } else if (deliveryMethod === 'delivery') {
        if (!deliveryDate) {
          toast.error('Please set a delivery date');
          return;
        }
      }
    }

    setSubmittingStatus(true);
    try {
      const updateData: any = {
        status: newStatus,
        updated_at: new Date().toISOString(),
      };

      // Update dates based on status
      if (newStatus === 'ordered') {
        if (orderByDate) updateData.order_by_date = orderByDate;
        
        if (hasDeliveryMethod) {
          updateData.delivery_method = deliveryMethod;
          
          if (deliveryMethod === 'delivery') {
            if (deliveryDate) updateData.delivery_date = deliveryDate;
            if (deliveryVendor) updateData.delivery_vendor = deliveryVendor;
            updateData.pickup_by = null;
            updateData.pickup_date = null;
            updateData.pickup_vendor = null;
          } else if (deliveryMethod === 'pickup') {
            updateData.pickup_by = pickupBy;
            if (pickupDate) updateData.pickup_date = pickupDate;
            if (pickupVendor) updateData.pickup_vendor = pickupVendor;
            updateData.delivery_date = null;
            updateData.delivery_vendor = null;
          }
        } else {
          // Clear delivery method fields if not selected
          updateData.delivery_method = null;
          updateData.delivery_date = null;
          updateData.delivery_vendor = null;
          updateData.pickup_by = null;
          updateData.pickup_date = null;
          updateData.pickup_vendor = null;
        }
        
        updateData.ordered_by = userId;
        updateData.order_requested_at = new Date().toISOString();
      } else if (newStatus === 'at_shop') {
        if (pullByDate) updateData.pull_by_date = pullByDate;
      } else if (newStatus === 'at_job') {
        if (actualDeliveryDate) updateData.actual_delivery_date = actualDeliveryDate;
        
        // If pickup method, mark as picked up
        if (statusChangeMaterial.delivery_method === 'pickup') {
          updateData.actual_pickup_date = actualDeliveryDate;
        }
      }

      if (dateNotes) {
        updateData.notes = dateNotes;
      }

      const { error } = await supabase
        .from('materials')
        .update(updateData)
        .eq('id', statusChangeMaterial.id);

      if (error) throw error;

      // Create/update/delete calendar event for order-by date
      if (orderByDate) {
        console.log('Creating/updating order-by-date calendar task:', {
          material: statusChangeMaterial.name,
          orderByDate,
          jobId: job.id,
        });
        
        // Check if calendar event already exists for this material's order reminder
        const { data: existingEvent, error: searchError } = await supabase
          .from('calendar_events')
          .select('id')
          .eq('job_id', job.id)
          .eq('event_type', 'material_order_reminder')
          .eq('title', `Order Material: ${statusChangeMaterial.name}`)
          .maybeSingle();

        if (searchError) {
          console.error('Error searching for existing order reminder event:', searchError);
        }

        if (existingEvent) {
          // Update existing event
          console.log('Updating existing order reminder event:', existingEvent.id);
          const { error: updateError } = await supabase
            .from('calendar_events')
            .update({
              event_date: orderByDate,
              description: `Reminder to order ${statusChangeMaterial.quantity}${statusChangeMaterial.length ? ` x ${statusChangeMaterial.length}` : ''} ${statusChangeMaterial.name}\n\nUse: ${statusChangeMaterial.use_case || 'Not specified'}`,
            })
            .eq('id', existingEvent.id);
          
          if (updateError) {
            console.error('Error updating order reminder event:', updateError);
            throw updateError;
          }
          console.log('Order reminder event updated successfully');
        } else {
          // Create new event
          console.log('Creating new order reminder event');
          const { data: newEvent, error: insertError } = await supabase
            .from('calendar_events')
            .insert({
              job_id: job.id,
              title: `Order Material: ${statusChangeMaterial.name}`,
              description: `Reminder to order ${statusChangeMaterial.quantity}${statusChangeMaterial.length ? ` x ${statusChangeMaterial.length}` : ''} ${statusChangeMaterial.name}\n\nUse: ${statusChangeMaterial.use_case || 'Not specified'}`,
              event_date: orderByDate,
              event_type: 'material_order_reminder',
              all_day: true,
              created_by: userId,
            })
            .select();
          
          if (insertError) {
            console.error('Error creating order reminder event:', insertError);
            throw insertError;
          }
          console.log('Order reminder event created successfully:', newEvent);
        }
      } else if (statusChangeMaterial.order_by_date) {
        // If order by date was removed, delete the calendar event
        console.log('Deleting order reminder calendar event for:', statusChangeMaterial.name);
        const { error: deleteError } = await supabase
          .from('calendar_events')
          .delete()
          .eq('job_id', job.id)
          .eq('event_type', 'material_order_reminder')
          .eq('title', `Order Material: ${statusChangeMaterial.name}`);
        
        if (deleteError) {
          console.error('Error deleting order reminder event:', deleteError);
        }
      }

      // Create/update calendar event for pickup (if pickup info provided)
      if (hasDeliveryMethod && deliveryMethod === 'pickup' && pickupBy && pickupDate) {
        const assignedUser = users.find(u => u.id === pickupBy);
        const materialName = statusChangeMaterial.name;
        const pickupDateStr = new Date(pickupDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        
        // Create notification for assigned user
        if (newStatus === 'ordered' || statusChangeMaterial.pickup_by !== pickupBy) {
          await supabase
            .from('notifications')
            .insert({
              job_id: job.id,
              created_by: userId,
              type: 'material_request',
              brief: `Pickup assigned: ${materialName} (Qty: ${statusChangeMaterial.quantity}${statusChangeMaterial.length ? `, ${statusChangeMaterial.length}` : ''}) - Pickup by ${pickupDateStr}`,
              reference_id: statusChangeMaterial.id,
              reference_data: {
                material_name: materialName,
                quantity: statusChangeMaterial.quantity,
                length: statusChangeMaterial.length,
                pickup_date: pickupDate,
                assigned_to: assignedUser?.username || assignedUser?.email,
                assigned_to_id: pickupBy,
              },
              is_read: false,
            });
        }

        // Create or update calendar event for pickup
        const pickupDesc = [
          `Pickup ${statusChangeMaterial.quantity}${statusChangeMaterial.length ? ` x ${statusChangeMaterial.length}` : ''} ${materialName}`,
          `Use: ${statusChangeMaterial.use_case || 'Not specified'}`,
          `Assigned to: ${assignedUser?.username || assignedUser?.email}`,
        ];
        if (pickupVendor) pickupDesc.push(`Vendor: ${pickupVendor}`);

        // Check if calendar event already exists for this material's pickup
        const { data: existingPickupEvent, error: searchPickupError } = await supabase
          .from('calendar_events')
          .select('id')
          .eq('job_id', job.id)
          .eq('event_type', 'material_pickup')
          .eq('title', `Material Pickup: ${materialName}`)
          .maybeSingle();

        if (searchPickupError) {
          console.error('Error searching for existing pickup event:', searchPickupError);
        }

        if (existingPickupEvent) {
          // Update existing event
          console.log('Updating existing pickup event:', existingPickupEvent.id);
          const { error: updatePickupError } = await supabase
            .from('calendar_events')
            .update({
              event_date: pickupDate,
              description: pickupDesc.join('\n\n'),
            })
            .eq('id', existingPickupEvent.id);
          
          if (updatePickupError) {
            console.error('Error updating pickup event:', updatePickupError);
            throw updatePickupError;
          }
          console.log('Pickup event updated successfully');
        } else {
          // Create new pickup calendar event
          console.log('Creating new pickup calendar event');
          const { data: newPickupEvent, error: insertPickupError } = await supabase
            .from('calendar_events')
            .insert({
              job_id: job.id,
              title: `Material Pickup: ${materialName}`,
              description: pickupDesc.join('\n\n'),
              event_date: pickupDate,
              event_type: 'material_pickup',
              all_day: true,
              created_by: userId,
            })
            .select();
          
          if (insertPickupError) {
            console.error('Error creating pickup event:', insertPickupError);
            throw insertPickupError;
          }
          console.log('Pickup event created successfully:', newPickupEvent);
        }
      } else if (statusChangeMaterial.delivery_method === 'pickup' && statusChangeMaterial.pickup_date && (!hasDeliveryMethod || deliveryMethod !== 'pickup' || !pickupDate)) {
        // If pickup date was removed or delivery method changed from pickup, delete the calendar event
        console.log('Deleting pickup calendar event for:', statusChangeMaterial.name);
        const { error: deletePickupError } = await supabase
          .from('calendar_events')
          .delete()
          .eq('job_id', job.id)
          .eq('event_type', 'material_pickup')
          .eq('title', `Material Pickup: ${statusChangeMaterial.name}`);
        
        if (deletePickupError) {
          console.error('Error deleting pickup event:', deletePickupError);
        }
      }

      // Create/update calendar event for delivery
      if (hasDeliveryMethod && deliveryMethod === 'delivery' && deliveryDate) {
        const deliveryDesc = [
          `Delivery of ${statusChangeMaterial.quantity}${statusChangeMaterial.length ? ` x ${statusChangeMaterial.length}` : ''} ${statusChangeMaterial.name}`,
          `Use: ${statusChangeMaterial.use_case || 'Not specified'}`,
        ];
        if (deliveryVendor) deliveryDesc.push(`Vendor: ${deliveryVendor}`);
        
        // Check if calendar event already exists for this material's delivery
        const { data: existingDeliveryEvent, error: searchDeliveryError } = await supabase
          .from('calendar_events')
          .select('id')
          .eq('job_id', job.id)
          .eq('event_type', 'material_delivery')
          .eq('title', `Material Delivery: ${statusChangeMaterial.name}`)
          .maybeSingle();

        if (searchDeliveryError) {
          console.error('Error searching for existing delivery event:', searchDeliveryError);
        }

        if (existingDeliveryEvent) {
          // Update existing event
          console.log('Updating existing delivery event:', existingDeliveryEvent.id);
          const { error: updateDeliveryError } = await supabase
            .from('calendar_events')
            .update({
              event_date: deliveryDate,
              description: deliveryDesc.join('\n\n'),
            })
            .eq('id', existingDeliveryEvent.id);
          
          if (updateDeliveryError) {
            console.error('Error updating delivery event:', updateDeliveryError);
            throw updateDeliveryError;
          }
          console.log('Delivery event updated successfully');
        } else {
          // Create new delivery calendar event
          console.log('Creating new delivery calendar event');
          const { data: newDeliveryEvent, error: insertDeliveryError } = await supabase
            .from('calendar_events')
            .insert({
              job_id: job.id,
              title: `Material Delivery: ${statusChangeMaterial.name}`,
              description: deliveryDesc.join('\n\n'),
              event_date: deliveryDate,
              event_type: 'material_delivery',
              all_day: true,
              created_by: userId,
            })
            .select();
          
          if (insertDeliveryError) {
            console.error('Error creating delivery event:', insertDeliveryError);
            throw insertDeliveryError;
          }
          console.log('Delivery event created successfully:', newDeliveryEvent);
        }
      } else if (statusChangeMaterial.delivery_method === 'delivery' && statusChangeMaterial.delivery_date && (!hasDeliveryMethod || deliveryMethod !== 'delivery' || !deliveryDate)) {
        // If delivery date was removed or delivery method changed from delivery, delete the calendar event
        console.log('Deleting delivery calendar event for:', statusChangeMaterial.name);
        const { error: deleteDeliveryError } = await supabase
          .from('calendar_events')
          .delete()
          .eq('job_id', job.id)
          .eq('event_type', 'material_delivery')
          .eq('title', `Material Delivery: ${statusChangeMaterial.name}`);
        
        if (deleteDeliveryError) {
          console.error('Error deleting delivery event:', deleteDeliveryError);
        }
      }

      // When status changes to at_shop (Ready for Job), clean up order/delivery/pickup events
      if (newStatus === 'at_shop') {
        // Delete order reminder events
        await supabase
          .from('calendar_events')
          .delete()
          .eq('job_id', job.id)
          .eq('event_type', 'material_order_reminder')
          .eq('title', `Order Material: ${statusChangeMaterial.name}`);
        
        // Delete delivery events
        await supabase
          .from('calendar_events')
          .delete()
          .eq('job_id', job.id)
          .eq('event_type', 'material_delivery')
          .eq('title', `Material Delivery: ${statusChangeMaterial.name}`);
        
        // Delete pickup events
        await supabase
          .from('calendar_events')
          .delete()
          .eq('job_id', job.id)
          .eq('event_type', 'material_pickup')
          .eq('title', `Material Pickup: ${statusChangeMaterial.name}`);
        
        // Create calendar event for pull-by date if specified
        if (pullByDate) {
          await supabase
            .from('calendar_events')
            .insert({
              job_id: job.id,
              title: `Pull Material: ${statusChangeMaterial.name}`,
              description: `Pull ${statusChangeMaterial.quantity}${statusChangeMaterial.length ? ` x ${statusChangeMaterial.length}` : ''} ${statusChangeMaterial.name} from shop\n\nUse: ${statusChangeMaterial.use_case || 'Not specified'}`,
              event_date: pullByDate,
              event_type: 'material_pull',
              all_day: true,
              created_by: userId,
            });
        }
      }
      
      // When status changes to at_job, clean up pull events
      if (newStatus === 'at_job') {
        await supabase
          .from('calendar_events')
          .delete()
          .eq('job_id', job.id)
          .eq('event_type', 'material_pull')
          .eq('title', `Pull Material: ${statusChangeMaterial.name}`);
      }

      toast.success(`Status updated to ${getStatusLabel(newStatus)}`);
      setShowStatusDialog(false);
      setStatusChangeMaterial(null);
      loadMaterials();
    } catch (error: any) {
      toast.error('Failed to update status');
      console.error(error);
    } finally {
      setSubmittingStatus(false);
    }
  }

  // Continue from here... (remaining functions unchanged)
  async function handleCsvUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileExt = file.name.split('.').pop()?.toLowerCase();
    setFileExtension(fileExt || '');
    
    if (fileExt === 'xlsx' || fileExt === 'xls') {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const data = event.target?.result;
          const workbook = XLSX.read(data, { type: 'binary' });
          
          const allRows: any[] = [];
          let commonHeaders: string[] = [];
          
          for (let i = 0; i < workbook.SheetNames.length; i++) {
            const sheetName = workbook.SheetNames[i];
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
            
            if (jsonData.length < 2) continue;

            const headers = (jsonData[0] as any[]).map(h => String(h || '').trim());
            
            if (i === 0 || commonHeaders.length === 0) {
              commonHeaders = headers;
            }
            
            const sheetRows = jsonData.slice(1).map((row: any) => {
              const rowObj: any = {};
              headers.forEach((header, index) => {
                rowObj[header] = String(row[index] || '').trim();
              });
              
              const categoryHeader = headers.find(h => /category|type|group/i.test(h));
              if (!categoryHeader) {
                rowObj['Category'] = sheetName;
              } else if (!rowObj[categoryHeader]) {
                rowObj[categoryHeader] = sheetName;
              }
              
              return rowObj;
            }).filter(row => {
              const hasData = Object.values(row).some(val => val !== '' && val !== sheetName);
              return hasData;
            });
            
            allRows.push(...sheetRows);
          }
          
          if (allRows.length === 0) {
            toast.error('Excel file contains no valid data rows');
            return;
          }
          
          if (!commonHeaders.find(h => /category|type|group/i.test(h))) {
            commonHeaders.unshift('Category');
          }

          setCsvColumns(commonHeaders);
          setCsvData(allRows);

          const autoMapping = {
            category: commonHeaders.find(c => /category|type|group/i.test(c)) || 'Category',
            name: commonHeaders.find(c => /name|material|item|description/i.test(c)) || '',
            useCase: commonHeaders.find(c => /use.case|usage|use|purpose|application/i.test(c)) || '',
            quantity: commonHeaders.find(c => /quantity|qty|amount|count/i.test(c)) || '',
            length: commonHeaders.find(c => /length|size|dimension/i.test(c)) || '',
          };
          
          setColumnMapping(autoMapping);
          setImportStep('columns');
          setShowCsvDialog(true);
          
          toast.success(`Loaded ${workbook.SheetNames.length} worksheet(s) with ${allRows.length} total rows`);
        } catch (error: any) {
          toast.error('Failed to parse Excel file');
          console.error('Excel parse error:', error);
        }
      };
      reader.readAsBinaryString(file);
    } else {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const text = event.target?.result as string;
          const lines = text.split('\n').filter(line => line.trim());
          
          if (lines.length < 2) {
            toast.error('CSV file must have at least a header row and one data row');
            return;
          }

          const headers = lines[0].split(',').map(h => h.trim());
          const rows = lines.slice(1).map(line => {
            const values = line.split(',').map(v => v.trim());
            const row: any = {};
            headers.forEach((header, index) => {
              row[header] = values[index] || '';
            });
            return row;
          });

          setCsvColumns(headers);
          setCsvData(rows);

          const autoMapping = {
            category: headers.find(c => /category|type|group/i.test(c)) || '',
            name: headers.find(c => /name|material|item|description/i.test(c)) || '',
            useCase: headers.find(c => /use.case|usage|use|purpose|application/i.test(c)) || '',
            quantity: headers.find(c => /quantity|qty|amount|count/i.test(c)) || '',
            length: headers.find(c => /length|size|dimension/i.test(c)) || '',
          };
          
          setColumnMapping(autoMapping);
          setImportStep('columns');
          setShowCsvDialog(true);
        } catch (error: any) {
          toast.error('Failed to parse CSV file');
          console.error('CSV parse error:', error);
        }
      };
      reader.readAsText(file);
    }
    
    e.target.value = '';
  }

  function proceedToCategories() {
    if (!columnMapping.category || !columnMapping.name || !columnMapping.quantity) {
      toast.error('Please map Category, Name, and Quantity columns');
      return;
    }

    const uniqueCategories = Array.from(
      new Set(
        csvData
          .map((row: any) => row[columnMapping.category])
          .filter(Boolean)
          .map(String)
      )
    ) as string[];

    setCsvCategories(uniqueCategories);
    
    const initialMapping: Record<string, string> = {};
    uniqueCategories.forEach(csvCat => {
      const existingMatch = categories.find(
        c => c.name.toLowerCase() === csvCat.toLowerCase()
      );
      if (existingMatch) {
        initialMapping[csvCat] = existingMatch.id;
      } else {
        initialMapping[csvCat] = 'CREATE_NEW';
      }
    });
    setCategoryMapping(initialMapping);
    setImportStep('categories');
  }

  function downloadCategoryTemplate(category: Category) {
    const headers = ['Category', 'Material', 'Use Case', 'Quantity', 'Length'];
    
    let rows: string[][];
    if (category.materials.length > 0) {
      rows = category.materials.map(m => [
        category.name,
        m.name,
        (m as any).use_case || '',
        m.quantity.toString(),
        m.length || '',
      ]);
    } else {
      rows = [
        [category.name, 'Example Material 1', 'Foundation work', '100', '8ft'],
        [category.name, 'Example Material 2', 'Framing', '50', '12ft'],
        [category.name, 'Example Material 3', 'Roofing installation', '200', '16ft'],
      ];
    }

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    const fileName = `${category.name.replace(/\s+/g, '_')}_materials_${job.name.replace(/\s+/g, '_')}.csv`;
    link.setAttribute('href', url);
    link.setAttribute('download', fileName);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast.success(`${category.name} template downloaded`);
  }

  function downloadAllTemplate() {
    const headers = ['Category', 'Material', 'Use Case', 'Quantity', 'Length'];
    const exampleRows = [
      ['Lumber', '2x4 Stud', 'Wall framing', '100', '8ft'],
      ['Lumber', '2x6 Joist', 'Floor joists', '50', '12ft'],
      ['Steel', 'I-Beam', 'Main support', '20', '20ft'],
      ['Roofing', 'Metal Panel', 'Roof covering', '200', '16ft'],
      ['Hardware', 'Bolts 1/2"', 'General fastening', '500', ''],
    ];

    const csvContent = [
      headers.join(','),
      ...exampleRows.map(row => row.join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', `materials_template_${job.name.replace(/\s+/g, '_')}.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast.success('Template downloaded - open in Excel, fill it out, and save as CSV');
  }

  async function processCsvImport() {
    setUploading(true);
    try {
      const categoriesToCreate = Object.entries(categoryMapping)
        .filter(([_, value]) => value === 'CREATE_NEW')
        .map(([key]) => key);

      const newCategoryIds: Record<string, string> = {};
      
      for (const catName of categoriesToCreate) {
        const maxOrder = Math.max(...categories.map(c => c.order_index), -1);
        const { data, error } = await supabase
          .from('materials_categories')
          .insert({
            job_id: job.id,
            name: catName,
            order_index: maxOrder + 1 + categoriesToCreate.indexOf(catName),
            created_by: userId,
          })
          .select()
          .single();

        if (error) throw error;
        newCategoryIds[catName] = data.id;
      }

      const finalMapping: Record<string, string> = {};
      Object.entries(categoryMapping).forEach(([excelCat, value]) => {
        if (value === 'CREATE_NEW') {
          finalMapping[excelCat] = newCategoryIds[excelCat];
        } else {
          finalMapping[excelCat] = value;
        }
      });

      const importSource = fileExtension === 'csv' ? 'csv_import' : 'excel_import';
      const categoryIdsBeingImported = Object.values(finalMapping);

      let deleted = 0;
      for (const categoryId of categoryIdsBeingImported) {
        const { data: deletedMaterials, error: deleteError } = await supabase
          .from('materials')
          .delete()
          .eq('job_id', job.id)
          .eq('category_id', categoryId)
          .in('import_source', ['csv_import', 'excel_import'])
          .eq('status', 'not_ordered')
          .select('id');

        if (deleteError) throw deleteError;
        deleted += deletedMaterials?.length || 0;
      }

      const materialsToInsert: any[] = [];
      let skipped = 0;
      let preserved = 0;

      for (const row of csvData) {
        const category = String(row[columnMapping.category] || '').trim();
        const name = String(row[columnMapping.name] || '').trim();
        const quantityStr = String(row[columnMapping.quantity] || '0');
        const quantity = parseFloat(quantityStr) || 0;
        const length = columnMapping.length ? String(row[columnMapping.length] || '').trim() : '';
        const useCase = columnMapping.useCase ? String(row[columnMapping.useCase] || '').trim() : '';

        if (!category || !name || quantity === 0) {
          skipped++;
          continue;
        }

        const categoryId = finalMapping[category];
        if (!categoryId) {
          skipped++;
          continue;
        }

        const { data: existingManual } = await supabase
          .from('materials')
          .select('id, import_source, status')
          .eq('job_id', job.id)
          .eq('category_id', categoryId)
          .eq('name', name)
          .eq('length', length || null)
          .limit(1)
          .single();

        if (existingManual) {
          const shouldPreserve = 
            existingManual.import_source === 'manual' || 
            existingManual.status !== 'not_ordered';

          if (shouldPreserve) {
            preserved++;
            continue;
          }
        }

        materialsToInsert.push({
          job_id: job.id,
          category_id: categoryId,
          name,
          quantity,
          length: length || null,
          use_case: useCase || null,
          status: 'not_ordered',
          created_by: userId,
          import_source: importSource,
        });
      }

      if (materialsToInsert.length > 0) {
        const { error: insertError } = await supabase
          .from('materials')
          .insert(materialsToInsert);
        if (insertError) throw insertError;
      }

      const messageParts = [];
      if (deleted > 0) messageParts.push(`${deleted} replaced`);
      if (materialsToInsert.length > 0) messageParts.push(`${materialsToInsert.length} imported`);
      if (preserved > 0) messageParts.push(`${preserved} preserved`);
      if (skipped > 0) messageParts.push(`${skipped} skipped`);
      
      const message = `Import complete: ${messageParts.join(', ')}`;
      
      toast.success(message);
      setShowCsvDialog(false);
      loadMaterials();
    } catch (error: any) {
      toast.error(`Import failed: ${error.message}`);
      console.error('Import error:', error);
    } finally {
      setUploading(false);
    }
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
    : categories.filter(cat => cat.id === filterCategory);

  async function quickMarkAsOnSite(materialId: string) {
    try {
      const { error } = await supabase
        .from('materials')
        .update({ 
          status: 'at_job', 
          actual_delivery_date: new Date().toISOString().split('T')[0],
          updated_at: new Date().toISOString() 
        })
        .eq('id', materialId);
      
      if (error) throw error;
      toast.success('Marked as on-site');
      loadMaterials();
    } catch (error: any) {
      toast.error('Failed to update status');
      console.error(error);
    }
  }

  async function bulkChangeStatus() {
    setBulkStatusUpdating(true);
    try {
      let materialsToUpdate: string[] = [];
      
      if (filterCategory === 'all') {
        categories.forEach(category => {
          const filtered = getFilteredAndSortedMaterials(category.materials);
          materialsToUpdate.push(...filtered.map(m => m.id));
        });
      } else {
        const category = categories.find(c => c.id === filterCategory);
        if (category) {
          const filtered = getFilteredAndSortedMaterials(category.materials);
          materialsToUpdate.push(...filtered.map(m => m.id));
        }
      }

      if (materialsToUpdate.length === 0) {
        toast.error('No materials to update');
        return;
      }

      const { error } = await supabase
        .from('materials')
        .update({ 
          status: bulkStatusTarget, 
          updated_at: new Date().toISOString() 
        })
        .in('id', materialsToUpdate);

      if (error) throw error;

      toast.success(`Updated ${materialsToUpdate.length} material(s) to "${getStatusLabel(bulkStatusTarget)}"`);
      setShowBulkStatusDialog(false);
      loadMaterials();
    } catch (error: any) {
      toast.error('Failed to update materials');
      console.error(error);
    } finally {
      setBulkStatusUpdating(false);
    }
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
            {/* Search */}
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

            {/* Category Filter */}
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

            {/* Status Filter */}
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

      {/* Category Tabs */}
      {categories.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b">
          <Button
            variant={filterCategory === 'all' ? 'default' : 'outline'}
            onClick={() => setFilterCategory('all')}
            className={filterCategory === 'all' ? 'gradient-primary' : ''}
          >
            All Sections
          </Button>
          {categories.map((cat) => (
            <Button
              key={cat.id}
              variant={filterCategory === cat.id ? 'default' : 'outline'}
              onClick={() => setFilterCategory(cat.id)}
              className={filterCategory === cat.id ? 'gradient-primary' : ''}
            >
              {cat.name}
            </Button>
          ))}
        </div>
      )}

      {/* Header Actions */}
      <div className="flex flex-wrap gap-2">
        <Button onClick={openAddCategory} className="gradient-primary">
          <Plus className="w-4 h-4 mr-2" />
          Add Category
        </Button>
        <Button
          onClick={downloadAllTemplate}
          variant="outline"
          className="bg-green-50 hover:bg-green-100 border-green-300"
        >
          <FileSpreadsheet className="w-4 h-4 mr-2" />
          Download Template (All)
        </Button>
        <Button
          onClick={() => document.getElementById('csv-upload')?.click()}
          variant="outline"
        >
          <Upload className="w-4 h-4 mr-2" />
          Import Excel/CSV
        </Button>
        <input
          id="csv-upload"
          type="file"
          accept=".csv,.xlsx,.xls"
          onChange={handleCsvUpload}
          className="hidden"
        />
      </div>

      {/* Categories List - Too long, continuing with Dialog components */}
      {/* Status Change Dialog with Pickup/Delivery */}
      <Dialog open={showStatusDialog} onOpenChange={setShowStatusDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              Update Material Status & Timeline
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="bg-primary/5 rounded-lg p-4 border border-primary/20">
              <p className="font-semibold text-base">{statusChangeMaterial?.name}</p>
              {statusChangeMaterial?.use_case && (
                <p className="text-sm text-muted-foreground mt-1">Use: {statusChangeMaterial.use_case}</p>
              )}
              <div className="flex items-center gap-4 mt-2 text-sm">
                <span>Qty: <span className="font-semibold">{statusChangeMaterial?.quantity}</span></span>
                {statusChangeMaterial?.length && (
                  <span>Length: <span className="font-semibold">{statusChangeMaterial.length}</span></span>
                )}
              </div>
              <div className="mt-3 pt-3 border-t">
                <p className="text-sm font-medium mb-1">Status Change:</p>
                <div className="flex items-center gap-2">
                  <Badge className={getStatusColor(statusChangeMaterial?.status || 'not_ordered')}>
                    {getStatusLabel(statusChangeMaterial?.status || 'not_ordered')}
                  </Badge>
                  <span>→</span>
                  <Badge className={getStatusColor(newStatus)}>
                    {getStatusLabel(newStatus)}
                  </Badge>
                </div>
              </div>
            </div>

            {/* Date inputs based on status */}
            {newStatus === 'not_ordered' && (
              <div className="space-y-4">
                {/* Order By Date - Planning */}
                <div className="border rounded-lg p-4 bg-muted/30">
                  <Label htmlFor="order-by-date" className="flex items-center gap-2 text-base font-semibold mb-3">
                    <Calendar className="w-4 h-4" />
                    Order By Date (Planning)
                  </Label>
                  <Input
                    id="order-by-date"
                    type="date"
                    value={orderByDate}
                    onChange={(e) => setOrderByDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    className="h-10"
                  />
                  <p className="text-xs text-muted-foreground mt-2">
                    Set a target date for when this material should be ordered. Creates a calendar reminder.
                  </p>
                </div>
              </div>
            )}

            {newStatus === 'ordered' && (
              <div className="space-y-4">
                {/* Order By Date - Optional Reminder */}
                <div className="border rounded-lg p-4 bg-muted/30">
                  <Label htmlFor="order-by-date" className="flex items-center gap-2 text-base font-semibold mb-3">
                    <Calendar className="w-4 h-4" />
                    Order By Date (Optional)
                  </Label>
                  <Input
                    id="order-by-date"
                    type="date"
                    value={orderByDate}
                    onChange={(e) => setOrderByDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    className="h-10"
                  />
                  <p className="text-xs text-muted-foreground mt-2">
                    Creates a calendar reminder to order this material. Leave blank if not needed.
                  </p>
                </div>

                {/* Delivery/Pickup Section - Optional */}
                <div className="border-2 rounded-lg p-4 bg-background">
                  <div className="flex items-center justify-between mb-3">
                    <Label className="text-base font-semibold">
                      Delivery/Pickup Information (Optional)
                    </Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setHasDeliveryMethod(!hasDeliveryMethod)}
                      className="h-8"
                    >
                      {hasDeliveryMethod ? 'Remove' : 'Add'}
                    </Button>
                  </div>

                  {hasDeliveryMethod && (
                    <div className="space-y-3">
                      {/* Method Selection */}
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          type="button"
                          variant={deliveryMethod === 'delivery' ? 'default' : 'outline'}
                          onClick={() => setDeliveryMethod('delivery')}
                          className="h-12"
                        >
                          <Truck className="w-4 h-4 mr-2" />
                          Delivery
                        </Button>
                        <Button
                          type="button"
                          variant={deliveryMethod === 'pickup' ? 'default' : 'outline'}
                          onClick={() => setDeliveryMethod('pickup')}
                          className="h-12"
                        >
                          <User className="w-4 h-4 mr-2" />
                          Pickup
                        </Button>
                      </div>

                      {/* Delivery-specific fields */}
                      {deliveryMethod === 'delivery' && (
                        <>
                          <div>
                            <Label htmlFor="delivery-date">
                              Delivery Date *
                            </Label>
                            <Input
                              id="delivery-date"
                              type="date"
                              value={deliveryDate}
                              onChange={(e) => setDeliveryDate(e.target.value)}
                              min={new Date().toISOString().split('T')[0]}
                              className="h-10"
                            />
                            <p className="text-xs text-muted-foreground mt-1">
                              Will be added to calendar
                            </p>
                          </div>
                          <div>
                            <Label htmlFor="delivery-vendor">
                              Delivering To (Vendor)
                            </Label>
                            <Input
                              id="delivery-vendor"
                              value={deliveryVendor}
                              onChange={(e) => setDeliveryVendor(e.target.value)}
                              placeholder="e.g., ABC Supply, Job Site"
                              className="h-10"
                            />
                          </div>
                        </>
                      )}

                      {/* Pickup-specific fields */}
                      {deliveryMethod === 'pickup' && (
                        <>
                          <div>
                            <Label htmlFor="pickup-by">
                              Assign Pickup To *
                            </Label>
                            <Select value={pickupBy} onValueChange={setPickupBy}>
                              <SelectTrigger id="pickup-by" className="h-10">
                                <SelectValue placeholder="Select user" />
                              </SelectTrigger>
                              <SelectContent>
                                {users.map((user) => (
                                  <SelectItem key={user.id} value={user.id}>
                                    {user.username || user.email}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground mt-1">
                              User will receive notification
                            </p>
                          </div>
                          <div>
                            <Label htmlFor="pickup-vendor">
                              Picking Up From (Vendor)
                            </Label>
                            <Input
                              id="pickup-vendor"
                              value={pickupVendor}
                              onChange={(e) => setPickupVendor(e.target.value)}
                              placeholder="e.g., ABC Supply, Shop"
                              className="h-10"
                            />
                          </div>
                          <div>
                            <Label htmlFor="pickup-date">
                              Pickup Date *
                            </Label>
                            <Input
                              id="pickup-date"
                              type="date"
                              value={pickupDate}
                              onChange={(e) => setPickupDate(e.target.value)}
                              min={new Date().toISOString().split('T')[0]}
                              className="h-10"
                            />
                            <p className="text-xs text-muted-foreground mt-1">
                              Will be added to calendar
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {!hasDeliveryMethod && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      Click "Add" to include delivery/pickup information
                    </p>
                  )}
                </div>
              </div>
            )}

            {newStatus === 'at_shop' && (
              <div className="border rounded-lg p-4 bg-muted/30">
                <Label htmlFor="pull-by-date" className="flex items-center gap-2 text-base font-semibold mb-3">
                  <Calendar className="w-4 h-4" />
                  Pull By Date (Optional)
                </Label>
                <Input
                  id="pull-by-date"
                  type="date"
                  value={pullByDate}
                  onChange={(e) => setPullByDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className="h-10"
                />
                <p className="text-xs text-muted-foreground mt-2">
                  Creates a calendar reminder to pull this material from shop. Leave blank if not needed.
                </p>
              </div>
            )}

            {newStatus === 'at_job' && (
              <div className="border rounded-lg p-4 bg-muted/30">
                <Label htmlFor="actual-delivery-date" className="flex items-center gap-2 text-base font-semibold mb-3">
                  <Calendar className="w-4 h-4" />
                  Actual Arrival Date (Optional)
                </Label>
                <Input
                  id="actual-delivery-date"
                  type="date"
                  value={actualDeliveryDate}
                  onChange={(e) => setActualDeliveryDate(e.target.value)}
                  max={new Date().toISOString().split('T')[0]}
                  className="h-10"
                />
                <p className="text-xs text-muted-foreground mt-2">
                  When material actually arrived at job site. Leave blank if not needed.
                </p>
              </div>
            )}

            <div>
              <Label htmlFor="date-notes">Notes (Optional)</Label>
              <Input
                id="date-notes"
                value={dateNotes}
                onChange={(e) => setDateNotes(e.target.value)}
                placeholder="Any additional notes..."
                className="h-10"
              />
            </div>

            <div className="flex flex-col gap-3 pt-4 border-t">
              <Button
                onClick={confirmStatusChange}
                disabled={submittingStatus}
                className="h-12 gradient-primary"
              >
                {submittingStatus ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    Updating...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-5 h-5 mr-2" />
                    {statusChangeMaterial?.status === newStatus ? 'Update Information' : 'Confirm Status Change'}
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowStatusDialog(false)}
                disabled={submittingStatus}
                className="h-12"
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Materials List */}
      {filteredCategories.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">No categories yet. Create a category to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredCategories.map((category) => {
            const filteredMaterials = getFilteredAndSortedMaterials(category.materials);
            const showColorColumn = /metal|trim/i.test(category.name);
            
            return (
              <Card key={category.id} className="overflow-hidden">
                <CardHeader className="bg-gradient-to-r from-primary/10 to-primary/5 border-b-2 border-primary/20">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <CardTitle className="text-xl font-bold">{category.name}</CardTitle>
                      <Badge variant="secondary" className="font-semibold">
                        {filteredMaterials.length} {filteredMaterials.length === 1 ? 'item' : 'items'}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => downloadCategoryTemplate(category)}
                        className="bg-green-50 hover:bg-green-100 border-green-300"
                      >
                        <FileSpreadsheet className="w-4 h-4 mr-2" />
                        Template
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => openAddMaterial(category.id)}
                        className="gradient-primary"
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Add Material
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
                        onClick={() => moveCategoryUp(category)}
                        disabled={category.order_index === 0}
                      >
                        <ChevronUp className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => moveCategoryDown(category)}
                        disabled={category.order_index === categories.length - 1}
                      >
                        <ChevronDown className="w-4 h-4" />
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
                            <th className="text-right p-3 font-semibold w-[140px]">Actions</th>
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
                              <td className="p-3 w-[140px]">
                                <div className="flex items-center justify-end gap-1">
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
          })}
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
      <Dialog open={showCsvDialog} onOpenChange={setShowCsvDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import</DialogTitle>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </div>
  );
}
