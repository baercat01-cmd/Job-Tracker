import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Upload,
  FileSpreadsheet,
  Lock,
  LockOpen,
  Eye,
  Edit,
  Trash2,
  Plus,
  AlertCircle,
  CheckCircle,
  ShoppingCart,
  Clock,
  DollarSign,
  Search,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { parseExcelWorkbook, validateMaterialWorkbook, normalizeColumnName, parseNumericValue, parsePercentValue } from '@/lib/excel-parser';
import { CrewMaterialProcessing } from './CrewMaterialProcessing';

interface MaterialWorkbook {
  id: string;
  job_id: string;
  version_number: number;
  status: 'working' | 'locked';
  locked_at: string | null;
  locked_by: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface MaterialSheet {
  id: string;
  workbook_id: string;
  sheet_name: string;
  order_index: number;
  created_at: string;
}

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
  created_at: string;
  updated_at: string;
}

interface SheetLabor {
  id: string;
  sheet_id: string;
  description: string;
  estimated_hours: number;
  hourly_rate: number;
  total_labor_cost: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface MaterialWorkbookManagerProps {
  jobId: string;
}

export function MaterialWorkbookManager({ jobId }: MaterialWorkbookManagerProps) {
  const { profile } = useAuth();
  const [workbooks, setWorkbooks] = useState<MaterialWorkbook[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [viewingWorkbook, setViewingWorkbook] = useState<MaterialWorkbook | null>(null);
  const [sheets, setSheets] = useState<MaterialSheet[]>([]);
  const [items, setItems] = useState<MaterialItem[]>([]);
  const [sheetLabor, setSheetLabor] = useState<Record<string, SheetLabor | null>>({});
  const [showLaborDialog, setShowLaborDialog] = useState(false);
  const [editingSheetId, setEditingSheetId] = useState<string | null>(null);
  const [laborForm, setLaborForm] = useState({
    description: 'Labor & Installation',
    estimated_hours: 0,
    hourly_rate: 60,
    notes: '',
  });

  // Materials catalog search state
  const [showMaterialSearchDialog, setShowMaterialSearchDialog] = useState(false);
  const [catalogMaterials, setCatalogMaterials] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchCategory, setSearchCategory] = useState<string>('all');
  const [categories, setCategories] = useState<string[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [selectedSheet, setSelectedSheet] = useState<MaterialSheet | null>(null);
  const [addingMaterials, setAddingMaterials] = useState<Set<string>>(new Set());

  // Sheet management state
  const [showAddSheetDialog, setShowAddSheetDialog] = useState(false);
  const [newSheetName, setNewSheetName] = useState('');
  const [addingSheet, setAddingSheet] = useState(false);

  // Manual material entry state
  const [showManualMaterialDialog, setShowManualMaterialDialog] = useState(false);
  const [manualMaterialForm, setManualMaterialForm] = useState({
    category: '',
    usage: '',
    sku: '',
    material_name: '',
    quantity: 1,
    length: '',
    color: '',
    cost_per_unit: 0,
    markup_percent: 0,
    price_per_unit: 0,
    notes: '',
  });
  const [savingManualMaterial, setSavingManualMaterial] = useState(false);

  useEffect(() => {
    loadWorkbooks();
  }, [jobId]);

  async function loadWorkbooks() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('material_workbooks')
        .select('*')
        .eq('job_id', jobId)
        .order('version_number', { ascending: false });

      if (error) throw error;
      setWorkbooks(data || []);
    } catch (error: any) {
      console.error('Error loading workbooks:', error);
      toast.error('Failed to load workbooks');
    } finally {
      setLoading(false);
    }
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const validExtensions = ['.xlsx', '.xls'];
    const hasValidExtension = validExtensions.some(ext => file.name.toLowerCase().endsWith(ext));
    
    if (!hasValidExtension) {
      toast.error('Please upload an Excel file (.xlsx or .xls)');
      return;
    }

    setSelectedFile(file);
  }

