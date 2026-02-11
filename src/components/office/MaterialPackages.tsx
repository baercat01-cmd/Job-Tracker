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
import {
  Package,
  Plus,
  Edit,
  Trash2,
  ChevronDown,
  ChevronRight,
  CheckSquare,
  Square,
  ChevronLeft,
} from 'lucide-react';
import { toast } from 'sonner';

interface MaterialItem {
  id: string;
  sheet_id: string;
  category: string;
  material_name: string;
  quantity: number;
  length: string | null;
  usage: string | null;
  cost_per_unit: number | null;
  sheets: {
    sheet_name: string;
  };
}

interface BundleItem {
  id: string;
  bundle_id: string;
  material_item_id: string;
  added_at: string;
  material_items: MaterialItem;
}

interface MaterialBundle {
  id: string;
  job_id: string;
  name: string;
  description: string | null;
  status: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  bundle_items: BundleItem[];
}

interface MaterialWorkbook {
  id: string;
  job_id: string;
  sheets: MaterialSheet[];
}

interface MaterialSheet {
  id: string;
  workbook_id: string;
  sheet_name: string;
  items: MaterialItem[];
}

interface MaterialPackagesProps {
  jobId: string;
  userId: string;
  workbook?: MaterialWorkbook | null;
}

export function MaterialPackages({ jobId, userId, workbook }: MaterialPackagesProps) {
  const [packages, setPackages] = useState<MaterialBundle[]>([]);
  const [availableMaterials, setAvailableMaterials] = useState<MaterialItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<'list' | 'add'>('list');
  const [selectedPackageForAdd, setSelectedPackageForAdd] = useState<string>('');
  const [selectedSheetId, setSelectedSheetId] = useState<string>('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showAddMaterialsDialog, setShowAddMaterialsDialog] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<MaterialBundle | null>(null);
  const [expandedPackages, setExpandedPackages] = useState<Set<string>>(new Set());
  
  // Form state
  const [packageName, setPackageName] = useState('');
  const [packageDescription, setPackageDescription] = useState('');
  const [selectedMaterialIds, setSelectedMaterialIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadPackages();
    loadAvailableMaterials();

    // Set initial sheet if workbook is available
    if (workbook && workbook.sheets.length > 0 && !selectedSheetId) {
      setSelectedSheetId(workbook.sheets[0].id);
    }

    // Subscribe to changes
    const bundlesChannel = supabase
      .channel('material_bundles_changes')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'material_bundles', filter: `job_id=eq.${jobId}` },
        () => {
          loadPackages();
        }
      )
      .subscribe();

    const itemsChannel = supabase
      .channel('material_bundle_items_changes')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'material_bundle_items' },
        () => {
          loadPackages();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(bundlesChannel);
      supabase.removeChannel(itemsChannel);
    };
  }, [jobId, workbook]);

  async function loadPackages() {
    try {
      setLoading(true);
      
      const { data, error } = await supabase
        .from('material_bundles')
        .select(`
          *,
          bundle_items:material_bundle_items(
            id,
            bundle_id,
            material_item_id,
            added_at,
            material_items(
              id,
              sheet_id,
              category,
              material_name,
              quantity,
              length,
              usage,
              cost_per_unit,
              sheets:material_sheets(sheet_name)
            )
          )
        `)
        .eq('job_id', jobId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPackages(data || []);
    } catch (error: any) {
      console.error('Error loading packages:', error);
      toast.error('Failed to load packages');
    } finally {
      setLoading(false);
    }
  }

  async function loadAvailableMaterials() {
    try {
      // Get working workbook
      const { data: workbookData } = await supabase
        .from('material_workbooks')
        .select('id')
        .eq('job_id', jobId)
        .eq('status', 'working')
        .maybeSingle();

      if (!workbookData) return;

      // Get all sheets
      const { data: sheetsData } = await supabase
        .from('material_sheets')
        .select('id, sheet_name')
        .eq('workbook_id', workbookData.id);

      if (!sheetsData) return;

      const sheetIds = sheetsData.map(s => s.id);

      // Get all material items
      const { data: itemsData } = await supabase
        .from('material_items')
        .select('id, sheet_id, category, material_name, quantity, length, usage, cost_per_unit')
        .in('sheet_id', sheetIds)
        .order('material_name');

      if (!itemsData) return;

      const materials = itemsData.map(item => {
        const sheet = sheetsData.find(s => s.id === item.sheet_id);
        return {
          ...item,
          sheets: { sheet_name: sheet?.sheet_name || 'Unknown' },
        };
      });

      setAvailableMaterials(materials);
    } catch (error: any) {
      console.error('Error loading materials:', error);
    }
  }

  function openCreateDialog() {
    setPackageName('');
    setPackageDescription('');
    setSelectedMaterialIds(new Set());
    setShowCreateDialog(true);
  }

  function openEditDialog(pkg: MaterialBundle) {
    setSelectedPackage(pkg);
    setPackageName(pkg.name);
    setPackageDescription(pkg.description || '');
    setShowEditDialog(true);
  }

  function openAddMaterialsDialog(pkg: MaterialBundle) {
    setSelectedPackage(pkg);
    const existingMaterialIds = new Set(
      pkg.bundle_items.map(item => item.material_item_id)
    );
    setSelectedMaterialIds(existingMaterialIds);
    setShowAddMaterialsDialog(true);
  }

  async function createPackage() {
    if (!packageName.trim()) {
      toast.error('Please enter a package name');
      return;
    }

    setSaving(true);

    try {
      console.log('Creating package with data:', {
        job_id: jobId,
        name: packageName.trim(),
        description: packageDescription.trim() || null,
        status: 'not_ordered',
        created_by: userId,
      });

      // Create bundle first without materials (materials are optional)
      const { data: bundleData, error: bundleError } = await supabase
        .from('material_bundles')
        .insert({
          job_id: jobId,
          name: packageName.trim(),
          description: packageDescription.trim() || null,
          status: 'not_ordered',
          created_by: userId || null,
        })
        .select()
        .single();

      if (bundleError) {
        console.error('Error creating bundle:', bundleError);
        throw bundleError;
      }

      console.log('Package created successfully:', bundleData);

      // Add materials to bundle if any selected
      if (selectedMaterialIds.size > 0) {
        const bundleItems = Array.from(selectedMaterialIds).map(materialId => ({
          bundle_id: bundleData.id,
          material_item_id: materialId,
        }));

        const { error: itemsError } = await supabase
          .from('material_bundle_items')
          .insert(bundleItems);

        if (itemsError) {
          console.error('Error adding materials to bundle:', itemsError);
          throw itemsError;
        }

        console.log('Materials added to package successfully');
      }

      toast.success('Package created');
      setShowCreateDialog(false);
      loadPackages();
    } catch (error: any) {
      console.error('Error creating package:', error);
      toast.error(`Failed to create package: ${error.message || 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  }

  async function updatePackage() {
    if (!selectedPackage || !packageName.trim()) {
      toast.error('Please enter a package name');
      return;
    }

    setSaving(true);

    try {
      const { error } = await supabase
        .from('material_bundles')
        .update({
          name: packageName.trim(),
          description: packageDescription.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', selectedPackage.id);

      if (error) throw error;

      toast.success('Package updated');
      setShowEditDialog(false);
      loadPackages();
    } catch (error: any) {
      console.error('Error updating package:', error);
      toast.error('Failed to update package');
    } finally {
      setSaving(false);
    }
  }

  async function updatePackageMaterials() {
    if (!selectedPackage) return;

    setSaving(true);

    try {
      // Get current material IDs in the bundle
      const currentMaterialIds = new Set(
        selectedPackage.bundle_items.map(item => item.material_item_id)
      );

      // Find materials to add (in selectedMaterialIds but not in currentMaterialIds)
      const toAdd = Array.from(selectedMaterialIds).filter(
        id => !currentMaterialIds.has(id)
      );

      // Find materials to remove (in currentMaterialIds but not in selectedMaterialIds)
      const toRemove = Array.from(currentMaterialIds).filter(
        id => !selectedMaterialIds.has(id)
      );

      // Add new materials
      if (toAdd.length > 0) {
        const bundleItems = toAdd.map(materialId => ({
          bundle_id: selectedPackage.id,
          material_item_id: materialId,
        }));

        const { error: addError } = await supabase
          .from('material_bundle_items')
          .insert(bundleItems);

        if (addError) throw addError;
      }

      // Remove materials
      if (toRemove.length > 0) {
        const { error: removeError } = await supabase
          .from('material_bundle_items')
          .delete()
          .eq('bundle_id', selectedPackage.id)
          .in('material_item_id', toRemove);

        if (removeError) throw removeError;
      }

      toast.success('Package materials updated');
      setShowAddMaterialsDialog(false);
      loadPackages();
    } catch (error: any) {
      console.error('Error updating package materials:', error);
      toast.error('Failed to update package materials');
    } finally {
      setSaving(false);
    }
  }

  async function updatePackageStatus(packageId: string, newStatus: string) {
    try {
      console.log('Updating package status:', { packageId, newStatus });
      
      // Optimistic update - update UI immediately
      setPackages(prev => prev.map(pkg => 
        pkg.id === packageId 
          ? { ...pkg, status: newStatus }
          : pkg
      ));
      
      // Update bundle status (no mapping needed - DB uses same values as UI)
      const { error: bundleError } = await supabase
        .from('material_bundles')
        .update({
          status: newStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('id', packageId);

      if (bundleError) {
        console.error('Error updating bundle status:', bundleError);
        // Revert optimistic update on error
        await loadPackages();
        throw bundleError;
      }

      console.log('Bundle status updated successfully');

      // Get all material items in this bundle
      const { data: bundleItems, error: itemsError } = await supabase
        .from('material_bundle_items')
        .select('material_item_id')
        .eq('bundle_id', packageId);

      if (itemsError) {
        console.error('Error fetching bundle items:', itemsError);
        throw itemsError;
      }

      console.log('Found bundle items:', bundleItems?.length || 0);

      // Update all material items to match the bundle status
      if (bundleItems && bundleItems.length > 0) {
        const materialItemIds = bundleItems.map(item => item.material_item_id);
        
        console.log('Updating material items:', materialItemIds);
        
        const { error: updateError } = await supabase
          .from('material_items')
          .update({
            status: newStatus,
            updated_at: new Date().toISOString(),
          })
          .in('id', materialItemIds);

        if (updateError) {
          console.error('Error updating material items:', updateError);
          throw updateError;
        }
        
        console.log('Material items updated successfully');
        
        toast.success(`Package status updated - ${bundleItems.length} material${bundleItems.length !== 1 ? 's' : ''} updated in workbook`);
      } else {
        toast.success('Package status updated (no materials in package)');
      }
    } catch (error: any) {
      console.error('Error updating package status:', error);
      toast.error(`Failed to update status: ${error.message || 'Unknown error'}`);
    }
  }

  async function deletePackage(packageId: string) {
    if (!confirm('Delete this package? Materials will not be deleted, only the package.')) return;

    try {
      const { error } = await supabase
        .from('material_bundles')
        .delete()
        .eq('id', packageId);

      if (error) throw error;
      toast.success('Package deleted');
      loadPackages();
    } catch (error: any) {
      console.error('Error deleting package:', error);
      toast.error('Failed to delete package');
    }
  }

  function toggleMaterialSelection(materialId: string) {
    const newSet = new Set(selectedMaterialIds);
    if (newSet.has(materialId)) {
      newSet.delete(materialId);
    } else {
      newSet.add(materialId);
    }
    setSelectedMaterialIds(newSet);
  }

  function togglePackageExpanded(packageId: string) {
    const newSet = new Set(expandedPackages);
    if (newSet.has(packageId)) {
      newSet.delete(packageId);
    } else {
      newSet.add(packageId);
    }
    setExpandedPackages(newSet);
  }

  function isMaterialInPackage(materialId: string): boolean {
    if (!selectedPackageForAdd) return false;
    const pkg = packages.find(p => p.id === selectedPackageForAdd);
    return pkg?.bundle_items?.some(item => item.material_item_id === materialId) || false;
  }

  async function addSelectedMaterialsToPackage() {
    if (!selectedPackageForAdd) {
      toast.error('Please select a package');
      return;
    }

    if (selectedMaterialIds.size === 0) {
      toast.error('Please select at least one material');
      return;
    }

    setSaving(true);

    try {
      // Get existing materials in package
      const pkg = packages.find(p => p.id === selectedPackageForAdd);
      const existingMaterialIds = new Set(
        pkg?.bundle_items?.map(item => item.material_item_id) || []
      );

      // Filter out materials already in package
      const materialsToAdd = Array.from(selectedMaterialIds).filter(
        id => !existingMaterialIds.has(id)
      );

      if (materialsToAdd.length === 0) {
        toast.error('All selected materials are already in this package');
        setSaving(false);
        return;
      }

      // Add materials to package
      const bundleItems = materialsToAdd.map(materialId => ({
        bundle_id: selectedPackageForAdd,
        material_item_id: materialId,
      }));

      const { error } = await supabase
        .from('material_bundle_items')
        .insert(bundleItems);

      if (error) throw error;

      toast.success(`Added ${materialsToAdd.length} material${materialsToAdd.length !== 1 ? 's' : ''} to package`);
      setSelectedMaterialIds(new Set());
      setActiveView('list');
      loadPackages();
    } catch (error: any) {
      console.error('Error adding materials to package:', error);
      toast.error('Failed to add materials to package');
    } finally {
      setSaving(false);
    }
  }

  function getStatusColor(status: string): string {
    switch (status) {
      case 'ordered':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'received':
        return 'bg-green-100 text-green-800 border-green-300';
      case 'pull_from_shop':
        return 'bg-purple-100 text-purple-800 border-purple-300';
      case 'ready_for_job':
        return 'bg-emerald-100 text-emerald-800 border-emerald-300';
      case 'not_ordered':
      default:
        return 'bg-slate-100 text-slate-800 border-slate-300';
    }
  }

  // Group materials by category for add view
  const groupByCategory = (items: MaterialItem[]) => {
    const categoryMap = new Map<string, MaterialItem[]>();
    items.forEach(item => {
      const category = item.category || 'Uncategorized';
      if (!categoryMap.has(category)) {
        categoryMap.set(category, []);
      }
      categoryMap.get(category)!.push(item);
    });
    return Array.from(categoryMap.entries()).map(([category, items]) => ({ category, items }));
  };

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-muted-foreground">Loading packages...</p>
      </div>
    );
  }

  // Group materials by sheet for create/edit dialogs
  const materialsBySheet = availableMaterials.reduce((acc, material) => {
    const sheetName = material.sheets.sheet_name;
    if (!acc[sheetName]) {
      acc[sheetName] = [];
    }
    acc[sheetName].push(material);
    return acc;
  }, {} as Record<string, MaterialItem[]>);

  const currentSheet = workbook?.sheets.find(s => s.id === selectedSheetId);
  const categoryGroups = currentSheet ? groupByCategory(currentSheet.items) : [];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Package className="w-5 h-5" />
            Material Packages
          </h3>
          <p className="text-sm text-muted-foreground">
            Bundle materials together for easier tracking
          </p>
        </div>
        <div className="flex gap-2">
          {activeView === 'add' && (
            <Button onClick={() => {
              setActiveView('list');
              setSelectedMaterialIds(new Set());
              setSelectedPackageForAdd('');
            }} variant="outline">
              <ChevronLeft className="w-4 h-4 mr-2" />
              Back to Packages
            </Button>
          )}
          {activeView === 'list' && packages.length > 0 && workbook && (
            <Button onClick={() => setActiveView('add')} variant="outline">
              <Plus className="w-4 h-4 mr-2" />
              Add Materials to Package
            </Button>
          )}
          <Button onClick={openCreateDialog}>
            <Plus className="w-4 h-4 mr-2" />
            Create Package
          </Button>
        </div>
      </div>

      {/* Add Materials View */}
      {activeView === 'add' && workbook && (
        <Card className="border-2">
          <CardHeader className="pb-3 border-b bg-gradient-to-r from-blue-50 to-blue-100">
            <div className="space-y-3">
              <div>
                <Label htmlFor="select-package" className="text-sm font-semibold mb-2 block">
                  Select Package to Add Materials To:
                </Label>
                <Select value={selectedPackageForAdd} onValueChange={setSelectedPackageForAdd}>
                  <SelectTrigger id="select-package" className="bg-white border-2">
                    <SelectValue placeholder="Choose a package..." />
                  </SelectTrigger>
                  <SelectContent>
                    {packages.map((pkg) => (
                      <SelectItem key={pkg.id} value={pkg.id}>
                        <div className="flex items-center gap-2">
                          <Package className="w-4 h-4" />
                          {pkg.name}
                          <Badge variant="secondary" className="ml-2">
                            {pkg.bundle_items?.length || 0} items
                          </Badge>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {selectedPackageForAdd && selectedMaterialIds.size > 0 && (
                <Button
                  onClick={addSelectedMaterialsToPackage}
                  disabled={saving}
                  className="w-full"
                >
                  {saving ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                      Adding...
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4 mr-2" />
                      Add {selectedMaterialIds.size} Material{selectedMaterialIds.size !== 1 ? 's' : ''}
                    </>
                  )}
                </Button>
              )}
            </div>
          </CardHeader>
          {selectedPackageForAdd && (
            <CardContent className="p-0">
              <div className="bg-gradient-to-r from-slate-100 to-slate-50 border-b-2">
                <div className="flex items-center gap-1 overflow-x-auto px-2 py-1">
                  {workbook.sheets.map((sheet) => (
                    <Button
                      key={sheet.id}
                      variant={selectedSheetId === sheet.id ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => setSelectedSheetId(sheet.id)}
                      className={`flex items-center gap-2 min-w-[140px] justify-start font-semibold ${
                        selectedSheetId === sheet.id ? 'bg-white shadow-md border-2 border-primary' : 'hover:bg-white/50'
                      }`}
                    >
                      {sheet.sheet_name}
                      <Badge variant="secondary" className="ml-auto text-xs">
                        {sheet.items.length}
                      </Badge>
                    </Button>
                  ))}
                </div>
              </div>
              <div className="p-4">
                {categoryGroups.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Package className="w-16 h-16 mx-auto mb-3 opacity-50" />
                    <p>No materials in this sheet</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {categoryGroups.map((catGroup) => (
                      <div key={catGroup.category} className="border-2 rounded-lg overflow-hidden">
                        <div className="bg-gradient-to-r from-indigo-100 to-indigo-50 p-3 border-b-2 border-indigo-200">
                          <div className="flex items-center gap-2">
                            <h3 className="font-bold text-lg text-indigo-900">{catGroup.category}</h3>
                            <Badge variant="outline" className="bg-white">
                              {catGroup.items.length} items
                            </Badge>
                          </div>
                        </div>
                        <div className="divide-y">
                          {catGroup.items.map((item) => {
                            const isInPackage = isMaterialInPackage(item.id);
                            const isSelected = selectedMaterialIds.has(item.id);
                            
                            return (
                              <div
                                key={item.id}
                                className={`p-3 flex items-center gap-3 cursor-pointer transition-colors ${
                                  isInPackage
                                    ? 'bg-green-50 opacity-60'
                                    : isSelected
                                    ? 'bg-blue-50 border-l-4 border-blue-600'
                                    : 'hover:bg-slate-50'
                                }`}
                                onClick={() => !isInPackage && toggleMaterialSelection(item.id)}
                              >
                                <div className="flex items-center justify-center w-6 h-6">
                                  {isInPackage ? (
                                    <CheckSquare className="w-5 h-5 text-green-600" />
                                  ) : isSelected ? (
                                    <CheckSquare className="w-5 h-5 text-blue-600" />
                                  ) : (
                                    <Square className="w-5 h-5 text-slate-400" />
                                  )}
                                </div>
                                <div className="flex-1">
                                  <div className="font-medium flex items-center gap-2">
                                    {item.material_name}
                                    {isInPackage && (
                                      <Badge variant="outline" className="bg-green-100 text-green-800 border-green-300">
                                        Already in package
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="text-sm text-muted-foreground mt-1">
                                    {item.usage && <span>{item.usage} • </span>}
                                    Qty: {item.quantity}
                                    {item.length && ` • ${item.length}`}
                                    {item.cost_per_unit && ` • $${item.cost_per_unit.toFixed(2)}`}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* Packages List */}
      {activeView === 'list' && packages.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Package className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="text-lg font-semibold mb-2">No Packages Yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Create packages to bundle materials together
            </p>
            <Button onClick={openCreateDialog}>
              <Plus className="w-4 h-4 mr-2" />
              Create First Package
            </Button>
          </CardContent>
        </Card>
      ) : activeView === 'list' ? (
        <div className="space-y-3">
          {packages.map(pkg => {
            const isExpanded = expandedPackages.has(pkg.id);
            return (
              <Card key={pkg.id} className="border-2">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => togglePackageExpanded(pkg.id)}
                          className="h-8 w-8 p-0"
                        >
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                        </Button>
                        <div>
                          <CardTitle className="text-lg flex items-center gap-2">
                            <Package className="w-5 h-5" />
                            {pkg.name}
                            <Badge variant="outline">
                              {pkg.bundle_items.length} items
                            </Badge>
                          </CardTitle>
                          {pkg.description && (
                            <p className="text-sm text-muted-foreground mt-1">
                              {pkg.description}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Select
                        value={pkg.status || 'not_ordered'}
                        onValueChange={(value) => updatePackageStatus(pkg.id, value)}
                      >
                        <SelectTrigger className={`h-9 min-w-[150px] text-xs font-semibold border-2 ${getStatusColor(pkg.status || 'pending')}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="not_ordered">Not Ordered</SelectItem>
                          <SelectItem value="ordered">Ordered</SelectItem>
                          <SelectItem value="received">Received</SelectItem>
                          <SelectItem value="pull_from_shop">Pull from Shop</SelectItem>
                          <SelectItem value="ready_for_job">Ready for Job</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openAddMaterialsDialog(pkg)}
                      >
                        <Plus className="w-4 h-4 mr-1" />
                        Materials
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => openEditDialog(pkg)}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => deletePackage(pkg.id)}
                        className="text-destructive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                {isExpanded && (
                  <CardContent className="pt-0">
                    <div className="border-t pt-3">
                      {pkg.bundle_items.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          No materials in this package
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {pkg.bundle_items.map(item => (
                            <div
                              key={item.id}
                              className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border"
                            >
                              <div className="flex-1">
                                <div className="font-medium">
                                  {item.material_items.material_name}
                                </div>
                                <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                                  <span>{item.material_items.sheets.sheet_name}</span>
                                  <span>•</span>
                                  <span>{item.material_items.category}</span>
                                  <span>•</span>
                                  <span>Qty: {item.material_items.quantity}</span>
                                  {item.material_items.length && (
                                    <>
                                      <span>•</span>
                                      <span>{item.material_items.length}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      ) : null}

      {/* Create Package Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Material Package</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="package-name">Package Name *</Label>
              <Input
                id="package-name"
                value={packageName}
                onChange={(e) => setPackageName(e.target.value)}
                placeholder="e.g., Main Building Hardware, Roof Materials..."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="package-description">Description</Label>
              <Textarea
                id="package-description"
                value={packageDescription}
                onChange={(e) => setPackageDescription(e.target.value)}
                placeholder="Optional description..."
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label>Select Materials (Optional - you can add materials later)</Label>
              <div className="border rounded-lg max-h-[400px] overflow-y-auto">
                {Object.entries(materialsBySheet).map(([sheetName, materials]) => (
                  <div key={sheetName} className="border-b last:border-b-0">
                    <div className="bg-slate-100 px-4 py-2 font-semibold text-sm sticky top-0">
                      {sheetName}
                    </div>
                    <div className="divide-y">
                      {materials.map(material => (
                        <div
                          key={material.id}
                          className="flex items-center gap-3 p-3 hover:bg-slate-50 cursor-pointer"
                          onClick={() => toggleMaterialSelection(material.id)}
                        >
                          <Checkbox
                            checked={selectedMaterialIds.has(material.id)}
                            onCheckedChange={() => toggleMaterialSelection(material.id)}
                          />
                          <div className="flex-1">
                            <div className="font-medium text-sm">
                              {material.material_name}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {material.category} • Qty: {material.quantity}
                              {material.length && ` • ${material.length}`}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Selected: {selectedMaterialIds.size} material{selectedMaterialIds.size !== 1 ? 's' : ''}
              </p>
            </div>

            <div className="flex gap-3 pt-4 border-t">
              <Button
                onClick={createPackage}
                disabled={saving}
                className="flex-1"
              >
                {saving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Package className="w-4 h-4 mr-2" />
                    Create Package
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowCreateDialog(false)}
                disabled={saving}
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Package Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Package</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-package-name">Package Name *</Label>
              <Input
                id="edit-package-name"
                value={packageName}
                onChange={(e) => setPackageName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-package-description">Description</Label>
              <Textarea
                id="edit-package-description"
                value={packageDescription}
                onChange={(e) => setPackageDescription(e.target.value)}
                rows={2}
              />
            </div>

            <div className="flex gap-3 pt-4 border-t">
              <Button
                onClick={updatePackage}
                disabled={saving}
                className="flex-1"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowEditDialog(false)}
                disabled={saving}
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add/Remove Materials Dialog */}
      <Dialog open={showAddMaterialsDialog} onOpenChange={setShowAddMaterialsDialog}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Manage Package Materials</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Select Materials</Label>
              <div className="border rounded-lg max-h-[400px] overflow-y-auto">
                {Object.entries(materialsBySheet).map(([sheetName, materials]) => (
                  <div key={sheetName} className="border-b last:border-b-0">
                    <div className="bg-slate-100 px-4 py-2 font-semibold text-sm sticky top-0">
                      {sheetName}
                    </div>
                    <div className="divide-y">
                      {materials.map(material => (
                        <div
                          key={material.id}
                          className="flex items-center gap-3 p-3 hover:bg-slate-50 cursor-pointer"
                          onClick={() => toggleMaterialSelection(material.id)}
                        >
                          <Checkbox
                            checked={selectedMaterialIds.has(material.id)}
                            onCheckedChange={() => toggleMaterialSelection(material.id)}
                          />
                          <div className="flex-1">
                            <div className="font-medium text-sm">
                              {material.material_name}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {material.category} • Qty: {material.quantity}
                              {material.length && ` • ${material.length}`}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Selected: {selectedMaterialIds.size} material{selectedMaterialIds.size !== 1 ? 's' : ''}
              </p>
            </div>

            <div className="flex gap-3 pt-4 border-t">
              <Button
                onClick={updatePackageMaterials}
                disabled={saving}
                className="flex-1"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowAddMaterialsDialog(false)}
                disabled={saving}
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
