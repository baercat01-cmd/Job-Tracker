import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Camera, Images, MapPin, X, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { createNotification, getPhotosBrief } from '@/lib/notifications';
import type { Job } from '@/types';
import { getCurrentPosition } from '@/lib/geolocation';
import { getLocalDateString } from '@/lib/utils';

interface PhotoUploadProps {
  job: Job;
  userId: string;
  onBack: () => void;
}

interface PhotoQueueItem {
  blob: Blob;
  caption: string;
  timestamp: number;
  jobId: string;
}

interface Photo {
  id: string;
  photo_url: string;
  photo_date: string;
  caption: string | null;
  gps_lat: number | null;
  gps_lng: number | null;
  timestamp: string;
  uploaded_by: string;
  component_id: string | null;
  components: { name: string } | null;
  user_profiles: { username: string } | null;
}

export function PhotoUpload({ job, userId, onBack }: PhotoUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [caption, setCaption] = useState('');
  const [photoQueue, setPhotoQueue] = useState<PhotoQueueItem[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loadingPhotos, setLoadingPhotos] = useState(true);
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  
  useEffect(() => {
    loadPhotoQueue();
    loadPhotos();
  }, []);
  
  // Load existing photos for this job
  async function loadPhotos() {
    setLoadingPhotos(true);
    try {
      const { data, error } = await supabase
        .from('photos')
        .select(`
          *,
          components(name),
          user_profiles(username)
        `)
        .eq('job_id', job.id)
        .order('photo_date', { ascending: false })
        .order('timestamp', { ascending: false });

      if (error) throw error;
      setPhotos(data || []);
    } catch (error: any) {
      console.error('Error loading photos:', error);
      toast.error('Failed to load photos');
    } finally {
      setLoadingPhotos(false);
    }
  }

  // ✅ RESTORE PENDING PHOTO UPLOADS
  function loadPhotoQueue() {
    try {
      const stored = localStorage.getItem('fieldtrack_photo_queue');
      if (stored) {
        // Note: Can't restore actual blobs from localStorage
        // Just log that there were pending uploads
        console.log('ℹ️ Photo queue found but cannot restore blobs');
        // Clear stale queue
        localStorage.removeItem('fieldtrack_photo_queue');
      }
    } catch (error) {
      console.error('Error loading photo queue:', error);
    }
  }
  
  function savePhotoQueue(queue: PhotoQueueItem[]) {
    try {
      // Save metadata only (can't save blobs to localStorage)
      const metadata = queue.map(item => ({
        caption: item.caption,
        timestamp: item.timestamp,
        jobId: item.jobId,
      }));
      localStorage.setItem('fieldtrack_photo_queue', JSON.stringify(metadata));
    } catch (error) {
      console.error('Error saving photo queue:', error);
    }
  }

  async function handleCameraCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }

    // Upload single photo from camera
    await uploadPhoto(file);
  }

  async function handleGallerySelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // Filter for image files only
    const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/'));
    
    if (imageFiles.length === 0) {
      toast.error('Please select image files');
      return;
    }

    if (imageFiles.length !== files.length) {
      toast.warning(`${files.length - imageFiles.length} non-image file(s) skipped`);
    }

    // Upload multiple photos
    toast.info(`Uploading ${imageFiles.length} photo(s)...`);
    
    let successCount = 0;
    let failCount = 0;

    for (const file of imageFiles) {
      try {
        await uploadPhoto(file);
        successCount++;
      } catch (error) {
        failCount++;
      }
    }

    if (successCount > 0) {
      toast.success(`${successCount} photo(s) uploaded successfully`);
    }
    if (failCount > 0) {
      toast.error(`${failCount} photo(s) failed to upload`);
    }

    // Clear the input
    if (galleryInputRef.current) {
      galleryInputRef.current.value = '';
    }
  }

  async function uploadPhoto(fileOrBlob: File | Blob) {
    setUploading(true);

    try {
      console.log('📸 Starting photo upload...', { jobId: job.id, userId });
      
      const position = await getCurrentPosition();
      console.log('📍 GPS position:', position);
      
      const fileName = `${job.id}/${Date.now()}.jpg`;
      console.log('📁 Uploading to storage:', fileName);

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('job-files')
        .upload(fileName, fileOrBlob, {
          contentType: 'image/jpeg',
        });

      if (uploadError) {
        console.error('❌ Storage upload error:', uploadError);
        throw uploadError;
      }
      
      console.log('✅ Storage upload successful:', uploadData);

      const { data: urlData } = supabase.storage
        .from('job-files')
        .getPublicUrl(fileName);
      
      console.log('🔗 Public URL:', urlData.publicUrl);

      const today = getLocalDateString();

      const photoData = {
        job_id: job.id,
        photo_url: urlData.publicUrl,
        photo_date: today,
        gps_lat: position?.latitude,
        gps_lng: position?.longitude,
        uploaded_by: userId,
        caption: caption || null,
      };
      
      console.log('💾 Inserting to database:', photoData);

      const { data: dbData, error: dbError } = await supabase.from('photos').insert(photoData).select().single();

      if (dbError) {
        console.error('❌ Database insert error:', dbError);
        throw dbError;
      }
      
      console.log('✅ Database insert successful:', dbData);
      
      // Create notification for office
      await createNotification({
        jobId: job.id,
        createdBy: userId,
        type: 'photos',
        brief: getPhotosBrief(1, caption || undefined),
        referenceId: dbData.id,
        referenceData: { photoUrl: urlData.publicUrl, caption },
      });

      // Don't show individual success toasts for batch uploads
      // Success message is handled by handleGallerySelect
      setCaption('');
      if (cameraInputRef.current) {
        cameraInputRef.current.value = '';
      }
      
      // Clear photo queue after successful upload
      localStorage.removeItem('fieldtrack_photo_queue');
      setPhotoQueue([]);
      
      // Reload photos to show the new one
      loadPhotos();
      
    } catch (error: any) {
      console.error('❌ Photo upload failed:', error);
      toast.error(`Upload failed: ${error.message || 'Unknown error'}`);
      
      // Save to queue for retry if upload fails
      const queueItem: PhotoQueueItem = {
        blob: fileOrBlob,
        caption: caption || '',
        timestamp: Date.now(),
        jobId: job.id,
      };
      const newQueue = [...photoQueue, queueItem];
      setPhotoQueue(newQueue);
      savePhotoQueue(newQueue);
      
      toast.error('Photo saved to queue for retry');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Camera className="w-5 h-5" />
            Add Job Photos
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="caption">Caption (Optional)</Label>
            <Input
              id="caption"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Describe this photo..."
              disabled={uploading}
            />
          </div>

          {/* Camera Input - Single photo with camera capture */}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleCameraCapture}
            className="hidden"
          />

          {/* Gallery Input - Multiple photos from gallery */}
          <input
            ref={galleryInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleGallerySelect}
            className="hidden"
          />

          <div className="grid grid-cols-2 gap-3">
            <Button
              onClick={() => cameraInputRef.current?.click()}
              disabled={uploading}
              className="touch-target gradient-primary"
            >
              <Camera className="w-4 h-4 mr-2" />
              Open Camera
            </Button>
            <Button
              onClick={() => galleryInputRef.current?.click()}
              disabled={uploading}
              variant="outline"
              className="touch-target"
            >
              <Images className="w-4 h-4 mr-2" />
              Choose Photos
            </Button>
          </div>

          {uploading && (
            <div className="text-center py-4">
              <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Uploading photo(s)...</p>
            </div>
          )}

          <div className="text-xs text-muted-foreground bg-muted p-3 rounded-lg space-y-1">
            <div className="flex items-center gap-2">
              <MapPin className="w-3 h-3" />
              <span>GPS location will be automatically recorded</span>
            </div>
            <p>Photos are linked to this job and today's date</p>
          </div>
        </CardContent>
      </Card>

      {/* Existing Photos */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Images className="w-5 h-5" />
            Job Photos ({photos.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingPhotos ? (
            <div className="text-center py-8">
              <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Loading photos...</p>
            </div>
          ) : photos.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Images className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>No photos uploaded yet</p>
              <p className="text-xs mt-1">Use the camera or choose photos above</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {photos.map((photo) => (
                <button
                  key={photo.id}
                  onClick={() => setSelectedPhoto(photo)}
                  className="relative aspect-square rounded-lg overflow-hidden border-2 border-border hover:border-primary transition-colors group"
                >
                  <img
                    src={photo.photo_url}
                    alt={photo.caption || 'Job photo'}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <ExternalLink className="w-6 h-6 text-white" />
                  </div>
                  {photo.caption && (
                    <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-xs p-2 line-clamp-2">
                      {photo.caption}
                    </div>
                  )}
                  <div className="absolute top-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
                    {new Date(photo.photo_date).toLocaleDateString()}
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Photo Viewer Dialog */}
      <Dialog open={!!selectedPhoto} onOpenChange={() => setSelectedPhoto(null)}>
        <DialogContent className="max-w-4xl w-full h-[90vh] p-0 overflow-hidden">
          {selectedPhoto && (
            <div className="relative w-full h-full flex flex-col">
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b bg-card">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold truncate">
                    {selectedPhoto.caption || 'Photo'}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {new Date(selectedPhoto.photo_date).toLocaleDateString()} • {selectedPhoto.user_profiles?.username || 'Unknown'}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedPhoto(null)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>

              {/* Image */}
              <div className="flex-1 overflow-auto bg-muted/30 flex items-center justify-center p-4">
                <img
                  src={selectedPhoto.photo_url}
                  alt={selectedPhoto.caption || 'Job photo'}
                  className="max-w-full max-h-full object-contain rounded-lg"
                />
              </div>

              {/* Footer with action button */}
              <div className="p-4 border-t bg-card">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  asChild
                >
                  <a href={selectedPhoto.photo_url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Open Original
                  </a>
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