  async function uploadWorkbook() {
    if (!selectedFile || !profile) {
      toast.error('Please select a file');
      return;
    }

    try {
      setUploading(true);
      toast.info('Parsing Excel file...');

      // Parse the CSV file
      const workbook = await parseExcelWorkbook(selectedFile);

      // Validate structure
      const validation = validateMaterialWorkbook(workbook);
      if (!validation.valid) {
        toast.error('Invalid workbook structure');
        validation.errors.forEach(error => toast.error(error));
        return;
      }

      toast.info(`Found ${workbook.sheets.length} sheets. Uploading...`);

      // Get next version number
      const { data: latestVersion } = await supabase
        .from('material_workbooks')
        .select('version_number')
        .eq('job_id', jobId)
        .order('version_number', { ascending: false })
        .limit(1)
        .maybeSingle();

      const nextVersion = (latestVersion?.version_number || 0) + 1;

      // Create workbook record
      const { data: newWorkbook, error: workbookError } = await supabase
        .from('material_workbooks')
        .insert({
          job_id: jobId,
          version_number: nextVersion,
          status: 'working',
          created_by: profile.id,
        })
        .select()
        .single();

      if (workbookError) throw workbookError;

      // Insert sheets and items
      let totalItems = 0;

      for (let sheetIndex = 0; sheetIndex < workbook.sheets.length; sheetIndex++) {
        const sheet = workbook.sheets[sheetIndex];

        // Create sheet record
        const { data: newSheet, error: sheetError } = await supabase
          .from('material_sheets')
          .insert({
            workbook_id: newWorkbook.id,
            sheet_name: sheet.name,
            order_index: sheetIndex,
          })
          .select()
          .single();

        if (sheetError) throw sheetError;

        // Group rows by category
        const categories = new Map<string, any[]>();

        sheet.rows.forEach((row, rowIndex) => {
          const category = String(row['Category'] || row['category'] || 'Uncategorized').trim();
          
          if (!categories.has(category)) {
            categories.set(category, []);
          }
          
          categories.get(category)!.push({ ...row, originalIndex: rowIndex });
        });

        // Insert items for each category
        let itemIndex = 0;

        for (const [category, categoryRows] of categories) {
          for (const row of categoryRows) {
            const item = {
              sheet_id: newSheet.id,
              category,
              usage: String(row['Usage'] || row['usage'] || '').trim() || null,
              sku: String(row['Sku'] || row['sku'] || row['SKU'] || '').trim() || null,
              material_name: String(row['Material'] || row['material'] || '').trim(),
              quantity: parseNumericValue(row['Qty'] || row['qty'] || row['Quantity']) || 0,
              length: String(row['Length'] || row['length'] || '').trim() || null,
              color: String(row['Color'] || row['color'] || '').trim() || null,
              cost_per_unit: parseNumericValue(row['Cost per unit'] || row['cost_per_unit']),
              markup_percent: parsePercentValue(row['CF.Mark Up'] || row['CF. Mark Up'] || row['Markup']),
              price_per_unit: parseNumericValue(row['Price per unit'] || row['price_per_unit']),
              extended_cost: parseNumericValue(row['Extended cost'] || row['extended_cost']),
              extended_price: parseNumericValue(row['Extended price'] || row['extended_price']),
              taxable: true, // All materials are taxable by default (only labor is not taxed)
              notes: null,
              order_index: itemIndex++,
            };

            const { error: itemError } = await supabase
              .from('material_items')
              .insert(item);

            if (itemError) {
              console.error('Error inserting item:', itemError, item);
              throw itemError;
            }

            totalItems++;
          }
        }
      }

      toast.success(`Uploaded ${workbook.sheets.length} sheets with ${totalItems} items`);
      setShowUploadDialog(false);
      setSelectedFile(null);
      await loadWorkbooks();
    } catch (error: any) {
      console.error('Error uploading workbook:', error);
      toast.error('Failed to upload workbook: ' + error.message);
    } finally {
      setUploading(false);
    }
  }

  async function lockWorkbook(workbookId: string) {
    if (!confirm('Lock this version? You won\'t be able to edit it after locking.')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('material_workbooks')
        .update({
          status: 'locked',
          locked_at: new Date().toISOString(),
          locked_by: profile?.id,
        })
        .eq('id', workbookId);

      if (error) throw error;

      toast.success('Workbook locked');
      await loadWorkbooks();
    } catch (error: any) {
      console.error('Error locking workbook:', error);
      toast.error('Failed to lock workbook');
    }
  }

  async function deleteWorkbook(workbookId: string) {
    if (!confirm('Delete this entire workbook? This cannot be undone.')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('material_workbooks')
        .delete()
        .eq('id', workbookId);

      if (error) throw error;

      toast.success('Workbook deleted');
      await loadWorkbooks();
    } catch (error: any) {
      console.error('Error deleting workbook:', error);
      toast.error('Failed to delete workbook');
    }
  }

  async function viewWorkbook(workbook: MaterialWorkbook) {
    try {
      setViewingWorkbook(workbook);

      // Load sheets
      const { data: sheetsData, error: sheetsError } = await supabase
        .from('material_sheets')
        .select('*')
        .eq('workbook_id', workbook.id)
        .order('order_index');

      if (sheetsError) throw sheetsError;
      setSheets(sheetsData || []);

      // Load labor for all sheets
      if (sheetsData && sheetsData.length > 0) {
        const sheetIds = sheetsData.map(s => s.id);
        const { data: laborData, error: laborError } = await supabase
          .from('material_sheet_labor')
          .select('*')
          .in('sheet_id', sheetIds);

        if (laborError) throw laborError;

        // Create map of sheet_id to labor data
        const laborMap: Record<string, SheetLabor | null> = {};
        sheetsData.forEach(sheet => {
          const labor = laborData?.find(l => l.sheet_id === sheet.id);
          laborMap[sheet.id] = labor || null;
        });
        setSheetLabor(laborMap);

        // Load items for first sheet
        const { data: itemsData, error: itemsError } = await supabase
          .from('material_items')
          .select('*')
          .eq('sheet_id', sheetsData[0].id)
          .order('order_index');

        if (itemsError) throw itemsError;
        setItems(itemsData || []);
      }
    } catch (error: any) {
      console.error('Error viewing workbook:', error);
      toast.error('Failed to load workbook details');
    }
  }

