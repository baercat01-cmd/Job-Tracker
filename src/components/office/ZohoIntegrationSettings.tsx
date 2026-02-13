import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { Save, RefreshCw, Settings2, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { FunctionsHttpError } from '@supabase/supabase-js';

interface ZohoSettings {
  id: string;
  client_id: string;
  client_secret: string;
  refresh_token: string;
  countywide_org_id: string;
  last_sync_at: string | null;
  sync_status: string;
  sync_error: string | null;
}

export function ZohoIntegrationSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [settings, setSettings] = useState<ZohoSettings | null>(null);
  
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [refreshToken, setRefreshToken] = useState('');
  const [orgId, setOrgId] = useState('');

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      const { data, error } = await supabase
        .from('zoho_integration_settings')
        .select('*')
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setSettings(data);
        setClientId(data.client_id);
        setClientSecret('••••••••'); // Mask for security
        setRefreshToken('••••••••'); // Mask for security
        setOrgId(data.countywide_org_id);
      }
    } catch (error: any) {
      console.error('Error loading Zoho settings:', error);
      toast.error('Failed to load settings');
    } finally {
      setLoading(false);
    }
  }

  async function saveSettings() {
    if (!clientId || !clientSecret || !refreshToken || !orgId) {
      toast.error('Please fill in all fields');
      return;
    }

    // Don't update masked values
    const updateData: any = {
      client_id: clientId,
      countywide_org_id: orgId,
    };

    // Only update secrets if they're not masked
    if (clientSecret !== '••••••••') {
      updateData.client_secret = clientSecret;
    }
    if (refreshToken !== '••••••••') {
      updateData.refresh_token = refreshToken;
    }

    setSaving(true);
    try {
      if (settings) {
        // Update existing
        const { error } = await supabase
          .from('zoho_integration_settings')
          .update(updateData)
          .eq('id', settings.id);

        if (error) throw error;
      } else {
        // Insert new
        const { error } = await supabase
          .from('zoho_integration_settings')
          .insert([{
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: refreshToken,
            countywide_org_id: orgId,
          }]);

        if (error) throw error;
      }

      toast.success('Zoho settings saved successfully');
      await loadSettings();
    } catch (error: any) {
      console.error('Error saving settings:', error);
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  }

  async function syncMaterials() {
    if (!settings) {
      toast.error('Please configure Zoho integration first');
      return;
    }

    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('zoho-sync', {
        body: { action: 'sync_materials' }
      });

      if (error) {
        // Extract detailed error message
        let errorMessage = error.message;
        if (error instanceof FunctionsHttpError) {
          try {
            const statusCode = error.context?.status ?? 500;
            const textContent = await error.context?.text();
            errorMessage = `[Code: ${statusCode}] ${textContent || error.message || 'Unknown error'}`;
          } catch {
            errorMessage = error.message || 'Failed to read response';
          }
        }
        throw new Error(errorMessage);
      }

      toast.success(data.message || 'Materials synced successfully');
      await loadSettings(); // Reload to get updated sync status
    } catch (error: any) {
      console.error('Error syncing materials:', error);
      toast.error(`Sync failed: ${error.message}`);
    } finally {
      setSyncing(false);
    }
  }

  if (loading) {
    return (
      <div className="text-center py-8">
        <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-600" />
        <p className="text-muted-foreground">Loading settings...</p>
      </div>
    );
  }

  const getSyncStatusBadge = () => {
    if (!settings) return null;

    switch (settings.sync_status) {
      case 'completed':
        return <Badge variant="default" className="bg-green-600"><CheckCircle2 className="w-3 h-3 mr-1" />Synced</Badge>;
      case 'syncing':
        return <Badge variant="secondary"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Syncing...</Badge>;
      case 'error':
        return <Badge variant="destructive"><AlertCircle className="w-3 h-3 mr-1" />Error</Badge>;
      default:
        return <Badge variant="outline">Not Synced</Badge>;
    }
  };

  return (
    <div className="max-w-4xl space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Settings2 className="w-5 h-5 text-blue-600" />
                Zoho Books Integration
              </CardTitle>
              <CardDescription className="mt-2">
                Configure your Zoho Books API credentials to sync vendors and materials from COUNTYWIDE organization
              </CardDescription>
            </div>
            {getSyncStatusBadge()}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Credentials Section */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-900">API Credentials</h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="clientId">Client ID</Label>
                <Input
                  id="clientId"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  placeholder="1000.XXXXXXXXXXXXX"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="clientSecret">Client Secret</Label>
                <Input
                  id="clientSecret"
                  type="password"
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  placeholder="Enter client secret"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="refreshToken">Refresh Token</Label>
              <Input
                id="refreshToken"
                type="password"
                value={refreshToken}
                onChange={(e) => setRefreshToken(e.target.value)}
                placeholder="Enter refresh token"
              />
              <p className="text-xs text-muted-foreground">
                This is the refresh token you received from Zoho OAuth flow
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="orgId">COUNTYWIDE Organization ID</Label>
              <Input
                id="orgId"
                value={orgId}
                onChange={(e) => setOrgId(e.target.value)}
                placeholder="Enter organization ID"
              />
              <p className="text-xs text-muted-foreground">
                The specific organization ID for COUNTYWIDE in Zoho Books
              </p>
            </div>
          </div>

          {/* Save Button */}
          <div className="flex justify-end pt-4 border-t">
            <Button onClick={saveSettings} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Save Credentials
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Sync Section */}
      {settings && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className="w-5 h-5 text-green-600" />
              Material Sync
            </CardTitle>
            <CardDescription>
              Sync vendors and material items from Zoho Books to your local database
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {settings.last_sync_at && (
              <div className="text-sm text-muted-foreground">
                Last synced: {new Date(settings.last_sync_at).toLocaleString()}
              </div>
            )}

            {settings.sync_error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-sm text-red-900 font-semibold">Sync Error:</p>
                <p className="text-sm text-red-700 mt-1">{settings.sync_error}</p>
              </div>
            )}

            <Button 
              onClick={syncMaterials} 
              disabled={syncing}
              variant="default"
              className="w-full"
            >
              {syncing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Syncing from Zoho Books...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Sync Materials Now
                </>
              )}
            </Button>

            <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t">
              <p>• Fetches all active vendors from COUNTYWIDE organization</p>
              <p>• Imports material items with pricing and details</p>
              <p>• Updates existing records based on SKU/name matching</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Help Section */}
      <Card className="bg-blue-50 border-blue-200">
        <CardHeader>
          <CardTitle className="text-sm">How to get your Zoho credentials</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <ol className="list-decimal list-inside space-y-2 text-slate-700">
            <li>Go to <a href="https://api-console.zoho.com/" target="_blank" className="text-blue-600 hover:underline">Zoho API Console</a></li>
            <li>Create a new "Server-based Application"</li>
            <li>Copy your <strong>Client ID</strong> and <strong>Client Secret</strong></li>
            <li>Generate a <strong>Grant Code</strong> with scopes: <code className="bg-white px-1 rounded">ZohoBooks.contacts.READ,ZohoBooks.items.READ</code></li>
            <li>Exchange the Grant Code for a <strong>Refresh Token</strong></li>
            <li>Find your Organization ID in Zoho Books settings</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
