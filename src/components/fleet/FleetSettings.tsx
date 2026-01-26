import { useFleetAuth } from '@/stores/fleetAuthStore';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Users, Building2, Wrench, Archive } from 'lucide-react';
import { UserManagementTab } from './settings/UserManagementTab';
import { VendorManagementTab } from './settings/VendorManagementTab';
import { ChecklistManagementTab } from './settings/ChecklistManagementTab';
import { ArchivedVehiclesTab } from './settings/ArchivedVehiclesTab';
import { Button } from '@/components/ui/button';

interface FleetSettingsProps {
  onClose: () => void;
  onLogout: () => void;
}

export function FleetSettings({ onClose, onLogout }: FleetSettingsProps) {
  const { user } = useFleetAuth();

  return (
    <div className="p-4 max-w-6xl mx-auto">
      <Tabs defaultValue="users" className="w-full">
        <TabsList className="grid w-full grid-cols-4 h-12 bg-slate-200">
          <TabsTrigger value="users" className="font-bold data-[state=active]:bg-yellow-600 data-[state=active]:text-black">
            <Users className="w-4 h-4 mr-2" />
            Users
          </TabsTrigger>
          <TabsTrigger value="vendors" className="font-bold data-[state=active]:bg-yellow-600 data-[state=active]:text-black">
            <Building2 className="w-4 h-4 mr-2" />
            Vendors
          </TabsTrigger>
          <TabsTrigger value="checklist" className="font-bold data-[state=active]:bg-yellow-600 data-[state=active]:text-black">
            <Wrench className="w-4 h-4 mr-2" />
            Checklist Items
          </TabsTrigger>
          <TabsTrigger value="archived" className="font-bold data-[state=active]:bg-yellow-600 data-[state=active]:text-black">
            <Archive className="w-4 h-4 mr-2" />
            Archived
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="mt-4">
          <UserManagementTab />
        </TabsContent>

        <TabsContent value="vendors" className="mt-4">
          <VendorManagementTab />
        </TabsContent>

        <TabsContent value="checklist" className="mt-4">
          <ChecklistManagementTab />
        </TabsContent>

        <TabsContent value="archived" className="mt-4">
          <ArchivedVehiclesTab />
        </TabsContent>
      </Tabs>

      <div className="mt-6 pt-6 border-t">
        <Button
          onClick={onLogout}
          variant="destructive"
          className="w-full"
        >
          Sign Out
        </Button>
      </div>
    </div>
  );
}
