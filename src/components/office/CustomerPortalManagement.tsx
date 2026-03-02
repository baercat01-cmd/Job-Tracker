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

  // Token shown in preview before creating; same token is used when user clicks Create Portal Link
  const [pendingToken, setPendingToken] = useState<string | null>(null);

  useEffect(() => {
    loadPortalLinks();
    loadCustomerInfo();
    setPreviewJobs([]);
  }, [job.id]);

  // When no portal links exist, show preview inline: load preview data and set pending token
  useEffect(() => {
    if (loading || portalLinks.length > 0 || !customerName || previewJobs.length > 0) return;
    setPendingToken((t) => t || crypto.randomUUID().replace(/-/g, ''));
    loadPreviewData(false);
  }, [loading, portalLinks.length, customerName, job.id]);

  async function loadCustomerInfo() {
    try {
      console.log('🔍 Loading customer info for job:', job.id);

      // Priority 1: Job overview (Edit Job form – customer email, client name, phone)
      const jobEmail = (job as { customer_email?: string | null }).customer_email;
      const jobPhone = (job as { customer_phone?: string | null }).customer_phone;
      if (jobEmail && jobEmail.trim()) {
        setCustomerName(job.client_name || '');
        setCustomerEmail(jobEmail.trim());
        setCustomerPhone((jobPhone && jobPhone.trim()) || '');
        console.log('✅ Loaded from job overview:', job.client_name, jobEmail);
        return;
      }

      // Priority 2: Contacts table (customer contact for this job)
      const { data: contactData } = await supabase
        .from('contacts')
        .select('*')
        .eq('job_id', job.id)
        .eq('category', 'customer')
        .maybeSingle();

      if (contactData && contactData.email) {
        setCustomerName(contactData.name);
        setCustomerEmail(contactData.email);
        setCustomerPhone(contactData.phone || '');
        console.log('✅ Loaded from contacts:', contactData.name, contactData.email);
        return;
      }

      // Priority 3: Quote
      const { data: quoteData } = await supabase
        .from('quotes')
        .select('customer_name, customer_email, customer_phone')
        .eq('job_id', job.id)
        .maybeSingle();

      if (quoteData && quoteData.customer_email) {
        setCustomerName(quoteData.customer_name || job.client_name || '');
        setCustomerEmail(quoteData.customer_email);
        setCustomerPhone(quoteData.customer_phone || '');
        console.log('✅ Loaded from quote:', quoteData.customer_name, quoteData.customer_email);
        return;
      }

      // Fallback: job name only, no email/phone
      setCustomerName(job.client_name || '');
      setCustomerEmail('');
      setCustomerPhone('');
      console.log('⚠️ No email found - user must enter manually');

      toast.warning(
        'Customer email not found.\n\nAdd it in Job Overview (Edit Job → Customer Email), or enter it below.',
        { duration: 8000 }
      );
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

      // One link per job: only show the link for this job
      const jobLink = (data || []).filter(link => link.job_id === job.id);
      setPortalLinks(jobLink);
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
    // Validate customer name
    if (!customerName || customerName.trim() === '') {
      toast.error('❌ Customer name is required');
      return;
    }

    // Validate customer email (REQUIRED for portal access)
    if (!customerEmail || customerEmail.trim() === '') {
      toast.error(
        '❌ Customer email is required\n\nEmail is used for:\n• Unique portal identification\n• Email communications\n• Account recovery\n\nPlease enter customer email or add it to the quote first.',
        { duration: 8000 }
      );
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(customerEmail.trim())) {
      toast.error('❌ Please enter a valid email address');
      return;
    }

    // One link per job: update existing or create new
    const existingLink = portalLinks.find(link => link.job_id === job.id);
    const isUpdate = !!existingLink;

    console.log(isUpdate ? '🔷 Updating portal link...' : '🔷 Creating portal link...');
    console.log('  Customer:', customerName);
    console.log('  Email:', customerEmail);
    console.log('  Job:', job.name, `(${job.id})`);

    try {
      const token = isUpdate ? existingLink!.access_token : (pendingToken || generateAccessToken());
      if (!isUpdate && pendingToken) setPendingToken(null);
      if (!isUpdate) console.log('  Token:', token);

      let expiresAt: string | null = null;
      if (expiresInDays && expiresInDays.trim() !== '') {
        const days = parseInt(expiresInDays);
        if (isNaN(days) || days <= 0) {
          toast.error('❌ Please enter a valid number of days for expiration');
          return;
        }
        const expireDate = new Date();
        expireDate.setDate(expireDate.getDate() + days);
        expiresAt = expireDate.toISOString();
        console.log('  Expires:', expiresAt);
      } else {
        console.log('  No expiration (permanent link)');
      }

      const portalData = {
        job_id: job.id,
        customer_identifier: customerEmail.trim().toLowerCase(),
        access_token: token,
        customer_name: customerName.trim(),
        customer_email: customerEmail.trim(),
        customer_phone: customerPhone?.trim() || null,
        is_active: true,
        expires_at: expiresAt,
        ...(isUpdate ? {} : { created_by: profile?.id }),
        show_proposal: showProposal,
        show_payments: showPayments,
        show_schedule: showSchedule,
        show_documents: showDocuments,
        show_photos: showPhotos,
        show_financial_summary: showFinancialSummary,
        custom_message: customMessage?.trim() || null,
        updated_at: new Date().toISOString(),
      };

      console.log('  Portal data:', JSON.stringify(portalData, null, 2));

      let data: any;
      let error: any;

      if (isUpdate) {
        const result = await supabase
          .from('customer_portal_access')
          .update({
            customer_identifier: portalData.customer_identifier,
            customer_name: portalData.customer_name,
            customer_email: portalData.customer_email,
            customer_phone: portalData.customer_phone,
            is_active: portalData.is_active,
            expires_at: portalData.expires_at,
            show_proposal: portalData.show_proposal,
            show_payments: portalData.show_payments,
            show_schedule: portalData.show_schedule,
            show_documents: portalData.show_documents,
            show_photos: portalData.show_photos,
            show_financial_summary: portalData.show_financial_summary,
            custom_message: portalData.custom_message,
            updated_at: portalData.updated_at,
          })
          .eq('id', existingLink!.id)
          .select()
          .single();
        data = result.data;
        error = result.error;
      } else {
        const result = await supabase
          .from('customer_portal_access')
          .insert([{ ...portalData, created_by: profile?.id }])
          .select()
          .single();
        data = result.data;
        error = result.error;
      }

      if (error) {
        console.error('❌ Database error:', error);
        console.error('  Error code:', error.code);
        console.error('  Error message:', error.message);
        console.error('  Error details:', error.details);
        console.error('  Error hint:', error.hint);
        
        // Provide specific error messages based on error code
        if (error.code === '23505') {
          // Unique constraint violation
          toast.error(
            '❌ Duplicate portal link\n\nA portal link already exists for this customer on this job. Please check existing links or use a different email.',
            { duration: 8000 }
          );
        } else if (error.code === '23503') {
          // Foreign key violation
          toast.error(
            '❌ Invalid job or user reference\n\nPlease refresh the page and try again.',
            { duration: 6000 }
          );
        } else if (error.code === '42501') {
          // Database RLS blocking insert – any office user should be allowed
          toast.error(
            '❌ Database is blocking this action.\n\nAny office user can create portal links. Ask your project admin to run scripts/fix-customer-portal-access-rls.sql in the Supabase SQL Editor to allow it.',
            { duration: 8000 }
          );
        } else {
          toast.error(
            `❌ Database error: ${error.message}\n\nError code: ${error.code || 'unknown'}`,
            { duration: 8000 }
          );
        }
        return;
      }

      if (isUpdate) {
        toast.success('Portal link updated. Same URL; visibility settings saved.', { duration: 3000 });
      } else {
        console.log('✅ Portal link created successfully:', data);
        toast.success(`✅ Customer portal link created for ${job.name}`, { duration: 3000 });
      }

      setShowCreateDialog(false);
      resetForm();
      await loadPortalLinks();

      const portalUrl = `${window.location.origin}/customer-portal?token=${token}`;
      await navigator.clipboard.writeText(portalUrl);
      toast.success(isUpdate ? 'Portal URL copied (unchanged).' : '🔗 Portal link copied to clipboard!', { duration: 3000 });
      
      console.log('🔗 Portal URL:', portalUrl);
    } catch (error: any) {
      console.error('❌ Unexpected error creating portal link:', error);
      console.error('  Error type:', error.constructor.name);
      console.error('  Error stack:', error.stack);
      
      toast.error(
        `❌ Failed to create portal link\n\nError: ${error.message || 'Unknown error'}\n\nPlease try again or contact support.`,
        { duration: 10000 }
      );
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

  async function loadPreviewData(openDialog = true) {
    if (!customerName) {
      if (openDialog) toast.error('Please enter customer name to preview');
      return;
    }

    setPreviewLoading(true);
    try {
      // Store current visibility settings for preview (so you can craft the view, then create)
      setPreviewSettings({
        show_proposal: showProposal,
        show_payments: showPayments,
        show_schedule: showSchedule,
        show_documents: showDocuments,
        show_photos: showPhotos,
        show_financial_summary: showFinancialSummary,
        custom_message: customMessage,
      });

      // Load only this job so preview shows exactly what the customer will see for this project
      const { data: jobRow, error: jobError } = await supabase
        .from('jobs')
        .select('*')
        .eq('id', job.id)
        .single();

      if (jobError || !jobRow) {
        toast.error('Could not load job for preview');
        setPreviewLoading(false);
        return;
      }

      const j = jobRow;
      const { data: quoteData } = await supabase
        .from('quotes')
        .select('*')
        .eq('job_id', j.id)
        .maybeSingle();

      const { data: paymentsData } = await supabase
        .from('customer_payments')
        .select('*')
        .eq('job_id', j.id)
        .order('payment_date', { ascending: false });

      const { data: documentsData } = await supabase
        .from('job_documents')
        .select('id, name, category')
        .eq('job_id', j.id);

      const { data: photosData } = await supabase
        .from('photos')
        .select('id, photo_url, caption, created_at')
        .eq('job_id', j.id)
        .order('created_at', { ascending: false })
        .limit(20);

      const { data: scheduleData } = await supabase
        .from('calendar_events')
        .select('*')
        .eq('job_id', j.id)
        .order('event_date', { ascending: true });

      const proposalData = await loadProposalData(j.id);
      const totalPaid = (paymentsData || []).reduce((sum, p) => sum + parseFloat(p.amount || '0'), 0);
      const estimatedPrice = proposalData.totals.grandTotal;
      const remainingBalance = estimatedPrice - totalPaid;

      const jobWithData = {
        ...j,
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

      setPreviewJobs([jobWithData]);
      if (openDialog) setShowPreview(true);
    } catch (error: any) {
      console.error('Error loading preview data:', error);
      if (openDialog) toast.error('Failed to load preview data');
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
            Any office user can create or update the portal link for this job. Share the link with the customer; use visibility settings to control what they see.
          </p>
        </div>
        <Button onClick={async () => {
          if (portalLinks.length === 1) {
            const link = portalLinks[0];
            setCustomerName(link.customer_name);
            setCustomerEmail(link.customer_email || '');
            setCustomerPhone(link.customer_phone || '');
            setShowProposal(link.show_proposal);
            setShowPayments(link.show_payments);
            setShowSchedule(link.show_schedule);
            setShowDocuments(link.show_documents);
            setShowPhotos(link.show_photos);
            setShowFinancialSummary(link.show_financial_summary);
            setCustomMessage(link.custom_message || '');
            setExpiresInDays(link.expires_at ? '' : '');
          } else {
            await loadCustomerInfo();
            setPendingToken(crypto.randomUUID().replace(/-/g, ''));
          }
          setShowCreateDialog(true);
        }}>
          {portalLinks.length === 1 ? (
            <>
              <Settings className="w-4 h-4 mr-2" />
              Update Portal Link
            </>
          ) : (
            <>
              <Plus className="w-4 h-4 mr-2" />
              Create Portal Link
            </>
          )}
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
        /* No links yet: show preview inline so you can craft the view, then create the link */
        <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
          {previewLoading ? (
            <div className="flex items-center justify-center py-24">
              <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mr-3" />
              <span className="text-muted-foreground">Loading preview…</span>
            </div>
          ) : previewJobs.length > 0 && pendingToken ? (
            <>
              <div className="bg-slate-50 border-b px-4 py-3 flex items-center gap-3 flex-wrap">
                <span className="text-sm font-medium text-slate-600 whitespace-nowrap">Portal link (create link to activate):</span>
                <code className="flex-1 min-w-0 text-sm text-slate-700 bg-white rounded px-2 py-1.5 truncate border">
                  {`${typeof window !== 'undefined' ? window.location.origin : ''}/customer-portal?token=${pendingToken}`}
                </code>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const url = `${window.location.origin}/customer-portal?token=${pendingToken}`;
                    navigator.clipboard.writeText(url);
                    toast.success('Link copied. Create the link to activate it.');
                  }}
                  className="shrink-0"
                >
                  <Copy className="w-4 h-4 mr-2" />
                  Copy link
                </Button>
              </div>
              <div className="flex min-h-[400px]">
                {/* Left sidebar – what the customer will see */}
                <aside className="w-56 shrink-0 border-r border-slate-200 bg-white py-4 px-3 flex flex-col gap-1">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-2 mb-2">What customer sees</span>
                  <label className="flex items-center justify-between gap-2 py-2 px-3 rounded-md hover:bg-slate-50 cursor-pointer">
                    <span className="text-sm font-medium">Final price</span>
                    <Switch
                      checked={showFinancialSummary}
                      onCheckedChange={(v) => {
                        setShowFinancialSummary(v);
                        setPreviewSettings((s) => (s ? { ...s, show_financial_summary: v } : s));
                      }}
                    />
                  </label>
                  <label className="flex items-center justify-between gap-2 py-2 px-3 rounded-md hover:bg-slate-50 cursor-pointer">
                    <span className="text-sm font-medium">Proposal</span>
                    <Switch
                      checked={showProposal}
                      onCheckedChange={(v) => {
                        setShowProposal(v);
                        setPreviewSettings((s) => (s ? { ...s, show_proposal: v } : s));
                      }}
                    />
                  </label>
                  <label className="flex items-center justify-between gap-2 py-2 px-3 rounded-md hover:bg-slate-50 cursor-pointer">
                    <span className="text-sm font-medium">Payments</span>
                    <Switch
                      checked={showPayments}
                      onCheckedChange={(v) => {
                        setShowPayments(v);
                        setPreviewSettings((s) => (s ? { ...s, show_payments: v } : s));
                      }}
                    />
                  </label>
                  <label className="flex items-center justify-between gap-2 py-2 px-3 rounded-md hover:bg-slate-50 cursor-pointer">
                    <span className="text-sm font-medium">Schedule</span>
                    <Switch
                      checked={showSchedule}
                      onCheckedChange={(v) => {
                        setShowSchedule(v);
                        setPreviewSettings((s) => (s ? { ...s, show_schedule: v } : s));
                      }}
                    />
                  </label>
                  <label className="flex items-center justify-between gap-2 py-2 px-3 rounded-md hover:bg-slate-50 cursor-pointer">
                    <span className="text-sm font-medium">Documents</span>
                    <Switch
                      checked={showDocuments}
                      onCheckedChange={(v) => {
                        setShowDocuments(v);
                        setPreviewSettings((s) => (s ? { ...s, show_documents: v } : s));
                      }}
                    />
                  </label>
                  <label className="flex items-center justify-between gap-2 py-2 px-3 rounded-md hover:bg-slate-50 cursor-pointer">
                    <span className="text-sm font-medium">Photos</span>
                    <Switch
                      checked={showPhotos}
                      onCheckedChange={(v) => {
                        setShowPhotos(v);
                        setPreviewSettings((s) => (s ? { ...s, show_photos: v } : s));
                      }}
                    />
                  </label>
                </aside>
                <div className="flex-1 min-w-0 bg-gradient-to-br from-slate-50 to-slate-100">
                  <CustomerPortalPreview
                    customerName={customerName}
                    jobs={previewJobs}
                    visibilitySettings={previewSettings}
                    customMessage={previewSettings?.custom_message}
                  />
                </div>
              </div>
              <div className="border-t px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  Toggle options on the left to control what the customer sees, then create the link.
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setShowCreateDialog(true)}>
                    <Settings className="w-4 h-4 mr-2" />
                    More settings
                  </Button>
                  <Button onClick={createPortalLink}>
                    <Plus className="w-4 h-4 mr-2" />
                    Create Portal Link
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="text-center py-12 px-4">
              <Share2 className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground mb-4">Enter customer name in the dialog to preview, or create a link.</p>
              <Button onClick={() => setShowCreateDialog(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Create Portal Link
              </Button>
            </div>
          )}
        </div>
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
                  <Label className="font-medium">Show final price</Label>
                  <p className="text-sm text-muted-foreground">Show total amount, paid, balance, and proposal line-item prices. Turn off to hide pricing until you’re ready.</p>
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

      {/* Create / Update Portal Link Dialog (one link per job) */}
      <Dialog open={showCreateDialog} onOpenChange={(open) => { setShowCreateDialog(open); if (!open) setPendingToken(null); }}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{portalLinks.length === 1 ? 'Update Portal Link' : 'Create Customer Portal Link'}</DialogTitle>
            {portalLinks.length === 1 ? (
              <p className="text-sm text-muted-foreground font-normal mt-1">This job has one portal link. Change settings below; the same URL will keep working.</p>
            ) : (
              <p className="text-sm text-muted-foreground font-normal mt-1">Set visibility below, then click <strong>Preview Customer View</strong> to see the exact view and copy the link. When it looks right, click Create Portal Link.</p>
            )}
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
                <Label htmlFor="customer-name">Customer Name *</Label>
                <Input
                  id="customer-name"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="John Doe"
                  required
                />
                <p className="text-xs text-muted-foreground mt-1">
                  From job: {job.client_name}
                </p>
              </div>

              <div>
                <Label htmlFor="customer-email">Customer Email *</Label>
                <Input
                  id="customer-email"
                  type="email"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  placeholder="customer@example.com"
                  required
                  className={!customerEmail ? 'border-yellow-500 bg-yellow-50' : ''}
                />
                {!customerEmail ? (
                  <div className="flex items-start gap-2 mt-2 p-2 bg-yellow-50 border border-yellow-300 rounded text-xs text-yellow-900">
                    <span>⚠️</span>
                    <div>
                      <p className="font-semibold">Email Required</p>
                      <p>Email is needed for portal access and communications. Please enter customer email or add it to the quote first.</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-green-700 mt-1 flex items-center gap-1">
                    <span>✓</span> Email will be used for portal access & communications
                  </p>
                )}
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
                    <Label className="font-medium">Show final price</Label>
                    <p className="text-sm text-muted-foreground">Show totals and proposal prices. Turn off to hide until you’re ready.</p>
                  </div>
                  <Switch checked={showFinancialSummary} onCheckedChange={setShowFinancialSummary} />
                </div>

                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <Label className="font-medium">Proposal (scope & description)</Label>
                    <p className="text-sm text-muted-foreground">Show proposal tab with scope; prices only if “Show final price” is on</p>
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
                {portalLinks.length === 1 ? 'Update Portal Link' : 'Create Portal Link'}
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
                      <h2 className="text-xl font-bold">Preview – craft the view, then create the link</h2>
                      <p className="text-purple-100 text-sm">This is exactly what the customer will see. Adjust settings and preview again until it’s right, then create the link.</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="bg-white/10 text-white border-white/30">
                      Preview
                    </Badge>
                    <Button onClick={() => setShowPreview(false)} variant="ghost" className="text-white hover:bg-white/10">
                      ✕ Close
                    </Button>
                  </div>
                </div>
              </div>

              {/* Portal URL – copy before or after creating */}
              {(() => {
                const existingLink = portalLinks.find(l => l.job_id === job.id);
                const token = existingLink?.access_token ?? pendingToken;
                const previewPortalUrl = token ? `${window.location.origin}/customer-portal?token=${token}` : '';
                return previewPortalUrl ? (
                  <div className="bg-white border-b px-6 py-3 flex-shrink-0 flex items-center gap-3 flex-wrap">
                    <span className="text-sm font-medium text-slate-600 whitespace-nowrap">Portal link:</span>
                    <code className="flex-1 min-w-0 text-sm text-slate-700 bg-slate-100 rounded px-2 py-1.5 truncate">
                      {previewPortalUrl}
                    </code>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(previewPortalUrl);
                        toast.success('Link copied to clipboard');
                      }}
                      className="shrink-0"
                    >
                      <Copy className="w-4 h-4 mr-2" />
                      Copy link
                    </Button>
                    {!existingLink && pendingToken && (
                      <span className="text-xs text-amber-700 bg-amber-50 px-2 py-1 rounded">
                        Link will be active when you click &quot;Create Portal Link&quot; below.
                      </span>
                    )}
                  </div>
                ) : null;
              })()}

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
                  Back to settings
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
