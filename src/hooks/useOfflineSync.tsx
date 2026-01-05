// React hook for offline sync status and control

import { useEffect, useState } from 'react';
import { initializeSync, syncAllData, subscribeToTable } from '@/lib/offline-sync';
import { processSyncQueue, enableAutoSync, SyncProgress } from '@/lib/sync-processor';
import { useConnectionStatus } from '@/lib/offline-manager';
import { getPendingSyncItems } from '@/lib/offline-db';

interface SyncStatus {
  isSyncing: boolean;
  lastSyncTime: number | null;
  error: string | null;
  pendingCount: number;
  syncProgress?: SyncProgress;
}

export function useOfflineSync() {
  const [status, setStatus] = useState<SyncStatus>({
    isSyncing: false,
    lastSyncTime: null,
    error: null,
    pendingCount: 0,
  });
  const connectionStatus = useConnectionStatus();

  // Check pending items count (only update if changed)
  const updatePendingCount = async () => {
    const pending = await getPendingSyncItems();
    setStatus((prev) => {
      // Only update if count actually changed to prevent unnecessary re-renders
      if (prev.pendingCount !== pending.length) {
        return { ...prev, pendingCount: pending.length };
      }
      return prev;
    });
  };

  // Initialize sync on mount
  useEffect(() => {
    let mounted = true;

    const doInitialSync = async () => {
      if (!mounted) return;

      setStatus((prev) => ({ ...prev, isSyncing: true, error: null }));

      try {
        // First, process any pending offline changes
        await processSyncQueue((progress) => {
          if (mounted) {
            setStatus((prev) => ({ ...prev, syncProgress: progress }));
          }
        });

        // Then sync all data from server
        await initializeSync();
        
        if (mounted) {
          await updatePendingCount();
          setStatus((prev) => ({
            ...prev,
            isSyncing: false,
            lastSyncTime: Date.now(),
            error: null,
            syncProgress: undefined,
          }));
        }
      } catch (error) {
        console.error('[Sync Hook] Initial sync failed:', error);
        if (mounted) {
          setStatus((prev) => ({
            ...prev,
            isSyncing: false,
            lastSyncTime: null,
            error: error instanceof Error ? error.message : 'Sync failed',
            syncProgress: undefined,
          }));
        }
      }
    };

    doInitialSync();

    // Enable auto-sync when coming online
    const cleanup = enableAutoSync((progress) => {
      if (mounted) {
        setStatus((prev) => ({ 
          ...prev, 
          isSyncing: true,
          syncProgress: progress 
        }));
      }
    });

    // Update pending count periodically (30 seconds to reduce flashing)
    const interval = setInterval(updatePendingCount, 30000);

    return () => {
      mounted = false;
      cleanup();
      clearInterval(interval);
    };
  }, []);

  // Sync when coming back online
  useEffect(() => {
    if (connectionStatus === 'online') {
      manualSync();
    }
  }, [connectionStatus]);

  const manualSync = async () => {
    setStatus((prev) => ({ ...prev, isSyncing: true, error: null }));

    try {
      // Process offline changes first
      await processSyncQueue((progress) => {
        setStatus((prev) => ({ ...prev, syncProgress: progress }));
      });

      // Then sync all data from server
      await syncAllData();
      
      await updatePendingCount();
      setStatus((prev) => ({
        ...prev,
        isSyncing: false,
        lastSyncTime: Date.now(),
        error: null,
        syncProgress: undefined,
      }));
    } catch (error) {
      console.error('[Sync Hook] Manual sync failed:', error);
      setStatus((prev) => ({
        ...prev,
        isSyncing: false,
        error: error instanceof Error ? error.message : 'Sync failed',
        syncProgress: undefined,
      }));
    }
  };

  return {
    ...status,
    sync: manualSync,
  };
}

// Hook to subscribe to real-time updates for a specific table
export function useTableSync(tableName: string) {
  const [updateCount, setUpdateCount] = useState(0);

  useEffect(() => {
    const unsubscribe = subscribeToTable(tableName as any, () => {
      setUpdateCount((prev) => prev + 1);
    });

    return unsubscribe;
  }, [tableName]);

  return { updateCount };
}
