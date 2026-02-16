import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { Save, RefreshCw, Settings2, CheckCircle2, AlertCircle, Loader2, Key, BookOpen } from 'lucide-react';
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

export function ZohoBooksSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [settings, setSettings] = useState<ZohoSettings | null>(null);
  
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [refreshToken, setRefreshToken] = useState('');
  const [orgId, setOrgId] = useState('');

  const [showGrantCodeDialog, setShowGrantCodeDialog] = useState(false);
  const [grantCode, setGrantCode] = useState('');
  const [exchangingToken, setExchangingToken] = useState(false);
  const [hasNewRefreshToken, setHasNewRefreshToken] = useState(false);

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
        setClientSecret('••••••••');
        setRefreshToken('••••••••');
        setOrgId(data.countywide_org_id);
      }
    } catch (error: any) {
      console.error('Error loading Zoho Books settings:', error);
      toast.error('Failed to load settings');
    } finally {
      setLoading(false);
    }
  }

  async function saveSettings() {
    if (!clientId || !clientSecret || !refreshToken || !orgId) {
      toast.error('Please fill in all required fields');
      return;
    }

    const updateData: any = {
      client_id: clientId,
      countywide_org_id: orgId,
    };

    if (clientSecret !== '••••••••') {
      updateData.client_secret = clientSecret;
    }
    if (refreshToken !== '••••••••' || hasNewRefreshToken) {
      updateData.refresh_token = refreshToken;
    }

    setSaving(true);
    try {
      if (settings) {
        const { error } = await supabase
          .from('zoho_integration_settings')
          .update(updateData)
          .eq('id', settings.id);

        if (error) throw new Error(error.message || 'Failed to update settings');
      } else {
        const { error } = await supabase
          .from('zoho_integration_settings')
          .insert([{
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: refreshToken,
            countywide_org_id: orgId,
          }]);

        if (error) throw new Error(error.message || 'Failed to insert settings');
      }

      toast.success('✅ Zoho Books settings saved successfully');
      setHasNewRefreshToken(false);
      await loadSettings();
    } catch (error: any) {
      console.error('Error saving settings:', error);
      toast.error(`Failed to save: ${error.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function syncMaterials() {
    if (!settings) {
      toast.error('Please configure Zoho Books integration first');
      return;
    }

    setSyncing(true);
    toast.info('🔄 Syncing materials from Zoho Books...');
    
    try {
      const { data, error } = await supabase.functions.invoke('zoho-sync', {
        body: { action: 'sync_materials' }
      });

      if (error) {
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
      await loadSettings();
    } catch (error: any) {
      console.error('Error syncing materials:', error);
      toast.error(`Sync failed: ${error.message}`);
    } finally {
      setSyncing(false);
    }
  }

  async function exchangeGrantCode() {
    if (!grantCode || !clientId || !clientSecret) {
      toast.error('Please fill in Client ID, Client Secret, and Grant Code');
      return;
    }

    const actualClientSecret = clientSecret === '••••••••' ? '' : clientSecret;
    if (!actualClientSecret) {
      toast.error('Please enter your actual Client Secret first (not the masked value)');
      return;
    }

    setExchangingToken(true);
    try {
      const { data, error } = await supabase.functions.invoke('zoho-sync', {
        body: {
          action: 'exchange_grant_code',
          grantCode: grantCode,
          clientId: clientId,
          clientSecret: actualClientSecret,
        }
      });

      if (error) {
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

      if (!data || !data.refresh_token) {
        throw new Error('No refresh token received from server');
      }

      setRefreshToken(data.refresh_token);
      setHasNewRefreshToken(true);
      toast.success('✅ Refresh token obtained! Click "Save Settings" to store it.');
      setShowGrantCodeDialog(false);
      setGrantCode('');
    } catch (error: any) {
      console.error('Error exchanging grant code:', error);
      toast.error(`Failed to exchange grant code: ${error.message}`);
    } finally {
      setExchangingToken(false);
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
      <div className="bg-blue-50 border-2 border-blue-600 rounded-lg p-4 mb-6">
        <div className="flex items-start gap-3">
          <BookOpen className="w-6 h-6 text-blue-600 mt-1" />
          <div>
            <h2 className="text-xl font-bold text-blue-900">Zoho Books Integration (Countywide Metals)</h2>
            <p className="text-sm text-blue-800 mt-1">
              This page configures ONLY your Zoho Books credentials for Countywide Metals organization.
              Used for syncing materials, vendors, and creating orders/quotes.
            </p>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Settings2 className="w-5 h-5 text-blue-600" />
                Books OAuth Credentials
              </CardTitle>
              <CardDescription className="mt-2">
                Enter your OAuth credentials from Countywide Metals Zoho account
              </CardDescription>
            </div>
            {getSyncStatusBadge()}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
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
            <div className="flex items-center justify-between">
              <Label htmlFor="refreshToken">Refresh Token</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowGrantCodeDialog(true)}
                className="h-7"
              >
                <Key className="w-3 h-3 mr-1" />
                Exchange Grant Code
              </Button>
            </div>
            <Input
              id="refreshToken"
              type="password"
              value={refreshToken}
              onChange={(e) => setRefreshToken(e.target.value)}
              placeholder="Enter refresh token or use Grant Code exchange"
            />
            <p className="text-xs text-muted-foreground">
              Use the "Exchange Grant Code" button if you have a grant code from Zoho
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="orgId">Countywide Organization ID</Label>
            <Input
              id="orgId"
              value={orgId}
              onChange={(e) => setOrgId(e.target.value.trim())}
              placeholder="905775078"
            />
            <p className="text-xs text-blue-600 font-semibold">
              ℹ️ This should be 905775078 for Countywide Metals
            </p>
          </div>

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
                  Save Settings
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

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
              <p>• Fetches all active vendors from Countywide organization</p>
              <p>• Imports material items with pricing and details</p>
              <p>• Updates existing records based on SKU/name matching</p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="bg-blue-50 border-blue-200">
        <CardHeader>
          <CardTitle className="text-sm">How to get Zoho Books credentials</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <div className="bg-yellow-50 border border-yellow-300 rounded p-3 mb-3">
            <p className="font-bold text-yellow-900">⚠️ IMPORTANT: Use Countywide Metals Account</p>
            <p className="text-yellow-800 text-xs mt-1">Make sure you're logged into Zoho with the COUNTYWIDE METALS email when generating these credentials!</p>
          </div>
          <ol className="list-decimal list-inside space-y-2 text-slate-700">
            <li>Log into <a href="https://api-console.zoho.com/" target="_blank" className="text-blue-600 hover:underline font-semibold">Zoho API Console</a> with <strong className="text-blue-700">Countywide Metals email</strong></li>
            <li>Create a new "Server-based Application"</li>
            <li>Copy your <strong>Client ID</strong> and <strong>Client Secret</strong></li>
            <li>Generate a <strong>Grant Code</strong> with scopes: <code className="bg-white px-1 rounded">ZohoBooks.fullaccess.all</code></li>
            <li>Use the <strong>"Exchange Grant Code"</strong> button above to get your Refresh Token</li>
            <li>Enter Organization ID: <code className="bg-white px-1 rounded font-bold">905775078</code></li>
            <li>Click "Save Settings"</li>
          </ol>
        </CardContent>
      </Card>

      <Dialog open={showGrantCodeDialog} onOpenChange={setShowGrantCodeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="w-5 h-5 text-blue-600" />
              Exchange Grant Code for Refresh Token
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
              <p className="text-blue-900 font-semibold mb-1">Instructions:</p>
              <ol className="list-decimal list-inside space-y-1 text-blue-800">
                <li>Make sure you've entered your Client ID and Client Secret above</li>
                <li>Paste your Zoho Grant Code below</li>
                <li>Click "Exchange for Refresh Token"</li>
                <li>The refresh token will automatically populate in the form</li>
                <li>Click "Save Settings" to store everything</li>
              </ol>
            </div>

            <div className="space-y-2">
              <Label htmlFor="grantCode">Grant Code (from Countywide account)</Label>
              <Input
                id="grantCode"
                value={grantCode}
                onChange={(e) => setGrantCode(e.target.value)}
                placeholder="1000.xxxxxxxxxxxxx.yyyyyyyyyyyyyy"
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Paste the grant code you received from Zoho API Console
              </p>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowGrantCodeDialog(false);
                  setGrantCode('');
                }}
                disabled={exchangingToken}
              >
                Cancel
              </Button>
              <Button
                onClick={exchangeGrantCode}
                disabled={exchangingToken || !grantCode || !clientId || !clientSecret}
              >
                {exchangingToken ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Exchanging...
                  </>
                ) : (
                  <>
                    <Key className="w-4 h-4 mr-2" />
                    Exchange for Refresh Token
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
