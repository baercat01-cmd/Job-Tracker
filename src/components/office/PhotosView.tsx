import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MapPin, Calendar } from 'lucide-react';
import { formatCoordinates } from '@/lib/geolocation';

export function PhotosView() {
  const [photos, setPhotos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPhotos();
  }, []);

  async function loadPhotos() {
    try {
      const { data, error } = await supabase
        .from('photos')
        .select(`
          *,
          jobs(job_number, client_name),
          components(name),
          user_profiles(username, email)
        `)
        .order('timestamp', { ascending: false })
        .limit(50);

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
        <CardContent className="py-8 text-center text-muted-foreground">
          Loading photos...
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">Job Photos</h2>

      {photos.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No photos uploaded yet
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {photos.map((photo) => (
            <Card key={photo.id} className="overflow-hidden">
              <div className="bg-muted relative overflow-hidden">
                <img
                  src={photo.photo_url}
                  alt={photo.caption || 'Job photo'}
                  className="w-full h-auto block"
                  style={{ imageOrientation: 'from-image' }}
                />
                {photo.gps_lat && photo.gps_lng && (
                  <Badge className="absolute top-2 right-2" variant="secondary">
                    <MapPin className="w-3 h-3 mr-1" />
                    GPS
                  </Badge>
                )}
              </div>
              <CardContent className="pt-4 space-y-2">
                <div>
                  <p className="font-medium">{photo.jobs?.job_number}</p>
                  <p className="text-sm text-muted-foreground">
                    {photo.jobs?.client_name}
                  </p>
                </div>
                {photo.caption && (
                  <p className="text-sm">{photo.caption}</p>
                )}
                {photo.components && (
                  <Badge variant="outline">{photo.components.name}</Badge>
                )}
                <div className="flex items-center text-xs text-muted-foreground pt-2 border-t">
                  <Calendar className="w-3 h-3 mr-1" />
                  {new Date(photo.timestamp).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true
                  })}
                </div>
                {photo.gps_lat && photo.gps_lng && (
                  <div className="flex items-center text-xs text-muted-foreground">
                    <MapPin className="w-3 h-3 mr-1" />
                    {formatCoordinates(photo.gps_lat, photo.gps_lng)}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Uploaded by {photo.user_profiles?.username || photo.user_profiles?.email}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
