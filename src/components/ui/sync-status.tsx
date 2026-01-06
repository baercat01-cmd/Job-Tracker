// Last sync time indicator - shows after sync completes

import { useOfflineSync } from '@/hooks/useOfflineSync';
import { useConnectionStatus } from '@/lib/offline-manager';
import { Check } from 'lucide-react';
import { useEffect, useState } from 'react';

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

  // Only show when NOT syncing AND there is a last sync time
  if (isSyncing || !lastSyncTime) {
    return null;
  }

  // Only show if online - no point showing sync status when offline
  if (connectionStatus !== 'online') {
    return null;
  }

  // Subtle badge in top-right corner showing last sync time
  return (
    <div className="fixed top-4 right-4 z-40">
      <div className="flex items-center gap-1.5 px-2 py-1 text-xs bg-background/80 backdrop-blur-sm border border-muted-foreground/20 rounded-full shadow-sm">
        <Check className="w-3 h-3 text-green-600" />
        <span className="text-muted-foreground">Synced {timeAgo}</span>
      </div>
    </div>
  );
}
