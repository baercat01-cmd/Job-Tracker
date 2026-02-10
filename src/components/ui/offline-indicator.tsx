import { useEffect, useState } from 'react';
import { Wifi, WifiOff, RefreshCw } from 'lucide-react';
import { Button } from './button';
import { Badge } from './badge';
import { toast } from 'sonner';
import { isOnline, onOnline, onOffline, triggerSync } from '@/lib/offline-manager';
import { getPendingSyncCount } from '@/lib/offline-db';

export function OfflineIndicator() {
  const [online, setOnline] = useState(isOnline());
  const [syncing, setSyncing] = useState(false);
  const [pendingChanges, setPendingChanges] = useState(0);

  useEffect(() => {
    // Set initial state
    setOnline(isOnline());
    loadPendingCount();

    // Subscribe to online/offline events
    const unsubOnline = onOnline(() => {
      setOnline(true);
      toast.success('Back online! Syncing your data...');
      loadPendingCount();
    });

    const unsubOffline = onOffline(() => {
      setOnline(false);
      toast.warning('You\'re offline. Changes will sync when connection is restored.');
    });

    // Listen for connection changes
    const handleConnectionChange = (event: any) => {
      setOnline(event.detail.online);
    };

    window.addEventListener('connectionchange', handleConnectionChange);

    // Listen for sync completion
    const handleSyncComplete = () => {
      setSyncing(false);
      loadPendingCount();
      toast.success('Data synced successfully!');
    };

    window.addEventListener('synccomplete', handleSyncComplete);

    // Update pending count periodically
    const interval = setInterval(loadPendingCount, 5000);

    return () => {
      unsubOnline();
      unsubOffline();
      window.removeEventListener('connectionchange', handleConnectionChange);
      window.removeEventListener('synccomplete', handleSyncComplete);
      clearInterval(interval);
    };
  }, []);

  async function loadPendingCount() {
    try {
      const count = await getPendingSyncCount();
      setPendingChanges(count);
    } catch (error) {
      console.error('Failed to load pending changes count:', error);
    }
  }

  async function handleManualSync() {
    if (!online) {
      toast.error('Cannot sync while offline');
      return;
    }

    setSyncing(true);
    try {
      await triggerSync();
      await loadPendingCount();
      toast.success('Sync complete!');
    } catch (error) {
      toast.error('Sync failed. Will retry automatically.');
      console.error('Manual sync failed:', error);
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {/* Online/Offline Status */}
      <Badge
        variant={online ? 'default' : 'destructive'}
        className="flex items-center gap-1"
      >
        {online ? (
          <>
            <Wifi className="w-3 h-3" />
            Online
          </>
        ) : (
          <>
            <WifiOff className="w-3 h-3" />
            Offline
          </>
        )}
      </Badge>

      {/* Pending Changes Counter */}
      {pendingChanges > 0 && (
        <Badge variant="outline" className="flex items-center gap-1">
          <RefreshCw className="w-3 h-3" />
          {pendingChanges} pending
        </Badge>
      )}

      {/* Manual Sync Button */}
      {online && pendingChanges > 0 && (
        <Button
          size="sm"
          variant="ghost"
          onClick={handleManualSync}
          disabled={syncing}
          className="h-7"
        >
          <RefreshCw className={`w-3 h-3 mr-1 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Syncing...' : 'Sync Now'}
        </Button>
      )}
    </div>
  );
}
