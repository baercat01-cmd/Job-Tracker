import { useState, useEffect } from 'react';
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
import { ChevronDown, ChevronRight, Package, Camera, FileText, ChevronDownIcon, Search, X, PackagePlus, Layers, ShoppingCart, Calendar, ArrowUpDown, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { createNotification, getMaterialStatusBrief } from '@/lib/notifications';
import { getLocalDateString } from '@/lib/utils';
import type { Job } from '@/types';
import { ReadyForJobMaterials } from './ReadyForJobMaterials';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface Material {
  id: string;
  category_id: string;
  name: string;
  quantity: number;
  length: string | null;
  status: 'not_ordered' | 'ordered' | 'at_shop' | 'at_job' | 'installed' | 'missing';
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
  status: 'not_ordered' | 'ordered' | 'at_shop' | 'at_job' | 'installed' | 'missing';
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
  const [bundles, setBundles] = useState<MaterialBundle[]>([]);
  const [materialBundleMap, setMaterialBundleMap] = useState<Map<string, { bundleId: string; bundleName: string }>>(new Map());
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'ready'>('all');
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

  useEffect(() => {
    loadMaterials();
    loadBundles();
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

      // Group materials by category, including all materials
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
      toast.success('Status updated');
      loadMaterials();
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
      toast.success(`All ${materialIds.length} variants updated to ${STATUS_CONFIG[status].label}`);
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

      toast.success(`Status updated to ${STATUS_CONFIG[newStatus].label}`);
      setStatusChangeMaterial(null);
      setStatusChangeMaterialGroup(null);
      loadMaterials();
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

      toast.success('Dates updated');
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
          status: 'not_ordered',
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

      toast.success(`Bundle "${bundleName}" created with ${selectedMaterialIds.size} materials`);
      
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

      toast.success(`Bundle "${bundles.find(b => b.id === bundleId)?.name}" and all materials updated to ${STATUS_CONFIG[status].label}`);
      await Promise.all([loadMaterials(), loadBundles()]);
    } catch (error: any) {
      console.error('Error updating bundle status:', error);
      toast.error('Failed to update bundle status');
    }
  }

  async function deleteBundle(bundleId: string) {
    try {
      const { error } = await supabase
        .from('material_bundles')
        .delete()
        .eq('id', bundleId);

      if (error) throw error;

      toast.success('Bundle deleted');
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

      // Sort materials
      const sortedMaterials = [...filteredMaterials].sort((a, b) => {
        if (sortBy === 'name') {
          return a.name.localeCompare(b.name);
        } else if (sortBy === 'status') {
          const statusOrder = ['not_ordered', 'ordered', 'at_shop', 'at_job', 'installed', 'missing'];
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

  const filteredCategories = getFilteredCategories();

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
    <div className="space-y-3 w-full lg:max-w-3xl lg:mx-auto">
      {/* Tab Switcher */}
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'all' | 'ready')} className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-4">
          <TabsTrigger value="all" className="flex items-center gap-2">
            <Layers className="w-4 h-4" />
            All Materials
          </TabsTrigger>
          <TabsTrigger value="ready" className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4" />
            Ready for Job
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-3">
      {/* Action Bar - Mobile Optimized */}
      {!selectionMode ? (
        <Button
          onClick={toggleSelectionMode}
          variant="default"
          className="w-full h-12 text-base font-semibold gradient-primary"
        >
          <PackagePlus className="w-5 h-5 mr-2" />
          Create Bundle
        </Button>
      ) : (
        <div className="flex gap-2">
          <Button
            onClick={openCreateBundleDialog}
            disabled={selectedMaterialIds.size === 0}
            className="flex-1 h-12 text-base font-semibold gradient-primary"
          >
            <Layers className="w-5 h-5 mr-2" />
            Bundle ({selectedMaterialIds.size})
          </Button>
          <Button
            onClick={toggleSelectionMode}
            variant="outline"
            className="h-12 px-4"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>
      )}

      {/* Search, Sort, and Status Filter */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input
            placeholder="Search materials..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-11 pr-12 h-12 text-base"
          />
          {searchTerm && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSearchTerm('')}
              className="absolute right-1 top-1/2 transform -translate-y-1/2 h-10 w-10 p-0"
            >
              <X className="w-5 h-5" />
            </Button>
          )}
        </div>

        {/* Sort Dropdown */}
        <div className="w-36">
          <Select value={sortBy} onValueChange={(value) => setSortBy(value as 'name' | 'status' | 'date' | 'quantity')}>
            <SelectTrigger className="h-12 text-sm">
              <ArrowUpDown className="w-4 h-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name">Name</SelectItem>
              <SelectItem value="status">Status</SelectItem>
              <SelectItem value="date">Date</SelectItem>
              <SelectItem value="quantity">Quantity</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Status Filter Tab - Compact */}
        <div className="w-44">
          <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
            <SelectTrigger className="h-12 text-sm">
              <SelectValue>
                {statusFilter === 'all' ? (
                  'All'
                ) : (
                  <div className="flex items-center gap-1.5">
                    <span className={`w-2.5 h-2.5 rounded-full ${STATUS_CONFIG[statusFilter as keyof typeof STATUS_CONFIG].color}`} />
                    {STATUS_CONFIG[statusFilter as keyof typeof STATUS_CONFIG].label}
                  </div>
                )}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-sm py-2">All Materials</SelectItem>
              {Object.entries(STATUS_CONFIG).map(([status, config]) => (
                <SelectItem key={status} value={status} className="text-sm py-2">
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${config.color}`} />
                    {config.label}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Bundles */}
      {bundles.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5 py-1">
            <Layers className="w-3.5 h-3.5" />
            Bundles
          </h3>
          {bundles.map((bundle) => (
            <Card key={bundle.id} className="border-2 border-primary/20">
              <CardHeader
                className="cursor-pointer hover:bg-muted/50 transition-colors py-2"
                onClick={() => toggleBundle(bundle.id)}
              >
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    {expandedBundles.has(bundle.id) ? (
                      <ChevronDown className="w-6 h-6" />
                    ) : (
                      <ChevronRight className="w-6 h-6" />
                    )}
                    <Layers className="w-5 h-5 text-primary" />
                    {bundle.name}
                  </CardTitle>
                </div>
                {bundle.description && (
                  <p className="text-xs text-muted-foreground mt-1">{bundle.description}</p>
                )}
              </CardHeader>

              {expandedBundles.has(bundle.id) && (
                <CardContent className="space-y-3 p-3">
                  {/* Bundle Status Control */}
                  <div className="pb-4 border-b" onClick={(e) => e.stopPropagation()}>
                    <Label className="text-sm font-semibold mb-2 block">Update Bundle Status</Label>
                    <Select
                      value={bundle.status}
                      onValueChange={(value) => updateBundleStatus(bundle.id, value as Material['status'])}
                    >
                      <SelectTrigger 
                        className={`h-auto min-h-12 text-base font-semibold border-2 rounded-md ${STATUS_CONFIG[bundle.status].bgClass} hover:shadow-md cursor-pointer transition-all`}
                      >
                        <div className="w-full py-2">
                          <div className="flex items-center justify-between mb-1">
                            <span>{STATUS_CONFIG[bundle.status].label}</span>
                            <ChevronDownIcon className="w-5 h-5 opacity-70" />
                          </div>
                          {bundle.materials.some(m => m.date_needed_by) && (
                            <div className="text-xs opacity-90 font-normal text-left">
                              {bundle.materials.filter(m => m.date_needed_by).length} item(s) with delivery dates
                            </div>
                          )}
                          {bundle.updated_at && (
                            <div className="text-xs opacity-80 font-normal text-left">
                              Updated: {new Date(bundle.updated_at).toLocaleDateString()}
                            </div>
                          )}
                        </div>
                      </SelectTrigger>
                      <SelectContent className="min-w-[180px]">
                        {Object.entries(STATUS_CONFIG).map(([status, config]) => (
                          <SelectItem 
                            key={status} 
                            value={status} 
                            className="text-base cursor-pointer py-3"
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

                  {/* Bundle Materials - Mobile Optimized */}
                  <div className="space-y-2">
                    {bundle.materials.map((material) => (
                      <div
                        key={material.id}
                        className="p-2 border-2 rounded-lg bg-muted/30 space-y-2"
                      >
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-bold text-lg text-foreground">{material.name}</p>
                            {material.length && (
                              <>
                                <span className="text-base text-muted-foreground">•</span>
                                <span className="text-base text-muted-foreground">L: {material.length}</span>
                              </>
                            )}
                            <span className="text-base text-muted-foreground">•</span>
                            <span className="font-medium text-base">Qty: {material.quantity}</span>
                          </div>
                          {material.use_case && (
                            <p className="text-sm text-muted-foreground mt-1">
                              Use: {material.use_case}
                            </p>
                          )}
                        </div>
                        <div onClick={(e) => e.stopPropagation()}>
                          <Select
                            value={material.status}
                            onValueChange={async (value) => {
                              try {
                                const oldStatus = material.status;
                                const { error } = await supabase
                                  .from('materials')
                                  .update({ status: value, updated_at: new Date().toISOString() })
                                  .eq('id', material.id);
                                
                                if (error) throw error;
                                toast.success(`${material.name} status updated`);
                                
                                await createNotification({
                                  jobId: job.id,
                                  createdBy: userId,
                                  type: 'material_status',
                                  brief: getMaterialStatusBrief(material.name, oldStatus, value as Material['status']),
                                  referenceId: material.id,
                                  referenceData: { 
                                    materialName: material.name,
                                    oldStatus,
                                    newStatus: value,
                                    bundleName: bundle.name,
                                  },
                                });
                                
                                await Promise.all([loadMaterials(), loadBundles()]);
                              } catch (error: any) {
                                toast.error('Failed to update status');
                                console.error(error);
                              }
                            }}
                          >
                            <SelectTrigger 
                              className={`h-auto min-h-11 text-sm font-semibold border-2 rounded-md ${STATUS_CONFIG[material.status].bgClass} hover:shadow-md cursor-pointer transition-all`}
                            >
                              <div className="w-full py-2 text-left space-y-1">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <div className={`w-2.5 h-2.5 rounded-full ${STATUS_CONFIG[material.status].color}`} />
                                    <span className="font-bold">{STATUS_CONFIG[material.status].label}</span>
                                  </div>
                                  <ChevronDownIcon className="w-4 h-4 opacity-70" />
                                </div>
                                
                                {/* Status-specific Date Display - Clickable */}
                                {material.status === 'not_ordered' && material.order_by_date && (
                                  <div 
                                    className="bg-black/10 rounded px-2 py-1 mt-1 cursor-pointer hover:bg-black/20 transition-colors"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openEditDates(material);
                                    }}
                                  >
                                    <div className="flex items-center gap-1.5 text-xs font-semibold">
                                      <span>📋</span>
                                      <span>Order by: {new Date(material.order_by_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                                    </div>
                                  </div>
                                )}
                                
                                {material.status === 'ordered' && material.delivery_date && (
                                  <div 
                                    className="bg-black/10 rounded px-2 py-1 mt-1 cursor-pointer hover:bg-black/20 transition-colors"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openEditDates(material);
                                    }}
                                  >
                                    <div className="flex items-center gap-1.5 text-xs font-semibold">
                                      <span>🚚</span>
                                      <span>Delivery: {new Date(material.delivery_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                                    </div>
                                  </div>
                                )}
                                
                                {['at_shop', 'at_job', 'installed', 'missing'].includes(material.status) && material.updated_at && (
                                  <div 
                                    className="bg-black/10 rounded px-2 py-1 mt-1 cursor-pointer hover:bg-black/20 transition-colors"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openEditDates(material);
                                    }}
                                  >
                                    <div className="flex items-center gap-1.5 text-xs font-semibold">
                                      <span>📅</span>
                                      <span>Updated: {new Date(material.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </SelectTrigger>
                            <SelectContent className="min-w-[160px]">
                              {Object.entries(STATUS_CONFIG).map(([status, config]) => (
                                <SelectItem 
                                  key={status} 
                                  value={status} 
                                  className="text-sm cursor-pointer py-3"
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
                    ))}
                  </div>

                  {/* Delete Bundle */}
                  <Button
                    variant="outline"
                    onClick={() => {
                      if (confirm(`Delete bundle "${bundle.name}"? Materials will be moved back to individual items.`)) {
                        deleteBundle(bundle.id);
                      }
                    }}
                    className="w-full h-12 text-base text-destructive hover:text-destructive"
                  >
                    <X className="w-5 h-5 mr-2" />
                    Delete Bundle
                  </Button>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Individual Materials Header */}
      {bundles.length > 0 && categories.some(c => c.materials.length > 0) && (
        <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5 py-1">
          <Package className="w-3.5 h-3.5" />
          Materials
        </h3>
      )}

      {/* Categories - Mobile Optimized with Grouping */}
      {filteredCategories.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground text-base">
            No materials match the selected filter
          </CardContent>
        </Card>
      ) : (
        filteredCategories.map((category) => (
          <Card key={category.id}>
            <CardHeader
              className="cursor-pointer hover:bg-muted/50 transition-colors py-2"
              onClick={() => toggleCategory(category.id)}
            >
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  {expandedCategories.has(category.id) ? (
                    <ChevronDown className="w-6 h-6" />
                  ) : (
                    <ChevronRight className="w-6 h-6" />
                  )}
                  {category.name}
                </CardTitle>
              </div>
            </CardHeader>

            {expandedCategories.has(category.id) && (
              <CardContent className="space-y-2 p-3">
                {category.groupedMaterials?.map((group) => {
                  const hasMultipleUseCases = group.materials.length > 1;
                  const firstMaterial = group.materials[0];
                  const bundleInfo = materialBundleMap.get(firstMaterial.id);
                  const isInBundle = !!bundleInfo;
                  const isExpanded = expandedGroups.has(group.groupKey);

                  return (
                    <div
                      key={group.groupKey}
                      className={`p-2 border-2 rounded-lg transition-colors space-y-2 ${
                        isInBundle ? 'bg-primary/5 border-primary/30' : 'hover:bg-muted/50 active:bg-muted'
                      }`}
                    >
                      {/* Selection checkbox for bundle mode */}
                      {selectionMode && group.materials.map(material => {
                        const materialBundleInfo = materialBundleMap.get(material.id);
                        const materialIsInBundle = !!materialBundleInfo;
                        
                        return (
                          <div key={material.id} className="flex items-center gap-2 pb-2 border-b">
                            <Checkbox
                              checked={selectedMaterialIds.has(material.id)}
                              onCheckedChange={() => toggleMaterialSelection(material.id)}
                              onClick={(e) => e.stopPropagation()}
                              disabled={materialIsInBundle}
                              className="h-5 w-5"
                            />
                            <span className="text-xs text-muted-foreground">
                              {materialIsInBundle ? 'Already in bundle' : `Select ${material.use_case || 'this material'}`}
                            </span>
                          </div>
                        );
                      })}
                      
                      <div className="space-y-2">
                        <div 
                          className="cursor-pointer" 
                          onClick={() => hasMultipleUseCases ? toggleGroup(group.groupKey) : !selectionMode && openMaterialDetail(firstMaterial)}
                        >
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <p className="font-bold text-lg text-foreground">{group.name}</p>
                            {group.length && (
                              <>
                                <span className="text-base text-muted-foreground">•</span>
                                <span className="text-base text-muted-foreground">L: {group.length}</span>
                              </>
                            )}
                            <span className="text-base text-muted-foreground">•</span>
                            <span className="font-medium text-base">Qty: {group.totalQuantity}</span>
                            {hasMultipleUseCases && (
                              <>
                                <span className="text-base text-muted-foreground">•</span>
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  className="h-6 px-2 text-xs text-primary hover:text-primary"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleGroup(group.groupKey);
                                  }}
                                >
                                  {isExpanded ? <ChevronDown className="w-4 h-4 mr-1" /> : <ChevronRight className="w-4 h-4 mr-1" />}
                                  {group.materials.length} uses
                                </Button>
                              </>
                            )}
                            {isInBundle && (
                              <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/30 ml-auto">
                                <Layers className="w-3 h-3 mr-1" />
                                {bundleInfo.bundleName}
                              </Badge>
                            )}
                            {firstMaterial.date_needed_by && (
                              <Badge variant="outline" className="text-xs bg-yellow-50 text-yellow-700 border-yellow-300">
                                <Calendar className="w-3 h-3 mr-1" />
                                Need by {new Date(firstMaterial.date_needed_by).toLocaleDateString()}
                              </Badge>
                            )}
                          </div>
                          {!hasMultipleUseCases && firstMaterial.use_case && (
                            <p className="text-sm text-muted-foreground">
                              Use: {firstMaterial.use_case}
                            </p>
                          )}
                        </div>

                        {/* Use Cases Dropdown */}
                        {hasMultipleUseCases && isExpanded && (
                          <div className="pl-4 border-l-2 border-primary/30 space-y-2">
                            {group.materials.map((material) => (
                              <div 
                                key={material.id} 
                                className="p-2 bg-muted/30 rounded border cursor-pointer hover:bg-muted"
                                onClick={() => !selectionMode && openMaterialDetail(material)}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-sm font-medium">
                                    {material.use_case || 'General Use'}
                                  </span>
                                  <Badge variant="secondary" className="text-sm">
                                    Qty: {material.quantity}
                                  </Badge>
                                </div>
                                {material.notes && (
                                  <p className="text-xs text-muted-foreground mt-1">
                                    Note: {material.notes}
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                        
                        <div onClick={(e) => e.stopPropagation()} className="space-y-2">
                          <Select
                            value={group.primaryStatus}
                            onValueChange={(value) => handleGroupStatusChange(group, value as Material['status'])}
                          >
                            <SelectTrigger 
                              className={`h-auto min-h-10 text-sm font-semibold border-2 rounded-md ${STATUS_CONFIG[group.primaryStatus].bgClass} hover:shadow-md active:shadow-lg cursor-pointer transition-all`}
                            >
                              <div className="w-full py-2 text-left space-y-1">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <div className={`w-2.5 h-2.5 rounded-full ${STATUS_CONFIG[group.primaryStatus].color}`} />
                                    <span className="font-bold">{STATUS_CONFIG[group.primaryStatus].label}</span>
                                  </div>
                                  <ChevronDownIcon className="w-4 h-4 opacity-70" />
                                </div>
                                
                                {/* Status-specific Date Display - Clickable */}
                                {group.primaryStatus === 'not_ordered' && group.materials[0].order_by_date && (
                                  <div 
                                    className="bg-black/10 rounded px-2 py-1 mt-1 cursor-pointer hover:bg-black/20 transition-colors"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openEditDatesGroup(group);
                                    }}
                                  >
                                    <div className="flex items-center gap-1.5 text-xs font-semibold">
                                      <span>📋</span>
                                      <span>Order by: {new Date(group.materials[0].order_by_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                                    </div>
                                  </div>
                                )}
                                
                                {group.primaryStatus === 'ordered' && group.materials[0].delivery_date && (
                                  <div 
                                    className="bg-black/10 rounded px-2 py-1 mt-1 cursor-pointer hover:bg-black/20 transition-colors"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openEditDatesGroup(group);
                                    }}
                                  >
                                    <div className="flex items-center gap-1.5 text-xs font-semibold">
                                      <span>🚚</span>
                                      <span>Delivery: {new Date(group.materials[0].delivery_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                                    </div>
                                  </div>
                                )}
                                
                                {['at_shop', 'at_job', 'installed', 'missing'].includes(group.primaryStatus) && group.materials[0].updated_at && (
                                  <div 
                                    className="bg-black/10 rounded px-2 py-1 mt-1 cursor-pointer hover:bg-black/20 transition-colors"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openEditDatesGroup(group);
                                    }}
                                  >
                                    <div className="flex items-center gap-1.5 text-xs font-semibold">
                                      <span>📅</span>
                                      <span>Updated: {new Date(group.materials[0].updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </SelectTrigger>
                            <SelectContent className="min-w-[180px]">
                              {Object.entries(STATUS_CONFIG).map(([status, config]) => (
                                <SelectItem 
                                  key={status} 
                                  value={status} 
                                  className="text-base cursor-pointer py-3"
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
                      
                      {isInBundle && (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground pt-1.5 border-t">
                          <Layers className="w-3.5 h-3.5" />
                          <span>Part of "{bundleInfo.bundleName}" bundle</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            )}
          </Card>
        ))
      )}

      {/* Material Detail Modal - Mobile Optimized */}
      <Dialog open={!!selectedMaterial} onOpenChange={() => setSelectedMaterial(null)}>
        <DialogContent className="max-w-lg max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl">{selectedMaterial?.name}</DialogTitle>
          </DialogHeader>

          {selectedMaterial && (
            <div className="space-y-6">
              {/* Material Name */}
              <div className="space-y-3">
                <Label htmlFor="material-name" className="text-lg font-semibold">Material Name</Label>
                <Input
                  id="material-name"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Enter material name..."
                  className="h-12 text-base"
                />
                {editName !== selectedMaterial.name && (
                  <Button
                    onClick={saveMaterialDetails}
                    disabled={savingDetails || !editName.trim()}
                    className="w-full h-11 gradient-primary"
                  >
                    {savingDetails ? 'Saving...' : 'Save Name'}
                  </Button>
                )}
              </div>

              {/* Use Case */}
              <div className="space-y-3">
                <Label htmlFor="material-use-case" className="text-lg font-semibold">Use Case</Label>
                <Input
                  id="material-use-case"
                  value={editUseCase}
                  onChange={(e) => setEditUseCase(e.target.value)}
                  placeholder="Enter use case (optional)..."
                  className="h-12 text-base"
                />
                {editUseCase !== ((selectedMaterial as any).use_case || '') && (
                  <Button
                    onClick={saveMaterialDetails}
                    disabled={savingDetails}
                    className="w-full h-11 gradient-primary"
                  >
                    {savingDetails ? 'Saving...' : 'Save Use Case'}
                  </Button>
                )}
              </div>

              {/* Length */}
              <div className="space-y-3">
                <Label htmlFor="material-length" className="text-lg font-semibold">Length</Label>
                <Input
                  id="material-length"
                  value={editLength}
                  onChange={(e) => setEditLength(e.target.value)}
                  placeholder="Enter length (optional)..."
                  className="h-12 text-base"
                />
                {editLength !== (selectedMaterial.length || '') && (
                  <Button
                    onClick={saveMaterialDetails}
                    disabled={savingDetails}
                    className="w-full h-11 gradient-primary"
                  >
                    {savingDetails ? 'Saving...' : 'Save Length'}
                  </Button>
                )}
              </div>
              
              {/* Quantity Editor - Mobile Optimized */}
              <div className="space-y-3">
                <Label htmlFor="material-quantity" className="text-lg font-semibold">Quantity</Label>
                <Input
                  id="material-quantity"
                  type="number"
                  min="0"
                  step="1"
                  value={editQuantity}
                  onChange={(e) => setEditQuantity(Math.max(0, parseFloat(e.target.value) || 0))}
                  placeholder="Enter quantity..."
                  className="h-14 text-xl font-semibold text-center"
                />
                {editQuantity !== selectedMaterial.quantity && (
                  <>
                    <div className="text-base text-muted-foreground bg-primary/5 p-3 rounded">
                      Original: <span className="font-medium">{selectedMaterial.quantity}</span>
                      <span className="mx-2">→</span>
                      New: <span className="font-medium text-primary">{editQuantity}</span>
                      <span className="ml-2">
                        ({editQuantity > selectedMaterial.quantity ? '+' : ''}
                        {editQuantity - selectedMaterial.quantity})
                      </span>
                    </div>
                    <Button
                      onClick={updateMaterialQuantity}
                      disabled={savingQuantity}
                      className="w-full h-12 gradient-primary text-base"
                    >
                      {savingQuantity ? 'Saving...' : 'Save Quantity'}
                    </Button>
                  </>
                )}
              </div>

              {/* Status Update - Mobile Optimized */}
              <div className="space-y-3">
                <Label className="text-lg font-semibold">Update Status</Label>
                <div className="grid grid-cols-2 gap-3">
                  {Object.entries(STATUS_CONFIG).map(([status, config]) => (
                    <Button
                      key={status}
                      variant={selectedMaterial.status === status ? 'default' : 'outline'}
                      onClick={() => updateMaterialStatus(status as Material['status'])}
                      className={`h-14 text-sm font-semibold ${
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

              {/* Notes - Mobile Optimized */}
              <div className="space-y-3">
                <Label htmlFor="material-notes" className="text-lg font-semibold">
                  Notes
                </Label>
                <Textarea
                  id="material-notes"
                  value={materialNotes}
                  onChange={(e) => setMaterialNotes(e.target.value)}
                  placeholder="Add notes about this material..."
                  rows={4}
                  className="resize-none text-base"
                />
                <Button
                  onClick={saveMaterialNotes}
                  variant="outline"
                  className="w-full h-12 text-base"
                >
                  <FileText className="w-5 h-5 mr-2" />
                  Save Notes
                </Button>
              </div>

              {/* Photos - Mobile Optimized */}
              <div className="space-y-3">
                <Label className="text-lg font-semibold">Photos</Label>
                
                <Button
                  variant="outline"
                  className="w-full h-14 text-base"
                  disabled={uploadingPhoto}
                  onClick={() => document.getElementById('material-photo-upload')?.click()}
                >
                  <Camera className="w-6 h-6 mr-2" />
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
                  <div className="grid grid-cols-2 gap-3">
                    {materialPhotos.map((photo) => (
                      <img
                        key={photo.id}
                        src={photo.photo_url}
                        alt="Material"
                        className="w-full aspect-square object-cover rounded-lg border-2"
                      />
                    ))}
                  </div>
                )}
              </div>

              <Button
                variant="outline"
                onClick={() => setSelectedMaterial(null)}
                className="w-full h-12 text-base"
              >
                Close
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Dates Dialog (without status change) */}
      <Dialog open={!!(editDatesMaterial || editDatesGroup)} onOpenChange={() => {
        setEditDatesMaterial(null);
        setEditDatesGroup(null);
      }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              Edit Material Dates
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="bg-primary/5 rounded-lg p-4 border border-primary/20">
              {editDatesMaterial ? (
                <>
                  <p className="font-semibold text-base">{editDatesMaterial.name}</p>
                  {editDatesMaterial.use_case && (
                    <p className="text-sm text-muted-foreground mt-1">Use: {editDatesMaterial.use_case}</p>
                  )}
                  <div className="flex items-center gap-4 mt-2 text-sm">
                    <span>Qty: <span className="font-semibold">{editDatesMaterial.quantity}</span></span>
                    {editDatesMaterial.length && (
                      <span>Length: <span className="font-semibold">{editDatesMaterial.length}</span></span>
                    )}
                  </div>
                  <div className="mt-2">
                    <Badge className={STATUS_CONFIG[editDatesMaterial.status].bgClass}>
                      {STATUS_CONFIG[editDatesMaterial.status].label}
                    </Badge>
                  </div>
                </>
              ) : editDatesGroup && (
                <>
                  <p className="font-semibold text-base">{editDatesGroup[0].name}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {editDatesGroup.length} variant{editDatesGroup.length > 1 ? 's' : ''}
                  </p>
                </>
              )}
            </div>

            <div className="space-y-3">
              <div>
                <Label htmlFor="edit-order-by-date" className="flex items-center gap-2">
                  📋 Order By Date
                </Label>
                <Input
                  id="edit-order-by-date"
                  type="date"
                  value={orderByDate}
                  onChange={(e) => setOrderByDate(e.target.value)}
                  className="h-10"
                />
                <p className="text-xs text-muted-foreground mt-1">Deadline to place this order</p>
              </div>

              <div>
                <Label htmlFor="edit-delivery-date" className="flex items-center gap-2">
                  🚚 Expected Delivery Date
                </Label>
                <Input
                  id="edit-delivery-date"
                  type="date"
                  value={deliveryDate}
                  onChange={(e) => setDeliveryDate(e.target.value)}
                  className="h-10"
                />
                <p className="text-xs text-muted-foreground mt-1">Target delivery date to shop</p>
              </div>

              <div>
                <Label htmlFor="edit-pull-by-date" className="flex items-center gap-2">
                  🏪 Pull By Date
                </Label>
                <Input
                  id="edit-pull-by-date"
                  type="date"
                  value={pullByDate}
                  onChange={(e) => setPullByDate(e.target.value)}
                  className="h-10"
                />
                <p className="text-xs text-muted-foreground mt-1">When to pull this material from shop</p>
              </div>

              <div>
                <Label htmlFor="edit-actual-delivery-date" className="flex items-center gap-2">
                  ✅ Actual Delivery Date
                </Label>
                <Input
                  id="edit-actual-delivery-date"
                  type="date"
                  value={actualDeliveryDate}
                  onChange={(e) => setActualDeliveryDate(e.target.value)}
                  className="h-10"
                />
                <p className="text-xs text-muted-foreground mt-1">When material arrived at job site</p>
              </div>
            </div>

            <div className="space-y-3">
              <Label htmlFor="edit-date-notes">Notes (Optional)</Label>
              <Textarea
                id="edit-date-notes"
                value={dateNotes}
                onChange={(e) => setDateNotes(e.target.value)}
                placeholder="Any additional notes..."
                rows={3}
                className="resize-none text-base"
              />
            </div>

            <div className="flex flex-col gap-3 pt-4 border-t">
              <Button
                onClick={saveDates}
                disabled={savingDates}
                className="h-12 text-base gradient-primary"
              >
                {savingDates ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Calendar className="w-5 h-5 mr-2" />
                    Save Dates
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setEditDatesMaterial(null);
                  setEditDatesGroup(null);
                }}
                disabled={savingDates}
                className="h-12 text-base"
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Status Change Dialog with Date Tracking */}
      <Dialog open={!!(statusChangeMaterial || statusChangeMaterialGroup)} onOpenChange={() => {
        setStatusChangeMaterial(null);
        setStatusChangeMaterialGroup(null);
      }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              Update Material Status
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="bg-primary/5 rounded-lg p-4 border border-primary/20">
              {statusChangeMaterial ? (
                <>
                  <p className="font-semibold text-base">{statusChangeMaterial.name}</p>
                  {statusChangeMaterial.use_case && (
                    <p className="text-sm text-muted-foreground mt-1">Use: {statusChangeMaterial.use_case}</p>
                  )}
                  <div className="flex items-center gap-4 mt-2 text-sm">
                    <span>Qty: <span className="font-semibold">{statusChangeMaterial.quantity}</span></span>
                    {statusChangeMaterial.length && (
                      <span>Length: <span className="font-semibold">{statusChangeMaterial.length}</span></span>
                    )}
                  </div>
                </>
              ) : statusChangeMaterialGroup && (
                <>
                  <p className="font-semibold text-base">{statusChangeMaterialGroup[0].name}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {statusChangeMaterialGroup.length} variant{statusChangeMaterialGroup.length > 1 ? 's' : ''}
                  </p>
                </>
              )}
              <div className="mt-3 pt-3 border-t">
                <p className="text-sm font-medium mb-1">Changing to:</p>
                <Badge className={STATUS_CONFIG[newStatus].bgClass}>
                  {STATUS_CONFIG[newStatus].label}
                </Badge>
              </div>
            </div>

            {/* Date inputs based on status */}
            {newStatus === 'ordered' && (
              <div className="space-y-3">
                <div>
                  <Label htmlFor="order-by-date" className="flex items-center gap-2">
                    📋 Order By Date
                  </Label>
                  <Input
                    id="order-by-date"
                    type="date"
                    value={orderByDate}
                    onChange={(e) => setOrderByDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    className="h-10"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Deadline to place this order</p>
                </div>
                <div>
                  <Label htmlFor="delivery-date" className="flex items-center gap-2">
                    🚚 Expected Delivery Date
                  </Label>
                  <Input
                    id="delivery-date"
                    type="date"
                    value={deliveryDate}
                    onChange={(e) => setDeliveryDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    className="h-10"
                  />
                  <p className="text-xs text-muted-foreground mt-1">When material should arrive at shop</p>
                </div>
              </div>
            )}

            {newStatus === 'at_shop' && (
              <div>
                <Label htmlFor="pull-by-date" className="flex items-center gap-2">
                  🏪 Pull By Date
                </Label>
                <Input
                  id="pull-by-date"
                  type="date"
                  value={pullByDate}
                  onChange={(e) => setPullByDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className="h-10"
                />
                <p className="text-xs text-muted-foreground mt-1">When to pull this material from shop</p>
              </div>
            )}

            {newStatus === 'at_job' && (
              <div>
                <Label htmlFor="actual-delivery-date" className="flex items-center gap-2">
                  ✅ Actual Delivery Date
                </Label>
                <Input
                  id="actual-delivery-date"
                  type="date"
                  value={actualDeliveryDate}
                  onChange={(e) => setActualDeliveryDate(e.target.value)}
                  max={new Date().toISOString().split('T')[0]}
                  className="h-10"
                />
                <p className="text-xs text-muted-foreground mt-1">When material arrived at job site</p>
              </div>
            )}

            <div className="space-y-3">
              <Label htmlFor="date-notes">Notes (Optional)</Label>
              <Textarea
                id="date-notes"
                value={dateNotes}
                onChange={(e) => setDateNotes(e.target.value)}
                placeholder="Any additional notes..."
                rows={3}
                className="resize-none text-base"
              />
            </div>

            <div className="flex flex-col gap-3 pt-4 border-t">
              <Button
                onClick={confirmStatusChange}
                disabled={submittingStatus}
                className="h-12 text-base gradient-primary"
              >
                {submittingStatus ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    Updating...
                  </>
                ) : (
                  <>Confirm Update</>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setStatusChangeMaterial(null);
                  setStatusChangeMaterialGroup(null);
                }}
                disabled={submittingStatus}
                className="h-12 text-base"
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Bundle Dialog - Mobile Optimized */}
      <Dialog open={showCreateBundle} onOpenChange={closeCreateBundleDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-xl">Create Material Bundle</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="bg-primary/5 rounded-lg p-4 border border-primary/20">
              <p className="text-base font-medium">Selected Materials: {selectedMaterialIds.size}</p>
            </div>

            <div className="space-y-3">
              <Label htmlFor="bundle-name" className="text-base font-semibold">Bundle Name *</Label>
              <Input
                id="bundle-name"
                value={bundleName}
                onChange={(e) => setBundleName(e.target.value)}
                placeholder="e.g., Roof Package, Foundation Kit..."
                className="h-12 text-base"
              />
            </div>

            <div className="space-y-3">
              <Label htmlFor="bundle-description" className="text-base font-semibold">Description (Optional)</Label>
              <Textarea
                id="bundle-description"
                value={bundleDescription}
                onChange={(e) => setBundleDescription(e.target.value)}
                placeholder="Add notes about this bundle..."
                rows={4}
                className="resize-none text-base"
              />
            </div>

            <div className="flex flex-col gap-3 pt-4 border-t">
              <Button
                onClick={createBundle}
                disabled={creatingBundle || !bundleName.trim()}
                className="h-12 text-base gradient-primary"
              >
                {creatingBundle ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Layers className="w-5 h-5 mr-2" />
                    Create Bundle
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={closeCreateBundleDialog}
                disabled={creatingBundle}
                className="h-12 text-base"
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
        </TabsContent>

        <TabsContent value="ready">
          <ReadyForJobMaterials userId={userId} currentJobId={job.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
