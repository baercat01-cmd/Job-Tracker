import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
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
import { ChevronDown, ChevronRight, Package, Camera, FileText, ChevronDownIcon, Search, X, PackagePlus, Layers, ShoppingCart, Calendar, ArrowUpDown, CheckCircle, ChevronLeft, ChevronRight as ChevronRightIcon, Truck, Clock, Trash2, Edit, Database, Download } from 'lucide-react';
import { toast } from 'sonner';
import { createNotification, getMaterialStatusBrief } from '@/lib/notifications';
import { getLocalDateString, cleanMaterialValue } from '@/lib/utils';
import type { Job } from '@/types';
import { ReadyForJobMaterials } from './ReadyForJobMaterials';
import { MaterialsCatalogBrowser } from './MaterialsCatalogBrowser';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface Material {
  id: string;
  category_id: string;
  name: string;
  quantity: number;
  length: string | null;
  status: 'needed' | 'not_ordered' | 'ordered' | 'at_shop' | 'ready_to_pull' | 'at_job' | 'installed' | 'missing';
  notes: string | null;
  updated_at: string;
  use_case?: string;
  date_needed_by?: string | null;
  ordered_by?: string | null;
  order_requested_at?: string | null;
  order_by_date?: string | null;
  pull_by_date?: string | null;
  delivery_date?: string | null;
  actual_delivery_date?: string | null;
  import_source?: string; // Add import_source to track field-requested materials
}

interface GroupedMaterial {
  name: string;
  length: string | null;
  groupKey: string;
  materials: Material[];
  totalQuantity: number;
  primaryStatus: Material['status'];
}

interface MaterialBundle {
  id: string;
  job_id: string;
  name: string;
  description: string | null;
  status: 'pending' | 'preparing' | 'ready' | 'picked_up' | 'delivered';
  created_by: string | null;
  created_at: string;
  updated_at: string;
  materials: Material[];
}

interface Category {
  id: string;
  name: string;
  order_index: number;
  materials: Material[];
  groupedMaterials?: GroupedMaterial[];
}

interface MaterialPhoto {
  id: string;
  photo_url: string;
  timestamp: string;
}

type StatusFilter = 'all' | 'needed' | 'not_ordered' | 'ordered' | 'at_shop' | 'ready_to_pull' | 'at_job' | 'installed' | 'missing';

interface MaterialsListProps {
  job: Job;
  userId: string;
  userRole?: 'office' | 'foreman' | 'shop' | 'crew';
  allowBundleCreation?: boolean;
  defaultTab?: 'all' | 'ready' | 'pull' | 'bundles' | 'order';
}

const STATUS_CONFIG = {
  needed: { label: 'Needed', color: 'bg-orange-500', bgClass: 'bg-orange-50 text-orange-800 border-orange-200' },
  not_ordered: { label: 'Not Ordered', color: 'bg-gray-500', bgClass: 'bg-gray-50 text-gray-700 border-gray-200' },
  ordered: { label: 'Ordered', color: 'bg-yellow-500', bgClass: 'bg-yellow-50 text-yellow-800 border-yellow-200' },
  at_shop: { label: 'At Shop', color: 'bg-blue-500', bgClass: 'bg-blue-50 text-blue-800 border-blue-200' },
  ready_to_pull: { label: 'Pull from Shop', color: 'bg-purple-500', bgClass: 'bg-purple-50 text-purple-800 border-purple-200' },
  at_job: { label: 'At Job', color: 'bg-green-500', bgClass: 'bg-green-50 text-green-800 border-green-200' },
  installed: { label: 'Installed', color: 'bg-black', bgClass: 'bg-slate-100 text-slate-800 border-slate-200' },
  missing: { label: 'Missing', color: 'bg-red-500', bgClass: 'bg-red-50 text-red-800 border-red-200' },
};

const BUNDLE_STATUS_CONFIG = {
  ordered: { label: 'Order', color: 'bg-yellow-500', bgClass: 'bg-yellow-50 text-yellow-800 border-yellow-300', icon: Clock },
  ready_to_pull: { label: 'Pull from Shop', color: 'bg-purple-500', bgClass: 'bg-purple-50 text-purple-800 border-purple-300', icon: Package },
  at_job: { label: 'At Job', color: 'bg-green-500', bgClass: 'bg-green-50 text-green-800 border-green-300', icon: CheckCircle },
};

