import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MapPin, Navigation, X } from 'lucide-react';
import { toast } from 'sonner';

interface Vehicle {
  id: string;
  vehicle_name: string;
  latitude: number | null;
  longitude: number | null;
  location_name: string | null;
  address: string | null;
  status: string;
  type: string;
}

interface MapViewProps {
  companyId: string;
  onClose: () => void;
}

export function MapView({ companyId, onClose }: MapViewProps) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadVehicles();
  }, [companyId]);

  async function loadVehicles() {
    try {
      const { data, error } = await supabase
        .from('vehicles')
        .select('id, vehicle_name, latitude, longitude, location_name, address, status, type')
        .eq('company_id', companyId)
        .eq('archived', false)
        .not('latitude', 'is', null)
        .not('longitude', 'is', null);

      if (error) throw error;
      setVehicles(data || []);
    } catch (error) {
      console.error('Error loading vehicles:', error);
      toast.error('Failed to load vehicle locations');
    } finally {
      setLoading(false);
    }
  }

  function openGoogleMaps(lat: number, lng: number, name: string) {
    const url = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    window.open(url, '_blank');
  }

  function getStatusColor(status: string): string {
    switch (status) {
      case 'Active':
        return 'bg-green-500';
      case 'Maintenance':
        return 'bg-yellow-500';
      case 'Out of Service':
        return 'bg-red-500';
      default:
        return 'bg-slate-500';
    }
  }

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Equipment Locations</h2>
          <p className="text-sm text-slate-600">{vehicles.length} vehicles with GPS coordinates</p>
        </div>
        <Button variant="outline" size="sm" onClick={onClose}>
          <X className="w-4 h-4 mr-2" />
          Close Map
        </Button>
      </div>

      {loading ? (
        <div className="py-12 text-center">
          <div className="w-8 h-8 border-4 border-yellow-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <p className="text-sm text-slate-600">Loading locations...</p>
        </div>
      ) : vehicles.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <MapPin className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-600 font-medium">No locations available</p>
            <p className="text-sm text-slate-500">Update vehicle locations to see them on the map</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {vehicles.map((vehicle) => (
            <Card key={vehicle.id} className="hover:shadow-lg transition-all">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h3 className="font-bold text-base">{vehicle.vehicle_name}</h3>
                    <p className="text-xs text-slate-500 capitalize">{vehicle.type.replace('_', ' ')}</p>
                  </div>
                  <div className={`w-3 h-3 rounded-full ${getStatusColor(vehicle.status)}`} />
                </div>

                <div className="space-y-2 mb-3">
                  {vehicle.location_name && (
                    <div className="flex items-start gap-2 text-sm">
                      <MapPin className="w-4 h-4 text-slate-500 mt-0.5 flex-shrink-0" />
                      <span className="font-medium">{vehicle.location_name}</span>
                    </div>
                  )}
                  {vehicle.address && (
                    <p className="text-xs text-slate-600 pl-6">{vehicle.address}</p>
                  )}
                  <p className="text-xs text-slate-500 pl-6 font-mono">
                    {vehicle.latitude?.toFixed(6)}, {vehicle.longitude?.toFixed(6)}
                  </p>
                </div>

                <Button
                  onClick={() => openGoogleMaps(vehicle.latitude!, vehicle.longitude!, vehicle.vehicle_name)}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                  size="sm"
                >
                  <Navigation className="w-4 h-4 mr-2" />
                  Open in Google Maps
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
