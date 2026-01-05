import { useConnectionStatus } from '@/lib/offline-manager';
import { Wifi, WifiOff, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export function ConnectionStatus() {
  const status = useConnectionStatus();

  if (status === 'online') {
    return null; // Don't show anything when online
  }

  return (
    <Badge
      variant={status === 'offline' ? 'destructive' : 'secondary'}
      className="fixed top-4 right-4 z-50 flex items-center gap-2 px-3 py-2 shadow-lg"
    >
      {status === 'offline' ? (
        <>
          <WifiOff className="w-4 h-4" />
          <span>Offline Mode</span>
        </>
      ) : (
        <>
          <RefreshCw className="w-4 h-4 animate-spin" />
          <span>Syncing...</span>
        </>
      )}
    </Badge>
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