  function openLaborDialog(sheetId: string) {
    const existingLabor = sheetLabor[sheetId];
    setEditingSheetId(sheetId);
    
    if (existingLabor) {
      setLaborForm({
        description: existingLabor.description,
        estimated_hours: existingLabor.estimated_hours,
        hourly_rate: existingLabor.hourly_rate,
        notes: existingLabor.notes || '',
      });
    } else {
      setLaborForm({
        description: 'Labor & Installation',
        estimated_hours: 0,
        hourly_rate: 60,
        notes: '',
      });
    }
    
    setShowLaborDialog(true);
  }

  async function saveSheetLabor() {
    if (!editingSheetId) return;

    const existingLabor = sheetLabor[editingSheetId];
    const laborData = {
      sheet_id: editingSheetId,
      description: laborForm.description,
      estimated_hours: laborForm.estimated_hours,
      hourly_rate: laborForm.hourly_rate,
      notes: laborForm.notes || null,
    };

    try {
      if (existingLabor) {
        const { error } = await supabase
          .from('material_sheet_labor')
          .update(laborData)
          .eq('id', existingLabor.id);

        if (error) throw error;
        toast.success('Labor updated');
      } else {
        const { error } = await supabase
          .from('material_sheet_labor')
          .insert([laborData]);

        if (error) throw error;
        toast.success('Labor added');
      }

      setShowLaborDialog(false);
      if (viewingWorkbook) {
        await viewWorkbook(viewingWorkbook);
      }
    } catch (error: any) {
      console.error('Error saving labor:', error);
      toast.error('Failed to save labor');
    }
  }

  async function deleteSheetLabor(laborId: string) {
    if (!confirm('Delete labor for this section?')) return;

    try {
      const { error } = await supabase
        .from('material_sheet_labor')
        .delete()
        .eq('id', laborId);

      if (error) throw error;
      toast.success('Labor deleted');
      
      if (viewingWorkbook) {
        await viewWorkbook(viewingWorkbook);
      }
    } catch (error: any) {
      console.error('Error deleting labor:', error);
      toast.error('Failed to delete labor');
    }
  }

  async function addNewSheet() {
    if (!viewingWorkbook || viewingWorkbook.status === 'locked') {
      toast.error('Cannot add sheets to a locked workbook');
      return;
    }

    if (!newSheetName.trim()) {
      toast.error('Please enter a sheet name');
      return;
    }

    setAddingSheet(true);

    try {
      // Get next order index
      const maxOrderIndex = Math.max(...sheets.map(s => s.order_index), -1);

      // Create new sheet
      const { data: newSheet, error } = await supabase
        .from('material_sheets')
        .insert({
          workbook_id: viewingWorkbook.id,
          sheet_name: newSheetName.trim(),
          order_index: maxOrderIndex + 1,
        })
        .select()
        .single();

      if (error) throw error;

      toast.success(`Sheet "${newSheetName}" added successfully`);
      setShowAddSheetDialog(false);
      setNewSheetName('');
      
      // Refresh workbook view
      await viewWorkbook(viewingWorkbook);
    } catch (error: any) {
      console.error('Error adding sheet:', error);
      toast.error('Failed to add sheet');
    } finally {
      setAddingSheet(false);
    }
  }

  async function deleteSheet(sheet: MaterialSheet) {
    if (!viewingWorkbook || viewingWorkbook.status === 'locked') {
      toast.error('Cannot delete sheets from a locked workbook');
      return;
    }

    if (sheets.length === 1) {
      toast.error('Cannot delete the last sheet. Workbooks must have at least one sheet.');
      return;
    }

    if (!confirm(`Delete sheet "${sheet.sheet_name}"? This will also delete all materials in this sheet.`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('material_sheets')
        .delete()
        .eq('id', sheet.id);

      if (error) throw error;

      toast.success(`Sheet "${sheet.sheet_name}" deleted`);
      
      // Refresh workbook view
      await viewWorkbook(viewingWorkbook);
    } catch (error: any) {
      console.error('Error deleting sheet:', error);
      toast.error('Failed to delete sheet');
    }
  }

  async function openMaterialSearch(sheet: MaterialSheet) {
    setSelectedSheet(sheet);
    setSearchQuery('');
    setSearchCategory('all');
    setShowMaterialSearchDialog(true);
    await loadCatalogMaterials();
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
      setCategories(uniqueCategories.sort());
    } catch (error: any) {
      console.error('Error loading catalog:', error);
      toast.error('Failed to load materials catalog');
    } finally {
      setLoadingCatalog(false);
    }
  }

