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
  show_line_item_prices?: boolean;
  custom_message: string | null;
}

// Explicit column list omitting show_line_item_prices so app works when PostgREST schema cache is stale (PGRST204)
const CUSTOMER_PORTAL_ACCESS_SELECT =
  'id,job_id,customer_identifier,access_token,customer_name,customer_email,customer_phone,is_active,expires_at,last_accessed_at,created_by,created_at,updated_at,show_proposal,show_payments,show_schedule,show_documents,show_photos,show_financial_summary,custom_message';

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
  const [showLineItemPrices, setShowLineItemPrices] = useState(false);
  const [customMessage, setCustomMessage] = useState('');

  // Preview state
  const [showPreview, setShowPreview] = useState(false);
  const [previewJobs, setPreviewJobs] = useState<any[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewSettings, setPreviewSettings] = useState<any>(null);

  const [pendingToken, setPendingToken] = useState<string | null>(null);

  useEffect(() => {
    loadPortalLinks();
    loadCustomerInfo();
    setPreviewJobs([]);
  }, [job.id]);

  // When no portal links exist, set pending token for new link
  useEffect(() => {
    if (loading || portalLinks.length > 0 || !customerName?.trim()) return;
    setPendingToken((t) => t || crypto.randomUUID().replace(/-/g, ''));
  }, [loading, portalLinks.length, customerName, job.id]);

  // Load preview data whenever we have customer name so the portal page can show the customer view
  useEffect(() => {
    if (loading || !customerName?.trim()) return;
    loadPreviewData(false);
  }, [loading, customerName, job.id]);

  // When we have an existing portal link for this job, sync sidebar form from it
  useEffect(() => {
    const link = portalLinks.find(l => l.job_id === job.id);
    if (!link) return;
    setCustomerName(link.customer_name);
    setCustomerEmail(link.customer_email || '');
    setCustomerPhone(link.customer_phone || '');
    setShowProposal(link.show_proposal);
    setShowPayments(link.show_payments);
    setShowSchedule(link.show_schedule);
    setShowDocuments(link.show_documents);
    setShowPhotos(link.show_photos);
    setShowFinancialSummary(link.show_financial_summary);
    setShowLineItemPrices(link.show_line_item_prices ?? false);
    setCustomMessage(link.custom_message || '');
    setExpiresInDays(link.expires_at ? '' : '');
  }, [portalLinks, job.id]);

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

  /** When no portal link exists, create one with defaults so the copy link is always valid. */
  async function ensureOnePortalLink(): Promise<boolean> {
    const jobEmail = (job as { customer_email?: string | null }).customer_email;
    if (jobEmail && jobEmail.trim()) {
      const token = generateAccessToken();
      const payload = {
        job_id: job.id,
        customer_identifier: jobEmail.trim().toLowerCase(),
        access_token: token,
        customer_name: (job.client_name || '').trim() || 'Customer',
        customer_email: jobEmail.trim(),
        customer_phone: (job as { customer_phone?: string | null }).customer_phone?.trim() || null,
        is_active: true,
        expires_at: null,
        created_by: profile?.id,
        show_proposal: true,
        show_payments: true,
        show_schedule: true,
        show_documents: true,
        show_photos: true,
        show_financial_summary: true,
        custom_message: null,
      };
      let { data, error } = await supabase
        .from('customer_portal_access')
        .insert([payload])
        .select(CUSTOMER_PORTAL_ACCESS_SELECT)
        .single();
      if (error?.code === '42501') {
        const rpcResult = await supabase.rpc('create_customer_portal_link', {
          p_job_id: payload.job_id,
          p_customer_identifier: payload.customer_identifier,
          p_access_token: payload.access_token,
          p_customer_name: payload.customer_name,
          p_customer_email: payload.customer_email,
          p_customer_phone: payload.customer_phone,
          p_is_active: payload.is_active,
          p_expires_at: payload.expires_at,
          p_created_by: payload.created_by,
          p_show_proposal: payload.show_proposal,
          p_show_payments: payload.show_payments,
          p_show_schedule: payload.show_schedule,
          p_show_documents: payload.show_documents,
          p_show_photos: payload.show_photos,
          p_show_financial_summary: payload.show_financial_summary,
          p_custom_message: payload.custom_message,
        });
        if (!rpcResult.error) {
          data = rpcResult.data;
          error = null;
        } else {
          data = rpcResult.data;
          error = rpcResult.error;
        }
      }
      if (!error && data) {
        toast.success('Portal link ready. Use Copy link to share with the customer.');
        return true;
      }
    }
    const { data: contactData } = await supabase
      .from('contacts')
      .select('*')
      .eq('job_id', job.id)
      .eq('category', 'customer')
      .maybeSingle();
    if (contactData?.email) {
      const token = generateAccessToken();
      const payload = {
        job_id: job.id,
        customer_identifier: contactData.email.trim().toLowerCase(),
        access_token: token,
        customer_name: (contactData.name || '').trim() || 'Customer',
        customer_email: contactData.email.trim(),
        customer_phone: contactData.phone?.trim() || null,
        is_active: true,
        expires_at: null,
        created_by: profile?.id,
        show_proposal: true,
        show_payments: true,
        show_schedule: true,
        show_documents: true,
        show_photos: true,
        show_financial_summary: true,
        custom_message: null,
      };
      let { data, error } = await supabase
        .from('customer_portal_access')
        .insert([payload])
        .select(CUSTOMER_PORTAL_ACCESS_SELECT)
        .single();
      if (error?.code === '42501') {
        const rpcResult = await supabase.rpc('create_customer_portal_link', {
          p_job_id: payload.job_id,
          p_customer_identifier: payload.customer_identifier,
          p_access_token: payload.access_token,
          p_customer_name: payload.customer_name,
          p_customer_email: payload.customer_email,
          p_customer_phone: payload.customer_phone,
          p_is_active: payload.is_active,
          p_expires_at: payload.expires_at,
          p_created_by: payload.created_by,
          p_show_proposal: payload.show_proposal,
          p_show_payments: payload.show_payments,
          p_show_schedule: payload.show_schedule,
          p_show_documents: payload.show_documents,
          p_show_photos: payload.show_photos,
          p_show_financial_summary: payload.show_financial_summary,
          p_custom_message: payload.custom_message,
        });
        if (!rpcResult.error) {
          data = rpcResult.data;
          error = null;
        } else {
          data = rpcResult.data;
          error = rpcResult.error;
        }
      }
      if (!error && data) {
        toast.success('Portal link ready. Use Copy link to share with the customer.');
        return true;
      }
    }
    return false;
  }

  async function loadPortalLinks() {
    try {
      const { data, error } = await supabase
        .from('customer_portal_access')
        .select(CUSTOMER_PORTAL_ACCESS_SELECT)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const jobLink = (data || []).filter(link => link.job_id === job.id);
      setPortalLinks(jobLink);

      if (jobLink.length === 0) {
        const created = await ensureOnePortalLink();
        if (created) {
          const { data: data2, error: err2 } = await supabase
            .from('customer_portal_access')
            .select(CUSTOMER_PORTAL_ACCESS_SELECT)
            .eq('job_id', job.id)
            .order('created_at', { ascending: false });
          if (!err2 && data2?.length) setPortalLinks(data2);
        }
      }
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

      // Try direct table access first (no RPC/schema cache). If blocked by RLS (42501), try RPC.
      if (isUpdate) {
        const direct = await supabase
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
          .select(CUSTOMER_PORTAL_ACCESS_SELECT)
          .single();
        data = direct.data;
        error = direct.error;
        if (error?.code === '42501') {
          const rpcResult = await supabase.rpc('update_customer_portal_link', {
            p_id: existingLink!.id,
            p_customer_identifier: portalData.customer_identifier,
            p_customer_name: portalData.customer_name,
            p_customer_email: portalData.customer_email,
            p_customer_phone: portalData.customer_phone,
            p_is_active: portalData.is_active,
            p_expires_at: portalData.expires_at,
            p_show_proposal: portalData.show_proposal,
            p_show_payments: portalData.show_payments,
            p_show_schedule: portalData.show_schedule,
            p_show_documents: portalData.show_documents,
            p_show_photos: portalData.show_photos,
            p_show_financial_summary: portalData.show_financial_summary,
            p_custom_message: portalData.custom_message,
          });
          if (!rpcResult.error) {
            data = rpcResult.data;
            error = null;
          } else {
            data = rpcResult.data;
            error = rpcResult.error;
          }
        }
      } else {
        const direct = await supabase
          .from('customer_portal_access')
          .insert([{ ...portalData, created_by: profile?.id }])
          .select(CUSTOMER_PORTAL_ACCESS_SELECT)
          .single();
        data = direct.data;
        error = direct.error;
        if (error?.code === '42501') {
          const rpcResult = await supabase.rpc('create_customer_portal_link', {
            p_job_id: portalData.job_id,
            p_customer_identifier: portalData.customer_identifier,
            p_access_token: portalData.access_token,
            p_customer_name: portalData.customer_name,
            p_customer_email: portalData.customer_email,
            p_customer_phone: portalData.customer_phone,
            p_is_active: portalData.is_active,
            p_expires_at: portalData.expires_at,
            p_created_by: profile?.id,
            p_show_proposal: portalData.show_proposal,
            p_show_payments: portalData.show_payments,
            p_show_schedule: portalData.show_schedule,
            p_show_documents: portalData.show_documents,
            p_show_photos: portalData.show_photos,
            p_show_financial_summary: portalData.show_financial_summary,
            p_custom_message: portalData.custom_message,
          });
          if (!rpcResult.error) {
            data = rpcResult.data;
            error = null;
          } else {
            data = rpcResult.data;
            error = rpcResult.error;
          }
        }
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
          toast.error(
            '❌ Database is blocking this action.\n\nRun scripts/fix-customer-portal-access-rls.sql in the Supabase SQL Editor (same project as this app) to allow portal links. If that does not fix it, also run scripts/create-portal-link-rpc.sql.',
            { duration: 8000 }
          );
        } else if (error.code === 'PGRST202' || error.code === '42883' || (error.message && error.message.includes('does not exist'))) {
          toast.error(
            '❌ API can\'t see the portal link function.\n\n1. Run scripts/create-portal-link-rpc.sql in Supabase SQL Editor (same project as this app).\n2. Go to Project Settings → General → click "Restart project".\n3. Wait for the project to finish restarting, then try again.',
            { duration: 10000 }
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
      let result = await supabase
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
      if (result.error?.code === '42501') {
        result = await supabase.rpc('update_customer_portal_link', {
          p_id: selectedLink.id,
          p_customer_identifier: selectedLink.customer_identifier,
          p_customer_name: selectedLink.customer_name,
          p_customer_email: selectedLink.customer_email ?? '',
          p_customer_phone: selectedLink.customer_phone,
          p_is_active: selectedLink.is_active,
          p_expires_at: selectedLink.expires_at,
          p_show_proposal: showProposal,
          p_show_payments: showPayments,
          p_show_schedule: showSchedule,
          p_show_documents: showDocuments,
          p_show_photos: showPhotos,
          p_show_financial_summary: showFinancialSummary,
          p_custom_message: customMessage || null,
        });
      }
      if (result.error) throw result.error;

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
    setShowLineItemPrices(false);
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
    if (openDialog) setShowPreview(true);
    try {
      // Store current visibility settings for preview (so you can craft the view, then create)
      setPreviewSettings({
        show_proposal: showProposal,
        show_payments: showPayments,
        show_schedule: showSchedule,
        show_documents: showDocuments,
        show_photos: showPhotos,
        show_financial_summary: showFinancialSummary,
        show_line_item_prices: showLineItemPrices,
        custom_message: customMessage,
      });

      // Load only this job so preview shows exactly what the customer will see for this project
      const { data: jobRow, error: jobError } = await supabase
        .from('jobs')
        .select('*')
        .eq('id', job.id)
        .single();

      if (jobError || !jobRow) {
        console.error('Preview job load failed:', jobError);
        setPreviewJobs([]);
        toast.error('Could not load job for preview. Check that you have access to this job.');
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

      let proposalData = await loadProposalData(j.id);
      const hasProposalContent =
        (proposalData.materialSheets?.length ?? 0) > 0 ||
        (proposalData.customRows?.length ?? 0) > 0 ||
        (proposalData.subcontractorEstimates?.length ?? 0) > 0;
      if (!hasProposalContent && openDialog) {
        toast.info('Preview will open; this job has no proposal content yet (no material sheets or line items).', { duration: 4000 });
      }
      let viewerLinks: { id: string; label: string; url: string }[] = [];
      try {
        const { data: linksData } = await supabase
          .from('job_viewer_links')
          .select('id, label, url')
          .eq('job_id', j.id)
          .order('order_index', { ascending: true });
        if (linksData?.length) viewerLinks = linksData;
      } catch (_) {}

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
        viewerLinks,
        totalPaid,
        estimatedPrice,
        remainingBalance,
      };

      setPreviewJobs([jobWithData]);
      if (openDialog) setShowPreview(true);
    } catch (error: any) {
      console.error('Error loading preview data:', error);
      setPreviewJobs([]);
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
        const sheets = sheetsData || [];
        const sheetIds = sheets.map((s: any) => s.id);
        for (const sheet of sheets) {
          const [{ data: items }, { data: laborRows }] = await Promise.all([
            supabase.from('material_items').select('*').eq('sheet_id', sheet.id).order('order_index'),
            supabase.from('material_sheet_labor').select('*').eq('sheet_id', sheet.id),
          ]);
          (sheet as any).items = items || [];
          const laborTotal = (laborRows || []).reduce((s: number, l: any) => s + (l.total_labor_cost ?? (l.estimated_hours ?? 0) * (l.hourly_rate ?? 0)), 0);
          (sheet as any).laborTotal = laborTotal;
        }
        if (sheetIds.length > 0) {
          const { data: sheetLineItems } = await supabase
            .from('custom_financial_row_items')
            .select('*')
            .in('sheet_id', sheetIds)
            .is('row_id', null)
            .order('order_index');
          const bySheet: Record<string, any[]> = {};
          (sheetLineItems || []).forEach((item: any) => {
            const sid = item.sheet_id;
            if (sid) {
              if (!bySheet[sid]) bySheet[sid] = [];
              bySheet[sid].push(item);
            }
          });
          sheets.forEach((sheet: any) => {
            const items = bySheet[sheet.id] || [];
            const lineItemsTotal = items.reduce((s: number, item: any) => s + ((item.total_cost ?? 0) * (1 + ((item.markup_percent ?? 0) / 100))), 0);
            (sheet as any).sheetLineItemsTotal = lineItemsTotal;
          });
        }
        materialSheets = sheets;
      }

      const { data: customRowsData } = await supabase
        .from('custom_financial_rows')
        .select('*, custom_financial_row_items(*)')
        .eq('job_id', jobId)
        .order('order_index');

      const { data: subEstimatesData } = await supabase
        .from('subcontractor_estimates')
        .select('*, subcontractor_estimate_line_items(*)')
        .eq('job_id', jobId)
        .order('order_index');

      const TAX_RATE = 0.07;
      const sheetsSubtotal = (materialSheets || []).reduce((sum: number, sheet: any) => {
        const itemsTotal = (sheet.items || []).reduce((s: number, item: any) => s + ((item.price_per_unit ?? item.cost_per_unit ?? 0) * (item.quantity ?? 0)), 0);
        const labor = sheet.laborTotal ?? 0;
        const sheetLineItemsTotal = sheet.sheetLineItemsTotal ?? 0;
        return sum + itemsTotal + labor + sheetLineItemsTotal;
      }, 0);
      const subsTotal = (subEstimatesData || []).reduce((sum: number, est: any) => {
        const lineItems = est.subcontractor_estimate_line_items || [];
        const includedTotal = lineItems
          .filter((item: any) => !item.excluded)
          .reduce((s: number, item: any) => s + (item.total_price ?? 0), 0);
        const markup = est.markup_percent ?? 0;
        return sum + (includedTotal * (1 + markup / 100));
      }, 0);
      const subtotal =
        sheetsSubtotal +
        (customRowsData || []).reduce((sum, row) => sum + (row.selling_price ?? 0), 0) +
        subsTotal;
      
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
    setShowLineItemPrices(link.show_line_item_prices ?? false);
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

  const currentLink = portalLinks.find(l => l.job_id === job.id);
  const portalUrl = currentLink ? `${window.location.origin}/customer-portal?token=${currentLink.access_token}` : (pendingToken ? `${window.location.origin}/customer-portal?token=${pendingToken}` : null);
  const visibilitySettings = {
    show_proposal: showProposal,
    show_payments: showPayments,
    show_schedule: showSchedule,
    show_documents: showDocuments,
    show_photos: showPhotos,
    show_financial_summary: showFinancialSummary,
    show_line_item_prices: showLineItemPrices,
    custom_message: customMessage,
  };

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-[calc(100vh-12rem)] min-h-[500px]">
      {/* Settings sidebar – built into the portal page */}
      <aside className="w-full lg:w-[340px] shrink-0 flex flex-col gap-4 overflow-y-auto border rounded-lg bg-card p-4">
        <div>
          <h3 className="text-lg font-semibold">Portal settings</h3>
          <p className="text-sm text-muted-foreground">Control what the customer sees. Changes update the preview.</p>
        </div>

        <div className="space-y-3">
          <Label>Customer name *</Label>
          <Input
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder="John Doe"
          />
        </div>
        <div className="space-y-3">
          <Label>Customer email *</Label>
          <Input
            type="email"
            value={customerEmail}
            onChange={(e) => setCustomerEmail(e.target.value)}
            placeholder="customer@example.com"
            className={!customerEmail ? 'border-amber-500 bg-amber-50/50' : ''}
          />
          {!customerEmail && (
            <p className="text-xs text-amber-700">Email required for portal link.</p>
          )}
        </div>
        <div className="space-y-3">
          <Label>Phone (optional)</Label>
          <Input type="tel" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="(555) 123-4567" />
        </div>
        <div className="space-y-3">
          <Label>Link expires (days)</Label>
          <Input type="number" min={1} value={expiresInDays} onChange={(e) => setExpiresInDays(e.target.value)} placeholder="Empty = no expiration" />
        </div>

        <div className="border-t pt-4">
          <h4 className="font-semibold mb-3">Visibility</h4>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm">Show final price</span>
              <Switch checked={showFinancialSummary} onCheckedChange={setShowFinancialSummary} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm">Proposal</span>
              <Switch checked={showProposal} onCheckedChange={setShowProposal} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm">Payments</span>
              <Switch checked={showPayments} onCheckedChange={setShowPayments} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm">Schedule</span>
              <Switch checked={showSchedule} onCheckedChange={setShowSchedule} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm">Documents</span>
              <Switch checked={showDocuments} onCheckedChange={setShowDocuments} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm">Photos</span>
              <Switch checked={showPhotos} onCheckedChange={setShowPhotos} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm">Line item prices</span>
              <Switch checked={showLineItemPrices} onCheckedChange={setShowLineItemPrices} />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Custom welcome message</Label>
          <Textarea
            value={customMessage}
            onChange={(e) => setCustomMessage(e.target.value)}
            placeholder="Optional message for the customer..."
            rows={2}
            className="resize-none"
          />
        </div>

        <div className="flex flex-col gap-2 pt-2 border-t">
          {portalUrl && (
            <div className="flex gap-2">
              <Button size="sm" variant="default" className="flex-1" onClick={() => currentLink ? copyPortalLink(currentLink.access_token) : (navigator.clipboard.writeText(portalUrl), toast.success('Link copied'))}>
                {currentLink && copied === currentLink.access_token ? <CheckCircle className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
                Copy link
              </Button>
              <Button size="sm" variant="outline" onClick={() => window.open(portalUrl, '_blank')}>
                <ExternalLink className="w-4 h-4" />
              </Button>
            </div>
          )}
          <Button onClick={createPortalLink} className="w-full">
            {currentLink ? 'Save changes' : 'Save & create link'}
          </Button>
          {currentLink && (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="flex-1" onClick={() => toggleLinkStatus(currentLink.id, currentLink.is_active)}>
                {currentLink.is_active ? 'Deactivate' : 'Activate'}
              </Button>
              <Button size="sm" variant="outline" className="text-destructive" onClick={() => deleteLink(currentLink.id)}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>
      </aside>

      {/* Customer portal preview – main content */}
      <main className="flex-1 min-w-0 rounded-lg border bg-background overflow-hidden flex flex-col">
        {!customerName?.trim() ? (
          <div className="flex-1 flex items-center justify-center p-8 text-center">
            <div>
              <Building2 className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
              <p className="font-medium text-muted-foreground">Enter customer name and email in the settings to load the portal preview.</p>
            </div>
          </div>
        ) : previewLoading ? (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : previewJobs.length === 0 ? (
          <div className="flex-1 flex items-center justify-center p-8 text-center">
            <div>
              <Building2 className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
              <p className="font-medium text-muted-foreground">Loading preview...</p>
              <p className="text-sm text-muted-foreground mt-1">If this doesn’t update, check job access.</p>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-auto bg-gradient-to-br from-slate-50 to-slate-100">
            <CustomerPortalPreview
              customerName={customerName}
              jobs={previewJobs}
              visibilitySettings={visibilitySettings}
              customMessage={customMessage}
            />
          </div>
        )}
      </main>

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
                  <p className="text-sm text-muted-foreground">Show subtotal, tax, and grand total at bottom of proposal. Turn off to hide all pricing.</p>
                </div>
                <Switch checked={showFinancialSummary} onCheckedChange={setShowFinancialSummary} />
              </div>

              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <Label className="font-medium">Show line item prices</Label>
                  <p className="text-sm text-muted-foreground">When on, show $ on each proposal line. When off (default), only show total, tax, and grand total at bottom.</p>
                </div>
                <Switch checked={showLineItemPrices} onCheckedChange={setShowLineItemPrices} />
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
            <DialogTitle>Portal settings</DialogTitle>
            <p className="text-sm text-muted-foreground font-normal mt-1">
              {portalLinks.length === 1 ? 'Change visibility and customer info below. The same URL will keep working.' : 'Enter customer details and set visibility. Save to generate the portal link.'}
            </p>
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
                Save
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
                  Save link
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
                      <h2 className="text-xl font-bold">Preview – see what the customer will see</h2>
                      <p className="text-purple-100 text-sm">This is exactly what the customer will see. Adjust settings and preview again until it’s then save. Use Copy link to share the portal URL with the customer.</p>
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
                      <span className="text-xs text-slate-600 bg-slate-100 px-2 py-1 rounded">
                        Save in the dialog to activate this link.
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
                <Button onClick={createPortalLink} className="flex-1">
                  Save settings
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
