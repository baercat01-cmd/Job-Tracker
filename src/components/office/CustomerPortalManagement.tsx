import { useState, useEffect, useRef } from 'react';
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
import {
  insertCustomerPortalAccessRow,
  portalSaveErrorMessage,
  updateCustomerPortalAccessRow,
  updateCustomerPortalAccessRowMinimal,
} from '@/lib/customerPortalAccessDb';
import { loadViewerLinksForJob } from '@/lib/viewer-links';
import { toast } from 'sonner';
import { computeProposalTotals } from '@/lib/proposalTotals';
import { useAuth } from '@/hooks/useAuth';
import type { Job } from '@/types';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
  /** Per-section price visibility: { [sectionId]: true | false }. Omitted key = use global show_line_item_prices. */
  show_section_prices?: Record<string, boolean> | null;
  /** Per-proposal visibility overrides: { [quoteId]: { show_proposal?, show_section_prices?, ... } }. Customer sees these when viewing that proposal. */
  visibility_by_quote?: Record<string, {
    show_proposal?: boolean;
    show_payments?: boolean;
    show_schedule?: boolean;
    show_documents?: boolean;
    show_photos?: boolean;
    show_financial_summary?: boolean;
    show_line_item_prices?: boolean;
    show_section_prices?: Record<string, boolean>;
  }> | null;
  custom_message: string | null;
}

// Full select including show_line_item_prices and show_section_prices (use fallback if columns not in schema yet)
const CUSTOMER_PORTAL_ACCESS_SELECT =
  'id,job_id,customer_identifier,access_token,customer_name,customer_email,customer_phone,is_active,expires_at,last_accessed_at,created_by,created_at,updated_at,show_proposal,show_payments,show_schedule,show_documents,show_photos,show_financial_summary,show_line_item_prices,show_section_prices,visibility_by_quote,custom_message';
// Fallback when show_line_item_prices column is missing (PGRST204 / migration not run)
const CUSTOMER_PORTAL_ACCESS_SELECT_FALLBACK =
  'id,job_id,customer_identifier,access_token,customer_name,customer_email,customer_phone,is_active,expires_at,last_accessed_at,created_by,created_at,updated_at,show_proposal,show_payments,show_schedule,show_documents,show_photos,show_financial_summary,custom_message';