  async function addMaterialToSheet(catalogItem: any) {
    if (!selectedSheet || !viewingWorkbook || viewingWorkbook.status === 'locked') {
      toast.error('Cannot add materials to a locked workbook');
      return;
    }

    setAddingMaterials(prev => new Set(prev).add(catalogItem.sku));

    try {
      // Get the highest order_index for the sheet
      const { data: existingItems } = await supabase
        .from('material_items')
        .select('order_index')
        .eq('sheet_id', selectedSheet.id)
        .order('order_index', { ascending: false })
        .limit(1);

      const nextOrderIndex = (existingItems?.[0]?.order_index ?? -1) + 1;

      // Create new material item from catalog
      const newItem = {
        sheet_id: selectedSheet.id,
        category: catalogItem.category || 'Uncategorized',
        usage: null,
        sku: catalogItem.sku,
        material_name: catalogItem.material_name,
        quantity: 1, // Default quantity
        length: catalogItem.part_length || null,
        color: null,
        cost_per_unit: catalogItem.purchase_cost || null,
        markup_percent: null,
        price_per_unit: catalogItem.unit_price || null,
        extended_cost: catalogItem.purchase_cost || null,
        extended_price: catalogItem.unit_price || null,
        taxable: true,
        notes: null,
        order_index: nextOrderIndex,
      };

      const { error } = await supabase
        .from('material_items')
        .insert(newItem);

      if (error) throw error;

      toast.success(`Added ${catalogItem.material_name} to ${selectedSheet.sheet_name}`);
      
      // Refresh items for current sheet
      const { data: refreshedItems } = await supabase
        .from('material_items')
        .select('*')
        .eq('sheet_id', selectedSheet.id)
        .order('order_index');

      if (refreshedItems) {
        setItems(refreshedItems);
      }
    } catch (error: any) {
      console.error('Error adding material:', error);
      toast.error('Failed to add material to sheet');
    } finally {
      setAddingMaterials(prev => {
        const newSet = new Set(prev);
        newSet.delete(catalogItem.sku);
        return newSet;
      });
    }
  }

  function openManualMaterialDialog(sheet: MaterialSheet) {
    setSelectedSheet(sheet);
    setManualMaterialForm({
      category: '',
      usage: '',
      sku: '',
      material_name: '',
      quantity: 1,
      length: '',
      color: '',
      cost_per_unit: 0,
      markup_percent: 0,
      price_per_unit: 0,
      notes: '',
    });
    setShowManualMaterialDialog(true);
  }

  async function saveManualMaterial() {
    if (!selectedSheet || !viewingWorkbook || viewingWorkbook.status === 'locked') {
      toast.error('Cannot add materials to a locked workbook');
      return;
    }

    if (!manualMaterialForm.material_name.trim()) {
      toast.error('Material name is required');
      return;
    }

    if (!manualMaterialForm.category.trim()) {
      toast.error('Category is required');
      return;
    }

    setSavingManualMaterial(true);

    try {
      // Get the highest order_index for the sheet
      const { data: existingItems } = await supabase
        .from('material_items')
        .select('order_index')
        .eq('sheet_id', selectedSheet.id)
        .order('order_index', { ascending: false })
        .limit(1);

      const nextOrderIndex = (existingItems?.[0]?.order_index ?? -1) + 1;

      // Calculate extended costs and prices
      const extendedCost = manualMaterialForm.cost_per_unit * manualMaterialForm.quantity;
      const extendedPrice = manualMaterialForm.price_per_unit * manualMaterialForm.quantity;

      // Create new material item
      const newItem = {
        sheet_id: selectedSheet.id,
        category: manualMaterialForm.category.trim(),
        usage: manualMaterialForm.usage.trim() || null,
        sku: manualMaterialForm.sku.trim() || null,
        material_name: manualMaterialForm.material_name.trim(),
        quantity: manualMaterialForm.quantity,
        length: manualMaterialForm.length.trim() || null,
        color: manualMaterialForm.color.trim() || null,
        cost_per_unit: manualMaterialForm.cost_per_unit || null,
        markup_percent: manualMaterialForm.markup_percent || null,
        price_per_unit: manualMaterialForm.price_per_unit || null,
        extended_cost: extendedCost || null,
        extended_price: extendedPrice || null,
        taxable: true,
        notes: manualMaterialForm.notes.trim() || null,
        order_index: nextOrderIndex,
      };

      const { error } = await supabase
        .from('material_items')
        .insert(newItem);

      if (error) throw error;

      toast.success(`Added ${manualMaterialForm.material_name} to ${selectedSheet.sheet_name}`);
      setShowManualMaterialDialog(false);
      
      // Refresh items for current sheet
      const { data: refreshedItems } = await supabase
        .from('material_items')
        .select('*')
        .eq('sheet_id', selectedSheet.id)
        .order('order_index');

      if (refreshedItems) {
        setItems(refreshedItems);
      }
    } catch (error: any) {
      console.error('Error adding manual material:', error);
      toast.error('Failed to add material');
    } finally {
      setSavingManualMaterial(false);
    }
  }

