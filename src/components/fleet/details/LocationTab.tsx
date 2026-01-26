import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useFleetAuth } from '@/stores/fleetAuthStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { MapPin, Navigation, Save } from 'lucide-react';
import { toast } from 'sonner';

interface LocationTabProps {
  vehicle: any;
  onVehicleUpdated: () => void;
}

export function LocationTab({ vehicle, onVehicleUpdated }: LocationTabProps) {
  const { user } = useFleetAuth();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    location_name: vehicle.location_name || '',
    address: vehicle.address || '',
    latitude: vehicle.latitude || '',
    longitude: vehicle.longitude || '',
    notes: '',
    mileage_hours: vehicle.type === 'heavy_equipment' ? vehicle.engine_hours || '' : vehicle.current_mileage || '',
  });

  async function handleUpdateLocation() {
    setLoading(true);
    try {
      // Update vehicle location
      const { error: vehicleError } = await supabase
        .from('vehicles')
        .update({
          location_name: formData.location_name || null,
          address: formData.address || null,
          latitude: formData.latitude ? parseFloat(formData.latitude) : null,
          longitude: formData.longitude ? parseFloat(formData.longitude) : null,
          last_location_update: new Date().toISOString(),
        })
        .eq('id', vehicle.id);

      if (vehicleError) throw vehicleError;

      // Add to location history
      if (formData.latitude && formData.longitude) {
        const { error: historyError } = await supabase.from('location_history').insert({
          vehicle_id: vehicle.id,
          latitude: parseFloat(formData.latitude),
          longitude: parseFloat(formData.longitude),
          address: formData.address || null,
          notes: formData.notes || null,
          mileage_hours: formData.mileage_hours ? parseFloat(formData.mileage_hours) : null,
          updated_by: user?.username || 'unknown',
        });

        if (historyError) throw historyError;
      }

      toast.success('Location updated');
      onVehicleUpdated();
    } catch (error: any) {
      console.error('Error updating location:', error);
      toast.error('Failed to update location');
    } finally {
      setLoading(false);
    }
  }

  function getCurrentLocation() {
    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported');
      return;
    }

    toast.info('Getting your location...');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setFormData({
          ...formData,
          latitude: position.coords.latitude.toFixed(6),
          longitude: position.coords.longitude.toFixed(6),
        });
        toast.success('Location captured');
      },
      (error) => {
        console.error('Geolocation error:', error);
        toast.error('Failed to get location');
      }
    );
  }

  function openInMaps() {
    if (vehicle.latitude && vehicle.longitude) {
      const url = `https://www.google.com/maps/search/?api=1&query=${vehicle.latitude},${vehicle.longitude}`;
      window.open(url, '_blank');
    }
  }

  return (
    <div className="space-y-4">
      {vehicle.latitude && vehicle.longitude && (
        <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <MapPin className="w-5 h-5 text-blue-600" />
                <h4 className="font-bold text-blue-900">Current Location</h4>
              </div>
              {vehicle.location_name && (
                <p className="text-sm font-medium text-blue-800 mb-1">{vehicle.location_name}</p>
              )}
              {vehicle.address && (
                <p className="text-sm text-blue-700 mb-2">{vehicle.address}</p>
              )}
              <p className="text-xs font-mono text-blue-600">
                {vehicle.latitude.toFixed(6)}, {vehicle.longitude.toFixed(6)}
              </p>
              {vehicle.last_location_update && (
                <p className="text-xs text-blue-600 mt-1">
                  Last updated: {new Date(vehicle.last_location_update).toLocaleString()}
                </p>
              )}
            </div>
            <Button size="sm" onClick={openInMaps} className="bg-blue-600 hover:bg-blue-700 text-white">
              <Navigation className="w-4 h-4 mr-2" />
              Open
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        <div className="space-y-2">
          <Label>Location Name</Label>
          <Input
            placeholder="e.g., Main Warehouse, Job Site A"
            value={formData.location_name}
            onChange={(e) => setFormData({ ...formData, location_name: e.target.value })}
          />
        </div>

        <div className="space-y-2">
          <Label>Address</Label>
          <Input
            placeholder="Street address"
            value={formData.address}
            onChange={(e) => setFormData({ ...formData, address: e.target.value })}
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>GPS Coordinates</Label>
            <Button type="button" size="sm" variant="outline" onClick={getCurrentLocation}>
              <Navigation className="w-4 h-4 mr-2" />
              Get Current
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input
              placeholder="Latitude"
              value={formData.latitude}
              onChange={(e) => setFormData({ ...formData, latitude: e.target.value })}
              type="number"
              step="0.000001"
            />
            <Input
              placeholder="Longitude"
              value={formData.longitude}
              onChange={(e) => setFormData({ ...formData, longitude: e.target.value })}
              type="number"
              step="0.000001"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>{vehicle.type === 'heavy_equipment' ? 'Engine Hours' : 'Current Mileage'}</Label>
          <Input
            type="number"
            step="0.01"
            placeholder="0"
            value={formData.mileage_hours}
            onChange={(e) => setFormData({ ...formData, mileage_hours: e.target.value })}
          />
        </div>

        <div className="space-y-2">
          <Label>Notes</Label>
          <Textarea
            placeholder="Additional notes about this location update..."
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            rows={3}
          />
        </div>

        <Button
          onClick={handleUpdateLocation}
          disabled={loading}
          className="w-full bg-yellow-600 hover:bg-yellow-700 text-black"
        >
          <Save className="w-4 h-4 mr-2" />
          {loading ? 'Updating...' : 'Update Location'}
        </Button>
      </div>
    </div>
  );
}
