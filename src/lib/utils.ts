import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Get the current date in local timezone as YYYY-MM-DD
 * This fixes timezone issues where UTC date differs from local date
 */
export function getLocalDateString(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Format a date string for display (handles timezone properly)
 */
export function formatDisplayDate(dateString: string): string {
  // Parse as local date (not UTC)
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

/**
 * Format a date string for short display
 */
export function formatShortDate(dateString: string): string {
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString();
}

/**
 * Format measurements to display as feet and inches (e.g., "10'" or "10' 2"")
 * @param value - Number representing total measurement in feet or inches
 * @param unit - 'feet' or 'inches' - what unit the input value is in
 * @returns Formatted string like "10'" or "10' 2""
 */
export function formatMeasurement(value: number | string | null | undefined, unit: 'feet' | 'inches' = 'feet'): string {
  if (value === null || value === undefined || value === '') {
    return '';
  }

  const numValue = typeof value === 'string' ? parseFloat(value) : value;
  
  if (isNaN(numValue) || !isFinite(numValue)) {
    return '';
  }

  if (unit === 'inches') {
    // Convert inches to feet and inches
    const totalInches = Math.round(numValue);
    const feet = Math.floor(totalInches / 12);
    const inches = totalInches % 12;
    
    if (feet === 0) {
      return inches > 0 ? `${inches}"` : '0"';
    }
    
    return inches > 0 ? `${feet}' ${inches}"` : `${feet}'`;
  } else {
    // Input is in feet - check if it has decimal inches
    const feet = Math.floor(numValue);
    const decimalPart = numValue - feet;
    const inches = Math.round(decimalPart * 12);
    
    if (inches === 0 || inches === 12) {
      // No inches or rounds to a full foot
      const finalFeet = feet + (inches === 12 ? 1 : 0);
      return `${finalFeet}'`;
    }
    
    return `${feet}' ${inches}"`;
  }
}