// Helper function to get status config with fallback
function getStatusConfig(status: string) {
  return STATUS_CONFIG[status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.not_ordered;
}

function getBundleStatusConfig(status: string) {
  return BUNDLE_STATUS_CONFIG[status as keyof typeof BUNDLE_STATUS_CONFIG] || BUNDLE_STATUS_CONFIG.ordered;
}

export function MaterialsList({ job, userId, userRole = 'foreman', allowBundleCreation = false, defaultTab = 'all' }: MaterialsListProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [bundles, setBundles] = useState<MaterialBundle[]>([]);
  const [materialBundleMap, setMaterialBundleMap] = useState<Map<string, { bundleId: string; bundleName: string }>>(new Map());
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'ready' | 'pull' | 'bundles' | 'order'>(defaultTab);
  const [readyMaterialsCount, setReadyMaterialsCount] = useState(0);
  const [pullFromShopCount, setPullFromShopCount] = useState(0);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [expandedBundles, setExpandedBundles] = useState<Set<string>>(new Set());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'status' | 'date' | 'quantity'>('name');
  
  // Selection mode for creating bundles
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedMaterialIds, setSelectedMaterialIds] = useState<Set<string>>(new Set());
  
  // Status change dialog with date tracking
  const [statusChangeMaterial, setStatusChangeMaterial] = useState<Material | null>(null);
  const [statusChangeMaterialGroup, setStatusChangeMaterialGroup] = useState<Material[] | null>(null);
  const [newStatus, setNewStatus] = useState<Material['status']>('not_ordered');
  const [orderByDate, setOrderByDate] = useState('');
  const [pullByDate, setPullByDate] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [actualDeliveryDate, setActualDeliveryDate] = useState('');
  const [dateNotes, setDateNotes] = useState('');
  const [submittingStatus, setSubmittingStatus] = useState(false);
  
  // Edit dates without changing status
  const [editDatesMaterial, setEditDatesMaterial] = useState<Material | null>(null);
  const [editDatesGroup, setEditDatesGroup] = useState<Material[] | null>(null);
  const [savingDates, setSavingDates] = useState(false);
  
  // Bundle creation
  const [showCreateBundle, setShowCreateBundle] = useState(false);
  const [bundleName, setBundleName] = useState('');
  const [bundleDescription, setBundleDescription] = useState('');
  const [creatingBundle, setCreatingBundle] = useState(false);
  
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

  // Swipe gesture handling
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);

  // Minimum swipe distance (in px)
  const minSwipeDistance = 50;

  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    if (isLeftSwipe) {
      // Swipe left - go to next tab
      if (activeTab === 'all') {
        setActiveTab('ready');
      } else if (activeTab === 'ready' && pullFromShopCount > 0) {
        setActiveTab('pull');
      }
    }

    if (isRightSwipe) {
      // Swipe right - go to previous tab
      if (activeTab === 'pull') {
        setActiveTab('ready');
      } else if (activeTab === 'ready') {
        setActiveTab('all');
      }
    }

    setTouchStart(null);
    setTouchEnd(null);
  };

  useEffect(() => {
    loadMaterials();
    loadBundles();
    checkReadyMaterials();

    // Subscribe to real-time material changes
    const materialsChannel = supabase
      .channel('materials_changes')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'materials', filter: `job_id=eq.${job.id}` },
        () => {
          console.log('Material change detected - reloading materials');
          loadMaterials();
          checkReadyMaterials();
        }
      )
      .subscribe();

    // Subscribe to real-time bundle changes
    const bundlesChannel = supabase
      .channel('bundles_changes')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'material_bundles', filter: `job_id=eq.${job.id}` },
        () => {
          console.log('Bundle change detected - reloading bundles');
          loadBundles();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(materialsChannel);
      supabase.removeChannel(bundlesChannel);
    };
  }, [job.id]);

  async function checkReadyMaterials() {
    try {
      const { data: atShopData, error: atShopError } = await supabase
        .from('materials')
        .select('id')
        .eq('job_id', job.id)
        .eq('status', 'at_shop');

      if (atShopError) throw atShopError;
      
      const atShopCount = atShopData?.length || 0;
      setReadyMaterialsCount(atShopCount);

      const { data: pullData, error: pullError } = await supabase
        .from('materials')
        .select('id')
        .eq('job_id', job.id)
        .eq('status', 'ready_to_pull');

      if (pullError) throw pullError;
      
      const pullCount = pullData?.length || 0;
      setPullFromShopCount(pullCount);
    } catch (error: any) {
      console.error('Error checking ready materials:', error);
    }
  }

  async function loadMaterials() {
    try {
      setLoading(true);
      
      console.log('🔍 Loading materials for job:', job.id);
      
      // Load categories
      const { data: categoriesData, error: categoriesError } = await supabase
        .from('materials_categories')
        .select('*')
        .eq('job_id', job.id)
        .order('order_index');

      if (categoriesError) {
        console.error('❌ Error loading categories:', categoriesError);
        throw categoriesError;
      }

      console.log('📁 Loaded categories:', categoriesData?.length || 0);

      // Load ALL materials for this job (no status filter)
      const { data: materialsData, error: materialsError } = await supabase
        .from('materials')
        .select('*')
        .eq('job_id', job.id)
        .order('name');

      if (materialsError) {
        console.error('❌ Error loading materials:', materialsError);
        throw materialsError;
      }

      console.log('📦 Loaded materials:', materialsData?.length || 0);
      console.log('Materials data sample:', materialsData?.[0]);

      // Separate field requests from regular materials
      const fieldRequestMaterials = (materialsData || []).filter((m: any) => m.import_source === 'field_catalog');
      const regularMaterials = (materialsData || []).filter((m: any) => m.import_source !== 'field_catalog');

      // Group regular materials by category
      const categoriesWithMaterials: Category[] = (categoriesData || []).map(cat => {
        const categoryMaterials = regularMaterials.filter((m: any) => m.category_id === cat.id);
        console.log(`📁 Category "${cat.name}" has ${categoryMaterials.length} materials`);
        return {
          id: cat.id,
          name: cat.name,
          order_index: cat.order_index,
          materials: categoryMaterials,
        };
      });

      // Add virtual "Field Requests" category at the top if there are any field requests
      if (fieldRequestMaterials.length > 0) {
        categoriesWithMaterials.unshift({
          id: 'field-requests-virtual',
          name: '🔧 Field Requests',
          order_index: -1,
          materials: fieldRequestMaterials,
        });
      }

      console.log('✅ Setting categories with materials');
      setCategories(categoriesWithMaterials);
    } catch (error: any) {
      console.error('❌ Error loading materials:', error);
      toast.error('Failed to load materials');
    } finally {
      setLoading(false);
    }
  }

  async function loadBundles() {
    try {
      // Load bundles
      const { data: bundlesData, error: bundlesError } = await supabase
        .from('material_bundles')
        .select('*')
        .eq('job_id', job.id)
        .order('created_at', { ascending: false });

      if (bundlesError) throw bundlesError;

      // Load bundle items with material details
      const bundlesWithMaterials: MaterialBundle[] = await Promise.all(
        (bundlesData || []).map(async (bundle) => {
          const { data: itemsData } = await supabase
            .from('material_bundle_items')
            .select('material_id, materials(*)')
            .eq('bundle_id', bundle.id);

          const materials = (itemsData || []).map((item: any) => item.materials).filter(Boolean);

          return {
            ...bundle,
            materials,
          };
        })
      );

      // Create a map of material ID to bundle info for tagging
      const bundleMap = new Map<string, { bundleId: string; bundleName: string }>();
      bundlesWithMaterials.forEach((bundle) => {
        bundle.materials.forEach((material) => {
          bundleMap.set(material.id, { bundleId: bundle.id, bundleName: bundle.name });
        });
      });

      setBundles(bundlesWithMaterials);
      setMaterialBundleMap(bundleMap);
    } catch (error: any) {
      console.error('Error loading bundles:', error);
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

  function toggleBundle(bundleId: string) {
    const newExpanded = new Set(expandedBundles);
    if (newExpanded.has(bundleId)) {
      newExpanded.delete(bundleId);
    } else {
      newExpanded.add(bundleId);
    }
    setExpandedBundles(newExpanded);
  }

  function toggleGroup(groupKey: string) {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(groupKey)) {
      newExpanded.delete(groupKey);
    } else {
      newExpanded.add(groupKey);
    }
    setExpandedGroups(newExpanded);
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

  function toggleSelectionMode() {
    setSelectionMode(!selectionMode);
    setSelectedMaterialIds(new Set());
  }

  function toggleMaterialSelection(materialId: string) {
    // Don't allow selection of materials already in a bundle
    if (materialBundleMap.has(materialId)) {
      toast.error('This material is already in a bundle');
      return;
    }

    const newSelection = new Set(selectedMaterialIds);
    if (newSelection.has(materialId)) {
      newSelection.delete(materialId);
    } else {
      newSelection.add(materialId);
    }
    setSelectedMaterialIds(newSelection);
  }

  function handleMaterialStatusChange(material: Material, newStatusValue: Material['status']) {
    // Show date dialog for status changes that need date tracking
    if (newStatusValue === 'ordered' || newStatusValue === 'at_shop' || newStatusValue === 'at_job') {
      setStatusChangeMaterial(material);
      setStatusChangeMaterialGroup(null);
      setNewStatus(newStatusValue);
      
      // Pre-populate existing dates
      setOrderByDate(material.order_by_date || '');
      setPullByDate(material.pull_by_date || '');
      setDeliveryDate(material.delivery_date || '');
      setActualDeliveryDate(material.actual_delivery_date || '');
      setDateNotes('');
      
      // Set default dates based on status
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split('T')[0];
      const todayStr = new Date().toISOString().split('T')[0];
      
      if (newStatusValue === 'ordered' && !material.order_by_date) {
        setOrderByDate(tomorrowStr);
        setDeliveryDate(tomorrowStr);
      } else if (newStatusValue === 'at_shop' && !material.pull_by_date) {
        setPullByDate(tomorrowStr);
      } else if (newStatusValue === 'at_job' && !material.actual_delivery_date) {
        setActualDeliveryDate(todayStr);
      }
    } else {
      // Direct status change for other statuses (installed, missing, not_ordered)
      updateMaterialStatusDirect(material.id, newStatusValue);
    }
  }

  function handleGroupStatusChange(group: GroupedMaterial, newStatusValue: Material['status']) {
    // Show date dialog for status changes that need date tracking
    if (newStatusValue === 'ordered' || newStatusValue === 'at_shop' || newStatusValue === 'at_job') {
      setStatusChangeMaterial(null);
      setStatusChangeMaterialGroup(group.materials);
      setNewStatus(newStatusValue);
      
      const firstMaterial = group.materials[0];
      // Pre-populate existing dates from first material
      setOrderByDate(firstMaterial.order_by_date || '');
      setPullByDate(firstMaterial.pull_by_date || '');
      setDeliveryDate(firstMaterial.delivery_date || '');
      setActualDeliveryDate(firstMaterial.actual_delivery_date || '');
      setDateNotes('');
      
      // Set default dates based on status
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split('T')[0];
      const todayStr = new Date().toISOString().split('T')[0];
      
      if (newStatusValue === 'ordered' && !firstMaterial.order_by_date) {
        setOrderByDate(tomorrowStr);
        setDeliveryDate(tomorrowStr);
      } else if (newStatusValue === 'at_shop' && !firstMaterial.pull_by_date) {
        setPullByDate(tomorrowStr);
      } else if (newStatusValue === 'at_job' && !firstMaterial.actual_delivery_date) {
        setActualDeliveryDate(todayStr);
      }
    } else {
      // Direct status change for other statuses (installed, missing, not_ordered)
      updateGroupStatusDirect(group.materials.map(m => m.id), newStatusValue);
    }
  }

  async function updateMaterialStatusDirect(materialId: string, status: Material['status']) {
    try {
      const { error } = await supabase
        .from('materials')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', materialId);
      
      if (error) throw error;
      // Silent success - status updated
      
      // Check and sync bundle status
      await checkAndSyncBundleStatus(materialId, status);
      
      loadMaterials();
      loadBundles();
    } catch (error: any) {
      toast.error('Failed to update status');
      console.error(error);
    }
  }

  async function updateGroupStatusDirect(materialIds: string[], status: Material['status']) {
    try {
      const { error } = await supabase
        .from('materials')
        .update({ status, updated_at: new Date().toISOString() })
        .in('id', materialIds);
      
      if (error) throw error;
      // Silent success - all variants updated
      loadMaterials();
    } catch (error: any) {
      toast.error('Failed to update status');
      console.error(error);
    }
  }

  async function confirmStatusChange() {
    if (!statusChangeMaterial && !statusChangeMaterialGroup) return;

    setSubmittingStatus(true);

    try {
      let materialIds: string[];
      let materialCount: number;

      if (statusChangeMaterial) {
        materialIds = [statusChangeMaterial.id];
        materialCount = 1;
      } else if (statusChangeMaterialGroup) {
        materialIds = statusChangeMaterialGroup.map(m => m.id);
        materialCount = statusChangeMaterialGroup.length;
      } else {
        return;
      }

      const updateData: any = {
        status: newStatus,
        updated_at: new Date().toISOString(),
      };

      // Update dates based on status
      if (newStatus === 'ordered') {
        if (orderByDate) updateData.order_by_date = orderByDate;
        if (deliveryDate) updateData.delivery_date = deliveryDate;
        updateData.ordered_by = userId;
        updateData.order_requested_at = new Date().toISOString();
      } else if (newStatus === 'at_shop') {
        if (pullByDate) updateData.pull_by_date = pullByDate;
      } else if (newStatus === 'at_job') {
        if (actualDeliveryDate) updateData.actual_delivery_date = actualDeliveryDate;
      }

      if (dateNotes) {
        updateData.notes = dateNotes;
      }

      const { error } = await supabase
        .from('materials')
        .update(updateData)
        .in('id', materialIds);

      if (error) throw error;

      // Create notification for office based on status change
      if (newStatus === 'ordered') {
        await createNotification({
          jobId: job.id,
          createdBy: userId,
          type: 'material_request',
          brief: `Material order: ${materialCount} item${materialCount > 1 ? 's' : ''} ${deliveryDate ? `needed by ${new Date(deliveryDate).toLocaleDateString()}` : 'requested'}`,
          referenceData: {
            materialCount,
            deliveryDate,
            notes: dateNotes,
          },
        });
      }

      // Check and sync bundle status for all updated materials
      if (statusChangeMaterial) {
        await checkAndSyncBundleStatus(statusChangeMaterial.id, newStatus);
      }

      // Silent success - status updated
      setStatusChangeMaterial(null);
      setStatusChangeMaterialGroup(null);
      loadMaterials();
      loadBundles();
    } catch (error: any) {
      console.error('Error updating status:', error);
      toast.error('Failed to update status');
    } finally {
      setSubmittingStatus(false);
    }
  }

  function openEditDates(material: Material) {
    setEditDatesMaterial(material);
    setEditDatesGroup(null);
    setOrderByDate(material.order_by_date || '');
    setPullByDate(material.pull_by_date || '');
    setDeliveryDate(material.delivery_date || '');
    setActualDeliveryDate(material.actual_delivery_date || '');
    setDateNotes('');
  }

  function openEditDatesGroup(group: GroupedMaterial) {
    setEditDatesMaterial(null);
    setEditDatesGroup(group.materials);
    const firstMaterial = group.materials[0];
    setOrderByDate(firstMaterial.order_by_date || '');
    setPullByDate(firstMaterial.pull_by_date || '');
    setDeliveryDate(firstMaterial.delivery_date || '');
    setActualDeliveryDate(firstMaterial.actual_delivery_date || '');
    setDateNotes('');
  }

  async function saveDates() {
    if (!editDatesMaterial && !editDatesGroup) return;

    setSavingDates(true);

    try {
      let materialIds: string[];

      if (editDatesMaterial) {
        materialIds = [editDatesMaterial.id];
      } else if (editDatesGroup) {
        materialIds = editDatesGroup.map(m => m.id);
      } else {
        return;
      }

      const updateData: any = {
        updated_at: new Date().toISOString(),
      };

      // Update all date fields
      updateData.order_by_date = orderByDate || null;
      updateData.pull_by_date = pullByDate || null;
      updateData.delivery_date = deliveryDate || null;
      updateData.actual_delivery_date = actualDeliveryDate || null;

      if (dateNotes) {
        updateData.notes = dateNotes;
      }

      const { error } = await supabase
        .from('materials')
        .update(updateData)
        .in('id', materialIds);

      if (error) throw error;

      // Silent success - dates updated
      setEditDatesMaterial(null);
      setEditDatesGroup(null);
      loadMaterials();
    } catch (error: any) {
      console.error('Error updating dates:', error);
      toast.error('Failed to update dates');
    } finally {
      setSavingDates(false);
    }
  }

  function openCreateBundleDialog() {
    if (selectedMaterialIds.size === 0) {
      toast.error('Please select at least one material');
      return;
    }
    setShowCreateBundle(true);
  }

  function closeCreateBundleDialog() {
    setShowCreateBundle(false);
    setBundleName('');
    setBundleDescription('');
  }

  async function createBundle() {
    if (!bundleName.trim()) {
      toast.error('Please enter a bundle name');
      return;
    }

    if (selectedMaterialIds.size === 0) {
      toast.error('Please select at least one material');
      return;
    }

    setCreatingBundle(true);

    try {
      // Create bundle
      const { data: bundleData, error: bundleError } = await supabase
        .from('material_bundles')
        .insert({
          job_id: job.id,
          name: bundleName.trim(),
          description: bundleDescription.trim() || null,
          created_by: userId,
          status: 'ordered', // Initial status
        })
        .select()
        .single();

      if (bundleError) throw bundleError;

      // Add materials to bundle
      const bundleItems = Array.from(selectedMaterialIds).map(materialId => ({
        bundle_id: bundleData.id,
        material_id: materialId,
      }));

      const { error: itemsError } = await supabase
        .from('material_bundle_items')
        .insert(bundleItems);

      if (itemsError) throw itemsError;

      // Silent success - bundle created
      
      // Reload data
      await loadMaterials();
      await loadBundles();
      
      // Reset state
      setSelectionMode(false);
      setSelectedMaterialIds(new Set());
      closeCreateBundleDialog();
    } catch (error: any) {
      console.error('Error creating bundle:', error);
      toast.error('Failed to create bundle');
    } finally {
      setCreatingBundle(false);
    }
  }

  async function updateBundleStatus(bundleId: string, status: Material['status']) {
    try {
      // Update bundle status
      const { error: bundleError } = await supabase
        .from('material_bundles')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', bundleId);

      if (bundleError) throw bundleError;

      // Get all materials in bundle
      const { data: itemsData } = await supabase
        .from('material_bundle_items')
        .select('material_id')
        .eq('bundle_id', bundleId);

      // Update all materials in bundle
      if (itemsData && itemsData.length > 0) {
        const materialIds = itemsData.map(item => item.material_id);
        const { error: materialsError } = await supabase
          .from('materials')
          .update({ status, updated_at: new Date().toISOString() })
          .in('id', materialIds);

        if (materialsError) throw materialsError;
      }

      // Silent success - bundle and materials updated
      await Promise.all([loadMaterials(), loadBundles()]);
    } catch (error: any) {
      console.error('Error updating bundle status:', error);
      toast.error('Failed to update bundle status');
    }
  }

  // Check and auto-update bundle status when individual materials change
  async function checkAndSyncBundleStatus(materialId: string, newStatus: Material['status']) {
    try {
      // Find which bundle this material belongs to
      const { data: bundleItem } = await supabase
        .from('material_bundle_items')
        .select('bundle_id')
        .eq('material_id', materialId)
        .single();

      if (!bundleItem) return; // Not in a bundle

      // Get all materials in this bundle
      const { data: allBundleItems } = await supabase
        .from('material_bundle_items')
        .select('material_id, materials(status)')
        .eq('bundle_id', bundleItem.bundle_id);

      if (!allBundleItems) return;

      // Check if all materials have the same status
      const allStatuses = allBundleItems.map((item: any) => item.materials?.status);
      const allSameStatus = allStatuses.every(status => status === newStatus);

      if (allSameStatus) {
        // Update bundle status to match
        const { error } = await supabase
          .from('material_bundles')
          .update({ status: newStatus, updated_at: new Date().toISOString() })
          .eq('id', bundleItem.bundle_id);

        if (!error) {
          const bundle = bundles.find(b => b.id === bundleItem.bundle_id);
          // Silent success - bundle auto-synced (removed toast)
        }
      }
    } catch (error: any) {
      console.error('Error syncing bundle status:', error);
      // Don't show error toast - this is a background operation
    }
  }

  async function deleteBundle(bundleId: string) {
    try {
      const { error } = await supabase
        .from('material_bundles')
        .delete()
        .eq('id', bundleId);

      if (error) throw error;

      // Silent success - bundle deleted
      await loadMaterials();
      await loadBundles();
    } catch (error: any) {
      console.error('Error deleting bundle:', error);
      toast.error('Failed to delete bundle');
    }
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

      // Silent success - status updated
      setSelectedMaterial({ ...selectedMaterial, status });
      
      // Check and sync bundle status
      await checkAndSyncBundleStatus(selectedMaterial.id, status);
      
      loadMaterials();
      loadBundles();
      
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

      // Silent success - quantity updated
      setSelectedMaterial({ ...selectedMaterial, quantity: editQuantity });
      loadMaterials();
    } catch (error: any) {
      toast.error('Failed to update quantity');
      console.error(error);
    } finally {
      setSavingQuantity(false);
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

      // Silent success - material details updated
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

      // Silent success - notes saved
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

      // Silent success - photo uploaded
      loadMaterialPhotos(selectedMaterial.id);
    } catch (error: any) {
      toast.error('Failed to upload photo');
      console.error(error);
    } finally {
      setUploadingPhoto(false);
    }
  }

  function groupMaterialsByNameAndLength(materials: Material[]): GroupedMaterial[] {
    const groups = new Map<string, Material[]>();
    
    materials.forEach(material => {
      const key = `${material.name}|||${material.length || 'no-length'}`;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(material);
    });

    return Array.from(groups.values()).map(groupMaterials => {
      const totalQuantity = groupMaterials.reduce((sum, m) => sum + m.quantity, 0);
      // Determine primary status (most common or first)
      const statusCounts = new Map<Material['status'], number>();
      groupMaterials.forEach(m => {
        statusCounts.set(m.status, (statusCounts.get(m.status) || 0) + 1);
      });
      let primaryStatus = groupMaterials[0].status;
      let maxCount = 0;
      statusCounts.forEach((count, status) => {
        if (count > maxCount) {
          maxCount = count;
          primaryStatus = status;
        }
      });

      return {
        name: groupMaterials[0].name,
        length: groupMaterials[0].length,
        groupKey: `${groupMaterials[0].name}|||${groupMaterials[0].length || 'no-length'}`,
        materials: groupMaterials,
        totalQuantity,
        primaryStatus,
      };
    });
  }

  function getFilteredCategories(skipFilters = false) {
    return categories.map(cat => {
      let filteredMaterials = cat.materials;

      // Skip filters when in selection mode for bundles
      if (!skipFilters) {
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
      }

      // Sort materials
      const sortedMaterials = [...filteredMaterials].sort((a, b) => {
        if (sortBy === 'name') {
          return a.name.localeCompare(b.name);
        } else if (sortBy === 'status') {
          const statusOrder = ['needed', 'not_ordered', 'ordered', 'at_shop', 'ready_to_pull', 'at_job', 'installed', 'missing'];
          return statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status);
        } else if (sortBy === 'date') {
          const aDate = a.delivery_date || a.order_by_date || a.updated_at;
          const bDate = b.delivery_date || b.order_by_date || b.updated_at;
          if (!aDate && !bDate) return 0;
          if (!aDate) return 1;
          if (!bDate) return -1;
          return new Date(aDate).getTime() - new Date(bDate).getTime();
        } else if (sortBy === 'quantity') {
          return b.quantity - a.quantity;
        }
        return 0;
      });

      // Group materials by name and length
      const groupedMaterials = groupMaterialsByNameAndLength(sortedMaterials);

      return {
        ...cat,
        materials: filteredMaterials,
        groupedMaterials,
      };
    }).filter(cat => cat.materials.length > 0);
  }

  const filteredCategories = getFilteredCategories(false);

  async function downloadMaterialsList() {
    try {
      // Get all materials across all categories
      const allMaterials: any[] = [];
      
      categories.forEach(category => {
        category.materials.forEach(material => {
          allMaterials.push({
            category: category.name,
            name: material.name,
            quantity: material.quantity,
            length: material.length || '',
            status: getStatusConfig(material.status).label,
            use_case: (material as any).use_case || '',
            notes: material.notes || '',
            date_needed_by: material.date_needed_by || '',
            order_by_date: material.order_by_date || '',
            delivery_date: material.delivery_date || '',
            actual_delivery_date: material.actual_delivery_date || '',
          });
        });
      });

      if (allMaterials.length === 0) {
        toast.error('No materials to download');
        return;
      }

      // Create CSV content
      const headers = [
        'Category',
        'Material Name',
        'Quantity',
        'Length',
        'Status',
        'Use Case',
        'Notes',
        'Date Needed By',
        'Order By Date',
        'Delivery Date',
        'Actual Delivery Date'
      ];

      const csvRows = [headers.join(',')];

      allMaterials.forEach(material => {
        const row = [
          `"${material.category}"`,
          `"${material.name}"`,
          material.quantity,
          `"${material.length}"`,
          `"${material.status}"`,
          `"${material.use_case}"`,
          `"${material.notes}"`,
          material.date_needed_by,
          material.order_by_date,
          material.delivery_date,
          material.actual_delivery_date
        ];
        csvRows.push(row.join(','));
      });

      const csvContent = csvRows.join('\n');

      // Create blob and download
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      
      const fileName = `${job.name.replace(/[^a-z0-9]/gi, '_')}_materials_${new Date().toISOString().split('T')[0]}.csv`;
      
      link.setAttribute('href', url);
      link.setAttribute('download', fileName);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast.success(`Downloaded ${allMaterials.length} materials`);
    } catch (error: any) {
      console.error('Error downloading materials:', error);
      toast.error('Failed to download materials list');
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-muted-foreground text-base">Loading materials...</div>
      </div>
    );
  }

  if (categories.length === 0 && bundles.length === 0) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="text-center text-muted-foreground">
            <Package className="w-16 h-16 mx-auto mb-4 opacity-50" />
            <p className="text-base">No materials have been added to this job yet.</p>
            <p className="text-sm mt-2">Office staff can add material categories and items.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div 
      className="space-y-3 w-full max-w-[2000px] mx-auto"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Status Color Bar - Shows at top when on ready or pull tabs */}
      {activeTab === 'ready' && (
        <div className="rounded-none border-2 border-blue-900 bg-blue-500 text-white p-1.5 mb-4 shadow-md">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold flex items-center gap-1.5">
                <CheckCircle className="w-3.5 h-3.5" />
                Ready for Job
              </h3>
              <p className="text-xs mt-0.5 opacity-90">Items ready at shop</p>
            </div>
            <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center">
              <span className="text-sm font-bold">{readyMaterialsCount}</span>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'pull' && (
        <div className="rounded-none border-2 border-purple-900 bg-purple-500 text-white p-1.5 mb-4 shadow-md">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold flex items-center gap-1.5">
                <Package className="w-3.5 h-3.5" />
                Pull from Shop
              </h3>
              <p className="text-xs mt-0.5 opacity-90">Items to pull</p>
            </div>
            <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center">
              <span className="text-sm font-bold">{pullFromShopCount}</span>
            </div>
          </div>
        </div>
      )}

      {/* Download Button - Show when there are materials to download */}
      {activeTab === 'all' && categories.length > 0 && (
        <div className="flex justify-end mb-2">
          <Button
            onClick={downloadMaterialsList}
            variant="outline"
            size="sm"
            className="gap-2"
          >
            <Download className="w-4 h-4" />
            Download Materials List
          </Button>
        </div>
      )}

      {/* Tab Switcher with Swipe Navigation Hints - Mobile Optimized */}
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'all' | 'ready' | 'pull' | 'bundles' | 'order')} className="w-full">
        <div className="relative mb-4">
          <TabsList className={`grid w-full gap-1 sm:gap-2 ${pullFromShopCount > 0 ? 'grid-cols-5' : 'grid-cols-4'} bg-slate-100 p-1 rounded-none`}>
            <TabsTrigger 
              value="all" 
              className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 px-1 sm:px-3 py-2 sm:py-2.5 data-[state=active]:bg-white data-[state=active]:text-black data-[state=active]:shadow-sm rounded-none text-xs sm:text-sm font-semibold whitespace-nowrap"
            >
              <Layers className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
              <span className="hidden sm:inline">All Materials</span>
              <span className="sm:hidden">All</span>
            </TabsTrigger>
            <TabsTrigger 
              value="ready" 
              className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 px-1 sm:px-3 py-2 sm:py-2.5 data-[state=active]:bg-white data-[state=active]:text-black data-[state=active]:shadow-sm rounded-none text-xs sm:text-sm font-semibold whitespace-nowrap"
            >
              <div className="flex items-center gap-1 sm:gap-2">
                <CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                <span className="hidden lg:inline">Ready for Job</span>
                <span className="lg:hidden">Ready</span>
              </div>
              {readyMaterialsCount > 0 && (
                <Badge variant="secondary" className="ml-0 sm:ml-1 text-[10px] sm:text-xs px-1 sm:px-1.5 py-0">
                  {readyMaterialsCount}
                </Badge>
              )}
            </TabsTrigger>
            {pullFromShopCount > 0 && (
              <TabsTrigger 
                value="pull" 
                className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 px-1 sm:px-3 py-2 sm:py-2.5 data-[state=active]:bg-white data-[state=active]:text-black data-[state=active]:shadow-sm rounded-none text-xs sm:text-sm font-semibold whitespace-nowrap"
              >
                <div className="flex items-center gap-1 sm:gap-2">
                  <Package className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                  <span className="hidden lg:inline">Pull from Shop</span>
                  <span className="lg:hidden">Pull</span>
                </div>
                <Badge variant="secondary" className="ml-0 sm:ml-1 text-[10px] sm:text-xs px-1 sm:px-1.5 py-0">
                  {pullFromShopCount}
                </Badge>
              </TabsTrigger>
            )}
            <TabsTrigger 
              value="bundles" 
              className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 px-1 sm:px-3 py-2 sm:py-2.5 data-[state=active]:bg-white data-[state=active]:text-black data-[state=active]:shadow-sm rounded-none text-xs sm:text-sm font-semibold whitespace-nowrap"
            >
              <div className="flex items-center gap-1 sm:gap-2">
                <PackagePlus className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                <span>Bundles</span>
              </div>
              {bundles.length > 0 && (
                <Badge variant="secondary" className="ml-0 sm:ml-1 text-[10px] sm:text-xs px-1 sm:px-1.5 py-0">
                  {bundles.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger 
              value="order" 
              className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 px-1 sm:px-3 py-2 sm:py-2.5 data-[state=active]:bg-white data-[state=active]:text-black data-[state=active]:shadow-sm rounded-none text-xs sm:text-sm font-semibold whitespace-nowrap"
            >
              <ShoppingCart className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
              <span className="hidden sm:inline">Order</span>
              <span className="sm:hidden">Order</span>
            </TabsTrigger>
          </TabsList>

          {/* Swipe Navigation Arrows - Visual Hint */}
          {activeTab !== 'all' && (
            <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-3 pointer-events-none">
              <ChevronLeft className="w-6 h-6 text-muted-foreground opacity-40 animate-pulse" />
            </div>
          )}
          {((activeTab === 'all' || activeTab === 'ready') && pullFromShopCount > 0) || (activeTab === 'all' && readyMaterialsCount > 0) ? (
            <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-3 pointer-events-none">
              <ChevronRightIcon className="w-6 h-6 text-muted-foreground opacity-40 animate-pulse" />
            </div>
          ) : null}
        </div>

        <TabsContent value="all" className="space-y-3">
          {/* Bundle Creation Button (when in selection mode) */}
          {selectionMode && selectedMaterialIds.size > 0 && (
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
              <div className="bg-primary text-primary-foreground rounded-full shadow-2xl border-4 border-background">
                <Button
                  onClick={openCreateBundleDialog}
                  size="lg"
                  className="rounded-full h-16 px-8 text-lg font-bold"
                >
                  <PackagePlus className="w-6 h-6 mr-3" />
                  Create Bundle ({selectedMaterialIds.size} selected)
                </Button>
              </div>
            </div>
          )}

          {/* Selection Mode Controls */}
          {(userRole === 'office' || allowBundleCreation) && (
            <Card className={`${selectionMode ? 'border-2 border-primary' : ''}`}>
              <CardContent className="py-3">
                {selectionMode ? (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-5 h-5 text-primary" />
                      <span className="font-semibold">Selection Mode Active</span>
                      <Badge variant="secondary">{selectedMaterialIds.size} selected</Badge>
                    </div>
                    <Button variant="outline" onClick={toggleSelectionMode} size="sm">
                      <X className="w-4 h-4 mr-2" />
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button onClick={toggleSelectionMode} variant="outline" className="w-full">
                    <PackagePlus className="w-4 h-4 mr-2" />
                    Select Materials for Bundle
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          {/* Materials List - All Categories */}
          {filteredCategories.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No materials found matching your filters</p>
              </CardContent>
            </Card>
          ) : (
            filteredCategories.map(category => (
              <Card key={category.id} className="overflow-hidden">
                <CardHeader
                  className="py-3 px-4 bg-muted/50 cursor-pointer hover:bg-muted/70 transition-colors"
                  onClick={() => toggleCategory(category.id)}
                >
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                      {expandedCategories.has(category.id) ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                      {category.name}
                      <Badge variant="outline" className="ml-2">
                        {category.materials.length}
                      </Badge>
                    </CardTitle>
                  </div>
                </CardHeader>
                {expandedCategories.has(category.id) && (
                  <CardContent className="p-0">
                    <div className="divide-y">
                      {(category.groupedMaterials || []).map(group => (
                        <div key={group.groupKey} className="p-3">
                          <div
                            className="flex items-start justify-between cursor-pointer"
                            onClick={(e) => {
                              // If in selection mode and clicking on the material itself, toggle selection
                              if (selectionMode && group.materials.length === 1) {
                                e.stopPropagation();
                                toggleMaterialSelection(group.materials[0].id);
                              } else {
                                toggleGroup(group.groupKey);
                              }
                            }}
                          >
                            <div className="flex-1 flex items-start gap-3">
                              {/* Selection Checkbox (in selection mode) */}
                              {selectionMode && group.materials.length === 1 && (
                                <Checkbox
                                  checked={selectedMaterialIds.has(group.materials[0].id)}
                                  disabled={materialBundleMap.has(group.materials[0].id)}
                                  className="mt-1"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleMaterialSelection(group.materials[0].id);
                                  }}
                                />
                              )}
                              <div className="flex-1">
                                <div className="flex items-baseline gap-2">
                                  <h4 className="font-medium text-sm">{cleanMaterialValue(group.name)}</h4>
                                  {group.length && (
                                    <span className="text-xs text-muted-foreground">{cleanMaterialValue(group.length)}</span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 mt-1 flex-wrap">

                                  <span className="text-sm text-muted-foreground">
                                    Total Qty: {group.totalQuantity}
                                  </span>
                                  <Badge
                                    variant="outline"
                                    className={getStatusConfig(group.primaryStatus).bgClass}
                                  >
                                    {getStatusConfig(group.primaryStatus).label}
                                  </Badge>
                                  {group.materials.length > 1 && (
                                    <Badge variant="secondary" className="text-xs">
                                      {group.materials.length} variants
                                    </Badge>
                                  )}
                                  {/* Bundle indicator */}
                                  {selectionMode && group.materials.length === 1 && materialBundleMap.has(group.materials[0].id) && (
                                    <Badge variant="outline" className="text-xs">
                                      In {materialBundleMap.get(group.materials[0].id)?.bundleName}
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            </div>
                            {!selectionMode && (expandedGroups.has(group.groupKey) ? (
                              <ChevronDown className="w-4 h-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-muted-foreground" />
                            ))}
                          </div>

                          {!selectionMode && expandedGroups.has(group.groupKey) && (
                            <div className="mt-3 space-y-2 pl-4 border-l-2 border-muted">
                              {group.materials.map(material => (
                                <div
                                  key={material.id}
                                  className="p-2 rounded-lg border bg-card hover:shadow-sm transition-shadow"
                                  onClick={() => openMaterialDetail(material)}
                                >
                                  <div className="flex items-center justify-between">
                                    <div className="flex-1">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-sm font-medium">Qty: {material.quantity}</span>
                                        <Badge
                                          variant="outline"
                                          className={getStatusConfig(material.status).bgClass}
                                        >
                                          {getStatusConfig(material.status).label}
                                        </Badge>
                                      </div>
                                      {(material as any).use_case && (
                                        <p className="text-xs text-muted-foreground mt-1">
                                          {(material as any).use_case}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                )}
              </Card>
            ))
          )}
        </TabsContent>

        {/* Create Bundle Dialog */}
        <Dialog open={showCreateBundle} onOpenChange={setShowCreateBundle}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <PackagePlus className="w-5 h-5" />
                Create Material Bundle
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
                <p className="text-sm text-muted-foreground">
                  You're creating a bundle with <strong>{selectedMaterialIds.size}</strong> material{selectedMaterialIds.size > 1 ? 's' : ''}.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="bundle-name">Bundle Name *</Label>
                <Input
                  id="bundle-name"
                  value={bundleName}
                  onChange={(e) => setBundleName(e.target.value)}
                  placeholder="e.g., Main Building Materials, Roof Package"
                  className="h-12"
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="bundle-description">Description (Optional)</Label>
                <Textarea
                  id="bundle-description"
                  value={bundleDescription}
                  onChange={(e) => setBundleDescription(e.target.value)}
                  placeholder="Add notes about this bundle..."
                  rows={3}
                />
              </div>

              <div className="flex flex-col gap-3 pt-4 border-t">
                <Button
                  onClick={createBundle}
                  disabled={creatingBundle || !bundleName.trim()}
                  className="h-12 gradient-primary"
                >
                  {creatingBundle ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                      Creating Bundle...
                    </>
                  ) : (
                    <>
                      <PackagePlus className="w-5 h-5 mr-2" />
                      Create Bundle
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={closeCreateBundleDialog}
                  disabled={creatingBundle}
                  className="h-12"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <TabsContent value="ready">
          <ReadyForJobMaterials userId={userId} currentJobId={job.id} statusFilter="at_shop" />
        </TabsContent>

        <TabsContent value="pull">
          <ReadyForJobMaterials userId={userId} currentJobId={job.id} statusFilter="ready_to_pull" />
        </TabsContent>

        <TabsContent value="bundles" className="space-y-4">
          {/* Bundle Creation Controls (Office/Admin Only) */}
          {(userRole === 'office' || allowBundleCreation) && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Material Bundles</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Group materials together for shop preparation and crew pickup
                </p>
              </CardHeader>
              <CardContent>
                {selectionMode ? (
                  <div className="flex items-center gap-2">
                    <Button onClick={openCreateBundleDialog} disabled={selectedMaterialIds.size === 0}>
                      <PackagePlus className="w-4 h-4 mr-2" />
                      Create Bundle ({selectedMaterialIds.size} selected)
                    </Button>
                    <Button variant="outline" onClick={toggleSelectionMode}>
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button onClick={toggleSelectionMode} variant="outline">
                    <PackagePlus className="w-4 h-4 mr-2" />
                    Select Materials to Bundle
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          {/* Bundle List */}
          {bundles.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <PackagePlus className="w-16 h-16 mx-auto mb-4 opacity-50" />
                <p className="text-base">No material bundles yet</p>
                {(userRole === 'office' || allowBundleCreation) && (
                  <p className="text-sm mt-2">Create bundles to organize materials for shop and crew</p>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {bundles.map((bundle) => {
                const statusConfig = getBundleStatusConfig(bundle.status);
                const StatusIcon = statusConfig.icon;
                const isExpanded = expandedBundles.has(bundle.id);

                return (
                  <Card key={bundle.id} className="overflow-hidden border-2">
                    <CardHeader
                      className="py-3 px-4 cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => toggleBundle(bundle.id)}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4" />
                            ) : (
                              <ChevronRight className="w-4 h-4" />
                            )}
                            <h3 className="text-base font-semibold">{bundle.name}</h3>
                            <Badge className={statusConfig.bgClass}>
                              <StatusIcon className="w-3 h-3 mr-1" />
                              {statusConfig.label}
                            </Badge>
                          </div>
                          {bundle.description && (
                            <p className="text-sm text-muted-foreground mt-1 ml-6">
                              {bundle.description}
                            </p>
                          )}
                          <div className="flex items-center gap-3 mt-2 ml-6 text-sm text-muted-foreground">
                            <span>{bundle.materials.length} items</span>
                            <span>•</span>
                            <span>Created {new Date(bundle.created_at).toLocaleDateString()}</span>
                          </div>
                        </div>
                      </div>
                    </CardHeader>

                    {isExpanded && (
                      <CardContent className="pt-0 pb-4 px-4">
                        {/* Bundle Status Workflow */}
                        <div className="mb-4 pb-4 border-b">
                          <h4 className="text-sm font-semibold mb-3">Bundle Status</h4>
                          <div className="space-y-3">
                            <Select
                              value={bundle.status}
                              onValueChange={(newStatus) => updateBundleStatus(bundle.id, newStatus as Material['status'])}
                            >
                              <SelectTrigger className={`w-full h-12 font-semibold border-2 ${getBundleStatusConfig(bundle.status).bgClass}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {Object.entries(BUNDLE_STATUS_CONFIG).map(([value, config]) => (
                                  <SelectItem key={value} value={value}>
                                    <span className={`inline-flex items-center px-3 py-1.5 rounded font-semibold ${config.bgClass}`}>
                                      <config.icon className="w-4 h-4 mr-2" />
                                      {config.label}
                                    </span>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {(userRole === 'office' || allowBundleCreation) && (
                              <Button
                                onClick={() => deleteBundle(bundle.id)}
                                variant="outline"
                                className="w-full text-destructive hover:bg-destructive/10"
                              >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Delete Bundle
                              </Button>
                            )}
                          </div>
                        </div>

                        {/* Materials in Bundle */}
                        <div>
                          <h4 className="text-sm font-semibold mb-3">Materials in Bundle</h4>
                          <div className="space-y-2">
                            {bundle.materials.map((material) => {
                              const matStatusConfig = getStatusConfig(material.status);
                              return (
                                <div
                                  key={material.id}
                                  className="p-3 rounded-lg border bg-card hover:shadow-sm transition-shadow"
                                  onClick={() => openMaterialDetail(material)}
                                >
                                  <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                      <div className="flex items-baseline gap-2">
                                        <h5 className="font-medium text-sm">{material.name}</h5>
                                        {material.length && (
                                          <span className="text-xs text-muted-foreground">
                                            {cleanMaterialValue(material.length)}
                                          </span>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-2 mt-1">
                                        <span className="text-sm text-muted-foreground">
                                          Qty: {material.quantity}
                                        </span>
                                        <Badge
                                          variant="outline"
                                          className={matStatusConfig.bgClass}
                                        >
                                          {matStatusConfig.label}
                                        </Badge>
                                      </div>
                                      {(material as any).use_case && (
                                        <p className="text-xs text-muted-foreground mt-1">
                                          {(material as any).use_case}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </CardContent>
                    )}
                  </Card>
                );
              })}
            </div>
          )}

          {/* Selection Mode - Material List for Bundling */}
          {selectionMode && (
            <div className="space-y-3">
              <Card className="border-2 border-primary">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Select Materials</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    Click materials to add them to the new bundle ({selectedMaterialIds.size} selected)
                  </p>
                </CardHeader>
              </Card>

              {getFilteredCategories(true).filter(cat => cat.materials.length > 0).map((category) => (
                <Card key={category.id} className="overflow-hidden">
                  <CardHeader
                    className="py-3 px-4 bg-muted/50 cursor-pointer hover:bg-muted/70 transition-colors"
                    onClick={() => toggleCategory(category.id)}
                  >
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base font-semibold flex items-center gap-2">
                        {expandedCategories.has(category.id) ? (
                          <ChevronDown className="w-4 h-4" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )}
                        {category.name}
                        <Badge variant="outline" className="ml-2">
                          {category.materials.length}
                        </Badge>
                      </CardTitle>
                    </div>
                  </CardHeader>
                  {expandedCategories.has(category.id) && (
                    <CardContent className="p-3">
                      <div className="space-y-2">
                        {category.materials.map((material) => {
                          const isInBundle = materialBundleMap.has(material.id);
                          const isSelected = selectedMaterialIds.has(material.id);
                          const bundleInfo = materialBundleMap.get(material.id);

                          return (
                            <div
                              key={material.id}
                              className={`p-3 rounded-lg border ${isSelected ? 'border-primary border-2 bg-primary/5' : 'bg-card'} ${isInBundle ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:shadow-sm'} transition-all`}
                              onClick={() => !isInBundle && toggleMaterialSelection(material.id)}
                            >
                              <div className="flex items-start gap-3">
                                <Checkbox
                                  checked={isSelected}
                                  disabled={isInBundle}
                                  className="mt-1"
                                />
                                <div className="flex-1">
                                  <div className="flex items-baseline gap-2">
                                    <h5 className="font-medium text-sm">{material.name}</h5>
                                    {material.length && (
                                      <span className="text-xs text-muted-foreground">
                                        {cleanMaterialValue(material.length)}
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 mt-1">
                                    <span className="text-sm text-muted-foreground">
                                      Qty: {material.quantity}
                                    </span>
                                    {isInBundle && bundleInfo && (
                                      <Badge variant="outline" className="text-xs">
                                        In bundle: {bundleInfo.bundleName}
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  )}
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="order">
          <MaterialsCatalogBrowser
            job={job}
            userId={userId}
            onMaterialAdded={() => {
              loadMaterials();
            }}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
