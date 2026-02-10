/**
 * Excel Workbook Parser
 * Handles parsing multi-sheet Excel files (.xlsx) for material imports
 * Uses xlsx library to read Excel workbooks
 */

// Note: This will require adding 'xlsx' package
// Install with: npm install xlsx

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
 * Parse Excel file (blob/file) into structured workbook data
 */
export async function parseExcelWorkbook(file: File | Blob): Promise<ExcelWorkbook> {
  // Dynamic import of xlsx library
  // Note: xlsx must be installed: npm install xlsx
  let XLSX: any;
  try {
    XLSX = await import('xlsx');
  } catch (error) {
    throw new Error('xlsx library not installed. Please run: npm install xlsx');
  }
  
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        if (!data) {
          reject(new Error('Failed to read file'));
          return;
        }
        
        // Read workbook
        const workbook = XLSX.read(data, { type: 'binary' });
        
        // Parse all sheets
        const sheets: ExcelSheet[] = workbook.SheetNames.map(sheetName => {
          const worksheet = workbook.Sheets[sheetName];
          
          // Convert sheet to JSON
          const rows = XLSX.utils.sheet_to_json(worksheet, {
            header: 1, // Get as array of arrays first
            defval: null, // Use null for empty cells
            blankrows: false, // Skip blank rows
          }) as any[][];
          
          // Extract headers (first row)
          const headers = rows[0] || [];
          
          // Convert to objects
          const dataRows: ExcelRow[] = rows.slice(1).map(row => {
            const rowObj: ExcelRow = {};
            headers.forEach((header, index) => {
              const key = String(header || `Column${index + 1}`).trim();
              const value = row[index];
              
              // Convert value to string if not null
              rowObj[key] = value === null || value === undefined 
                ? null 
                : typeof value === 'number'
                ? value
                : String(value).trim();
            });
            return rowObj;
          });
          
          return {
            name: sheetName,
            rows: dataRows,
          };
        });
        
        resolve({ sheets });
      } catch (error) {
        reject(error);
      }
    };
    
    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };
    
    reader.readAsBinaryString(file);
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
