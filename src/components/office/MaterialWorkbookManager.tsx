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
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Upload,
  FileSpreadsheet,
  Lock,
  LockOpen,
  Eye,
  Trash2,
  CheckCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { parseExcelWorkbook, validateMaterialWorkbook, parseNumericValue, parsePercentValue } from '@/lib/excel-parser';

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

interface MaterialWorkbookManagerProps {
  jobId: string;
  quoteId?: string;
  onWorkbookCreated?: () => void;
}

export function MaterialWorkbookManager({ jobId, quoteId, onWorkbookCreated }: MaterialWorkbookManagerProps) {
  const { profile } = useAuth();
  const [workbooks, setWorkbooks] = useState<MaterialWorkbook[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [job, setJob] = useState<any>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [creatingWorkbook, setCreatingWorkbook] = useState(false);
  const [workbookName, setWorkbookName] = useState('');
  const [quote, setQuote] = useState<any>(null);
  const [replaceExistingWorkbook, setReplaceExistingWorkbook] = useState(false);

  useEffect(() => {
    loadWorkbooks();
    loadJob();
    loadQuote();
  }, [jobId, quoteId]);

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

  async function loadQuote() {
    try {
      // When viewing a specific proposal (quoteId), load that quote so the badge shows the correct proposal number
      if (quoteId) {
        const { data, error } = await supabase
          .from('quotes')
          .select('*')
          .eq('id', quoteId)
          .single();
        if (error && error.code !== 'PGRST116') {
          console.error('Error loading quote:', error);
          return;
        }
        setQuote(data);
        return;
      }
      const { data, error } = await supabase
        .from('quotes')
        .select('*')
        .eq('job_id', jobId)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        console.error('Error loading quote:', error);
        return;
      }

      setQuote(data);
    } catch (error: any) {
      console.error('Error loading quote:', error);
    }
  }

  async function loadWorkbooks() {
    try {
      setLoading(true);
      let query = supabase
        .from('material_workbooks')
        .select('*')
        .eq('job_id', jobId);
      if (quoteId) query = query.eq('quote_id', quoteId);
      const { data, error } = await query.order('version_number', { ascending: false });

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

  async function createEmptyWorkbook() {
    if (!profile) {
      toast.error('You must be logged in');
      return;
    }

    try {
      setCreatingWorkbook(true);

      // Next version must be unique per job (DB: material_workbooks_job_id_version_number_key).
      const { data: latestVersion } = await supabase
        .from('material_workbooks')
        .select('version_number')
        .eq('job_id', jobId)
        .order('version_number', { ascending: false })
        .limit(1)
        .maybeSingle();

      const nextVersion = (latestVersion?.version_number ?? 0) + 1;

      // Create empty workbook (tied to proposal when quoteId is set)
      const insertPayload: Record<string, unknown> = {
        job_id: jobId,
        version_number: nextVersion,
        status: 'working',
        created_by: profile.id,
      };
      if (quoteId) insertPayload.quote_id = quoteId;
      const { data: newWorkbook, error: workbookError } = await supabase
        .from('material_workbooks')
        .insert(insertPayload)
        .select()
        .single();

      if (workbookError) throw workbookError;

      // Create an initial sheet
      const sheetName = workbookName.trim() || 'Main Building';
      const { error: sheetError } = await supabase
        .from('material_sheets')
        .insert({
          workbook_id: newWorkbook.id,
          sheet_name: sheetName,
          order_index: 0,
          is_option: false,
        });

      if (sheetError) throw sheetError;

      toast.success(`Empty workbook created with sheet "${sheetName}"`);
      setShowCreateDialog(false);
      setWorkbookName('');
      await loadWorkbooks();
      onWorkbookCreated?.();
      window.dispatchEvent(new CustomEvent('materials-workbook-updated', { detail: { jobId, quoteId: quoteId ?? null } }));
    } catch (error: any) {
      console.error('Error creating workbook:', error);
      toast.error('Failed to create workbook: ' + error.message);
    } finally {
      setCreatingWorkbook(false);
    }
  }

  async function uploadWorkbook() {
    if (!selectedFile || !profile) {
      toast.error('Please select a file');
      return;
    }

    try {
      setUploading(true);
      toast.info('Parsing Excel file...');

      // Parse the Excel file
      const workbook = await parseExcelWorkbook(selectedFile);

      // Validate structure
      const validation = validateMaterialWorkbook(workbook);
      if (!validation.valid) {
        toast.error('Invalid workbook structure');
        validation.errors.forEach(error => toast.error(error));
        return;
      }

      toast.info(`Found ${workbook.sheets.length} sheets. Uploading...`);

      // Helper: case-insensitive column lookup
      const col = (row: any, ...keys: string[]): any => {
        const normalized: Record<string, any> = {};
        for (const k of Object.keys(row)) {
          normalized[k.toLowerCase().trim()] = row[k];
        }
        for (const key of keys) {
          const v = normalized[key.toLowerCase().trim()];
          if (v !== undefined && v !== null && v !== '') return v;
        }
        return null;
      };

      // Helper: insert material items from an Excel sheet into a given sheet_id; returns count
      const insertMaterialItemsForSheet = async (sheetId: string, excelSheet: typeof workbook.sheets[0]): Promise<number> => {
        const categories = new Map<string, any[]>();
        excelSheet.rows.forEach((row: any, rowIndex: number) => {
          let category: string;
          if (row['Category'] || row['category']) {
            category = String(row['Category'] || row['category']).trim();
          } else {
            category = excelSheet.name;
          }
          if (!category || category === '') category = 'Uncategorized';
          if (!categories.has(category)) categories.set(category, []);
          categories.get(category)!.push({ ...row, originalIndex: rowIndex });
        });
        let count = 0;
        let itemIndex = 0;
        for (const [category, categoryRows] of categories) {
          for (const row of categoryRows) {
            const cleanCategory = String(category || 'Uncategorized').trim();
            const rawTaxable = col(row, 'taxable');
            const taxable = rawTaxable === false || rawTaxable === 'false' || rawTaxable === 0 ? false : true;
            const item = {
              sheet_id: sheetId,
              category: cleanCategory,
              usage: col(row, 'usage') != null ? String(col(row, 'usage')).trim() || null : null,
              sku: col(row, 'sku') != null ? String(col(row, 'sku')).trim() || null : null,
              material_name: String(col(row, 'material') ?? '').trim(),
              quantity: parseNumericValue(col(row, 'qty', 'quantity')) || 0,
              length: col(row, 'length') != null ? String(col(row, 'length')).trim() || null : null,
              color: col(row, 'color') != null ? String(col(row, 'color')).trim() || null : null,
              cost_per_unit: parseNumericValue(col(row, 'cost per unit', 'cost_per_unit')),
              markup_percent: parsePercentValue(col(row, 'mark up', 'markup', 'cf.mark up', 'cf. mark up', 'markup_percent')),
              price_per_unit: parseNumericValue(col(row, 'price per unit', 'price_per_unit')),
              extended_cost: parseNumericValue(col(row, 'extended cost', 'extended_cost')),
              extended_price: parseNumericValue(col(row, 'extended price', 'extended_price')),
              taxable,
              notes: col(row, 'notes') != null ? String(col(row, 'notes')).trim() || null : null,
              order_index: itemIndex++,
            };
            const { error: itemError } = await supabase.from('material_items').insert(item);
            if (itemError) throw new Error(`Failed to insert item in sheet "${excelSheet.name}", category "${cleanCategory}": ${itemError.message}`);
            count++;
          }
        }
        return count;
      };

      let newWorkbook: { id: string };
      let totalItems = 0;

      if (replaceExistingWorkbook) {
        // Replace: update only material items in the existing workbook. Preserve sheets, labor, category markups, and any added line items.
        let wbQuery = supabase.from('material_workbooks').select('id').eq('job_id', jobId).eq('status', 'working');
        if (quoteId != null) wbQuery = wbQuery.eq('quote_id', quoteId);
        else wbQuery = wbQuery.is('quote_id', null);
        const { data: existingWbs } = await wbQuery.order('updated_at', { ascending: false }).limit(1);
        if (!existingWbs?.length) {
          toast.error('No existing workbook to replace. Create or upload a workbook first, then use Replace.');
          setUploading(false);
          return;
        }
        const targetWorkbookId = existingWbs[0].id;
        const { data: existingSheets } = await supabase
          .from('material_sheets')
          .select('id, order_index')
          .eq('workbook_id', targetWorkbookId)
          .order('order_index');
        const sheetsByIndex = (existingSheets || []).sort((a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0));

        for (let sheetIndex = 0; sheetIndex < workbook.sheets.length; sheetIndex++) {
          const excelSheet = workbook.sheets[sheetIndex];
          const existingSheet = sheetsByIndex[sheetIndex];
          if (existingSheet) {
            await supabase.from('material_items').delete().eq('sheet_id', existingSheet.id);
            totalItems += await insertMaterialItemsForSheet(existingSheet.id, excelSheet);
          } else {
            const isOptionSheet = excelSheet.name.toLowerCase().includes('(option)');
            const { data: newSheet, error: sheetError } = await supabase
              .from('material_sheets')
              .insert({
                workbook_id: targetWorkbookId,
                sheet_name: excelSheet.name,
                order_index: sheetIndex,
                is_option: isOptionSheet,
              })
              .select()
              .single();
            if (sheetError) throw sheetError;
            totalItems += await insertMaterialItemsForSheet(newSheet.id, excelSheet);
          }
        }
        newWorkbook = { id: targetWorkbookId };
        toast.success(`Updated material numbers in ${workbook.sheets.length} sheet(s) (${totalItems} items). Labor and added line items were kept.`);
      } else {
        // Create new workbook and sheets
        const { data: latestVersion } = await supabase
          .from('material_workbooks')
          .select('version_number')
          .eq('job_id', jobId)
          .order('version_number', { ascending: false })
          .limit(1)
          .maybeSingle();
        const nextVersion = (latestVersion?.version_number ?? 0) + 1;
        const uploadPayload: Record<string, unknown> = {
          job_id: jobId,
          version_number: nextVersion,
          status: 'working',
          created_by: profile.id,
        };
        if (quoteId) uploadPayload.quote_id = quoteId;
        const { data: created, error: workbookError } = await supabase
          .from('material_workbooks')
          .insert(uploadPayload)
          .select()
          .single();
        if (workbookError) throw workbookError;
        newWorkbook = created;

        for (let sheetIndex = 0; sheetIndex < workbook.sheets.length; sheetIndex++) {
          const sheet = workbook.sheets[sheetIndex];
          const isOptionSheet = sheet.name.toLowerCase().includes('(option)');
          const { data: newSheet, error: sheetError } = await supabase
            .from('material_sheets')
            .insert({
              workbook_id: newWorkbook.id,
              sheet_name: sheet.name,
              order_index: sheetIndex,
              is_option: isOptionSheet,
            })
            .select()
            .single();
          if (sheetError) throw sheetError;
          totalItems += await insertMaterialItemsForSheet(newSheet.id, sheet);
        }
        toast.success(`Uploaded ${workbook.sheets.length} sheets with ${totalItems} items`);
      }

      setShowUploadDialog(false);
      setSelectedFile(null);
      setReplaceExistingWorkbook(false);
      await loadWorkbooks();
      onWorkbookCreated?.();
      window.dispatchEvent(new CustomEvent('materials-workbook-updated', { detail: { jobId, quoteId: quoteId ?? null } }));
      // Open the uploaded workbook immediately instead of staying on this overview
      window.location.href = `/office/workbooks/${newWorkbook.id}`;
    } catch (error: any) {
      console.error('Error uploading workbook:', error);
      toast.error('Failed to upload workbook: ' + error.message);
    } finally {
      setUploading(false);
    }
  }

  async function deleteWorkbook(workbookId: string) {
    if (
      !confirm(
        'Delete this workbook? All sheets and materials in it will be removed. You can then create or upload a new workbook.\n\nThis cannot be undone.'
      )
    ) {
      return;
    }

    try {
      const { error } = await supabase
        .from('material_workbooks')
        .delete()
        .eq('id', workbookId);

      if (error) throw error;

      toast.success('Workbook deleted. You can now create or upload a new one.');
      await loadWorkbooks();
      onWorkbookCreated?.();
      window.dispatchEvent(new CustomEvent('materials-workbook-updated', { detail: { jobId, quoteId: quoteId ?? null } }));
    } catch (error: any) {
      console.error('Error deleting workbook:', error);
      const msg = error?.message ?? 'Unknown error';
      toast.error(msg.includes('policy') || msg.includes('RLS') ? 'You do not have permission to delete this workbook.' : 'Failed to delete workbook');
    }
  }

  async function viewWorkbook(workbook: MaterialWorkbook) {
    toast.info('Opening workbook in new view...');
    // Navigate to detailed workbook view
    window.location.href = `/office/workbooks/${workbook.id}`;
  }

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
      {/* Proposal Info Banner - Show if quote exists */}
      {quote && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="py-3">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-semibold text-blue-900">
                Proposal #{quote.proposal_number || quote.quote_number}
              </span>
              <Badge variant="outline" className="text-xs bg-green-100 border-green-300 text-green-900">
                Current Proposal
              </Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Material Management</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Manage material workbooks and create Zoho Books quotes for tracking
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setShowCreateDialog(true)} variant="outline">
            <FileSpreadsheet className="w-4 h-4 mr-2" />
            Create Empty Workbook
          </Button>
          <Button onClick={() => setShowUploadDialog(true)} className="gradient-primary">
            <Upload className="w-4 h-4 mr-2" />
            Upload Workbook
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="space-y-4">
        {/* Working Version */}
        {workingVersion && (
          <Card className="border-2 border-green-500">
            <CardHeader className="bg-green-50">
              <div className="flex items-center justify-between">
                <div className="flex flex-col gap-1">
                  <CardTitle className="flex items-center gap-2">
                    <LockOpen className="w-5 h-5 text-green-600" />
                    Working Version (v{workingVersion.version_number})
                  </CardTitle>
                  {quote && (
                    <div className="flex items-center gap-2 text-sm">
                      <FileSpreadsheet className="w-4 h-4 text-blue-600" />
                      <span className="font-semibold text-blue-900">
                        Proposal #{quote.proposal_number || quote.quote_number}
                      </span>
                      <Badge variant="outline" className="bg-blue-100 text-blue-800 text-xs">
                        Current Proposal
                      </Badge>
                    </div>
                  )}
                </div>
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
                    variant="outline"
                    onClick={() => deleteWorkbook(workingVersion.id)}
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/30"
                  >
                    <Trash2 className="w-4 h-4 mr-1" />
                    Delete
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="space-y-3">
                <div className="flex items-center gap-4 text-sm flex-wrap">
                  <div>
                    <span className="text-muted-foreground">Created:</span>{' '}
                    {new Date(workingVersion.created_at).toLocaleDateString()}
                  </div>
                  <Badge variant="outline" className="bg-green-100 text-green-800">
                    Quoting Mode - Editable
                  </Badge>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <p className="text-sm text-amber-900">
                    <strong>📝 Note:</strong> Changes to this workbook only affect the current proposal version. 
                    Previous proposals remain unchanged with their original materials and pricing.
                  </p>
                </div>
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

        {/* Locked Versions */}
        {lockedVersions.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-lg font-semibold">Previous Versions</h3>
            {lockedVersions.map((version) => (
              <Card key={version.id}>
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Lock className="w-4 h-4 text-muted-foreground" />
                      Version {version.version_number} (Locked)
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => viewWorkbook(version)}
                      >
                        <Eye className="w-4 h-4 mr-1" />
                        View
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <div>
                      Locked: {version.locked_at ? new Date(version.locked_at).toLocaleDateString() : 'Unknown'}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* No Workbooks State */}
        {workbooks.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <FileSpreadsheet className="w-16 h-16 mx-auto text-muted-foreground/50 mb-4" />
              <p className="text-lg font-medium text-muted-foreground mb-2">No Material Workbooks Yet</p>
              <p className="text-sm text-muted-foreground mb-4">
                Create an empty workbook or upload an Excel file to get started
              </p>
              <div className="flex gap-2 justify-center">
                <Button onClick={() => setShowCreateDialog(true)} variant="outline">
                  <FileSpreadsheet className="w-4 h-4 mr-2" />
                  Create Empty Workbook
                </Button>
                <Button onClick={() => setShowUploadDialog(true)} className="gradient-primary">
                  <Upload className="w-4 h-4 mr-2" />
                  Upload Excel File
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Create Empty Workbook Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5" />
              Create Empty Material Workbook
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-800">
                Create an empty workbook and manually add sheets and materials as needed.
                This is useful when you want to build your materials list from scratch.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Initial Sheet Name (Optional)</Label>
              <Input
                value={workbookName}
                onChange={(e) => setWorkbookName(e.target.value)}
                placeholder="e.g., Main Building (default if empty)"
                disabled={creatingWorkbook}
              />
              <p className="text-xs text-muted-foreground">
                You can add more sheets after creating the workbook
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button
                variant="outline"
                onClick={() => {
                  setShowCreateDialog(false);
                  setWorkbookName('');
                }}
                disabled={creatingWorkbook}
              >
                Cancel
              </Button>
              <Button
                onClick={createEmptyWorkbook}
                disabled={creatingWorkbook}
                className="gradient-primary"
              >
                {creatingWorkbook ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    Creating...
                  </>
                ) : (
                  <>
                    <FileSpreadsheet className="w-4 h-4 mr-2" />
                    Create Workbook
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Upload Dialog */}
      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5" />
              Upload Material Workbook
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-lg border-2 border-amber-300 bg-amber-50 p-3">
              <Checkbox
                id="replace-existing"
                checked={replaceExistingWorkbook}
                onCheckedChange={(checked) => setReplaceExistingWorkbook(checked === true)}
                disabled={uploading}
              />
              <div className="space-y-1">
                <Label htmlFor="replace-existing" className="text-sm font-semibold cursor-pointer text-amber-900">
                  Replace existing workbook
                </Label>
                <p className="text-xs text-amber-800">
                  Delete the current workbook(s) for this {quoteId ? 'proposal' : 'job'} and use the uploaded file as the only workbook. This cannot be undone.
                </p>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-semibold text-blue-900 mb-2">Excel Workbook Requirements:</h4>
              <ul className="space-y-1 text-sm text-blue-800">
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>File must be in Excel format (.xlsx or .xls)</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>Each sheet will be organized by categories (Category column or sheet name)</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>Required columns: Material, Qty</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>Optional columns: Category, Usage, SKU, Length, Color, Cost per unit, Markup, Price per unit, Extended cost, Extended price</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>If no Category column, sheet name will be used as the category</span>
                </li>
              </ul>
            </div>

            <div className="space-y-2">
              <Label>Select Excel File</Label>
              <Input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileSelect}
                disabled={uploading}
              />
              {selectedFile && (
                <p className="text-sm text-muted-foreground">
                  Selected: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button
                variant="outline"
                onClick={() => {
                  setShowUploadDialog(false);
                  setSelectedFile(null);
                  setReplaceExistingWorkbook(false);
                }}
                disabled={uploading}
              >
                Cancel
              </Button>
              <Button
                onClick={uploadWorkbook}
                disabled={!selectedFile || uploading}
                className="gradient-primary"
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
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
