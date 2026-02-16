import { ZohoIntegrationSettings } from '@/components/office/ZohoIntegrationSettings';
import { ZohoDataManagement } from '@/components/office/ZohoDataManagement';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Settings, Database } from 'lucide-react';

export function ZohoSettingsPage() {
  return (
    <div className="container mx-auto py-6 px-4">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-slate-900">Zoho Books Integration</h1>
        <p className="text-slate-600 mt-2">
          Connect and sync data with Zoho Books COUNTYWIDE organization
        </p>
      </div>
      
      <Tabs defaultValue="data" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="data" className="flex items-center gap-2">
            <Database className="w-4 h-4" />
            Synced Data
          </TabsTrigger>
          <TabsTrigger value="settings" className="flex items-center gap-2">
            <Settings className="w-4 h-4" />
            Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="data">
          <ZohoDataManagement />
        </TabsContent>

        <TabsContent value="settings">
          <ZohoIntegrationSettings />
        </TabsContent>
      </Tabs>
    </div>
  );
}
