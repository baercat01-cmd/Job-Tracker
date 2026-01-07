// Robust error handling system for preventing crashes
// Wraps all critical operations with try-catch and retry logic

import { toast } from 'sonner';

export interface ErrorLog {
  timestamp: string;
  operation: string;
  error: string;
  httpStatus?: number;
  userAgent: string;
  url: string;
  retryCount: number;
  stackTrace?: string;
}

// Debug log storage (accessible via console)
const errorLogs: ErrorLog[] = [];
const MAX_LOGS = 100;

// Log error to debug system
export function logError(
  operation: string,
  error: any,
  httpStatus?: number,
  retryCount: number = 0
) {
  const errorLog: ErrorLog = {
    timestamp: new Date().toISOString(),
    operation,
    error: error?.message || String(error),
    httpStatus,
    userAgent: navigator.userAgent,
    url: window.location.href,
    retryCount,
    stackTrace: error?.stack,
  };

  errorLogs.push(errorLog);

  // Keep only last 100 logs
  if (errorLogs.length > MAX_LOGS) {
    errorLogs.shift();
  }

  // Log to console for debugging
  console.error(`[Error Handler] ${operation}:`, {
    ...errorLog,
    iPhoneDetected: /iPhone|iPad|iPod/.test(navigator.userAgent),
  });

  // Store in localStorage for persistence across crashes
  try {
    localStorage.setItem('fieldtrack_error_logs', JSON.stringify(errorLogs.slice(-20)));
  } catch (e) {
    // Ignore localStorage errors
  }
}

// Get all error logs (accessible via window.getErrorLogs())
export function getErrorLogs(): ErrorLog[] {
  return [...errorLogs];
}

// Get error logs as CSV for export
export function exportErrorLogs(): string {
  const headers = ['Timestamp', 'Operation', 'Error', 'HTTP Status', 'User Agent', 'URL', 'Retry Count'];
  const rows = errorLogs.map(log => [
    log.timestamp,
    log.operation,
    log.error,
    log.httpStatus?.toString() || 'N/A',
    log.userAgent,
    log.url,
    log.retryCount.toString(),
  ]);

  return [headers, ...rows]
    .map(row => row.map(cell => `"${cell}"`).join(','))
    .join('\n');
}

// Clear error logs
export function clearErrorLogs() {
  errorLogs.length = 0;
  try {
    localStorage.removeItem('fieldtrack_error_logs');
  } catch (e) {
    // Ignore
  }
  console.log('[Error Handler] Error logs cleared');
}

// Expose to window for debugging
if (typeof window !== 'undefined') {
  (window as any).getErrorLogs = getErrorLogs;
  (window as any).exportErrorLogs = exportErrorLogs;
  (window as any).clearErrorLogs = clearErrorLogs;
}

// Extract HTTP status from error
export function extractHttpStatus(error: any): number | undefined {
  // Supabase errors
  if (error?.status) return error.status;
  if (error?.code) {
    // PostgreSQL error codes
    const code = String(error.code);
    if (code === '23505') return 409; // Unique violation
    if (code === '23503') return 409; // Foreign key violation
    if (code === '42P01') return 404; // Table not found
  }
  
  // Fetch errors
  if (error?.response?.status) return error.response.status;
  
  // Network errors
  if (error?.message?.includes('Failed to fetch')) return 0; // Network error
  if (error?.message?.includes('NetworkError')) return 0;
  if (error?.message?.includes('timeout')) return 408;
  
  return undefined;
}

// Retry configuration
export interface RetryConfig {
  maxRetries: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  retryableStatuses: number[];
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelay: 1000, // 1 second
  maxDelay: 30000, // 30 seconds
  backoffMultiplier: 2,
  retryableStatuses: [0, 408, 429, 500, 502, 503, 504], // Network errors, timeouts, server errors
};

