import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
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
  Plus,
  Edit,
  Trash2,
  Search,
  X,
  ChevronDown,
  ChevronRight,
  DollarSign,
  Upload,
  FileSpreadsheet,
  MoveHorizontal,
  Percent,
  Image as ImageIcon,
  Package,
  CheckSquare,
  Square,
  CheckCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import type { Job } from '@/types';
import { ExtrasManagement } from './ExtrasManagement';
import { CrewMaterialProcessing } from './CrewMaterialProcessing';
import { MaterialWorkbookManager } from './MaterialWorkbookManager';
import { MaterialItemPhotos } from './MaterialItemPhotos';
import { PhotoRecoveryTool } from './PhotoRecoveryTool';
import { MaterialPackages } from './MaterialPackages';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface MaterialItem {
  id: string;
  sheet_id: string;
  category: string;
  usage: string | null;
  sku: string | null;
  material_name: string;
  quantity: number;
  length: string | null;
  cost_per_unit: number | null;
  markup_percent: number | null;
  price_per_unit: number | null;
  extended_cost: number | null;
  extended_price: number | null;
  taxable: boolean;
  notes: string | null;
  order_index: number;
  status: string;
  created_at: string;
  updated_at: string;
  sheets: {
    sheet_name: string;
  };
}

interface MaterialSheet {
  id: string;
  workbook_id: string;
  sheet_name: string;
  order_index: number;
  items: MaterialItem[];
  created_at: string;
}

interface MaterialWorkbook {
  id: string;
  job_id: string;
  version_number: number;
  status: 'working' | 'locked';
  sheets: MaterialSheet[];
}

interface MaterialsManagementProps {
  job: Job;
  userId: string;
}

interface CategoryGroup {
  category: string;
  items: MaterialItem[];
}

