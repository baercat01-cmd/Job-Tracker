/**
 * Date utility functions to handle date formatting without timezone issues
 */

/**
 * Format a Date object as YYYY-MM-DD in local timezone (no UTC conversion)
 * This prevents the "off by one day" issue when selecting dates in calendars
 */
export function formatDateLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parse a date string (YYYY-MM-DD) as a local date (not UTC)
 * This creates a Date object at midnight in the local timezone
 */
export function parseDateLocal(dateString: string): Date {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Get today's date as a string in YYYY-MM-DD format (local timezone)
 */
export function getTodayString(): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return formatDateLocal(today);
}
