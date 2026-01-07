// Sync processor - processes pending sync queue items with delta syncing

import { supabase } from './supabase';
import { getPendingSyncItems, markSynced, clearSyncedItems, SyncQueueItem, updateSyncMetadata, getSyncMetadata } from './offline-db';
import { isOnline, setStatus, updatePendingChangesCount } from './offline-manager';
import { syncTable } from './offline-sync';
import { resolveAndSync } from './conflict-resolver';
import { withRetry, logError, extractHttpStatus, showErrorToast } from './error-handler';

let isProcessing = false;
let lastProcessTime = 0;

// Sync interval: 15 minutes (in milliseconds)
const SYNC_INTERVAL = 15 * 60 * 1000;

// Batch size for delta syncs (process in small batches)
const SYNC_BATCH_SIZE = 10;

export interface SyncProgress {
  total: number;
  completed: number;
  failed: number;
  currentItem?: string;
}

type SyncProgressCallback = (progress: SyncProgress) => void;

// Process pending sync items in batches (delta sync)
export async function processSyncQueue(
  onProgress?: SyncProgressCallback,
  forceFull: boolean = false
): Promise<{ succeeded: number; failed: number }> {
  if (isProcessing) {
    console.log('[Delta Sync] Already processing, skipping...');
    return { succeeded: 0, failed: 0 };
  }

  if (!isOnline()) {
    console.log('[Delta Sync] Offline, skipping sync');
    return { succeeded: 0, failed: 0 };
  }

  isProcessing = true;
  setStatus('syncing');

  let succeeded = 0;
  let failed = 0;

  try {
    const pendingItems = await getPendingSyncItems();
    
    if (pendingItems.length === 0) {
      console.log('[Delta Sync] No pending changes');
      return { succeeded: 0, failed: 0 };
    }

    // Determine batch size
    const batchSize = forceFull ? pendingItems.length : Math.min(SYNC_BATCH_SIZE, pendingItems.length);
    const itemsToProcess = pendingItems.slice(0, batchSize);

    console.log(`[Delta Sync] Processing ${itemsToProcess.length} of ${pendingItems.length} pending items (batch mode)`);

    for (let i = 0; i < itemsToProcess.length; i++) {
      const item = itemsToProcess[i];
      
      onProgress?.({
        total: itemsToProcess.length,
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
        
        // Mark as synced
        if (item.id) {
          await markSynced(item.id);
        }
        
        succeeded++;
        console.log(`[Delta Sync] ✓ Synced ${item.operation} ${item.table}/${item.recordId}`);
      } catch (error: any) {
        failed++;
        const httpStatus = extractHttpStatus(error);
        logError(`Sync ${item.operation} ${item.table}/${item.recordId}`, error, httpStatus);
        console.error(`[Delta Sync] ✗ Failed to sync ${item.operation} ${item.table}/${item.recordId}:`, error);
      }

      // Small delay to avoid overwhelming the server
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Clean up synced items
    await clearSyncedItems();

    // Update metadata for synced tables
    const syncedTables = new Set(itemsToProcess.map(item => item.table));
    for (const table of syncedTables) {
      await updateSyncMetadata(table, succeeded);
    }

    console.log(`[Delta Sync] Complete: ${succeeded} succeeded, ${failed} failed, ${pendingItems.length - itemsToProcess.length} remaining`);
    lastProcessTime = Date.now();

    // Update pending changes count
    await updatePendingChangesCount();

    // Only show toast if there were failures (quiet success)
    if (failed > 0) {
      requestAnimationFrame(() => {
        if (succeeded === 0) {
          showErrorToast(new Error('Sync failed'), 'Sync');
        } else {
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

// Auto-sync with 15-minute interval (delta syncs)
export function enableAutoSync(onProgress?: SyncProgressCallback): () => void {
  let intervalId: NodeJS.Timeout | null = null;
  let retryTimeout: NodeJS.Timeout | null = null;

  // Sync on coming online
  const onlineHandler = async () => {
    console.log('[Delta Sync] Device came online, starting sync...');
    
    // Wait to ensure connection is stable
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    if (isOnline()) {
      try {
        const result = await processSyncQueue(onProgress);
        
        // If items failed, retry after delay
        if (result.failed > 0) {
          console.log(`[Delta Sync] ${result.failed} items failed, will retry in 30s`);
          retryTimeout = setTimeout(async () => {
            if (isOnline()) {
              console.log('[Delta Sync] Retrying failed items...');
              await processSyncQueue(onProgress);
            }
          }, 30000);
        }
      } catch (error) {
        console.error('[Delta Sync] Auto-sync error:', error);
      }
    }
  };

  // Periodic delta sync every 15 minutes
  const startPeriodicSync = () => {
    intervalId = setInterval(async () => {
      if (isOnline() && !isProcessing) {
        const pendingCount = await updatePendingChangesCount();
        if (pendingCount > 0) {
          console.log(`[Delta Sync] Periodic sync: ${pendingCount} pending changes`);
          await processSyncQueue(onProgress);
        }
      }
    }, SYNC_INTERVAL);
  };

  window.addEventListener('online', onlineHandler);
  startPeriodicSync();

  // Initial sync if online
  if (isOnline()) {
    setTimeout(() => {
      updatePendingChangesCount().then(count => {
        if (count > 0) {
          console.log(`[Delta Sync] Initial sync: ${count} pending changes`);
          processSyncQueue(onProgress);
        }
      });
    }, 2000); // Delay initial sync by 2 seconds
  }

  // Return cleanup function
  return () => {
    window.removeEventListener('online', onlineHandler);
    if (intervalId) {
      clearInterval(intervalId);
    }
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
    nextSyncTime: lastProcessTime > 0 ? new Date(lastProcessTime + SYNC_INTERVAL) : null,
  };
}

// Manual sync trigger (for "Sync Now" button)
export async function triggerManualSync(onProgress?: SyncProgressCallback): Promise<{ succeeded: number; failed: number }> {
  console.log('[Delta Sync] Manual sync triggered');
  // Force full sync of all pending items
  return await processSyncQueue(onProgress, true);
}
