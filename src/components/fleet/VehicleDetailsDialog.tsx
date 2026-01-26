import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Info, Wrench, MapPin, FileText } from 'lucide-react';
import { VehicleInfoTab } from './details/VehicleInfoTab';
import { MaintenanceTab } from './details/MaintenanceTab';
import { LocationTab } from './details/LocationTab';
import { DocumentsTab } from './details/DocumentsTab';

interface Vehicle {
  id: string;
  vehicle_name: string;
  [key: string]: any;
}

interface VehicleDetailsDialogProps {
  vehicle: Vehicle;
  onClose: () => void;
  onVehicleUpdated: () => void;
}

export function VehicleDetailsDialog({
  vehicle,
  onClose,
  onVehicleUpdated,
}: VehicleDetailsDialogProps) {
  const [activeTab, setActiveTab] = useState('info');

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-3 border-b">
          <DialogTitle>{vehicle.vehicle_name}</DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="grid w-full grid-cols-4 mx-6 bg-slate-200">
            <TabsTrigger value="info" className="font-semibold data-[state=active]:bg-yellow-600 data-[state=active]:text-black">
              <Info className="w-4 h-4 mr-1" />
              Info
            </TabsTrigger>
            <TabsTrigger value="maintenance" className="font-semibold data-[state=active]:bg-yellow-600 data-[state=active]:text-black">
              <Wrench className="w-4 h-4 mr-1" />
              Maintenance
            </TabsTrigger>
            <TabsTrigger value="location" className="font-semibold data-[state=active]:bg-yellow-600 data-[state=active]:text-black">
              <MapPin className="w-4 h-4 mr-1" />
              Location
            </TabsTrigger>
            <TabsTrigger value="documents" className="font-semibold data-[state=active]:bg-yellow-600 data-[state=active]:text-black">
              <FileText className="w-4 h-4 mr-1" />
              Documents
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto px-6 py-4">
            <TabsContent value="info" className="mt-0">
              <VehicleInfoTab vehicle={vehicle} onVehicleUpdated={onVehicleUpdated} />
            </TabsContent>

            <TabsContent value="maintenance" className="mt-0">
              <MaintenanceTab vehicleId={vehicle.id} vehicleType={vehicle.type} />
            </TabsContent>

            <TabsContent value="location" className="mt-0">
              <LocationTab vehicle={vehicle} onVehicleUpdated={onVehicleUpdated} />
            </TabsContent>

            <TabsContent value="documents" className="mt-0">
              <DocumentsTab vehicleId={vehicle.id} />
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
