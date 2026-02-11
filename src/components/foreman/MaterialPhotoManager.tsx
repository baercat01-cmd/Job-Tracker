import { useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Camera, Upload, Image as ImageIcon, X, ChevronLeft, ChevronRight, Download, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface MaterialPhoto {
  id: string;
  photo_url: string;
  timestamp: string;
  uploaded_by?: string;
  user_profiles?: {
    username: string;
  };
}

interface MaterialPhotoManagerProps {
  materialId: string;
  materialName: string;
  userId: string;
  showInline?: boolean;
  onPhotoChange?: () => void;
}

export function MaterialPhotoManager({ 
  materialId, 
  materialName, 
  userId,
  showInline = false,
  onPhotoChange 
}: MaterialPhotoManagerProps) {
  const [photos, setPhotos] = useState<MaterialPhoto[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showGallery, setShowGallery] = useState(false);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Load photos on mount
  useState(() => {
    loadPhotos();
  });

  async function loadPhotos() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('material_photos')
        .select(`
          id,
          photo_url,
          timestamp,
          uploaded_by,
          user_profiles:uploaded_by(username)
        `)
        .eq('material_id', materialId)
        .order('timestamp', { ascending: false });

      if (error) throw error;
      setPhotos(data || []);
    } catch (error: any) {
      console.error('Error loading photos:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handlePhotoUpload(file: File) {
    if (!file) return;

    try {
      setUploading(true);

      // Upload to storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${materialId}-${Date.now()}.${fileExt}`;
      const filePath = `materials/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('job-files')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('job-files')
        .getPublicUrl(filePath);

      // Save photo record
      const { error: dbError } = await supabase
        .from('material_photos')
        .insert({
          material_id: materialId,
          photo_url: publicUrl,
          uploaded_by: userId,
        });

      if (dbError) throw dbError;

      toast.success('Photo uploaded');
      await loadPhotos();
      if (onPhotoChange) onPhotoChange();
    } catch (error: any) {
      console.error('Error uploading photo:', error);
      toast.error('Failed to upload photo');
    } finally {
      setUploading(false);
      // Reset inputs
      if (photoInputRef.current) photoInputRef.current.value = '';
      if (cameraInputRef.current) cameraInputRef.current.value = '';
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      handlePhotoUpload(file);
    }
  }

  function openGallery(index: number = 0) {
    setCurrentPhotoIndex(index);
    setShowGallery(true);
  }

  function nextPhoto() {
    setCurrentPhotoIndex((prev) => (prev + 1) % photos.length);
  }

  function prevPhoto() {
    setCurrentPhotoIndex((prev) => (prev - 1 + photos.length) % photos.length);
  }

  async function deletePhoto(photoId: string, photoUrl: string) {
    if (!confirm('Delete this photo?')) return;

    try {
      // Delete from database
      const { error: dbError } = await supabase
        .from('material_photos')
        .delete()
        .eq('id', photoId);

      if (dbError) throw dbError;

      // Try to delete from storage (best effort)
      try {
        const path = photoUrl.split('/materials/')[1];
        if (path) {
          await supabase.storage
            .from('job-files')
            .remove([`materials/${path}`]);
        }
      } catch (storageError) {
        console.warn('Could not delete from storage:', storageError);
      }

      toast.success('Photo deleted');
      await loadPhotos();
      if (onPhotoChange) onPhotoChange();
    } catch (error: any) {
      console.error('Error deleting photo:', error);
      toast.error('Failed to delete photo');
    }
  }

  if (loading) {
    return (
      <div className="text-center text-sm text-muted-foreground py-2">
        Loading photos...
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Upload Buttons */}
      <div className="flex items-center gap-2">
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileChange}
          className="hidden"
          disabled={uploading}
        />
        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
          disabled={uploading}
        />
        
        <Button
          size="sm"
          onClick={() => cameraInputRef.current?.click()}
          disabled={uploading}
          className="flex-1"
        >
          <Camera className="w-4 h-4 mr-2" />
          {uploading ? 'Uploading...' : 'Take Photo'}
        </Button>
        
        <Button
          size="sm"
          variant="outline"
          onClick={() => photoInputRef.current?.click()}
          disabled={uploading}
          className="flex-1"
        >
          <Upload className="w-4 h-4 mr-2" />
          {uploading ? 'Uploading...' : 'Upload'}
        </Button>
      </div>

      {/* Photo Count Badge */}
      {photos.length > 0 && (
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-300">
            <ImageIcon className="w-3 h-3 mr-1" />
            {photos.length} Photo{photos.length !== 1 ? 's' : ''}
          </Badge>
        </div>
      )}

      {/* Photo Thumbnails */}
      {photos.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((photo, index) => (
            <div
              key={photo.id}
              className="relative aspect-square rounded-lg overflow-hidden border-2 border-slate-200 hover:border-blue-400 transition-colors cursor-pointer group"
              onClick={() => openGallery(index)}
            >
              <img
                src={photo.photo_url}
                alt={`Photo ${index + 1}`}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <ImageIcon className="w-6 h-6 text-white" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Photo Gallery Dialog */}
      <Dialog open={showGallery} onOpenChange={setShowGallery}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>
              {materialName} - Photo {currentPhotoIndex + 1} of {photos.length}
            </DialogTitle>
          </DialogHeader>
          
          {photos.length > 0 && (
            <div className="space-y-4">
              {/* Main Photo */}
              <div className="relative bg-black rounded-lg overflow-hidden">
                <img
                  src={photos[currentPhotoIndex].photo_url}
                  alt={`Photo ${currentPhotoIndex + 1}`}
                  className="w-full max-h-[70vh] object-contain"
                />
                
                {/* Navigation Arrows */}
                {photos.length > 1 && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={prevPhoto}
                      className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white"
                    >
                      <ChevronLeft className="w-6 h-6" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={nextPhoto}
                      className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white"
                    >
                      <ChevronRight className="w-6 h-6" />
                    </Button>
                  </>
                )}
              </div>

              {/* Photo Info and Actions */}
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                  <div>
                    Uploaded: {new Date(photos[currentPhotoIndex].timestamp).toLocaleString()}
                  </div>
                  {photos[currentPhotoIndex].user_profiles && (
                    <div>
                      By: {(photos[currentPhotoIndex].user_profiles as any)?.username}
                    </div>
                  )}
                </div>
                
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const link = document.createElement('a');
                      link.href = photos[currentPhotoIndex].photo_url;
                      link.download = `${materialName}_${currentPhotoIndex + 1}.jpg`;
                      link.click();
                    }}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download
                  </Button>
                  
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => {
                      deletePhoto(
                        photos[currentPhotoIndex].id,
                        photos[currentPhotoIndex].photo_url
                      );
                      if (photos.length === 1) {
                        setShowGallery(false);
                      } else if (currentPhotoIndex === photos.length - 1) {
                        setCurrentPhotoIndex(currentPhotoIndex - 1);
                      }
                    }}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete
                  </Button>
                </div>
              </div>

              {/* Thumbnail Strip */}
              {photos.length > 1 && (
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {photos.map((photo, index) => (
                    <div
                      key={photo.id}
                      className={`flex-shrink-0 w-20 h-20 rounded border-2 cursor-pointer ${
                        index === currentPhotoIndex
                          ? 'border-primary'
                          : 'border-slate-200'
                      }`}
                      onClick={() => setCurrentPhotoIndex(index)}
                    >
                      <img
                        src={photo.photo_url}
                        alt={`Thumbnail ${index + 1}`}
                        className="w-full h-full object-cover rounded"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
