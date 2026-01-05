// Offline sync service - syncs data between Supabase and IndexedDB

import { supabase } from './supabase';
import { putMany, clear } from './offline-db';
import { isOnline } from './offline-manager';

// Sync state tracking
let isSyncing = false;
let lastSyncTime: Record<string, number> = {};

// Tables to sync (in order of dependencies)
const SYNC_TABLES = [
  'user_profiles',
  'workers',
  'components',
  'jobs',
  'materials_categories',
  'materials',
  'time_entries',
  'daily_logs',
  'photos',
  'completed_tasks',
  'job_assignments',
  'job_documents',
  'job_document_revisions',
  'document_views',
  'material_photos',
  'notifications',
] as const;

type SyncTable = typeof SYNC_TABLES[number];

interface SyncProgress {
  table: SyncTable;
  current: number;
  total: number;
}

type SyncProgressCallback = (progress: SyncProgress) => void;

// Sync all data from Supabase to IndexedDB
export async function syncAllData(
  onProgress?: SyncProgressCallback
): Promise<void> {
  if (isSyncing) {
    console.log('[Sync] Already syncing, skipping...');
    return;
  }

  if (!isOnline()) {
    console.log('[Sync] Offline, skipping sync');
    return;
  }

  isSyncing = true;
  console.log('[Sync] Starting full sync...');

  try {
    for (const table of SYNC_TABLES) {
      onProgress?.({ table, current: 0, total: 0 });
      await syncTable(table);
    }

    console.log('[Sync] Full sync complete');
  } catch (error) {
    console.error('[Sync] Full sync failed:', error);
    throw error;
  } finally {
    isSyncing = false;
  }
}

// Sync a specific table
export async function syncTable(tableName: SyncTable): Promise<void> {
  try {
    console.log(`[Sync] Syncing ${tableName}...`);

    // Fetch all data from Supabase
    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error(`[Sync] Error fetching ${tableName}:`, error);
      throw error;
    }

    if (!data || data.length === 0) {
      console.log(`[Sync] No data for ${tableName}`);
      return;
    }

    // Store in IndexedDB
    await putMany(tableName, data);
    lastSyncTime[tableName] = Date.now();

    console.log(`[Sync] ✓ Synced ${data.length} records from ${tableName}`);
  } catch (error) {
    console.error(`[Sync] Failed to sync ${tableName}:`, error);
    // Don't throw - continue with other tables
  }
}

// Sync only updated records since last sync (incremental sync)
export async function incrementalSync(
  tableName: SyncTable
): Promise<void> {
  const lastSync = lastSyncTime[tableName];
  if (!lastSync) {
    // No previous sync, do full sync
    return syncTable(tableName);
  }

  try {
    const lastSyncDate = new Date(lastSync).toISOString();

    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .gte('updated_at', lastSyncDate)
      .order('updated_at', { ascending: false });

    if (error) throw error;

    if (data && data.length > 0) {
      await putMany(tableName, data);
      lastSyncTime[tableName] = Date.now();
      console.log(`[Sync] ✓ Incremental sync: ${data.length} records from ${tableName}`);
    }
  } catch (error) {
    console.error(`[Sync] Incremental sync failed for ${tableName}:`, error);
    // Fall back to full sync
    return syncTable(tableName);
  }
}

// Initialize sync on app start
export async function initializeSync(
  onProgress?: SyncProgressCallback
): Promise<void> {
  if (!isOnline()) {
    console.log('[Sync] Starting in offline mode');
    return;
  }

  console.log('[Sync] Initializing...');
  await syncAllData(onProgress);
}

// Subscribe to real-time changes for a table
export function subscribeToTable(
  tableName: SyncTable,
  onChange?: () => void
): () => void {
  const channel = supabase
    .channel(`sync_${tableName}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: tableName,
      },
      async (payload) => {
        console.log(`[Sync] Real-time update for ${tableName}:`, payload.eventType);

        // Update IndexedDB with the change
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          const { data, error } = await supabase
            .from(tableName)
            .select('*')
            .eq('id', payload.new.id)
            .single();

          if (!error && data) {
            await putMany(tableName, [data]);
            onChange?.();
          }
        }
        // For DELETE, we'll handle in Phase 3 with sync queue
      }
    )
    .subscribe();

  // Return unsubscribe function
  return () => {
    supabase.removeChannel(channel);
  };
}

// Clear all offline data
export async function clearAllOfflineData(): Promise<void> {
  console.log('[Sync] Clearing all offline data...');
  
  for (const table of SYNC_TABLES) {
    await clear(table);
  }
  
  lastSyncTime = {};
  console.log('[Sync] All offline data cleared');
}

// Get last sync time for a table
export function getLastSyncTime(tableName: SyncTable): number | null {
  return lastSyncTime[tableName] || null;
}

// Check if data is stale (older than 5 minutes)
export function isDataStale(tableName: SyncTable): boolean {
  const lastSync = lastSyncTime[tableName];
  if (!lastSync) return true;
  
  const STALE_THRESHOLD = 5 * 60 * 1000; // 5 minutes
  return Date.now() - lastSync > STALE_THRESHOLD;
}
