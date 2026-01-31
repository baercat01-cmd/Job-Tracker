/**
 * CSV Parser Utility
 * Handles parsing of CSV files with proper quote handling and escaping
 */

export interface CSVRow {
  [key: string]: string;
}

/**
 * Parse CSV text into array of row objects
 * Handles quoted fields, escaped quotes, and multi-line values
 */
export function parseCSV(text: string): CSVRow[] {
  const lines = text.split('\n');
  if (lines.length === 0) return [];

  // Parse header row
  const headers = parseCSVLine(lines[0]);
  
  // Parse data rows
  const rows: CSVRow[] = [];
  let currentLine = 1;
  
  while (currentLine < lines.length) {
    const line = lines[currentLine].trim();
    
    // Skip empty lines
    if (!line) {
      currentLine++;
      continue;
    }
    
    // Parse the line
    const values = parseCSVLine(line);
    
    // Create row object
    const row: CSVRow = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });
    
    rows.push(row);
    currentLine++;
  }
  
  return rows;
}

/**
 * Parse a single CSV line handling quotes and escaping
 */
function parseCSVLine(line: string): string[] {
  const values: string[] = [];
  let currentValue = '';
  let insideQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];
    
    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        // Escaped quote
        currentValue += '"';
        i++; // Skip next quote
      } else {
        // Toggle quote state
        insideQuotes = !insideQuotes;
      }
    } else if (char === ',' && !insideQuotes) {
      // Field separator
      values.push(currentValue.trim());
      currentValue = '';
    } else {
      currentValue += char;
    }
  }
  
  // Add last value
  values.push(currentValue.trim());
  
  return values;
}

/**
 * Convert rows back to CSV text
 */
export function rowsToCSV(rows: CSVRow[]): string {
  if (rows.length === 0) return '';
  
  // Get all unique headers
  const headers = Array.from(
    new Set(rows.flatMap(row => Object.keys(row)))
  ).sort();
  
  // Build CSV lines
  const lines: string[] = [];
  
  // Add header row
  lines.push(headers.map(escapeCSVValue).join(','));
  
  // Add data rows
  rows.forEach(row => {
    const values = headers.map(header => escapeCSVValue(row[header] || ''));
    lines.push(values.join(','));
  });
  
  return lines.join('\n');
}

/**
 * Escape a value for CSV output
 */
function escapeCSVValue(value: string): string {
  // If value contains comma, quote, or newline, wrap in quotes
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    // Escape quotes by doubling them
    const escaped = value.replace(/"/g, '""');
    return `"${escaped}"`;
  }
  return value;
}