export function MaterialsManagement({ job, userId }: MaterialsManagementProps) {
  const [workbook, setWorkbook] = useState<MaterialWorkbook | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'manage' | 'packages' | 'crew-orders' | 'upload'>('manage');
  const [activeSheetId, setActiveSheetId] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [showMoveDialog, setShowMoveDialog] = useState(false);
  const [movingItem, setMovingItem] = useState<MaterialItem | null>(null);
  const [moveToSheetId, setMoveToSheetId] = useState<string>('');
  const [moveToCategory, setMoveToCategory] = useState<string>('');
  const [allCategories, setAllCategories] = useState<string[]>([]);
  const [editingCell, setEditingCell] = useState<{ itemId: string; field: string } | null>(null);
  const [cellValue, setCellValue] = useState('');
  const scrollPositionRef = useRef<number>(0);
  
  // Add material dialog state
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [addToCategory, setAddToCategory] = useState<string>('');
  const [newMaterialName, setNewMaterialName] = useState('');
  const [newUsage, setNewUsage] = useState('');
  const [newSku, setNewSku] = useState('');
  const [newQuantity, setNewQuantity] = useState('1');
  const [newLength, setNewLength] = useState('');
  const [newCostPerUnit, setNewCostPerUnit] = useState('');
  const [newMarkup, setNewMarkup] = useState('35');
  const [newNotes, setNewNotes] = useState('');
  const [saving, setSaving] = useState(false);
  
  // Package state
  const [packages, setPackages] = useState<any[]>([]);
  
  // Package selection mode in workbook
  const [packageSelectionMode, setPackageSelectionMode] = useState(false);
  const [selectedMaterialsForPackageAdd, setSelectedMaterialsForPackageAdd] = useState<Set<string>>(new Set());
  const [showAddToPackageDialog, setShowAddToPackageDialog] = useState(false);
  const [targetPackageId, setTargetPackageId] = useState('');
  const [addingMaterialsToPackage, setAddingMaterialsToPackage] = useState(false);

  useEffect(() => {
    loadWorkbook();
    loadPackages();

    // Subscribe to real-time changes on material_items
    const itemsChannel = supabase
      .channel('material_items_changes')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'material_items' },
        (payload) => {
          console.log('Material items changed:', payload);
          loadWorkbook();
        }
      )
      .subscribe();

    // Subscribe to package changes
    const packagesChannel = supabase
      .channel('material_bundles_changes')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'material_bundles', filter: `job_id=eq.${job.id}` },
        () => {
          loadPackages();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(itemsChannel);
      supabase.removeChannel(packagesChannel);
    };
  }, [job.id]);

  async function loadPackages() {
    try {
      console.log('Loading packages for job:', job.id);
      
      const { data, error } = await supabase
        .from('material_bundles')
        .select(`
          id,
          name,
          description,
          status,
          bundle_items:material_bundle_items(material_item_id)
        `)
        .eq('job_id', job.id)
        .order('name');

      if (error) {
        console.error('Error loading packages:', error);
        throw error;
      }
      
      console.log('Loaded packages:', data?.length || 0);
      setPackages(data || []);
    } catch (error: any) {
      console.error('Error loading packages:', error);
      toast.error('Failed to load packages');
    }
  }

  async function loadWorkbook() {
    try {
      setLoading(true);
      
      const { data: workbookData, error: workbookError } = await supabase
        .from('material_workbooks')
        .select('*')
        .eq('job_id', job.id)
        .eq('status', 'working')
        .maybeSingle();

      if (workbookError) throw workbookError;

      if (!workbookData) {
        setWorkbook(null);
        setLoading(false);
        return;
      }

      const { data: sheetsData, error: sheetsError } = await supabase
        .from('material_sheets')
        .select('*')
        .eq('workbook_id', workbookData.id)
        .order('order_index');

      if (sheetsError) throw sheetsError;

      const sheetIds = (sheetsData || []).map(s => s.id);
      const { data: itemsData, error: itemsError } = await supabase
        .from('material_items')
        .select('*')
        .in('sheet_id', sheetIds)
        .order('order_index');

      if (itemsError) throw itemsError;

      const sheets: MaterialSheet[] = (sheetsData || []).map(sheet => ({
        ...sheet,
        items: (itemsData || []).filter(item => item.sheet_id === sheet.id),
      }));

      // Extract all unique categories from all items
      const uniqueCategories = new Set<string>();
      (itemsData || []).forEach(item => {
        if (item.category) {
          uniqueCategories.add(item.category);
        }
      });
      setAllCategories(Array.from(uniqueCategories).sort());

      setWorkbook({
        ...workbookData,
        sheets,
      });

      if (sheets.length > 0 && !activeSheetId) {
        setActiveSheetId(sheets[0].id);
      }
    } catch (error: any) {
      console.error('Error loading workbook:', error);
      toast.error('Failed to load materials');
    } finally {
      setLoading(false);
    }
  }

  function handleSheetChange(sheetId: string) {
    setActiveSheetId(sheetId);
  }

  function togglePackageSelectionMode() {
    setPackageSelectionMode(!packageSelectionMode);
    setSelectedMaterialsForPackageAdd(new Set());
  }

  function toggleMaterialForPackageAdd(materialId: string) {
    const newSet = new Set(selectedMaterialsForPackageAdd);
    if (newSet.has(materialId)) {
      newSet.delete(materialId);
    } else {
      newSet.add(materialId);
    }
    setSelectedMaterialsForPackageAdd(newSet);
  }

  function openAddToPackageDialog() {
    if (selectedMaterialsForPackageAdd.size === 0) {
      toast.error('Please select at least one material');
      return;
    }
    setTargetPackageId('');
    setShowAddToPackageDialog(true);
  }

  async function addSelectedMaterialsToSelectedPackage() {
    if (!targetPackageId) {
      toast.error('Please select a package');
      return;
    }

    if (selectedMaterialsForPackageAdd.size === 0) {
      toast.error('No materials selected');
      return;
    }

    setAddingMaterialsToPackage(true);

    try {
      console.log('Adding materials to package:', {
        packageId: targetPackageId,
        materialCount: selectedMaterialsForPackageAdd.size,
      });
      
      // Get existing materials in the target package
      const targetPackage = packages.find(p => p.id === targetPackageId);
      const existingMaterialIds = new Set(
        targetPackage?.bundle_items?.map((item: any) => item.material_item_id) || []
      );

      // Filter out materials already in the package
      const materialsToAdd = Array.from(selectedMaterialsForPackageAdd).filter(
        id => !existingMaterialIds.has(id)
      );

      console.log('Materials to add after filtering:', materialsToAdd.length);

      if (materialsToAdd.length === 0) {
        toast.error('All selected materials are already in this package');
        setAddingMaterialsToPackage(false);
        return;
      }

      // Add materials to package
      const bundleItems = materialsToAdd.map(materialId => ({
        bundle_id: targetPackageId,
        material_item_id: materialId,
      }));

      const { error } = await supabase
        .from('material_bundle_items')
        .insert(bundleItems);

      if (error) {
        console.error('Error inserting bundle items:', error);
        throw error;
      }
      
      console.log('Successfully added materials to package');

      toast.success(`Added ${materialsToAdd.length} material${materialsToAdd.length !== 1 ? 's' : ''} to package`);
      setShowAddToPackageDialog(false);
      setPackageSelectionMode(false);
      setSelectedMaterialsForPackageAdd(new Set());
      await loadPackages();
    } catch (error: any) {
      console.error('Error adding materials to package:', error);
      toast.error(`Failed to add materials to package: ${error.message || 'Unknown error'}`);
    } finally {
      setAddingMaterialsToPackage(false);
    }
  }

  async function addMaterialToPackage(materialId: string, packageId: string) {
    try {
      // Save current scroll position
      scrollPositionRef.current = window.scrollY;

      // Check if already in package
      const targetPackage = packages.find(p => p.id === packageId);
      const existingMaterialIds = new Set(
        targetPackage?.bundle_items?.map((item: any) => item.material_item_id) || []
      );

      if (existingMaterialIds.has(materialId)) {
        toast.error('Material is already in this package');
        return;
      }

      const { error } = await supabase
        .from('material_bundle_items')
        .insert({
          bundle_id: packageId,
          material_item_id: materialId,
        });

      if (error) throw error;

      toast.success('Added to package');
      await loadPackages();

      // Restore scroll position
      requestAnimationFrame(() => {
        window.scrollTo({ top: scrollPositionRef.current, behavior: 'instant' });
      });
    } catch (error: any) {
      console.error('Error adding material to package:', error);
      toast.error('Failed to add to package');
    }
  }

  async function removeMaterialFromPackage(materialId: string, packageId: string) {
    try {
      // Save current scroll position
      scrollPositionRef.current = window.scrollY;

      const { error } = await supabase
        .from('material_bundle_items')
        .delete()
        .eq('bundle_id', packageId)
        .eq('material_item_id', materialId);

      if (error) throw error;

      toast.success('Removed from package');
      await loadPackages();

      // Restore scroll position
      requestAnimationFrame(() => {
        window.scrollTo({ top: scrollPositionRef.current, behavior: 'instant' });
      });
    } catch (error: any) {
      console.error('Error removing material from package:', error);
      toast.error('Failed to remove from package');
    }
  }

  function isMaterialInAnyPackage(materialId: string): boolean {
    return packages.some(pkg => 
      pkg.bundle_items?.some((item: any) => item.material_item_id === materialId)
    );
  }

  function getMaterialPackageNames(materialId: string): string[] {
    return packages
      .filter(pkg => 
        pkg.bundle_items?.some((item: any) => item.material_item_id === materialId)
      )
      .map(pkg => pkg.name);
  }

  function groupByCategory(items: MaterialItem[]): CategoryGroup[] {
    const categoryMap = new Map<string, MaterialItem[]>();
    
    items.forEach(item => {
      const category = item.category || 'Uncategorized';
      if (!categoryMap.has(category)) {
        categoryMap.set(category, []);
      }
      categoryMap.get(category)!.push(item);
    });

    return Array.from(categoryMap.entries())
      .map(([category, items]) => ({
        category,
        items: items.sort((a, b) => a.order_index - b.order_index),
      }))
      .sort((a, b) => a.category.localeCompare(b.category));
  }

  function calculateMarkupPercent(cost: number | null, price: number | null): number {
    if (!cost || !price || cost === 0) return 0;
    return ((price - cost) / cost) * 100;
  }

  function startCellEdit(itemId: string, field: string, currentValue: any) {
    setEditingCell({ itemId, field });
    setCellValue(currentValue?.toString() || '');
  }

  async function saveCellEdit(item: MaterialItem) {
    if (!editingCell) return;

    try {
      const { field } = editingCell;
      let value: any = cellValue;

      if (['quantity', 'cost_per_unit', 'price_per_unit'].includes(field)) {
        value = parseFloat(cellValue) || null;
      } else if (field === 'markup_percent') {
        value = parseFloat(cellValue) / 100 || null;
      }

      const updateData: any = {
        [field]: value,
        updated_at: new Date().toISOString(),
      };

      if (field === 'quantity' || field === 'cost_per_unit') {
        const qty = field === 'quantity' ? value : item.quantity;
        const cost = field === 'cost_per_unit' ? value : item.cost_per_unit;
        updateData.extended_cost = qty && cost ? qty * cost : null;
      }
      if (field === 'quantity' || field === 'price_per_unit') {
        const qty = field === 'quantity' ? value : item.quantity;
        const price = field === 'price_per_unit' ? value : item.price_per_unit;
        updateData.extended_price = qty && price ? qty * price : null;
      }

      // Save current scroll position
      scrollPositionRef.current = window.scrollY;

      // Optimistic update - update local state immediately
      if (workbook) {
        const updatedWorkbook = {
          ...workbook,
          sheets: workbook.sheets.map(sheet => ({
            ...sheet,
            items: sheet.items.map(i => 
              i.id === item.id 
                ? { ...i, ...updateData }
                : i
            ),
          })),
        };
        setWorkbook(updatedWorkbook);
      }

      setEditingCell(null);
      setCellValue('');

      // Save to database in background
      const { error } = await supabase
        .from('material_items')
        .update(updateData)
        .eq('id', item.id);

      if (error) {
        console.error('Error saving cell:', error);
        toast.error('Failed to save');
        // Reload on error to revert optimistic update
        await loadWorkbook();
      }

      // Restore scroll position
      requestAnimationFrame(() => {
        window.scrollTo({ top: scrollPositionRef.current, behavior: 'instant' });
      });

    } catch (error: any) {
      console.error('Error saving cell:', error);
      toast.error('Failed to save');
      await loadWorkbook();
    }
  }

  function cancelCellEdit() {
    setEditingCell(null);
    setCellValue('');
  }

  async function updateStatus(itemId: string, newStatus: string) {
    try {
      // Save current scroll position
      scrollPositionRef.current = window.scrollY;

      // Optimistic update
      if (workbook) {
        const updatedWorkbook = {
          ...workbook,
          sheets: workbook.sheets.map(sheet => ({
            ...sheet,
            items: sheet.items.map(i => 
              i.id === itemId 
                ? { ...i, status: newStatus, updated_at: new Date().toISOString() }
                : i
            ),
          })),
        };
        setWorkbook(updatedWorkbook);
      }

      const { error } = await supabase
        .from('material_items')
        .update({
          status: newStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('id', itemId);

      if (error) throw error;

      // Restore scroll position
      requestAnimationFrame(() => {
        window.scrollTo({ top: scrollPositionRef.current, behavior: 'instant' });
      });
    } catch (error: any) {
      console.error('Error updating status:', error);
      toast.error('Failed to update status');
      await loadWorkbook();
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

  async function deleteItem(itemId: string) {
    if (!confirm('Delete this material?')) return;

    try {
      // Save current scroll position
      scrollPositionRef.current = window.scrollY;

      // Optimistic update
      if (workbook) {
        const updatedWorkbook = {
          ...workbook,
          sheets: workbook.sheets.map(sheet => ({
            ...sheet,
            items: sheet.items.filter(i => i.id !== itemId),
          })),
        };
        setWorkbook(updatedWorkbook);
      }

      const { error } = await supabase
        .from('material_items')
        .delete()
        .eq('id', itemId);

      if (error) throw error;
      toast.success('Material deleted');

      // Restore scroll position
      requestAnimationFrame(() => {
        window.scrollTo({ top: scrollPositionRef.current, behavior: 'instant' });
      });
    } catch (error: any) {
      console.error('Error deleting item:', error);
      toast.error('Failed to delete material');
      await loadWorkbook();
    }
  }

  function openMoveItem(item: MaterialItem) {
    setMovingItem(item);
    setMoveToSheetId(item.sheet_id);
    setMoveToCategory(item.category);
    setShowMoveDialog(true);
  }

  async function moveItem() {
    if (!movingItem) return;

    try {
      // Save current scroll position
      scrollPositionRef.current = window.scrollY;

      const { error } = await supabase
        .from('material_items')
        .update({
          sheet_id: moveToSheetId,
          category: moveToCategory,
          updated_at: new Date().toISOString(),
        })
        .eq('id', movingItem.id);

      if (error) throw error;
      toast.success('Material moved');
      setShowMoveDialog(false);
      setMovingItem(null);
      
      // Reload to reflect move across sheets
      await loadWorkbook();

      // Restore scroll position after reload
      requestAnimationFrame(() => {
        window.scrollTo({ top: scrollPositionRef.current, behavior: 'instant' });
      });
    } catch (error: any) {
      console.error('Error moving item:', error);
      toast.error('Failed to move material');
    }
  }

  function openAddDialog(categoryName?: string) {
    setAddToCategory(categoryName || '');
    setNewMaterialName('');
    setNewUsage('');
    setNewSku('');
    setNewQuantity('1');
    setNewLength('');
    setNewCostPerUnit('');
    setNewMarkup('35');
    setNewNotes('');
    setShowAddDialog(true);
  }

  async function addMaterial() {
    if (!newMaterialName.trim()) {
      toast.error('Please enter a material name');
      return;
    }

    if (!addToCategory.trim()) {
      toast.error('Please enter a category');
      return;
    }

    if (!activeSheetId) {
      toast.error('No active sheet selected');
      return;
    }

    setSaving(true);

    try {
      const quantity = parseFloat(newQuantity) || 1;
      const costPerUnit = parseFloat(newCostPerUnit) || null;
      const markup = parseFloat(newMarkup) || 0;
      const pricePerUnit = costPerUnit ? costPerUnit * (1 + markup / 100) : null;
      const extendedCost = costPerUnit ? costPerUnit * quantity : null;
      const extendedPrice = pricePerUnit ? pricePerUnit * quantity : null;

      // Get max order_index for current sheet and category
      const { data: maxData } = await supabase
        .from('material_items')
        .select('order_index')
        .eq('sheet_id', activeSheetId)
        .eq('category', addToCategory.trim())
        .order('order_index', { ascending: false })
        .limit(1)
        .maybeSingle();

      const nextOrderIndex = (maxData?.order_index || -1) + 1;

      // Insert new material
      const { error } = await supabase
        .from('material_items')
        .insert({
          sheet_id: activeSheetId,
          category: addToCategory.trim(),
          usage: newUsage.trim() || null,
          sku: newSku.trim() || null,
          material_name: newMaterialName.trim(),
          quantity,
          length: newLength.trim() || null,
          cost_per_unit: costPerUnit,
          markup_percent: markup / 100,
          price_per_unit: pricePerUnit,
          extended_cost: extendedCost,
          extended_price: extendedPrice,
          taxable: true,
          notes: newNotes.trim() || null,
          order_index: nextOrderIndex,
          status: 'not_ordered',
        });

      if (error) throw error;

      toast.success('Material added');
      setShowAddDialog(false);
      
      // Reload workbook to show new material
      await loadWorkbook();

      // Restore scroll position
      requestAnimationFrame(() => {
        window.scrollTo({ top: scrollPositionRef.current, behavior: 'instant' });
      });
    } catch (error: any) {
      console.error('Error adding material:', error);
      toast.error('Failed to add material');
    } finally {
      setSaving(false);
    }
  }

  const activeSheet = workbook?.sheets.find(s => s.id === activeSheetId);
  const filteredItems = activeSheet?.items.filter(item =>
    searchTerm === '' ||
    item.material_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (item.category && item.category.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (item.usage && item.usage.toLowerCase().includes(searchTerm.toLowerCase()))
  ) || [];
  
  const categoryGroups = groupByCategory(filteredItems);

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-muted-foreground">Loading materials...</p>
      </div>
    );
  }

  return (
    <div className="w-full px-4">
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="space-y-2">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-gradient-to-r from-slate-50 to-slate-100 p-3 rounded-lg border-2 border-slate-200">
          <TabsList className="grid w-full grid-cols-4 h-14 bg-white shadow-sm flex-1">
            <TabsTrigger value="manage" className="flex flex-col sm:flex-row items-center gap-1 sm:gap-2 text-base font-semibold">
              <FileSpreadsheet className="w-5 h-5" />
              <span className="text-xs sm:text-base">Workbook</span>
            </TabsTrigger>
            <TabsTrigger value="packages" className="flex flex-col sm:flex-row items-center gap-1 sm:gap-2 text-base font-semibold">
              <Package className="w-5 h-5" />
              <span className="text-xs sm:text-base">Packages</span>
            </TabsTrigger>
            <TabsTrigger value="crew-orders" className="flex flex-col sm:flex-row items-center gap-1 sm:gap-2 text-base font-semibold">
              <Package className="w-5 h-5" />
              <span className="text-xs sm:text-base">Crew Orders</span>
            </TabsTrigger>
            <TabsTrigger value="upload" className="flex flex-col sm:flex-row items-center gap-1 sm:gap-2 text-base font-semibold">
              <Upload className="w-5 h-5" />
              <span className="text-xs sm:text-base">Upload</span>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="manage" className="space-y-3">
          {!workbook ? (
            <Card>
              <CardContent className="py-12 text-center">
                <FileSpreadsheet className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                <h3 className="text-lg font-semibold mb-2">No Material Workbook</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Upload an Excel workbook to get started with material management
                </p>
                <Button onClick={() => setActiveTab('upload')} className="gradient-primary">
                  <Upload className="w-4 h-4 mr-2" />
                  Upload Workbook
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              <Card className="border-2">
                <CardContent className="p-0">
                  <div className="bg-gradient-to-r from-slate-100 to-slate-50 border-b-2">
                    <div className="flex items-center justify-between gap-2 px-2 py-1">
                      <div className="flex items-center gap-1 overflow-x-auto flex-1">
                        {workbook.sheets.map((sheet) => (
                          <Button
                            key={sheet.id}
                            variant={activeSheetId === sheet.id ? 'default' : 'ghost'}
                            size="sm"
                            onClick={() => handleSheetChange(sheet.id)}
                            className={`flex items-center gap-2 min-w-[140px] justify-start font-semibold ${activeSheetId === sheet.id ? 'bg-white shadow-md border-2 border-primary' : 'hover:bg-white/50'}`}
                          >
                            <FileSpreadsheet className="w-4 h-4" />
                            {sheet.sheet_name}
                            <Badge variant="secondary" className="ml-auto text-xs">
                              {sheet.items.length}
                            </Badge>
                          </Button>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        {packageSelectionMode ? (
                          <>
                            <Button
                              onClick={openAddToPackageDialog}
                              size="sm"
                              disabled={selectedMaterialsForPackageAdd.size === 0}
                              className="bg-green-600 hover:bg-green-700 whitespace-nowrap"
                            >
                              <Package className="w-4 h-4 mr-1" />
                              Add to Package ({selectedMaterialsForPackageAdd.size})
                            </Button>
                            <Button
                              onClick={togglePackageSelectionMode}
                              size="sm"
                              variant="outline"
                              className="whitespace-nowrap"
                            >
                              <X className="w-4 h-4 mr-1" />
                              Cancel
                            </Button>
                          </>
                        ) : (
                          <>
                            {packages.length > 0 && (
                              <Button
                                onClick={togglePackageSelectionMode}
                                size="sm"
                                variant="outline"
                                className="whitespace-nowrap bg-purple-50 border-purple-300 text-purple-700 hover:bg-purple-100"
                              >
                                <Package className="w-4 h-4 mr-1" />
                                Select for Package
                              </Button>
                            )}
                            <Button
                              onClick={() => openAddDialog()}
                              size="sm"
                              className="gradient-primary whitespace-nowrap"
                            >
                              <Plus className="w-4 h-4 mr-1" />
                              Add Material
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="p-3 bg-white border-b">
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          placeholder="Search materials in current sheet..."
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
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    {categoryGroups.length === 0 ? (
                      <div className="text-center py-12 text-muted-foreground">
                        <FileSpreadsheet className="w-16 h-16 mx-auto mb-3 opacity-50" />
                        <p>No materials in this sheet</p>
                      </div>
                    ) : (
                      <div className="inline-block min-w-full">
                        <table className="border-collapse w-auto">
                        <thead className="bg-gradient-to-r from-slate-800 to-slate-700 text-white sticky top-0 z-10">
                          <tr>
                            {packageSelectionMode && (
                              <th className="text-center p-3 font-bold border-r border-slate-600 whitespace-nowrap">
                                <CheckSquare className="w-5 h-5 mx-auto" />
                              </th>
                            )}
                            <th className="text-center p-3 font-bold border-r border-slate-600 whitespace-nowrap">
                              <Package className="w-5 h-5 mx-auto" />
                            </th>
                            <th className="text-left p-3 font-bold border-r border-slate-600 whitespace-nowrap">Material</th>
                            <th className="text-left p-3 font-bold border-r border-slate-600 whitespace-nowrap">Usage</th>
                            <th className="text-center p-3 font-bold border-r border-slate-600 whitespace-nowrap">Qty</th>
                            <th className="text-center p-3 font-bold border-r border-slate-600 whitespace-nowrap">Length</th>
                            <th className="text-right p-3 font-bold border-r border-slate-600 whitespace-nowrap">Cost/Unit</th>
                            <th className="text-center p-3 font-bold border-r border-slate-600 whitespace-nowrap">Markup %</th>
                            <th className="text-right p-3 font-bold border-r border-slate-600 whitespace-nowrap">Price/Unit</th>
                            <th className="text-center p-3 font-bold border-r border-slate-600 whitespace-nowrap">Status</th>
                            <th className="text-center p-3 font-bold whitespace-nowrap">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {categoryGroups.map((catGroup, catIndex) => (
                            <>
                              <tr key={`cat-${catIndex}`} className="bg-gradient-to-r from-indigo-100 to-indigo-50 border-y-2 border-indigo-300">
                                <td colSpan={packageSelectionMode ? 11 : 10} className="p-3">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <FileSpreadsheet className="w-5 h-5 text-indigo-700" />
                                      <h3 className="font-bold text-lg text-indigo-900">{catGroup.category}</h3>
                                      <Badge variant="outline" className="bg-white">
                                        {catGroup.items.length} items
                                      </Badge>
                                    </div>
                                    <Button
                                      size="sm"
                                      onClick={() => openAddDialog(catGroup.category)}
                                      className="bg-indigo-600 hover:bg-indigo-700"
                                    >
                                      <Plus className="w-3 h-3 mr-1" />
                                      Add to {catGroup.category}
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                              {catGroup.items.map((item, itemIndex) => {
                                const markupPercent = calculateMarkupPercent(item.cost_per_unit, item.price_per_unit);
                                const isEven = itemIndex % 2 === 0;
                                const isEditingThisCell = (field: string) => 
                                  editingCell?.itemId === item.id && editingCell?.field === field;
                                const materialPackageNames = getMaterialPackageNames(item.id);
                                
                                return (
                                  <tr
                                    key={item.id}
                                    className={`border-b transition-colors ${
                                      packageSelectionMode && selectedMaterialsForPackageAdd.has(item.id)
                                        ? 'bg-blue-100 hover:bg-blue-200'
                                        : `hover:bg-blue-50 ${isEven ? 'bg-white' : 'bg-slate-50/50'}`
                                    }`}
                                  >
                                    {packageSelectionMode && (
                                      <td className="p-1 border-r whitespace-nowrap">
                                        <div className="flex items-center justify-center">
                                          <Checkbox
                                            checked={selectedMaterialsForPackageAdd.has(item.id)}
                                            onCheckedChange={() => toggleMaterialForPackageAdd(item.id)}
                                            disabled={isMaterialInAnyPackage(item.id)}
                                          />
                                        </div>
                                      </td>
                                    )}
                                    <td className="p-1 border-r whitespace-nowrap">
                                      <div className="min-w-[180px]">
                                        <Select
                                          value=""
                                          onValueChange={(value) => {
                                            if (value.startsWith('remove-')) {
                                              const packageId = value.replace('remove-', '');
                                              removeMaterialFromPackage(item.id, packageId);
                                            } else {
                                              addMaterialToPackage(item.id, value);
                                            }
                                          }}
                                        >
                                          <SelectTrigger className="h-8 text-xs border-2 bg-white">
                                            <SelectValue placeholder={
                                              materialPackageNames.length > 0
                                                ? materialPackageNames.join(', ')
                                                : 'No package'
                                            } />
                                          </SelectTrigger>
                                          <SelectContent>
                                            {materialPackageNames.length > 0 && (
                                              <>
                                                <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                                                  Current Packages:
                                                </div>
                                                {packages
                                                  .filter(pkg => 
                                                    pkg.bundle_items?.some((bundleItem: any) => bundleItem.material_item_id === item.id)
                                                  )
                                                  .map(pkg => (
                                                    <SelectItem 
                                                      key={`remove-${pkg.id}`} 
                                                      value={`remove-${pkg.id}`}
                                                      className="text-red-600"
                                                    >
                                                      <div className="flex items-center gap-2">
                                                        <X className="w-3 h-3" />
                                                        Remove from {pkg.name}
                                                      </div>
                                                    </SelectItem>
                                                  ))
                                                }
                                                <div className="h-px bg-border my-1" />
                                              </>
                                            )}
                                            <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                                              Add to Package:
                                            </div>
                                            {packages
                                              .filter(pkg => 
                                                !pkg.bundle_items?.some((bundleItem: any) => bundleItem.material_item_id === item.id)
                                              )
                                              .map(pkg => (
                                                <SelectItem key={pkg.id} value={pkg.id}>
                                                  <div className="flex items-center gap-2">
                                                    <Package className="w-3 h-3" />
                                                    {pkg.name}
                                                  </div>
                                                </SelectItem>
                                              ))
                                            }
                                            {packages.length === 0 && (
                                              <div className="px-2 py-4 text-center text-xs text-muted-foreground">
                                                No packages created yet
                                              </div>
                                            )}
                                          </SelectContent>
                                        </Select>
                                      </div>
                                    </td>
                                    <td className="p-1 border-r whitespace-nowrap">
                                      {isEditingThisCell('material_name') ? (
                                        <Input
                                          value={cellValue}
                                          onChange={(e) => setCellValue(e.target.value)}
                                          onBlur={() => saveCellEdit(item)}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter') saveCellEdit(item);
                                            if (e.key === 'Escape') cancelCellEdit();
                                          }}
                                          autoFocus
                                          className="h-8 text-sm"
                                        />
                                      ) : (
                                        <div 
                                          onClick={() => startCellEdit(item.id, 'material_name', item.material_name)}
                                          className="font-medium text-sm cursor-pointer hover:bg-blue-100 p-2 rounded min-h-[32px] max-w-[400px]"
                                        >
                                          {item.material_name}
                                          {item.notes && (
                                            <div className="text-xs text-muted-foreground mt-1">{item.notes}</div>
                                          )}
                                        </div>
                                      )}
                                    </td>

                                    <td className="p-1 border-r whitespace-nowrap">
                                      {isEditingThisCell('usage') ? (
                                        <Input
                                          value={cellValue}
                                          onChange={(e) => setCellValue(e.target.value)}
                                          onBlur={() => saveCellEdit(item)}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter') saveCellEdit(item);
                                            if (e.key === 'Escape') cancelCellEdit();
                                          }}
                                          autoFocus
                                          className="h-8 text-sm"
                                        />
                                      ) : (
                                        <div
                                          onClick={() => startCellEdit(item.id, 'usage', item.usage)}
                                          className="text-sm cursor-pointer hover:bg-blue-100 p-2 rounded min-h-[32px]"
                                        >
                                          {item.usage || '-'}
                                        </div>
                                      )}
                                    </td>

                                    <td className="p-1 border-r whitespace-nowrap">
                                      {isEditingThisCell('quantity') ? (
                                        <Input
                                          type="number"
                                          value={cellValue}
                                          onChange={(e) => setCellValue(e.target.value)}
                                          onBlur={() => saveCellEdit(item)}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter') saveCellEdit(item);
                                            if (e.key === 'Escape') cancelCellEdit();
                                          }}
                                          autoFocus
                                          className="h-8 text-sm text-center"
                                        />
                                      ) : (
                                        <div
                                          onClick={() => startCellEdit(item.id, 'quantity', item.quantity)}
                                          className="text-center font-semibold cursor-pointer hover:bg-blue-100 p-2 rounded min-h-[32px]"
                                        >
                                          {item.quantity}
                                        </div>
                                      )}
                                    </td>

                                    <td className="p-1 border-r whitespace-nowrap">
                                      {isEditingThisCell('length') ? (
                                        <Input
                                          value={cellValue}
                                          onChange={(e) => setCellValue(e.target.value)}
                                          onBlur={() => saveCellEdit(item)}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter') saveCellEdit(item);
                                            if (e.key === 'Escape') cancelCellEdit();
                                          }}
                                          autoFocus
                                          className="h-8 text-sm text-center"
                                        />
                                      ) : (
                                        <div
                                          onClick={() => startCellEdit(item.id, 'length', item.length)}
                                          className="text-center text-sm cursor-pointer hover:bg-blue-100 p-2 rounded min-h-[32px]"
                                        >
                                          {item.length || '-'}
                                        </div>
                                      )}
                                    </td>

                                    <td className="p-1 border-r whitespace-nowrap">
                                      {isEditingThisCell('cost_per_unit') ? (
                                        <Input
                                          type="number"
                                          step="0.01"
                                          value={cellValue}
                                          onChange={(e) => setCellValue(e.target.value)}
                                          onBlur={() => saveCellEdit(item)}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter') saveCellEdit(item);
                                            if (e.key === 'Escape') cancelCellEdit();
                                          }}
                                          autoFocus
                                          className="h-8 text-sm text-right"
                                        />
                                      ) : (
                                        <div
                                          onClick={() => startCellEdit(item.id, 'cost_per_unit', item.cost_per_unit)}
                                          className="text-right font-mono text-sm cursor-pointer hover:bg-blue-100 p-2 rounded min-h-[32px]"
                                        >
                                          {item.cost_per_unit ? `$${item.cost_per_unit.toFixed(2)}` : '-'}
                                        </div>
                                      )}
                                    </td>

                                    <td className="p-2 text-center border-r">
                                      {markupPercent > 0 ? (
                                        <Badge variant="secondary" className="bg-green-100 text-green-800 font-semibold">
                                          <Percent className="w-3 h-3 mr-1" />
                                          {markupPercent.toFixed(1)}%
                                        </Badge>
                                      ) : (
                                        '-'
                                      )}
                                    </td>

                                    <td className="p-1 border-r whitespace-nowrap">
                                      {isEditingThisCell('price_per_unit') ? (
                                        <Input
                                          type="number"
                                          step="0.01"
                                          value={cellValue}
                                          onChange={(e) => setCellValue(e.target.value)}
                                          onBlur={() => saveCellEdit(item)}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter') saveCellEdit(item);
                                            if (e.key === 'Escape') cancelCellEdit();
                                          }}
                                          autoFocus
                                          className="h-8 text-sm text-right"
                                        />
                                      ) : (
                                        <div
                                          onClick={() => startCellEdit(item.id, 'price_per_unit', item.price_per_unit)}
                                          className="text-right font-mono text-sm cursor-pointer hover:bg-blue-100 p-2 rounded min-h-[32px]"
                                        >
                                          {item.price_per_unit ? `$${item.price_per_unit.toFixed(2)}` : '-'}
                                        </div>
                                      )}
                                    </td>

                                    <td className="p-1 border-r whitespace-nowrap">
                                      <Select
                                        value={item.status || 'not_ordered'}
                                        onValueChange={(value) => updateStatus(item.id, value)}
                                      >
                                        <SelectTrigger className={`h-8 text-xs font-semibold border-2 ${getStatusColor(item.status || 'not_ordered')}`}>
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
                                    </td>

                                    <td className="p-1">
                                      <div className="flex items-center justify-center gap-1">
                                        <MaterialItemPhotos 
                                          materialItemId={item.id}
                                          materialName={item.material_name}
                                        />
                                        <Button size="sm" variant="ghost" onClick={() => openMoveItem(item)} title="Move">
                                          <MoveHorizontal className="w-4 h-4" />
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          onClick={() => deleteItem(item.id)}
                                          className="text-destructive hover:bg-destructive/10"
                                          title="Delete"
                                        >
                                          <Trash2 className="w-4 h-4" />
                                        </Button>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </>
                          ))}
                        </tbody>
                      </table>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="packages" className="space-y-2">
          <MaterialPackages jobId={job.id} userId={userId} workbook={workbook} />
        </TabsContent>

        <TabsContent value="crew-orders" className="space-y-2">
          <CrewMaterialProcessing jobId={job.id} />
        </TabsContent>

        <TabsContent value="upload" className="space-y-2">
          <MaterialWorkbookManager jobId={job.id} />
        </TabsContent>
      </Tabs>

      {/* Add Material Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Material to {activeSheet?.sheet_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="add-material-name">Material Name *</Label>
                <Input
                  id="add-material-name"
                  value={newMaterialName}
                  onChange={(e) => setNewMaterialName(e.target.value)}
                  placeholder="e.g., 2x4 Lumber, Roofing Nails..."
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="add-category">Category *</Label>
                <Select value={addToCategory} onValueChange={setAddToCategory}>
                  <SelectTrigger id="add-category">
                    <SelectValue placeholder="Select or type new..." />
                  </SelectTrigger>
                  <SelectContent>
                    {allCategories.map(category => (
                      <SelectItem key={category} value={category}>
                        {category}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  value={addToCategory}
                  onChange={(e) => setAddToCategory(e.target.value)}
                  placeholder="Or type new category"
                  className="mt-2"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="add-usage">Usage</Label>
                <Input
                  id="add-usage"
                  value={newUsage}
                  onChange={(e) => setNewUsage(e.target.value)}
                  placeholder="e.g., Main building, Porch..."
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="add-sku">SKU</Label>
                <Input
                  id="add-sku"
                  value={newSku}
                  onChange={(e) => setNewSku(e.target.value)}
                  placeholder="Part number or SKU"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="add-quantity">Quantity *</Label>
                <Input
                  id="add-quantity"
                  type="number"
                  min="0"
                  step="0.01"
                  value={newQuantity}
                  onChange={(e) => setNewQuantity(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="add-length">Length</Label>
                <Input
                  id="add-length"
                  value={newLength}
                  onChange={(e) => setNewLength(e.target.value)}
                  placeholder="e.g., 8', 10', 12'..."
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="add-cost">Cost/Unit ($)</Label>
                <Input
                  id="add-cost"
                  type="number"
                  min="0"
                  step="0.01"
                  value={newCostPerUnit}
                  onChange={(e) => setNewCostPerUnit(e.target.value)}
                  placeholder="0.00"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="add-markup">Markup (%) - Default 35%</Label>
              <Input
                id="add-markup"
                type="number"
                min="0"
                step="0.1"
                value={newMarkup}
                onChange={(e) => setNewMarkup(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="add-notes">Notes</Label>
              <Textarea
                id="add-notes"
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                placeholder="Optional notes or special instructions..."
                rows={3}
              />
            </div>

            {/* Preview */}
            {newCostPerUnit && newQuantity && (
              <div className="bg-green-50 p-4 rounded-lg border border-green-200 space-y-2">
                <h4 className="font-semibold text-green-900">Price Preview</h4>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-muted-foreground">Cost/Unit:</span>
                    <span className="ml-2 font-semibold">${parseFloat(newCostPerUnit).toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Price/Unit:</span>
                    <span className="ml-2 font-semibold text-green-700">
                      ${(parseFloat(newCostPerUnit) * (1 + parseFloat(newMarkup) / 100)).toFixed(2)}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Extended Cost:</span>
                    <span className="ml-2 font-semibold">
                      ${(parseFloat(newCostPerUnit) * parseFloat(newQuantity)).toFixed(2)}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Extended Price:</span>
                    <span className="ml-2 font-bold text-green-700">
                      ${(parseFloat(newCostPerUnit) * parseFloat(newQuantity) * (1 + parseFloat(newMarkup) / 100)).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-4 border-t">
              <Button
                onClick={addMaterial}
                disabled={saving}
                className="flex-1"
              >
                {saving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    Adding...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Material
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowAddDialog(false)}
                disabled={saving}
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Move Material Dialog */}
      <Dialog open={showMoveDialog} onOpenChange={setShowMoveDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Move Material</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Move <strong>{movingItem?.material_name}</strong> to a different sheet or category
            </p>

            <div className="space-y-2">
              <Label htmlFor="move-sheet">Sheet</Label>
              <Select value={moveToSheetId} onValueChange={setMoveToSheetId}>
                <SelectTrigger id="move-sheet">
                  <SelectValue placeholder="Select sheet" />
                </SelectTrigger>
                <SelectContent>
                  {workbook?.sheets.map(sheet => (
                    <SelectItem key={sheet.id} value={sheet.id}>
                      {sheet.sheet_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="move-category">Category</Label>
              <Select value={moveToCategory} onValueChange={setMoveToCategory}>
                <SelectTrigger id="move-category">
                  <SelectValue placeholder="Select or enter category" />
                </SelectTrigger>
                <SelectContent>
                  {allCategories.map(category => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                value={moveToCategory}
                onChange={(e) => setMoveToCategory(e.target.value)}
                placeholder="Or type new category name"
                className="mt-2"
              />
            </div>

            <div className="flex gap-3 pt-4 border-t">
              <Button onClick={moveItem} className="flex-1">
                <MoveHorizontal className="w-4 h-4 mr-2" />
                Move Material
              </Button>
              <Button variant="outline" onClick={() => setShowMoveDialog(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add to Package Dialog */}
      <Dialog open={showAddToPackageDialog} onOpenChange={setShowAddToPackageDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Materials to Package</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Adding {selectedMaterialsForPackageAdd.size} material{selectedMaterialsForPackageAdd.size !== 1 ? 's' : ''} to a package
            </p>

            <div className="space-y-2">
              <Label htmlFor="target-package">Select Package *</Label>
              <Select value={targetPackageId} onValueChange={setTargetPackageId}>
                <SelectTrigger id="target-package">
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

            <div className="flex gap-3 pt-4 border-t">
              <Button
                onClick={addSelectedMaterialsToSelectedPackage}
                disabled={addingMaterialsToPackage || !targetPackageId}
                className="flex-1"
              >
                {addingMaterialsToPackage ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    Adding...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Add to Package
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowAddToPackageDialog(false)}
                disabled={addingMaterialsToPackage}
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
