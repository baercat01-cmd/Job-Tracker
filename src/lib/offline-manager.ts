// Offline Manager - Handles online/offline state and automatic syncing

import { initDB, getAll, put } from './offline-db';
import { supabase } from './supabase';

// Online state management
let onlineState = navigator.onLine;
let syncInProgress = false;

// Event listeners for online/offline status
const onlineListeners: Set<() => void> = new Set();
const offlineListeners: Set<() => void> = new Set();

// Initialize online/offline listeners
export function initializeOfflineManager(): void {
  console.log('[OfflineManager] Initializing...');
  console.log('[OfflineManager] Initial state:', onlineState ? 'ONLINE' : 'OFFLINE');

  // Listen for online/offline events
  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  // Check connection status periodically (fallback for unreliable online event)
  setInterval(checkConnectionStatus, 30000); // Every 30 seconds

  // Initialize IndexedDB
  initDB().then(() => {
    console.log('[OfflineManager] IndexedDB ready');
    
    // If we're online, do an initial sync
    if (onlineState) {
      autoSync();
    }
  });
}

// Handle online event
function handleOnline(): void {
  console.log('[OfflineManager] 🟢 Connection restored');
  onlineState = true;
  
  // Notify all listeners
  onlineListeners.forEach((listener) => listener());
  
  // Auto-sync when coming back online
  autoSync();
  
  // Update UI to show online status
  updateConnectionIndicator(true);
}

// Handle offline event
function handleOffline(): void {
  console.log('[OfflineManager] 🔴 Connection lost - switching to offline mode');
  onlineState = false;
  
  // Notify all listeners
  offlineListeners.forEach((listener) => listener());
  
  // Update UI to show offline status
  updateConnectionIndicator(false);
}

// Check connection status by attempting a ping
async function checkConnectionStatus(): Promise<void> {
  try {
    const response = await fetch(import.meta.env.VITE_SUPABASE_URL + '/rest/v1/', {
      method: 'HEAD',
      cache: 'no-cache',
    });
    
    const isConnected = response.ok;
    
    if (isConnected !== onlineState) {
      if (isConnected) {
        handleOnline();
      } else {
        handleOffline();
      }
    }
  } catch (error) {
    // Network error means we're offline
    if (onlineState) {
      handleOffline();
    }
  }
}

// Update connection indicator in the UI
function updateConnectionIndicator(online: boolean): void {
  // Dispatch custom event that UI components can listen to
  window.dispatchEvent(new CustomEvent('connectionchange', { 
    detail: { online } 
  }));
}

// Auto-sync when online
async function autoSync(): Promise<void> {
  if (!onlineState || syncInProgress) {
    return;
  }

  try {
    syncInProgress = true;
    console.log('[OfflineManager] 🔄 Starting auto-sync...');
    
    // Import sync functions dynamically to avoid circular dependencies
    const { syncAllData } = await import('./offline-sync');
    
    await syncAllData((progress) => {
      console.log(`[OfflineManager] Syncing ${progress.table}...`);
    });
    
    console.log('[OfflineManager] ✅ Auto-sync complete');
    
    // Notify app that sync is complete
    window.dispatchEvent(new CustomEvent('synccomplete'));
  } catch (error) {
    console.error('[OfflineManager] ❌ Auto-sync failed:', error);
  } finally {
    syncInProgress = false;
  }
}

// Manual sync trigger
export async function triggerSync(): Promise<void> {
  if (!onlineState) {
    throw new Error('Cannot sync while offline');
  }
  
  return autoSync();
}

// Get online state
export function isOnline(): boolean {
  return onlineState;
}

// Register listener for when app goes online
export function onOnline(callback: () => void): () => void {
  onlineListeners.add(callback);
  return () => onlineListeners.delete(callback);
}

// Register listener for when app goes offline
export function onOffline(callback: () => void): () => void {
  offlineListeners.add(callback);
  return () => offlineListeners.delete(callback);
}

// Get data from IndexedDB or Supabase depending on connection
export async function getData<T>(
  tableName: string,
  fetchFromSupabase?: () => Promise<T[]>
): Promise<T[]> {
  if (onlineState && fetchFromSupabase) {
    try {
      // Try to fetch from Supabase first
      const data = await fetchFromSupabase();
      
      // Cache the data in IndexedDB
      if (data && data.length > 0) {
        const db = await initDB();
        const transaction = db.transaction(tableName, 'readwrite');
        const store = transaction.objectStore(tableName);
        
        // Clear existing data
        await store.clear();
        
        // Store new data
        data.forEach((item) => store.put(item));
        
        await transaction.complete;
      }
      
      return data;
    } catch (error) {
      console.warn(`[OfflineManager] Failed to fetch from Supabase, using cache:`, error);
      // Fall back to IndexedDB
      return getAll<T>(tableName);
    }
  }
  
  // Offline or no fetch function provided - use IndexedDB
  console.log(`[OfflineManager] Using cached data for ${tableName}`);
  return getAll<T>(tableName);
}

// Save data to IndexedDB and optionally queue for sync
export async function saveData<T extends { id: string }>(
  tableName: string,
  data: T,
  syncToSupabase?: () => Promise<void>
): Promise<void> {
  // Save to IndexedDB immediately
  await put(tableName, data);
  console.log(`[OfflineManager] Saved to local storage: ${tableName}`);
  
  // If online and sync function provided, sync to Supabase
  if (onlineState && syncToSupabase) {
    try {
      await syncToSupabase();
      console.log(`[OfflineManager] Synced to Supabase: ${tableName}`);
    } catch (error) {
      console.error(`[OfflineManager] Failed to sync to Supabase:`, error);
      // Data is already saved locally, will sync when connection is restored
      
      // Queue for sync
      const { addToSyncQueue } = await import('./offline-db');
      await addToSyncQueue({
        table: tableName,
        operation: 'update',
        data,
        recordId: data.id,
      });
    }
  } else if (!onlineState) {
    // Offline - queue for sync
    const { addToSyncQueue } = await import('./offline-db');
    await addToSyncQueue({
      table: tableName,
      operation: 'update',
      data,
      recordId: data.id,
    });
    console.log(`[OfflineManager] Queued for sync: ${tableName}`);
  }
}

// Update pending changes count and dispatch event
export async function updatePendingChangesCount(): Promise<void> {
  try {
    const { getPendingSyncCount } = await import('./offline-db');
    const count = await getPendingSyncCount();
    
    // Dispatch event with the count so UI can update
    window.dispatchEvent(new CustomEvent('pendingchangesupdate', { 
      detail: { count } 
    }));
  } catch (error) {
    console.error('[OfflineManager] Failed to update pending changes count:', error);
  }
}

// Cleanup function
export function cleanupOfflineManager(): void {
  window.removeEventListener('online', handleOnline);
  window.removeEventListener('offline', handleOffline);
  onlineListeners.clear();
  offlineListeners.clear();
}
