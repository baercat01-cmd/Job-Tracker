/**
 * Excel/XLSX Workbook Parser
 * Handles parsing Excel (.xlsx) files with multiple sheets for material imports
 * 
 * NOTE: Requires 'xlsx' library - install with: npm install xlsx
 */

// Type definitions for parsed workbook data
export interface ExcelRow {
  [key: string]: string | number | null;
}

export interface ExcelSheet {
  name: string;
  rows: ExcelRow[];
}

export interface ExcelWorkbook {
  sheets: ExcelSheet[];
}

/**
 * Load xlsx library dynamically
 */
async function loadXLSX() {
  try {
    const xlsx = await import('xlsx');
    return xlsx;
  } catch (error) {
    return null;
  }
}

/**
 * Parse Excel (.xlsx) file into structured workbook data with multiple sheets
 */
export async function parseExcelWorkbook(file: File | Blob): Promise<ExcelWorkbook> {
  // Try to load xlsx library
  const XLSX = await loadXLSX();
  
  if (!XLSX) {
    throw new Error(
      '📦 Excel upload feature requires the xlsx library.\n\n' +
      '✅ To enable this feature:\n' +
      '1. Run: npm install xlsx\n' +
      '2. Commit and push package.json changes\n' +
      '3. Redeploy the app\n\n' +
      '🔧 Quick fix: npm install xlsx && git add package.json && git commit -m "Add xlsx" && git push'
    );
  }
  
  return new Promise(async (resolve, reject) => {
    try {
      // Read file as array buffer
      const arrayBuffer = await file.arrayBuffer();
      
      // Parse with xlsx library
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      
      if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
        reject(new Error('Excel file contains no sheets'));
        return;
      }
      
      // Process each sheet
      const sheets: ExcelSheet[] = [];
      
      for (const sheetName of workbook.SheetNames) {
        const worksheet = workbook.Sheets[sheetName];
        
        // Convert sheet to JSON with header row
        const jsonData = XLSX.utils.sheet_to_json(worksheet, {
          header: 1, // Get as array of arrays first
          defval: null,
          blankrows: false,
        }) as any[][];
        
        if (jsonData.length === 0) {
          continue; // Skip empty sheets
        }
        
        // First row is headers
        const headers = jsonData[0].map(h => String(h || '').trim());
        
        // Convert remaining rows to objects
        const rows: ExcelRow[] = [];
        
        for (let i = 1; i < jsonData.length; i++) {
          const rowData = jsonData[i];
          const row: ExcelRow = {};
          
          headers.forEach((header, colIndex) => {
            if (!header) return; // Skip empty headers
            
            let value = rowData[colIndex];
            
            // Handle different value types
            if (value === null || value === undefined || value === '') {
              row[header] = null;
            } else if (typeof value === 'number') {
              row[header] = value;
            } else {
              row[header] = String(value).trim();
            }
          });
          
          // Only add row if it has at least one non-null value
          if (Object.values(row).some(v => v !== null && v !== '')) {
            rows.push(row);
          }
        }
        
        if (rows.length > 0) {
          sheets.push({
            name: sheetName,
            rows,
          });
        }
      }
      
      if (sheets.length === 0) {
        reject(new Error('No valid data found in Excel file'));
        return;
      }
      
      resolve({ sheets });
    } catch (error: any) {
      console.error('Error parsing Excel file:', error);
      reject(new Error('Failed to parse Excel file: ' + error.message));
    }
  });
}

/**
 * Validate workbook structure for material imports
 * Expected columns: Category, Material, Qty, Length, Cost per unit, etc.
 */
export function validateMaterialWorkbook(workbook: ExcelWorkbook): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  
  if (workbook.sheets.length === 0) {
    errors.push('Workbook contains no sheets');
    return { valid: false, errors };
  }
  
  // Check each sheet for required columns
  const requiredColumns = ['Category', 'Material', 'Qty'];
  
  workbook.sheets.forEach(sheet => {
    if (sheet.rows.length === 0) {
      errors.push(`Sheet "${sheet.name}" is empty`);
      return;
    }
    
    const firstRow = sheet.rows[0];
    const sheetColumns = Object.keys(firstRow);
    
    const missingColumns = requiredColumns.filter(
      col => !sheetColumns.some(sc => sc.toLowerCase().includes(col.toLowerCase()))
    );
    
    if (missingColumns.length > 0) {
      errors.push(
        `Sheet "${sheet.name}" missing required columns: ${missingColumns.join(', ')}`
      );
    }
  });
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Normalize column names to match database schema
 */
export function normalizeColumnName(columnName: string): string {
  const mappings: Record<string, string> = {
    'category': 'category',
    'usage': 'usage',
    'sku': 'sku',
    'material': 'material_name',
    'qty': 'quantity',
    'length': 'length',
    'cost per unit': 'cost_per_unit',
    'cf.mark up': 'markup_percent',
    'cf. mark up': 'markup_percent',
    'price per unit': 'price_per_unit',
    'extended cost': 'extended_cost',
    'extended price': 'extended_price',
    'taxable': 'taxable',
  };
  
  const normalized = columnName.toLowerCase().trim();
  return mappings[normalized] || columnName;
}

/**
 * Parse numeric value from Excel cell
 */
export function parseNumericValue(value: any): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  
  if (typeof value === 'number') {
    return value;
  }
  
  // Try to parse string as number
  const stringValue = String(value).replace(/[^0-9.-]/g, '');
  const parsed = parseFloat(stringValue);
  
  return isNaN(parsed) ? null : parsed;
}

/**
 * Parse percentage value (e.g., "0.150303" or "15%")
 */
export function parsePercentValue(value: any): number | null {
  const numeric = parseNumericValue(value);
  if (numeric === null) return null;
  
  // If value is > 1, assume it's already a percentage (e.g., 15 = 15%)
  // If value is < 1, assume it's a decimal (e.g., 0.15 = 15%)
  return numeric > 1 ? numeric / 100 : numeric;
}
