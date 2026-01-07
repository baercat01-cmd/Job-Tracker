// Sync processor - processes pending sync queue items

import { supabase } from './supabase';
import { getPendingSyncItems, markSynced, clearSyncedItems, SyncQueueItem } from './offline-db';
import { isOnline, setStatus } from './offline-manager';
import { syncTable } from './offline-sync';
import { resolveAndSync } from './conflict-resolver';
import { withRetry, logError, extractHttpStatus, showErrorToast } from './error-handler';

let isProcessing = false;
let lastProcessTime = 0;

export interface SyncProgress {
  total: number;
  completed: number;
  failed: number;
  currentItem?: string;
}

type SyncProgressCallback = (progress: SyncProgress) => void;

// Process all pending sync items
export async function processSyncQueue(
  onProgress?: SyncProgressCallback
): Promise<{ succeeded: number; failed: number }> {
  if (isProcessing) {
    console.log('[Sync Processor] Already processing, skipping...');
    return { succeeded: 0, failed: 0 };
  }

  if (!isOnline()) {
    console.log('[Sync Processor] Offline, skipping sync');
    return { succeeded: 0, failed: 0 };
  }

  isProcessing = true;
  setStatus('syncing');

  let succeeded = 0;
  let failed = 0;

  try {
    const pendingItems = await getPendingSyncItems();
    
    if (pendingItems.length === 0) {
      console.log('[Sync Processor] No pending items');
      return { succeeded: 0, failed: 0 };
    }

    console.log(`[Sync Processor] Processing ${pendingItems.length} items...`);

    for (let i = 0; i < pendingItems.length; i++) {
      const item = pendingItems[i];
      
      onProgress?.({
        total: pendingItems.length,
        completed: i,
        failed,
        currentItem: `${item.operation} ${item.table}`,
      });

      try {
        // Process item with retry logic
        await withRetry(
          async () => await processSyncItem(item),
          `Sync ${item.operation} ${item.table}/${item.recordId}`,
          { maxRetries: 3 }
        );
        
        // Mark as synced on main thread to avoid UI blocking
        if (item.id) {
          requestAnimationFrame(async () => {
            await markSynced(item.id!);
          });
        }
        
        succeeded++;
        console.log(`[Sync Processor] ✓ Synced ${item.operation} ${item.table}/${item.recordId}`);
      } catch (error: any) {
        failed++;
        const httpStatus = extractHttpStatus(error);
        logError(`Sync ${item.operation} ${item.table}/${item.recordId}`, error, httpStatus);
        console.error(`[Sync Processor] ✗ Failed to sync ${item.operation} ${item.table}/${item.recordId}:`, error);
      }

      // Add small delay to avoid overwhelming the server
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Clean up synced items
    await clearSyncedItems();

    console.log(`[Sync Processor] Complete: ${succeeded} succeeded, ${failed} failed`);
    lastProcessTime = Date.now();

    // Show summary toast on main thread
    if (succeeded > 0 || failed > 0) {
      requestAnimationFrame(() => {
        if (failed === 0) {
          // All succeeded - no toast needed, quiet success
        } else if (succeeded === 0) {
          // All failed
          showErrorToast(new Error('Sync failed'), 'Sync');
        } else {
          // Mixed results
          showErrorToast(new Error(`${failed} items failed to sync`), 'Partial sync');
        }
      });
    }

    return { succeeded, failed };
  } finally {
    isProcessing = false;
    setStatus('online');
  }
}

// Process a single sync item
async function processSyncItem(item: SyncQueueItem): Promise<void> {
  const { table, operation, data, recordId } = item;

  switch (operation) {
    case 'insert':
      await syncInsert(table, data, recordId);
      break;
    case 'update':
      await syncUpdate(table, data, recordId);
      break;
    case 'delete':
      await syncDelete(table, recordId);
      break;
    default:
      throw new Error(`Unknown operation: ${operation}`);
  }

  // Refresh local cache for this table after sync
  await syncTable(table as any);
}

// Sync insert operation with conflict resolution
async function syncInsert(table: string, data: any, tempId: string): Promise<void> {
  // Remove temp ID if present
  const { id, ...insertData } = data;
  
  // Use conflict resolver to handle potential duplicates
  const result = await resolveAndSync(table, tempId, insertData, 'insert');
  
  if (!result.success) {
    throw new Error(`Insert failed: ${result.error?.message || 'Unknown error'}`);
  }

  console.log(`[Sync Processor] ✓ Inserted ${table} (temp: ${tempId}, real: ${result.resolvedData?.id})`);
}

// Sync update operation with conflict resolution
async function syncUpdate(table: string, updates: any, recordId: string): Promise<void> {
  // Skip if this is a temporary ID (record was created offline)
  if (recordId.startsWith('temp_')) {
    console.log(`[Sync Processor] Skipping update for temp record: ${recordId}`);
    return;
  }

  // Use conflict resolver to merge changes intelligently
  const result = await resolveAndSync(table, recordId, { ...updates, id: recordId }, 'update');
  
  if (!result.success) {
    throw new Error(`Update failed: ${result.error?.message || 'Unknown error'}`);
  }

  console.log(`[Sync Processor] ✓ Updated ${table}/${recordId}`);
}

// Sync delete operation
async function syncDelete(table: string, recordId: string): Promise<void> {
  // Skip if this is a temporary ID
  if (recordId.startsWith('temp_')) {
    console.log(`[Sync Processor] Skipping delete for temp record: ${recordId}`);
    return;
  }

  const { error } = await supabase
    .from(table)
    .delete()
    .eq('id', recordId);

  if (error) {
    // Ignore "not found" errors (record might have been deleted already)
    if (!error.message.includes('not found')) {
      throw new Error(`Delete failed: ${error.message}`);
    }
  }

  console.log(`[Sync Processor] ✓ Deleted ${table}/${recordId}`);
}

// Auto-sync when coming online with background retry
export function enableAutoSync(onProgress?: SyncProgressCallback): () => void {
  let retryTimeout: NodeJS.Timeout | null = null;

  const handler = async () => {
    console.log('[Sync Processor] Device came online, starting auto-sync...');
    
    // Wait a bit to ensure connection is stable
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    if (isOnline()) {
      try {
        const result = await processSyncQueue(onProgress);
        
        // If some items failed, retry after delay
        if (result.failed > 0) {
          console.log(`[Sync Processor] ${result.failed} items failed, will retry in 30s`);
          retryTimeout = setTimeout(async () => {
            if (isOnline()) {
              console.log('[Sync Processor] Retrying failed items...');
              await processSyncQueue(onProgress);
            }
          }, 30000); // Retry after 30 seconds
        }
      } catch (error) {
        console.error('[Sync Processor] Auto-sync error:', error);
      }
    }
  };

  window.addEventListener('online', handler);

  // Return cleanup function
  return () => {
    window.removeEventListener('online', handler);
    if (retryTimeout) {
      clearTimeout(retryTimeout);
    }
  };
}

// Get sync status
export function getSyncStatus() {
  return {
    isProcessing,
    lastProcessTime: lastProcessTime > 0 ? new Date(lastProcessTime) : null,
  };
}