  const filteredCatalogMaterials = catalogMaterials.filter(material => {
    const matchesSearch = searchQuery === '' || 
      material.material_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      material.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (material.category && material.category.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesCategory = searchCategory === 'all' || material.category === searchCategory;
    
    return matchesSearch && matchesCategory;
  });

  const workingVersion = workbooks.find(w => w.status === 'working');
  const lockedVersions = workbooks.filter(w => w.status === 'locked');

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-sm text-muted-foreground">Loading material workbooks...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Material Management</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Manage material workbooks and process crew material requests
          </p>
        </div>
        <Button onClick={() => setShowUploadDialog(true)} className="gradient-primary">
          <Upload className="w-4 h-4 mr-2" />
          Upload Workbook
        </Button>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="workbooks" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="workbooks" className="flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4" />
            Material Workbooks
          </TabsTrigger>
          <TabsTrigger value="crew-orders" className="flex items-center gap-2">
            <ShoppingCart className="w-4 h-4" />
            Crew Orders
          </TabsTrigger>
        </TabsList>

        <TabsContent value="workbooks" className="space-y-4">
          {/* Working Version */}
          {workingVersion && (
            <Card className="border-2 border-green-500">
              <CardHeader className="bg-green-50">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <LockOpen className="w-5 h-5 text-green-600" />
                    Working Version (v{workingVersion.version_number})
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => viewWorkbook(workingVersion)}
                    >
                      <Eye className="w-4 h-4 mr-1" />
                      View
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => lockWorkbook(workingVersion.id)}
                      className="bg-amber-600 hover:bg-amber-700"
                    >
                      <Lock className="w-4 h-4 mr-1" />
                      Lock Version
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => deleteWorkbook(workingVersion.id)}
                      className="text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="flex items-center gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Created:</span>{' '}
                    {new Date(workingVersion.created_at).toLocaleDateString()}
                  </div>
                  <Badge variant="outline" className="bg-green-100 text-green-800">
                    Quoting Mode - Editable
                  </Badge>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Locked Versions */}
          {lockedVersions.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-lg font-semibold">Locked Versions</h3>
              <div className="grid gap-2">
                {lockedVersions.map((workbook) => (
                  <Card key={workbook.id} className="border-2 border-slate-300">
                    <CardContent className="py-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Lock className="w-5 h-5 text-slate-600" />
                          <div>
                            <p className="font-semibold">Version {workbook.version_number}</p>
                            <p className="text-xs text-muted-foreground">
                              Locked on {new Date(workbook.locked_at!).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => viewWorkbook(workbook)}
                          >
                            <Eye className="w-4 h-4 mr-1" />
                            View
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => deleteWorkbook(workbook.id)}
                            className="text-destructive"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* No Workbooks */}
          {workbooks.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center">
                <FileSpreadsheet className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                <h3 className="text-lg font-semibold mb-2">No Material Workbooks Yet</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Upload your first Excel workbook to get started with versioned material tracking
                </p>
                <Button onClick={() => setShowUploadDialog(true)} className="gradient-primary">
                  <Upload className="w-4 h-4 mr-2" />
                  Upload First Workbook
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="crew-orders">
          <CrewMaterialProcessing jobId={jobId} />
        </TabsContent>
      </Tabs>

      {/* Upload Dialog */}
      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Upload Material Workbook</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
              <p className="font-semibold text-sm flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                Expected Excel Structure:
              </p>
              <ul className="text-sm space-y-1 ml-6 list-disc">
                <li>Upload entire Excel workbook (.xlsx) with multiple sheets</li>
                <li>Each sheet = one section (e.g., "Main Building", "Porch", "Interior")</li>
                <li>Required columns: <strong>Category, Material, Qty</strong></li>
                <li>Optional columns: Usage, SKU, Length, Color, Cost per unit, CF.Mark Up, Price per unit, Extended cost, Extended price, Taxable</li>
              </ul>
            </div>

            <div className="space-y-2">
              <Label htmlFor="workbook-file">Excel File (.xlsx)</Label>
              <Input
                id="workbook-file"
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileSelect}
                disabled={uploading}
              />
              {selectedFile && (
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  Selected: {selectedFile.name}
                </p>
              )}
            </div>

            <div className="flex gap-3 pt-4 border-t">
              <Button
                onClick={uploadWorkbook}
                disabled={!selectedFile || uploading}
                className="flex-1"
              >
                {uploading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    Upload Workbook
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowUploadDialog(false);
                  setSelectedFile(null);
                }}
                disabled={uploading}
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* View Dialog */}
      {viewingWorkbook && (
        <Dialog open={!!viewingWorkbook} onOpenChange={() => setViewingWorkbook(null)}>
          <DialogContent className="sm:max-w-6xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                Version {viewingWorkbook.version_number} - {viewingWorkbook.status === 'working' ? 'Working' : 'Locked'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {/* Info Banner for Working Workbooks */}
              {viewingWorkbook.status === 'working' && (
                <div className="bg-blue-50 border-2 border-blue-300 rounded-lg p-4">
                  <div className="flex items-center gap-3">
                    <div className="bg-blue-600 text-white p-2 rounded-full">
                      <Edit className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-blue-900">Working Version - Full Edit Mode</h3>
                      <p className="text-sm text-blue-700 mt-1">
                        You can add/delete sheets, add materials from catalog, and edit all content in this workbook.
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3 mt-3">
                    <div className="bg-white rounded-lg p-3 border border-blue-200">
                      <div className="flex items-center gap-2 text-blue-700 font-medium text-sm">
                        <Plus className="w-4 h-4" />
                        Add Sheet
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">Click "Add Sheet" button below</p>
                    </div>
                    <div className="bg-white rounded-lg p-3 border border-blue-200">
                      <div className="flex items-center gap-2 text-blue-700 font-medium text-sm">
                        <X className="w-4 h-4" />
                        Delete Sheet
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">Hover over sheet tabs to delete</p>
                    </div>
                    <div className="bg-white rounded-lg p-3 border border-blue-200">
                      <div className="flex items-center gap-2 text-blue-700 font-medium text-sm">
                        <Search className="w-4 h-4" />
                        Add Materials
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">Use "Add from Catalog" button</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Sheet Tabs with Labor Indicators and Add Material Button */}
              <div className="flex items-center justify-between gap-4">
                <div className="flex gap-2 flex-wrap flex-1">
                  {sheets.map((sheet) => {
                    const hasLabor = sheetLabor[sheet.id];
                    const isCurrentSheet = items.length > 0 && items[0]?.sheet_id === sheet.id;
                    return (
                      <div key={sheet.id} className="relative group">
                        <Button
                          variant={isCurrentSheet ? "default" : "outline"}
                          size="sm"
                          onClick={async () => {
                            const { data, error } = await supabase
                              .from('material_items')
                              .select('*')
                              .eq('sheet_id', sheet.id)
                              .order('order_index');
                            if (!error) setItems(data || []);
                          }}
                          className="pr-8"
                        >
                          {sheet.sheet_name}
                        </Button>
                        {hasLabor && (
                          <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-white" />
                        )}
                        {/* Delete Sheet Button - only show for working versions */}
                        {viewingWorkbook?.status === 'working' && (
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
                    );
                  })}
                  
                  {/* Add Sheet Button - only show for working versions */}
                  {viewingWorkbook?.status === 'working' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowAddSheetDialog(true)}
                      className="border-2 border-dashed border-blue-400 bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold"
                    >
                      <Plus className="w-5 h-5 mr-1" />
                      Add Sheet
                    </Button>
                  )}
                </div>
                
                {/* Add Material Buttons */}
                <div className="flex gap-2">
                  {viewingWorkbook.status === 'working' && items.length > 0 && sheets.length > 0 && (() => {
                    const currentSheet = sheets.find(s => items[0]?.sheet_id === s.id);
                    if (!currentSheet) return null;
                    
                    return (
                      <>
                        <Button
                          size="default"
                          onClick={() => openManualMaterialDialog(currentSheet)}
                          className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold shadow-lg"
                        >
                          <Plus className="w-5 h-5 mr-2" />
                          Add Manual Material
                        </Button>
                        <Button
                          size="default"
                          onClick={() => openMaterialSearch(currentSheet)}
                          className="bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700 text-white font-semibold shadow-lg"
                        >
                          <Search className="w-5 h-5 mr-2" />
                          Search Catalog
                        </Button>
                      </>
                    );
                  })()}
                </div>
              </div>

              {items.length > 0 && (
                <div className="space-y-4">
                  {/* Materials Table */}
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Category</TableHead>
                          <TableHead>Material</TableHead>
                          <TableHead className="text-right">Qty</TableHead>
                          <TableHead>Length</TableHead>
                          <TableHead>Color</TableHead>
                          <TableHead className="text-right">Cost/Unit</TableHead>
                          <TableHead className="text-right">Ext. Cost</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {items.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell className="font-medium">{item.category}</TableCell>
                            <TableCell>{item.material_name}</TableCell>
                            <TableCell className="text-right">{item.quantity}</TableCell>
                            <TableCell>{item.length || '-'}</TableCell>
                            <TableCell>
                              {item.color ? (
                                <Badge variant="outline" className="font-normal">
                                  {item.color}
                                </Badge>
                              ) : (
                                '-'
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              {item.cost_per_unit ? `$${item.cost_per_unit.toFixed(2)}` : '-'}
                            </TableCell>
                            <TableCell className="text-right">
                              {item.extended_cost ? `$${item.extended_cost.toFixed(2)}` : '-'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Labor Section for Current Sheet */}
                  {sheets.length > 0 && items.length > 0 && (() => {
                    const currentSheet = sheets.find(s => items[0]?.sheet_id === s.id);
                    if (!currentSheet) return null;
                    
                    const labor = sheetLabor[currentSheet.id];
                    
                    return (
                      <Card className="border-2 border-amber-300 bg-amber-50">
                        <CardHeader className="pb-3">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-base flex items-center gap-2">
                              <Clock className="w-5 h-5 text-amber-700" />
                              Labor for {currentSheet.sheet_name}
                            </CardTitle>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openLaborDialog(currentSheet.id)}
                              >
                                {labor ? (
                                  <><Edit className="w-4 h-4 mr-1" /> Edit Labor</>
                                ) : (
                                  <><Plus className="w-4 h-4 mr-1" /> Add Labor</>
                                )}
                              </Button>
                              {labor && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-destructive"
                                  onClick={() => deleteSheetLabor(labor.id)}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              )}
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent>
                          {labor ? (
                            <div className="grid grid-cols-4 gap-4">
                              <div>
                                <p className="text-sm text-muted-foreground">Description</p>
                                <p className="font-semibold">{labor.description}</p>
                              </div>
                              <div>
                                <p className="text-sm text-muted-foreground">Hours</p>
                                <p className="font-semibold">{labor.estimated_hours} hrs</p>
                              </div>
                              <div>
                                <p className="text-sm text-muted-foreground">Rate</p>
                                <p className="font-semibold">${labor.hourly_rate}/hr</p>
                              </div>
                              <div>
                                <p className="text-sm text-muted-foreground">Total Cost</p>
                                <p className="text-lg font-bold text-amber-700">
                                  ${labor.total_labor_cost.toFixed(2)}
                                </p>
                              </div>
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground text-center py-4">
                              No labor added for this section yet
                            </p>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })()}
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Labor Dialog */}
      <Dialog open={showLaborDialog} onOpenChange={setShowLaborDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              {sheetLabor[editingSheetId || ''] ? 'Edit' : 'Add'} Labor
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Description</Label>
              <Input
                value={laborForm.description}
                onChange={(e) => setLaborForm({ ...laborForm, description: e.target.value })}
                placeholder="Labor & Installation"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Estimated Hours</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.5"
                  value={laborForm.estimated_hours}
                  onChange={(e) => setLaborForm({ ...laborForm, estimated_hours: parseFloat(e.target.value) || 0 })}
                  placeholder="40"
                />
              </div>
              <div>
                <Label>Hourly Rate ($)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={laborForm.hourly_rate}
                  onChange={(e) => setLaborForm({ ...laborForm, hourly_rate: parseFloat(e.target.value) || 60 })}
                  placeholder="60.00"
                />
              </div>
            </div>

            <div>
              <Label>Notes (Optional)</Label>
              <Textarea
                value={laborForm.notes}
                onChange={(e) => setLaborForm({ ...laborForm, notes: e.target.value })}
                placeholder="Additional notes about this labor..."
                rows={3}
              />
            </div>

            {/* Preview */}
            {laborForm.estimated_hours > 0 && laborForm.hourly_rate > 0 && (
              <div className="bg-amber-50 border border-amber-300 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Labor Cost</p>
                    <p className="text-2xl font-bold text-amber-700">
                      ${(laborForm.estimated_hours * laborForm.hourly_rate).toFixed(2)}
                    </p>
                  </div>
                  <DollarSign className="w-8 h-8 text-amber-500" />
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-4 border-t">
              <Button onClick={saveSheetLabor} className="flex-1">
                {sheetLabor[editingSheetId || ''] ? 'Update' : 'Add'} Labor
              </Button>
              <Button variant="outline" onClick={() => setShowLaborDialog(false)}>
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
            <div>
              <Label htmlFor="sheet-name">Sheet Name</Label>
              <Input
                id="sheet-name"
                value={newSheetName}
                onChange={(e) => setNewSheetName(e.target.value)}
                placeholder="e.g., Porch, Garage, Interior..."
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !addingSheet) {
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

      {/* Manual Material Entry Dialog */}
      <Dialog open={showManualMaterialDialog} onOpenChange={setShowManualMaterialDialog}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5" />
              Add Material Manually
              {selectedSheet && (
                <Badge variant="outline" className="ml-2">
                  Adding to: {selectedSheet.sheet_name}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="category">Category *</Label>
                <Input
                  id="category"
                  value={manualMaterialForm.category}
                  onChange={(e) => setManualMaterialForm({ ...manualMaterialForm, category: e.target.value })}
                  placeholder="e.g., Framing, Roofing, Siding"
                />
              </div>
              <div>
                <Label htmlFor="usage">Usage</Label>
                <Input
                  id="usage"
                  value={manualMaterialForm.usage}
                  onChange={(e) => setManualMaterialForm({ ...manualMaterialForm, usage: e.target.value })}
                  placeholder="e.g., Main Building, Porch"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="material_name">Material Name *</Label>
                <Input
                  id="material_name"
                  value={manualMaterialForm.material_name}
                  onChange={(e) => setManualMaterialForm({ ...manualMaterialForm, material_name: e.target.value })}
                  placeholder="e.g., 2x4x16 SPF Lumber"
                />
              </div>
              <div>
                <Label htmlFor="sku">SKU</Label>
                <Input
                  id="sku"
                  value={manualMaterialForm.sku}
                  onChange={(e) => setManualMaterialForm({ ...manualMaterialForm, sku: e.target.value })}
                  placeholder="e.g., LUM-2X4-16"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="quantity">Quantity *</Label>
                <Input
                  id="quantity"
                  type="number"
                  min="0"
                  step="0.01"
                  value={manualMaterialForm.quantity}
                  onChange={(e) => setManualMaterialForm({ ...manualMaterialForm, quantity: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div>
                <Label htmlFor="length">Length</Label>
                <Input
                  id="length"
                  value={manualMaterialForm.length}
                  onChange={(e) => setManualMaterialForm({ ...manualMaterialForm, length: e.target.value })}
                  placeholder="e.g., 16', 8', 12'"
                />
              </div>
              <div>
                <Label htmlFor="color">Color</Label>
                <Input
                  id="color"
                  value={manualMaterialForm.color}
                  onChange={(e) => setManualMaterialForm({ ...manualMaterialForm, color: e.target.value })}
                  placeholder="e.g., Red, White"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="cost_per_unit">Cost per Unit ($)</Label>
                <Input
                  id="cost_per_unit"
                  type="number"
                  min="0"
                  step="0.01"
                  value={manualMaterialForm.cost_per_unit}
                  onChange={(e) => setManualMaterialForm({ ...manualMaterialForm, cost_per_unit: parseFloat(e.target.value) || 0 })}
                  placeholder="0.00"
                />
              </div>
              <div>
                <Label htmlFor="markup_percent">Markup (%)</Label>
                <Input
                  id="markup_percent"
                  type="number"
                  min="0"
                  step="0.1"
                  value={manualMaterialForm.markup_percent}
                  onChange={(e) => setManualMaterialForm({ ...manualMaterialForm, markup_percent: parseFloat(e.target.value) || 0 })}
                  placeholder="0.0"
                />
              </div>
              <div>
                <Label htmlFor="price_per_unit">Price per Unit ($)</Label>
                <Input
                  id="price_per_unit"
                  type="number"
                  min="0"
                  step="0.01"
                  value={manualMaterialForm.price_per_unit}
                  onChange={(e) => setManualMaterialForm({ ...manualMaterialForm, price_per_unit: parseFloat(e.target.value) || 0 })}
                  placeholder="0.00"
                />
              </div>
            </div>

            {/* Preview Calculations */}
            {manualMaterialForm.quantity > 0 && (manualMaterialForm.cost_per_unit > 0 || manualMaterialForm.price_per_unit > 0) && (
              <div className="bg-slate-50 border border-slate-300 rounded-lg p-4 space-y-2">
                <p className="text-sm font-semibold text-slate-700">Calculated Totals</p>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Extended Cost</p>
                    <p className="font-bold text-lg">${(manualMaterialForm.cost_per_unit * manualMaterialForm.quantity).toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Extended Price</p>
                    <p className="font-bold text-lg text-green-700">${(manualMaterialForm.price_per_unit * manualMaterialForm.quantity).toFixed(2)}</p>
                  </div>
                </div>
              </div>
            )}

            <div>
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={manualMaterialForm.notes}
                onChange={(e) => setManualMaterialForm({ ...manualMaterialForm, notes: e.target.value })}
                placeholder="Additional notes or details..."
                rows={3}
              />
            </div>

            <div className="flex gap-3 pt-4 border-t">
              <Button
                onClick={saveManualMaterial}
                disabled={savingManualMaterial || !manualMaterialForm.material_name.trim() || !manualMaterialForm.category.trim()}
                className="flex-1"
              >
                {savingManualMaterial ? (
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
                onClick={() => setShowManualMaterialDialog(false)}
                disabled={savingManualMaterial}
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Material Catalog Search Dialog */}
      <Dialog open={showMaterialSearchDialog} onOpenChange={setShowMaterialSearchDialog}>
        <DialogContent className="sm:max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Search className="w-5 h-5" />
              Add Materials from Catalog
              {selectedSheet && (
                <Badge variant="outline" className="ml-2">
                  Adding to: {selectedSheet.sheet_name}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
            {/* Search & Filter */}
            <div className="grid grid-cols-2 gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, SKU, or category..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 pr-9"
                />
                {searchQuery && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-1 top-1/2 transform -translate-y-1/2 h-7 w-7 p-0"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>
              
              <select
                value={searchCategory}
                onChange={(e) => setSearchCategory(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="all">All Categories</option>
                {categories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            {/* Results */}
            <div className="flex-1 overflow-y-auto border rounded-lg">
              {loadingCatalog ? (
                <div className="text-center py-12">
                  <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                  <p className="text-sm text-muted-foreground">Loading materials catalog...</p>
                </div>
              ) : filteredCatalogMaterials.length === 0 ? (
                <div className="text-center py-12">
                  <Search className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                  <p className="text-lg font-semibold mb-2">No materials found</p>
                  <p className="text-sm text-muted-foreground">
                    {searchQuery || searchCategory !== 'all'
                      ? 'Try adjusting your search filters'
                      : 'The materials catalog is empty'}
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader className="sticky top-0 bg-slate-100 z-10">
                    <TableRow>
                      <TableHead>SKU</TableHead>
                      <TableHead>Material Name</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Length</TableHead>
                      <TableHead className="text-right">Purchase Cost</TableHead>
                      <TableHead className="text-right">Unit Price</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCatalogMaterials.map((material) => (
                      <TableRow key={material.sku} className="hover:bg-slate-50">
                        <TableCell className="font-mono text-sm">{material.sku}</TableCell>
                        <TableCell className="font-medium">{material.material_name}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {material.category || 'Uncategorized'}
                          </Badge>
                        </TableCell>
                        <TableCell>{material.part_length || '-'}</TableCell>
                        <TableCell className="text-right font-mono">
                          {material.purchase_cost ? `$${material.purchase_cost.toFixed(2)}` : '-'}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {material.unit_price ? `$${material.unit_price.toFixed(2)}` : '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            onClick={() => addMaterialToSheet(material)}
                            disabled={addingMaterials.has(material.sku)}
                            className="bg-green-600 hover:bg-green-700"
                          >
                            {addingMaterials.has(material.sku) ? (
                              <>
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                                Adding...
                              </>
                            ) : (
                              <>
                                <Plus className="w-4 h-4 mr-1" />
                                Add
                              </>
                            )}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>

            {/* Footer Info */}
            <div className="flex items-center justify-between pt-4 border-t">
              <p className="text-sm text-muted-foreground">
                Showing {filteredCatalogMaterials.length} of {catalogMaterials.length} materials
              </p>
              <Button variant="outline" onClick={() => setShowMaterialSearchDialog(false)}>
                Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
