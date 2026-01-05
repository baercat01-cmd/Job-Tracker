import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { MapPin, Calendar, X, ExternalLink, Camera } from 'lucide-react';
import { formatCoordinates } from '@/lib/geolocation';
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
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);

  useEffect(() => {
    loadPhotos();
  }, [job.id]);

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

  if (photos.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Camera className="w-12 h-12 mx-auto mb-4 opacity-50 text-muted-foreground" />
          <p className="text-muted-foreground">No photos uploaded yet</p>
          <p className="text-xs text-muted-foreground mt-2">
            Photos will appear here when field workers upload them
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
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
    </div>
  );
}
