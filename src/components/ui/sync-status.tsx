// Data synced indicator with icon showing last update time

import { useOfflineSync } from '@/hooks/useOfflineSync';
import { useEffect, useState } from 'react';
import { CheckCircle } from 'lucide-react';

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

  // Icon-based status indicator in top-right corner
  return (
    <div className="fixed top-4 right-4 z-40">
      <div className="flex items-center gap-2 px-3 py-1.5 bg-background/95 backdrop-blur-sm border rounded-full shadow-sm">
        <CheckCircle className="h-4 w-4 text-green-500" />
        <span className="text-xs text-muted-foreground">
          Synced {timeAgo}
        </span>
      </div>
    </div>
  );
}
