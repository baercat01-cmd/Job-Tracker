import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Mail, Save, RefreshCw, CheckCircle, AlertCircle, Settings, Lock, Users, Database } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';

export function EmailSettings() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [hasSettings, setHasSettings] = useState(false);
  
  // IMAP Settings
  const [imapHost, setImapHost] = useState('');
  const [imapPort, setImapPort] = useState('993');
  const [imapUsername, setImapUsername] = useState('');
  const [imapPassword, setImapPassword] = useState('');
  
  // SMTP Settings
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState('587');
  const [smtpUsername, setSmtpUsername] = useState('');
  const [smtpPassword, setSmtpPassword] = useState('');
  const [smtpFromName, setSmtpFromName] = useState('');
  const [smtpFromEmail, setSmtpFromEmail] = useState('');
  
  // Sync settings
  const [syncEnabled, setSyncEnabled] = useState(true);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  
  // Sync log
  const [syncLogs, setSyncLogs] = useState<any[]>([]);
  
  // Data sync stats
  const [dataSyncStats, setDataSyncStats] = useState({
    totalJobs: 0,
    totalVendors: 0,
    totalContacts: 0,
    customerContacts: 0,
    vendorContacts: 0,
    subContacts: 0,
  });
  const [syncingData, setSyncingData] = useState(false);

  useEffect(() => {
    loadSettings();
    loadSyncLogs();
    loadDataSyncStats();
  }, [profile?.id]);

  async function loadSettings() {
    if (!profile?.id) return;

    try {
      const { data, error } = await supabase
        .from('email_settings')
        .select('*')
        .eq('user_id', profile.id)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;

      if (data) {
        setHasSettings(true);
        setImapHost(data.imap_host || '');
        setImapPort(data.imap_port?.toString() || '993');
        setImapUsername(data.imap_username || '');
        // Don't load password for security
        
        setSmtpHost(data.smtp_host || '');
        setSmtpPort(data.smtp_port?.toString() || '587');
        setSmtpUsername(data.smtp_username || '');
        // Don't load password for security
        setSmtpFromName(data.smtp_from_name || '');
        setSmtpFromEmail(data.smtp_from_email || '');
        
        setSyncEnabled(data.sync_enabled ?? true);
        setLastSyncAt(data.last_sync_at);
      }
    } catch (error: any) {
      console.error('Error loading email settings:', error);
      toast.error('Failed to load email settings');
    } finally {
      setLoading(false);
    }
  }

  async function loadSyncLogs() {
    if (!profile?.id) return;

    try {
      const { data, error } = await supabase
        .from('email_sync_log')
        .select('*')
        .eq('user_id', profile.id)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      setSyncLogs(data || []);
    } catch (error: any) {
      console.error('Error loading sync logs:', error);
    }
  }

  async function loadDataSyncStats() {
    try {
      // Count jobs
      const { count: jobsCount } = await supabase
        .from('jobs')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active');
      
      // Count vendors
      const { count: vendorsCount } = await supabase
        .from('vendors')
        .select('*', { count: 'exact', head: true });
      
      // Count total contacts
      const { count: contactsCount } = await supabase
        .from('contacts')
        .select('*', { count: 'exact', head: true });
      
      // Count by category
      const { count: customerCount } = await supabase
        .from('contacts')
        .select('*', { count: 'exact', head: true })
        .eq('category', 'Customer');
      
      const { count: vendorContactsCount } = await supabase
        .from('contacts')
        .select('*', { count: 'exact', head: true })
        .eq('category', 'Vendor');
      
      const { count: subCount } = await supabase
        .from('contacts')
        .select('*', { count: 'exact', head: true })
        .eq('category', 'Sub-Contractor');
      
      setDataSyncStats({
        totalJobs: jobsCount || 0,
        totalVendors: vendorsCount || 0,
        totalContacts: contactsCount || 0,
        customerContacts: customerCount || 0,
        vendorContacts: vendorContactsCount || 0,
        subContacts: subCount || 0,
      });
    } catch (error: any) {
      console.error('Error loading data sync stats:', error);
    }
  }

  async function syncJobCustomersToContacts() {
    setSyncingData(true);
    try {
      // Fetch all active jobs
      const { data: jobs, error: jobsError } = await supabase
        .from('jobs')
        .select('*')
        .eq('status', 'active');
      
      if (jobsError) throw jobsError;
      
      let created = 0;
      let skipped = 0;
      
      for (const job of jobs || []) {
        // Check if contact already exists for this job
        const { data: existingContact } = await supabase
          .from('contacts')
          .select('id')
          .eq('job_id', job.id)
          .eq('category', 'Customer')
          .maybeSingle();
        
        if (existingContact) {
          skipped++;
          continue;
        }
        
        // Create contact from job data
        const { error: insertError } = await supabase
          .from('contacts')
          .insert({
            name: job.client_name,
            email: null, // Will need to be filled in manually
            phone: null, // Will need to be filled in manually
            category: 'Customer',
            job_id: job.id,
            company_name: job.client_name,
            notes: `Auto-created from Job ${job.job_number || job.name}`,
            created_by: profile?.id,
          });
        
        if (!insertError) {
          created++;
        }
      }
      
      toast.success(`Synced ${created} customers from jobs (${skipped} already existed)`);
      await loadDataSyncStats();
    } catch (error: any) {
      console.error('Error syncing job customers:', error);
      toast.error('Failed to sync job customers');
    } finally {
      setSyncingData(false);
    }
  }

  async function syncVendorsToContacts() {
    setSyncingData(true);
    try {
      // Fetch all vendors
      const { data: vendors, error: vendorsError } = await supabase
        .from('vendors')
        .select('*');
      
      if (vendorsError) throw vendorsError;
      
      let created = 0;
      let updated = 0;
      
      for (const vendor of vendors || []) {
        // Check if vendor contact already exists
        const { data: existingContact } = await supabase
          .from('contacts')
          .select('id')
          .eq('email', vendor.email)
          .eq('category', 'Vendor')
          .maybeSingle();
        
        if (existingContact) {
          // Update existing
          const { error: updateError } = await supabase
            .from('contacts')
            .update({
              name: vendor.contact_person || vendor.name,
              phone: vendor.phone,
              company_name: vendor.name,
            })
            .eq('id', existingContact.id);
          
          if (!updateError) updated++;
        } else {
          // Create new
          const { error: insertError } = await supabase
            .from('contacts')
            .insert({
              name: vendor.contact_person || vendor.name,
              email: vendor.email,
              phone: vendor.phone,
              category: 'Vendor',
              company_name: vendor.name,
              notes: `Auto-synced from Vendors table`,
              created_by: profile?.id,
            });
          
          if (!insertError) created++;
        }
      }
      
      toast.success(`Synced vendors: ${created} created, ${updated} updated`);
      await loadDataSyncStats();
    } catch (error: any) {
      console.error('Error syncing vendors:', error);
      toast.error('Failed to sync vendors');
    } finally {
      setSyncingData(false);
    }
  }

  async function saveSettings() {
    if (!profile?.id) return;

    // Validation
    if (!imapHost || !imapUsername || !smtpHost || !smtpUsername || !smtpFromEmail) {
      toast.error('Please fill in all required fields');
      return;
    }

    // If settings exist but passwords are empty, don't update passwords
    const shouldUpdatePassword = !hasSettings || (imapPassword && smtpPassword);
    
    if (!hasSettings && (!imapPassword || !smtpPassword)) {
      toast.error('Please enter passwords for initial setup');
      return;
    }

    setSaving(true);
    try {
      const settingsData = {
        user_id: profile.id,
        imap_host: imapHost,
        imap_port: parseInt(imapPort),
        imap_username: imapUsername,
        smtp_host: smtpHost,
        smtp_port: parseInt(smtpPort),
        smtp_username: smtpUsername,
        smtp_from_name: smtpFromName,
        smtp_from_email: smtpFromEmail,
        sync_enabled: syncEnabled,
      };

      if (shouldUpdatePassword) {
        Object.assign(settingsData, {
          imap_password: imapPassword,
          smtp_password: smtpPassword,
        });
      }

      const { error } = await supabase
        .from('email_settings')
        .upsert(settingsData, {
          onConflict: 'user_id',
        });

      if (error) throw error;

      setHasSettings(true);
      toast.success('Email settings saved successfully');
      
      // Clear password fields for security
      setImapPassword('');
      setSmtpPassword('');
    } catch (error: any) {
      console.error('Error saving email settings:', error);
      toast.error('Failed to save email settings');
    } finally {
      setSaving(false);
    }
  }

  async function triggerSync() {
    if (!profile?.id) return;

    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('sync-emails', {
        body: { action: 'fetch' },
      });

      if (error) throw error;

      toast.success(data.message || 'Email sync completed');
      await loadSettings();
      await loadSyncLogs();
    } catch (error: any) {
      console.error('Error syncing emails:', error);
      toast.error('Failed to sync emails: ' + error.message);
    } finally {
      setSyncing(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading email settings...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Data Sync Section */}
      <Card className="border-2 border-green-200 bg-green-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="w-6 h-6 text-green-600" />
            Data Sync: Jobs, Customers & Vendors
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-white border border-green-200 rounded-lg p-4 space-y-3">
            <h3 className="font-semibold text-green-900">Current Data Status:</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="text-center p-3 bg-slate-50 rounded-lg">
                <p className="text-2xl font-bold text-slate-900">{dataSyncStats.totalJobs}</p>
                <p className="text-xs text-slate-600">Active Jobs</p>
              </div>
              <div className="text-center p-3 bg-slate-50 rounded-lg">
                <p className="text-2xl font-bold text-slate-900">{dataSyncStats.totalVendors}</p>
                <p className="text-xs text-slate-600">Vendors</p>
              </div>
              <div className="text-center p-3 bg-slate-50 rounded-lg">
                <p className="text-2xl font-bold text-slate-900">{dataSyncStats.totalContacts}</p>
                <p className="text-xs text-slate-600">Total Contacts</p>
              </div>
              <div className="text-center p-3 bg-green-50 rounded-lg border border-green-200">
                <p className="text-2xl font-bold text-green-900">{dataSyncStats.customerContacts}</p>
                <p className="text-xs text-green-700">Customer Contacts</p>
              </div>
              <div className="text-center p-3 bg-orange-50 rounded-lg border border-orange-200">
                <p className="text-2xl font-bold text-orange-900">{dataSyncStats.vendorContacts}</p>
                <p className="text-xs text-orange-700">Vendor Contacts</p>
              </div>
              <div className="text-center p-3 bg-blue-50 rounded-lg border border-blue-200">
                <p className="text-2xl font-bold text-blue-900">{dataSyncStats.subContacts}</p>
                <p className="text-xs text-blue-700">Sub-Contractor Contacts</p>
              </div>
            </div>
          </div>
          
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <h4 className="font-semibold text-yellow-900 mb-2">⚠️ Before You Sync:</h4>
            <ul className="list-disc list-inside space-y-1 text-sm text-yellow-800">
              <li>This will create contacts from your existing jobs and vendors</li>
              <li>Customer contacts need email addresses added manually in Settings → Contacts</li>
              <li>Email categorization works by matching sender email to contacts</li>
              <li>You can safely run this multiple times - existing contacts won't be duplicated</li>
            </ul>
          </div>
          
          <div className="flex gap-3">
            <Button
              onClick={syncJobCustomersToContacts}
              disabled={syncingData}
              className="flex-1"
              variant="outline"
            >
              <Users className="w-4 h-4 mr-2" />
              {syncingData ? 'Syncing...' : 'Sync Job Customers'}
            </Button>
            <Button
              onClick={syncVendorsToContacts}
              disabled={syncingData}
              className="flex-1"
              variant="outline"
            >
              <Users className="w-4 h-4 mr-2" />
              {syncingData ? 'Syncing...' : 'Sync Vendors'}
            </Button>
          </div>
          
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-sm text-blue-900">
              <strong>Next Step:</strong> After syncing, go to <strong>Settings → Contacts</strong> to add email addresses for your customers and verify vendor information.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Header */}
      <Card className="border-2 border-blue-200 bg-blue-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="w-6 h-6 text-blue-600" />
            Email Integration Settings
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-white border border-blue-200 rounded-lg p-4 space-y-2">
            <h3 className="font-semibold text-blue-900">How Email Integration Works:</h3>
            <ul className="list-disc list-inside space-y-1 text-sm text-blue-800">
              <li>Configure your IMAP/SMTP server credentials below</li>
              <li>Emails are automatically linked to Jobs if the subject contains the Job ID or sender matches the customer</li>
              <li>All sent emails are synced to your IMAP "Sent" folder and appear in Thunderbird</li>
              <li>Manual sync fetches new emails from your inbox</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Sync Status */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className="w-5 h-5" />
              Sync Status
            </CardTitle>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2">
                <Label htmlFor="sync-enabled">Auto Sync</Label>
                <Switch
                  id="sync-enabled"
                  checked={syncEnabled}
                  onCheckedChange={setSyncEnabled}
                />
              </div>
              <Button onClick={triggerSync} disabled={syncing || !hasSettings}>
                <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
                Sync Now
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {lastSyncAt ? (
            <p className="text-sm text-muted-foreground">
              Last synced: {new Date(lastSyncAt).toLocaleString()}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">Never synced</p>
          )}
        </CardContent>
      </Card>

      {/* IMAP Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            IMAP Settings (Incoming Mail)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>IMAP Host *</Label>
              <Input
                placeholder="imap.gmail.com"
                value={imapHost}
                onChange={(e) => setImapHost(e.target.value)}
              />
            </div>
            <div>
              <Label>IMAP Port *</Label>
              <Input
                type="number"
                placeholder="993"
                value={imapPort}
                onChange={(e) => setImapPort(e.target.value)}
              />
            </div>
            <div>
              <Label>Username (Email) *</Label>
              <Input
                type="email"
                placeholder="your-email@gmail.com"
                value={imapUsername}
                onChange={(e) => setImapUsername(e.target.value)}
              />
            </div>
            <div>
              <Label className="flex items-center gap-2">
                Password *
                <Lock className="w-3 h-3" />
              </Label>
              <Input
                type="password"
                placeholder={hasSettings ? '••••••••' : 'Your password'}
                value={imapPassword}
                onChange={(e) => setImapPassword(e.target.value)}
              />
              {hasSettings && (
                <p className="text-xs text-muted-foreground mt-1">
                  Leave empty to keep existing password
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* SMTP Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="w-5 h-5" />
            SMTP Settings (Outgoing Mail)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>SMTP Host *</Label>
              <Input
                placeholder="smtp.gmail.com"
                value={smtpHost}
                onChange={(e) => setSmtpHost(e.target.value)}
              />
            </div>
            <div>
              <Label>SMTP Port *</Label>
              <Input
                type="number"
                placeholder="587"
                value={smtpPort}
                onChange={(e) => setSmtpPort(e.target.value)}
              />
            </div>
            <div>
              <Label>Username (Email) *</Label>
              <Input
                type="email"
                placeholder="your-email@gmail.com"
                value={smtpUsername}
                onChange={(e) => setSmtpUsername(e.target.value)}
              />
            </div>
            <div>
              <Label className="flex items-center gap-2">
                Password *
                <Lock className="w-3 h-3" />
              </Label>
              <Input
                type="password"
                placeholder={hasSettings ? '••••••••' : 'Your password'}
                value={smtpPassword}
                onChange={(e) => setSmtpPassword(e.target.value)}
              />
              {hasSettings && (
                <p className="text-xs text-muted-foreground mt-1">
                  Leave empty to keep existing password
                </p>
              )}
            </div>
            <div>
              <Label>From Name</Label>
              <Input
                placeholder="Your Name or Company"
                value={smtpFromName}
                onChange={(e) => setSmtpFromName(e.target.value)}
              />
            </div>
            <div>
              <Label>From Email *</Label>
              <Input
                type="email"
                placeholder="your-email@gmail.com"
                value={smtpFromEmail}
                onChange={(e) => setSmtpFromEmail(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={saveSettings} disabled={saving} size="lg">
          <Save className="w-4 h-4 mr-2" />
          {saving ? 'Saving...' : 'Save Settings'}
        </Button>
      </div>

      {/* Sync Logs */}
      {syncLogs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent Sync Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {syncLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    {log.status === 'success' ? (
                      <CheckCircle className="w-5 h-5 text-green-600" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-red-600" />
                    )}
                    <div>
                      <p className="font-medium">
                        {log.sync_type === 'imap_fetch' ? 'Email Fetch' : 'Email Send'}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {new Date(log.created_at).toLocaleString()}
                      </p>
                      {log.error_message && (
                        <p className="text-sm text-red-600 mt-1">{log.error_message}</p>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    {log.status === 'success' && (
                      <div>
                        <Badge variant="outline">{log.emails_processed} processed</Badge>
                        {log.emails_categorized > 0 && (
                          <Badge variant="outline" className="ml-2 bg-green-50 text-green-700">
                            {log.emails_categorized} categorized
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
