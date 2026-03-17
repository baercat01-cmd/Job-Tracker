import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Copy, ExternalLink, Plus, Trash2, Share2, CheckCircle, Eye, EyeOff, Building2, Calendar, DollarSign, FileText, Image, Settings } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { loadViewerLinksForJob } from '@/lib/viewer-links';
import { toast } from 'sonner';
import { computeProposalTotals } from '@/lib/proposalTotals';
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

// Full select including show_line_item_prices (use fallback if column not in schema yet)
const CUSTOMER_PORTAL_ACCESS_SELECT =
  'id,job_id,customer_identifier,access_token,customer_name,customer_email,customer_phone,is_active,expires_at,last_accessed_at,created_by,created_at,updated_at,show_proposal,show_payments,show_schedule,show_documents,show_photos,show_financial_summary,show_line_item_prices,custom_message';
// Fallback when show_line_item_prices column is missing (PGRST204 / migration not run)
const CUSTOMER_PORTAL_ACCESS_SELECT_FALLBACK =
  'id,job_id,customer_identifier,access_token,customer_name,customer_email,customer_phone,is_active,expires_at,last_accessed_at,created_by,created_at,updated_at,show_proposal,show_payments,show_schedule,show_documents,show_photos,show_financial_summary,custom_message';

interface CustomerPortalManagementProps {
  job: Job;
  /** Job id used for all portal link operations. When provided (e.g. JobsView detailDialogJobId), this is the single source of truth so the link is always for the job the user opened. */
  portalJobId?: string | null;
  /** Called at click time when creating a link; returns the current dialog job id so the link is never created for a stale job. */
  getPortalJobId?: () => string | null;
}

