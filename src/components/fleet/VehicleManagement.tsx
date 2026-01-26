import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useFleetAuth } from '@/stores/fleetAuthStore';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft,
  Settings,
  Truck,
  Construction,
  Wrench,
  Box,
  Plus,
  Map,
  Filter,
} from 'lucide-react';
import { toast } from 'sonner';
import { VehicleList } from './VehicleList';
import { AddVehicleDialog } from './AddVehicleDialog';
import { MapView } from './MapView';

interface Company {
  id: string;
  name: string;
  logo_url: string | null;
}

interface VehicleManagementProps {
  company: Company;
  onBack: () => void;
  onOpenSettings: () => void;
}

type VehicleType = 'truck' | 'heavy_equipment' | 'small_engine' | 'trailer';
type VehicleStatus = 'All' | 'Active' | 'Maintenance' | 'Out of Service' | 'Sold';

export function VehicleManagement({ company, onBack, onOpenSettings }: VehicleManagementProps) {
  const { user } = useFleetAuth();
  const [activeTab, setActiveTab] = useState<VehicleType>('truck');
  const [statusFilter, setStatusFilter] = useState<VehicleStatus>('All');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [vehicleCounts, setVehicleCounts] = useState({
    truck: 0,
    heavy_equipment: 0,
    small_engine: 0,
    trailer: 0,
  });

  // Determine which tabs to show based on company name
  const showAllCategories = !company.name.toLowerCase().includes('tri county');

  useEffect(() => {
    loadVehicleCounts();
  }, [company.id]);

  async function loadVehicleCounts() {
    try {
      const { data, error } = await supabase
        .from('vehicles')
        .select('type')
        .eq('company_id', company.id)
        .eq('archived', false);

      if (error) throw error;

      const counts = {
        truck: 0,
        heavy_equipment: 0,
        small_engine: 0,
        trailer: 0,
      };

      (data || []).forEach((vehicle) => {
        if (vehicle.type in counts) {
          counts[vehicle.type as VehicleType]++;
        }
      });

      setVehicleCounts(counts);
    } catch (error) {
      console.error('Error loading vehicle counts:', error);
    }
  }

  const statusOptions: VehicleStatus[] = ['All', 'Active', 'Maintenance', 'Out of Service', 'Sold'];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white px-3 py-2 border-b-4 border-yellow-600">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={onBack}
              className="text-white hover:text-yellow-400"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className="text-lg font-bold">{company.name}</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowMap(!showMap)}
              className={`text-white ${showMap ? 'text-yellow-400' : 'hover:text-yellow-400'}`}
            >
              <Map className="w-5 h-5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onOpenSettings}
              className="text-white hover:text-yellow-400"
            >
              <Settings className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </div>

      {showMap ? (
        <MapView companyId={company.id} onClose={() => setShowMap(false)} />
      ) : (
        <div className="p-3">
          {/* Status Filter */}
          <div className="mb-3 flex items-center gap-2 overflow-x-auto pb-2">
            <Filter className="w-4 h-4 text-slate-600 flex-shrink-0" />
            {statusOptions.map((status) => (
              <Button
                key={status}
                variant={statusFilter === status ? 'default' : 'outline'}
                size="sm"
                onClick={() => setStatusFilter(status)}
                className={`flex-shrink-0 ${
                  statusFilter === status
                    ? 'bg-yellow-600 text-black hover:bg-yellow-700'
                    : 'border-slate-300 hover:border-yellow-600'
                }`}
              >
                {status}
              </Button>
            ))}
          </div>

          {/* Vehicle Type Tabs */}
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as VehicleType)}>
            <TabsList className="grid w-full grid-cols-4 h-12 bg-slate-200 mb-3">
              <TabsTrigger
                value="truck"
                className="font-bold data-[state=active]:bg-yellow-600 data-[state=active]:text-black"
              >
                <Truck className="w-4 h-4 mr-1" />
                Trucks
                <Badge variant="secondary" className="ml-1 bg-white text-xs">
                  {vehicleCounts.truck}
                </Badge>
              </TabsTrigger>
              {showAllCategories && (
                <>
                  <TabsTrigger
                    value="heavy_equipment"
                    className="font-bold data-[state=active]:bg-yellow-600 data-[state=active]:text-black"
                  >
                    <Construction className="w-4 h-4 mr-1" />
                    Heavy Eq.
                    <Badge variant="secondary" className="ml-1 bg-white text-xs">
                      {vehicleCounts.heavy_equipment}
                    </Badge>
                  </TabsTrigger>
                  <TabsTrigger
                    value="small_engine"
                    className="font-bold data-[state=active]:bg-yellow-600 data-[state=active]:text-black"
                  >
                    <Wrench className="w-4 h-4 mr-1" />
                    Small Eng.
                    <Badge variant="secondary" className="ml-1 bg-white text-xs">
                      {vehicleCounts.small_engine}
                    </Badge>
                  </TabsTrigger>
                  <TabsTrigger
                    value="trailer"
                    className="font-bold data-[state=active]:bg-yellow-600 data-[state=active]:text-black"
                  >
                    <Box className="w-4 h-4 mr-1" />
                    Trailers
                    <Badge variant="secondary" className="ml-1 bg-white text-xs">
                      {vehicleCounts.trailer}
                    </Badge>
                  </TabsTrigger>
                </>
              )}
            </TabsList>

            {(['truck', 'heavy_equipment', 'small_engine', 'trailer'] as VehicleType[]).map((type) => (
              <TabsContent key={type} value={type} className="mt-0">
                <VehicleList
                  companyId={company.id}
                  vehicleType={type}
                  statusFilter={statusFilter}
                  onAddVehicle={() => setShowAddDialog(true)}
                  onVehicleUpdated={loadVehicleCounts}
                />
              </TabsContent>
            ))}
          </Tabs>

          {/* Add Vehicle FAB */}
          <Button
            onClick={() => setShowAddDialog(true)}
            className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-gradient-to-r from-yellow-600 to-yellow-500 hover:from-yellow-700 hover:to-yellow-600 text-black shadow-2xl"
          >
            <Plus className="w-6 h-6" />
          </Button>

          {/* Add Vehicle Dialog */}
          <AddVehicleDialog
            open={showAddDialog}
            onClose={() => setShowAddDialog(false)}
            companyId={company.id}
            defaultType={activeTab}
            onSuccess={() => {
              setShowAddDialog(false);
              loadVehicleCounts();
            }}
          />
        </div>
      )}
    </div>
  );
}
