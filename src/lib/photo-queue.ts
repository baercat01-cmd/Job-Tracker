// Photo upload queue for offline support
// Handles large photo uploads with retry logic

import { supabase } from './supabase';
import { createPhoto } from './offline-mutations';
import { isOnline } from './offline-manager';
import { normalizeImageOrientation } from './image-utils';

export interface QueuedPhoto {
  id: string;
  jobId: string;
  file: File;
  metadata: {
    photoDate: string;
    gpsLat?: number;
    gpsLng?: number;
    caption?: string;
    componentId?: string;
    dailyLogId?: string;
    timeEntryId?: string;
    uploadedBy: string;
  };
  status: 'pending' | 'uploading' | 'completed' | 'failed';
  progress: number;
  error?: string;
  retryCount: number;
  timestamp: number;
}

const STORAGE_KEY = 'photo_queue';
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000; // 2 seconds

// In-memory queue
let photoQueue: QueuedPhoto[] = [];
let isProcessing = false;

// Load queue from localStorage
export function loadPhotoQueue(): QueuedPhoto[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      photoQueue = JSON.parse(stored);
      console.log(`[Photo Queue] Loaded ${photoQueue.length} photos from storage`);
    }
  } catch (error) {
    console.error('[Photo Queue] Error loading queue:', error);
  }
  return photoQueue;
}

// Save queue to localStorage
function savePhotoQueue() {
  try {
    // Don't save file objects, just metadata
    const serializable = photoQueue.map(({ file, ...rest }) => rest);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));
  } catch (error) {
    console.error('[Photo Queue] Error saving queue:', error);
  }
}

