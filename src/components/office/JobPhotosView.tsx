import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { MapPin, Calendar, X, ExternalLink, Camera, Upload, Trash2 } from 'lucide-react';
import { formatCoordinates } from '@/lib/geolocation';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import type { Job } from '@/types';

interface JobPhotosViewProps {
  job: Job;
}

interface Photo {
  id: string;
  photo_url: string;
  photo_date: string;
  caption: string | null;
  gps_lat: number | null;
  gps_lng: number | null;
  timestamp: string;
  components: { name: string } | null;
  user_profiles: { username: string } | null;
}

export function JobPhotosView({ job }: JobPhotosViewProps) {
  const { profile } = useAuth();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState<Array<{ name: string; progress: number }>>([]);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [uploadCaptions, setUploadCaptions] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadPhotos();
  }, [job.id]);

  useEffect(() => {
    // Add drag and drop event listeners
    const dropZone = dropZoneRef.current;
    if (!dropZone) return;

    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(true);
    };

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.target === dropZone) {
        setIsDragging(false);
      }
    };

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const files = Array.from(e.dataTransfer?.files || []);
      const imageFiles = files.filter(file => file.type.startsWith('image/'));
      
      if (imageFiles.length > 0) {
        handleFilesSelected(imageFiles);
      } else {
        toast.error('Please drop image files only');
      }
    };

    dropZone.addEventListener('dragenter', handleDragEnter);
    dropZone.addEventListener('dragleave', handleDragLeave);
    dropZone.addEventListener('dragover', handleDragOver);
    dropZone.addEventListener('drop', handleDrop);

    return () => {
      dropZone.removeEventListener('dragenter', handleDragEnter);
      dropZone.removeEventListener('dragleave', handleDragLeave);
      dropZone.removeEventListener('dragover', handleDragOver);
      dropZone.removeEventListener('drop', handleDrop);
    };
  }, []);

  async function loadPhotos() {
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
    } catch (error) {
      console.error('Error loading photos:', error);
    } finally {
      setLoading(false);
    }
  }

  function handleFilesSelected(files: File[]) {
    setUploadedFiles(files);
    setShowUploadDialog(true);
    
    // Initialize captions
    const captions: Record<string, string> = {};
    files.forEach((file) => {
      captions[file.name] = '';
    });
    setUploadCaptions(captions);
  }

  async function handleUpload() {
    if (!profile || uploadedFiles.length === 0) return;

    setUploading(true);
    const successCount = { count: 0 };
    const failedFiles: string[] = [];

    try {
      for (let i = 0; i < uploadedFiles.length; i++) {
        const file = uploadedFiles[i];
        
        setUploadingFiles(prev => [
          ...prev.filter(f => f.name !== file.name),
          { name: file.name, progress: 0 }
        ]);

        try {
          // Upload to storage
          const fileExt = file.name.split('.').pop();
          const fileName = `${job.id}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
          
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('job-files')
            .upload(fileName, file);

          if (uploadError) throw uploadError;

          // Get public URL
          const { data: { publicUrl } } = supabase.storage
            .from('job-files')
            .getPublicUrl(fileName);

          // Save to database
          const { error: dbError } = await supabase
            .from('photos')
            .insert([{
              job_id: job.id,
              photo_url: publicUrl,
              photo_date: new Date().toISOString().split('T')[0],
              caption: uploadCaptions[file.name] || null,
              uploaded_by: profile.id,
              gps_lat: null,
              gps_lng: null,
              timestamp: new Date().toISOString(),
            }]);

          if (dbError) throw dbError;

          successCount.count++;
          setUploadingFiles(prev => 
            prev.map(f => f.name === file.name ? { ...f, progress: 100 } : f)
          );
        } catch (error) {
          console.error(`Error uploading ${file.name}:`, error);
          failedFiles.push(file.name);
        }

        setUploadProgress(Math.round(((i + 1) / uploadedFiles.length) * 100));
      }

      // Show results
      if (successCount.count > 0) {
        toast.success(`Successfully uploaded ${successCount.count} photo${successCount.count !== 1 ? 's' : ''}`);
      }
      if (failedFiles.length > 0) {
        toast.error(`Failed to upload: ${failedFiles.join(', ')}`);
      }

      // Reset and reload
      setShowUploadDialog(false);
      setUploadedFiles([]);
      setUploadCaptions({});
      setUploadProgress(0);
      setUploadingFiles([]);
      await loadPhotos();
    } catch (error) {
      console.error('Error during upload:', error);
      toast.error('Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function deletePhoto(photoId: string, photoUrl: string) {
    if (!confirm('Delete this photo? This cannot be undone.')) return;

    try {
      // Extract file path from URL
      const urlParts = photoUrl.split('/job-files/');
      if (urlParts.length === 2) {
        const filePath = urlParts[1];
        
        // Delete from storage
        const { error: storageError } = await supabase.storage
          .from('job-files')
          .remove([filePath]);

        if (storageError) console.error('Storage deletion error:', storageError);
      }

      // Delete from database
      const { error: dbError } = await supabase
        .from('photos')
        .delete()
        .eq('id', photoId);

      if (dbError) throw dbError;

      toast.success('Photo deleted');
      setSelectedPhoto(null);
      await loadPhotos();
    } catch (error) {
      console.error('Error deleting photo:', error);
      toast.error('Failed to delete photo');
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Loading photos...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4" ref={dropZoneRef}>
      {/* Upload Zone */}
      <Card className={`border-2 border-dashed transition-all ${
        isDragging 
          ? 'border-primary bg-primary/5 scale-[1.02]' 
          : 'border-muted-foreground/25 hover:border-primary/50'
      }`}>
        <CardContent className="py-8">
          <div className="text-center space-y-4">
            <div className={`mx-auto w-16 h-16 rounded-full flex items-center justify-center transition-colors ${
              isDragging ? 'bg-primary/10' : 'bg-muted'
            }`}>
              <Upload className={`w-8 h-8 transition-colors ${
                isDragging ? 'text-primary' : 'text-muted-foreground'
              }`} />
            </div>
            <div>
              <h3 className="font-semibold text-lg">Upload Photos</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {isDragging 
                  ? 'Drop your photos here' 
                  : 'Drag and drop photos here, or click to browse'
                }
              </p>
            </div>
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  if (files.length > 0) {
                    handleFilesSelected(files);
                  }
                  e.target.value = ''; // Reset input
                }}
              />
              <Button
                onClick={() => fileInputRef.current?.click()}
                variant="outline"
                size="lg"
              >
                <Upload className="w-4 h-4 mr-2" />
                Select Photos
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Supports JPG, PNG, GIF, WebP • Multiple files allowed
            </p>
          </div>
        </CardContent>
      </Card>

      {photos.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Camera className="w-12 h-12 mx-auto mb-4 opacity-50 text-muted-foreground" />
            <p className="text-muted-foreground">No photos uploaded yet</p>
            <p className="text-xs text-muted-foreground mt-2">
              Upload photos using the area above or field workers can upload from mobile
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {photos.map((photo) => (
            <Card 
              key={photo.id} 
              className="overflow-hidden cursor-pointer hover:shadow-lg transition-shadow"
              onClick={() => setSelectedPhoto(photo)}
            >
              <div className="aspect-video bg-muted relative">
                <img
                  src={photo.photo_url}
                  alt={photo.caption || 'Job photo'}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
                {photo.gps_lat && photo.gps_lng && (
                  <Badge className="absolute top-2 right-2" variant="secondary">
                    <MapPin className="w-3 h-3 mr-1" />
                    GPS
                  </Badge>
                )}
              </div>
              <CardContent className="pt-4 space-y-2">
                {photo.caption && (
                  <p className="text-sm font-medium line-clamp-2">{photo.caption}</p>
                )}
                {photo.components && (
                  <Badge variant="outline" className="text-xs">{photo.components.name}</Badge>
                )}
                <div className="flex items-center text-xs text-muted-foreground pt-2 border-t">
                  <Calendar className="w-3 h-3 mr-1" />
                  {new Date(photo.photo_date).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric'
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  By {photo.user_profiles?.username || 'Unknown'}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

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
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deletePhoto(selectedPhoto.id, selectedPhoto.photo_url)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedPhoto(null)}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Image */}
              <div className="flex-1 overflow-auto bg-muted/30 flex items-center justify-center p-4">
                <img
                  src={selectedPhoto.photo_url}
                  alt={selectedPhoto.caption || 'Job photo'}
                  className="max-w-full max-h-full object-contain rounded-lg"
                />
              </div>

              {/* Footer */}
              <div className="p-4 border-t bg-card space-y-3">
                {selectedPhoto.components && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Component:</span>
                    <Badge variant="outline">{selectedPhoto.components.name}</Badge>
                  </div>
                )}
                {selectedPhoto.gps_lat && selectedPhoto.gps_lng && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <MapPin className="w-4 h-4" />
                    <span>{formatCoordinates(selectedPhoto.gps_lat, selectedPhoto.gps_lng)}</span>
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${selectedPhoto.gps_lat},${selectedPhoto.gps_lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline ml-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      View on Map
                    </a>
                  </div>
                )}
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

      {/* Upload Dialog */}
      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-bold">Upload Photos ({uploadedFiles.length})</h2>
              <p className="text-sm text-muted-foreground">
                Add captions to your photos before uploading
              </p>
            </div>

            {uploading ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  {uploadingFiles.map((file) => (
                    <div key={file.name} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="truncate">{file.name}</span>
                        <span className="text-muted-foreground">{file.progress}%</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-primary transition-all duration-300"
                          style={{ width: `${file.progress}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-sm font-medium">
                    <span>Overall Progress</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="h-3 bg-muted rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-green-600 transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {uploadedFiles.map((file, idx) => (
                  <Card key={idx}>
                    <CardContent className="p-4">
                      <div className="flex gap-4">
                        <div className="w-24 h-24 rounded overflow-hidden bg-muted flex-shrink-0">
                          <img
                            src={URL.createObjectURL(file)}
                            alt={file.name}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="flex-1 space-y-2">
                          <div>
                            <Label className="text-xs text-muted-foreground">File</Label>
                            <p className="text-sm font-medium truncate">{file.name}</p>
                          </div>
                          <div>
                            <Label htmlFor={`caption-${idx}`}>Caption (Optional)</Label>
                            <Textarea
                              id={`caption-${idx}`}
                              value={uploadCaptions[file.name] || ''}
                              onChange={(e) => setUploadCaptions(prev => ({
                                ...prev,
                                [file.name]: e.target.value
                              }))}
                              placeholder="Add a description..."
                              rows={2}
                              className="text-sm"
                            />
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setUploadedFiles(prev => prev.filter((_, i) => i !== idx));
                            const newCaptions = { ...uploadCaptions };
                            delete newCaptions[file.name];
                            setUploadCaptions(newCaptions);
                          }}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button
                variant="outline"
                onClick={() => {
                  setShowUploadDialog(false);
                  setUploadedFiles([]);
                  setUploadCaptions({});
                }}
                disabled={uploading}
              >
                Cancel
              </Button>
              <Button
                onClick={handleUpload}
                disabled={uploading || uploadedFiles.length === 0}
              >
                {uploading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    Upload {uploadedFiles.length} Photo{uploadedFiles.length !== 1 ? 's' : ''}
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
