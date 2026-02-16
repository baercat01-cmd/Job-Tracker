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
  const [creatingQuote, setCreatingQuote] = useState(false);
  const [job, setJob] = useState<any>(null);

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
            try {
              // Ensure category is a valid string
              const cleanCategory = String(category || 'Uncategorized').trim();
              
              const item = {
                sheet_id: newSheet.id,
                category: cleanCategory,
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
                taxable: true,
                notes: null,
                order_index: itemIndex++,
              };

              const { error: itemError } = await supabase
                .from('material_items')
                .insert(item);

              if (itemError) {
                console.error('Error inserting item:', {
                  error: itemError,
                  item,
                  sheet: sheet.name,
                  category: cleanCategory,
                  row: row.originalIndex,
                });
                throw new Error(
                  `Failed to insert item in sheet "${sheet.name}", category "${cleanCategory}": ${itemError.message}`
                );
              }

              totalItems++;
            } catch (itemError: any) {
              console.error('Error processing item:', itemError);
              // Continue to next item instead of failing entire upload
              toast.error(`Skipped item in "${sheet.name}" - ${itemError.message}`, {
                duration: 5000,
              });
            }
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

      const { data: sheetsData, error: sheetsError } = await supabase
        .from('material_sheets')
        .select('id')
        .eq('workbook_id', workbookId);

      if (sheetsError) throw sheetsError;
      const sheetIds = sheetsData?.map(s => s.id) || [];

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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Material Management</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Manage material workbooks and create Zoho Books quotes for tracking
          </p>
        </div>
        <Button onClick={() => setShowUploadDialog(true)} className="gradient-primary">
          <Upload className="w-4 h-4 mr-2" />
          Upload Workbook
        </Button>
      </div>

      {/* Main Content */}
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
                Upload an Excel workbook to get started with material management
              </p>
              <Button onClick={() => setShowUploadDialog(true)} className="gradient-primary">
                <Upload className="w-4 h-4 mr-2" />
                Upload Your First Workbook
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

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
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-semibold text-blue-900 mb-2">Excel Workbook Requirements:</h4>
              <ul className="space-y-1 text-sm text-blue-800">
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>File must be in Excel format (.xlsx or .xls)</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>Each sheet will become a separate material category</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>Required columns: Category, Material, Qty, Cost per unit, Extended cost</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>Optional columns: Usage, SKU, Length, Color, Markup, Price per unit, Extended price</span>
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
