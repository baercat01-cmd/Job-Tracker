// Last sync time indicator - static display only

import { useOfflineSync } from '@/hooks/useOfflineSync';
import { useEffect, useState } from 'react';

function getTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function SyncStatusDetailed() {
  const { lastSyncTime } = useOfflineSync();
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

  // Only show when there is a last sync time
  if (!lastSyncTime) {
    return null;
  }

  // Simple text display in top-right corner
  return (
    <div className="fixed top-4 right-4 z-40">
      <div className="text-xs text-muted-foreground/60">
        Last synced {timeAgo}
      </div>
    </div>
  );
}
