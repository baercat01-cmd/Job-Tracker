import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Image as ImageIcon, X, Download, User, Calendar } from 'lucide-react';
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

  if (loading) {
    return null;
  }

  if (photos.length === 0) {
    return null;
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setShowDialog(true)}
        className="gap-2"
      >
        <ImageIcon className="w-4 h-4" />
        {photos.length} Photo{photos.length !== 1 ? 's' : ''}
      </Button>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ImageIcon className="w-5 h-5" />
              Photos - {materialName}
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
    </>
  );
}