export function CustomerPortalManagement({ job, portalJobId, getPortalJobId }: CustomerPortalManagementProps) {
  // Job id for loading/display: use portalJobId when provided, otherwise job.id.
  const jobId = portalJobId ?? job.id;

  // Ref updated every render: the job id we are currently showing. Used when creating a link so we always create for THIS job (avoids wrong-job link from stale closures).
  const createLinkJobIdRef = useRef<string>(job.id);
  createLinkJobIdRef.current = job.id;

  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [portalLinks, setPortalLinks] = useState<CustomerPortalLink[]>([]);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [selectedLink, setSelectedLink] = useState<CustomerPortalLink | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [pendingToken, setPendingToken] = useState<string | null>(null);

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

  // Proposal line items visibility (for "Hide from customer portal" toggles)
  const [proposalLineItems, setProposalLineItems] = useState<{ rows: Array<{ id: string; description?: string; category?: string; sheet_id?: string; items: Array<{ id: string; description?: string; hide_from_customer?: boolean }> }> }>({ rows: [] });
  const [proposalLineItemsLoading, setProposalLineItemsLoading] = useState(false);

  // Mount once — jobId is frozen, so these never need to re-run
  useEffect(() => {
    console.log(`[PortalMgmt] Mounted for job: "${job.name}" id=${jobId}`);
    loadPortalLinks();
    loadCustomerInfo();
  }, []);

  // Load preview data whenever customer name is filled
  useEffect(() => {
    if (loading || !customerName?.trim()) return;
    loadPreviewData(false);
  }, [loading, customerName]);

  // When a saved link is found, sync the form from it
  useEffect(() => {
    const link = portalLinks.find(l => l.job_id === jobId);
    if (!link) return;
    setCustomerName(link.customer_name ?? '');
    setCustomerEmail(link.customer_email || '');
    setCustomerPhone(link.customer_phone || '');
    setShowProposal(link.show_proposal === true);
    setShowPayments(link.show_payments === true);
    setShowSchedule(link.show_schedule === true);
    setShowDocuments(link.show_documents === true);
    setShowPhotos(link.show_photos === true);
    setShowFinancialSummary(link.show_financial_summary === true);
    setShowLineItemPrices(link.show_line_item_prices === true);
    setCustomMessage(link.custom_message || '');
    setExpiresInDays(link.expires_at ? '' : '');
  }, [portalLinks]);

  useEffect(() => {
    loadProposalLineItems();
  }, []);

  async function loadProposalLineItems() {
    setProposalLineItemsLoading(true);
    try {
      const { data: quotes } = await supabase
        .from('quotes')
        .select('id')
        .eq('job_id', jobId)
        .order('created_at', { ascending: false });
      const quoteId = (quotes && quotes[0]) ? quotes[0].id : null;
      if (!quoteId) {
        setProposalLineItems({ rows: [] });
        return;
      }
      const [quoteRows, jobRows] = await Promise.all([
        supabase.from('custom_financial_rows').select('*, custom_financial_row_items(*)').eq('quote_id', quoteId).order('order_index'),
        supabase.from('custom_financial_rows').select('*, custom_financial_row_items(*)').eq('job_id', jobId).is('quote_id', null).order('order_index'),
      ]);
      const quoteRowIds = new Set((quoteRows.data || []).map((r: any) => r.id));
      const jobOnlyRows = (jobRows.data || []).filter((r: any) => !quoteRowIds.has(r.id));
      const allRows = [...(quoteRows.data || []), ...jobOnlyRows].sort((a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0));
      const rowsWithItems = allRows.map((row: any) => ({
        id: row.id,
        description: row.description || row.category,
        category: row.category,
        sheet_id: row.sheet_id,
        items: ((row.custom_financial_row_items || []) as any[])
          .sort((a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0))
          .map((i: any) => ({ id: i.id, description: i.description, hide_from_customer: !!i.hide_from_customer })),
      }));
      setProposalLineItems({ rows: rowsWithItems });
    } catch (e) {
      console.error('Load proposal line items:', e);
      setProposalLineItems({ rows: [] });
    } finally {
      setProposalLineItemsLoading(false);
    }
  }

  async function setLineItemVisibleToCustomer(lineItemId: string, visible: boolean) {
    try {
      const { error } = await supabase
        .from('custom_financial_row_items')
        .update({ hide_from_customer: !visible })
        .eq('id', lineItemId);
      if (error) throw error;
      setProposalLineItems((prev) => ({
        rows: prev.rows.map((row) => ({
          ...row,
          items: row.items.map((it) =>
            it.id === lineItemId ? { ...it, hide_from_customer: !visible } : it
          ),
        })),
      }));
      toast.success(visible ? 'Line item will show in portal' : 'Line item hidden from portal');
    } catch (e: any) {
      console.error('Update line item visibility:', e);
      toast.error(e?.message || 'Failed to update');
    }
  }

  async function loadCustomerInfo() {
    try {
      console.log('🔍 Loading customer info for job:', job.id, job.name || job.client_name);

      // Priority 1: Job overview (Edit Job form – customer email, client name, phone)
      const jobEmail = (job as { customer_email?: string | null }).customer_email;
      const jobPhone = (job as { customer_phone?: string | null }).customer_phone;
      if (jobEmail && jobEmail.trim()) {
        setCustomerName(job.client_name || '');
        setCustomerEmail(jobEmail.trim());
        setCustomerPhone((jobPhone && jobPhone.trim()) || '');
        console.log('✅ Loaded from job overview:', job.client_name, jobEmail, 'for job', job.id);
        return;
      }

      // Priority 2: Contacts table (customer contact for THIS SPECIFIC JOB ONLY)
      console.log('  📞 Checking contacts for job_id:', job.id);
      const { data: contactData, error: contactError } = await supabase
        .from('contacts')
        .select('*')
        .eq('job_id', jobId)
        .eq('category', 'customer')
        .maybeSingle();

      if (contactError) {
        console.error('  ❌ Error loading contact:', contactError);
      } else if (contactData) {
        console.log('  📋 Contact found:', contactData);
      } else {
        console.log('  ℹ️ No customer contact found for this job');
      }

      if (contactData && contactData.email) {
        setCustomerName(contactData.name);
        setCustomerEmail(contactData.email);
        setCustomerPhone(contactData.phone || '');
        console.log('✅ Loaded from contacts:', contactData.name, contactData.email, 'for job', job.id);
        return;
      }

      // Priority 3: Quote (for THIS SPECIFIC JOB ONLY)
      console.log('  📄 Checking quote for job_id:', job.id);
      const { data: quoteData, error: quoteError } = await supabase
        .from('quotes')
        .select('customer_name, customer_email, customer_phone')
        .eq('job_id', jobId)
        .maybeSingle();

      if (quoteError) {
        console.error('  ❌ Error loading quote:', quoteError);
      } else if (quoteData) {
        console.log('  📋 Quote found:', quoteData);
      } else {
        console.log('  ℹ️ No quote found for this job');
      }

      if (quoteData && quoteData.customer_email) {
        setCustomerName(quoteData.customer_name || job.client_name || '');
        setCustomerEmail(quoteData.customer_email);
        setCustomerPhone(quoteData.customer_phone || '');
        console.log('✅ Loaded from quote:', quoteData.customer_name, quoteData.customer_email, 'for job', job.id);
        return;
      }

      // Fallback: job name only, no email/phone
      setCustomerName(job.client_name || '');
      setCustomerEmail('');
      setCustomerPhone('');
      console.log('⚠️ No email found for job', job.id, '- user must enter manually');

      toast.warning(
        'Customer email not found.\n\nAdd it in Job Overview (Edit Job → Customer Email), or enter it below.',
        { duration: 8000 }
      );
    } catch (error: any) {
      console.error('❌ Error loading customer info for job', job.id, ':', error);
      // Fallback to job data on error
      setCustomerName(job.client_name || '');
      setCustomerEmail('');
      setCustomerPhone('');
      toast.error('Could not load customer information. Please enter manually.');
    }
  }

  async function loadPortalLinks() {
    console.log(`[PortalMgmt] loadPortalLinks for job="${job.name}" id=${jobId}`);
    try {
      // Try RPC first (has SECURITY DEFINER, bypasses RLS, returns full visibility row)
      const { data: rpcRow, error: rpcError } = await supabase.rpc('get_customer_portal_link_by_job', { p_job_id: jobId });
      if (!rpcError && rpcRow != null) {
        // Normalize: RPC can return single jsonb object, or array of one row, or stringified JSON
        let row: any = rpcRow;
        if (typeof row === 'string') {
          try { row = JSON.parse(row); } catch { row = null; }
        }
        if (Array.isArray(row) && row.length > 0) row = row[0];
        if (row && typeof row === 'object' && (row.job_id != null || row.id != null)) {
          const link = { ...row, show_line_item_prices: row.show_line_item_prices ?? false } as CustomerPortalLink;
          console.log(`[PortalMgmt] RPC found link job_id=${link.job_id} token=${link.access_token?.slice(0, 8)}...`);
          setPortalLinks([link]);
          setLoading(false);
          return;
        }
      }

      // Fallback: direct table query filtered strictly by this job's id
      let select = CUSTOMER_PORTAL_ACCESS_SELECT;
      let { data, error } = await supabase
        .from('customer_portal_access')
        .select(select)
        .eq('job_id', jobId)
        .order('created_at', { ascending: false });

      if (error && (error?.code === 'PGRST204' || (error?.message && /show_line_item_prices|column.*exist/i.test(error.message)))) {
        select = CUSTOMER_PORTAL_ACCESS_SELECT_FALLBACK;
        const fallback = await supabase
          .from('customer_portal_access')
          .select(select)
          .eq('job_id', jobId)
          .order('created_at', { ascending: false });
        data = fallback.data;
        error = fallback.error;
      }

      if (error) throw error;

      const jobLinks = (data || []).map((l: any) => ({ ...l, show_line_item_prices: l.show_line_item_prices ?? false }));
      console.log(`[PortalMgmt] Direct query found ${jobLinks.length} link(s) for job ${jobId}`);
      setPortalLinks(jobLinks);
    } catch (error: any) {
      console.error('[PortalMgmt] Error loading portal links:', error);
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
    // Use the job id we are currently displaying (ref updated every render). This guarantees the link is for the job shown in this tab.
    const jobIdToUse = createLinkJobIdRef.current || jobId;
    if (!jobIdToUse) {
      toast.error('Could not determine which job to create the link for. Please close and reopen this job.');
      return;
    }
    console.log(`[PortalMgmt] createPortalLink for job="${job.name}" id=${jobIdToUse}`);

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

    // One link per job: update existing or create new (jobIdToUse = getter at click time)
    const existingLink = portalLinks.find(link => link.job_id === jobIdToUse);
    const isUpdate = !!existingLink;

    console.log(isUpdate ? '🔷 Updating portal link...' : '🔷 Creating portal link...');
    console.log('  Customer:', customerName);
    console.log('  Email:', customerEmail);
    console.log('  Job id (for link):', jobIdToUse);

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
        job_id: jobIdToUse,
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
        show_line_item_prices: showLineItemPrices,
        custom_message: customMessage?.trim() || null,
        updated_at: new Date().toISOString(),
      };

      console.log('  🔷 CREATING/UPDATING PORTAL LINK FOR JOB:', job.id, job.name || job.client_name);
      console.log('  Portal data:', JSON.stringify(portalData, null, 2));

      let data: any;
      let error: any;

      const isColumnError = (e: any) =>
        e?.code === 'PGRST204' || (e?.message && /show_line_item_prices|column.*exist|schema cache/i.test(String(e.message)));

      // Try direct table access first (no RPC/schema cache). If blocked by RLS (42501), try RPC.
      if (isUpdate) {
        const updatePayload = {
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
          show_line_item_prices: portalData.show_line_item_prices,
          custom_message: portalData.custom_message,
          updated_at: portalData.updated_at,
        };
        let direct = await supabase
          .from('customer_portal_access')
          .update(updatePayload)
          .eq('id', existingLink!.id)
          .select(CUSTOMER_PORTAL_ACCESS_SELECT)
          .single();
        data = direct.data;
        error = direct.error;
        if (error && isColumnError(error)) {
          const { show_line_item_prices: _dropped, ...payloadWithout } = updatePayload as any;
          direct = await supabase
            .from('customer_portal_access')
            .update(payloadWithout)
            .eq('id', existingLink!.id)
            .select(CUSTOMER_PORTAL_ACCESS_SELECT_FALLBACK)
            .single();
          data = direct.data;
          error = direct.error;
          if (!error && data) (data as any).show_line_item_prices = false;
        }
        if (error?.code === '42501' || error?.code === 'PGRST116') {
          let rpcResult = await supabase.rpc('update_customer_portal_link', {
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
            p_show_line_item_prices: portalData.show_line_item_prices,
            p_custom_message: portalData.custom_message,
          });
          if (rpcResult.error && (rpcResult.error?.code === '42883' || /unknown function|argument|does not exist/i.test(String(rpcResult.error?.message)))) {
            rpcResult = await supabase.rpc('update_customer_portal_link', {
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
          }
          if (!rpcResult.error) {
            data = rpcResult.data;
            error = null;
          } else {
            data = rpcResult.data;
            error = rpcResult.error;
          }
        }
      } else {
        const insertPayload = { ...portalData, created_by: profile?.id };
        let direct = await supabase
          .from('customer_portal_access')
          .insert([insertPayload])
          .select(CUSTOMER_PORTAL_ACCESS_SELECT)
          .single();
        data = direct.data;
        error = direct.error;
        if (error && isColumnError(error)) {
          const { show_line_item_prices: _dropped, ...payloadWithout } = insertPayload as any;
          direct = await supabase
            .from('customer_portal_access')
            .insert([payloadWithout])
            .select(CUSTOMER_PORTAL_ACCESS_SELECT_FALLBACK)
            .single();
          data = direct.data;
          error = direct.error;
          if (!error && data) (data as any).show_line_item_prices = false;
        }
        if (error?.code === '42501' || error?.code === 'PGRST116') {
          let rpcResult = await supabase.rpc('create_customer_portal_link', {
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
            p_show_line_item_prices: portalData.show_line_item_prices,
            p_custom_message: portalData.custom_message,
          });
          if (rpcResult.error && (rpcResult.error?.code === '42883' || /unknown function|argument|does not exist/i.test(String(rpcResult.error?.message)))) {
            const createParams: Record<string, unknown> = {
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
            };
            delete createParams.p_show_line_item_prices;
            rpcResult = await supabase.rpc('create_customer_portal_link', createParams as any);
          }
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
        } else if (error.code === 'PGRST204' || (error.message && /show_line_item_prices|schema cache/i.test(String(error.message)))) {
          toast.error(
            '❌ Could not save: database schema is missing the show_line_item_prices column.\n\nRun the migration that adds it to customer_portal_access, or try saving again (the app will retry without that option).',
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

      // Safety: ensure the saved row is for the job we intended (never copy a link for the wrong job)
      const savedJobId = data?.job_id ?? null;
      if (savedJobId && savedJobId !== jobIdToUse) {
        console.error('[PortalMgmt] Wrong job in response: expected', jobIdToUse, 'got', savedJobId);
        toast.error('The link was saved for a different job. Please close this dialog, open the correct job (e.g. Ropp Barn), and create the link again.');
        return;
      }

      if (isUpdate) {
        toast.success('Portal link updated. Same URL; visibility settings saved.', { duration: 3000 });
      } else {
        console.log('✅ Portal link created successfully:', data);
        toast.success(`✅ Customer portal link created for ${job.name}`, { duration: 3000 });
      }

      // Optimistically set the link from the create response so the UI shows it even if loadPortalLinks RPC returns a different shape
      if (data && typeof data === 'object' && (data.job_id != null || data.id != null)) {
        const newLink = { ...data, show_line_item_prices: (data as any).show_line_item_prices ?? false } as CustomerPortalLink;
        setPortalLinks((prev) => {
          const rest = prev.filter((l) => l.job_id !== jobIdToUse);
          return [newLink, ...rest];
        });
      }

      setShowCreateDialog(false);
      resetForm();
      await loadPortalLinks();

      // Use token from the row we just saved so we never copy a wrong-job link
      const tokenToCopy = data?.access_token ?? token;
      const portalUrl = `${window.location.origin}/customer-portal?token=${tokenToCopy}`;
      await navigator.clipboard.writeText(portalUrl);
      toast.success(isUpdate ? 'Portal URL copied (unchanged).' : '🔗 Portal link copied to clipboard!', { duration: 3000 });

      console.log('[PortalMgmt] Copied URL for job_id=', jobIdToUse, 'token=', tokenToCopy?.slice(0, 8) + '...');
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

    const isColumnError = (e: any) =>
      e?.code === 'PGRST204' || (e?.message && /show_line_item_prices|column.*exist|schema cache/i.test(String(e.message)));

    try {
      const updatePayload = {
        show_proposal: showProposal,
        show_payments: showPayments,
        show_schedule: showSchedule,
        show_documents: showDocuments,
        show_photos: showPhotos,
        show_financial_summary: showFinancialSummary,
        show_line_item_prices: showLineItemPrices,
        custom_message: customMessage || null,
      };
      let result = await supabase
        .from('customer_portal_access')
        .update(updatePayload)
        .eq('id', selectedLink.id);
      if (result.error && isColumnError(result.error)) {
        const { show_line_item_prices: _dropped, ...payloadWithout } = updatePayload as any;
        result = await supabase
          .from('customer_portal_access')
          .update(payloadWithout)
          .eq('id', selectedLink.id);
      }
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
          p_show_line_item_prices: showLineItemPrices,
          p_custom_message: customMessage || null,
        });
        if (result.error && (result.error?.code === '42883' || /unknown function|argument|does not exist/i.test(String(result?.error?.message)))) {
          const rpcPayload: Record<string, unknown> = {
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
          };
          delete rpcPayload.p_show_line_item_prices;
          result = await supabase.rpc('update_customer_portal_link', rpcPayload as any);
        }
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

  /** Auto-save a single visibility toggle the moment it changes (only when a link already exists). */
  async function autoSaveVisibility(field: string, newValue: boolean) {
    const link = portalLinks.find((l: any) => l.job_id === jobId);
    if (!link) return; // No existing link yet — will be saved when "Save & create link" is clicked

    const updated = {
      show_financial_summary: field === 'show_financial_summary' ? newValue : showFinancialSummary,
      show_proposal:          field === 'show_proposal'          ? newValue : showProposal,
      show_payments:          field === 'show_payments'          ? newValue : showPayments,
      show_schedule:          field === 'show_schedule'          ? newValue : showSchedule,
      show_documents:         field === 'show_documents'         ? newValue : showDocuments,
      show_photos:            field === 'show_photos'            ? newValue : showPhotos,
      show_line_item_prices:  field === 'show_line_item_prices'  ? newValue : showLineItemPrices,
      updated_at: new Date().toISOString(),
    };

    const isColumnError = (e: any) =>
      e?.code === 'PGRST204' || (e?.message && /show_line_item_prices|column.*exist|unknown column/i.test(String(e.message)));

    try {
      let result = await supabase
        .from('customer_portal_access')
        .update(updated)
        .eq('id', link.id);

      if (result.error && isColumnError(result.error)) {
        const withoutLinePrices = { ...updated };
        delete (withoutLinePrices as any).show_line_item_prices;
        result = await supabase
          .from('customer_portal_access')
          .update(withoutLinePrices)
          .eq('id', link.id);
      }

      if (result.error?.code === '42501' || result.error?.code === 'PGRST116') {
        result = await supabase.rpc('update_customer_portal_link', {
          p_id: link.id,
          p_customer_identifier: link.customer_identifier,
          p_customer_name: link.customer_name,
          p_customer_email: link.customer_email ?? '',
          p_customer_phone: link.customer_phone,
          p_is_active: link.is_active,
          p_expires_at: link.expires_at,
          p_show_proposal:          updated.show_proposal,
          p_show_payments:          updated.show_payments,
          p_show_schedule:          updated.show_schedule,
          p_show_documents:         updated.show_documents,
          p_show_photos:            updated.show_photos,
          p_show_financial_summary: updated.show_financial_summary,
          p_show_line_item_prices:  updated.show_line_item_prices,
          p_custom_message: customMessage || null,
        });
        if (result.error && (result.error?.code === '42883' || /unknown function|does not exist|argument/i.test(String(result.error?.message)))) {
          result = await supabase.rpc('update_customer_portal_link', {
            p_id: link.id,
            p_customer_identifier: link.customer_identifier,
            p_customer_name: link.customer_name,
            p_customer_email: link.customer_email ?? '',
            p_customer_phone: link.customer_phone,
            p_is_active: link.is_active,
            p_expires_at: link.expires_at,
            p_show_proposal:          updated.show_proposal,
            p_show_payments:          updated.show_payments,
            p_show_schedule:          updated.show_schedule,
            p_show_documents:         updated.show_documents,
            p_show_photos:            updated.show_photos,
            p_show_financial_summary: updated.show_financial_summary,
            p_custom_message: customMessage || null,
          });
        }
      }

      if (result.error) throw result.error;

      // Update local portal links with the values we just saved so the sync effect doesn't overwrite with stale refetch data (which was causing toggles to reset)
      setPortalLinks((prev) =>
        prev.map((l) =>
          l.id === link.id ? { ...l, ...updated, show_line_item_prices: updated.show_line_item_prices ?? l.show_line_item_prices } : l
        )
      );
      toast.success('Setting saved — customer link will reflect this.');
    } catch (err: any) {
      console.error('Failed to auto-save visibility setting:', err);
      toast.error('Failed to save setting');
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
        .eq('id', jobId)
        .maybeSingle();

      if (jobError || !jobRow) {
        console.error('Preview job load failed:', jobError);
        setPreviewJobs([]);
        toast.error('Could not load job for preview. Check that you have access to this job.');
        setPreviewLoading(false);
        return;
      }

      const j = jobRow;
      const { data: quotesRows } = await supabase
        .from('quotes')
        .select('*')
        .eq('job_id', j.id)
        .order('created_at', { ascending: false });
      // Sort by highest proposal number so the newest proposal is always the default
      const jobQuotes = [...(quotesRows || [])].sort((a: any, b: any) => {
        const aN = parseInt((a.proposal_number || a.quote_number || '0').split('-').pop() || '0', 10);
        const bN = parseInt((b.proposal_number || b.quote_number || '0').split('-').pop() || '0', 10);
        return bN - aN;
      });
      const quoteData = jobQuotes[0] ?? null;

      const { data: paymentsData } = await supabase
        .from('customer_payments')
        .select('*')
        .eq('job_id', j.id)
        .order('payment_date', { ascending: false });

      const { data: documentsData } = await supabase
        .from('job_documents')
        .select('id, name, category')
        .eq('job_id', j.id)
        .eq('visible_to_customer_portal', true);

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

      let proposalData: any;
      const proposalDataByQuoteId: Record<string, any> = {};
      if (jobQuotes.length > 0) {
        const results = await Promise.all(
          jobQuotes.map((q: any) => loadProposalDataForQuote(j.id, q.id, !!q.tax_exempt))
        );
        jobQuotes.forEach((q: any, i: number) => {
          proposalDataByQuoteId[q.id] = results[i];
        });
        proposalData = proposalDataByQuoteId[jobQuotes[0].id] ?? results[0];
      } else {
        proposalData = await loadProposalData(j.id);
      }
      const hasProposalContent =
        (proposalData.materialSheets?.length ?? 0) > 0 ||
        (proposalData.customRows?.length ?? 0) > 0 ||
        (proposalData.subcontractorEstimates?.length ?? 0) > 0;
      if (!hasProposalContent && openDialog) {
        toast.info('Preview will open; this job has no proposal content yet (no material sheets or line items).', { duration: 4000 });
      }
      const viewerLinks = await loadViewerLinksForJob(supabase, j.id);

      const totalPaid = (paymentsData || []).reduce((sum, p) => sum + parseFloat(p.amount || '0'), 0);
      const estimatedPrice = proposalData.totals.grandTotal;
      const remainingBalance = estimatedPrice - totalPaid;

      const jobWithData = {
        ...j,
        quote: quoteData,
        jobQuotes,
        proposalDataByQuoteId,
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

  /** Load proposal data for a specific quote — mirrors CustomerPortal.tsx logic exactly. Use stored totals from quote when available so office preview matches customer portal & JobFinancials. */
  async function loadProposalDataForQuote(jobId: string, quoteId: string | null, taxExempt: boolean): Promise<{
    materialSheets: any[];
    customRows: any[];
    subcontractorEstimates: any[];
    totals: { subtotal: number; tax: number; grandTotal: number };
  }> {
    const TAX_RATE = 0.07;
    const empty = { materialSheets: [], customRows: [], subcontractorEstimates: [], totals: { subtotal: 0, tax: 0, grandTotal: 0 } };
    try {
      // Use same source as JobFinancials & CustomerPortal: quote columns (proposal_subtotal, proposal_tax, proposal_grand_total) so preview Grand Total matches Proposal & Materials
      let storedTotals: { subtotal: number; tax: number; grandTotal: number } | null = null;
      if (quoteId) {
        const { data: quoteRow } = await supabase
          .from('quotes')
          .select('proposal_subtotal, proposal_tax, proposal_grand_total')
          .eq('id', quoteId)
          .maybeSingle();
        let sub = quoteRow?.proposal_subtotal != null ? Number(quoteRow.proposal_subtotal) : NaN;
        let tax = quoteRow?.proposal_tax != null ? Number(quoteRow.proposal_tax) : 0;
        let grand = quoteRow?.proposal_grand_total != null ? Number(quoteRow.proposal_grand_total) : NaN;
        if (!Number.isFinite(sub) || !Number.isFinite(grand)) {
          const { data: rpcData } = await supabase.rpc('get_quote_proposal_totals', { p_quote_id: quoteId });
          const row = Array.isArray(rpcData) && rpcData.length > 0 ? (rpcData[0] as { subtotal?: number | null; tax?: number | null; grand_total?: number | null }) : null;
          if (row) {
            sub = row.subtotal != null ? Number(row.subtotal) : sub;
            tax = row.tax != null ? Number(row.tax) : tax;
            grand = row.grand_total != null ? Number(row.grand_total) : grand;
          }
        }
        if (Number.isFinite(sub) && Number.isFinite(grand)) {
          storedTotals = { subtotal: sub, tax: Number.isFinite(tax) ? tax : 0, grandTotal: grand };
        }
      }

      // Workbook: prefer status='working' for this quoteId, then any status, then null-quote, then scan all
      let workbookData: { id: string } | null = null;
      if (quoteId) {
        const { data: wb } = await supabase.from('material_workbooks').select('id').eq('job_id', jobId).eq('quote_id', quoteId).eq('status', 'working').order('updated_at', { ascending: false }).limit(1).maybeSingle();
        workbookData = wb ?? null;
        if (!workbookData) {
          const { data: wb2 } = await supabase.from('material_workbooks').select('id').eq('job_id', jobId).eq('quote_id', quoteId).order('updated_at', { ascending: false }).limit(1).maybeSingle();
          workbookData = wb2 ?? null;
        }
      }
      if (!workbookData) {
        const { data: wb } = await supabase.from('material_workbooks').select('id').eq('job_id', jobId).is('quote_id', null).eq('status', 'working').order('updated_at', { ascending: false }).limit(1).maybeSingle();
        workbookData = wb ?? null;
      }
      if (!workbookData) {
        const { data: allWbs } = await supabase.from('material_workbooks').select('id').eq('job_id', jobId).order('status', { ascending: false }).order('updated_at', { ascending: false });
        workbookData = (allWbs || [])[0] ?? null;
      }

      let materialSheets: any[] = [];
      if (workbookData) {
        const { data: sheetsData } = await supabase.from('material_sheets').select('*').eq('workbook_id', workbookData.id).order('order_index');
        let sheets = sheetsData || [];

        // Item-count fallback: if workbook has no items, scan all job workbooks for one that does
        let doFallback = sheets.length === 0;
        if (!doFallback && sheets.length > 0) {
          const { count: itemCount } = await supabase.from('material_items').select('id', { count: 'exact', head: true }).in('sheet_id', sheets.map((s: any) => s.id));
          if ((itemCount ?? 0) === 0) doFallback = true;
        }
        if (doFallback) {
          const { data: allWbs } = await supabase.from('material_workbooks').select('id').eq('job_id', jobId).order('status', { ascending: false }).order('updated_at', { ascending: false });
          for (const wb of allWbs || []) {
            if (wb.id === workbookData.id) continue;
            const { data: altSheets } = await supabase.from('material_sheets').select('*').eq('workbook_id', wb.id).order('order_index');
            if ((altSheets || []).length > 0) {
              const { count: c } = await supabase.from('material_items').select('id', { count: 'exact', head: true }).in('sheet_id', (altSheets || []).map((s: any) => s.id));
              if ((c ?? 0) > 0) { sheets = altSheets!; workbookData = wb; break; }
            }
          }
        }

        const sheetIds = sheets.map((s: any) => s.id);
        for (const sheet of sheets) {
          const [{ data: items }, { data: laborRows }, { data: catMarkups }] = await Promise.all([
            supabase.from('material_items').select('*').eq('sheet_id', sheet.id).order('order_index'),
            supabase.from('material_sheet_labor').select('*').eq('sheet_id', sheet.id),
            supabase.from('material_category_markups').select('*').eq('sheet_id', sheet.id),
          ]);
          (sheet as any).items = items || [];
          (sheet as any).laborTotal = (laborRows || []).reduce((s: number, l: any) => s + (l.total_labor_cost ?? (l.estimated_hours ?? 0) * (l.hourly_rate ?? 0)), 0);
          const catMarkupMap: Record<string, number> = {};
          (catMarkups || []).forEach((cm: any) => { catMarkupMap[cm.category_name] = cm.markup_percent ?? 10; });
          (sheet as any).categoryMarkups = catMarkupMap;
        }
        if (sheetIds.length > 0) {
          const { data: sheetLineItems } = await supabase.from('custom_financial_row_items').select('*').in('sheet_id', sheetIds).is('row_id', null).order('order_index');
          const bySheet: Record<string, any[]> = {};
          (sheetLineItems || []).forEach((item: any) => { const sid = item.sheet_id; if (sid) { if (!bySheet[sid]) bySheet[sid] = []; bySheet[sid].push(item); } });
          sheets.forEach((sheet: any) => { (sheet as any).sheetLinkedItems = bySheet[sheet.id] || []; });
        }
        materialSheets = sheets;
      }

      // Custom rows — deduplicated (quote rows take priority over job-level rows)
      let customRowsData: any[] = [];
      if (quoteId) {
        const [forQuote, forJob] = await Promise.all([
          supabase.from('custom_financial_rows').select('*, custom_financial_row_items(*)').eq('quote_id', quoteId).order('order_index'),
          supabase.from('custom_financial_rows').select('*, custom_financial_row_items(*)').eq('job_id', jobId).is('quote_id', null).order('order_index'),
        ]);
        const quoteRowIds = new Set((forQuote.data || []).map((r: any) => r.id));
        customRowsData = [...(forQuote.data || []), ...(forJob.data || []).filter((r: any) => !quoteRowIds.has(r.id))].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
      } else {
        const { data } = await supabase.from('custom_financial_rows').select('*, custom_financial_row_items(*)').eq('job_id', jobId).order('order_index');
        customRowsData = data || [];
      }

      // Subcontractors — deduplicated
      let subEstimatesData: any[] = [];
      if (quoteId) {
        const [forQuote, forJob] = await Promise.all([
          supabase.from('subcontractor_estimates').select('*, subcontractor_estimate_line_items(*)').eq('quote_id', quoteId).order('order_index'),
          supabase.from('subcontractor_estimates').select('*, subcontractor_estimate_line_items(*)').eq('job_id', jobId).is('quote_id', null).order('order_index'),
        ]);
        const quoteSubIds = new Set((forQuote.data || []).map((r: any) => r.id));
        subEstimatesData = [...(forQuote.data || []), ...(forJob.data || []).filter((r: any) => !quoteSubIds.has(r.id))].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
      } else {
        const { data } = await supabase.from('subcontractor_estimates').select('*, subcontractor_estimate_line_items(*)').eq('job_id', jobId).order('order_index');
        subEstimatesData = data || [];
      }

      // Build input for shared totals calculation function
      const customRowLineItems: Record<string, any[]> = {};
      (customRowsData || []).forEach((row: any) => {
        customRowLineItems[row.id] = row.custom_financial_row_items || [];
      });

      const subcontractorLineItems: Record<string, any[]> = {};
      (subEstimatesData || []).forEach((est: any) => {
        subcontractorLineItems[est.id] = est.subcontractor_estimate_line_items || [];
      });

      // Build global category markups map from all sheets
      const categoryMarkups: Record<string, number> = {};
      (materialSheets || []).forEach((sheet: any) => {
        Object.entries(sheet.categoryMarkups || {}).forEach(([cat, markup]) => {
          if (categoryMarkups[cat] === undefined) {
            categoryMarkups[cat] = markup as number;
          }
        });
      });

      // Call shared totals function to ensure consistency with customer portal
      const totals = computeProposalTotals({
        materialSheets: materialSheets || [],
        customRows: customRowsData || [],
        subcontractorEstimates: subEstimatesData || [],
        customRowLineItems,
        subcontractorLineItems,
        categoryMarkups,
        taxRate: TAX_RATE,
        taxExempt,
      });

      // Also compute _computedTotal for each item for UI display
      (materialSheets || []).forEach((sheet: any) => {
        const catMarkups: Record<string, number> = sheet.categoryMarkups || {};
        const byCategory = new Map<string, any[]>();
        (sheet.items || []).forEach((item: any) => {
          const cat = item.category || 'Uncategorized';
          if (!byCategory.has(cat)) byCategory.set(cat, []);
          byCategory.get(cat)!.push(item);
        });
        let sheetCatPrice = 0;
        byCategory.forEach((catItems, catName) => {
          const markup = catMarkups[catName] ?? 10;
          const categoryTotal = catItems.reduce((s: number, i: any) => {
            const ext = i.extended_price != null && i.extended_price !== '' ? Number(i.extended_price) : null;
            if (ext != null && ext > 0) return s + ext;
            const qty = Number(i.quantity) || 0;
            const pricePerUnit = Number(i.price_per_unit) || 0;
            if (pricePerUnit > 0) return s + qty * pricePerUnit;
            const cost = i.extended_cost != null ? Number(i.extended_cost) : qty * (Number(i.cost_per_unit) || 0);
            return s + cost * (1 + markup / 100);
          }, 0);
          sheetCatPrice += categoryTotal;
        });
        const sheetDirectLabor = sheet.laborTotal ?? 0;
        let sheetLinkedLabor = 0;
        (sheet.sheetLinkedItems || []).forEach((item: any) => {
          if ((item.item_type || 'material') === 'labor') {
            sheetLinkedLabor += (Number(item.total_cost) || 0) * (1 + ((item.markup_percent ?? 0) / 100));
          }
        });
        (sheet as any)._computedTotal = sheetCatPrice + sheetDirectLabor + sheetLinkedLabor;
      });

      (customRowsData || []).forEach((row: any) => {
        const lineItems: any[] = row.custom_financial_row_items || [];
        const rowMarkup = 1 + (Number(row.markup_percent) || 0) / 100;
        let rowTotal = 0;
        if (lineItems.length > 0) {
          const matItems = lineItems.filter((li: any) => (li.item_type || 'material') === 'material');
          const labItems = lineItems.filter((li: any) => (li.item_type || 'material') === 'labor');
          const matTotal = matItems.reduce((s: number, i: any) => s + (Number(i.total_cost) || 0), 0) * rowMarkup;
          const labTotal = labItems.reduce((s: number, i: any) => s + (Number(i.total_cost) || 0) * (1 + ((i.markup_percent ?? 0) / 100)), 0);
          rowTotal = matTotal + labTotal;
        } else {
          rowTotal = (Number(row.total_cost) || 0) * rowMarkup;
        }
        (row as any)._computedTotal = rowTotal;
      });

      (subEstimatesData || []).forEach((est: any) => {
        const lineItems: any[] = est.subcontractor_estimate_line_items || [];
        const markup = 1 + (Number(est.markup_percent) || 0) / 100;
        const matItems = lineItems.filter((li: any) => !li.excluded && (li.item_type || 'material') === 'material');
        const labItems = lineItems.filter((li: any) => !li.excluded && (li.item_type || 'material') === 'labor');
        const matTotal = matItems.reduce((s: number, i: any) => s + (Number(i.total_price) || 0), 0) * markup;
        const labTotal = labItems.reduce((s: number, i: any) => s + (Number(i.total_price) || 0), 0) * markup;
        (est as any)._computedTotal = matTotal + labTotal;
      });

      const subtotal = totals.subtotal;
      const tax = totals.tax;
      const grandTotal = totals.grandTotal;

      return { materialSheets, customRows: customRowsData, subcontractorEstimates: subEstimatesData, totals };
    } catch (error) {
      console.error('Error loading proposal data for quote:', error);
      return empty;
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

  const currentLink = portalLinks.find(l => l.job_id === jobId);
  // Only show a URL when we have a saved link for THIS job. Never show a pendingToken URL (not in DB yet).
  const portalUrl = currentLink ? `${window.location.origin}/customer-portal?token=${currentLink.access_token}` : null;
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

  // Map line item id -> visible (so preview reflects "Proposal line items" toggles immediately)
  const lineItemVisibleToCustomer: Record<string, boolean> = {};
  proposalLineItems.rows.forEach((row) => {
    row.items.forEach((item) => {
      lineItemVisibleToCustomer[item.id] = !item.hide_from_customer;
    });
  });

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-[calc(100vh-12rem)] min-h-[500px]">
      {/* Settings sidebar – built into the portal page */}
      <aside className="w-full lg:w-[340px] shrink-0 flex flex-col gap-4 overflow-y-auto border rounded-lg bg-card p-4">
        <div>
          <h3 className="text-lg font-semibold">Portal settings</h3>
          <p className="text-sm font-medium text-primary mt-1">This portal is for: {job.name}</p>
          <p className="text-sm text-muted-foreground mt-0.5">Control what the customer sees. The link below opens this job’s info for the customer.</p>
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
          <p className="text-xs text-muted-foreground mb-2">Saved to the portal link below. When the customer opens the link, they see only what you enable here.</p>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm">Show final price</span>
              <Switch checked={showFinancialSummary} onCheckedChange={(v) => { setShowFinancialSummary(v); autoSaveVisibility('show_financial_summary', v); }} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm">Proposal</span>
              <Switch checked={showProposal} onCheckedChange={(v) => { setShowProposal(v); autoSaveVisibility('show_proposal', v); }} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm">Payments</span>
              <Switch checked={showPayments} onCheckedChange={(v) => { setShowPayments(v); autoSaveVisibility('show_payments', v); }} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm">Schedule</span>
              <Switch checked={showSchedule} onCheckedChange={(v) => { setShowSchedule(v); autoSaveVisibility('show_schedule', v); }} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm">Documents</span>
              <Switch checked={showDocuments} onCheckedChange={(v) => { setShowDocuments(v); autoSaveVisibility('show_documents', v); }} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm">Photos</span>
              <Switch checked={showPhotos} onCheckedChange={(v) => { setShowPhotos(v); autoSaveVisibility('show_photos', v); }} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm">Line item prices</span>
              <Switch checked={showLineItemPrices} onCheckedChange={(v) => { setShowLineItemPrices(v); autoSaveVisibility('show_line_item_prices', v); }} />
            </div>
          </div>
        </div>

        <div className="border-t pt-4">
          <h4 className="font-semibold mb-1">Proposal line items</h4>
          <p className="text-xs text-muted-foreground mb-3">Choose which line items the customer sees in the portal.</p>
          {proposalLineItemsLoading ? (
            <p className="text-xs text-muted-foreground">Loading…</p>
          ) : proposalLineItems.rows.length === 0 ? (
            <p className="text-xs text-muted-foreground">No proposal line items for this job. Add rows and line items in the Proposal tab.</p>
          ) : (
            <div className="space-y-3 max-h-[280px] overflow-y-auto pr-1">
              {proposalLineItems.rows.map((row) => (
                <div key={row.id} className="space-y-1.5">
                  <p className="text-xs font-medium text-slate-700">{row.description || row.category || 'Custom row'}</p>
                  {row.items.length === 0 ? (
                    <p className="text-xs text-muted-foreground pl-2">No line items</p>
                  ) : (
                    <ul className="space-y-1 pl-2 border-l-2 border-slate-200">
                      {row.items.map((item) => (
                        <li key={item.id} className="flex items-center justify-between gap-2 py-0.5">
                          <span className="text-xs text-slate-600 truncate flex-1 min-w-0" title={item.description || ''}>
                            {item.description || 'Line item'}
                          </span>
                          <div className="flex items-center gap-1 shrink-0">
                            {item.hide_from_customer ? (
                              <span title="Hidden from customer"><EyeOff className="w-3.5 h-3.5 text-amber-600" /></span>
                            ) : (
                              <span title="Visible to customer"><Eye className="w-3.5 h-3.5 text-emerald-600" /></span>
                            )}
                            <Switch
                              checked={!item.hide_from_customer}
                              onCheckedChange={(v) => setLineItemVisibleToCustomer(item.id, v)}
                              title={item.hide_from_customer ? 'Show in portal' : 'Hide from portal'}
                            />
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
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
          <p className="text-sm font-semibold">Customer portal link for this job</p>
          {portalUrl ? (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-muted-foreground">Copy this link to share with the customer. It opens this job’s proposal, payments, schedule, and documents.</p>
              <div className="flex items-center gap-1 bg-primary/5 border-2 border-primary/20 rounded-md px-2 py-1.5 group">
                <a
                  href={portalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 text-xs text-primary font-medium truncate hover:underline"
                  title={portalUrl}
                >
                  {portalUrl.replace(/^https?:\/\//, '')}
                </a>
                <button
                  className="flex-shrink-0 p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                  title="Copy link"
                  onClick={() => currentLink && copyPortalLink(currentLink.access_token)}
                >
                  {currentLink && copied === currentLink.access_token
                    ? <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                    : <Copy className="w-3.5 h-3.5" />}
                </button>
                <button
                  className="flex-shrink-0 p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                  title="Open in new tab"
                  onClick={() => window.open(portalUrl, '_blank')}
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              </div>
              {typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                  This link only works on this device. To open on your phone: deploy the app (e.g. Vercel/Netlify) and share the new link, or on the same Wi‑Fi use <strong>http://YOUR_PC_IP:8080</strong>/customer-portal?token=... (find your PC&apos;s IP in system settings).
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Customer can open the link and tap &quot;Install&quot; to save it like an app (Martin Builder style).
              </p>
              {currentLink?.customer_email && (
                <a
                  href={`mailto:${currentLink.customer_email}?subject=Your Project Portal&body=Here is your project portal link: ${portalUrl}`}
                  className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 underline-offset-2 hover:underline"
                >
                  <ExternalLink className="w-3 h-3" /> Send via email
                </a>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              No link yet. Enter customer name and email above, then click <strong>Save & create link</strong> to generate the portal link for <strong>{job.name}</strong>. Only the link that appears after saving is valid for this job.
            </p>
          )}
          <Button
            type="button"
            onClick={() => {
              createPortalLink().catch((err) => {
                console.error('[PortalMgmt] createPortalLink error:', err);
                toast.error(err?.message ?? 'Something went wrong. Please try again.');
              });
            }}
            className="w-full"
          >
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
      <main className="flex-1 min-w-0 min-h-[500px] rounded-lg border bg-background overflow-hidden flex flex-col">
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
          <div className="flex-1 min-h-0 overflow-auto bg-gradient-to-br from-slate-50 to-slate-100">
            <div className="min-h-[480px]">
              <CustomerPortalPreview
                customerName={customerName}
                jobs={previewJobs}
                visibilitySettings={visibilitySettings}
                customMessage={customMessage}
                lineItemVisibleToCustomer={lineItemVisibleToCustomer}
              />
            </div>
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
                <Switch checked={showFinancialSummary} onCheckedChange={(v) => { setShowFinancialSummary(v); selectedLink && autoSaveVisibility('show_financial_summary', v); }} />
              </div>

              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <Label className="font-medium">Show line item prices</Label>
                  <p className="text-sm text-muted-foreground">When on, show $ on each proposal line. When off (default), only show total, tax, and grand total at bottom.</p>
                </div>
                <Switch checked={showLineItemPrices} onCheckedChange={(v) => { setShowLineItemPrices(v); selectedLink && autoSaveVisibility('show_line_item_prices', v); }} />
              </div>

              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <Label className="font-medium">Proposal Details</Label>
                  <p className="text-sm text-muted-foreground">Show itemized proposal/pricing breakdown</p>
                </div>
                <Switch checked={showProposal} onCheckedChange={(v) => { setShowProposal(v); selectedLink && autoSaveVisibility('show_proposal', v); }} />
              </div>

              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <Label className="font-medium">Payment History</Label>
                  <p className="text-sm text-muted-foreground">Show all payment records</p>
                </div>
                <Switch checked={showPayments} onCheckedChange={(v) => { setShowPayments(v); selectedLink && autoSaveVisibility('show_payments', v); }} />
              </div>

              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <Label className="font-medium">Schedule/Timeline</Label>
                  <p className="text-sm text-muted-foreground">Show project timeline and milestones</p>
                </div>
                <Switch checked={showSchedule} onCheckedChange={(v) => { setShowSchedule(v); selectedLink && autoSaveVisibility('show_schedule', v); }} />
              </div>

              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <Label className="font-medium">Documents</Label>
                  <p className="text-sm text-muted-foreground">Show project documents and drawings</p>
                </div>
                <Switch checked={showDocuments} onCheckedChange={(v) => { setShowDocuments(v); selectedLink && autoSaveVisibility('show_documents', v); }} />
              </div>

              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <Label className="font-medium">Photos</Label>
                  <p className="text-sm text-muted-foreground">Show progress photos</p>
                </div>
                <Switch checked={showPhotos} onCheckedChange={(v) => { setShowPhotos(v); selectedLink && autoSaveVisibility('show_photos', v); }} />
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
                  <Switch checked={showFinancialSummary} onCheckedChange={(v) => { setShowFinancialSummary(v); autoSaveVisibility('show_financial_summary', v); }} />
                </div>

                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <Label className="font-medium">Proposal (scope & description)</Label>
                    <p className="text-sm text-muted-foreground">Show proposal tab with scope; prices only if “Show final price” is on</p>
                  </div>
                  <Switch checked={showProposal} onCheckedChange={(v) => { setShowProposal(v); autoSaveVisibility('show_proposal', v); }} />
                </div>

                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <Label className="font-medium">Payment History</Label>
                    <p className="text-sm text-muted-foreground">Show all payment records</p>
                  </div>
                  <Switch checked={showPayments} onCheckedChange={(v) => { setShowPayments(v); autoSaveVisibility('show_payments', v); }} />
                </div>

                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <Label className="font-medium">Schedule/Timeline</Label>
                    <p className="text-sm text-muted-foreground">Show project timeline</p>
                  </div>
                  <Switch checked={showSchedule} onCheckedChange={(v) => { setShowSchedule(v); autoSaveVisibility('show_schedule', v); }} />
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
                  <Switch checked={showPhotos} onCheckedChange={(v) => { setShowPhotos(v); autoSaveVisibility('show_photos', v); }} />
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
              <Button onClick={(e) => { void loadPreviewData(); }} variant="outline" className="flex-1" disabled={!customerName}>
                <Eye className="w-4 h-4 mr-2" />
                Preview Customer View
              </Button>
              <Button type="button" onClick={() => createPortalLink().catch((err) => { console.error(err); toast.error(err?.message ?? 'Something went wrong.'); })} className="flex-1">
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
                <Button type="button" onClick={() => createPortalLink().catch((err) => { console.error(err); toast.error(err?.message ?? 'Something went wrong.'); })} className="flex-1">
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
                      <h2 className="text-xl font-bold">Preview - see what the customer will see</h2>
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

              {/* Portal URL - only show when we have a saved link for this job */}
              {(() => {
                const existingLink = portalLinks.find(l => l.job_id === jobId);
                const previewPortalUrl = existingLink ? `${window.location.origin}/customer-portal?token=${existingLink.access_token}` : '';
                return previewPortalUrl ? (
                  <div className="bg-white border-b px-6 py-3 flex-shrink-0 flex items-center gap-3 flex-wrap">
                    <span className="text-sm font-medium text-slate-600 whitespace-nowrap">Portal link for this job:</span>
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
                  </div>
                ) : (
                  <div className="bg-white border-b px-6 py-3 flex-shrink-0">
                    <span className="text-sm text-slate-600">Save & create link in the sidebar to get the portal URL for this job.</span>
                  </div>
                );
              })()}

              {/* Embedded Interactive Portal */}
              <div className="flex-1 min-h-0 overflow-auto bg-gradient-to-br from-slate-50 to-slate-100">
                <div className="min-h-[480px]">
                  <CustomerPortalPreview 
                    customerName={customerName}
                    jobs={previewJobs}
                    visibilitySettings={previewSettings}
                    customMessage={previewSettings?.custom_message}
                    lineItemVisibleToCustomer={lineItemVisibleToCustomer}
                  />
                </div>
              </div>

              {/* Preview Footer Actions */}
              <div className="bg-white border-t-2 px-6 py-4 flex gap-3 flex-shrink-0">
                <Button onClick={() => setShowPreview(false)} variant="outline" className="flex-1">
                  Back to settings
                </Button>
                <Button type="button" onClick={() => createPortalLink().catch((err) => { console.error(err); toast.error(err?.message ?? 'Something went wrong.'); })} className="flex-1">
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
