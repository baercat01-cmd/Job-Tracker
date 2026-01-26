import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArchiveRestore, Truck } from 'lucide-react';
import { toast } from 'sonner';

interface Vehicle {
  id: string;
  vehicle_name: string;
  year: number | null;
  make: string | null;
  model: string | null;
  type: string;
  status: string;
}

export function ArchivedVehiclesTab() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadArchivedVehicles();
  }, []);

  async function loadArchivedVehicles() {
    try {
      const { data, error } = await supabase
        .from('vehicles')
        .select('id, vehicle_name, year, make, model, type, status')
        .eq('archived', true)
        .order('vehicle_name');

      if (error) throw error;
      setVehicles(data || []);
    } catch (error) {
      console.error('Error loading archived vehicles:', error);
      toast.error('Failed to load archived vehicles');
    } finally {
      setLoading(false);
    }
  }

  async function handleRestore(id: string, name: string) {
    if (!confirm(`Restore "${name}"?`)) return;

    try {
      const { error } = await supabase
        .from('vehicles')
        .update({ archived: false })
        .eq('id', id);

      if (error) throw error;

      toast.success('Vehicle restored');
      loadArchivedVehicles();
    } catch (error: any) {
      console.error('Error restoring vehicle:', error);
      toast.error('Failed to restore vehicle');
    }
  }

  if (loading) {
    return (
      <div className="py-12 text-center">
        <div className="w-8 h-8 border-4 border-yellow-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
        <p className="text-sm text-slate-600">Loading archived vehicles...</p>
      </div>
    );
  }

  if (vehicles.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Truck className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600 font-medium">No archived vehicles</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {vehicles.map((vehicle) => (
        <Card key={vehicle.id}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between mb-2">
              <div className="flex-1 min-w-0">
                <h4 className="font-bold truncate">{vehicle.vehicle_name}</h4>
                <p className="text-sm text-slate-600 truncate">
                  {vehicle.year && `${vehicle.year} `}
                  {vehicle.make && `${vehicle.make} `}
                  {vehicle.model}
                </p>
              </div>
              <Badge variant="outline" className="capitalize flex-shrink-0">
                {vehicle.type.replace('_', ' ')}
              </Badge>
            </div>
            <Button
              onClick={() => handleRestore(vehicle.id, vehicle.vehicle_name)}
              size="sm"
              variant="outline"
              className="w-full border-green-600 text-green-700 hover:bg-green-50"
            >
              <ArchiveRestore className="w-4 h-4 mr-2" />
              Restore
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
