// Minimal sync indicator - only shows during active sync/upload operations

import { useOfflineSync } from '@/hooks/useOfflineSync';
import { usePhotoUpload } from '@/hooks/usePhotoUpload';
import { useConnectionStatus } from '@/lib/offline-manager';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Cloud, CloudOff, RefreshCw, Image } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

export function SyncStatusDetailed() {
  const { isSyncing, pendingCount, syncProgress, sync } = useOfflineSync();
  const { queueStatus, isUploading, retryFailed, processQueue } = usePhotoUpload();
  const connectionStatus = useConnectionStatus();

  // ONLY show when actively syncing or uploading - nothing else
  if (!isSyncing && !isUploading) {
    return null;
  }

  // Simple, minimal indicator - just shows what's happening
  return (
    <div className="fixed bottom-4 right-4 z-40">
      <Popover>
        <PopoverTrigger asChild>
          <button className="flex items-center gap-1.5 px-2.5 py-1.5 bg-primary/10 hover:bg-primary/20 backdrop-blur-sm border border-primary/20 rounded-full text-xs font-medium text-primary transition-all duration-200 shadow-sm cursor-pointer">
            <RefreshCw className="w-3 h-3 animate-spin" />
            <span>
              {isSyncing && isUploading
                ? 'Syncing'
                : isSyncing
                ? 'Syncing'
                : 'Uploading'}
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-72" align="end">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold">Sync Status</h4>
              <Badge variant={connectionStatus === 'online' ? 'default' : 'secondary'} className="text-xs">
                {connectionStatus === 'online' ? (
                  <Cloud className="w-3 h-3 mr-1" />
                ) : (
                  <CloudOff className="w-3 h-3 mr-1" />
                )}
                {connectionStatus}
              </Badge>
            </div>

            {/* Data Sync Progress */}
            {isSyncing && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Syncing data</span>
                  {syncProgress && (
                    <span className="font-medium">
                      {syncProgress.completed}/{syncProgress.total}
                    </span>
                  )}
                </div>
                {syncProgress && (
                  <Progress
                    value={(syncProgress.completed / syncProgress.total) * 100}
                    className="h-1.5"
                  />
                )}
              </div>
            )}

            {/* Photo Upload Progress */}
            {isUploading && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <Image className="w-3 h-3" />
                    <span className="text-muted-foreground">Uploading photos</span>
                  </div>
                  <span className="font-medium">
                    {queueStatus.completed}/{queueStatus.total}
                  </span>
                </div>
                <Progress value={50} className="h-1.5" />
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
