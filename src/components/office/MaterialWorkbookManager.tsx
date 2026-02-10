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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { parseExcelWorkbook, validateMaterialWorkbook, normalizeColumnName, parseNumericValue, parsePercentValue } from '@/lib/excel-parser';

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

      // Load items for first sheet
      if (sheetsData && sheetsData.length > 0) {
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
          <h2 className="text-2xl font-bold">Material Workbooks</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Upload Excel workbooks (.xlsx) with multiple sheets for versioned material tracking
          </p>
        </div>
        <Button onClick={() => setShowUploadDialog(true)} className="gradient-primary">
          <Upload className="w-4 h-4 mr-2" />
          Upload Workbook
        </Button>
      </div>

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
                <li>Optional columns: Usage, SKU, Length, Cost per unit, CF.Mark Up, Price per unit, Extended cost, Extended price, Taxable</li>
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
              <div className="flex gap-2">
                {sheets.map((sheet) => (
                  <Button
                    key={sheet.id}
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      const { data, error } = await supabase
                        .from('material_items')
                        .select('*')
                        .eq('sheet_id', sheet.id)
                        .order('order_index');
                      if (!error) setItems(data || []);
                    }}
                  >
                    {sheet.sheet_name}
                  </Button>
                ))}
              </div>

              {items.length > 0 && (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Category</TableHead>
                        <TableHead>Material</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead>Length</TableHead>
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
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
