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
  ShoppingCart,
  FileText,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import type { Job } from '@/types';
import { ExtrasManagement } from './ExtrasManagement';
import { CrewMaterialProcessing } from './CrewMaterialProcessing';
import { MaterialWorkbookManager } from './MaterialWorkbookManager';
import { MaterialItemPhotos } from './MaterialItemPhotos';
import { PhotoRecoveryTool } from './PhotoRecoveryTool';
import { MaterialPackages } from './MaterialPackages';
import { ZohoOrderConfirmationDialog } from './ZohoOrderConfirmationDialog';
import { MaterialComparison } from './MaterialComparison';
import { TrendingUp } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { FloatingDocumentViewer } from './FloatingDocumentViewer';

interface MaterialItem {
  id: string;
  sheet_id: string;
  category: string;
  usage: string | null;
  sku: string | null;
  material_name: string;
  quantity: number;
  length: string | null;
  color: string | null;
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
  proposalNumber?: string | null;
}

interface CategoryGroup {
  category: string;
  items: MaterialItem[];
}

export function MaterialsManagement({ job, userId, proposalNumber }: MaterialsManagementProps) {
  const [workbook, setWorkbook] = useState<MaterialWorkbook | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'manage' | 'breakdown' | 'packages' | 'crew-orders' | 'comparison' | 'upload'>('manage');
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
  const [newColor, setNewColor] = useState('');
  const [newCostPerUnit, setNewCostPerUnit] = useState('');
  const [newPricePerUnit, setNewPricePerUnit] = useState(''); // Price from Zoho Books
  const [newMarkup, setNewMarkup] = useState(''); // Display only - calculated from Zoho prices
  const [newNotes, setNewNotes] = useState('');
  const [saving, setSaving] = useState(false);
  
  // Database search state for add dialog
  const [showDatabaseSearch, setShowDatabaseSearch] = useState(false);
  const [catalogMaterials, setCatalogMaterials] = useState<any[]>([]);
  const [catalogSearchQuery, setCatalogSearchQuery] = useState('');
  const [catalogSearchCategory, setCatalogSearchCategory] = useState<string>('all');
  const [catalogSearchPage, setCatalogSearchPage] = useState(0);
  const [catalogCategories, setCatalogCategories] = useState<string[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  
  // Package state
  const [packages, setPackages] = useState<any[]>([]);
  
  // Package selection mode in workbook
  const [packageSelectionMode, setPackageSelectionMode] = useState(false);
  const [selectedMaterialsForPackageAdd, setSelectedMaterialsForPackageAdd] = useState<Set<string>>(new Set());
  const [showAddToPackageDialog, setShowAddToPackageDialog] = useState(false);
  const [targetPackageId, setTargetPackageId] = useState('');
  const [addingMaterialsToPackage, setAddingMaterialsToPackage] = useState(false);

  // Bulk move mode in workbook
  const [bulkMoveMode, setBulkMoveMode] = useState(false);
  const [selectedMaterialsForMove, setSelectedMaterialsForMove] = useState<Set<string>>(new Set());
  const [showBulkMoveDialog, setShowBulkMoveDialog] = useState(false);
  const [bulkMoveTargetSheetId, setBulkMoveTargetSheetId] = useState('');
  const [bulkMoveTargetCategory, setBulkMoveTargetCategory] = useState('');
  const [movingBulkMaterials, setMovingBulkMaterials] = useState(false);

  // Zoho order state
  const [showZohoOrderDialog, setShowZohoOrderDialog] = useState(false);
  const [selectedMaterialsForOrder, setSelectedMaterialsForOrder] = useState<MaterialItem[]>([]);

  // Document viewer state
  const [showDocumentViewer, setShowDocumentViewer] = useState(false);

  // Sheet management state
  const [showAddSheetDialog, setShowAddSheetDialog] = useState(false);
  const [newSheetName, setNewSheetName] = useState('');
  const [addingSheet, setAddingSheet] = useState(false);

  // Zoho sync state
  const [syncingZoho, setSyncingZoho] = useState(false);
  const [showSyncResults, setShowSyncResults] = useState(false);
  const [syncResults, setSyncResults] = useState<any>(null);

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

  function toggleBulkMoveMode() {
    setBulkMoveMode(!bulkMoveMode);
    setSelectedMaterialsForMove(new Set());
  }

  function toggleMaterialForMove(materialId: string) {
    const newSet = new Set(selectedMaterialsForMove);
    if (newSet.has(materialId)) {
      newSet.delete(materialId);
    } else {
      newSet.add(materialId);
    }
    setSelectedMaterialsForMove(newSet);
  }

  function openBulkMoveDialog() {
    if (selectedMaterialsForMove.size === 0) {
      toast.error('Please select at least one material');
      return;
    }
    setBulkMoveTargetSheetId(activeSheetId || '');
    setBulkMoveTargetCategory('');
    setShowBulkMoveDialog(true);
  }

  async function bulkMoveMaterials() {
    if (!bulkMoveTargetSheetId) {
      toast.error('Please select a target sheet');
      return;
    }

    if (!bulkMoveTargetCategory.trim()) {
      toast.error('Please enter a category');
      return;
    }

    if (selectedMaterialsForMove.size === 0) {
      toast.error('No materials selected');
      return;
    }

    setMovingBulkMaterials(true);

    try {
      // Save current scroll position
      scrollPositionRef.current = window.scrollY;

      const materialIds = Array.from(selectedMaterialsForMove);

      const { error } = await supabase
        .from('material_items')
        .update({
          sheet_id: bulkMoveTargetSheetId,
          category: bulkMoveTargetCategory.trim(),
          updated_at: new Date().toISOString(),
        })
        .in('id', materialIds);

      if (error) throw error;

      toast.success(`Moved ${materialIds.length} material${materialIds.length !== 1 ? 's' : ''} successfully`);
      setShowBulkMoveDialog(false);
      setBulkMoveMode(false);
      setSelectedMaterialsForMove(new Set());
      
      // Reload to reflect changes
      await loadWorkbook();

      // Restore scroll position after reload
      requestAnimationFrame(() => {
        window.scrollTo({ top: scrollPositionRef.current, behavior: 'instant' });
      });
    } catch (error: any) {
      console.error('Error moving materials:', error);
      toast.error(`Failed to move materials: ${error.message || 'Unknown error'}`);
    } finally {
      setMovingBulkMaterials(false);
    }
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

      console.log('=== SAVE CELL EDIT START ===');
      console.log('Field:', field);
      console.log('Input value:', cellValue);
      console.log('Current item:', item);

      if (['quantity', 'cost_per_unit', 'price_per_unit'].includes(field)) {
        value = parseFloat(cellValue) || null;
      } else if (field === 'markup_percent') {
        // Convert percentage input (e.g., "35") to decimal (e.g., 0.35)
        const percentValue = parseFloat(cellValue);
        console.log('Parsed percentage value:', percentValue);
        
        if (isNaN(percentValue)) {
          console.error('Invalid number entered:', cellValue);
          toast.error('Please enter a valid number');
          cancelCellEdit();
          return;
        }
        
        // Check if the value is too large for the database field (numeric(5,4) = max 9.9999)
        const decimalValue = percentValue / 100;
        if (decimalValue > 9.9999) {
          console.error('Markup too large:', decimalValue);
          toast.error('Markup cannot exceed 999.99%');
          cancelCellEdit();
          return;
        }
        
        value = decimalValue;
        console.log('Converted to decimal:', value);
      }

      const updateData: any = {
        [field]: value,
        updated_at: new Date().toISOString(),
      };

      // Recalculate extended_cost when quantity or cost_per_unit changes
      if (field === 'quantity' || field === 'cost_per_unit') {
        const qty = field === 'quantity' ? value : item.quantity;
        const cost = field === 'cost_per_unit' ? value : item.cost_per_unit;
        updateData.extended_cost = qty && cost ? qty * cost : null;
      }
      
      // Recalculate price_per_unit when markup changes
      if (field === 'markup_percent' && item.cost_per_unit) {
        const markupDecimal = value; // already converted to decimal above
        const newPricePerUnit = item.cost_per_unit * (1 + markupDecimal);
        updateData.price_per_unit = newPricePerUnit;
        updateData.extended_price = item.quantity && newPricePerUnit ? item.quantity * newPricePerUnit : null;
        console.log('Recalculated prices:', { 
          cost: item.cost_per_unit, 
          markup: markupDecimal, 
          newPrice: newPricePerUnit,
          extendedPrice: updateData.extended_price 
        });
      }
      
      console.log('Final updateData:', updateData);
      
      // Recalculate extended_price when quantity or price_per_unit changes
      if (field === 'quantity' || field === 'price_per_unit') {
        const qty = field === 'quantity' ? value : item.quantity;
        const price = field === 'price_per_unit' ? value : item.price_per_unit;
        updateData.extended_price = qty && price ? qty * price : null;
      }

      // Save current scroll position
      scrollPositionRef.current = window.scrollY;

      // Close editing mode immediately for better UX
      setEditingCell(null);
      setCellValue('');

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

      // Save to database
      console.log('Sending to database - Item ID:', item.id);
      console.log('Update payload:', JSON.stringify(updateData, null, 2));
      
      const { data, error } = await supabase
        .from('material_items')
        .update(updateData)
        .eq('id', item.id)
        .select();

      console.log('Database response - data:', data);
      console.log('Database response - error:', error);

      if (error) {
        console.error('=== DATABASE ERROR ===');
        console.error('Error code:', error.code);
        console.error('Error message:', error.message);
        console.error('Error details:', error.details);
        console.error('Error hint:', error.hint);
        toast.error(`Failed to update ${field}: ${error.message}`);
        // Reload on error to revert optimistic update
        await loadWorkbook();
      } else {
        console.log('=== SUCCESS ===');
        console.log('Database updated successfully');
        console.log('Updated row:', data);
        toast.success('Updated successfully');
      }
      
      console.log('=== SAVE CELL EDIT END ===');

      // Restore scroll position
      requestAnimationFrame(() => {
        window.scrollTo({ top: scrollPositionRef.current, behavior: 'instant' });
      });

    } catch (error: any) {
      console.error('=== EXCEPTION IN saveCellEdit ===');
      console.error('Error type:', typeof error);
      console.error('Error:', error);
      console.error('Error message:', error?.message);
      console.error('Error stack:', error?.stack);
      toast.error(`Failed to save: ${error?.message || 'Unknown error'}`);
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
      case 'at_job':
        return 'bg-teal-100 text-teal-800 border-teal-300';
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

  async function loadCatalogMaterials() {
    try {
      setLoadingCatalog(true);
      
      const { data, error } = await supabase
        .from('materials_catalog')
        .select('*')
        .order('category')
        .order('material_name');

      if (error) throw error;

      setCatalogMaterials(data || []);
      
      // Extract unique categories
      const uniqueCategories = [...new Set(data?.map(m => m.category).filter(Boolean))] as string[];
      setCatalogCategories(uniqueCategories.sort());
    } catch (error: any) {
      console.error('Error loading catalog:', error);
      toast.error('Failed to load materials catalog');
    } finally {
      setLoadingCatalog(false);
    }
  }

  function selectMaterialFromCatalog(catalogItem: any) {
    // Auto-fill form with catalog data - use Zoho Books prices directly
    const cost = catalogItem.purchase_cost || 0;
    const price = catalogItem.unit_price || 0;
    
    // Calculate markup percentage from Zoho Books prices (for display/reference only)
    let calculatedMarkup = '';
    if (cost > 0 && price > 0) {
      const markupPercent = ((price - cost) / cost) * 100;
      calculatedMarkup = markupPercent.toFixed(1);
    }

    setNewMaterialName(catalogItem.material_name);
    setNewSku(catalogItem.sku || '');
    setNewLength(catalogItem.part_length || '');
    setNewColor(''); // Color not in catalog, user can enter manually
    setNewCostPerUnit(cost.toString());
    setNewPricePerUnit(price.toString()); // Use Zoho Books price directly
    setNewMarkup(calculatedMarkup); // Display calculated markup (reference only)
    setAddToCategory(catalogItem.category || addToCategory);
    
    setShowDatabaseSearch(false);
    setCatalogSearchQuery('');
    toast.success(`Material "${catalogItem.material_name}" loaded from Zoho Books`);
  }

  function openZohoOrderDialogForMaterial(item: MaterialItem) {
    setSelectedMaterialsForOrder([item]);
    setShowZohoOrderDialog(true);
  }

  function openZohoOrderDialogForCategory(categoryItems: MaterialItem[]) {
    if (categoryItems.length === 0) {
      toast.error('No materials to order');
      return;
    }
    setSelectedMaterialsForOrder(categoryItems);
    setShowZohoOrderDialog(true);
  }

  function openAddDialog(categoryName?: string) {
    setAddToCategory(categoryName || '');
    setNewMaterialName('');
    setNewUsage('');
    setNewSku('');
    setNewQuantity('1');
    setNewLength('');
    setNewColor('');
    setNewCostPerUnit('');
    setNewPricePerUnit(''); // Reset price from catalog
    setNewMarkup(''); // Reset markup (no default)
    setNewNotes('');
    setShowDatabaseSearch(false);
    setCatalogSearchQuery('');
    setCatalogSearchCategory('all');
    setShowAddDialog(true);
    loadCatalogMaterials();
  }

  async function addNewSheet() {
    if (!workbook || workbook.status === 'locked') {
      toast.error('Cannot add sheets to a locked workbook');
      return;
    }

    if (!newSheetName.trim()) {
      toast.error('Please enter a sheet name');
      return;
    }

    setAddingSheet(true);

    try {
      // Get max order index
      const maxOrderIndex = Math.max(...workbook.sheets.map(s => s.order_index), -1);

      // Create new sheet
      const { data: newSheet, error } = await supabase
        .from('material_sheets')
        .insert({
          workbook_id: workbook.id,
          sheet_name: newSheetName.trim(),
          order_index: maxOrderIndex + 1,
        })
        .select()
        .single();

      if (error) throw error;

      toast.success(`Sheet "${newSheetName}" added successfully`);
      setShowAddSheetDialog(false);
      setNewSheetName('');
      
      // Reload workbook to show new sheet
      await loadWorkbook();
      
      // Set new sheet as active
      if (newSheet) {
        setActiveSheetId(newSheet.id);
      }
    } catch (error: any) {
      console.error('Error adding sheet:', error);
      toast.error('Failed to add sheet');
    } finally {
      setAddingSheet(false);
    }
  }

  async function syncMaterialsFromZoho() {
    setSyncingZoho(true);
    
    try {
      console.log('🔄 Starting Zoho Books material sync...');
      
      const { data, error } = await supabase.functions.invoke('zoho-sync', {
        body: { action: 'sync_materials' },
      });

      if (error) throw error;

      console.log('✅ Sync completed:', data);
      
      setSyncResults(data);
      setShowSyncResults(true);
      
      // Reload catalog materials to show updated data
      await loadCatalogMaterials();
      
      toast.success(`✅ Synced ${data.itemsSynced || 0} materials from Zoho Books`);
    } catch (error: any) {
      console.error('❌ Sync error:', error);
      toast.error(`Failed to sync materials: ${error.message || 'Unknown error'}`);
    } finally {
      setSyncingZoho(false);
    }
  }

  async function deleteSheet(sheet: MaterialSheet) {
    if (!workbook || workbook.status === 'locked') {
      toast.error('Cannot delete sheets from a locked workbook');
      return;
    }

    if (workbook.sheets.length === 1) {
      toast.error('Cannot delete the last sheet. Workbooks must have at least one sheet.');
      return;
    }

    if (!confirm(`Delete sheet "${sheet.sheet_name}"? This will also delete all ${sheet.items.length} materials in this sheet.`)) {
      return;
    }

    try {
      // Save current scroll position
      scrollPositionRef.current = window.scrollY;

      const { error } = await supabase
        .from('material_sheets')
        .delete()
        .eq('id', sheet.id);

      if (error) throw error;

      toast.success(`Sheet "${sheet.sheet_name}" deleted`);
      
      // Reload workbook
      await loadWorkbook();
      
      // Set active sheet to first available sheet if current one was deleted
      if (activeSheetId === sheet.id && workbook.sheets.length > 0) {
        const firstAvailableSheet = workbook.sheets.find(s => s.id !== sheet.id);
        if (firstAvailableSheet) {
          setActiveSheetId(firstAvailableSheet.id);
        }
      }

      // Restore scroll position
      requestAnimationFrame(() => {
        window.scrollTo({ top: scrollPositionRef.current, behavior: 'instant' });
      });
    } catch (error: any) {
      console.error('Error deleting sheet:', error);
      toast.error('Failed to delete sheet');
    }
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
      
      // Use price from Zoho Books if available, otherwise calculate from markup
      let pricePerUnit: number | null = null;
      let markupDecimal = 0;
      
      if (newPricePerUnit) {
        // Price from Zoho Books - use as-is
        pricePerUnit = parseFloat(newPricePerUnit) || null;
        // Calculate markup for storage (reference only)
        if (costPerUnit && pricePerUnit && costPerUnit > 0) {
          markupDecimal = (pricePerUnit - costPerUnit) / costPerUnit;
        }
      } else {
        // Manual entry - calculate from markup
        const markup = parseFloat(newMarkup) || 0;
        markupDecimal = markup / 100;
        pricePerUnit = costPerUnit ? costPerUnit * (1 + markupDecimal) : null;
      }
      
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
          color: newColor.trim() || null,
          cost_per_unit: costPerUnit,
          markup_percent: markupDecimal,
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
          <div className="relative w-full">
            {proposalNumber && (
              <div className="absolute -top-1 right-2 z-20">
                <Badge variant="secondary" className="bg-blue-600 text-white border-blue-700 text-xs font-semibold shadow-md">
                  Proposal #{proposalNumber}
                </Badge>
              </div>
            )}
            <TabsList className="grid w-full grid-cols-6 h-14 bg-white shadow-sm">
            <TabsTrigger value="manage" className="flex flex-col sm:flex-row items-center gap-1 sm:gap-2 text-base font-semibold">
              <FileSpreadsheet className="w-5 h-5" />
              <span className="text-xs sm:text-base">Workbook</span>
            </TabsTrigger>
            <TabsTrigger value="breakdown" className="flex flex-col sm:flex-row items-center gap-1 sm:gap-2 text-base font-semibold">
              <DollarSign className="w-5 h-5" />
              <span className="text-xs sm:text-base">Breakdown</span>
            </TabsTrigger>
            <TabsTrigger value="comparison" className="flex flex-col sm:flex-row items-center gap-1 sm:gap-2 text-base font-semibold">
              <TrendingUp className="w-5 h-5" />
              <span className="text-xs sm:text-base">Comparison</span>
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
                          <div key={sheet.id} className="relative group">
                            <Button
                              variant={activeSheetId === sheet.id ? 'default' : 'ghost'}
                              size="sm"
                              onClick={() => handleSheetChange(sheet.id)}
                              className={`flex items-center gap-2 min-w-[140px] justify-start font-semibold pr-8 ${activeSheetId === sheet.id ? 'bg-white shadow-md border-2 border-primary' : 'hover:bg-white/50'}`}
                            >
                              <FileSpreadsheet className="w-4 h-4" />
                              {sheet.sheet_name}
                              <Badge variant="secondary" className="ml-auto text-xs">
                                {sheet.items.length}
                              </Badge>
                            </Button>
                            {/* Delete Sheet Button - only show when workbook is working status */}
                            {workbook.status === 'working' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteSheet(sheet);
                                }}
                                className="absolute right-0 top-0 h-full w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity bg-red-500 hover:bg-red-600 text-white rounded-l-none"
                                title="Delete this sheet"
                              >
                                <X className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        ))}
                        
                        {/* Add Sheet Button */}
                        {workbook.status === 'working' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowAddSheetDialog(true)}
                            className="border-2 border-dashed border-blue-400 bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold min-w-[140px]"
                          >
                            <Plus className="w-5 h-5 mr-1" />
                            Add Sheet
                          </Button>
                        )}
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
                        ) : bulkMoveMode ? (
                          <>
                            <Button
                              onClick={openBulkMoveDialog}
                              size="sm"
                              disabled={selectedMaterialsForMove.size === 0}
                              className="bg-orange-600 hover:bg-orange-700 whitespace-nowrap"
                            >
                              <MoveHorizontal className="w-4 h-4 mr-1" />
                              Move Selected ({selectedMaterialsForMove.size})
                            </Button>
                            <Button
                              onClick={toggleBulkMoveMode}
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
                            {workbook.sheets.length > 1 && (
                              <Button
                                onClick={toggleBulkMoveMode}
                                size="sm"
                                variant="outline"
                                className="whitespace-nowrap bg-orange-50 border-orange-300 text-orange-700 hover:bg-orange-100"
                              >
                                <MoveHorizontal className="w-4 h-4 mr-1" />
                                Select to Move
                              </Button>
                            )}
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
                              onClick={() => setShowDocumentViewer(true)}
                              size="sm"
                              variant="outline"
                              className="whitespace-nowrap bg-blue-50 border-blue-300 text-blue-700 hover:bg-blue-100"
                            >
                              <FileText className="w-4 h-4 mr-1" />
                              View Documents
                            </Button>
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
                            {(packageSelectionMode || bulkMoveMode) && (
                              <th className="text-center p-3 font-bold border-r border-slate-600 whitespace-nowrap">
                                <CheckSquare className="w-5 h-5 mx-auto" />
                              </th>
                            )}
                            <th className="text-center p-3 font-bold border-r border-slate-600 whitespace-nowrap">
                              <Package className="w-5 h-5 mx-auto" />
                            </th>
                            <th className="text-left p-3 font-bold border-r border-slate-600 whitespace-nowrap">SKU</th>
                            <th className="text-left p-3 font-bold border-r border-slate-600 whitespace-nowrap">Material</th>
                            <th className="text-left p-3 font-bold border-r border-slate-600 whitespace-nowrap">Usage</th>
                            <th className="text-center p-3 font-bold border-r border-slate-600 whitespace-nowrap">Qty</th>
                            <th className="text-center p-3 font-bold border-r border-slate-600 whitespace-nowrap">Length</th>
                            <th className="text-center p-3 font-bold border-r border-slate-600 whitespace-nowrap">Color</th>
                            <th className="text-right p-3 font-bold border-r border-slate-600 whitespace-nowrap">Cost/Unit</th>
                            <th className="text-center p-3 font-bold border-r border-slate-600 whitespace-nowrap">Markup %</th>
                            <th className="text-right p-3 font-bold border-r border-slate-600 whitespace-nowrap">Price/Unit</th>
                            <th className="text-right p-3 font-bold border-r border-slate-600 whitespace-nowrap">Total Price</th>
                            <th className="text-center p-3 font-bold border-r border-slate-600 whitespace-nowrap">Status</th>
                            <th className="text-center p-3 font-bold whitespace-nowrap">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {categoryGroups.map((catGroup, catIndex) => (
                            <>
                              <tr key={`cat-${catIndex}`} className="bg-gradient-to-r from-indigo-100 to-indigo-50 border-y-2 border-indigo-300">
                                <td colSpan={packageSelectionMode ? 13 : 12} className="p-3">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <FileSpreadsheet className="w-5 h-5 text-indigo-700" />
                                      <h3 className="font-bold text-lg text-indigo-900">{catGroup.category}</h3>
                                      <Badge variant="outline" className="bg-white">
                                        {catGroup.items.length} items
                                      </Badge>
                                    </div>
                                    <div className="flex gap-2">
                                      <Button
                                        size="sm"
                                        onClick={() => openZohoOrderDialogForCategory(catGroup.items)}
                                        className="bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white"
                                      >
                                        <ShoppingCart className="w-3 h-3 mr-1" />
                                        Order All
                                      </Button>
                                      <Button
                                        size="sm"
                                        onClick={() => openAddDialog(catGroup.category)}
                                        className="bg-indigo-600 hover:bg-indigo-700"
                                      >
                                        <Plus className="w-3 h-3 mr-1" />
                                        Add to {catGroup.category}
                                      </Button>
                                    </div>
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
                                        : bulkMoveMode && selectedMaterialsForMove.has(item.id)
                                        ? 'bg-orange-100 hover:bg-orange-200'
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
                                    {bulkMoveMode && (
                                      <td className="p-1 border-r whitespace-nowrap">
                                        <div className="flex items-center justify-center">
                                          <Checkbox
                                            checked={selectedMaterialsForMove.has(item.id)}
                                            onCheckedChange={() => toggleMaterialForMove(item.id)}
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
                                      <div className="font-mono text-sm text-muted-foreground p-2 min-h-[32px]">
                                        {item.sku || '–'}
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
                                      {isEditingThisCell('color') ? (
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
                                          onClick={() => startCellEdit(item.id, 'color', item.color)}
                                          className="text-center text-sm cursor-pointer hover:bg-blue-100 p-2 rounded min-h-[32px]"
                                        >
                                          {item.color || '-'}
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

                                    <td className="p-1 border-r whitespace-nowrap">
                                      {isEditingThisCell('markup_percent') ? (
                                        <div className="flex items-center gap-1 px-2">
                                          <Input
                                            type="number"
                                            step="0.1"
                                            min="0"
                                            max="999"
                                            value={cellValue}
                                            onChange={(e) => {
                                              console.log('Markup input changed:', e.target.value);
                                              setCellValue(e.target.value);
                                            }}
                                            onBlur={() => saveCellEdit(item)}
                                            onKeyDown={(e) => {
                                              if (e.key === 'Enter') {
                                                e.preventDefault();
                                                saveCellEdit(item);
                                              }
                                              if (e.key === 'Escape') {
                                                e.preventDefault();
                                                cancelCellEdit();
                                              }
                                            }}
                                            autoFocus
                                            className="h-8 text-sm text-center w-20"
                                            placeholder="35"
                                          />
                                          <span className="text-xs text-muted-foreground">%</span>
                                        </div>
                                      ) : (
                                        <div
                                          onClick={() => {
                                            // Use stored markup_percent if available, otherwise calculate from cost/price
                                            const currentMarkup = item.markup_percent !== null 
                                              ? (item.markup_percent * 100) 
                                              : markupPercent;
                                            console.log('Starting markup edit:', { 
                                              stored: item.markup_percent, 
                                              calculated: markupPercent, 
                                              using: currentMarkup 
                                            });
                                            startCellEdit(item.id, 'markup_percent', currentMarkup.toFixed(1));
                                          }}
                                          className="cursor-pointer hover:bg-blue-100 p-2 rounded min-h-[32px] flex items-center justify-center"
                                          title="Click to edit markup percentage"
                                        >
                                          {(item.markup_percent !== null && item.markup_percent > 0) || markupPercent > 0 ? (
                                            <Badge variant="secondary" className="bg-green-100 text-green-800 font-semibold">
                                              <Percent className="w-3 h-3 mr-1" />
                                              {item.markup_percent !== null 
                                                ? (item.markup_percent * 100).toFixed(1)
                                                : markupPercent.toFixed(1)
                                              }%
                                            </Badge>
                                          ) : (
                                            <span className="text-xs text-muted-foreground">Click to set</span>
                                          )}
                                        </div>
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

                                    <td className="p-2 text-right border-r">
                                      <div className="font-bold text-sm text-green-700">
                                        {item.extended_price ? `$${item.extended_price.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '-'}
                                      </div>
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
                                          <SelectItem value="at_job">At Job</SelectItem>
                                        </SelectContent>
                                      </Select>
                                    </td>

                                    <td className="p-1">
                                      <div className="flex items-center justify-center gap-1">
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          onClick={() => openZohoOrderDialogForMaterial(item)}
                                          className="text-purple-600 hover:bg-purple-50 hover:text-purple-700"
                                          title="Create Zoho Order"
                                        >
                                          <ShoppingCart className="w-4 h-4" />
                                        </Button>
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

        <TabsContent value="breakdown" className="space-y-2">
          {!workbook ? (
            <Card>
              <CardContent className="py-12 text-center">
                <DollarSign className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                <h3 className="text-lg font-semibold mb-2">No Material Workbook</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Upload an Excel workbook to view cost breakdown
                </p>
                <Button onClick={() => setActiveTab('upload')} className="gradient-primary">
                  <Upload className="w-4 h-4 mr-2" />
                  Upload Workbook
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-2">
              <CardHeader className="bg-gradient-to-r from-slate-100 to-slate-50 border-b-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <DollarSign className="w-6 h-6" />
                    Cost Breakdown
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Label className="text-sm font-semibold">Sheet:</Label>
                    <Select value={activeSheetId} onValueChange={setActiveSheetId}>
                      <SelectTrigger className="w-[200px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {workbook.sheets.map(sheet => (
                          <SelectItem key={sheet.id} value={sheet.id}>
                            {sheet.sheet_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-6">
                {(() => {
                  const sheet = workbook.sheets.find(s => s.id === activeSheetId);
                  if (!sheet || sheet.items.length === 0) {
                    return (
                      <div className="text-center py-12 text-muted-foreground">
                        <FileSpreadsheet className="w-16 h-16 mx-auto mb-3 opacity-50" />
                        <p>No materials in this sheet</p>
                      </div>
                    );
                  }

                  const totalCost = sheet.items.reduce((sum, item) => sum + (item.extended_cost || 0), 0);
                  const totalPrice = sheet.items.reduce((sum, item) => sum + (item.extended_price || 0), 0);
                  const totalProfit = totalPrice - totalCost;
                  const profitMargin = totalCost > 0 ? (totalProfit / totalCost) * 100 : 0;
                  const categoryGroups = groupByCategory(sheet.items);

                  return (
                    <div className="space-y-6">
                      {/* Overall Totals */}
                      <div>
                        <h3 className="text-lg font-bold text-slate-900 mb-4">Overall Totals - {sheet.sheet_name}</h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div className="bg-white rounded-lg p-6 border-2 border-slate-300 shadow-sm">
                            <div className="text-xs font-semibold text-muted-foreground mb-2">Total Cost</div>
                            <div className="text-3xl font-bold text-red-600">
                              ${totalCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                          </div>
                          <div className="bg-white rounded-lg p-6 border-2 border-green-500 shadow-sm">
                            <div className="text-xs font-semibold text-muted-foreground mb-2">Total Price</div>
                            <div className="text-3xl font-bold text-green-700">
                              ${totalPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                          </div>
                          <div className="bg-white rounded-lg p-6 border-2 border-blue-500 shadow-sm">
                            <div className="text-xs font-semibold text-muted-foreground mb-2">Total Profit</div>
                            <div className="text-3xl font-bold text-blue-700">
                              ${totalProfit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                          </div>
                          <div className="bg-white rounded-lg p-6 border-2 border-purple-500 shadow-sm">
                            <div className="text-xs font-semibold text-muted-foreground mb-2">Profit Margin</div>
                            <div className="text-3xl font-bold text-purple-700 flex items-center gap-2">
                              <Percent className="w-6 h-6" />
                              {profitMargin.toFixed(1)}%
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Category Breakdown */}
                      <div>
                        <h4 className="text-lg font-bold text-slate-900 mb-4">Breakdown by Category</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {categoryGroups.map((catGroup) => {
                            const catCost = catGroup.items.reduce((sum, item) => sum + (item.extended_cost || 0), 0);
                            const catPrice = catGroup.items.reduce((sum, item) => sum + (item.extended_price || 0), 0);
                            const catProfit = catPrice - catCost;
                            const catMargin = catCost > 0 ? (catProfit / catCost) * 100 : 0;

                            return (
                              <div key={catGroup.category} className="border-2 rounded-lg p-4 bg-gradient-to-br from-white to-slate-50 shadow-sm hover:shadow-md transition-shadow">
                                <div className="flex items-center gap-2 mb-3">
                                  <FileSpreadsheet className="w-5 h-5 text-indigo-600" />
                                  <div className="font-bold text-base text-slate-900">{catGroup.category}</div>
                                  <Badge variant="outline" className="ml-auto">
                                    {catGroup.items.length} items
                                  </Badge>
                                </div>
                                <div className="space-y-2 text-sm">
                                  <div className="flex justify-between items-center py-1">
                                    <span className="text-muted-foreground">Cost:</span>
                                    <span className="font-bold text-red-600">
                                      ${catCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                    </span>
                                  </div>
                                  <div className="flex justify-between items-center py-1">
                                    <span className="text-muted-foreground">Price:</span>
                                    <span className="font-bold text-green-600">
                                      ${catPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                    </span>
                                  </div>
                                  <div className="flex justify-between items-center py-1">
                                    <span className="text-muted-foreground">Profit:</span>
                                    <span className="font-bold text-blue-600">
                                      ${catProfit.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                    </span>
                                  </div>
                                  <div className="flex justify-between items-center py-1 pt-2 border-t-2">
                                    <span className="font-semibold text-slate-700">Margin:</span>
                                    <span className="font-bold text-lg text-purple-600 flex items-center gap-1">
                                      <Percent className="w-4 h-4" />
                                      {catMargin.toFixed(1)}%
                                    </span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="comparison" className="space-y-2">
          <MaterialComparison jobId={job.id} />
        </TabsContent>

        <TabsContent value="packages" className="space-y-2">
          <MaterialPackages jobId={job.id} userId={userId} workbook={workbook} job={job} />
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
            <DialogTitle className="flex items-center justify-between">
              <span>Add Material to {activeSheet?.sheet_name}</span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={syncMaterialsFromZoho}
                  disabled={syncingZoho}
                  className="border-purple-500 text-purple-700 hover:bg-purple-50"
                  title="Sync materials from Zoho Books"
                >
                  {syncingZoho ? (
                    <>
                      <div className="w-4 h-4 border-2 border-purple-700 border-t-transparent rounded-full animate-spin mr-2" />
                      Syncing...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Sync Zoho
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowDatabaseSearch(!showDatabaseSearch)}
                  className="border-blue-500 text-blue-700 hover:bg-blue-50"
                >
                  <Search className="w-4 h-4 mr-2" />
                  {showDatabaseSearch ? 'Hide' : 'Search'} Database
                </Button>
              </div>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Database Search Section */}
            {showDatabaseSearch && (
              <div className="bg-blue-50 border-2 border-blue-300 rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2 mb-2">
                  <Search className="w-5 h-5 text-blue-700" />
                  <h3 className="font-semibold text-blue-900">Search Materials Database</h3>
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <div className="relative">
                    <Input
                      placeholder="Search by name, SKU, or category..."
                      value={catalogSearchQuery}
                      onChange={(e) => { setCatalogSearchQuery(e.target.value); setCatalogSearchPage(0); }}
                      className="pl-9"
                    />
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  </div>
                  
                  <Select value={catalogSearchCategory} onValueChange={(v) => { setCatalogSearchCategory(v); setCatalogSearchPage(0); }}>
                    <SelectTrigger>
                      <SelectValue placeholder="All Categories" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      {catalogCategories.map(cat => (
                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Search Results */}
                <div className="max-h-64 overflow-y-auto border rounded-lg bg-white">
                  {(() => {
                    const filtered = catalogMaterials.filter(material => {
                      const matchesSearch = catalogSearchQuery === '' || 
                        material.material_name.toLowerCase().includes(catalogSearchQuery.toLowerCase()) ||
                        material.sku.toLowerCase().includes(catalogSearchQuery.toLowerCase()) ||
                        (material.category && material.category.toLowerCase().includes(catalogSearchQuery.toLowerCase()));
                      
                      const matchesCategory = catalogSearchCategory === 'all' || material.category === catalogSearchCategory;
                      
                      return matchesSearch && matchesCategory;
                    });

                    if (loadingCatalog) {
                      return (
                        <div className="text-center py-8">
                          <div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                          <p className="text-xs text-muted-foreground">Loading...</p>
                        </div>
                      );
                    }

                    if (filtered.length === 0) {
                      return (
                        <div className="text-center py-8">
                          <p className="text-sm text-muted-foreground">No materials found</p>
                        </div>
                      );
                    }

                    const PAGE_SIZE = 10;
                    const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
                    const safePage = Math.min(catalogSearchPage, totalPages - 1);
                    const pageItems = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

                    return (
                      <div className="divide-y">
                        {pageItems.map((material) => (
                          <button
                            key={material.sku}
                            onClick={() => selectMaterialFromCatalog(material)}
                            className="w-full text-left p-3 hover:bg-blue-50 transition-colors flex items-center justify-between group"
                          >
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-sm truncate">{material.material_name}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-xs text-muted-foreground font-mono">{material.sku}</span>
                                {material.category && (
                                  <Badge variant="outline" className="text-xs">
                                    {material.category}
                                  </Badge>
                                )}
                                {material.part_length && (
                                  <span className="text-xs text-muted-foreground">{material.part_length}</span>
                                )}
                              </div>
                            </div>
                            <div className="text-right ml-4">
                              {material.purchase_cost && (
                                <p className="text-sm font-semibold">${material.purchase_cost.toFixed(2)}</p>
                              )}
                              <span className="text-xs text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">Click to use</span>
                            </div>
                          </button>
                        ))}
                        {totalPages > 1 && (
                          <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-t">
                            <button
                              onClick={() => setCatalogSearchPage(p => Math.max(0, p - 1))}
                              disabled={safePage === 0}
                              className="flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 disabled:opacity-30 disabled:cursor-not-allowed px-2 py-1 rounded hover:bg-slate-200 transition-colors"
                            >
                              ← Prev
                            </button>
                            <p className="text-xs text-muted-foreground">
                              {safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, filtered.length)} of {filtered.length} results
                            </p>
                            <button
                              onClick={() => setCatalogSearchPage(p => Math.min(totalPages - 1, p + 1))}
                              disabled={safePage >= totalPages - 1}
                              className="flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 disabled:opacity-30 disabled:cursor-not-allowed px-2 py-1 rounded hover:bg-slate-200 transition-colors"
                            >
                              Next →
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}
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
                <Label htmlFor="add-color">Color</Label>
                <Input
                  id="add-color"
                  value={newColor}
                  onChange={(e) => setNewColor(e.target.value)}
                  placeholder="e.g., Red, Blue, White..."
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="add-cost">Cost/Unit ($)</Label>
                <Input
                  id="add-cost"
                  type="number"
                  min="0"
                  step="0.01"
                  value={newCostPerUnit}
                  onChange={(e) => {
                    setNewCostPerUnit(e.target.value);
                    // If manually editing cost and we have a price, recalculate markup
                    if (newPricePerUnit) {
                      const cost = parseFloat(e.target.value) || 0;
                      const price = parseFloat(newPricePerUnit) || 0;
                      if (cost > 0 && price > 0) {
                        const markup = ((price - cost) / cost) * 100;
                        setNewMarkup(markup.toFixed(1));
                      }
                    }
                  }}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="add-price">Price/Unit ($) {newPricePerUnit && <span className="text-xs text-muted-foreground">(from Zoho Books)</span>}</Label>
                <Input
                  id="add-price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={newPricePerUnit}
                  onChange={(e) => {
                    setNewPricePerUnit(e.target.value);
                    // Recalculate markup when price changes
                    if (newCostPerUnit) {
                      const cost = parseFloat(newCostPerUnit) || 0;
                      const price = parseFloat(e.target.value) || 0;
                      if (cost > 0 && price > 0) {
                        const markup = ((price - cost) / cost) * 100;
                        setNewMarkup(markup.toFixed(1));
                      }
                    }
                  }}
                  placeholder="0.00"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="add-markup">Markup (%) {newPricePerUnit && <span className="text-xs text-muted-foreground">(calculated from Zoho Books prices - reference only)</span>}</Label>
              <Input
                id="add-markup"
                type="number"
                min="0"
                step="0.1"
                value={newMarkup}
                onChange={(e) => {
                  setNewMarkup(e.target.value);
                  // If manually changing markup and no catalog price, calculate new price
                  if (!newPricePerUnit && newCostPerUnit) {
                    const cost = parseFloat(newCostPerUnit) || 0;
                    const markup = parseFloat(e.target.value) || 0;
                    if (cost > 0) {
                      const price = cost * (1 + markup / 100);
                      setNewPricePerUnit(price.toFixed(2));
                    }
                  }
                }}
                placeholder="Enter markup %"
              />
              {newPricePerUnit && (
                <p className="text-xs text-blue-600">
                  💡 Price is from Zoho Books. Markup shown for reference only.
                </p>
              )}
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
                <h4 className="font-semibold text-green-900">
                  Price Preview {newPricePerUnit && <span className="text-xs font-normal text-muted-foreground">(Using Zoho Books Prices)</span>}
                </h4>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-muted-foreground">Cost/Unit:</span>
                    <span className="ml-2 font-semibold">${parseFloat(newCostPerUnit).toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Price/Unit:</span>
                    <span className="ml-2 font-semibold text-green-700">
                      ${newPricePerUnit 
                        ? parseFloat(newPricePerUnit).toFixed(2)
                        : (parseFloat(newCostPerUnit) * (1 + (parseFloat(newMarkup) || 0) / 100)).toFixed(2)
                      }
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
                      ${newPricePerUnit
                        ? (parseFloat(newPricePerUnit) * parseFloat(newQuantity)).toFixed(2)
                        : (parseFloat(newCostPerUnit) * parseFloat(newQuantity) * (1 + (parseFloat(newMarkup) || 0) / 100)).toFixed(2)
                      }
                    </span>
                  </div>
                  {newMarkup && (
                    <div className="col-span-2 pt-2 border-t border-green-300">
                      <span className="text-muted-foreground">Markup:</span>
                      <span className="ml-2 font-semibold text-green-700">
                        {parseFloat(newMarkup).toFixed(1)}%
                        {newPricePerUnit && <span className="text-xs text-muted-foreground ml-1">(from Zoho Books)</span>}
                      </span>
                    </div>
                  )}
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

      {/* Add Sheet Dialog */}
      <Dialog open={showAddSheetDialog} onOpenChange={setShowAddSheetDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5" />
              Add New Sheet
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="sheet-name">Sheet Name *</Label>
              <Input
                id="sheet-name"
                value={newSheetName}
                onChange={(e) => setNewSheetName(e.target.value)}
                placeholder="e.g., Porch, Garage, Interior..."
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !addingSheet && newSheetName.trim()) {
                    addNewSheet();
                  }
                }}
              />
            </div>

            <div className="flex gap-3 pt-4 border-t">
              <Button
                onClick={addNewSheet}
                disabled={addingSheet || !newSheetName.trim()}
                className="flex-1"
              >
                {addingSheet ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    Adding...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Sheet
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowAddSheetDialog(false);
                  setNewSheetName('');
                }}
                disabled={addingSheet}
              >
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

      {/* Zoho Order Confirmation Dialog */}
      <ZohoOrderConfirmationDialog
        open={showZohoOrderDialog}
        onOpenChange={setShowZohoOrderDialog}
        jobName={job.name}
        materials={selectedMaterialsForOrder}
      />

      {/* Bulk Move Materials Dialog */}
      <Dialog open={showBulkMoveDialog} onOpenChange={setShowBulkMoveDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Move {selectedMaterialsForMove.size} Material{selectedMaterialsForMove.size !== 1 ? 's' : ''}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Move selected materials to a different sheet and category
            </p>

            <div className="space-y-2">
              <Label htmlFor="bulk-move-sheet">Target Sheet *</Label>
              <Select value={bulkMoveTargetSheetId} onValueChange={setBulkMoveTargetSheetId}>
                <SelectTrigger id="bulk-move-sheet">
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
              <Label htmlFor="bulk-move-category">Target Category *</Label>
              <Select value={bulkMoveTargetCategory} onValueChange={setBulkMoveTargetCategory}>
                <SelectTrigger id="bulk-move-category">
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
                value={bulkMoveTargetCategory}
                onChange={(e) => setBulkMoveTargetCategory(e.target.value)}
                placeholder="Or type new category name"
                className="mt-2"
              />
            </div>

            <div className="bg-orange-50 border border-orange-200 rounded p-3">
              <p className="text-sm font-semibold text-orange-900">
                {selectedMaterialsForMove.size} material{selectedMaterialsForMove.size !== 1 ? 's' : ''} will be moved
              </p>
            </div>

            <div className="flex gap-3 pt-4 border-t">
              <Button
                onClick={bulkMoveMaterials}
                disabled={movingBulkMaterials || !bulkMoveTargetSheetId || !bulkMoveTargetCategory.trim()}
                className="flex-1"
              >
                {movingBulkMaterials ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    Moving...
                  </>
                ) : (
                  <>
                    <MoveHorizontal className="w-4 h-4 mr-2" />
                    Move Materials
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowBulkMoveDialog(false)}
                disabled={movingBulkMaterials}
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Floating Document Viewer */}
      <FloatingDocumentViewer
        jobId={job.id}
        open={showDocumentViewer}
        onClose={() => setShowDocumentViewer(false)}
      />

      {/* Zoho Sync Results Dialog */}
      <Dialog open={showSyncResults} onOpenChange={setShowSyncResults}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="w-6 h-6 text-green-600" />
              Zoho Books Sync Complete
            </DialogTitle>
          </DialogHeader>
          
          {syncResults && (
            <div className="space-y-4">
              {/* Summary Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-blue-50 border-2 border-blue-300 rounded-lg p-4">
                  <div className="text-xs font-semibold text-muted-foreground mb-1">Total Synced</div>
                  <div className="text-2xl font-bold text-blue-700">{syncResults.itemsSynced || 0}</div>
                </div>
                <div className="bg-green-50 border-2 border-green-300 rounded-lg p-4">
                  <div className="text-xs font-semibold text-muted-foreground mb-1">New Materials</div>
                  <div className="text-2xl font-bold text-green-700">{syncResults.itemsInserted || 0}</div>
                </div>
                <div className="bg-orange-50 border-2 border-orange-300 rounded-lg p-4">
                  <div className="text-xs font-semibold text-muted-foreground mb-1">Updated</div>
                  <div className="text-2xl font-bold text-orange-700">{syncResults.itemsUpdated || 0}</div>
                </div>
                <div className="bg-slate-50 border-2 border-slate-300 rounded-lg p-4">
                  <div className="text-xs font-semibold text-muted-foreground mb-1">Skipped</div>
                  <div className="text-2xl font-bold text-slate-700">{syncResults.itemsSkipped || 0}</div>
                </div>
              </div>

              {/* Success Message */}
              {syncResults.message && (
                <div className="bg-green-50 border-2 border-green-300 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <h4 className="font-semibold text-green-900 mb-1">Sync Summary</h4>
                      <p className="text-sm text-green-800">{syncResults.message}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Skipped Items Warning */}
              {syncResults.skippedItems && syncResults.skippedItems.length > 0 && (
                <div className="bg-yellow-50 border-2 border-yellow-300 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <h4 className="font-semibold text-yellow-900 mb-2">Skipped Materials (No SKU)</h4>
                      <p className="text-sm text-yellow-800 mb-3">
                        The following {syncResults.skippedItems.length} material{syncResults.skippedItems.length !== 1 ? 's were' : ' was'} skipped because they don't have a valid SKU in Zoho Books:
                      </p>
                      <div className="bg-white rounded border border-yellow-200 p-3 max-h-40 overflow-y-auto">
                        <ul className="text-sm space-y-1">
                          {syncResults.skippedItems.slice(0, 20).map((item: string, idx: number) => (
                            <li key={idx} className="flex items-center gap-2">
                              <X className="w-3 h-3 text-yellow-600 flex-shrink-0" />
                              <span className="text-yellow-900">{item}</span>
                            </li>
                          ))}
                          {syncResults.skippedItems.length > 20 && (
                            <li className="text-xs text-yellow-700 pt-2 border-t border-yellow-200">
                              ... and {syncResults.skippedItems.length - 20} more
                            </li>
                          )}
                        </ul>
                      </div>
                      <p className="text-xs text-yellow-700 mt-2">
                        💡 To sync these materials, add SKUs to them in Zoho Books and run the sync again.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* What Changed */}
              <div className="border-2 rounded-lg p-4">
                <h4 className="font-semibold text-slate-900 mb-3">What Changed?</h4>
                <div className="space-y-2 text-sm">
                  {syncResults.itemsInserted > 0 && (
                    <div className="flex items-center gap-2 text-green-700">
                      <CheckCircle className="w-4 h-4" />
                      <span><strong>{syncResults.itemsInserted}</strong> new material{syncResults.itemsInserted !== 1 ? 's' : ''} added to catalog</span>
                    </div>
                  )}
                  {syncResults.itemsUpdated > 0 && (
                    <div className="flex items-start gap-2 text-orange-700">
                      <RefreshCw className="w-4 h-4 mt-0.5 flex-shrink-0" />
                      <div>
                        <div><strong>{syncResults.itemsUpdated}</strong> material{syncResults.itemsUpdated !== 1 ? 's' : ''} updated with latest Zoho Books data</div>
                        <div className="text-xs text-orange-600 mt-1">
                          ℹ️ Updated fields: Name, Category, Prices (unit_price, purchase_cost), Length/Unit, and Metadata
                        </div>
                      </div>
                    </div>
                  )}
                  {syncResults.vendorsSynced > 0 && (
                    <div className="flex items-center gap-2 text-blue-700">
                      <CheckCircle className="w-4 h-4" />
                      <span><strong>{syncResults.vendorsSynced}</strong> vendor{syncResults.vendorsSynced !== 1 ? 's' : ''} synced</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Info Box */}
              <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <FileText className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                  <div className="text-sm text-blue-900">
                    <h5 className="font-semibold mb-1">Zoho Books is Now the Source of Truth</h5>
                    <p className="text-blue-800">
                      All material information (names, categories, prices, SKUs) has been updated to match Zoho Books. 
                      Any price changes or material updates in Zoho Books will be reflected here after syncing.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-4 border-t">
                <Button onClick={() => setShowSyncResults(false)}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
