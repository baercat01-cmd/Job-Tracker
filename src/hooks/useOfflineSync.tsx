// React hook for offline sync status and control

import { useEffect, useState } from 'react';
import { initializeSync, syncAllData, subscribeToTable } from '@/lib/offline-sync';
import { useConnectionStatus } from '@/lib/offline-manager';

interface SyncStatus {
  isSyncing: boolean;
  lastSyncTime: number | null;
  error: string | null;
}

export function useOfflineSync() {
  const [status, setStatus] = useState<SyncStatus>({
    isSyncing: false,
    lastSyncTime: null,
    error: null,
  });
  const connectionStatus = useConnectionStatus();

  // Initialize sync on mount
  useEffect(() => {
    let mounted = true;

    const doInitialSync = async () => {
      if (!mounted) return;

      setStatus((prev) => ({ ...prev, isSyncing: true, error: null }));

      try {
        await initializeSync();
        
        if (mounted) {
          setStatus({
            isSyncing: false,
            lastSyncTime: Date.now(),
            error: null,
          });
        }
      } catch (error) {
        console.error('[Sync Hook] Initial sync failed:', error);
        if (mounted) {
          setStatus({
            isSyncing: false,
            lastSyncTime: null,
            error: error instanceof Error ? error.message : 'Sync failed',
          });
        }
      }
    };

    doInitialSync();

    return () => {
      mounted = false;
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
      await syncAllData();
      setStatus({
        isSyncing: false,
        lastSyncTime: Date.now(),
        error: null,
      });
    } catch (error) {
      console.error('[Sync Hook] Manual sync failed:', error);
      setStatus((prev) => ({
        ...prev,
        isSyncing: false,
        error: error instanceof Error ? error.message : 'Sync failed',
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
