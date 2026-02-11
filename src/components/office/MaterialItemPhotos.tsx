import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Image as ImageIcon, X, Download, User, Calendar, Upload, FileImage } from 'lucide-react';
import { toast } from 'sonner';

interface MaterialItemPhoto {
  id: string;
  material_item_id: string;
  photo_url: string;
  uploaded_by: string | null;
  timestamp: string;
  caption: string | null;
  created_at: string;
  user_profiles?: {
    username: string;
  };
}

interface MaterialItemPhotosProps {
  materialItemId: string;
  materialName: string;
}

export function MaterialItemPhotos({ materialItemId, materialName }: MaterialItemPhotosProps) {
  const [photos, setPhotos] = useState<MaterialItemPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<MaterialItemPhoto | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadCaption, setUploadCaption] = useState('');
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  useEffect(() => {
    loadPhotos();

    // Subscribe to real-time changes
    const channel = supabase
      .channel(`material_item_photos_${materialItemId}`)
      .on('postgres_changes',
        { 
          event: '*', 
          schema: 'public', 
          table: 'material_item_photos',
          filter: `material_item_id=eq.${materialItemId}`
        },
        () => {
          loadPhotos();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [materialItemId]);

  async function loadPhotos() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('material_item_photos')
        .select(`
          *,
          user_profiles:uploaded_by(username)
        `)
        .eq('material_item_id', materialItemId)
        .order('timestamp', { ascending: false });

      if (error) throw error;
      setPhotos(data || []);
    } catch (error: any) {
      console.error('Error loading photos:', error);
    } finally {
      setLoading(false);
    }
  }

  async function deletePhoto(photoId: string) {
    if (!confirm('Delete this photo?')) return;

    try {
      const { error } = await supabase
        .from('material_item_photos')
        .delete()
        .eq('id', photoId);

      if (error) throw error;
      toast.success('Photo deleted');
      loadPhotos();
    } catch (error: any) {
      console.error('Error deleting photo:', error);
      toast.error('Failed to delete photo');
    }
  }

  function openUploadDialog() {
    setSelectedFiles([]);
    setUploadCaption('');
    setShowUploadDialog(true);
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    const imageFiles = files.filter(file => file.type.startsWith('image/'));
    
    if (imageFiles.length !== files.length) {
      toast.error('Only image files are allowed');
    }
    
    setSelectedFiles(imageFiles);
  }

  async function uploadPhotos() {
    if (selectedFiles.length === 0) {
      toast.error('Please select at least one photo');
      return;
    }

    setUploading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Upload each file
      const uploadPromises = selectedFiles.map(async (file) => {
        const fileExt = file.name.split('.').pop();
        const fileName = `${materialItemId}_${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `material-photos/${fileName}`;

        // Upload to storage
        const { error: uploadError } = await supabase.storage
          .from('job-files')
          .upload(filePath, file, {
            cacheControl: '3600',
            upsert: false,
          });

        if (uploadError) throw uploadError;

        // Get public URL
        const { data: { publicUrl } } = supabase.storage
          .from('job-files')
          .getPublicUrl(filePath);

        // Insert photo record
        const { error: insertError } = await supabase
          .from('material_item_photos')
          .insert({
            material_item_id: materialItemId,
            photo_url: publicUrl,
            uploaded_by: user.id,
            timestamp: new Date().toISOString(),
            caption: uploadCaption.trim() || null,
          });

        if (insertError) throw insertError;
      });

      await Promise.all(uploadPromises);

      toast.success(`${selectedFiles.length} photo${selectedFiles.length !== 1 ? 's' : ''} uploaded successfully`);
      setShowUploadDialog(false);
      setSelectedFiles([]);
      setUploadCaption('');
      loadPhotos();
    } catch (error: any) {
      console.error('Error uploading photos:', error);
      toast.error('Failed to upload photos');
    } finally {
      setUploading(false);
    }
  }

  if (loading) {
    return null;
  }

  return (
    <>
      <div className="flex items-center gap-1">
        {photos.length > 0 ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowDialog(true)}
            className="gap-2"
          >
            <ImageIcon className="w-4 h-4" />
            {photos.length}
          </Button>
        ) : (
          <Badge variant="outline" className="text-muted-foreground">
            <ImageIcon className="w-3 h-3 mr-1" />
            0
          </Badge>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={openUploadDialog}
          className="gap-1 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
          title="Upload photos"
        >
          <Upload className="w-4 h-4" />
        </Button>
      </div>

      {/* Photos Gallery Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-5 h-5" />
                Photos - {materialName}
              </div>
              <Button
                size="sm"
                onClick={() => {
                  setShowDialog(false);
                  openUploadDialog();
                }}
                className="bg-blue-600 hover:bg-blue-700"
              >
                <Upload className="w-4 h-4 mr-2" />
                Upload Photos
              </Button>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {photos.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <ImageIcon className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No photos attached</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {photos.map((photo) => (
                  <div
                    key={photo.id}
                    className="border rounded-lg overflow-hidden hover:shadow-lg transition-shadow"
                  >
                    <div className="relative aspect-video bg-slate-100">
                      <img
                        src={photo.photo_url}
                        alt={photo.caption || 'Material photo'}
                        className="w-full h-full object-contain cursor-pointer"
                        onClick={() => setSelectedPhoto(photo)}
                      />
                    </div>
                    
                    <div className="p-3 bg-white space-y-2">
                      {photo.caption && (
                        <p className="text-sm font-medium">{photo.caption}</p>
                      )}
                      
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        {photo.user_profiles && (
                          <div className="flex items-center gap-1">
                            <User className="w-3 h-3" />
                            {photo.user_profiles.username}
                          </div>
                        )}
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(photo.timestamp).toLocaleDateString()}
                        </div>
                      </div>

                      <div className="flex gap-2 pt-2 border-t">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => window.open(photo.photo_url, '_blank')}
                          className="flex-1"
                        >
                          <Download className="w-3 h-3 mr-1" />
                          Download
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => deletePhoto(photo.id)}
                          className="text-destructive"
                        >
                          <X className="w-3 h-3 mr-1" />
                          Delete
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Full-size photo viewer */}
      {selectedPhoto && (
        <Dialog open={!!selectedPhoto} onOpenChange={() => setSelectedPhoto(null)}>
          <DialogContent className="sm:max-w-5xl max-h-[95vh]">
            <DialogHeader>
              <DialogTitle>{selectedPhoto.caption || 'Photo'}</DialogTitle>
            </DialogHeader>
            <div className="relative">
              <img
                src={selectedPhoto.photo_url}
                alt={selectedPhoto.caption || 'Material photo'}
                className="w-full h-auto max-h-[80vh] object-contain"
              />
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Upload Photos Dialog */}
      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5" />
              Upload Photos - {materialName}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="photo-files">Select Photos</Label>
              <div className="border-2 border-dashed rounded-lg p-6 text-center hover:border-primary transition-colors cursor-pointer">
                <input
                  ref={fileInputRef}
                  type="file"
                  id="photo-files"
                  accept="image/*"
                  multiple
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full"
                >
                  <FileImage className="w-4 h-4 mr-2" />
                  Choose Image Files
                </Button>
                {selectedFiles.length > 0 && (
                  <div className="mt-3">
                    <Badge variant="secondary" className="text-sm">
                      {selectedFiles.length} file{selectedFiles.length !== 1 ? 's' : ''} selected
                    </Badge>
                    <div className="mt-2 space-y-1">
                      {selectedFiles.map((file, index) => (
                        <p key={index} className="text-xs text-muted-foreground truncate">
                          {file.name}
                        </p>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="caption">Caption (Optional)</Label>
              <Input
                id="caption"
                value={uploadCaption}
                onChange={(e) => setUploadCaption(e.target.value)}
                placeholder="Add a description for these photos..."
              />
            </div>

            <div className="flex gap-3 pt-4 border-t">
              <Button
                onClick={uploadPhotos}
                disabled={uploading || selectedFiles.length === 0}
                className="flex-1"
              >
                {uploading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    Upload {selectedFiles.length > 0 ? `${selectedFiles.length} Photo${selectedFiles.length !== 1 ? 's' : ''}` : 'Photos'}
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowUploadDialog(false)}
                disabled={uploading}
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
