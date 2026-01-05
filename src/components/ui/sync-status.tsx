// Detailed sync status component showing queue and photo upload progress

import { useEffect, useState } from 'react';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import { usePhotoUpload } from '@/hooks/usePhotoUpload';
import { useConnectionStatus } from '@/lib/offline-manager';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Cloud, CloudOff, RefreshCw, Image, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

export function SyncStatusDetailed() {
  const { isSyncing, pendingCount, syncProgress, sync } = useOfflineSync();
  const { queueStatus, isUploading, retryFailed, processQueue } = usePhotoUpload();
  const connectionStatus = useConnectionStatus();
  const [shouldShow, setShouldShow] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [debugInfo, setDebugInfo] = useState<string>('');
  const [shownAt, setShownAt] = useState<number>(0);

  const totalPending = pendingCount + queueStatus.pending + queueStatus.failed;
  const hasIssues = queueStatus.failed > 0;
  const isActive = isSyncing || isUploading;

  // Debug logging in development
  useEffect(() => {
    if (import.meta.env.DEV) {
      const info = `Sync: ${isSyncing}, Upload: ${isUploading}, Pending: ${pendingCount}, Photos: ${queueStatus.pending}/${queueStatus.failed}`;
      setDebugInfo(info);
      console.log('[SyncStatus Debug]', info);
    }
  }, [isSyncing, isUploading, pendingCount, queueStatus]);

  // Debounce visibility with minimum show time to prevent flashing
  useEffect(() => {
    let hideTimeout: NodeJS.Timeout;
    let minShowTimeout: NodeJS.Timeout;

    // Should show if:
    // - Actively syncing/uploading OR
    // - Has pending items OR
    // - Has failed items
    const shouldBeVisible = isActive || totalPending > 0;

    if (shouldBeVisible) {
      // Show immediately when there's work to do
      setShouldShow(true);
      
      // After showing, ensure it stays visible for at least 3 seconds
      if (!isVisible) {
        setIsVisible(true);
        setShownAt(Date.now());
      }
    } else {
      // Calculate how long the button has been shown
      const visibleDuration = Date.now() - shownAt;
      const minVisibleTime = 3000; // 3 seconds minimum
      const hideDelay = 5000; // 5 seconds after work completes
      
      // If shown for less than minimum time, wait for minimum time first
      if (visibleDuration < minVisibleTime && shownAt > 0) {
        minShowTimeout = setTimeout(() => {
          // After minimum time, wait additional delay before hiding
          hideTimeout = setTimeout(() => {
            setIsVisible(false);
            // Actually remove from DOM after fade animation (300ms)
            setTimeout(() => setShouldShow(false), 300);
          }, hideDelay);
        }, minVisibleTime - visibleDuration);
      } else {
        // Already shown for minimum time, just add hide delay
        hideTimeout = setTimeout(() => {
          setIsVisible(false);
          // Actually remove from DOM after fade animation (300ms)
          setTimeout(() => setShouldShow(false), 300);
        }, hideDelay);
      }
    }

    return () => {
      clearTimeout(hideTimeout);
      clearTimeout(minShowTimeout);
    };
  }, [isActive, totalPending, shownAt, isVisible]);

  // Don't render at all when hidden
  if (!shouldShow) {
    return null;
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={`fixed bottom-4 right-4 z-50 shadow-lg transition-all duration-300 ease-in-out ${
            isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
          }`}
          title={import.meta.env.DEV ? debugInfo : undefined}
        >
          {isSyncing || isUploading ? (
            <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
          ) : hasIssues ? (
            <AlertCircle className="w-4 h-4 mr-2 text-warning" />
          ) : (
            <Cloud className="w-4 h-4 mr-2" />
          )}
          {totalPending > 0 && <span>{totalPending} pending</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center justify-between">
              <span>Sync Status</span>
              <Badge variant={connectionStatus === 'online' ? 'default' : 'destructive'}>
                {connectionStatus === 'online' ? (
                  <Cloud className="w-3 h-3 mr-1" />
                ) : (
                  <CloudOff className="w-3 h-3 mr-1" />
                )}
                {connectionStatus}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Data Sync Status */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Data Changes</span>
                <span className="font-medium">{pendingCount} pending</span>
              </div>
              {isSyncing && syncProgress && (
                <div className="space-y-1">
                  <Progress
                    value={(syncProgress.completed / syncProgress.total) * 100}
                    className="h-2"
                  />
                  <p className="text-xs text-muted-foreground">
                    {syncProgress.currentItem} ({syncProgress.completed}/{syncProgress.total})
                  </p>
                </div>
              )}
            </div>

            {/* Photo Upload Status */}
            {(queueStatus.total > 0 || isUploading) && (
              <div className="space-y-2 pt-2 border-t">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <Image className="w-4 h-4" />
                    <span className="text-muted-foreground">Photos</span>
                  </div>
                  <div className="flex gap-2">
                    {queueStatus.pending > 0 && (
                      <Badge variant="secondary" className="text-xs">
                        {queueStatus.pending} queued
                      </Badge>
                    )}
                    {queueStatus.failed > 0 && (
                      <Badge variant="destructive" className="text-xs">
                        {queueStatus.failed} failed
                      </Badge>
                    )}
                    {queueStatus.completed > 0 && (
                      <Badge variant="default" className="text-xs">
                        {queueStatus.completed} done
                      </Badge>
                    )}
                  </div>
                </div>
                {isUploading && (
                  <div className="space-y-1">
                    <Progress value={50} className="h-2" />
                    <p className="text-xs text-muted-foreground">Uploading photos...</p>
                  </div>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-2 border-t">
              {connectionStatus === 'online' && pendingCount > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={sync}
                  disabled={isSyncing}
                  className="flex-1"
                >
                  <RefreshCw className={`w-3 h-3 mr-1 ${isSyncing ? 'animate-spin' : ''}`} />
                  Sync Now
                </Button>
              )}
              {connectionStatus === 'online' && queueStatus.pending > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={processQueue}
                  disabled={isUploading}
                  className="flex-1"
                >
                  <Image className="w-3 h-3 mr-1" />
                  Upload Photos
                </Button>
              )}
              {queueStatus.failed > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={retryFailed}
                  disabled={isUploading}
                  className="flex-1"
                >
                  <RefreshCw className="w-3 h-3 mr-1" />
                  Retry Failed
                </Button>
              )}
            </div>

            {/* Status Messages */}
            {/* Status Messages */}
            {connectionStatus === 'offline' && totalPending > 0 && (
              <div className="flex items-start gap-2 p-2 bg-muted rounded text-xs">
                <AlertCircle className="w-4 h-4 text-warning mt-0.5" />
                <p className="text-muted-foreground">
                  {totalPending} change{totalPending !== 1 ? 's' : ''} will sync automatically when connection is restored
                </p>
              </div>
            )}
            
            {/* Development Debug Info */}
            {import.meta.env.DEV && (
              <div className="pt-2 border-t text-xs text-muted-foreground space-y-1">
                <p>Debug: {debugInfo}</p>
                <p>Show: {shouldShow ? 'Yes' : 'No'}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </PopoverContent>
    </Popover>
  );
}
