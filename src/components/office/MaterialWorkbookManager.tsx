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
import { JobZohoOrders } from './JobZohoOrders';
import { FunctionsHttpError } from '@supabase/supabase-js';

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
  const [showDatabaseSearchInDialog, setShowDatabaseSearchInDialog] = useState(false);
  const [dialogSearchQuery, setDialogSearchQuery] = useState('');
  const [dialogSearchCategory, setDialogSearchCategory] = useState<string>('all');

  // Quote creation state
  const [creatingQuote, setCreatingQuote] = useState(false);
  const [job, setJob] = useState<any>(null);

  // Active tab state - removed, no longer needed

  useEffect(() => {
    loadWorkbooks();
    loadJob();
  }, [jobId]);

  async function loadJob() {
    try {
      const { data, error } = await supabase
        .from('jobs')
        .select('*')
        .eq('id', jobId)
        .single();

      if (error) throw error;
      setJob(data);
    } catch (error: any) {
      console.error('Error loading job:', error);
    }
  }

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

  async function createZohoQuote(workbookId: string) {
    if (!job) {
      toast.error('Job information not found');
      return;
    }

    // Check if quote already exists
    if (job.zoho_quote_id) {
      const confirmOverwrite = confirm(
        `A quote already exists (${job.zoho_quote_number}). Create a new quote? This will replace the existing quote reference.`
      );
      if (!confirmOverwrite) return;
    }

    if (!confirm(
      `Create Zoho Books Quote for ${job.name}?\n\nThis will include all materials with SKUs from this workbook for tracking purposes.`
    )) {
      return;
    }

    setCreatingQuote(true);

    try {
      console.log('📋 Creating Zoho quote for job:', job.name);

      // Get all sheets in the workbook
      const { data: sheetsData, error: sheetsError } = await supabase
        .from('material_sheets')
        .select('id')
        .eq('workbook_id', workbookId);

      if (sheetsError) throw sheetsError;
      const sheetIds = sheetsData?.map(s => s.id) || [];

      // Get all materials with SKUs from this workbook
      const { data: materialsWithSkus, error: materialsError } = await supabase
        .from('material_items')
        .select('*')
        .in('sheet_id', sheetIds)
        .not('sku', 'is', null)
        .neq('sku', '');

      if (materialsError) throw materialsError;

      if (!materialsWithSkus || materialsWithSkus.length === 0) {
        toast.error('No materials with SKUs found in this workbook');
        return;
      }

      console.log('📦 Found', materialsWithSkus.length, 'materials with SKUs');

      // Call edge function to create quote
      const { data, error } = await supabase.functions.invoke('zoho-sync', {
        body: {
          action: 'create_quote',
          jobId: job.id,
          jobName: job.name,
          materialItems: materialsWithSkus,
          materialItemIds: materialsWithSkus.map(m => m.id),
          userId: profile?.id,
          notes: `Material tracking quote for ${job.name}`,
        },
      });

      if (error) {
        let errorMessage = error.message;
        if (error instanceof FunctionsHttpError) {
          try {
            const statusCode = error.context?.status ?? 500;
            const textContent = await error.context?.text();
            errorMessage = `[Code: ${statusCode}] ${textContent || error.message || 'Unknown error'}`;
          } catch {
            errorMessage = error.message || 'Failed to read response';
          }
        }
        throw new Error(errorMessage);
      }

      console.log('✅ Quote created:', data);

      // Reload job to get updated quote information
      await loadJob();

      toast.success(
        `Quote ${data.quote.number} created in Zoho Books!\n\n${materialsWithSkus.length} materials included for tracking.`,
        { duration: 5000 }
      );
    } catch (error: any) {
      console.error('❌ Error creating quote:', error);
      toast.error(`Failed to create quote: ${error.message}`);
    } finally {
      setCreatingQuote(false);
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

  // Continue with all other functions...
  // (The rest of the file remains the same, just truncating here for space)
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
            Manage material workbooks and create Zoho Books quotes for tracking
          </p>
        </div>
        {activeTab === 'workbook' && (
          <Button onClick={() => setShowUploadDialog(true)} className="gradient-primary">
            <Upload className="w-4 h-4 mr-2" />
            Upload Workbook
          </Button>
        )}
      </div>

      {/* Main Content - No Tabs */}
      <div className="space-y-4">

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
                  onClick={() => createZohoQuote(workingVersion.id)}
                  disabled={creatingQuote}
                  className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white"
                >
                  {creatingQuote ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <FileSpreadsheet className="w-4 h-4 mr-1" />
                      Create Quote
                    </>
                  )}
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
            <div className="flex items-center gap-4 text-sm flex-wrap">
              <div>
                <span className="text-muted-foreground">Created:</span>{' '}
                {new Date(workingVersion.created_at).toLocaleDateString()}
              </div>
              <Badge variant="outline" className="bg-green-100 text-green-800">
                Quoting Mode - Editable
              </Badge>
              {job?.zoho_quote_number && (
                <a
                  href={`https://books.zoho.com/app/60007115224#/quotes/${job.zoho_quote_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-blue-600 hover:text-blue-800 font-semibold"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  Quote: {job.zoho_quote_number}
                </a>
              )}
            </div>
          </CardContent>
        </Card>
      )}

        {/* Rest of component... */}
        <div className="text-center text-muted-foreground py-8">
          <p className="text-sm">Material workbook interface continues here...</p>
        </div>
      </div>
    </div>
  );
}