// Add photo to queue
export async function queuePhoto(
  file: File,
  metadata: QueuedPhoto['metadata']
): Promise<string> {
  const queuedPhoto: QueuedPhoto = {
    id: `photo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    jobId: metadata.uploadedBy, // This should be jobId, fix in usage
    file,
    metadata,
    status: 'pending',
    progress: 0,
    retryCount: 0,
    timestamp: Date.now(),
  };

  photoQueue.push(queuedPhoto);
  savePhotoQueue();

  console.log(`[Photo Queue] Added photo ${queuedPhoto.id} to queue`);

  // Try to process immediately if online
  if (isOnline()) {
    processPhotoQueue();
  }

  return queuedPhoto.id;
}

// Process the photo upload queue
export async function processPhotoQueue(
  onProgress?: (id: string, progress: number) => void
): Promise<void> {
  if (isProcessing) {
    console.log('[Photo Queue] Already processing');
    return;
  }

  if (!isOnline()) {
    console.log('[Photo Queue] Offline, skipping photo upload');
    return;
  }

  isProcessing = true;

  try {
    const pendingPhotos = photoQueue.filter(
      (p) => p.status === 'pending' || p.status === 'failed'
    );

    console.log(`[Photo Queue] Processing ${pendingPhotos.length} photos`);

    for (const queuedPhoto of pendingPhotos) {
      try {
        await uploadQueuedPhoto(queuedPhoto, onProgress);
      } catch (error) {
        console.error(`[Photo Queue] Failed to upload photo ${queuedPhoto.id}:`, error);
      }

      // Small delay between uploads
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    // Remove completed photos from queue
    photoQueue = photoQueue.filter((p) => p.status !== 'completed');
    savePhotoQueue();

    console.log('[Photo Queue] Processing complete');
  } finally {
    isProcessing = false;
  }
}

// Upload a single queued photo
async function uploadQueuedPhoto(
  queuedPhoto: QueuedPhoto,
  onProgress?: (id: string, progress: number) => void
): Promise<void> {
  if (queuedPhoto.retryCount >= MAX_RETRIES) {
    console.error(`[Photo Queue] Max retries reached for ${queuedPhoto.id}`);
    queuedPhoto.status = 'failed';
    queuedPhoto.error = 'Max retries exceeded';
    savePhotoQueue();
    return;
  }

  queuedPhoto.status = 'uploading';
  queuedPhoto.retryCount++;
  savePhotoQueue();

  try {
    // Normalize EXIF orientation before upload — bakes rotation into pixel data
    // so Supabase CDN (which strips EXIF) always serves correctly-oriented images
    const orientedFile = await normalizeImageOrientation(queuedPhoto.file);

    // Upload to Supabase Storage
    const fileName = `${Date.now()}_${queuedPhoto.file.name}`;
    const filePath = `${queuedPhoto.metadata.uploadedBy}/${fileName}`;

    onProgress?.(queuedPhoto.id, 10);

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('job-files')
      .upload(filePath, orientedFile, {
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) throw uploadError;

    onProgress?.(queuedPhoto.id, 50);

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('job-files')
      .getPublicUrl(uploadData.path);

    onProgress?.(queuedPhoto.id, 75);

    // Create photo record in database
    const { error: dbError } = await createPhoto({
      job_id: queuedPhoto.metadata.uploadedBy, // Fix: should use proper job_id
      photo_url: urlData.publicUrl,
      photo_date: queuedPhoto.metadata.photoDate,
      gps_lat: queuedPhoto.metadata.gpsLat,
      gps_lng: queuedPhoto.metadata.gpsLng,
      caption: queuedPhoto.metadata.caption,
      component_id: queuedPhoto.metadata.componentId,
      daily_log_id: queuedPhoto.metadata.dailyLogId,
      time_entry_id: queuedPhoto.metadata.timeEntryId,
      uploaded_by: queuedPhoto.metadata.uploadedBy,
    });

    if (dbError) throw dbError;

    onProgress?.(queuedPhoto.id, 100);

    queuedPhoto.status = 'completed';
    queuedPhoto.progress = 100;
    console.log(`[Photo Queue] ✓ Uploaded photo ${queuedPhoto.id}`);
  } catch (error) {
    console.error(`[Photo Queue] Upload failed for ${queuedPhoto.id}:`, error);
    queuedPhoto.status = 'failed';
    queuedPhoto.error = error instanceof Error ? error.message : 'Upload failed';

    // Retry after delay if we haven't hit max retries
    if (queuedPhoto.retryCount < MAX_RETRIES) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
      return uploadQueuedPhoto(queuedPhoto, onProgress);
    }
  } finally {
    savePhotoQueue();
  }
}

// Get queue status
export function getPhotoQueueStatus(): {
  total: number;
  pending: number;
  uploading: number;
  failed: number;
  completed: number;
} {
  return {
    total: photoQueue.length,
    pending: photoQueue.filter((p) => p.status === 'pending').length,
    uploading: photoQueue.filter((p) => p.status === 'uploading').length,
    failed: photoQueue.filter((p) => p.status === 'failed').length,
    completed: photoQueue.filter((p) => p.status === 'completed').length,
  };
}

// Clear completed photos from queue
export function clearCompletedPhotos(): void {
  photoQueue = photoQueue.filter((p) => p.status !== 'completed');
  savePhotoQueue();
}

// Retry failed photos
export async function retryFailedPhotos(
  onProgress?: (id: string, progress: number) => void
): Promise<void> {
  const failedPhotos = photoQueue.filter((p) => p.status === 'failed');

  for (const photo of failedPhotos) {
    photo.status = 'pending';
    photo.retryCount = 0;
    photo.error = undefined;
  }

  savePhotoQueue();
  await processPhotoQueue(onProgress);
}

// Enable auto-upload when coming online
export function enableAutoPhotoUpload(): () => void {
  const handler = async () => {
    console.log('[Photo Queue] Device came online, processing photo queue...');
    await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait for connection to stabilize
    await processPhotoQueue();
  };

  window.addEventListener('online', handler);

  // Load queue on init
  loadPhotoQueue();

  // Return cleanup function
  return () => {
    window.removeEventListener('online', handler);
  };
}
