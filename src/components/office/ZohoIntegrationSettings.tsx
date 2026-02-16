import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { Save, RefreshCw, Settings2, CheckCircle2, AlertCircle, Loader2, Key } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { FunctionsHttpError } from '@supabase/supabase-js';

interface ZohoSettings {
  id: string;
  client_id: string;
  client_secret: string;
  refresh_token: string;
  countywide_org_id: string;
  workdrive_client_id: string | null;
  workdrive_client_secret: string | null;
  workdrive_refresh_token: string | null;
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
  
  // WorkDrive credentials (separate from Books)
  const [wdClientId, setWdClientId] = useState('');
  const [wdClientSecret, setWdClientSecret] = useState('');
  const [wdRefreshToken, setWdRefreshToken] = useState('');

  // Grant code exchange state
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
        setClientSecret('••••••••'); // Mask for security
        setRefreshToken('••••••••'); // Mask for security
        setOrgId(data.countywide_org_id);
        
        // Load WorkDrive credentials
        setWdClientId(data.workdrive_client_id || '');
        setWdClientSecret(data.workdrive_client_secret ? '••••••••' : '');
        setWdRefreshToken(data.workdrive_refresh_token ? '••••••••' : '');
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
      toast.error('Please fill in all Books credentials fields');
      return;
    }

    // Don't update masked values UNLESS we just got a new refresh token
    const updateData: any = {
      client_id: clientId,
      countywide_org_id: orgId,
    };

    // Only update secrets if they're not masked OR if we have a new token
    if (clientSecret !== '••••••••') {
      updateData.client_secret = clientSecret;
    }
    if (refreshToken !== '••••••••' || hasNewRefreshToken) {
      updateData.refresh_token = refreshToken;
    }
    
    // Update WorkDrive credentials if provided
    if (wdClientId) {
      updateData.workdrive_client_id = wdClientId;
    }
    if (wdClientSecret && wdClientSecret !== '••••••••') {
      updateData.workdrive_client_secret = wdClientSecret;
    }
    if (wdRefreshToken && wdRefreshToken !== '••••••••') {
      updateData.workdrive_refresh_token = wdRefreshToken;
    }

    setSaving(true);
    try {
      if (settings) {
        // Update existing
        const { error } = await supabase
          .from('zoho_integration_settings')
          .update(updateData)
          .eq('id', settings.id);

        if (error) {
          console.error('Database error:', error);
          throw new Error(error.message || 'Failed to update settings');
        }
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

        if (error) {
          console.error('Database error:', error);
          throw new Error(error.message || 'Failed to insert settings');
        }
      }

      toast.success('✅ Zoho settings saved successfully');
      setHasNewRefreshToken(false);
      await loadSettings();
    } catch (error: any) {
      console.error('Error saving settings:', error);
      toast.error(`Failed to save: ${error.message}`);
      // DON'T reload settings on error - keep user's input
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

  async function exchangeGrantCode() {
    if (!grantCode || !clientId || !clientSecret) {
      toast.error('Please fill in Client ID, Client Secret, and Grant Code');
      return;
    }

    // Unmask client secret if needed
    const actualClientSecret = clientSecret === '••••••••' ? '' : clientSecret;
    if (!actualClientSecret) {
      toast.error('Please enter your actual Client Secret first (not the masked value)');
      return;
    }

    setExchangingToken(true);
    try {
      // Exchange grant code via Edge Function (to avoid CORS issues)
      const { data, error } = await supabase.functions.invoke('zoho-sync', {
        body: {
          action: 'exchange_grant_code',
          grantCode: grantCode,
          clientId: clientId,
          clientSecret: actualClientSecret,
        }
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

      if (!data || !data.refresh_token) {
        throw new Error('No refresh token received from server');
      }

      // Save the refresh token and mark that we have a new one
      setRefreshToken(data.refresh_token);
      setHasNewRefreshToken(true);
      toast.success('✅ Refresh token obtained! Click "Save Credentials" to store it.');
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
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Settings2 className="w-5 h-5 text-blue-600" />
                Zoho Integration
              </CardTitle>
              <CardDescription className="mt-2">
                Configure your Zoho OAuth credentials for multiple accounts:
              </CardDescription>
            </div>
            {getSyncStatusBadge()}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Books Credentials Section */}
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <h3 className="text-base font-bold text-blue-900 mb-1">📚 Zoho Books (Countywide Metals)</h3>
              <p className="text-sm text-blue-800">For material sync and vendor data from COUNTYWIDE organization</p>
            </div>
            
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
              <Label htmlFor="orgId">COUNTYWIDE Organization ID</Label>
              <Input
                id="orgId"
                value={orgId}
                onChange={(e) => setOrgId(e.target.value.trim())}
                placeholder="e.g., 60012345678"
              />
              {orgId && orgId !== '' && (
                <div className="text-xs text-slate-600 bg-slate-50 p-2 rounded border">
                  <strong>Current value:</strong> <code className="bg-white px-1 rounded">{orgId}</code> ({orgId.length} characters)
                </div>
              )}
              <div className="bg-blue-50 border border-blue-200 rounded p-2 text-xs space-y-1">
                <p className="font-semibold text-blue-900">⚠️ IMPORTANT - How to find your Organization ID:</p>
                <ol className="list-decimal list-inside text-blue-800 space-y-1">
                  <li>Log in to <a href="https://books.zoho.com" target="_blank" className="underline font-semibold">Zoho Books</a></li>
                  <li>Click on <strong>Settings</strong> (gear icon in top right)</li>
                  <li>Go to <strong>Organization Profile</strong></li>
                  <li>Your Organization ID is shown at the top (long numeric value)</li>
                  <li><strong className="text-red-700">Make sure to select the COUNTYWIDE organization if you have multiple!</strong></li>
                </ol>
                <p className="text-blue-700 mt-2 font-semibold">Example format: <code className="bg-white px-1 rounded">60012345678</code> (10-11 digits)</p>
                <p className="text-red-700 mt-2"><strong>⚠️ Common mistake:</strong> Don't use company name, email, or account ID - only the numeric Organization ID!</p>
              </div>
            </div>
          </div>
          
          {/* WorkDrive Credentials Section */}
          <div className="space-y-4 pt-6 border-t-2">
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
              <h3 className="text-base font-bold text-purple-900 mb-1">📁 Zoho WorkDrive (Martin Builder's Zoho One)</h3>
              <p className="text-sm text-purple-800">For auto-creating job folders and uploading site photos</p>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="wdClientId">WorkDrive Client ID</Label>
                <Input
                  id="wdClientId"
                  value={wdClientId}
                  onChange={(e) => setWdClientId(e.target.value)}
                  placeholder="1000.XXXXXXXXXXXXX"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="wdClientSecret">WorkDrive Client Secret</Label>
                <Input
                  id="wdClientSecret"
                  type="password"
                  value={wdClientSecret}
                  onChange={(e) => setWdClientSecret(e.target.value)}
                  placeholder="Enter WorkDrive client secret"
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="wdRefreshToken">WorkDrive Refresh Token</Label>
              <Input
                id="wdRefreshToken"
                type="password"
                value={wdRefreshToken}
                onChange={(e) => setWdRefreshToken(e.target.value)}
                placeholder="Enter WorkDrive refresh token or use Grant Code exchange"
              />
              <p className="text-xs text-muted-foreground">
                ⚠️ This should be from <strong>Martin Builder's Zoho One account</strong>, not Countywide
              </p>
            </div>
            
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 text-sm">
              <p className="font-semibold text-purple-900 mb-2">🔑 Getting Martin Builder WorkDrive Credentials:</p>
              <ol className="list-decimal list-inside space-y-1 text-purple-800">
                <li>Log in to <a href="https://api-console.zoho.com/" target="_blank" className="underline font-semibold">Zoho API Console</a> with Martin Builder account</li>
                <li>Create a new "Server-based Application"</li>
                <li>Generate Grant Code with scope: <code className="bg-white px-1 rounded">WorkDrive.files.ALL</code></li>
                <li>Use the Exchange Grant Code button (top section) to get Refresh Token</li>
                <li>Paste the credentials here and Save</li>
              </ol>
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
            <li>Generate a <strong>Grant Code</strong> with scopes: <code className="bg-white px-1 rounded">ZohoBooks.contacts.READ,ZohoBooks.items.READ,WorkDrive.files.ALL</code></li>
            <li>Use the <strong>"Exchange Grant Code"</strong> button above to get your Refresh Token</li>
            <li>Find your Organization ID in Zoho Books settings</li>
          </ol>
        </CardContent>
      </Card>

      {/* Grant Code Exchange Dialog */}
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
                <li>Make sure you've entered your Client ID and Client Secret in the form above</li>
                <li>Paste your Zoho Grant Code below</li>
                <li>Click "Exchange for Refresh Token"</li>
                <li>The refresh token will automatically populate in the form</li>
                <li>Click "Save Credentials" to store everything</li>
              </ol>
            </div>

            <div className="space-y-2">
              <Label htmlFor="grantCode">Grant Code</Label>
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
