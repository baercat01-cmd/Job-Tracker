import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Upload, 
  FileSpreadsheet, 
  Check, 
  AlertCircle,
  Loader2 
} from 'lucide-react';
import { toast } from 'sonner';

interface InventoryItem {
  sku: string;
  item_name: string;
  rate: number | null;
  account: string;
  category: string;
  smartbuild_data: Record<string, any>;
}

export function InventoryImport() {
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stats, setStats] = useState<{
    totalRows: number;
    imported: number;
    skipped: number;
  } | null>(null);

  /**
   * Parse CSV file and convert to array of objects
   */
  function parseCSV(csvText: string): any[] {
    const lines = csvText.split('\n').filter(line => line.trim());
    if (lines.length === 0) return [];

    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    const rows: any[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      const values: string[] = [];
      let currentValue = '';
      let inQuotes = false;

      // Handle CSV with quoted values
      for (let j = 0; j < line.length; j++) {
        const char = line[j];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          values.push(currentValue.trim());
          currentValue = '';
        } else {
          currentValue += char;
        }
      }
      values.push(currentValue.trim());

      const row: any = {};
      headers.forEach((header, index) => {
        row[header] = values[index]?.replace(/"/g, '') || '';
      });
      
      rows.push(row);
    }

    return rows;
  }

  /**
   * Convert Items.csv rows to inventory items
   */
  function convertToInventoryItems(rows: any[]): InventoryItem[] {
    return rows
      .filter(row => row['SKU'] && row['SKU'].trim()) // Skip rows without SKU
      .map(row => ({
        sku: row['SKU']?.trim() || '',
        item_name: row['Item Name']?.trim() || '',
        rate: parseFloat(row['Rate']) || null,
        account: row['Account']?.trim() || '',
        category: row['Category']?.trim() || '',
        smartbuild_data: {}, // Empty for now, will be populated later
      }));
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
    setStats(null);

    try {
      // Read file
      const text = await file.text();
      console.log('📄 File read, size:', text.length, 'characters');
      setProgress(20);

      // Parse CSV
      const rawRows = parseCSV(text);
      console.log('📊 Parsed rows:', rawRows.length);
      console.log('📋 First row sample:', rawRows[0]);
      setProgress(40);

      if (rawRows.length === 0) {
        toast.error('CSV file is empty');
        return;
      }

      // Convert to inventory items
      const items = convertToInventoryItems(rawRows);
      console.log('✅ Valid items to import:', items.length);
      console.log('📦 First item sample:', items[0]);
      setProgress(60);

      if (items.length === 0) {
        toast.error('No valid items found in CSV');
        return;
      }

      // Use upsert to insert or update based on SKU (prevents duplicates)
      const batchSize = 100; // Increased from 50
      let imported = 0;
      let failed = 0;
      const errors: string[] = [];

      for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        console.log(`⬆️ Uploading batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(items.length / batchSize)}:`, batch.length, 'items');
        
        const { data, error } = await supabase
          .from('materials_master')
          .upsert(batch, { 
            onConflict: 'sku',
            ignoreDuplicates: false // Update if exists
          })
          .select();

        if (error) {
          console.error('❌ Batch insert error:', error);
          failed += batch.length;
          errors.push(`Batch ${i / batchSize + 1}: ${error.message}`);
          // Continue with next batch instead of throwing
        } else {
          console.log('✅ Batch inserted successfully:', data?.length || batch.length, 'items');
          imported += batch.length;
        }

        setProgress(60 + (imported / items.length) * 40);
      }

      // Set stats
      setStats({
        totalRows: rawRows.length,
        imported: imported,
        skipped: rawRows.length - items.length + failed,
      });

      setProgress(100);
      
      if (errors.length > 0) {
        console.error('Import completed with errors:', errors);
        toast.error(`Imported ${imported} items, but ${failed} failed. Check console for details.`);
      } else {
        toast.success(`Successfully imported ${imported} items!`);
      }

    } catch (error: any) {
      console.error('❌ Import error:', error);
      toast.error(`Import failed: ${error.message}`);
    } finally {
      setImporting(false);
      event.target.value = '';
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Import Items.csv</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <FileSpreadsheet className="w-4 h-4" />
          <AlertDescription>
            Upload your Items.csv file. The system will use SKU as the unique identifier
            to prevent duplicates. Re-uploading the same file will update existing items.
          </AlertDescription>
        </Alert>

        {/* Import Progress */}
        {importing && (
          <div className="space-y-2">
            <Progress value={progress} />
            <p className="text-sm text-center text-muted-foreground">
              {progress < 40 ? 'Reading file...' :
               progress < 60 ? 'Converting data...' :
               progress < 100 ? 'Importing items...' :
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
                <li>• Total Rows: {stats.totalRows.toLocaleString()}</li>
                <li>• Items Imported/Updated: {stats.imported.toLocaleString()}</li>
                {stats.skipped > 0 && (
                  <li>• Skipped (no SKU): {stats.skipped.toLocaleString()}</li>
                )}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        {/* File Input */}
        <div className="flex items-center justify-center">
          <label className="cursor-pointer w-full">
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
                {importing ? 'Importing...' : 'Choose Items.csv File'}
              </span>
            </Button>
          </label>
        </div>

        {/* Instructions */}
        <div className="text-sm text-muted-foreground space-y-2 pt-4 border-t">
          <p className="font-semibold">CSV Format Expected:</p>
          <ul className="list-disc list-inside space-y-1 pl-2">
            <li>Item Name</li>
            <li>SKU (required - used as unique identifier)</li>
            <li>Rate</li>
            <li>Account</li>
            <li>Category</li>
          </ul>
        </div>

        {/* Data Integrity Notice */}
        <Alert variant="default">
          <AlertCircle className="w-4 h-4" />
          <AlertDescription>
            <strong>Duplicate Prevention:</strong> SKU is used as the unique identifier.
            Uploading the same file multiple times will update existing records instead
            of creating duplicates.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}
