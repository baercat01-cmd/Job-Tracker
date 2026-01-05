// Sync processor - processes pending sync queue items

import { supabase } from './supabase';
import { getPendingSyncItems, markSynced, clearSyncedItems, SyncQueueItem } from './offline-db';
import { isOnline, setStatus } from './offline-manager';
import { syncTable } from './offline-sync';

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
        await processSyncItem(item);
        
        if (item.id) {
          await markSynced(item.id);
        }
        
        succeeded++;
        console.log(`[Sync Processor] ✓ Synced ${item.operation} ${item.table}/${item.recordId}`);
      } catch (error) {
        failed++;
        console.error(`[Sync Processor] ✗ Failed to sync ${item.operation} ${item.table}/${item.recordId}:`, error);
      }

      // Add small delay to avoid overwhelming the server
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Clean up synced items
    await clearSyncedItems();

    console.log(`[Sync Processor] Complete: ${succeeded} succeeded, ${failed} failed`);
    lastProcessTime = Date.now();

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

// Sync insert operation
async function syncInsert(table: string, data: any, tempId: string): Promise<void> {
  // Remove temp ID if present
  const { id, ...insertData } = data;
  
  const { data: serverData, error } = await supabase
    .from(table)
    .insert(insertData)
    .select()
    .single();

  if (error) {
    throw new Error(`Insert failed: ${error.message}`);
  }

  console.log(`[Sync Processor] ✓ Inserted ${table} (temp: ${tempId}, real: ${serverData.id})`);
}

// Sync update operation
async function syncUpdate(table: string, updates: any, recordId: string): Promise<void> {
  // Skip if this is a temporary ID (record was created offline)
  if (recordId.startsWith('temp_')) {
    console.log(`[Sync Processor] Skipping update for temp record: ${recordId}`);
    return;
  }

  const { error } = await supabase
    .from(table)
    .update(updates)
    .eq('id', recordId);

  if (error) {
    throw new Error(`Update failed: ${error.message}`);
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

// Auto-sync when coming online
export function enableAutoSync(onProgress?: SyncProgressCallback): () => void {
  const handler = async () => {
    console.log('[Sync Processor] Device came online, starting auto-sync...');
    
    // Wait a bit to ensure connection is stable
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    if (isOnline()) {
      await processSyncQueue(onProgress);
    }
  };

  window.addEventListener('online', handler);

  // Return cleanup function
  return () => {
    window.removeEventListener('online', handler);
  };
}

// Get sync status
export function getSyncStatus() {
  return {
    isProcessing,
    lastProcessTime: lastProcessTime > 0 ? new Date(lastProcessTime) : null,
  };
}
