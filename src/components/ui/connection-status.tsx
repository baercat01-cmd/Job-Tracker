import { useConnectionStatus } from '@/lib/offline-manager';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import { Wifi, WifiOff, RefreshCw, Cloud, CloudOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export function ConnectionStatus() {
  const status = useConnectionStatus();
  const { isSyncing, lastSyncTime, pendingCount, syncProgress } = useOfflineSync();

  // Show sync status when syncing
  if (isSyncing) {
    return (
      <Badge
        variant="secondary"
        className="fixed top-4 right-4 z-50 flex items-center gap-2 px-3 py-2 shadow-lg"
      >
        <RefreshCw className="w-4 h-4 animate-spin" />
        {syncProgress ? (
          <span>
            Syncing {syncProgress.completed + 1}/{syncProgress.total}...
          </span>
        ) : (
          <span>Syncing data...</span>
        )}
      </Badge>
    );
  }

  if (status === 'online' && pendingCount === 0) {
    return null; // Don't show anything when online and no pending changes
  }

  return (
    <div className="fixed top-4 right-4 z-50 flex items-center gap-2">
      {status === 'offline' && (
        <Badge
          variant="destructive"
          className="flex items-center gap-2 px-3 py-2 shadow-lg"
        >
          <CloudOff className="w-4 h-4" />
          <span>Offline Mode</span>
        </Badge>
      )}
      {pendingCount > 0 && (
        <Badge
          variant="outline"
          className="flex items-center gap-2 px-3 py-2 shadow-lg bg-warning/10 text-warning-foreground border-warning"
        >
          <Cloud className="w-4 h-4" />
          <span>{pendingCount} change{pendingCount !== 1 ? 's' : ''} pending</span>
        </Badge>
      )}
      {lastSyncTime && (
        <div className="text-xs text-muted-foreground bg-card px-2 py-1 rounded shadow-sm">
          Last sync: {new Date(lastSyncTime).toLocaleTimeString()}
        </div>
      )}
    </div>
  );
}

export function ConnectionIndicator() {
  const status = useConnectionStatus();

  return (
    <div className="flex items-center gap-2">
      {status === 'online' ? (
        <Wifi className="w-4 h-4 text-success" />
      ) : status === 'offline' ? (
        <WifiOff className="w-4 h-4 text-destructive" />
      ) : (
        <RefreshCw className="w-4 h-4 text-warning animate-spin" />
      )}
      <span className="text-xs text-muted-foreground capitalize">{status}</span>
    </div>
  );
}