// Wrap async operation with retry logic
export async function withRetry<T>(
  operation: () => Promise<T>,
  operationName: string,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const retryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: any;
  
  for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
    try {
      // Execute operation
      const result = await operation();
      
      // Success - log if this was a retry
      if (attempt > 0) {
        console.log(`[Error Handler] ✓ ${operationName} succeeded after ${attempt} retries`);
      }
      
      return result;
    } catch (error: any) {
      lastError = error;
      const httpStatus = extractHttpStatus(error);
      
      // Log error
      logError(operationName, error, httpStatus, attempt);
      
      // Check if we should retry
      const shouldRetry = 
        attempt < retryConfig.maxRetries &&
        (httpStatus === undefined || retryConfig.retryableStatuses.includes(httpStatus));
      
      if (!shouldRetry) {
        break;
      }
      
      // Calculate delay with exponential backoff
      const delay = Math.min(
        retryConfig.initialDelay * Math.pow(retryConfig.backoffMultiplier, attempt),
        retryConfig.maxDelay
      );
      
      console.log(`[Error Handler] ⏱ ${operationName} retry ${attempt + 1}/${retryConfig.maxRetries} in ${delay}ms`);
      
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  // All retries failed
  console.error(`[Error Handler] ✗ ${operationName} failed after ${retryConfig.maxRetries} retries`);
  throw lastError;
}

// Safe wrapper for UI operations (always runs on main thread)
export async function safeUIOperation<T>(
  operation: () => T | Promise<T>,
  operationName: string,
  fallback?: T
): Promise<T | undefined> {
  try {
    // Ensure operation runs on main thread
    if (typeof requestIdleCallback !== 'undefined') {
      return await new Promise<T>((resolve, reject) => {
        requestIdleCallback(async () => {
          try {
            const result = await operation();
            resolve(result);
          } catch (error) {
            reject(error);
          }
        }, { timeout: 5000 });
      });
    } else {
      return await operation();
    }
  } catch (error: any) {
    logError(operationName, error);
    console.error(`[Error Handler] Safe UI operation failed: ${operationName}`, error);
    
    if (fallback !== undefined) {
      return fallback;
    }
    
    return undefined;
  }
}

// User-friendly error messages
export function getUserFriendlyError(error: any, operation: string): string {
  const httpStatus = extractHttpStatus(error);
  
  // Network errors
  if (httpStatus === 0) {
    return 'Connection lost. Your changes are saved and will sync when you\'re back online.';
  }
  
  // Server errors
  if (httpStatus && httpStatus >= 500) {
    return 'Server error. Your changes are saved and will retry automatically.';
  }
  
  // Timeout
  if (httpStatus === 408) {
    return 'Request timed out. Your changes are saved and will retry.';
  }
  
  // Rate limiting
  if (httpStatus === 429) {
    return 'Too many requests. Please wait a moment and try again.';
  }
  
  // Permission errors
  if (httpStatus === 403 || httpStatus === 401) {
    return 'Permission denied. Please try logging in again.';
  }
  
  // Not found
  if (httpStatus === 404) {
    return 'Resource not found. It may have been deleted.';
  }
  
  // Conflict
  if (httpStatus === 409) {
    return 'This item was modified by someone else. Please refresh and try again.';
  }
  
  // Default
  return `${operation} failed. Your changes are saved and will sync when possible.`;
}

// Show user-friendly error toast
export function showErrorToast(error: any, operation: string) {
  const message = getUserFriendlyError(error, operation);
  const httpStatus = extractHttpStatus(error);
  
  // Different toast types based on severity
  if (httpStatus === 0 || (httpStatus && httpStatus >= 500)) {
    // Network or server errors - informational, will retry
    toast.info(message, {
      duration: 5000,
      action: {
        label: 'Dismiss',
        onClick: () => {},
      },
    });
  } else if (httpStatus === 403 || httpStatus === 401) {
    // Permission errors - requires action
    toast.error(message, {
      duration: 10000,
    });
  } else {
    // Other errors - warning
    toast.warning(message, {
      duration: 7000,
    });
  }
}

// Restore error logs from localStorage on startup
try {
  const stored = localStorage.getItem('fieldtrack_error_logs');
  if (stored) {
    const parsedLogs = JSON.parse(stored);
    errorLogs.push(...parsedLogs);
    console.log(`[Error Handler] Restored ${parsedLogs.length} error logs from previous session`);
  }
} catch (e) {
  // Ignore
}
