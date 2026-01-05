// Detailed sync status component showing queue and photo upload progress

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

  const totalPending = pendingCount + queueStatus.pending + queueStatus.failed;
  const hasIssues = queueStatus.failed > 0;

  if (totalPending === 0 && !isSyncing && !isUploading) {
    return null;
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="fixed bottom-4 right-4 z-50 shadow-lg"
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
            {connectionStatus === 'offline' && totalPending > 0 && (
              <div className="flex items-start gap-2 p-2 bg-muted rounded text-xs">
                <AlertCircle className="w-4 h-4 text-warning mt-0.5" />
                <p className="text-muted-foreground">
                  Changes will sync automatically when connection is restored
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </PopoverContent>
    </Popover>
  );
}