/** RPC/jsonb NOT NULL: never pass null for show_section_prices (some DBs use NOT NULL jsonb). */
function sectionPricesJsonForRpc(
  primary: Record<string, boolean> | null | undefined,
  preserveWhenPerQuote?: Record<string, boolean> | null | undefined
): Record<string, boolean> {
  if (primary && typeof primary === 'object' && !Array.isArray(primary) && Object.keys(primary).length > 0) {
    return { ...primary };
  }
  if (preserveWhenPerQuote && typeof preserveWhenPerQuote === 'object' && !Array.isArray(preserveWhenPerQuote)) {
    return { ...preserveWhenPerQuote };
  }
  return {};
}

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
  /** Per-section price visibility. When undefined for a section, fall back to showLineItemPrices. */
  const [showSectionPrices, setShowSectionPrices] = useState<Record<string, boolean>>({});
  const [customMessage, setCustomMessage] = useState('');

  // Preview state
  const [showPreview, setShowPreview] = useState(false);
  const [previewJobs, setPreviewJobs] = useState<any[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewSettings, setPreviewSettings] = useState<any>(null);

  // Section list for per-section price visibility (material sheets, custom rows, subcontractors)
  const [sectionList, setSectionList] = useState<Array<{ id: string; name: string; type: 'material' | 'custom' | 'subcontractor' }>>([]);
  const [sectionListLoading, setSectionListLoading] = useState(false);
  // Proposals (quotes) for this job — used so visibility can be set per proposal
  const [jobQuotes, setJobQuotes] = useState<Array<{ id: string; proposal_number?: string; quote_number?: string }>>([]);
  /** Which proposal's visibility we're editing. When set, section list and form sync from visibility_by_quote[this]. */
  const [selectedQuoteIdForVisibility, setSelectedQuoteIdForVisibility] = useState<string | null>(null);

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

  // Load job quotes when we have a link so we can offer per-proposal visibility
  useEffect(() => {
    if (!jobId || !portalLinks.some(l => l.job_id === jobId)) return;
    (async () => {
      const { data } = await supabase.from('quotes').select('id, proposal_number, quote_number').eq('job_id', jobId).order('created_at', { ascending: false });
      const list = (data || []).map((q: any) => ({ id: q.id, proposal_number: q.proposal_number, quote_number: q.quote_number }));
      setJobQuotes(list);
      setSelectedQuoteIdForVisibility((prev) => (prev && list.some((q: any) => q.id === prev)) ? prev : (list[0]?.id ?? null));
    })();
  }, [jobId, portalLinks]);

  // When a saved link is found, sync the form from it (use per-quote visibility if editing that proposal)
  useEffect(() => {
    const link = portalLinks.find(l => l.job_id === jobId);
    if (!link) return;
    setCustomerName(link.customer_name ?? '');
    setCustomerEmail(link.customer_email || '');
    setCustomerPhone(link.customer_phone || '');
    setExpiresInDays(link.expires_at ? '' : '');
    setCustomMessage(link.custom_message || '');
    const perQuote = selectedQuoteIdForVisibility && link.visibility_by_quote && typeof link.visibility_by_quote === 'object' && !Array.isArray(link.visibility_by_quote)
      ? (link.visibility_by_quote as Record<string, any>)[selectedQuoteIdForVisibility]
      : null;
    if (perQuote && typeof perQuote === 'object') {
      setShowProposal(perQuote.show_proposal === true);
      setShowPayments(perQuote.show_payments === true);
      setShowSchedule(perQuote.show_schedule === true);
      setShowDocuments(perQuote.show_documents === true);
      setShowPhotos(perQuote.show_photos === true);
      setShowFinancialSummary(perQuote.show_financial_summary === true);
      setShowLineItemPrices(perQuote.show_line_item_prices === true);
      const raw = perQuote.show_section_prices;
      setShowSectionPrices(typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Record<string, boolean>) : {});
    } else {
      setShowProposal(link.show_proposal === true);
      setShowPayments(link.show_payments === true);
      setShowSchedule(link.show_schedule === true);
      setShowDocuments(link.show_documents === true);
      setShowPhotos(link.show_photos === true);
      setShowFinancialSummary(link.show_financial_summary === true);
      setShowLineItemPrices(link.show_line_item_prices === true);
      const raw = link.show_section_prices;
      setShowSectionPrices(typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Record<string, boolean>) : {});
    }
  }, [portalLinks, selectedQuoteIdForVisibility]);

  useEffect(() => {
    if (!jobId || !portalLinks.some(l => l.job_id === jobId)) return;
    const quoteId = selectedQuoteIdForVisibility ?? jobQuotes[0]?.id ?? null;
    loadSectionList(quoteId);
  }, [jobId, portalLinks, selectedQuoteIdForVisibility, jobQuotes]);

  /** Load section list to match the proposal: same quote, same workbook resolution and merge/dedupe as customer portal. */
  async function loadSectionList(quoteIdOverride?: string | null) {
    setSectionListLoading(true);
    try {
      const sections: Array<{ id: string; name: string; type: 'material' | 'custom' | 'subcontractor' }> = [];
      let quoteId = quoteIdOverride ?? null;
      if (quoteId == null) {
        const { data: quotes } = await supabase.from('quotes').select('id').eq('job_id', jobId).order('created_at', { ascending: false });
        quoteId = (quotes && quotes[0]) ? quotes[0].id : null;
      }

      // Material sheets: use same workbook resolution as proposal (working → any status → null-quote → any job workbook)
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
      if (workbookData) {
        const { data: sheets } = await supabase.from('material_sheets').select('id, sheet_name, order_index').eq('workbook_id', workbookData.id).order('order_index');
        (sheets || []).forEach((s: any) => sections.push({ id: s.id, name: s.sheet_name || 'Section', type: 'material' }));
      }

      // Linked custom rows (sheet_id set) — e.g. "Stain & Labor for ceiling" — so office can hide/show price per section
      if (quoteId) {
        const [quoteLinked, jobLinked] = await Promise.all([
          supabase.from('custom_financial_rows').select('id, description, category, order_index, sheet_id').eq('quote_id', quoteId).not('sheet_id', 'is', null).order('order_index'),
          supabase.from('custom_financial_rows').select('id, description, category, order_index, sheet_id').eq('job_id', jobId).is('quote_id', null).not('sheet_id', 'is', null).order('order_index'),
        ]);
        const quoteLinkedIds = new Set((quoteLinked.data || []).map((r: any) => r.id));
        const jobOnlyLinked = (jobLinked.data || []).filter((r: any) => !quoteLinkedIds.has(r.id));
        const linkedRows = [...(quoteLinked.data || []), ...jobOnlyLinked].sort((a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0));
        linkedRows.forEach((r: any) => sections.push({ id: r.id, name: r.description || r.category || 'Custom row', type: 'custom' }));
      } else {
        const { data: linkedRows } = await supabase.from('custom_financial_rows').select('id, description, category, order_index').eq('job_id', jobId).not('sheet_id', 'is', null).order('order_index');
        (linkedRows || []).forEach((r: any) => sections.push({ id: r.id, name: r.description || r.category || 'Custom row', type: 'custom' }));
      }

      // Standalone custom rows (no sheet_id)
      if (quoteId) {
        const [quoteRows, jobRows] = await Promise.all([
          supabase.from('custom_financial_rows').select('id, description, category, order_index').eq('quote_id', quoteId).is('sheet_id', null).order('order_index'),
          supabase.from('custom_financial_rows').select('id, description, category, order_index').eq('job_id', jobId).is('quote_id', null).is('sheet_id', null).order('order_index'),
        ]);
        const quoteIds = new Set((quoteRows.data || []).map((r: any) => r.id));
        const jobOnly = (jobRows.data || []).filter((r: any) => !quoteIds.has(r.id));
        const customRows = [...(quoteRows.data || []), ...jobOnly].sort((a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0));
        customRows.forEach((r: any) => sections.push({ id: r.id, name: r.description || r.category || 'Custom row', type: 'custom' }));
      } else {
        const { data: customRows } = await supabase.from('custom_financial_rows').select('id, description, category, order_index').eq('job_id', jobId).is('sheet_id', null).order('order_index');
        (customRows || []).forEach((r: any) => sections.push({ id: r.id, name: r.description || r.category || 'Custom row', type: 'custom' }));
      }

      // Subcontractors: quote + job-only, deduped by id, standalone only (same as proposal)
      if (quoteId) {
        const [quoteSubs, jobSubs] = await Promise.all([
          supabase.from('subcontractor_estimates').select('id, company_name, order_index').eq('quote_id', quoteId).is('sheet_id', null).is('row_id', null).order('order_index'),
          supabase.from('subcontractor_estimates').select('id, company_name, order_index').eq('job_id', jobId).is('quote_id', null).is('sheet_id', null).is('row_id', null).order('order_index'),
        ]);
        const quoteSubIds = new Set((quoteSubs.data || []).map((r: any) => r.id));
        const jobOnlySubs = (jobSubs.data || []).filter((r: any) => !quoteSubIds.has(r.id));
        const subs = [...(quoteSubs.data || []), ...jobOnlySubs].sort((a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0));
        subs.forEach((s: any) => sections.push({ id: s.id, name: s.company_name || 'Subcontractor', type: 'subcontractor' }));
      } else {
        const { data: subs } = await supabase.from('subcontractor_estimates').select('id, company_name, order_index').eq('job_id', jobId).is('sheet_id', null).is('row_id', null).order('order_index');
        (subs || []).forEach((s: any) => sections.push({ id: s.id, name: s.company_name || 'Subcontractor', type: 'subcontractor' }));
      }

      setSectionList(sections);
    } catch {
      setSectionList([]);
    } finally {
      setSectionListLoading(false);
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

      // Which proposal's visibility row to write. Single-quote jobs often have selectedQuoteId still null before effects run — resolve so Save persists.
      let quoteForSave = selectedQuoteIdForVisibility ?? null;
      if (!quoteForSave && jobQuotes.length === 1) quoteForSave = jobQuotes[0].id;
      if (!quoteForSave && isUpdate) {
        const { data: qr } = await supabase
          .from('quotes')
          .select('id')
          .eq('job_id', jobIdToUse)
          .order('created_at', { ascending: false })
          .limit(2);
        if (qr?.length === 1) quoteForSave = qr[0].id;
      }
      /** When set on UPDATE, we PATCH visibility_by_quote. When undefined, omit / RPC null so DB is not wiped with {}. */
      const visibilityPatch: Record<string, unknown> | undefined =
        isUpdate && quoteForSave
          ? (mergeVisibilityForQuote(quoteForSave, {}) as Record<string, unknown>)
          : isUpdate
            ? undefined
            : quoteForSave
              ? (mergeVisibilityForQuote(quoteForSave, {}) as Record<string, unknown>)
              : {};
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
        show_section_prices: sectionPricesJsonForRpc(showSectionPrices),
        visibility_by_quote:
          visibilityPatch !== undefined
            ? visibilityPatch
            : isUpdate
              ? ((existingLink!.visibility_by_quote as Record<string, unknown>) ?? {})
              : {},
        custom_message: customMessage?.trim() || null,
        updated_at: new Date().toISOString(),
      };

      console.log('  🔷 CREATING/UPDATING PORTAL LINK FOR JOB:', job.id, job.name || job.client_name);
      console.log('  Portal data:', JSON.stringify(portalData, null, 2));

      let data: any;
      let error: any;

      // Direct REST on customer_portal_access only (no RPC — avoids PostgREST schema cache on functions).
      if (isUpdate) {
        const updatePayload: Record<string, unknown> = {
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
          show_section_prices: sectionPricesJsonForRpc(portalData.show_section_prices as Record<string, boolean> | null),
          custom_message: portalData.custom_message,
        };
        if (visibilityPatch !== undefined) {
          updatePayload.visibility_by_quote = visibilityPatch;
        }
        const up = await updateCustomerPortalAccessRow(
          existingLink!.id,
          updatePayload,
          CUSTOMER_PORTAL_ACCESS_SELECT,
          CUSTOMER_PORTAL_ACCESS_SELECT_FALLBACK
        );
        data = up.data;
        error = up.error;
        if (up.error && String((up.error as any)?.code) === '23502') {
          const retryPayload = {
            ...updatePayload,
            show_section_prices: sectionPricesJsonForRpc(
              portalData.show_section_prices as Record<string, boolean> | null,
              existingLink?.show_section_prices as Record<string, boolean> | null
            ),
            visibility_by_quote:
              visibilityPatch !== undefined
                ? visibilityPatch
                : ((existingLink!.visibility_by_quote as Record<string, unknown>) ?? {}),
          };
          const up2 = await updateCustomerPortalAccessRow(
            existingLink!.id,
            retryPayload,
            CUSTOMER_PORTAL_ACCESS_SELECT,
            CUSTOMER_PORTAL_ACCESS_SELECT_FALLBACK
          );
          data = up2.data;
          error = up2.error;
        }
      } else {
        const insertPayload = { ...portalData, created_by: profile?.id };
        const ins = await insertCustomerPortalAccessRow(
          insertPayload,
          CUSTOMER_PORTAL_ACCESS_SELECT,
          CUSTOMER_PORTAL_ACCESS_SELECT_FALLBACK
        );
        data = ins.data;
        error = ins.error;
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
        } else if (error.code === '42501' || String(error.code) === 'PORTAL_UPDATE_0_ROWS') {
          toast.error(portalSaveErrorMessage(error), { duration: 10000 });
        } else if (
          error.code === 'PGRST202' ||
          error.code === '42883' ||
          (/could not find the function|function public\.(update|create)_customer_portal/i.test(String(error.message || '')) &&
            !/column/i.test(String(error.message || '')))
        ) {
          toast.error(
            '❌ API can\'t see the portal link function.\n\n1. In Supabase → SQL Editor, run supabase/migrations/20250335000000_customer_portal_create_update_link_rpcs.sql (or scripts/create-portal-link-rpc.sql).\n2. Project Settings → General → Restart project, wait 1–2 minutes.\n3. Confirm your app .env VITE_SUPABASE_URL matches that project.\n4. Try Save again.',
            { duration: 16000 }
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

      // Optimistically set the link from the create/update response so the UI shows it even if loadPortalLinks RPC returns a different shape. Preserve visibility so form doesn't flash wrong values.
      if (data && typeof data === 'object' && (data.job_id != null || data.id != null)) {
        const newLink = {
          ...data,
          show_line_item_prices: (data as any).show_line_item_prices ?? false,
          visibility_by_quote: (data as any).visibility_by_quote ?? (portalData as any).visibility_by_quote ?? (existingLink as any)?.visibility_by_quote,
        } as CustomerPortalLink;
        setPortalLinks((prev) => {
          const rest = prev.filter((l) => l.job_id !== jobIdToUse);
          return [newLink, ...rest];
        });
      }

      setShowCreateDialog(false);
      // Only reset form when creating a new link; when updating, keep current visibility toggles so they match what was just saved
      if (!isUpdate) resetForm();
      await loadPortalLinks();

      if (isUpdate) {
        if (quoteForSave) {
          setSelectedQuoteIdForVisibility((prev) => prev || quoteForSave);
        }
        setPortalLinks((prev) =>
          prev.map((l) =>
            l.job_id === jobIdToUse
              ? ({
                  ...l,
                  show_proposal: portalData.show_proposal,
                  show_payments: portalData.show_payments,
                  show_schedule: portalData.show_schedule,
                  show_documents: portalData.show_documents,
                  show_photos: portalData.show_photos,
                  show_financial_summary: portalData.show_financial_summary,
                  show_line_item_prices: portalData.show_line_item_prices,
                  show_section_prices: portalData.show_section_prices,
                  visibility_by_quote:
                    visibilityPatch !== undefined ? visibilityPatch : l.visibility_by_quote,
                } as CustomerPortalLink)
              : l
          )
        );
      }

      // Copy URL only when creating a new link — on update, copying + "unchanged" looked like saves were ignored
      if (!isUpdate) {
        const tokenToCopy = data?.access_token ?? token;
        const portalUrl = `${window.location.origin}/customer-portal?token=${tokenToCopy}`;
        await navigator.clipboard.writeText(portalUrl);
        toast.success('🔗 Portal link copied to clipboard!', { duration: 3000 });
        console.log('[PortalMgmt] Copied URL for job_id=', jobIdToUse, 'token=', tokenToCopy?.slice(0, 8) + '...');
      }
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
      const sectionPricesSafe = sectionPricesJsonForRpc(
        showSectionPrices as Record<string, boolean> | null,
        selectedLink.show_section_prices as Record<string, boolean> | null
      );
      const visibilitySafe =
        selectedLink.visibility_by_quote && typeof selectedLink.visibility_by_quote === 'object'
          ? selectedLink.visibility_by_quote
          : {};
      const updatePayload: Record<string, unknown> = {
        show_proposal: showProposal,
        show_payments: showPayments,
        show_schedule: showSchedule,
        show_documents: showDocuments,
        show_photos: showPhotos,
        show_financial_summary: showFinancialSummary,
        show_line_item_prices: showLineItemPrices,
        show_section_prices: sectionPricesSafe,
        visibility_by_quote: visibilitySafe,
        custom_message: customMessage || null,
      };
      let { error } = await updateCustomerPortalAccessRowMinimal(selectedLink.id, updatePayload);
      if (error && String((error as any)?.code) === '23502') {
        const r2 = await updateCustomerPortalAccessRowMinimal(selectedLink.id, {
          ...updatePayload,
          show_section_prices: sectionPricesSafe,
          visibility_by_quote: visibilitySafe,
        });
        error = r2.error;
      }
      if (error) throw Object.assign(new Error(portalSaveErrorMessage(error)), { cause: error });

      toast.success('Portal settings updated');
      setShowSettingsDialog(false);
      await loadPortalLinks();
    } catch (error: any) {
      console.error('Error updating portal settings:', error);
      toast.error('Failed to update portal settings');
    }
  }

  /**
   * Build visibility_by_quote for the selected proposal. Uses current form state as source of truth
   * (then applies overrides). Do NOT use `base.field ?? form` — stored `false` is not nullish, so that
   * pattern ignored toggles from true→false or false→true and made "Save changes" appear to revert.
   */
  function mergeVisibilityForQuote(
    quoteId: string,
    overrides: Partial<{ show_proposal: boolean; show_payments: boolean; show_schedule: boolean; show_documents: boolean; show_photos: boolean; show_financial_summary: boolean; show_line_item_prices: boolean; show_section_prices: Record<string, boolean> }>
  ) {
    const link = portalLinks.find((l: any) => l.job_id === jobId);
    const prev =
      link?.visibility_by_quote && typeof link.visibility_by_quote === 'object' && !Array.isArray(link.visibility_by_quote)
        ? { ...(link.visibility_by_quote as Record<string, any>) }
        : {};
    const fromForm = {
      show_proposal: showProposal,
      show_payments: showPayments,
      show_schedule: showSchedule,
      show_documents: showDocuments,
      show_photos: showPhotos,
      show_financial_summary: showFinancialSummary,
      show_line_item_prices: showLineItemPrices,
      show_section_prices: { ...showSectionPrices },
    };
    prev[quoteId] = { ...fromForm, ...overrides };
    return prev;
  }

  /** Auto-save a single visibility toggle the moment it changes (only when a link already exists). */
  async function autoSaveVisibility(field: string, newValue: boolean) {
    const link = portalLinks.find((l: any) => l.job_id === jobId);
    if (!link) return; // No existing link yet — will be saved when "Save & create link" is clicked

    const sectionPricesSafe = sectionPricesJsonForRpc(
      showSectionPrices as Record<string, boolean> | null,
      link.show_section_prices as Record<string, boolean> | null
    );
    const linePricesVal = field === 'show_line_item_prices' ? newValue : showLineItemPrices;
    let quoteIdForAutosave =
      selectedQuoteIdForVisibility ?? (jobQuotes.length === 1 ? jobQuotes[0].id : null);
    if (!quoteIdForAutosave) {
      const { data: qr } = await supabase
        .from('quotes')
        .select('id')
        .eq('job_id', jobId)
        .order('created_at', { ascending: false })
        .limit(2);
      if (qr?.length === 1) quoteIdForAutosave = qr[0].id;
    }
    const visibilityPatch: Record<string, unknown> | undefined = quoteIdForAutosave
      ? (mergeVisibilityForQuote(quoteIdForAutosave, { [field]: newValue } as any) as Record<string, unknown>)
      : undefined;

    const updated: Record<string, unknown> = {
      show_financial_summary: field === 'show_financial_summary' ? newValue : showFinancialSummary,
      show_proposal: field === 'show_proposal' ? newValue : showProposal,
      show_payments: field === 'show_payments' ? newValue : showPayments,
      show_schedule: field === 'show_schedule' ? newValue : showSchedule,
      show_documents: field === 'show_documents' ? newValue : showDocuments,
      show_photos: field === 'show_photos' ? newValue : showPhotos,
      show_line_item_prices: linePricesVal,
      show_section_prices: sectionPricesSafe,
      updated_at: new Date().toISOString(),
    };
    if (visibilityPatch !== undefined) {
      updated.visibility_by_quote = visibilityPatch;
    }

    try {
      let { ok, error } = await updateCustomerPortalAccessRowMinimal(link.id, updated);
      if (!ok && error) {
        const msg = portalSaveErrorMessage(error);
        console.error('Failed to auto-save visibility setting:', error);
        toast.error(`Could not save: ${msg}`, { duration: 8000 });
        return;
      }

      const nextVisibility =
        visibilityPatch !== undefined ? visibilityPatch : link.visibility_by_quote;
      setPortalLinks((prev) =>
        prev.map((l) => {
          if (l.id !== link.id) return l;
          const linePrices = updated.show_line_item_prices;
          return {
            ...l,
            ...updated,
            show_line_item_prices: typeof linePrices === 'boolean' ? linePrices : l.show_line_item_prices,
            show_section_prices:
              (updated.show_section_prices as Record<string, boolean>) ?? l.show_section_prices,
            visibility_by_quote: nextVisibility as CustomerPortalLink['visibility_by_quote'],
          } as CustomerPortalLink;
        })
      );
      toast.success('Setting saved — customer link will reflect this.');
    } catch (err: any) {
      console.error('Failed to auto-save visibility setting:', err);
      toast.error(err?.message ? `Could not save: ${err.message}` : 'Failed to save setting', { duration: 6000 });
    }
  }

  /** Persist per-section price visibility (show/hide price for each section). */
  async function saveSectionPriceVisibility(sectionId: string, show: boolean) {
    const link = portalLinks.find((l: any) => l.job_id === jobId);
    if (!link) return;
    setShowSectionPrices((prev) => ({ ...prev, [sectionId]: show }));
    const next = { ...showSectionPrices, [sectionId]: show };
    const isColumnError = (e: any) =>
      e?.code === 'PGRST204' || (e?.message && /show_section_prices|visibility_by_quote|column.*exist|unknown column/i.test(String(e?.message)));
    const PORTAL_COLUMNS_HELP =
      'Supabase → SQL Editor: run scripts/ensure-portal-section-visibility.sql or npx supabase db push. Also run migration 20250340000000_customer_portal_access_rest_writes.sql if saves return "no row updated".';

    const visibilityMerged = selectedQuoteIdForVisibility
      ? mergeVisibilityForQuote(selectedQuoteIdForVisibility, { show_section_prices: next })
      : null;
    const payload: Record<string, unknown> = selectedQuoteIdForVisibility
      ? {
          visibility_by_quote: visibilityMerged,
          show_section_prices: sectionPricesJsonForRpc(link.show_section_prices as Record<string, boolean> | null),
        }
      : { show_section_prices: next };

    try {
      let { error: resultError } = await updateCustomerPortalAccessRowMinimal(link.id, payload);

      if (resultError && isColumnError(resultError)) {
        setPortalLinks((prev) =>
          prev.map((l) =>
            l.id === link.id
              ? { ...l, show_section_prices: next, visibility_by_quote: (visibilityMerged as any) ?? l.visibility_by_quote }
              : l
          )
        );
        toast.warning(`Could not save to database. ${PORTAL_COLUMNS_HELP}`, { duration: 14000 });
        return;
      }
      if (resultError && String((resultError as { code?: string }).code) === '23502') {
        const r2 = await updateCustomerPortalAccessRowMinimal(link.id, {
          show_section_prices: sectionPricesJsonForRpc(next, link.show_section_prices as Record<string, boolean> | null),
          visibility_by_quote: (visibilityMerged ?? link.visibility_by_quote ?? {}) as Record<string, unknown>,
        });
        resultError = r2.error;
      }
      if (resultError) {
        toast.error(portalSaveErrorMessage(resultError), { duration: 10000 });
        setShowSectionPrices((prev) => ({ ...prev, [sectionId]: !show }));
        return;
      }
      setPortalLinks((prev) =>
        prev.map((l) =>
          l.id === link.id
            ? { ...l, show_section_prices: next, visibility_by_quote: (visibilityMerged as any) ?? l.visibility_by_quote }
            : l
        )
      );
      toast.success('Section price visibility saved.');
    } catch (err: any) {
      console.error('Failed to save section price visibility:', err);
      const msg = err?.message || '';
      if (/RLS|42501|permission|denied|PORTAL_UPDATE|no row updated/i.test(msg)) {
        toast.error(`Save blocked or update did not apply. Run migration 20250340000000_customer_portal_access_rest_writes.sql or scripts/fix-customer-portal-access-rls.sql.`, { duration: 10000 });
      } else if (/column|PGRST204|schema|42703/i.test(msg)) {
        toast.error(`Database needs portal columns. ${PORTAL_COLUMNS_HELP}`, { duration: 14000 });
      } else {
        toast.error(`Could not save section prices. ${PORTAL_COLUMNS_HELP}`, { duration: 14000 });
      }
      setShowSectionPrices((prev) => ({ ...prev, [sectionId]: !show }));
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
        show_section_prices: Object.keys(showSectionPrices).length ? showSectionPrices : undefined,
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

      const changeOrderQuoteRow = jobQuotes.find((q: any) => q.is_change_order_proposal) ?? null;
      let changeOrderProposalData: any = null;
      if (changeOrderQuoteRow?.id) {
        changeOrderProposalData = await loadProposalDataForQuote(j.id, changeOrderQuoteRow.id, !!changeOrderQuoteRow.tax_exempt);
      }

      const totalPaid = (paymentsData || []).reduce((sum, p) => sum + parseFloat(p.amount || '0'), 0);
      const estimatedPrice = proposalData.totals.grandTotal;
      const remainingBalance = estimatedPrice - totalPaid;

      const jobWithData = {
        ...j,
        quote: quoteData,
        jobQuotes,
        proposalDataByQuoteId,
        changeOrderQuote: changeOrderQuoteRow,
        changeOrderProposalData,
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
    totals: { subtotal: number; tax: number; grandTotal: number; materials?: number; labor?: number };
  }> {
    const TAX_RATE = 0.07;
    const empty = { materialSheets: [], customRows: [], subcontractorEstimates: [], totals: { subtotal: 0, tax: 0, grandTotal: 0, materials: 0, labor: 0 } };
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

      // Helper: row materials + labor including linked subs (match CustomerPortal so preview matches link)
      const rowTotalsWithLinkedSubs = (row: any, subs: any[]) => {
        const lineItems: any[] = row.custom_financial_row_items || [];
        const rowMarkup = 1 + (Number(row.markup_percent) || 0) / 100;
        let rowMat = 0, rowLab = 0, rowMatTaxable = 0;
        if (lineItems.length > 0) {
          const matItems = lineItems.filter((li: any) => (li.item_type || 'material') === 'material');
          const labItems = lineItems.filter((li: any) => (li.item_type || 'material') === 'labor');
          rowMat = matItems.reduce((s: number, i: any) => s + (Number(i.total_cost) || 0), 0);
          rowMatTaxable = matItems.filter((i: any) => i.taxable).reduce((s: number, i: any) => s + (Number(i.total_cost) || 0), 0);
          rowLab = labItems.reduce((s: number, i: any) => s + (Number(i.total_cost) || 0) * (1 + ((i.markup_percent ?? 0) / 100)), 0);
        } else {
          rowMat = row.category === 'labor' ? 0 : (Number(row.total_cost) || 0);
          rowMatTaxable = row.taxable ? rowMat : 0;
          rowLab = row.category === 'labor' ? (Number(row.total_cost) || 0) : 0;
        }
        const linkedSubs = subs.filter((e: any) => e.row_id === row.id);
        linkedSubs.forEach((sub: any) => {
          const items = sub.subcontractor_estimate_line_items || [];
          const m = 1 + (Number(sub.markup_percent) || 0) / 100;
          rowMat += items.filter((i: any) => !i.excluded && (i.item_type || 'material') === 'material').reduce((s: number, i: any) => s + (Number(i.total_price) || 0), 0) * m;
          rowMatTaxable += items.filter((i: any) => !i.excluded && (i.item_type || 'material') === 'material' && i.taxable).reduce((s: number, i: any) => s + (Number(i.total_price) || 0), 0) * m;
          rowLab += items.filter((i: any) => !i.excluded && (i.item_type || 'material') === 'labor').reduce((s: number, i: any) => s + (Number(i.total_price) || 0), 0) * m;
        });
        return { materials: rowMat * rowMarkup, labor: rowLab * rowMarkup, materialsTaxable: rowMatTaxable * rowMarkup };
      };

      let totalMaterials = 0;
      let totalLabor = 0;
      const isSheetOptional = (s: any) => s.is_option === true || s.is_option === 'true' || s.is_option === 1;

      // Per-sheet _computedTotal, _computedMaterials, _computedLabor (match CustomerPortal so office preview matches link)
      (materialSheets || []).forEach((sheet: any) => {
        const isOptional = isSheetOptional(sheet);
        const isChangeOrder = sheet.sheet_type === 'change_order';
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
        let sheetLinkedMaterials = 0;
        (sheet.sheetLinkedItems || []).forEach((item: any) => {
          const itemTotal = (Number(item.total_cost) || 0) * (1 + ((item.markup_percent ?? 0) / 100));
          if ((item.item_type || 'material') === 'labor') sheetLinkedLabor += itemTotal;
          else sheetLinkedMaterials += itemTotal;
        });
        let linkedRowsMat = 0, linkedRowsLab = 0;
        (customRowsData || []).filter((r: any) => r.sheet_id === sheet.id).forEach((row: any) => {
          const t = rowTotalsWithLinkedSubs(row, subEstimatesData || []);
          linkedRowsMat += t.materials;
          linkedRowsLab += t.labor;
        });
        let linkedSubsMat = 0, linkedSubsLab = 0;
        (subEstimatesData || []).filter((e: any) => e.sheet_id === sheet.id && !e.row_id).forEach((est: any) => {
          const items = est.subcontractor_estimate_line_items || [];
          const m = 1 + (Number(est.markup_percent) || 0) / 100;
          linkedSubsMat += items.filter((i: any) => !i.excluded && (i.item_type || 'material') === 'material').reduce((s: number, i: any) => s + (Number(i.total_price) || 0), 0) * m;
          linkedSubsLab += items.filter((i: any) => !i.excluded && (i.item_type || 'material') === 'labor').reduce((s: number, i: any) => s + (Number(i.total_price) || 0), 0) * m;
        });
        const sheetMaterialsPart = sheetCatPrice + sheetLinkedMaterials + linkedRowsMat + linkedSubsMat;
        const sheetLaborPart = sheetDirectLabor + sheetLinkedLabor + linkedRowsLab + linkedSubsLab;
        const sheetTotal = sheetMaterialsPart + sheetLaborPart;
        (sheet as any)._computedTotal = sheetTotal;
        (sheet as any)._computedMaterials = sheetMaterialsPart;
        (sheet as any)._computedLabor = sheetLaborPart;
        if (!isChangeOrder && !isOptional) {
          totalMaterials += sheetCatPrice + linkedRowsMat + linkedSubsMat;
          totalLabor += sheetDirectLabor + sheetLinkedLabor + linkedRowsLab + linkedSubsLab;
        }
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
        if (!row.sheet_id) {
          const t = rowTotalsWithLinkedSubs(row, subEstimatesData || []);
          totalMaterials += t.materials;
          totalLabor += t.labor;
        }
      });

      (subEstimatesData || []).forEach((est: any) => {
        const lineItems: any[] = est.subcontractor_estimate_line_items || [];
        const markup = 1 + (Number(est.markup_percent) || 0) / 100;
        const matItems = lineItems.filter((li: any) => !li.excluded && (li.item_type || 'material') === 'material');
        const labItems = lineItems.filter((li: any) => !li.excluded && (li.item_type || 'material') === 'labor');
        const matTotal = matItems.reduce((s: number, i: any) => s + (Number(i.total_price) || 0), 0) * markup;
        const labTotal = labItems.reduce((s: number, i: any) => s + (Number(i.total_price) || 0), 0) * markup;
        (est as any)._computedTotal = matTotal + labTotal;
        if (!est.sheet_id && !est.row_id) {
          totalMaterials += matTotal;
          totalLabor += labTotal;
        }
      });

      const subtotal = totals.subtotal;
      const tax = totals.tax;
      const grandTotal = totals.grandTotal;
      const finalTotals = storedTotals
        ? { ...storedTotals, materials: (storedTotals as any).materials ?? totalMaterials, labor: (storedTotals as any).labor ?? totalLabor }
        : { subtotal, tax, grandTotal, materials: totalMaterials, labor: totalLabor };

      return { materialSheets, customRows: customRowsData, subcontractorEstimates: subEstimatesData, totals: finalTotals };
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
    const raw = link.show_section_prices;
    setShowSectionPrices(typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Record<string, boolean>) : {});
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
    show_section_prices: Object.keys(showSectionPrices).length ? showSectionPrices : undefined,
    custom_message: customMessage,
  };

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
          {jobQuotes.length > 1 && (
            <div className="mb-3">
              <Label className="text-xs text-muted-foreground">Visibility for proposal</Label>
              <Select value={selectedQuoteIdForVisibility ?? ''} onValueChange={(v) => setSelectedQuoteIdForVisibility(v || null)}>
                <SelectTrigger className="mt-1 h-9">
                  <SelectValue placeholder="Select proposal" />
                </SelectTrigger>
                <SelectContent>
                  {jobQuotes.map((q: any) => (
                    <SelectItem key={q.id} value={q.id}>
                      Proposal #{q.proposal_number || q.quote_number || q.id.slice(0, 8)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">Each proposal can have different sections and prices visible.</p>
            </div>
          )}
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
              <span className="text-sm">Section prices</span>
              <Switch checked={showLineItemPrices} onCheckedChange={(v) => { setShowLineItemPrices(v); autoSaveVisibility('show_line_item_prices', v); }} />
            </div>
            <p className="text-xs text-muted-foreground -mt-1">Customers see each section with a total (Materials/Labor or one amount). Individual line items are not listed.</p>
            {showLineItemPrices && (
              <div className="border-t pt-3 mt-2 space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Show price per section</p>
                {sectionListLoading ? (
                  <p className="text-xs text-muted-foreground">Loading sections…</p>
                ) : sectionList.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No sections for this job.</p>
                ) : (
                  <div className="space-y-1.5 max-h-[200px] overflow-y-auto pr-1">
                    {sectionList.map((sec) => {
                      const show = showSectionPrices[sec.id] !== false;
                      return (
                        <div key={sec.id} className="flex items-center justify-between gap-2">
                          <span className="text-xs truncate flex-1 min-w-0" title={sec.name}>{sec.name}</span>
                          <Switch checked={show} onCheckedChange={(v) => saveSectionPriceVisibility(sec.id, v)} />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
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
                initialQuoteId={selectedQuoteIdForVisibility ?? undefined}
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
                  <Label className="font-medium">Show section prices</Label>
                  <p className="text-sm text-muted-foreground">When on, show a price per section (Materials/Labor or section total). Individual line items are not shown. When off, only subtotal/tax/grand total appear (if final price is on).</p>
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
