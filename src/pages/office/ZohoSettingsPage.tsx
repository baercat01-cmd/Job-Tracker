import { ZohoIntegrationSettings } from '@/components/office/ZohoIntegrationSettings';

export default function ZohoSettingsPage() {
  return (
    <div className="container mx-auto py-6 px-4">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-slate-900">Zoho Integration</h1>
        <p className="text-slate-600 mt-2">
          Connect to Zoho Books to sync vendors and materials from COUNTYWIDE organization
        </p>
      </div>
      
      <ZohoIntegrationSettings />
    </div>
  );
}
