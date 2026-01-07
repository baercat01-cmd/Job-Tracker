// Compact sync indicator with delta sync support
// Shows "Sync Now" button only when there are pending changes

import { useOfflineSync } from '@/hooks/useOfflineSync';
import { useConnectionStatus, usePendingChangesCount } from '@/lib/offline-manager';
import { triggerManualSync } from '@/lib/sync-processor';
import { useEffect, useState } from 'react';
import { Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

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
  const pendingChanges = usePendingChangesCount();
  const [timeAgo, setTimeAgo] = useState<string>('');
  const [isManualSyncing, setIsManualSyncing] = useState(false);

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

  // Handle manual sync
  const handleManualSync = async () => {
    if (isManualSyncing || isSyncing) return;
    
    setIsManualSyncing(true);
    try {
      const result = await triggerManualSync();
      if (result.succeeded > 0) {
        toast.success(`Synced ${result.succeeded} change${result.succeeded !== 1 ? 's' : ''}`);
      }
      if (result.failed > 0) {
        toast.error(`${result.failed} item${result.failed !== 1 ? 's' : ''} failed to sync`);
      }
    } catch (error) {
      toast.error('Sync failed');
    } finally {
      setIsManualSyncing(false);
    }
  };

  // State 1: Show spinner when actively syncing
  if (isSyncing || isManualSyncing) {
    return (
      <div className="flex items-center gap-2 px-2 py-1 rounded">
        <Loader2 className="h-3 w-3 text-muted-foreground animate-spin" />
        <span className="text-xs text-muted-foreground">
          Syncing{pendingChanges > 0 ? ` ${pendingChanges} change${pendingChanges !== 1 ? 's' : ''}` : ''}...
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
        {pendingChanges > 0 && connectionStatus === 'online' && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleManualSync}
            className="h-6 px-2 text-xs ml-1"
          >
            <RefreshCw className="h-3 w-3 mr-1" />
            Retry
          </Button>
        )}
      </div>
    );
  }

  // State 3: Show "Sync Now" button if there are pending changes
  if (pendingChanges > 0 && connectionStatus === 'online') {
    return (
      <div className="flex items-center gap-2 px-2 py-1 rounded">
        <span className="text-xs text-muted-foreground">
          {pendingChanges} unsaved change{pendingChanges !== 1 ? 's' : ''}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={handleManualSync}
          className="h-6 px-2 text-xs"
        >
          <RefreshCw className="h-3 w-3 mr-1" />
          Sync Now
        </Button>
      </div>
    );
  }

  // State 4: Show subtle last synced time (only if recent)
  if (lastSyncTime && connectionStatus === 'online') {
    const secondsAgo = Math.floor((Date.now() - lastSyncTime) / 1000);
    // Only show if synced within last hour
    if (secondsAgo < 3600) {
      return (
        <div className="px-2 py-1">
          <span className="text-xs text-muted-foreground/60">
            Synced {timeAgo}
          </span>
        </div>
      );
    }
  }

  // Hidden by default (no pending changes, no recent sync)
  return null;
}
