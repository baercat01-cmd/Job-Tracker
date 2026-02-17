import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Copy, ExternalLink, Plus, Trash2, Share2, CheckCircle, Eye, Building2, Calendar, DollarSign, FileText, Image, Settings } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import type { Job } from '@/types';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CustomerPortalPreview } from './CustomerPortalPreview';

interface CustomerPortalLink {
  id: string;
  job_id: string | null;
  customer_identifier: string;
  access_token: string;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  is_active: boolean;
  expires_at: string | null;
  last_accessed_at: string | null;
  created_at: string;
  show_proposal: boolean;
  show_payments: boolean;
  show_schedule: boolean;
  show_documents: boolean;
  show_photos: boolean;
  show_financial_summary: boolean;
  custom_message: string | null;
}

interface CustomerPortalManagementProps {
  job: Job;
}

export function CustomerPortalManagement({ job }: CustomerPortalManagementProps) {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [portalLinks, setPortalLinks] = useState<CustomerPortalLink[]>([]);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [selectedLink, setSelectedLink] = useState<CustomerPortalLink | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  // Form state - Start empty, will be populated from job/contacts
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [expiresInDays, setExpiresInDays] = useState('');
  const [existingCustomerLinks, setExistingCustomerLinks] = useState<string[]>([]);
  
  // Visibility settings
  const [showProposal, setShowProposal] = useState(true);
  const [showPayments, setShowPayments] = useState(true);
  const [showSchedule, setShowSchedule] = useState(true);
  const [showDocuments, setShowDocuments] = useState(true);
  const [showPhotos, setShowPhotos] = useState(true);
  const [showFinancialSummary, setShowFinancialSummary] = useState(true);
  const [customMessage, setCustomMessage] = useState('');

  // Preview state
  const [showPreview, setShowPreview] = useState(false);
  const [previewJobs, setPreviewJobs] = useState<any[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewSettings, setPreviewSettings] = useState<any>(null);

  useEffect(() => {
    loadPortalLinks();
    loadCustomerInfo();
  }, [job.id]);

  async function loadCustomerInfo() {
    try {
      console.log('🔍 Loading customer info for job:', job.id);
      
      // Priority 1: Try to get customer info from contacts table
      const { data: contactData } = await supabase
        .from('contacts')
        .select('*')
        .eq('job_id', job.id)
        .eq('category', 'Customer')
        .maybeSingle();

      if (contactData && contactData.email) {
        // Found customer contact with email - use this data
        setCustomerName(contactData.name);
        setCustomerEmail(contactData.email);
        setCustomerPhone(contactData.phone || '');
        console.log('✅ Loaded customer info from contacts table:', contactData.name, contactData.email);
        return;
      }
      
      // Priority 2: Try to get customer info from quote
      const { data: quoteData } = await supabase
        .from('quotes')
        .select('customer_name, customer_email, customer_phone')
        .eq('job_id', job.id)
        .maybeSingle();
      
      if (quoteData && quoteData.customer_email) {
        // Found quote with customer email - use this data
        setCustomerName(quoteData.customer_name || job.client_name || '');
        setCustomerEmail(quoteData.customer_email);
        setCustomerPhone(quoteData.customer_phone || '');
        console.log('✅ Loaded customer info from quote:', quoteData.customer_name, quoteData.customer_email);
        return;
      }
      
      // Priority 3: Fallback to job data (name only, no email/phone)
      setCustomerName(job.client_name || '');
      setCustomerEmail(''); // No email found - user will need to enter it
      setCustomerPhone(''); // No phone found
      console.log('⚠️ Using customer name from job data only (no email/phone):', job.client_name);
      
      // Show helpful message to user
      if (!quoteData && !contactData) {
        toast.info('Please enter customer email and phone - not found in quote or contacts', { duration: 5000 });
      }
    } catch (error: any) {
      console.error('❌ Error loading customer info:', error);
      // Fallback to job data on error
      setCustomerName(job.client_name || '');
      setCustomerEmail('');
      setCustomerPhone('');
      toast.error('Could not load customer information. Please enter manually.');
    }
  }

  async function loadPortalLinks() {
    try {
      const { data, error } = await supabase
        .from('customer_portal_access')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      const customerIds = (data || []).map(link => link.customer_identifier).filter(Boolean);
      setExistingCustomerLinks(customerIds);
      
      const jobCustomerLinks = (data || []).filter(link => 
        link.customer_name === job.client_name || link.job_id === job.id
      );
      setPortalLinks(jobCustomerLinks);
    } catch (error: any) {
      console.error('Error loading portal links:', error);
      toast.error('Failed to load portal links');
    } finally {
      setLoading(false);
    }
  }

  function generateAccessToken(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let token = '';
    for (let i = 0; i < 32; i++) {
      token += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return token;
  }

  async function createPortalLink() {
    if (!customerName) {
      toast.error('Please enter customer name');
      return;
    }

    if (!customerEmail) {
      toast.error('Please enter customer email (used as unique identifier)');
      return;
    }

    if (existingCustomerLinks.includes(customerEmail)) {
      toast.error('A portal link already exists for this customer email. Each customer can only have one active link.');
      return;
    }

    try {
      const token = generateAccessToken();
      
      let expiresAt = null;
      if (expiresInDays) {
        const days = parseInt(expiresInDays);
        const expireDate = new Date();
        expireDate.setDate(expireDate.getDate() + days);
        expiresAt = expireDate.toISOString();
      }

      const { data, error } = await supabase
        .from('customer_portal_access')
        .insert([{
          job_id: job.id, // Link to the specific job
          customer_identifier: customerEmail,
          access_token: token,
          customer_name: customerName,
          customer_email: customerEmail,
          customer_phone: customerPhone || null,
          is_active: true,
          expires_at: expiresAt,
          created_by: profile?.id,
          show_proposal: showProposal,
          show_payments: showPayments,
          show_schedule: showSchedule,
          show_documents: showDocuments,
          show_photos: showPhotos,
          show_financial_summary: showFinancialSummary,
          custom_message: customMessage || null,
        }])
        .select()
        .single();

      if (error) throw error;

      toast.success(`Customer portal link created for ${job.name}`);
      
      // Email integration is now active - customers can send/receive emails through the portal
      // All emails are stored in job_emails table and linked to this job
      console.log('✅ Portal created for:', customerEmail, 'Job:', job.id, '- Email integration enabled');
      
      setShowCreateDialog(false);
      resetForm();
      await loadPortalLinks();

      const portalUrl = `${window.location.origin}/customer-portal?token=${token}`;
      navigator.clipboard.writeText(portalUrl);
      toast.success('Link copied to clipboard!');
    } catch (error: any) {
      console.error('Error creating portal link:', error);
      toast.error('Failed to create portal link');
    }
  }

  async function updatePortalSettings() {
    if (!selectedLink) return;

    try {
      const { error } = await supabase
        .from('customer_portal_access')
        .update({
          show_proposal: showProposal,
          show_payments: showPayments,
          show_schedule: showSchedule,
          show_documents: showDocuments,
          show_photos: showPhotos,
          show_financial_summary: showFinancialSummary,
          custom_message: customMessage || null,
        })
        .eq('id', selectedLink.id);

      if (error) throw error;

      toast.success('Portal settings updated');
      setShowSettingsDialog(false);
      await loadPortalLinks();
    } catch (error: any) {
      console.error('Error updating portal settings:', error);
      toast.error('Failed to update portal settings');
    }
  }

  function resetForm() {
    // Note: Customer name/email/phone are preserved - they'll be reloaded when dialog opens again
    setExpiresInDays('');
    setShowProposal(true);
    setShowPayments(true);
    setShowSchedule(true);
    setShowDocuments(true);
    setShowPhotos(true);
    setShowFinancialSummary(true);
    setCustomMessage('');
    setShowPreview(false);
  }

  async function loadPreviewData() {
    if (!customerName) {
      toast.error('Please enter customer name to preview');
      return;
    }

    setPreviewLoading(true);
    try {
      // Store current visibility settings for preview
      setPreviewSettings({
        show_proposal: showProposal,
        show_payments: showPayments,
        show_schedule: showSchedule,
        show_documents: showDocuments,
        show_photos: showPhotos,
        show_financial_summary: showFinancialSummary,
        custom_message: customMessage,
      });

      const { data: jobsData, error: jobsError } = await supabase
        .from('jobs')
        .select('*')
        .eq('client_name', customerName)
        .order('created_at', { ascending: false });

      if (jobsError) throw jobsError;

      const jobsWithData = await Promise.all((jobsData || []).map(async (job) => {
        const { data: quoteData } = await supabase
          .from('quotes')
          .select('*')
          .eq('job_id', job.id)
          .maybeSingle();

        const { data: paymentsData } = await supabase
          .from('customer_payments')
          .select('*')
          .eq('job_id', job.id)
          .order('payment_date', { ascending: false });

        const { data: documentsData } = await supabase
          .from('job_documents')
          .select('id, name, category')
          .eq('job_id', job.id);

        const { data: photosData } = await supabase
          .from('photos')
          .select('id, photo_url, caption, created_at')
          .eq('job_id', job.id)
          .order('created_at', { ascending: false })
          .limit(20);

        const { data: scheduleData } = await supabase
          .from('calendar_events')
          .select('*')
          .eq('job_id', job.id)
          .order('event_date', { ascending: true });

        // Load proposal data
        const proposalData = await loadProposalData(job.id);

        const totalPaid = (paymentsData || []).reduce((sum, p) => sum + parseFloat(p.amount || '0'), 0);
        const estimatedPrice = proposalData.totals.grandTotal;
        const remainingBalance = estimatedPrice - totalPaid;

        return {
          ...job,
          quote: quoteData,
          payments: paymentsData || [],
          documents: documentsData || [],
          photos: photosData || [],
          scheduleEvents: scheduleData || [],
          proposalData,
          totalPaid,
          estimatedPrice,
          remainingBalance,
        };
      }));

      setPreviewJobs(jobsWithData);
      setShowPreview(true);
    } catch (error: any) {
      console.error('Error loading preview data:', error);
      toast.error('Failed to load preview data');
    } finally {
      setPreviewLoading(false);
    }
  }

  async function loadProposalData(jobId: string) {
    try {
      const { data: workbookData } = await supabase
        .from('material_workbooks')
        .select('id')
        .eq('job_id', jobId)
        .eq('status', 'working')
        .maybeSingle();

      let materialSheets: any[] = [];
      if (workbookData) {
        const { data: sheetsData } = await supabase
          .from('material_sheets')
          .select('*')
          .eq('workbook_id', workbookData.id)
          .order('order_index');
        materialSheets = sheetsData || [];
      }

      const { data: customRowsData } = await supabase
        .from('custom_financial_rows')
        .select('*')
        .eq('job_id', jobId)
        .order('order_index');

      const { data: subEstimatesData } = await supabase
        .from('subcontractor_estimates')
        .select('*')
        .eq('job_id', jobId)
        .order('order_index');

      const TAX_RATE = 0.07;
      const subtotal = 
        (customRowsData || []).reduce((sum, row) => sum + row.selling_price, 0) +
        (subEstimatesData || []).reduce((sum, est) => {
          const baseAmount = est.total_amount || 0;
          const markup = est.markup_percent || 0;
          return sum + (baseAmount * (1 + markup / 100));
        }, 0);
      
      const tax = subtotal * TAX_RATE;
      const grandTotal = subtotal + tax;

      return {
        materialSheets,
        customRows: customRowsData || [],
        subcontractorEstimates: subEstimatesData || [],
        totals: { subtotal, tax, grandTotal },
      };
    } catch (error) {
      console.error('Error loading proposal data:', error);
      return {
        materialSheets: [],
        customRows: [],
        subcontractorEstimates: [],
        totals: { subtotal: 0, tax: 0, grandTotal: 0 },
      };
    }
  }

  function openSettingsDialog(link: CustomerPortalLink) {
    setSelectedLink(link);
    setShowProposal(link.show_proposal);
    setShowPayments(link.show_payments);
    setShowSchedule(link.show_schedule);
    setShowDocuments(link.show_documents);
    setShowPhotos(link.show_photos);
    setShowFinancialSummary(link.show_financial_summary);
    setCustomMessage(link.custom_message || '');
    setShowSettingsDialog(true);
  }

  async function toggleLinkStatus(linkId: string, currentStatus: boolean) {
    try {
      const { error } = await supabase
        .from('customer_portal_access')
        .update({ is_active: !currentStatus })
        .eq('id', linkId);

      if (error) throw error;
      toast.success(`Link ${!currentStatus ? 'activated' : 'deactivated'}`);
      await loadPortalLinks();
    } catch (error: any) {
      console.error('Error toggling link status:', error);
      toast.error('Failed to update link status');
    }
  }

  async function deleteLink(linkId: string) {
    if (!confirm('Delete this portal access link? The customer will no longer be able to access the portal with this link.')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('customer_portal_access')
        .delete()
        .eq('id', linkId);

      if (error) throw error;
      toast.success('Link deleted');
      await loadPortalLinks();
    } catch (error: any) {
      console.error('Error deleting link:', error);
      toast.error('Failed to delete link');
    }
  }

  function copyPortalLink(token: string) {
    const portalUrl = `${window.location.origin}/customer-portal?token=${token}`;
    navigator.clipboard.writeText(portalUrl);
    setCopied(token);
    toast.success('Link copied to clipboard!');
    
    setTimeout(() => setCopied(null), 2000);
  }

  function openPortalLink(token: string) {
    const portalUrl = `${window.location.origin}/customer-portal?token=${token}`;
    window.open(portalUrl, '_blank');
  }

  if (loading) {
    return <div className="text-center py-4">Loading portal links...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Customer Portal Access</h3>
          <p className="text-sm text-muted-foreground">
            Create shareable links for customers to view their projects with customizable visibility settings.
          </p>
        </div>
        <Button onClick={async () => {
          await loadCustomerInfo(); // Wait for customer info to load before opening dialog
          setShowCreateDialog(true);
        }}>
          <Plus className="w-4 h-4 mr-2" />
          Create Portal Link
        </Button>
      </div>

      {portalLinks.length > 0 ? (
        <div className="space-y-3">
          {portalLinks.map((link) => {
            const isExpired = link.expires_at && new Date(link.expires_at) < new Date();
            const portalUrl = `${window.location.origin}/customer-portal?token=${link.access_token}`;

            return (
              <Card key={link.id} className={!link.is_active || isExpired ? 'opacity-60' : ''}>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h4 className="font-semibold">{link.customer_name}</h4>
                        {link.is_active && !isExpired ? (
                          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">
                            Active
                          </Badge>
                        ) : isExpired ? (
                          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-300">
                            Expired
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-slate-100 text-slate-700">
                            Inactive
                          </Badge>
                        )}
                      </div>

                      {link.customer_email && (
                        <p className="text-sm text-muted-foreground">{link.customer_email}</p>
                      )}

                      <div className="mt-3 p-3 bg-slate-50 rounded-lg font-mono text-xs break-all">
                        {portalUrl}
                      </div>

                      {/* Visibility Summary */}
                      <div className="flex flex-wrap gap-2 mt-3">
                        {link.show_financial_summary && (
                          <Badge variant="secondary" className="text-xs">Financial Summary</Badge>
                        )}
                        {link.show_proposal && (
                          <Badge variant="secondary" className="text-xs">Proposal</Badge>
                        )}
                        {link.show_payments && (
                          <Badge variant="secondary" className="text-xs">Payments</Badge>
                        )}
                        {link.show_schedule && (
                          <Badge variant="secondary" className="text-xs">Schedule</Badge>
                        )}
                        {link.show_documents && (
                          <Badge variant="secondary" className="text-xs">Documents</Badge>
                        )}
                        {link.show_photos && (
                          <Badge variant="secondary" className="text-xs">Photos</Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                        <span>Created: {new Date(link.created_at).toLocaleDateString()}</span>
                        {link.expires_at && (
                          <span>Expires: {new Date(link.expires_at).toLocaleDateString()}</span>
                        )}
                        {link.last_accessed_at && (
                          <span>Last accessed: {new Date(link.last_accessed_at).toLocaleDateString()}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 ml-4">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openSettingsDialog(link)}
                      >
                        <Settings className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => copyPortalLink(link.access_token)}
                      >
                        {copied === link.access_token ? (
                          <CheckCircle className="w-4 h-4 text-green-600" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openPortalLink(link.access_token)}
                      >
                        <ExternalLink className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => toggleLinkStatus(link.id, link.is_active)}
                      >
                        {link.is_active ? 'Deactivate' : 'Activate'}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => deleteLink(link.id)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="text-center py-12">
            <Share2 className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground mb-4">No customer portal links created yet</p>
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Create First Portal Link
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Portal Settings Dialog */}
      <Dialog open={showSettingsDialog} onOpenChange={setShowSettingsDialog}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Portal Visibility Settings</DialogTitle>
          </DialogHeader>
          <div className="space-y-6">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-900">
                Control what information {selectedLink?.customer_name} can see in their portal
              </p>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <Label className="font-medium">Financial Summary</Label>
                  <p className="text-sm text-muted-foreground">Show total amount, paid, and balance</p>
                </div>
                <Switch checked={showFinancialSummary} onCheckedChange={setShowFinancialSummary} />
              </div>

              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <Label className="font-medium">Proposal Details</Label>
                  <p className="text-sm text-muted-foreground">Show itemized proposal/pricing breakdown</p>
                </div>
                <Switch checked={showProposal} onCheckedChange={setShowProposal} />
              </div>

              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <Label className="font-medium">Payment History</Label>
                  <p className="text-sm text-muted-foreground">Show all payment records</p>
                </div>
                <Switch checked={showPayments} onCheckedChange={setShowPayments} />
              </div>

              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <Label className="font-medium">Schedule/Timeline</Label>
                  <p className="text-sm text-muted-foreground">Show project timeline and milestones</p>
                </div>
                <Switch checked={showSchedule} onCheckedChange={setShowSchedule} />
              </div>

              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <Label className="font-medium">Documents</Label>
                  <p className="text-sm text-muted-foreground">Show project documents and drawings</p>
                </div>
                <Switch checked={showDocuments} onCheckedChange={setShowDocuments} />
              </div>

              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <Label className="font-medium">Photos</Label>
                  <p className="text-sm text-muted-foreground">Show progress photos</p>
                </div>
                <Switch checked={showPhotos} onCheckedChange={setShowPhotos} />
              </div>
            </div>

            <div>
              <Label>Custom Welcome Message (Optional)</Label>
              <Textarea
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
                placeholder="Add a custom message that will be displayed to the customer..."
                rows={3}
                className="mt-2"
              />
            </div>

            <div className="flex gap-3 pt-4 border-t">
              <Button onClick={updatePortalSettings} className="flex-1">
                Update Settings
              </Button>
              <Button variant="outline" onClick={() => setShowSettingsDialog(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Portal Link Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Customer Portal Link</DialogTitle>
          </DialogHeader>
          <div className="space-y-6">
            {/* Pre-populated Notice */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <Building2 className="w-5 h-5 text-blue-600 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-blue-900">Pre-populated from Job</p>
                  <p className="text-xs text-blue-700">Customer information has been automatically filled from job details and contacts. Edit as needed.</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Customer Name *</Label>
                <Input
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="John Doe"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  From job: {job.client_name}
                </p>
              </div>

              <div>
                <Label>Customer Email *</Label>
                <Input
                  type="email"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  placeholder="customer@example.com"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Used as unique identifier & for email integration
                </p>
              </div>

              <div>
                <Label>Customer Phone (Optional)</Label>
                <Input
                  type="tel"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="(555) 123-4567"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Contact number for portal notifications
                </p>
              </div>

              <div>
                <Label>Link Expires In (Days)</Label>
                <Input
                  type="number"
                  min="1"
                  value={expiresInDays}
                  onChange={(e) => setExpiresInDays(e.target.value)}
                  placeholder="Leave empty for no expiration"
                />
              </div>
            </div>

            <div className="border-t pt-4">
              <h4 className="font-semibold mb-4">Visibility Settings</h4>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <Label className="font-medium">Financial Summary</Label>
                    <p className="text-sm text-muted-foreground">Show total amount, paid, and balance</p>
                  </div>
                  <Switch checked={showFinancialSummary} onCheckedChange={setShowFinancialSummary} />
                </div>

                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <Label className="font-medium">Proposal Details</Label>
                    <p className="text-sm text-muted-foreground">Show itemized proposal/pricing</p>
                  </div>
                  <Switch checked={showProposal} onCheckedChange={setShowProposal} />
                </div>

                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <Label className="font-medium">Payment History</Label>
                    <p className="text-sm text-muted-foreground">Show all payment records</p>
                  </div>
                  <Switch checked={showPayments} onCheckedChange={setShowPayments} />
                </div>

                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <Label className="font-medium">Schedule/Timeline</Label>
                    <p className="text-sm text-muted-foreground">Show project timeline</p>
                  </div>
                  <Switch checked={showSchedule} onCheckedChange={setShowSchedule} />
                </div>

                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <Label className="font-medium">Documents</Label>
                    <p className="text-sm text-muted-foreground">Show documents and drawings</p>
                  </div>
                  <Switch checked={showDocuments} onCheckedChange={setShowDocuments} />
                </div>

                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <Label className="font-medium">Photos</Label>
                    <p className="text-sm text-muted-foreground">Show progress photos</p>
                  </div>
                  <Switch checked={showPhotos} onCheckedChange={setShowPhotos} />
                </div>
              </div>
            </div>

            <div>
              <Label>Custom Welcome Message (Optional)</Label>
              <Textarea
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
                placeholder="Add a custom message that will be displayed to the customer..."
                rows={3}
                className="mt-2"
              />
            </div>

            <div className="flex gap-3 pt-4 border-t">
              <Button onClick={loadPreviewData} variant="outline" className="flex-1" disabled={!customerName}>
                <Eye className="w-4 h-4 mr-2" />
                Preview Customer View
              </Button>
              <Button onClick={createPortalLink} className="flex-1">
                Create Portal Link
              </Button>
              <Button variant="outline" onClick={() => {
                setShowCreateDialog(false);
                resetForm();
              }}>
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Interactive Preview Dialog - Full Customer Portal Experience */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-[98vw] max-h-[95vh] overflow-hidden p-0">
          {previewLoading ? (
            <div className="text-center py-12 px-6">
              <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-muted-foreground">Loading interactive preview...</p>
            </div>
          ) : previewJobs.length === 0 ? (
            <div className="p-6">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Eye className="w-5 h-5" />
                  Customer Portal Preview
                </DialogTitle>
              </DialogHeader>
              <div className="text-center py-12">
                <Building2 className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground mb-2">No jobs found for {customerName}</p>
                <p className="text-sm text-muted-foreground">The customer portal will be empty until jobs are assigned.</p>
              </div>
              <div className="flex gap-3 pt-4 border-t">
                <Button onClick={() => setShowPreview(false)} variant="outline" className="flex-1">
                  Close Preview
                </Button>
                <Button onClick={createPortalLink} className="flex-1">
                  <Plus className="w-4 h-4 mr-2" />
                  Create Portal Link Anyway
                </Button>
              </div>
            </div>
          ) : (
            <div className="h-[95vh] flex flex-col">
              {/* Preview Header */}
              <div className="bg-gradient-to-r from-purple-600 to-purple-800 text-white px-6 py-4 border-b-4 border-purple-900 flex-shrink-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Eye className="w-6 h-6" />
                    <div>
                      <h2 className="text-xl font-bold">Interactive Preview Mode</h2>
                      <p className="text-purple-100 text-sm">This is EXACTLY how customers will interact with their portal</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="bg-white/10 text-white border-white/30">
                      Preview Only
                    </Badge>
                    <Button onClick={() => setShowPreview(false)} variant="ghost" className="text-white hover:bg-white/10">
                      ✕ Close
                    </Button>
                  </div>
                </div>
              </div>

              {/* Embedded Interactive Portal */}
              <div className="flex-1 overflow-auto bg-gradient-to-br from-slate-50 to-slate-100">
                <CustomerPortalPreview 
                  customerName={customerName}
                  jobs={previewJobs}
                  visibilitySettings={previewSettings}
                  customMessage={previewSettings?.custom_message}
                />
              </div>

              {/* Preview Footer Actions */}
              <div className="bg-white border-t-2 px-6 py-4 flex gap-3 flex-shrink-0">
                <Button onClick={() => setShowPreview(false)} variant="outline" className="flex-1">
                  Close Preview
                </Button>
                <Button onClick={createPortalLink} className="flex-1 bg-green-600 hover:bg-green-700">
                  <Plus className="w-4 h-4 mr-2" />
                  Create Portal Link with These Settings
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
