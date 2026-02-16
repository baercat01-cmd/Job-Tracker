import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { Save, Settings2, Loader2, Key, FolderOpen } from 'lucide-react';
import { FunctionsHttpError } from '@supabase/supabase-js';

interface ZohoSettings {
  id: string;
  workdrive_client_id: string | null;
  workdrive_client_secret: string | null;
  workdrive_refresh_token: string | null;
  martin_builder_org_id: string | null;
}

export function ZohoWorkDriveSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<ZohoSettings | null>(null);
  
  const [wdClientId, setWdClientId] = useState('');
  const [wdClientSecret, setWdClientSecret] = useState('');
  const [wdRefreshToken, setWdRefreshToken] = useState('');
  const [martinBuilderOrgId, setMartinBuilderOrgId] = useState('');

  const [showWdGrantCodeDialog, setShowWdGrantCodeDialog] = useState(false);
  const [wdGrantCode, setWdGrantCode] = useState('');
  const [exchangingWdToken, setExchangingWdToken] = useState(false);
  const [hasNewWdRefreshToken, setHasNewWdRefreshToken] = useState(false);

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
        setWdClientId(data.workdrive_client_id || '');
        setWdClientSecret(data.workdrive_client_secret ? '••••••••' : '');
        setWdRefreshToken(data.workdrive_refresh_token ? '••••••••' : '');
        setMartinBuilderOrgId(data.martin_builder_org_id || '');
      }
    } catch (error: any) {
      console.error('Error loading WorkDrive settings:', error);
      toast.error('Failed to load settings');
    } finally {
      setLoading(false);
    }
  }

  async function saveSettings() {
    if (!wdClientId || !wdClientSecret || !wdRefreshToken) {
      toast.error('Please fill in all required WorkDrive fields');
      return;
    }

    const updateData: any = {
      workdrive_client_id: wdClientId,
    };

    if (wdClientSecret !== '••••••••') {
      updateData.workdrive_client_secret = wdClientSecret;
    }
    if (wdRefreshToken !== '••••••••' || hasNewWdRefreshToken) {
      updateData.workdrive_refresh_token = wdRefreshToken;
    }
    if (martinBuilderOrgId) {
      updateData.martin_builder_org_id = martinBuilderOrgId;
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
          .insert([updateData]);

        if (error) throw new Error(error.message || 'Failed to insert settings');
      }

      toast.success('✅ WorkDrive settings saved successfully');
      setHasNewWdRefreshToken(false);
      await loadSettings();
    } catch (error: any) {
      console.error('Error saving settings:', error);
      toast.error(`Failed to save: ${error.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function exchangeWorkDriveGrantCode() {
    if (!wdGrantCode || !wdClientId || !wdClientSecret) {
      toast.error('Please fill in WorkDrive Client ID, Client Secret, and Grant Code');
      return;
    }

    const actualClientSecret = wdClientSecret === '••••••••' ? '' : wdClientSecret;
    if (!actualClientSecret) {
      toast.error('Please enter your actual WorkDrive Client Secret first (not the masked value)');
      return;
    }

    setExchangingWdToken(true);
    try {
      const { data, error } = await supabase.functions.invoke('zoho-sync', {
        body: {
          action: 'exchange_grant_code',
          grantCode: wdGrantCode,
          clientId: wdClientId,
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

      setWdRefreshToken(data.refresh_token);
      setHasNewWdRefreshToken(true);
      toast.success('✅ WorkDrive Refresh token obtained! Click "Save Settings" to store it.');
      setShowWdGrantCodeDialog(false);
      setWdGrantCode('');
    } catch (error: any) {
      console.error('Error exchanging WorkDrive grant code:', error);
      toast.error(`Failed to exchange grant code: ${error.message}`);
    } finally {
      setExchangingWdToken(false);
    }
  }

  if (loading) {
    return (
      <div className="text-center py-8">
        <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-purple-600" />
        <p className="text-muted-foreground">Loading settings...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div className="bg-purple-50 border-2 border-purple-600 rounded-lg p-4 mb-6">
        <div className="flex items-start gap-3">
          <FolderOpen className="w-6 h-6 text-purple-600 mt-1" />
          <div>
            <h2 className="text-xl font-bold text-purple-900">Zoho WorkDrive Integration (Martin Builder)</h2>
            <p className="text-sm text-purple-800 mt-1">
              This page configures ONLY your Zoho WorkDrive credentials for Martin Builder's Zoho One account.
              Used for creating job folders and uploading site photos.
            </p>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-purple-600" />
            WorkDrive OAuth Credentials
          </CardTitle>
          <CardDescription className="mt-2">
            Enter your OAuth credentials from Martin Builder's Zoho account
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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
                placeholder="Enter client secret"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="wdRefreshToken">WorkDrive Refresh Token</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowWdGrantCodeDialog(true)}
                className="h-7 bg-purple-50 hover:bg-purple-100 text-purple-700 border-purple-300"
              >
                <Key className="w-3 h-3 mr-1" />
                Exchange Grant Code
              </Button>
            </div>
            <Input
              id="wdRefreshToken"
              type="password"
              value={wdRefreshToken}
              onChange={(e) => setWdRefreshToken(e.target.value)}
              placeholder="Enter refresh token or use Grant Code exchange"
            />
            <p className="text-xs text-muted-foreground">
              Use the "Exchange Grant Code" button if you have a grant code from Zoho
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="martinBuilderOrgId">Martin Builder Organization ID (Optional)</Label>
            <Input
              id="martinBuilderOrgId"
              value={martinBuilderOrgId}
              onChange={(e) => setMartinBuilderOrgId(e.target.value.trim())}
              placeholder="901282564 (optional)"
            />
            <p className="text-xs text-purple-600">
              ℹ️ Only needed if you want to sync Zoho Books data from Martin Builder. Leave blank for WorkDrive only.
            </p>
          </div>

          <div className="flex justify-end pt-4 border-t">
            <Button onClick={saveSettings} disabled={saving} className="bg-purple-600 hover:bg-purple-700">
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

      <Card className="bg-purple-50 border-purple-200">
        <CardHeader>
          <CardTitle className="text-sm">How to get WorkDrive credentials</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <div className="bg-yellow-50 border border-yellow-300 rounded p-3 mb-3">
            <p className="font-bold text-yellow-900">⚠️ IMPORTANT: Use Martin Builder Account</p>
            <p className="text-yellow-800 text-xs mt-1">Make sure you're logged into Zoho with the MARTIN BUILDER email when generating these credentials!</p>
          </div>
          <ol className="list-decimal list-inside space-y-2 text-slate-700">
            <li>Log into <a href="https://api-console.zoho.com/" target="_blank" className="text-purple-600 hover:underline font-semibold">Zoho API Console</a> with <strong className="text-purple-700">Martin Builder email</strong></li>
            <li>Create a new "Server-based Application"</li>
            <li>Copy your <strong>Client ID</strong> and <strong>Client Secret</strong></li>
            <li>Generate a <strong>Grant Code</strong> with scope: <code className="bg-white px-1 rounded">WorkDrive.files.ALL</code></li>
            <li>Use the <strong>"Exchange Grant Code"</strong> button above to get your Refresh Token</li>
            <li>Click "Save Settings"</li>
          </ol>
        </CardContent>
      </Card>

      <Dialog open={showWdGrantCodeDialog} onOpenChange={setShowWdGrantCodeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="w-5 h-5 text-purple-600" />
              Exchange WorkDrive Grant Code
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 text-sm">
              <p className="text-purple-900 font-semibold mb-1">Instructions:</p>
              <ol className="list-decimal list-inside space-y-1 text-purple-800">
                <li>Make sure you've entered your WorkDrive Client ID and Client Secret above</li>
                <li>Paste your Martin Builder Zoho Grant Code below</li>
                <li>Click "Exchange for Refresh Token"</li>
                <li>The refresh token will automatically populate in the form</li>
                <li>Click "Save Settings" to store everything</li>
              </ol>
            </div>

            <div className="space-y-2">
              <Label htmlFor="wdGrantCode">Grant Code (from Martin Builder account)</Label>
              <Input
                id="wdGrantCode"
                value={wdGrantCode}
                onChange={(e) => setWdGrantCode(e.target.value)}
                placeholder="1000.xxxxxxxxxxxxx.yyyyyyyyyyyyyy"
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Paste the grant code with scope: <code className="bg-purple-100 px-1 rounded">WorkDrive.files.ALL</code>
              </p>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowWdGrantCodeDialog(false);
                  setWdGrantCode('');
                }}
                disabled={exchangingWdToken}
              >
                Cancel
              </Button>
              <Button
                onClick={exchangeWorkDriveGrantCode}
                disabled={exchangingWdToken || !wdGrantCode || !wdClientId || !wdClientSecret}
                className="bg-purple-600 hover:bg-purple-700"
              >
                {exchangingWdToken ? (
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
