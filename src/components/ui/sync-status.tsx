// Data synced indicator with clear states: syncing, synced, offline

import { useOfflineSync } from '@/hooks/useOfflineSync';
import { useConnectionStatus } from '@/lib/offline-manager';
import { useEffect, useState } from 'react';
import { CheckCircle, Loader2, WifiOff } from 'lucide-react';

function getTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function SyncStatusDetailed() {
  const { isSyncing, lastSyncTime } = useOfflineSync();
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

  // Show different states based on sync status
  // Priority: Syncing > Offline > Synced
  
  // State 1: Actively syncing - show animated spinner
  if (isSyncing) {
    return (
      <div className="fixed top-4 right-4 z-40">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-full shadow-sm">
          <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
          <span className="text-xs font-medium text-blue-700 dark:text-blue-300">
            Syncing...
          </span>
        </div>
      </div>
    );
  }

  // State 2: Offline - show static offline indicator
  if (connectionStatus === 'offline') {
    return (
      <div className="fixed top-4 right-4 z-40">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 rounded-full shadow-sm">
          <WifiOff className="h-4 w-4 text-orange-500" />
          <span className="text-xs font-medium text-orange-700 dark:text-orange-300">
            Offline
          </span>
        </div>
      </div>
    );
  }

  // State 3: Synced - show static checkmark with last sync time
  if (lastSyncTime) {
    return (
      <div className="fixed top-4 right-4 z-40">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-full shadow-sm">
          <CheckCircle className="h-4 w-4 text-green-500" />
          <span className="text-xs font-medium text-green-700 dark:text-green-300">
            Synced {timeAgo}
          </span>
        </div>
      </div>
    );
  }

  // No state to show (initial load)
  return null;
}
