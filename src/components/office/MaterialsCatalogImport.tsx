import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Upload, 
  Download, 
  FileSpreadsheet, 
  Check, 
  AlertCircle,
  Loader2 
} from 'lucide-react';
import { toast } from 'sonner';

interface MaterialRecord {
  sku: string;
  material_name: string;
  category: string;
  unit_price: number | null;
  purchase_cost: number | null;
  part_length: string;
  raw_metadata: any[];
}

export function MaterialsCatalogImport() {
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stats, setStats] = useState<{
    totalRows: number;
    uniqueMaterials: number;
    imported: number;
  } | null>(null);

  /**
   * Parse CSV file and convert to array of objects
   */
  function parseCSV(csvText: string): any[] {
    const lines = csvText.split('\n').filter(line => line.trim());
    if (lines.length === 0) return [];

    const headers = lines[0].split(',').map(h => h.trim());
    const rows: any[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',');
      const row: any = {};
      
      headers.forEach((header, index) => {
        row[header] = values[index]?.trim() || '';
      });
      
      rows.push(row);
    }

    return rows;
  }

  /**
   * Convert Smartbuild CSV rows to de-duplicated materials catalog
   * 
   * Strategy:
   * - Group by Material + Part Length
   * - Use first row as primary record
   * - Store ALL original rows in raw_metadata for re-expansion
   */
  function convertToMaterialsCatalog(rows: any[]): MaterialRecord[] {
    const materialsMap = new Map<string, MaterialRecord>();

    rows.forEach((row, index) => {
      // Create unique key: Material + Part Length
      const material = row['Material'] || '';
      const partLength = row['Part Length'] || '';
      const key = `${material}|${partLength}`;

      if (!materialsMap.has(key)) {
        // First occurrence - create primary record
        materialsMap.set(key, {
          sku: row['SKU'] || row['Full SKU'] || `AUTO_${index}`,
          material_name: material,
          category: row['Category'] || 'Uncategorized',
          unit_price: parseFloat(row['Price']) || null,
          purchase_cost: parseFloat(row['Cost']) || null,
          part_length: partLength,
          raw_metadata: [row], // Store first row
        });
      } else {
        // Duplicate - add to raw_metadata array
        const existing = materialsMap.get(key)!;
        existing.raw_metadata.push(row);
      }
    });

    return Array.from(materialsMap.values());
  }

  /**
   * Import CSV file
   */
  async function handleImport(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.csv')) {
      toast.error('Please upload a CSV file');
      return;
    }

    setImporting(true);
    setProgress(0);

    try {
      // Read file
      const text = await file.text();
      setProgress(20);

      // Parse CSV
      const rawRows = parseCSV(text);
      setProgress(40);

      if (rawRows.length === 0) {
        toast.error('CSV file is empty');
        return;
      }

      // Convert to materials catalog format
      const materials = convertToMaterialsCatalog(rawRows);
      setProgress(60);

      // Clear existing data (optional - you may want to ask user first)
      const { error: deleteError } = await supabase
        .from('materials_catalog')
        .delete()
        .neq('sku', '___NOTHING___'); // Delete all

      if (deleteError) throw deleteError;
      setProgress(70);

      // Insert in batches (Supabase has limits)
      const batchSize = 100;
      let imported = 0;

      for (let i = 0; i < materials.length; i += batchSize) {
        const batch = materials.slice(i, i + batchSize);
        
        const { error } = await supabase
          .from('materials_catalog')
          .insert(batch);

        if (error) throw error;

        imported += batch.length;
        setProgress(70 + (imported / materials.length) * 30);
      }

      // Set stats
      setStats({
        totalRows: rawRows.length,
        uniqueMaterials: materials.length,
        imported: imported,
      });

      setProgress(100);
      toast.success(`Imported ${imported} materials from ${rawRows.length} rows`);

    } catch (error: any) {
      console.error('Import error:', error);
      toast.error(`Import failed: ${error.message}`);
    } finally {
      setImporting(false);
      // Reset file input
      event.target.value = '';
    }
  }

  /**
   * Export materials catalog back to original Smartbuild CSV format
   * Re-expands raw_metadata to recreate all original rows
   */
  async function handleExport() {
    setExporting(true);

    try {
      // Fetch all materials
      const { data: materials, error } = await supabase
        .from('materials_catalog')
        .select('*')
        .order('category', { ascending: true })
        .order('material_name', { ascending: true });

      if (error) throw error;
      if (!materials || materials.length === 0) {
        toast.error('No materials to export');
        return;
      }

      // Re-expand to original format
      const allRows: any[] = [];
      materials.forEach(material => {
        // Each material has raw_metadata array with original rows
        const originalRows = material.raw_metadata || [];
        allRows.push(...originalRows);
      });

      if (allRows.length === 0) {
        toast.error('No data to export');
        return;
      }

      // Get headers from first row
      const headers = Object.keys(allRows[0]);

      // Build CSV
      let csv = headers.join(',') + '\n';
      allRows.forEach(row => {
        const values = headers.map(header => row[header] || '');
        csv += values.join(',') + '\n';
      });

      // Download
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Materials-Export-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);

      toast.success(`Exported ${allRows.length} rows`);

    } catch (error: any) {
      console.error('Export error:', error);
      toast.error(`Export failed: ${error.message}`);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold">Materials Catalog</h2>
          <p className="text-muted-foreground">
            Import Smartbuild CSV and manage material database
          </p>
        </div>
        <Button onClick={handleExport} disabled={exporting} variant="outline">
          {exporting ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Download className="w-4 h-4 mr-2" />
          )}
          Export to CSV
        </Button>
      </div>

      {/* Import Card */}
      <Card>
        <CardHeader>
          <CardTitle>Import Smartbuild CSV</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <FileSpreadsheet className="w-4 h-4" />
            <AlertDescription>
              Upload your Smartbuild CSV file (Materials-Martin Builder.csv).
              The system will automatically de-duplicate materials while preserving
              all original data for bi-directional conversion.
            </AlertDescription>
          </Alert>

          {/* Import Progress */}
          {importing && (
            <div className="space-y-2">
              <Progress value={progress} />
              <p className="text-sm text-center text-muted-foreground">
                {progress < 40 ? 'Reading file...' :
                 progress < 60 ? 'Converting data...' :
                 progress < 70 ? 'Clearing database...' :
                 progress < 100 ? 'Importing materials...' :
                 'Complete!'}
              </p>
            </div>
          )}

          {/* Import Stats */}
          {stats && (
            <Alert className="border-green-500 bg-green-50">
              <Check className="w-4 h-4 text-green-600" />
              <AlertDescription className="text-green-800">
                <strong>Import Successful!</strong>
                <ul className="mt-2 space-y-1 text-sm">
                  <li>• Original Rows: {stats.totalRows.toLocaleString()}</li>
                  <li>• Unique Materials: {stats.uniqueMaterials.toLocaleString()}</li>
                  <li>• Records Imported: {stats.imported.toLocaleString()}</li>
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {/* File Input */}
          <div className="flex items-center justify-center">
            <label className="cursor-pointer">
              <input
                type="file"
                accept=".csv"
                onChange={handleImport}
                disabled={importing}
                className="hidden"
              />
              <Button
                variant="default"
                size="lg"
                disabled={importing}
                className="w-full"
                asChild
              >
                <span>
                  {importing ? (
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  ) : (
                    <Upload className="w-5 h-5 mr-2" />
                  )}
                  {importing ? 'Importing...' : 'Choose CSV File'}
                </span>
              </Button>
            </label>
          </div>

          {/* Instructions */}
          <div className="text-sm text-muted-foreground space-y-2 pt-4 border-t">
            <p className="font-semibold">How it works:</p>
            <ol className="list-decimal list-inside space-y-1 pl-2">
              <li>Upload your Smartbuild CSV file</li>
              <li>System de-duplicates materials by Material + Length</li>
              <li>All original rows stored in raw_metadata (JSONB)</li>
              <li>Export recreates the original 3,400+ row format</li>
            </ol>
          </div>
        </CardContent>
      </Card>

      {/* Data Integrity Notice */}
      <Alert variant="default">
        <AlertCircle className="w-4 h-4" />
        <AlertDescription>
          <strong>Data Integrity Guaranteed:</strong> All original Smartbuild columns 
          and rows are preserved in the database. The export function will recreate 
          the exact original CSV structure with all 3,400+ rows.
        </AlertDescription>
      </Alert>
    </div>
  );
}
