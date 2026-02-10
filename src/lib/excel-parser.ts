/**
 * Excel/CSV Workbook Parser
 * Handles parsing CSV files for material imports
 * 
 * NOTE: For Excel files (.xlsx), please convert to CSV first using Excel/Google Sheets:
 * File > Save As > CSV (Comma delimited)
 */

import { parseCSV } from './csv-parser';

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
 * Parse CSV file into structured workbook data
 * Note: Each CSV file represents one sheet. For multi-sheet workbooks,
 * upload multiple CSV files or use a naming convention like "SheetName_data.csv"
 */
export async function parseExcelWorkbook(file: File | Blob): Promise<ExcelWorkbook> {
  return new Promise(async (resolve, reject) => {
    try {
      // Read file as text
      const text = await file.text();
      
      // Parse CSV
      const rows = parseCSV(text);
      
      if (rows.length === 0) {
        reject(new Error('CSV file is empty'));
        return;
      }
      
      // Extract sheet name from filename if it's a File object
      let sheetName = 'Sheet1';
      if (file instanceof File) {
        // Remove .csv extension and use as sheet name
        sheetName = file.name.replace(/\.csv$/i, '');
      }
      
      // Convert CSV rows to ExcelRow format
      const excelRows: ExcelRow[] = rows.map(row => {
        const excelRow: ExcelRow = {};
        Object.entries(row).forEach(([key, value]) => {
          // Try to parse as number if it looks like one
          const numValue = parseFloat(value);
          excelRow[key] = !isNaN(numValue) && value.trim() !== '' ? numValue : value;
        });
        return excelRow;
      });
      
      resolve({
        sheets: [{
          name: sheetName,
          rows: excelRows,
        }],
      });
    } catch (error) {
      reject(error);
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
