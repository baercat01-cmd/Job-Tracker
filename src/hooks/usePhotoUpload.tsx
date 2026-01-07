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
import { uploadPhotoChunked, needsChunking } from '@/lib/chunked-upload';
import { withRetry, logError, showErrorToast } from '@/lib/error-handler';

export interface UploadProgress {
  photoId: string;
  progress: number;
}

export function usePhotoUpload() {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [queueStatus, setQueueStatus] = useState(getPhotoQueueStatus());
  const connectionStatus = useConnectionStatus();

  // Update queue status periodically (30 seconds to reduce UI churn)
  useEffect(() => {
    const interval = setInterval(() => {
      const newStatus = getPhotoQueueStatus();
      // Only update if status actually changed
      setQueueStatus((prev) => {
        if (
          prev.pending !== newStatus.pending ||
          prev.failed !== newStatus.failed ||
          prev.completed !== newStatus.completed
        ) {
          return newStatus;
        }
        return prev;
      });
    }, 30000); // 30 seconds

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
      // Check if file needs chunking
      const useChunking = needsChunking(file);
      
      if (useChunking) {
        console.log(`[Photo Upload] Large file detected (${file.size} bytes), using chunked upload`);
        
        // Use chunked upload for large files
        const uploadResult = await withRetry(
          async () => {
            return await uploadPhotoChunked(
              file,
              {
                jobId: metadata.jobId,
                uploadedBy: metadata.uploadedBy,
              },
              (progress) => {
                // Update progress on main thread
                requestAnimationFrame(() => {
                  setUploadProgress((prev) => ({
                    ...prev,
                    [file.name]: progress.percentage,
                  }));
                });
              }
            );
          },
          `Upload photo ${file.name}`,
          { maxRetries: 3 }
        );
        
        toast.success('Photo uploaded successfully');
        return uploadResult.path;
      }
      
      // Standard queue for smaller files
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
    } catch (error: any) {
      logError('Upload Photo', error);
      console.error('[Photo Upload] Error queueing photo:', error);
      showErrorToast(error, 'Photo upload');
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
      await withRetry(
        async () => {
          await processPhotoQueue((id, progress) => {
            // Update progress on main thread
            requestAnimationFrame(() => {
              setUploadProgress((prev) => ({ ...prev, [id]: progress }));
            });
          });
        },
        'Process photo queue',
        { maxRetries: 2 }
      );

      // Update queue status on main thread
      requestAnimationFrame(() => {
        setQueueStatus(getPhotoQueueStatus());
      });
      
      if (queueStatus.failed === 0) {
        // Quiet success - no toast
      } else {
        toast.warning(`${queueStatus.failed} photo(s) failed to upload`);
      }
    } catch (error: any) {
      logError('Process photo queue', error);
      console.error('[Photo Upload] Queue processing failed:', error);
      showErrorToast(error, 'Photo upload');
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
      await withRetry(
        async () => {
          await retryFailedPhotos((id, progress) => {
            // Update progress on main thread
            requestAnimationFrame(() => {
              setUploadProgress((prev) => ({ ...prev, [id]: progress }));
            });
          });
        },
        'Retry failed photos',
        { maxRetries: 1 } // Only retry once for manual retry
      );

      // Update queue status on main thread
      requestAnimationFrame(() => {
        setQueueStatus(getPhotoQueueStatus());
      });
      
      toast.success('Retry complete');
    } catch (error: any) {
      logError('Retry failed photos', error);
      console.error('[Photo Upload] Retry failed:', error);
      showErrorToast(error, 'Photo retry');
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
