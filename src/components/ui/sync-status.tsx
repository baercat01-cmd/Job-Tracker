// Compact sync indicator - shows only when syncing, on error, or subtle last sync time

import { useOfflineSync } from '@/hooks/useOfflineSync';
import { useConnectionStatus } from '@/lib/offline-manager';
import { useEffect, useState } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';

function getTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function SyncStatusDetailed() {
  const { isSyncing, lastSyncTime, error } = useOfflineSync();
  const connectionStatus = useConnectionStatus();
  const [timeAgo, setTimeAgo] = useState<string>('');

  // Update time ago display every minute
  useEffect(() => {
    if (!lastSyncTime) return;
    
    const updateTimeAgo = () => {
      setTimeAgo(getTimeAgo(lastSyncTime));
    };
    
    updateTimeAgo();
    const interval = setInterval(updateTimeAgo, 60000); // Update every minute
    
    return () => clearInterval(interval);
  }, [lastSyncTime]);

  // State 1: Show spinner when actively syncing
  if (isSyncing) {
    return (
      <div className="flex items-center gap-2 px-2 py-1 rounded">
        <Loader2 className="h-3 w-3 text-muted-foreground animate-spin" />
        <span className="text-xs text-muted-foreground">
          Syncing...
        </span>
      </div>
    );
  }

  // State 2: Show error if sync failed
  if (error) {
    return (
      <div className="flex items-center gap-2 px-2 py-1 rounded">
        <AlertCircle className="h-3 w-3 text-destructive" />
        <span className="text-xs text-destructive">
          Sync error
        </span>
      </div>
    );
  }

  // State 3: Show subtle last synced time after successful sync
  if (lastSyncTime && connectionStatus === 'online') {
    return (
      <div className="px-2 py-1">
        <span className="text-xs text-muted-foreground/60">
          Synced {timeAgo}
        </span>
      </div>
    );
  }

  // Hidden by default (no sync status to show)
  return null;
}
