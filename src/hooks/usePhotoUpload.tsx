// React hook for photo uploads with offline queue support

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import {
  queuePhoto,
  processPhotoQueue,
  getPhotoQueueStatus,
  retryFailedPhotos,
  enableAutoPhotoUpload,
} from '@/lib/photo-queue';
import { useConnectionStatus } from '@/lib/offline-manager';

export interface UploadProgress {
  photoId: string;
  progress: number;
}

export function usePhotoUpload() {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [queueStatus, setQueueStatus] = useState(getPhotoQueueStatus());
  const connectionStatus = useConnectionStatus();

  // Update queue status periodically
  useEffect(() => {
    const interval = setInterval(() => {
      setQueueStatus(getPhotoQueueStatus());
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  // Enable auto-upload
  useEffect(() => {
    const cleanup = enableAutoPhotoUpload();
    return cleanup;
  }, []);

  // Process queue when coming online
  useEffect(() => {
    if (connectionStatus === 'online' && queueStatus.pending > 0) {
      handleProcessQueue();
    }
  }, [connectionStatus]);

  const uploadPhoto = async (
    file: File,
    metadata: {
      jobId: string;
      photoDate: string;
      gpsLat?: number;
      gpsLng?: number;
      caption?: string;
      componentId?: string;
      dailyLogId?: string;
      timeEntryId?: string;
      uploadedBy: string;
    }
  ): Promise<string | null> => {
    try {
      const photoId = await queuePhoto(file, metadata);

      toast.success(
        connectionStatus === 'online'
          ? 'Photo queued for upload'
          : 'Photo saved - will upload when online'
      );

      // Try to process immediately if online
      if (connectionStatus === 'online') {
        handleProcessQueue();
      }

      return photoId;
    } catch (error) {
      console.error('[Photo Upload] Error queueing photo:', error);
      toast.error('Failed to queue photo');
      return null;
    }
  };

  const uploadMultiplePhotos = async (
    files: File[],
    metadata: Omit<Parameters<typeof uploadPhoto>[1], 'file'>
  ): Promise<string[]> => {
    const photoIds: string[] = [];

    for (const file of files) {
      const photoId = await uploadPhoto(file, metadata);
      if (photoId) {
        photoIds.push(photoId);
      }
    }

    return photoIds;
  };

  const handleProcessQueue = async () => {
    if (isUploading) return;

    setIsUploading(true);

    try {
      await processPhotoQueue((id, progress) => {
        setUploadProgress((prev) => ({ ...prev, [id]: progress }));
      });

      setQueueStatus(getPhotoQueueStatus());
      
      if (queueStatus.failed === 0) {
        toast.success('All photos uploaded successfully');
      } else {
        toast.warning(`${queueStatus.failed} photo(s) failed to upload`);
      }
    } catch (error) {
      console.error('[Photo Upload] Queue processing failed:', error);
      toast.error('Failed to upload photos');
    } finally {
      setIsUploading(false);
      setUploadProgress({});
    }
  };

  const retryFailed = async () => {
    if (isUploading) return;

    setIsUploading(true);
    toast.info('Retrying failed uploads...');

    try {
      await retryFailedPhotos((id, progress) => {
        setUploadProgress((prev) => ({ ...prev, [id]: progress }));
      });

      setQueueStatus(getPhotoQueueStatus());
      toast.success('Retry complete');
    } catch (error) {
      console.error('[Photo Upload] Retry failed:', error);
      toast.error('Failed to retry uploads');
    } finally {
      setIsUploading(false);
      setUploadProgress({});
    }
  };

  return {
    uploadPhoto,
    uploadMultiplePhotos,
    processQueue: handleProcessQueue,
    retryFailed,
    isUploading,
    uploadProgress,
    queueStatus,
  };
}
