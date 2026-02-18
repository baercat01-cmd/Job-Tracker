import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { Save, RefreshCw, Settings2, CheckCircle2, AlertCircle, Loader2, Key, Webhook, List, Trash2 } from 'lucide-react';
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
  
  // Webhook state
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhooks, setWebhooks] = useState<any>(null);
  const [webhookLoading, setWebhookLoading] = useState(false);

  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [refreshToken, setRefreshToken] = useState('');
  const [orgId, setOrgId] = useState('');

  // Grant code exchange state
  const [showGrantCodeDialog, setShowGrantCodeDialog] = useState(false);
  const [grantCode, setGrantCode] = useState('');
  const [exchangingToken, setExchangingToken] = useState(false);
  const [hasNewRefreshToken, setHasNewRefreshToken] = useState(false);

  useEffect(() => {
    loadSettings();
    listWebhooks();
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
        
        // Set default webhook URL
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
        setWebhookUrl(`${supabaseUrl}/functions/v1/zoho-webhook`);
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

  async function listWebhooks() {
    setWebhookLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('zoho-sync', {
        body: { action: 'list_webhooks' },
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

      setWebhooks(data.webhooks);
    } catch (error: any) {
      console.error('Error listing webhooks:', error);
      // Don't show error on initial load - webhooks might not be configured yet
    } finally {
      setWebhookLoading(false);
    }
  }

  async function registerWebhooks(orgType: 'countywide' | 'martin_builder') {
    setWebhookLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('zoho-sync', {
        body: {
          action: 'register_webhooks',
          orgType,
          webhookUrl,
        },
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

      toast.success(data.message, {
        description: `Registered ${data.webhooks.length} webhook(s) for ${orgType === 'countywide' ? 'Countywide' : 'Martin Builder'}`,
      });
      
      // Refresh webhook list
      await listWebhooks();
    } catch (error: any) {
      console.error('Error registering webhooks:', error);
      toast.error(`Failed to register webhooks: ${error.message}`);
    } finally {
      setWebhookLoading(false);
    }
  }

  async function unregisterWebhooks(orgType: 'countywide' | 'martin_builder') {
    if (!confirm(`Are you sure you want to unregister all webhooks for ${orgType === 'countywide' ? 'Countywide' : 'Martin Builder'}?`)) {
      return;
    }

    setWebhookLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('zoho-sync', {
        body: {
          action: 'unregister_webhooks',
          orgType,
        },
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

      toast.success(data.message, {
        description: `Deleted ${data.deleted.length} webhook(s)`,
      });
      
      // Refresh webhook list
      await listWebhooks();
    } catch (error: any) {
      console.error('Error unregistering webhooks:', error);
      toast.error(`Failed to unregister webhooks: ${error.message}`);
    } finally {
      setWebhookLoading(false);
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

      {/* Webhook Configuration */}
      {settings && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Webhook className="w-5 h-5 text-purple-600" />
              Automatic Sync via Webhooks
            </CardTitle>
            <CardDescription>
              Enable real-time sync - automatically detect changes made in Zoho Books
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Webhook URL */}
            <div className="space-y-2">
              <Label>Webhook URL</Label>
              <Input
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://your-project.supabase.co/functions/v1/zoho-webhook"
              />
              <p className="text-xs text-muted-foreground">
                This URL will receive notifications from Zoho Books when changes occur
              </p>
            </div>

            {/* Webhook Status */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold">Registered Webhooks</h4>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={listWebhooks}
                  disabled={webhookLoading}
                >
                  {webhookLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <List className="w-4 h-4" />
                  )}
                  <span className="ml-2">Refresh</span>
                </Button>
              </div>

              {webhooks && (
                <div className="space-y-4">
                  {/* Countywide Organization */}
                  <div className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h5 className="font-semibold">Countywide Organization</h5>
                        <p className="text-sm text-muted-foreground">
                          {webhooks.countywide?.length || 0} webhook(s) registered
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => registerWebhooks('countywide')}
                          disabled={webhookLoading}
                        >
                          <Webhook className="w-4 h-4 mr-2" />
                          Register
                        </Button>
                        {webhooks.countywide?.length > 0 && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => unregisterWebhooks('countywide')}
                            disabled={webhookLoading}
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Unregister All
                          </Button>
                        )}
                      </div>
                    </div>
                    {webhooks.countywide?.length > 0 && (
                      <div className="space-y-1">
                        {webhooks.countywide.map((webhook: any) => (
                          <div key={webhook.webhook_id} className="flex items-center justify-between text-sm bg-green-50 border border-green-200 rounded px-3 py-2">
                            <span className="font-mono text-xs">{webhook.event_type}</span>
                            <Badge variant="outline" className="bg-green-100">
                              {webhook.is_active ? 'Active' : 'Inactive'}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Martin Builder Organization */}
                  <div className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h5 className="font-semibold">Martin Builder Organization</h5>
                        <p className="text-sm text-muted-foreground">
                          {webhooks.martin_builder?.length || 0} webhook(s) registered
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => registerWebhooks('martin_builder')}
                          disabled={webhookLoading}
                        >
                          <Webhook className="w-4 h-4 mr-2" />
                          Register
                        </Button>
                        {webhooks.martin_builder?.length > 0 && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => unregisterWebhooks('martin_builder')}
                            disabled={webhookLoading}
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Unregister All
                          </Button>
                        )}
                      </div>
                    </div>
                    {webhooks.martin_builder?.length > 0 && (
                      <div className="space-y-1">
                        {webhooks.martin_builder.map((webhook: any) => (
                          <div key={webhook.webhook_id} className="flex items-center justify-between text-sm bg-blue-50 border border-blue-200 rounded px-3 py-2">
                            <span className="font-mono text-xs">{webhook.event_type}</span>
                            <Badge variant="outline" className="bg-blue-100">
                              {webhook.is_active ? 'Active' : 'Inactive'}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* What webhooks do */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-semibold text-blue-900 mb-2">Automatic Sync Capabilities:</h4>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>✅ <strong>Sales Order Deleted</strong> - Auto-clear references like SO #27</li>
                <li>✅ <strong>Purchase Order Deleted</strong> - Auto-clear PO references</li>
                <li>✅ <strong>Invoice Created</strong> - Auto-link invoices to materials</li>
                <li>✅ <strong>Material Updates</strong> - Sync price changes from Zoho Books</li>
                <li>✅ <strong>Order Updates</strong> - Detect status changes in real-time</li>
              </ul>
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
