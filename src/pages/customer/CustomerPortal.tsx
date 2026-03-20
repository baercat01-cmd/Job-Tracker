import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { 
  FileText, 
  DollarSign, 
  Calendar, 
  Image, 
  Download, 
  ExternalLink,
  CheckCircle,
  Clock,
  MapPin,
  Phone,
  Mail,
  FileSpreadsheet,
  ChevronRight,
  Briefcase,
  Send,
  MessageSquare,
  Inbox,
  Copy,
  LayoutDashboard,
  Printer,
  PenLine,
  ClipboardList
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { isFieldRequestSheetName } from '@/lib/materialWorkbook';
import { loadViewerLinksForJob } from '@/lib/viewer-links';
import { toast } from 'sonner';
import { PWAInstallButton } from '@/components/ui/pwa-install-button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { generateProposalHTML, generateChangeOrderDocumentHTML } from '@/components/office/ProposalPDFTemplate';
import { computeProposalTotals } from '@/lib/proposalTotals';
import { MartinBuilderContractSeal } from '@/components/customer/MartinBuilderContractSeal';

interface Job {
  id: string;
  name: string;
  client_name: string;
  address: string;
  customer_phone?: string;
  description: string | null;
  notes: string | null;
  status: string;
  projected_start_date: string | null;
  projected_end_date: string | null;
  created_at: string;
}

interface JobSummary {
  job: Job;
  totalAmount: number;
  totalPaid: number;
  balance: number;
  photoCount: number;
  documentCount: number;
  scheduleEventCount: number;
}

// Full select; fallback used when show_line_item_prices column is missing (PGRST204 / migration not run)
const CUSTOMER_PORTAL_ACCESS_SELECT =
  'id,job_id,customer_identifier,access_token,customer_name,customer_email,customer_phone,is_active,expires_at,last_accessed_at,created_by,created_at,updated_at,show_proposal,show_payments,show_schedule,show_documents,show_photos,show_financial_summary,show_line_item_prices,show_section_prices,visibility_by_quote,custom_message';
const CUSTOMER_PORTAL_ACCESS_SELECT_FALLBACK =
  'id,job_id,customer_identifier,access_token,customer_name,customer_email,customer_phone,is_active,expires_at,last_accessed_at,created_by,created_at,updated_at,show_proposal,show_payments,show_schedule,show_documents,show_photos,show_financial_summary,custom_message';

export const CUSTOMER_PORTAL_TOKEN_KEY = 'customer_portal_token';

export default function CustomerPortal() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');
  
  const [loading, setLoading] = useState(true);
  const [validToken, setValidToken] = useState(false);
  const [customerInfo, setCustomerInfo] = useState<any>(null);
  const [jobData, setJobData] = useState<any>(null);
  /** Why access was denied, so we can show a clearer message */
  const [accessDeniedReason, setAccessDeniedReason] = useState<'no_token' | 'expired' | 'invalid' | 'network' | null>(null);
  /** Survives job data refresh so "Sign & use as contract" stays hidden after successful sign */
  const [portalSignPendingByQuote, setPortalSignPendingByQuote] = useState<Record<string, { name: string }>>({});
  const onPortalSignRecorded = useCallback((quoteId: string, name: string) => {
    setPortalSignPendingByQuote((p) => ({ ...p, [quoteId]: { name } }));
  }, []);
  const onPortalSignClearForQuote = useCallback((quoteId: string) => {
    setPortalSignPendingByQuote((p) => {
      const n = { ...p };
      delete n[quoteId];
      return n;
    });
  }, []);

  // Refetch portal visibility (payments, schedule, documents, etc.) so customer sees latest office toggles
  async function refetchPortalVisibility(accessToken: string) {
    if (!accessToken?.trim()) return;
    try {
      const { data: rpcRow, error: rpcError } = await supabase.rpc('get_customer_portal_access_by_token', {
        p_access_token: accessToken.trim(),
      });
      if (!rpcError && rpcRow != null) {
        let row: any = rpcRow;
        if (typeof row === 'string') {
          try { row = JSON.parse(row); } catch { row = null; }
        }
        if (Array.isArray(row) && row.length > 0) row = row[0];
        const fresh = row && typeof row === 'object' ? (row as Record<string, unknown>) : null;
        if (fresh) setCustomerInfo((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            show_proposal: fresh.show_proposal ?? prev.show_proposal,
            show_payments: fresh.show_payments ?? prev.show_payments,
            show_schedule: fresh.show_schedule ?? prev.show_schedule,
            show_documents: fresh.show_documents ?? prev.show_documents,
            show_photos: fresh.show_photos ?? prev.show_photos,
            show_financial_summary: fresh.show_financial_summary ?? prev.show_financial_summary,
            show_line_item_prices: fresh.show_line_item_prices ?? prev.show_line_item_prices,
            show_section_prices: fresh.show_section_prices ?? prev.show_section_prices,
            visibility_by_quote: fresh.visibility_by_quote ?? prev.visibility_by_quote,
          };
        });
      }
    } catch {
      // Non-fatal; keep existing customerInfo
    }
  }

  /** Refresh quotes (includes customer_signed_at) — anon RLS often hides signature fields on direct SELECT */
  async function refetchPortalQuotes(accessToken: string, jobId: string) {
    if (!accessToken?.trim() || !jobId) return;
    try {
      const { data, error } = await supabase.rpc('get_quotes_for_customer_portal', {
        p_access_token: accessToken.trim(),
        p_job_id: jobId,
      });
      if (error || data == null) return;
      let arr: any = data;
      if (typeof arr === 'string') {
        try {
          arr = JSON.parse(arr);
        } catch {
          return;
        }
      }
      if (!Array.isArray(arr) || arr.length === 0) return;
      setJobData((prev) => {
        if (!prev?.job || prev.job.id !== jobId) return prev;
        return { ...prev, jobQuotes: arr, quote: arr[0] ?? prev.quote };
      });
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    if (token) {
      setAccessDeniedReason(null);
      validateAndLoadData();
    } else {
      setAccessDeniedReason('no_token');
      setLoading(false);
      toast.error('No access token provided');
    }
  }, [token]);

  // Refetch visibility when user returns to tab or periodically, so office toggles (payments/schedule/documents off) apply
  useEffect(() => {
    if (!validToken || !customerInfo) return;
    const t =
      typeof searchParams.get('token') === 'string' && searchParams.get('token')
        ? searchParams.get('token')
        : (typeof localStorage !== 'undefined' ? localStorage.getItem(CUSTOMER_PORTAL_TOKEN_KEY) : null);
    if (!t) return;

    const jobId = customerInfo.job_id as string;
    const onVisibility = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        refetchPortalVisibility(t);
        if (jobId) refetchPortalQuotes(t, jobId);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    const interval = setInterval(() => {
      refetchPortalVisibility(t);
      if (jobId) refetchPortalQuotes(t, jobId);
    }, 90_000);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      clearInterval(interval);
    };
  }, [validToken, customerInfo?.id]);

  async function validateAndLoadData() {
    if (!token) return;

    try {
      // Prefer RPC so we always get full visibility settings regardless of RLS (customer portal reflects office settings)
      let accessData: any = null;
      const { data: rpcRow, error: rpcError } = await supabase.rpc('get_customer_portal_access_by_token', { p_access_token: token });
      if (!rpcError && rpcRow != null) {
        // Normalize: RPC can return single jsonb object, or array of one row, or stringified JSON
        let row: any = rpcRow;
        if (typeof row === 'string') {
          try { row = JSON.parse(row); } catch { row = null; }
        }
        if (Array.isArray(row) && row.length > 0) row = row[0];
        if (row && typeof row === 'object' && (row.job_id != null || row.id != null)) {
          accessData = { ...row, show_line_item_prices: row.show_line_item_prices ?? false };
        }
      }
      if (!accessData) {
        let select = CUSTOMER_PORTAL_ACCESS_SELECT;
        let { data, error: accessError } = await supabase
          .from('customer_portal_access')
          .select(select)
          .eq('access_token', token)
          .eq('is_active', true)
          .maybeSingle();

        if (accessError && (accessError?.code === 'PGRST204' || (accessError?.message && /show_line_item_prices|show_section_prices|column.*exist/i.test(accessError.message)))) {
          select = CUSTOMER_PORTAL_ACCESS_SELECT_FALLBACK;
          const fallback = await supabase
            .from('customer_portal_access')
            .select(select)
            .eq('access_token', token)
            .eq('is_active', true)
            .maybeSingle();
          accessData = fallback.data;
          accessError = fallback.error;
        }
        if (accessError || !accessData) {
          setAccessDeniedReason(accessError && /connection|refused|fetch|network/i.test(String(accessError.message)) ? 'network' : 'invalid');
          toast.error('Invalid or expired access link');
          setLoading(false);
          return;
        }
        accessData = { ...accessData, show_line_item_prices: accessData.show_line_item_prices ?? false };
      }

      // Check expiration
      if (accessData.expires_at && new Date(accessData.expires_at) < new Date()) {
        setAccessDeniedReason('expired');
        toast.error('This access link has expired');
        setLoading(false);
        return;
      }

      setValidToken(true);
      setCustomerInfo(accessData);
      try {
        localStorage.setItem(CUSTOMER_PORTAL_TOKEN_KEY, token);
      } catch { /* ignore */ }

      // Update last accessed time
      await supabase
        .from('customer_portal_access')
        .update({ last_accessed_at: new Date().toISOString() })
        .eq('id', accessData.id);

      // Load data for the customer (use job from link when set, else find by customer)
      await loadCustomerData(accessData, token);
    } catch (error: any) {
      console.error('Error validating token:', error);
      setAccessDeniedReason(/connection|refused|fetch|network/i.test(String(error?.message)) ? 'network' : 'invalid');
      toast.error('Failed to load portal data');
      setLoading(false);
    }
  }

  async function loadCustomerData(accessData: any, portalToken?: string | null) {
    try {
      // Always use job_id from the portal link row so we show the correct job (never guess by customer name)
      if (!accessData.job_id) {
        toast.error('This link is not associated with a project. Please use the link from your project manager.');
        setLoading(false);
        return;
      }
      const { data: jobRow, error: jobError } = await supabase
        .from('jobs')
        .select('*')
        .eq('id', accessData.job_id)
        .maybeSingle();
      if (jobError || !jobRow) {
        toast.error('Project not found or access was revoked.');
        setLoading(false);
        return;
      }
      const job = jobRow;

      const portalTok =
        (portalToken && String(portalToken).trim()) ||
        (typeof localStorage !== 'undefined' ? localStorage.getItem(CUSTOMER_PORTAL_TOKEN_KEY) : null);

      // Load quotes: prefer RPC so customer_signed_at / status are visible to anon portal users
      let jobQuotes: any[] = [];
      if (portalTok?.trim()) {
        const { data: rpcQuotes, error: rpcQuotesErr } = await supabase.rpc('get_quotes_for_customer_portal', {
          p_access_token: portalTok.trim(),
          p_job_id: job.id,
        });
        if (!rpcQuotesErr && rpcQuotes != null) {
          let arr: any = rpcQuotes;
          if (typeof arr === 'string') {
            try {
              arr = JSON.parse(arr);
            } catch {
              arr = null;
            }
          }
          if (Array.isArray(arr) && arr.length > 0) jobQuotes = arr;
        }
      }
      if (jobQuotes.length === 0) {
        const { data: quotesData } = await supabase
          .from('quotes')
          .select('*')
          .eq('job_id', job.id)
          .order('created_at', { ascending: false });
        jobQuotes = quotesData || [];
      }
      const quoteData = jobQuotes[0] ?? null;

      // Load payments
      const { data: paymentsData } = await supabase
        .from('customer_payments')
        .select('*')
        .eq('job_id', job.id)
        .order('payment_date', { ascending: false });

      // Load documents marked visible to customer portal (use RPC when token present so anon can see them despite RLS)
      let documentsData: any[] = [];
      const t = portalTok;
      if (t?.trim()) {
        const { data: rpcDocs, error: rpcErr } = await supabase.rpc('get_job_documents_for_customer_portal', {
          p_access_token: t.trim(),
          p_job_id: job.id,
        });
        if (!rpcErr && Array.isArray(rpcDocs)) documentsData = rpcDocs;
      }
      if (documentsData.length === 0 && !t?.trim()) {
        const { data: directDocs } = await supabase
          .from('job_documents')
          .select(`*, job_document_revisions(*)`)
          .eq('job_id', job.id)
          .eq('visible_to_customer_portal', true);
        documentsData = directDocs ?? [];
      }

      // Load photos
      const { data: photosData } = await supabase
        .from('photos')
        .select('*')
        .eq('job_id', job.id)
        .order('created_at', { ascending: false })
        .limit(100);

      // Load schedule events
      const { data: scheduleData } = await supabase
        .from('calendar_events')
        .select('*')
        .eq('job_id', job.id)
        .order('event_date', { ascending: true });

      // Load emails for this job (use RPC when token present so anon can see messages despite RLS)
      let emailsData: any[] | null = null;
      if (t?.trim()) {
        const { data: rpcEmails, error: rpcErr } = await supabase.rpc('get_job_emails_for_customer_portal', {
          p_access_token: t.trim(),
          p_job_id: job.id,
        });
        if (!rpcErr && rpcEmails != null) {
          if (Array.isArray(rpcEmails)) emailsData = rpcEmails;
          else if (typeof rpcEmails === 'object' && !Array.isArray(rpcEmails)) emailsData = [rpcEmails];
          else if (typeof rpcEmails === 'string') {
            try { const parsed = JSON.parse(rpcEmails); emailsData = Array.isArray(parsed) ? parsed : [parsed]; } catch { emailsData = []; }
          }
        }
      }
      if (emailsData == null) {
        const { data: directEmails } = await supabase
          .from('job_emails')
          .select('*')
          .eq('job_id', job.id)
          .order('email_date', { ascending: false })
          .limit(100);
        emailsData = directEmails ?? [];
      }

      // Proposal data is loaded per-quote in JobDetailView when customer selects a proposal
      const viewerLinks = await loadViewerLinksForJob(supabase, job.id);
      const totalPaid = (paymentsData || []).reduce((sum, p) => sum + parseFloat(p.amount.toString()), 0);

      // Ensure tax_exempt is available on quotes (in case PostgREST schema cache doesn't expose it)
      let quotesWithTax = jobQuotes;
      if (jobQuotes.length > 0 && jobQuotes.some((q: any) => q.tax_exempt === undefined)) {
        const { data: taxRows } = await supabase.rpc('get_job_quotes_tax_exempt', { p_job_id: job.id });
        const taxByQuote = new Map((taxRows || []).map((r: any) => [r.quote_id, r.tax_exempt]));
        quotesWithTax = jobQuotes.map((q: any) => ({ ...q, tax_exempt: taxByQuote.get(q.id) ?? false }));
      }

      setJobData({
        job,
        quote: quoteData,
        jobQuotes: quotesWithTax,
        payments: paymentsData || [],
        documents: documentsData || [],
        photos: photosData || [],
        scheduleEvents: scheduleData || [],
        emails: emailsData || [],
        viewerLinks,
        totalPaid,
      });

      setLoading(false);
    } catch (error: any) {
      console.error('Error loading customer data:', error);
      toast.error('Failed to load your project');
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-lg text-slate-600">Loading your project portal...</p>
        </div>
      </div>
    );
  }

  if (!validToken || !customerInfo) {
    const reason = accessDeniedReason;
    const title = reason === 'no_token' ? 'No portal link' : 'Access denied';
    const message =
      reason === 'no_token'
        ? 'Open the full link from your project manager (email or message). The link must include the full URL, e.g. …/customer-portal?token=…. Do not bookmark the page without the token.'
        : reason === 'expired'
          ? 'This access link has expired. Please contact your project manager for a new link.'
          : reason === 'network'
            ? 'We couldn\'t reach the server. Check your internet connection and try again. If you use a VPN or corporate network, it may be blocking the connection.'
            : 'The access link is invalid or was deactivated. Use the full link from your project manager, or ask for a new link.';
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="text-center text-2xl text-destructive">{title}</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-muted-foreground">
              {message}
            </p>
            <p className="text-sm text-muted-foreground">
              If you were sent a new link, open it in this browser. If the problem continues, contact your project manager.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!jobData) {
    return null; // Still loading
  }

  // Show job detail view directly (pass searchParams so portal can open with same proposal as office)
  return (
    <JobDetailView
      jobData={jobData}
      customerInfo={customerInfo}
      searchParams={searchParams}
      onRefreshJobData={async () => { if (customerInfo) await loadCustomerData(customerInfo); }}
      portalSignPendingByQuote={portalSignPendingByQuote}
      onPortalSignRecorded={onPortalSignRecorded}
      onPortalSignClearForQuote={onPortalSignClearForQuote}
    />
  );
}

// Job Detail View Component
function JobDetailView({
  jobData,
  customerInfo,
  searchParams,
  onRefreshJobData,
  portalSignPendingByQuote = {},
  onPortalSignRecorded,
  onPortalSignClearForQuote,
}: {
  jobData: any;
  customerInfo: any;
  searchParams?: URLSearchParams;
  onRefreshJobData?: () => Promise<void>;
  portalSignPendingByQuote?: Record<string, { name: string }>;
  onPortalSignRecorded?: (quoteId: string, name: string) => void;
  onPortalSignClearForQuote?: (quoteId: string) => void;
}) {
  const { job, quote, jobQuotes = [], payments, documents, photos, scheduleEvents, emails, viewerLinks = [], totalPaid } = jobData;
  const [activeTab, setActiveTab] = useState('overview');

  /** Main contract proposals only — change order is its own quote and portal tab */
  const proposalQuotes = useMemo(
    () => (jobQuotes as any[]).filter((q: any) => !q.is_change_order_proposal),
    [jobQuotes]
  );
  const changeOrderQuote = useMemo(
    () => (jobQuotes as any[]).find((q: any) => q.is_change_order_proposal) ?? null,
    [jobQuotes]
  );

  // Default: signed/contract proposal first, then most recently sent, then highest proposal number
  const defaultQuoteId = (() => {
    if (!proposalQuotes.length) return quote && !(quote as any).is_change_order_proposal ? quote.id : null;
    const list = proposalQuotes as any[];
    const contractQuotes = list.filter((q: any) => q.status === 'signed' || q.status === 'accepted');
    if (contractQuotes.length > 0) {
      const bySent = [...contractQuotes].sort((a, b) =>
        (new Date(b.sent_at || 0).getTime()) - (new Date(a.sent_at || 0).getTime())
      );
      const byProposal = [...contractQuotes].sort((a, b) => {
        const aN = parseInt((a.proposal_number || a.quote_number || '0').toString().split('-').pop() || '0', 10);
        const bN = parseInt((b.proposal_number || b.quote_number || '0').toString().split('-').pop() || '0', 10);
        return bN - aN;
      });
      return (bySent[0]?.sent_at ? bySent[0] : byProposal[0])?.id ?? contractQuotes[0].id;
    }
    const sentQuotes = list.filter((q: any) => q.sent_at);
    if (sentQuotes.length > 0) {
      const sorted = [...sentQuotes].sort((a: any, b: any) =>
        new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime()
      );
      return sorted[0].id;
    }
    const sorted = [...list].sort((a: any, b: any) => {
      const aN = parseInt((a.proposal_number || a.quote_number || '0').toString().split('-').pop() || '0', 10);
      const bN = parseInt((b.proposal_number || b.quote_number || '0').toString().split('-').pop() || '0', 10);
      return bN - aN;
    });
    return sorted[0]?.id ?? proposalQuotes[0]?.id ?? null;
  })();

  // If URL has ?quote=uuid and it's a main proposal for this job, use it (never the change-order quote here)
  const quoteIdFromUrl = searchParams?.get('quote') ?? null;
  const coQuoteIdFromUrl = searchParams?.get('change_order') === '1';
  const initialQuoteId =
    quoteIdFromUrl && proposalQuotes.some((q: any) => q.id === quoteIdFromUrl)
      ? quoteIdFromUrl
      : defaultQuoteId;

  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(initialQuoteId);
  const selectedQuote =
    proposalQuotes.find((q: any) => q.id === selectedQuoteId) ?? proposalQuotes[0] ?? null;

  useEffect(() => {
    if (searchParams?.get('change_order') === '1' && changeOrderQuote) {
      setActiveTab('change-orders');
    }
  }, [searchParams, changeOrderQuote?.id]);

  useEffect(() => {
    if (!selectedQuoteId || !proposalQuotes.some((q: any) => q.id === selectedQuoteId)) {
      const fallback = defaultQuoteId ?? proposalQuotes[0]?.id ?? null;
      if (fallback && fallback !== selectedQuoteId) setSelectedQuoteId(fallback);
    }
  }, [proposalQuotes, selectedQuoteId]);
  const [proposalData, setProposalData] = useState<any>(null);
  const [proposalDataLoading, setProposalDataLoading] = useState(false);
  const proposalDataCacheRef = useRef<Record<string, any>>({});
  /** Totals from get_quote_proposal_totals RPC (written by JobFinancials) so Overview matches office exactly */
  const [quoteStoredTotals, setQuoteStoredTotals] = useState<{ subtotal: number; tax: number; grandTotal: number } | null>(null);
  // Visibility: use per-proposal overrides when customer is viewing a specific quote, else top-level
  const perQuoteVis = selectedQuoteId && customerInfo?.visibility_by_quote && typeof customerInfo.visibility_by_quote === 'object' && !Array.isArray(customerInfo.visibility_by_quote)
    ? (customerInfo.visibility_by_quote as Record<string, any>)[selectedQuoteId]
    : null;
  const vis = (perQuoteVis && typeof perQuoteVis === 'object') ? perQuoteVis : customerInfo;
  const showFinancial = vis?.show_financial_summary === true;
  const showLineItemPrices = vis?.show_line_item_prices === true;
  const showSectionPrices: Record<string, boolean> | null = (typeof vis?.show_section_prices === 'object' && vis?.show_section_prices !== null && !Array.isArray(vis?.show_section_prices)) ? vis.show_section_prices : null;
  const showPriceForSection = (sectionId: string) => showFinancial && showLineItemPrices && (showSectionPrices == null || showSectionPrices[sectionId] !== false);
  const showProposal = vis?.show_proposal === true;
  const showPayments = vis?.show_payments === true;
  const showSchedule = vis?.show_schedule === true;
  const showDocuments = vis?.show_documents === true;
  const showPhotos = vis?.show_photos === true;
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [emailBody, setEmailBody] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailSentInDialog, setEmailSentInDialog] = useState(false);
  const [signerName, setSignerName] = useState('');
  const [signerEmail, setSignerEmail] = useState('');
  const [agreeToTerms, setAgreeToTerms] = useState(false);
  const [signing, setSigning] = useState(false);

  const changeOrderQuoteId = changeOrderQuote?.id ?? null;
  const [changeOrderProposalData, setChangeOrderProposalData] = useState<any>(null);
  const [changeOrderDataLoading, setChangeOrderDataLoading] = useState(false);
  const [coQuoteStoredTotals, setCoQuoteStoredTotals] = useState<{
    subtotal: number;
    tax: number;
    grandTotal: number;
  } | null>(null);
  const [coSignerName, setCoSignerName] = useState('');
  const [coSignerEmail, setCoSignerEmail] = useState('');
  const [coAgreeBySheet, setCoAgreeBySheet] = useState<Record<string, boolean>>({});
  const [coSigningSheetId, setCoSigningSheetId] = useState<string | null>(null);

  const coQuoteVis =
    changeOrderQuoteId && customerInfo?.visibility_by_quote && typeof customerInfo.visibility_by_quote === 'object' && !Array.isArray(customerInfo.visibility_by_quote)
      ? (customerInfo.visibility_by_quote as Record<string, any>)[changeOrderQuoteId]
      : null;
  const coVis = coQuoteVis && typeof coQuoteVis === 'object' ? coQuoteVis : customerInfo;
  const showFinancialCo = coVis?.show_financial_summary === true;
  const showLineItemPricesCo = coVis?.show_line_item_prices === true;
  const showSectionPricesCo: Record<string, boolean> | null =
    typeof coVis?.show_section_prices === 'object' && coVis?.show_section_prices !== null && !Array.isArray(coVis?.show_section_prices)
      ? coVis.show_section_prices
      : null;
  const showPriceForCoSection = (sectionId: string) =>
    showFinancialCo && showLineItemPricesCo && (showSectionPricesCo == null || showSectionPricesCo[sectionId] !== false);

  useEffect(() => {
    if (!job?.id || !changeOrderQuoteId) {
      setChangeOrderProposalData(null);
      setChangeOrderDataLoading(false);
      return;
    }
    let cancelled = false;
    setChangeOrderDataLoading(true);
    loadProposalDataForQuote(job.id, changeOrderQuoteId, !!(changeOrderQuote as any)?.tax_exempt, {
      forChangeOrderDocument: true,
    }).then((data) => {
      if (cancelled) return;
      setChangeOrderProposalData(data);
      setChangeOrderDataLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [job?.id, changeOrderQuoteId, (changeOrderQuote as any)?.tax_exempt]);

  useEffect(() => {
    if (!changeOrderQuoteId) {
      setCoQuoteStoredTotals(null);
      return;
    }
    let cancelled = false;
    supabase.rpc('get_quote_proposal_totals', { p_quote_id: changeOrderQuoteId }).then(({ data, error }) => {
      if (cancelled) return;
      if (error || !data || !Array.isArray(data) || data.length === 0) {
        setCoQuoteStoredTotals(null);
        return;
      }
      const row = data[0] as { subtotal?: number | null; tax?: number | null; grand_total?: number | null };
      const sub = row?.subtotal != null ? Number(row.subtotal) : NaN;
      const tax = row?.tax != null ? Number(row.tax) : 0;
      const grand = row?.grand_total != null ? Number(row.grand_total) : NaN;
      if (Number.isFinite(sub) && Number.isFinite(grand)) {
        setCoQuoteStoredTotals({ subtotal: sub, tax: Number.isFinite(tax) ? tax : 0, grandTotal: grand });
      } else {
        setCoQuoteStoredTotals(null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [changeOrderQuoteId]);

  useEffect(() => {
    if (customerInfo && changeOrderQuote && !(changeOrderQuote as any).customer_signed_at) {
      setCoSignerName(customerInfo.customer_name ?? '');
      setCoSignerEmail(customerInfo.customer_email ?? '');
    }
  }, [customerInfo?.customer_name, customerInfo?.customer_email, changeOrderQuote?.id, (changeOrderQuote as any)?.customer_signed_at]);

  const portalToken =
    searchParams?.get('token') ??
    (typeof localStorage !== 'undefined' ? localStorage.getItem(CUSTOMER_PORTAL_TOKEN_KEY) : null);

  // Prefill signer from portal access when proposal is sent and not yet signed
  useEffect(() => {
    if (customerInfo && !(selectedQuote as any)?.customer_signed_at) {
      setSignerName(customerInfo.customer_name ?? '');
      setSignerEmail(customerInfo.customer_email ?? '');
    }
  }, [customerInfo?.customer_name, customerInfo?.customer_email, selectedQuote?.id]);

  /** Office "Set as Contract" sets signed_version — pre-check agreement so portal matches office contract state */
  useEffect(() => {
    const q = selectedQuote as any;
    if (!q || q.customer_signed_at) return;
    const sv = q.signed_version;
    const n = Number(sv);
    const officeMarkedContract = sv != null && sv !== '' && Number.isFinite(n) && n > 0;
    setAgreeToTerms(officeMarkedContract);
  }, [selectedQuoteId, (selectedQuote as any)?.signed_version, (selectedQuote as any)?.customer_signed_at]);

  const pendingSignForQuote = selectedQuoteId ? portalSignPendingByQuote[selectedQuoteId] : null;
  useEffect(() => {
    if (
      (selectedQuote as any)?.customer_signed_at &&
      selectedQuoteId &&
      pendingSignForQuote &&
      onPortalSignClearForQuote
    ) {
      onPortalSignClearForQuote(selectedQuoteId);
    }
  }, [(selectedQuote as any)?.customer_signed_at, selectedQuoteId, pendingSignForQuote, onPortalSignClearForQuote]);

  async function handleSignProposal(e?: React.MouseEvent) {
    e?.preventDefault();
    if (!portalToken || !selectedQuoteId) {
      toast.error('Session or proposal missing. Please refresh the page and try again.');
      return;
    }
    if (!signerName.trim() || !signerEmail.trim()) {
      toast.error('Please enter your full name and email.');
      return;
    }
    if (!agreeToTerms) {
      toast.error('Please confirm you agree to the terms and authorize the work.');
      return;
    }
    setSigning(true);
    try {
      const { data, error } = await supabase.rpc('customer_sign_proposal', {
        p_access_token: portalToken,
        p_quote_id: selectedQuoteId,
        p_signer_name: signerName.trim(),
        p_signer_email: signerEmail.trim(),
      });
      const result = data as { ok?: boolean; error?: string } | null;
      if (error) {
        console.error('Sign proposal RPC error:', error);
        throw error;
      }
      if (result?.ok) {
        onPortalSignRecorded?.(selectedQuoteId, signerName.trim());
        toast.success('Contract saved. This proposal is now your signed contract. The project team will see it in the job.');
        await onRefreshJobData?.();
      } else {
        const errMsg = result?.error ?? 'Could not sign proposal';
        console.error('Sign proposal RPC returned not ok:', result);
        toast.error(errMsg);
      }
    } catch (e: any) {
      console.error('Sign proposal error:', e);
      const msg = e?.message ?? 'Failed to sign proposal';
      const isRpcMissing = /function.*does not exist|42883|PGRST202/i.test(String(msg));
      toast.error(isRpcMissing
        ? 'Signing is not available yet. Your administrator needs to run the database migration for customer signing.'
        : msg,
        { duration: isRpcMissing ? 8000 : 5000 }
      );
    } finally {
      setSigning(false);
    }
  }

  async function handleSignChangeOrderSheet(sheetId: string, e?: React.MouseEvent) {
    e?.preventDefault();
    if (!portalToken) {
      toast.error('Session missing. Please refresh the page.');
      return;
    }
    if (!coSignerName.trim() || !coSignerEmail.trim()) {
      toast.error('Please enter your full name and email.');
      return;
    }
    if (!coAgreeBySheet[sheetId]) {
      toast.error('Please check the agreement box for this change order.');
      return;
    }
    setCoSigningSheetId(sheetId);
    try {
      const { data, error } = await supabase.rpc('customer_sign_change_order_sheet', {
        p_access_token: portalToken,
        p_sheet_id: sheetId,
        p_signer_name: coSignerName.trim(),
        p_signer_email: coSignerEmail.trim(),
      });
      const result = data as { ok?: boolean; error?: string } | null;
      if (error) throw error;
        if (result?.ok) {
        toast.success('Change order signed. Your contractor will proceed with this item.');
        await onRefreshJobData?.();
      } else {
        const err = result?.error ?? 'Could not sign';
        const missing = /function.*does not exist|42883|PGRST202/i.test(String(err));
        toast.error(
          missing
            ? 'Signing change orders requires a database update. Ask your administrator to run the latest Supabase migration (change_order_seq_and_sheet_signatures).'
            : err,
          { duration: missing ? 9000 : 5000 }
        );
      }
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to sign');
    } finally {
      setCoSigningSheetId(null);
    }
  }

  function openChangeOrderDocument(sheet: any, coLabel: string) {
    if (!job) return;
    const raw = (changeOrderQuote as any)?.change_order_signatures;
    const sigs =
      raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, any>) : {};
    const sig = sigs[sheet.id] as { signed_name?: string; signed_at?: string } | undefined;
    const lineItems: Array<{ description: string; amount?: number; isLabor?: boolean }> = [];
    (sheet.sheetLinkedItems || [])
      .filter((item: any) => !item.hide_from_customer)
      .forEach((item: any) => {
        const isLabor = (item.item_type || 'material') === 'labor';
        const amt =
          (Number(item.total_cost) || 0) * (1 + (Number(item.markup_percent) || 0) / 100);
        lineItems.push({
          description: item.description || 'Line item',
          amount: amt > 0 ? amt : undefined,
          isLabor,
        });
      });
    const sheetMat = sheet._computedMaterials ?? 0;
    const sheetLab = sheet._computedLabor ?? 0;
    const subtotal = sheetMat + sheetLab;
    const taxExempt = !!(changeOrderQuote as any)?.tax_exempt;
    const tax = taxExempt ? 0 : sheetMat * 0.07;
    const grand = subtotal + tax;
    const showPrices = showFinancialCo && showLineItemPricesCo;
    const html = generateChangeOrderDocumentHTML({
      changeOrderNumber: coLabel,
      date: new Date().toLocaleDateString('en-US', { dateStyle: 'long' }),
      job: {
        client_name: job.client_name,
        address: job.address || '',
        name: job.name,
      },
      scopeTitle: sheet.sheet_name || 'Change order',
      scopeDescription: sheet.description || '',
      lineItems,
      materialsTotal: sheetMat,
      laborTotal: sheetLab,
      subtotal,
      tax,
      grandTotal: grand,
      showPrices,
      taxExempt,
      signedName: sig?.signed_name,
      signedAt: sig?.signed_at ? new Date(sig.signed_at).toLocaleDateString('en-US', { dateStyle: 'medium' }) : undefined,
    });
    const blob = new Blob([html], { type: 'text/html; charset=utf-8' });
    const blobUrl = URL.createObjectURL(blob);
    const win = window.open(blobUrl, '_blank');
    if (!win) {
      URL.revokeObjectURL(blobUrl);
      toast.error('Allow popups to view the document.');
      return;
    }
    win.focus();
    toast.info('Use Print or Save as PDF in your browser.');
    setTimeout(() => {
      try {
        if (!win.closed) win.print();
      } catch {
        /* ignore */
      }
      setTimeout(() => URL.revokeObjectURL(blobUrl), 4000);
    }, 400);
  }

  async function sendEmailToJob() {
    if (!emailBody.trim()) {
      toast.error('Please enter a message');
      return;
    }
    if (!portalToken) {
      toast.error('Session expired or missing. Please refresh the page and use your portal link again.');
      return;
    }
    if (!job?.id) {
      toast.error('Project not found. Please refresh the page.');
      return;
    }

    setSendingEmail(true);
    try {
      const fromName = customerInfo?.customer_name || 'Customer';
      const defaultSubject = `Message from ${fromName}`;
      const body = emailBody.trim();

      const { data: rpcData, error: rpcError } = await supabase.rpc('create_job_email_from_customer_portal', {
        p_access_token: portalToken,
        p_job_id: job.id,
        p_subject: defaultSubject,
        p_body_text: body,
      });

      if (rpcError) {
        const msg = rpcError.message || 'Failed to send message';
        const isMissingRpc = /function.*does not exist|42883|PGRST202/i.test(String(msg));
        toast.error(isMissingRpc
          ? 'Sending messages is not set up yet. Your project manager needs to run the database migration for portal messages.'
          : msg,
          { duration: isMissingRpc ? 8000 : 5000 }
        );
        return;
      }

      // RPC succeeded (saved to job_emails; office sees it in Email Communications for this job)
      toast.success('Message sent. The office will see it under this job’s Email Communications (they may need to refresh that tab).');
      setEmailBody('');
      setEmailSentInDialog(true);
      await onRefreshJobData?.();
    } catch (error: any) {
      console.error('Error sending email:', error);
      toast.error(error?.message ?? 'Failed to send message');
    } finally {
      setSendingEmail(false);
    }
  }

  async function loadProposalDataForQuote(
    jobId: string,
    quoteId: string | null,
    taxExempt: boolean,
    opts?: { forChangeOrderDocument?: boolean }
  ) {
    try {
      const { data: coQuoteEarly } = await supabase
        .from('quotes')
        .select('id')
        .eq('job_id', jobId)
        .eq('is_change_order_proposal', true)
        .limit(1)
        .maybeSingle();
      const changeOrderQuoteIdForJob = coQuoteEarly?.id ?? null;
      const forChangeOrderDocument =
        !!opts?.forChangeOrderDocument || (!!quoteId && quoteId === changeOrderQuoteIdForJob);

      // Prefer proposal totals stored on the quote (written by JobFinancials) so portal always matches office
      let storedTotals: { subtotal: number; tax: number; grandTotal: number; materials?: number; labor?: number } | null = null;
      if (quoteId) {
        const { data: quoteRow } = await supabase
          .from('quotes')
          .select('proposal_subtotal, proposal_tax, proposal_grand_total')
          .eq('id', quoteId)
          .maybeSingle();
        const sub = quoteRow?.proposal_subtotal != null ? Number(quoteRow.proposal_subtotal) : NaN;
        const tax = quoteRow?.proposal_tax != null ? Number(quoteRow.proposal_tax) : NaN;
        const grand = quoteRow?.proposal_grand_total != null ? Number(quoteRow.proposal_grand_total) : NaN;
        if (Number.isFinite(sub) && Number.isFinite(grand)) {
          storedTotals = { subtotal: sub, tax: Number.isFinite(tax) ? tax : 0, grandTotal: grand };
        }
      }

      // Workbook selection — mirrors JobFinancials multi-step fallback exactly:
      // 1a. Quote-specific workbook, status='working' (primary — matches JobFinancials default)
      // 1b. Quote-specific workbook, any status (fallback)
      // 2.  Null-quote legacy workbook, status='working'
      // 3.  Scan ALL job workbooks, pick 'working' then newest
      let workbookData: { id: string } | null = null;
      if (quoteId) {
        const { data: wb } = await supabase
          .from('material_workbooks')
          .select('id')
          .eq('job_id', jobId)
          .eq('quote_id', quoteId)
          .eq('status', 'working')
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        workbookData = wb ?? null;
        if (!workbookData) {
          const { data: wb2 } = await supabase
            .from('material_workbooks')
            .select('id')
            .eq('job_id', jobId)
            .eq('quote_id', quoteId)
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          workbookData = wb2 ?? null;
        }
      }
      if (!workbookData) {
        const { data: wb } = await supabase
          .from('material_workbooks')
          .select('id')
          .eq('job_id', jobId)
          .is('quote_id', null)
          .eq('status', 'working')
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        workbookData = wb ?? null;
      }
      if (!workbookData) {
        const { data: allWbs } = await supabase
          .from('material_workbooks')
          .select('id')
          .eq('job_id', jobId)
          .order('status', { ascending: false })
          .order('updated_at', { ascending: false });
        workbookData = (allWbs || [])[0] ?? null;
      }

      let materialSheets: any[] = [];
      if (workbookData) {
        const { data: sheetsData } = await supabase
          .from('material_sheets')
          .select('*')
          .eq('workbook_id', workbookData.id)
          .order('order_index');
        let sheets = sheetsData || [];

        // When we have a quote-specific workbook with sheets, always use it. Do not fall back to
        // another workbook just because material_items count is 0: sections can be description +
        // line items only, and labor-only sheets (e.g. "Stain & Labor for ceiling") have no
        // material_items and must still appear in the customer portal.
        const doFallback = sheets.length === 0;
        if (doFallback) {
          const { data: allWbs } = await supabase
            .from('material_workbooks')
            .select('id')
            .eq('job_id', jobId)
            .order('status', { ascending: false })
            .order('updated_at', { ascending: false });
          for (const wb of allWbs || []) {
            if (wb.id === workbookData.id) continue;
            const { data: altSheets } = await supabase
              .from('material_sheets')
              .select('*')
              .eq('workbook_id', wb.id)
              .order('order_index');
            if ((altSheets || []).length > 0) {
              const altSheetIds = (altSheets || []).map((s: any) => s.id);
              const { count: altCount } = await supabase
                .from('material_items')
                .select('id', { count: 'exact', head: true })
                .in('sheet_id', altSheetIds);
              if ((altCount ?? 0) > 0) {
                sheets = (altSheets || []).filter((s: any) => !isFieldRequestSheetName(s.sheet_name));
                workbookData = wb;
                break;
              }
            }
          }
        }

        const sheetIds = sheets.map((s: any) => s.id);
        for (const sheet of sheets) {
          const [{ data: items }, { data: laborRows }, { data: categoryMarkupRows }] = await Promise.all([
            supabase.from('material_items').select('*').eq('sheet_id', sheet.id).order('order_index'),
            supabase.from('material_sheet_labor').select('*').eq('sheet_id', sheet.id),
            supabase.from('material_category_markups').select('*').eq('sheet_id', sheet.id),
          ]);
          (sheet as any).items = items || [];
          (sheet as any).laborRows = laborRows || [];
          const laborTotal = (laborRows || []).reduce((s: number, l: any) => s + (l.total_labor_cost ?? (l.estimated_hours ?? 0) * (l.hourly_rate ?? 0)), 0);
          (sheet as any).laborTotal = laborTotal;
          const catMarkupMap: Record<string, number> = {};
          (categoryMarkupRows || []).forEach((cm: any) => { catMarkupMap[cm.category_name] = cm.markup_percent ?? 10; });
          (sheet as any).categoryMarkups = catMarkupMap;
        }
        // Fetch sheet-linked custom_financial_row_items (row_id IS NULL) — used for labor line items added to sheets
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
            (sheet as any).sheetLinkedItems = bySheet[sheet.id] || [];
          });
        }
        materialSheets = sheets;
      }

      // Change order proposal workbook (main proposal view only — not when loading the CO document itself)
      let changeOrderSheets: any[] = [];
      const changeOrderQuoteRow = changeOrderQuoteIdForJob ? { id: changeOrderQuoteIdForJob } : null;
      if (changeOrderQuoteRow?.id && !forChangeOrderDocument) {
        const { data: coWb } = await supabase
          .from('material_workbooks')
          .select('id')
          .eq('quote_id', changeOrderQuoteRow.id)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (coWb?.id) {
          const { data: coSheets } = await supabase
            .from('material_sheets')
            .select('*')
            .eq('workbook_id', coWb.id)
            .order('order_index');
          const coSheetsList = (coSheets || []).filter((s: any) => !isFieldRequestSheetName(s.sheet_name));
          for (const sheet of coSheetsList) {
            const [{ data: items }, { data: laborRows }, { data: categoryMarkupRows }] = await Promise.all([
              supabase.from('material_items').select('*').eq('sheet_id', sheet.id).order('order_index'),
              supabase.from('material_sheet_labor').select('*').eq('sheet_id', sheet.id),
              supabase.from('material_category_markups').select('*').eq('sheet_id', sheet.id),
            ]);
            (sheet as any).items = items || [];
            (sheet as any).laborRows = laborRows || [];
            const laborTotal = (laborRows || []).reduce((s: number, l: any) => s + (l.total_labor_cost ?? (l.estimated_hours ?? 0) * (l.hourly_rate ?? 0)), 0);
            (sheet as any).laborTotal = laborTotal;
            const catMarkupMap: Record<string, number> = {};
            (categoryMarkupRows || []).forEach((cm: any) => { catMarkupMap[cm.category_name] = cm.markup_percent ?? 10; });
            (sheet as any).categoryMarkups = catMarkupMap;
          }
          const coSheetIds = coSheetsList.map((s: any) => s.id);
          if (coSheetIds.length > 0) {
            const { data: sheetLineItems } = await supabase
              .from('custom_financial_row_items')
              .select('*')
              .in('sheet_id', coSheetIds)
              .is('row_id', null)
              .order('order_index');
            const bySheet: Record<string, any[]> = {};
            (sheetLineItems || []).forEach((item: any) => {
              const sid = item.sheet_id;
              if (sid) { if (!bySheet[sid]) bySheet[sid] = []; bySheet[sid].push(item); }
            });
            coSheetsList.forEach((sheet: any) => { (sheet as any).sheetLinkedItems = bySheet[sheet.id] || []; });
          }
          coSheetsList.forEach((sheet: any) => {
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
              sheetCatPrice += catItems.reduce((s: number, i: any) => {
                const ext = i.extended_price != null && i.extended_price !== '' ? Number(i.extended_price) : null;
                if (ext != null && ext > 0) return s + ext;
                const qty = Number(i.quantity) || 0;
                const pricePerUnit = Number(i.price_per_unit) || 0;
                if (pricePerUnit > 0) return s + qty * pricePerUnit;
                const cost = i.extended_cost != null ? Number(i.extended_cost) : qty * (Number(i.cost_per_unit) || 0);
                return s + cost * (1 + markup / 100);
              }, 0);
            });
            let sheetLinkedLabor = 0;
            (sheet.sheetLinkedItems || []).forEach((item: any) => {
              if ((item.item_type || 'material') === 'labor')
                sheetLinkedLabor += (Number(item.total_cost) || 0) * (1 + ((item.markup_percent ?? 0) / 100));
            });
            (sheet as any)._computedTotal = sheetCatPrice + (sheet.laborTotal ?? 0) + sheetLinkedLabor;
          });
          changeOrderSheets = coSheetsList;
        }
      }

      // Custom rows: quote-specific + job-level (quote_id null), deduplicated and sorted.
      // Matches JobFinancials exactly: quote rows take priority; job-level rows that share an id are dropped.
      let customRowsData: any[] = [];
      if (quoteId) {
        const [forQuote, forJob] = await Promise.all([
          supabase.from('custom_financial_rows').select('*, custom_financial_row_items(*)').eq('quote_id', quoteId).order('order_index'),
          supabase.from('custom_financial_rows').select('*, custom_financial_row_items(*)').eq('job_id', jobId).is('quote_id', null).order('order_index'),
        ]);
        const quoteRowIds = new Set((forQuote.data || []).map((r: any) => r.id));
        const jobOnlyRows = (forJob.data || []).filter((r: any) => !quoteRowIds.has(r.id));
        customRowsData = [...(forQuote.data || []), ...jobOnlyRows].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
      } else {
        const { data } = await supabase.from('custom_financial_rows').select('*, custom_financial_row_items(*)').eq('job_id', jobId).order('order_index');
        customRowsData = data || [];
      }

      // Subcontractor estimates: same deduplicated pattern
      let subEstimatesData: any[] = [];
      if (quoteId) {
        const [forQuote, forJob] = await Promise.all([
          supabase.from('subcontractor_estimates').select('*, subcontractor_estimate_line_items(*)').eq('quote_id', quoteId).order('order_index'),
          supabase.from('subcontractor_estimates').select('*, subcontractor_estimate_line_items(*)').eq('job_id', jobId).is('quote_id', null).order('order_index'),
        ]);
        const quoteSubIds = new Set((forQuote.data || []).map((r: any) => r.id));
        const jobOnlySubs = (forJob.data || []).filter((r: any) => !quoteSubIds.has(r.id));
        subEstimatesData = [...(forQuote.data || []), ...jobOnlySubs].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
      } else {
        const { data } = await supabase.from('subcontractor_estimates').select('*, subcontractor_estimate_line_items(*)').eq('job_id', jobId).order('order_index');
        subEstimatesData = data || [];
      }

      const TAX_RATE = 0.07;

      // Optional sheet IDs — exclude from proposal totals (match JobFinancials)
      const isSheetOptional = (s: any) => s.is_option === true || s.is_option === 'true' || s.is_option === 1;
      const optionalSheetIds = new Set(
        (materialSheets || []).filter((s: any) => isSheetOptional(s)).map((s: any) => s.id)
      );

      // Optional categories: from material_category_options and/or infer from items (match JobFinancials)
      const proposalSheetIds = (materialSheets || []).map((s: any) => s.id).filter(Boolean);
      const categoryOptionalMap = new Map<string, boolean>();
      if (proposalSheetIds.length > 0) {
        const { data: categoryOptions } = await supabase
          .from('material_category_options')
          .select('sheet_id, category_name, is_optional')
          .in('sheet_id', proposalSheetIds);
        (categoryOptions || []).forEach((r: any) => {
          categoryOptionalMap.set(`${r.sheet_id}_${r.category_name}`, !!r.is_optional);
        });
        // Fallback: if no category options (e.g. RLS), treat category as optional when every item has is_optional
        (materialSheets || []).forEach((sheet: any) => {
          const byCategory = new Map<string, any[]>();
          (sheet.items || []).forEach((item: any) => {
            const cat = item.category || 'Uncategorized';
            if (!byCategory.has(cat)) byCategory.set(cat, []);
            byCategory.get(cat)!.push(item);
          });
          byCategory.forEach((items, catName) => {
            const key = `${sheet.id}_${catName}`;
            if (categoryOptionalMap.has(key)) return;
            const allOptional = items.length > 0 && items.every((i: any) => i.is_optional === true || i.is_optional === 'true');
            if (allOptional) categoryOptionalMap.set(key, true);
          });
        });
      }

      // Helper: compute row materials + labor (with line item markups) and add linked subs (est.row_id === row.id)
      const rowTotalsWithLinkedSubs = (row: any, subs: any[]) => {
        const lineItems: any[] = row.custom_financial_row_items || [];
        const rowMarkup = 1 + (Number(row.markup_percent) || 0) / 100;
        let rowMat = 0;
        let rowLab = 0;
        let rowMatTaxable = 0;
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
          const sm = items.filter((i: any) => !i.excluded && (i.item_type || 'material') === 'material').reduce((s: number, i: any) => s + (Number(i.total_price) || 0), 0);
          const smTax = items.filter((i: any) => !i.excluded && (i.item_type || 'material') === 'material' && i.taxable).reduce((s: number, i: any) => s + (Number(i.total_price) || 0), 0);
          const sl = items.filter((i: any) => !i.excluded && (i.item_type || 'material') === 'labor').reduce((s: number, i: any) => s + (Number(i.total_price) || 0), 0);
          const m = 1 + (Number(sub.markup_percent) || 0) / 100;
          rowMat += sm * m;
          rowMatTaxable += smTax * m;
          rowLab += sl * m;
        });
        return { materials: rowMat * rowMarkup, labor: rowLab * rowMarkup, materialsTaxable: rowMatTaxable * rowMarkup };
      };

      // Materials: use extended_price (selling price override) per category; fall back to extended_cost × markup.
      // Include linked custom rows and sheet-level subcontractors in each sheet total (match JobFinancials).
      let sheetMaterialsTotal = 0;
      let sheetLaborTotal = 0;
      let sheetMaterialsTaxableOnly = 0;
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
        // Match JobFinancials itemEffectivePrice: extended_price or quantity*price_per_unit only (no cost*markup fallback)
        const itemEffectivePrice = (i: any) =>
          (i.extended_price != null && i.extended_price !== '') ? Number(i.extended_price) : (Number(i.quantity) || 0) * (Number(i.price_per_unit) || 0);
        const isItemOptional = (i: any) => i.is_optional === true || i.is_optional === 'true' || i.is_optional === 1;
        byCategory.forEach((catItems, catName) => {
          const isCategoryOptional = categoryOptionalMap.get(`${sheet.id}_${catName}`) === true;
          if (isCategoryOptional) return; // exclude optional categories from proposal total (match JobFinancials)
          const categoryTotal = catItems
            .filter((i: any) => !isItemOptional(i))
            .reduce((s: number, i: any) => s + itemEffectivePrice(i), 0);
          sheetCatPrice += categoryTotal;
        });
        const sheetDirectLabor = sheet.laborTotal ?? 0;
        let sheetLinkedLabor = 0;
        let sheetLinkedMaterials = 0;
        (sheet.sheetLinkedItems || []).forEach((item: any) => {
          const itemTotal = (Number(item.total_cost) || 0) * (1 + ((item.markup_percent ?? 0) / 100));
          if ((item.item_type || 'material') === 'labor') {
            sheetLinkedLabor += itemTotal;
          } else {
            sheetLinkedMaterials += itemTotal;
          }
        });
        // Linked custom rows (row.sheet_id === sheet.id) and their linked subs
        let linkedRowsMat = 0;
        let linkedRowsLab = 0;
        let linkedRowsMatTaxable = 0;
        (customRowsData || []).filter((r: any) => r.sheet_id === sheet.id).forEach((row: any) => {
          const t = rowTotalsWithLinkedSubs(row, subEstimatesData || []);
          linkedRowsMat += t.materials;
          linkedRowsLab += t.labor;
          linkedRowsMatTaxable += t.materialsTaxable;
        });
        // Sheet-level linked subcontractors (est.sheet_id === sheet.id, no row_id)
        let linkedSubsMat = 0;
        let linkedSubsLab = 0;
        let linkedSubsMatTaxable = 0;
        (subEstimatesData || []).filter((e: any) => e.sheet_id === sheet.id && !e.row_id).forEach((est: any) => {
          const items = est.subcontractor_estimate_line_items || [];
          const m = 1 + (Number(est.markup_percent) || 0) / 100;
          const mat = items.filter((i: any) => !i.excluded && (i.item_type || 'material') === 'material').reduce((s: number, i: any) => s + (Number(i.total_price) || 0), 0);
          const matTax = items.filter((i: any) => !i.excluded && (i.item_type || 'material') === 'material' && i.taxable).reduce((s: number, i: any) => s + (Number(i.total_price) || 0), 0);
          const lab = items.filter((i: any) => !i.excluded && (i.item_type || 'material') === 'labor').reduce((s: number, i: any) => s + (Number(i.total_price) || 0), 0);
          linkedSubsMat += mat * m;
          linkedSubsMatTaxable += matTax * m;
          linkedSubsLab += lab * m;
        });
        const sheetMaterialsPart = sheetCatPrice + sheetLinkedMaterials + linkedRowsMat + linkedSubsMat;
        const sheetLaborPart = sheetDirectLabor + sheetLinkedLabor + linkedRowsLab + linkedSubsLab;
        const sheetTotal = sheetMaterialsPart + sheetLaborPart;
        (sheet as any)._computedTotal = sheetTotal;
        (sheet as any)._computedMaterials = sheetMaterialsPart;
        (sheet as any)._computedLabor = sheetLaborPart;
        const countInProposalTotals = (!isChangeOrder || forChangeOrderDocument) && !isOptional;
        if (countInProposalTotals) {
          sheetMaterialsTotal += sheetCatPrice + linkedRowsMat + linkedSubsMat;
          sheetLaborTotal += sheetDirectLabor + sheetLinkedLabor + linkedRowsLab + linkedSubsLab;
          // All sheet category materials taxable by default (match JobFinancials)
          sheetMaterialsTaxableOnly += sheetCatPrice + linkedRowsMatTaxable + linkedSubsMatTaxable;
        }
      });

      // Custom rows — only standalone (no sheet_id). Include linked subs. Store per-row _computedTotal.
      const standaloneCustomRows = (customRowsData || []).filter((r: any) => !r.sheet_id);
      let customMaterialsTotal = 0;
      let customLaborTotal = 0;
      let customMaterialsTaxableOnly = 0;
      standaloneCustomRows.forEach((row: any) => {
        const t = rowTotalsWithLinkedSubs(row, subEstimatesData || []);
        customMaterialsTotal += t.materials;
        customLaborTotal += t.labor;
        customMaterialsTaxableOnly += t.materialsTaxable;
        (row as any)._computedTotal = t.materials + t.labor;
      });

      // Subcontractors — only standalone (no sheet_id, no row_id). Store per-est _computedTotal.
      const standaloneSubs = (subEstimatesData || []).filter((e: any) => !e.sheet_id && !e.row_id);
      let subMaterialsTotal = 0;
      let subLaborTotalVal = 0;
      let subMaterialsTaxableOnly = 0;
      standaloneSubs.forEach((est: any) => {
        const lineItems: any[] = est.subcontractor_estimate_line_items || [];
        const markup = 1 + (Number(est.markup_percent) || 0) / 100;
        const matItems = lineItems.filter((li: any) => !li.excluded && (li.item_type || 'material') === 'material');
        const labItems = lineItems.filter((li: any) => !li.excluded && (li.item_type || 'material') === 'labor');
        const matTotal = matItems.reduce((s: number, i: any) => s + (Number(i.total_price) || 0), 0) * markup;
        const matTaxable = lineItems.filter((li: any) => !li.excluded && (li.item_type || 'material') === 'material' && li.taxable).reduce((s: number, i: any) => s + (Number(i.total_price) || 0), 0) * markup;
        const labTotal = labItems.reduce((s: number, i: any) => s + (Number(i.total_price) || 0), 0) * markup;
        subMaterialsTotal += matTotal;
        subLaborTotalVal += labTotal;
        subMaterialsTaxableOnly += matTaxable;
        (est as any)._computedTotal = matTotal + labTotal;
      });

      // Also set _computedTotal for linked rows/subs so UI can show per-row/sub totals (they're included in sheet total)
      (customRowsData || []).filter((r: any) => r.sheet_id).forEach((row: any) => {
        const t = rowTotalsWithLinkedSubs(row, subEstimatesData || []);
        (row as any)._computedTotal = t.materials + t.labor;
      });
      (subEstimatesData || []).filter((e: any) => e.sheet_id || e.row_id).forEach((est: any) => {
        const lineItems: any[] = est.subcontractor_estimate_line_items || [];
        const markup = 1 + (Number(est.markup_percent) || 0) / 100;
        const mat = lineItems.filter((li: any) => !li.excluded && (li.item_type || 'material') === 'material').reduce((s: number, i: any) => s + (Number(i.total_price) || 0), 0) * markup;
        const lab = lineItems.filter((li: any) => !li.excluded && (li.item_type || 'material') === 'labor').reduce((s: number, i: any) => s + (Number(i.total_price) || 0), 0) * markup;
        (est as any)._computedTotal = mat + lab;
      });

      const totalMaterials = sheetMaterialsTotal + customMaterialsTotal + subMaterialsTotal;
      const totalLabor = sheetLaborTotal + customLaborTotal + subLaborTotalVal;
      const computedSubtotal = totalMaterials + totalLabor;
      const materialsTaxableOnly = sheetMaterialsTaxableOnly + customMaterialsTaxableOnly + subMaterialsTaxableOnly;
      const computedTax = taxExempt ? 0 : materialsTaxableOnly * TAX_RATE;
      const computedGrandTotal = computedSubtotal + computedTax;

      // Use stored totals from quote (written by JobFinancials) so portal matches office exactly; include materials/labor for header
      const totals = storedTotals
        ? { ...storedTotals, materials: storedTotals.materials ?? totalMaterials, labor: storedTotals.labor ?? totalLabor }
        : { subtotal: computedSubtotal, tax: computedTax, grandTotal: computedGrandTotal, materials: totalMaterials, labor: totalLabor };

      return {
        materialSheets,
        changeOrderSheets,
        customRows: customRowsData,
        subcontractorEstimates: subEstimatesData,
        totals,
      };
    } catch (error) {
      console.error('Error loading proposal data:', error);
      return {
        materialSheets: [],
        changeOrderSheets: [],
        customRows: [],
        subcontractorEstimates: [],
        totals: { subtotal: 0, tax: 0, grandTotal: 0, materials: 0, labor: 0 },
      };
    }
  }

  useEffect(() => {
    if (!job?.id || !selectedQuoteId) {
      setProposalData(null);
      return;
    }
    let cancelled = false;
    setProposalDataLoading(true);
    const taxExempt = !!selectedQuote?.tax_exempt;
    loadProposalDataForQuote(job.id, selectedQuoteId, taxExempt).then((data) => {
      if (cancelled) return;
      proposalDataCacheRef.current[selectedQuoteId ?? ''] = data;
      setProposalData(data);
      setProposalDataLoading(false);
    });
    return () => { cancelled = true; };
  }, [job?.id, selectedQuoteId, selectedQuote?.tax_exempt]);

  // Fetch proposal totals from RPC so Overview matches JobFinancials (bypasses PostgREST/RLS column visibility)
  useEffect(() => {
    if (!selectedQuoteId) {
      setQuoteStoredTotals(null);
      return;
    }
    let cancelled = false;
    supabase
      .rpc('get_quote_proposal_totals', { p_quote_id: selectedQuoteId })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data || !Array.isArray(data) || data.length === 0) {
          setQuoteStoredTotals(null);
          return;
        }
        const row = data[0] as { subtotal?: number | null; tax?: number | null; grand_total?: number | null };
        const sub = row?.subtotal != null ? Number(row.subtotal) : NaN;
        const tax = row?.tax != null ? Number(row.tax) : 0;
        const grand = row?.grand_total != null ? Number(row.grand_total) : NaN;
        if (Number.isFinite(sub) && Number.isFinite(grand)) {
          setQuoteStoredTotals({ subtotal: sub, tax: Number.isFinite(tax) ? tax : 0, grandTotal: grand });
        } else {
          setQuoteStoredTotals(null);
        }
      });
    return () => { cancelled = true; };
  }, [selectedQuoteId]);

  const proposalNumber = selectedQuote?.proposal_number || selectedQuote?.quote_number || 'N/A';
  const portalUrl = typeof window !== 'undefined' ? window.location.href : '';

  async function copyPortalUrl() {
    if (!portalUrl) return;
    try {
      await navigator.clipboard.writeText(portalUrl);
      toast.success('Portal link copied to clipboard');
    } catch {
      toast.error('Could not copy link');
    }
  }

  /** Open print dialog with proposal HTML that matches the office Export Customer PDF (Proposal-26012-5 style). */
  function handlePrintProposal() {
    if (!proposalData || !job) return;
    const proposalNumber = selectedQuote?.proposal_number || selectedQuote?.quote_number || 'N/A';
    const proposalSheets = (proposalData.materialSheets || []).filter(
      (s: any) => s.sheet_type !== 'change_order' && !isFieldRequestSheetName(s.sheet_name)
    );
    const customRows = proposalData.customRows || [];
    const standaloneCustomRows = customRows.filter((row: any) => !row.sheet_id);
    const sheetSections: Array<{ type: 'material' | 'custom' | 'subcontractor'; id: string; orderIndex: number; data: any }> = [];
    proposalSheets.forEach((sheet: any) => {
      const sheetOrder = sheet.order_index ?? 0;
      sheetSections.push({ type: 'material' as const, id: sheet.id, orderIndex: sheetOrder * 1000, data: sheet });
      customRows.filter((r: any) => r.sheet_id === sheet.id).sort((a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0)).forEach((row: any, idx: number) => {
        sheetSections.push({ type: 'custom' as const, id: row.id, orderIndex: sheetOrder * 1000 + 100 + (row.order_index ?? idx), data: row });
      });
    });
    const allSections: Array<{ type: 'material' | 'custom' | 'subcontractor'; id: string; orderIndex: number; data: any }> = [
      ...sheetSections,
      ...standaloneCustomRows.map((row: any) => ({ type: 'custom' as const, id: row.id, orderIndex: (row.order_index ?? 0) * 1000, data: row })),
      ...(proposalData.subcontractorEstimates || []).filter((est: any) => !est.sheet_id && !est.row_id).map((est: any) => ({ type: 'subcontractor' as const, id: est.id, orderIndex: (est.order_index ?? 0) * 1000, data: est })),
    ].sort((a, b) => a.orderIndex - b.orderIndex);

    // Sections visible in proposal (sheet-linked line items are part of the sheet total, not separate print lines).
    const sections = allSections.map((section) => {
      if (section.type === 'material') {
        const s = section.data;
        const linkedSubs = (proposalData.subcontractorEstimates || []).filter((e: any) => e.sheet_id === s.id);
        const parts: string[] = [];
        if (s.description) parts.push(s.description);
        linkedSubs.forEach((est: any) => { if (est.scope_of_work) parts.push(est.scope_of_work); });
        const description = parts.join('\n');
        return { name: s.sheet_name, description, price: showPriceForSection(s.id) ? (s._computedTotal ?? 0) : undefined, optional: false };
      }
      if (section.type === 'custom') {
        const r = section.data;
        return { name: r.description || r.category || 'Custom', description: r.notes || '', price: showPriceForSection(r.id) ? (r._computedTotal ?? 0) : undefined, optional: false };
      }
      const e = section.data;
      return { name: e.company_name, description: e.scope_of_work || '', price: showFinancial && showLineItemPrices ? (e._computedTotal ?? 0) : undefined, optional: false };
    });

    const displayTotalsForPrint =
      (proposalData?.totals != null ? proposalData.totals : null) ??
      quoteStoredTotals ??
      ((selectedQuote && Number.isFinite(Number(selectedQuote.proposal_grand_total)) && Number.isFinite(Number(selectedQuote.proposal_subtotal))
        ? { subtotal: Number(selectedQuote.proposal_subtotal), tax: Number(selectedQuote.proposal_tax) || 0, grandTotal: Number(selectedQuote.proposal_grand_total) }
        : null));
    const totals = displayTotalsForPrint
      ? {
          materials: 0,
          labor: 0,
          subtotal: displayTotalsForPrint.subtotal,
          tax: displayTotalsForPrint.tax,
          grandTotal: displayTotalsForPrint.grandTotal,
        }
      : { materials: 0, labor: 0, subtotal: 0, tax: 0, grandTotal: 0 };

    const html = generateProposalHTML({
      proposalNumber,
      date: new Date().toLocaleDateString('en-US'),
      job: {
        client_name: job.client_name,
        address: job.address || '',
        name: job.name,
        customer_phone: job.customer_phone || undefined,
        description: job.description || undefined,
      },
      sections,
      totals,
      showLineItems: false,
      showSectionPrices: !!(showFinancial && showLineItemPrices),
      showInternalDetails: false,
      theme: 'default',
      taxExempt: !!selectedQuote?.tax_exempt,
    });

    const blob = new Blob([html], { type: 'text/html; charset=utf-8' });
    const blobUrl = URL.createObjectURL(blob);
    const win = window.open(blobUrl, '_blank');
    if (!win) {
      URL.revokeObjectURL(blobUrl);
      toast.error('Allow popups to print.');
      return;
    }
    win.focus();
    toast.info('Choose your printer or "Save as PDF" in the print dialog.');
    setTimeout(() => {
      try {
        if (!win.closed) win.print();
      } catch {
        toast.error('Could not open print dialog');
      }
      setTimeout(() => URL.revokeObjectURL(blobUrl), 3000);
    }, 500);
  }

  const viewOptions = [
    { value: 'overview', label: 'Overview', icon: LayoutDashboard },
    ...(showProposal && changeOrderQuote
      ? [{ value: 'change-orders' as const, label: 'Change orders', icon: ClipboardList }]
      : []),
    ...(showPayments ? [{ value: 'payments' as const, label: 'Payments', icon: DollarSign }] : []),
    ...(showSchedule ? [{ value: 'schedule' as const, label: 'Schedule', icon: Calendar }] : []),
    ...(showDocuments ? [{ value: 'documents' as const, label: 'Documents', icon: FileSpreadsheet }] : []),
    ...(showPhotos ? [{ value: 'photos' as const, label: 'Photos', icon: Image }] : []),
    { value: 'emails' as const, label: 'Messages', icon: Mail },
  ];

  // When office turns off a tab, switch away if customer was on it
  useEffect(() => {
    const allowed = new Set(viewOptions.map((o) => o.value));
    if (!allowed.has(activeTab)) setActiveTab('overview');
  }, [showPayments, showSchedule, showDocuments, showPhotos, showProposal, changeOrderQuote?.id, activeTab]);

  useEffect(() => {
    if (activeTab === 'change-orders' && !changeOrderQuote) setActiveTab('overview');
  }, [activeTab, changeOrderQuote]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header: black, gold, dark green – matches portal settings preview */}
      <div className="bg-gradient-to-r from-zinc-900 via-emerald-950 to-zinc-900 text-white shadow-xl border-b-2 border-amber-500/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-3xl font-bold text-amber-400">{job.name}</h1>
                {proposalQuotes.length > 1 ? (
                  <Select value={selectedQuoteId ?? ''} onValueChange={(v) => setSelectedQuoteId(v || null)}>
                    <SelectTrigger className="w-[180px] bg-amber-500/20 text-amber-300 border-amber-500/50">
                      <SelectValue placeholder="Select proposal" />
                    </SelectTrigger>
                    <SelectContent>
                      {proposalQuotes.map((q: any) => (
                        <SelectItem key={q.id} value={q.id}>
                          #{q.proposal_number || q.quote_number || q.id.slice(0, 8)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Badge variant="outline" className="bg-amber-500/20 text-amber-300 border-amber-500/50">
                    #{proposalNumber}
                  </Badge>
                )}
              </div>
              <p className="text-emerald-100/90 mt-1">{job.client_name}</p>
              {job.address && (
                <p className="text-emerald-200/80 text-sm mt-1 flex items-center gap-1">
                  <MapPin className="w-4 h-4 shrink-0 text-amber-400/90" />
                  {job.address}
                </p>
              )}
            </div>
            <div className="flex items-center gap-3">
              <PWAInstallButton />
              <Badge variant="outline" className="bg-amber-500/10 text-amber-300 border-amber-500/40 px-4 py-2">
                Customer Portal
              </Badge>
            </div>
          </div>
        </div>
      </div>

      {/* Content – all visibility-controlled sections from portal settings */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            {/* Horizontal tab bar – matches the office preview exactly */}
            <TabsList
              className="grid w-full mb-6"
              style={{ gridTemplateColumns: `repeat(${viewOptions.length}, 1fr)` }}
            >
              {viewOptions.map((opt) => {
                const Icon = opt.icon;
                const unread = opt.value === 'emails'
                  ? emails.filter((e: any) => !e.is_read && e.direction === 'sent').length
                  : 0;
                return (
                  <TabsTrigger key={opt.value} value={opt.value} className="flex items-center gap-1 text-xs sm:text-sm">
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span>{opt.label}</span>
                    {unread > 0 && (
                      <Badge variant="destructive" className="ml-1 shrink-0 text-[10px] px-1 py-0">
                        {unread}
                      </Badge>
                    )}
                  </TabsTrigger>
                );
              })}
            </TabsList>

          {/* Overview Tab – order matches portal settings: custom message, drawings, proposal */}
          <TabsContent value="overview" className="space-y-6">
            {/* Custom welcome message (from Portal settings) */}
            {customerInfo?.custom_message && (
              <Card className="border-amber-200 bg-amber-50/50">
                <CardContent className="pt-6">
                  <p className="text-slate-800 whitespace-pre-wrap">{customerInfo.custom_message}</p>
                </CardContent>
              </Card>
            )}
            {!showFinancial && (
              <Card className="border-amber-200 bg-amber-50/50">
                <CardContent className="pt-6">
                  <p className="text-slate-700">Pricing and final amount will be shared when ready. You can review the proposal scope and drawings below and send messages with any questions.</p>
                </CardContent>
              </Card>
            )}
            {/* Drawings & 3D Views (viewer links) — gated by Documents visibility */}
            {showDocuments && viewerLinks.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ExternalLink className="w-5 h-5" />
                    Drawings & 3D Views
                  </CardTitle>
                  <p className="text-sm text-muted-foreground font-normal">Open the links below to view plans and 3D models.</p>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-3">
                    {viewerLinks.map((link: any) => (
                      <Button
                        key={link.id}
                        variant="outline"
                        className="flex items-center gap-2"
                        onClick={() => window.open(link.url, '_blank', 'noopener,noreferrer')}
                      >
                        <ExternalLink className="w-4 h-4" />
                        {link.label}
                      </Button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Project Proposal: only visible to customer after "Mark as Sent" in the office */}
            {showProposal && (
              <>
                {!(selectedQuote as any)?.sent_at ? (
                  <Card className="border-slate-200 bg-slate-50/50">
                    <CardContent className="py-8 text-center text-muted-foreground">
                      <FileSpreadsheet className="w-10 h-10 mx-auto mb-3 opacity-50" />
                      <p className="font-medium text-slate-600">Your proposal is not ready yet</p>
                      <p className="text-sm mt-1">It will appear here once your project manager has sent it to you.</p>
                    </CardContent>
                  </Card>
                ) : (
                <>
                <style>{`
                  @media print {
                    body * { visibility: hidden; }
                    .portal-proposal-print-area, .portal-proposal-print-area * { visibility: visible; }
                    .portal-proposal-print-area { position: absolute; left: 0; top: 0; width: 100%; max-width: 100%; box-shadow: none; }
                  }
                `}</style>
                <Card id="portal-proposal-print" className="portal-proposal-print-area border-emerald-200/60">
                  <CardHeader className="flex flex-row items-start justify-between gap-4">
                    <div>
                      <CardTitle className="flex items-center gap-2 text-emerald-900">
                        <FileSpreadsheet className="w-5 h-5" />
                        Project Proposal
                      </CardTitle>
                      {!showFinancial && (
                        <p className="text-sm text-muted-foreground font-normal mt-1">Pricing will be shared when ready. Below is the scope and description.</p>
                      )}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0 print:hidden"
                      onClick={handlePrintProposal}
                    >
                      <Printer className="w-4 h-4 mr-2" />
                      Print proposal
                    </Button>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {proposalDataLoading && !proposalData ? (
                      <div className="flex items-center justify-center py-8 text-muted-foreground">
                        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mr-2" />
                        Loading proposal…
                      </div>
                    ) : proposalData ? (
                      <>
                        {/* Summary line (Materials | Labor | Subtotal | Tax | GRAND TOTAL) is shown only in the office preview, not to the customer in the portal link. */}
                        {/* Proposal sections only (exclude change order sheets); change orders shown in separate card below.
                            Include every material sheet (including labor-only sheets with no material items) and both
                            standalone and sheet-linked custom rows so section order matches the office proposal. */}
                        {(() => {
                          const proposalSheets = (proposalData.materialSheets || []).filter(
                            (s: any) => s.sheet_type !== 'change_order' && !isFieldRequestSheetName(s.sheet_name)
                          );
                          const customRows = proposalData.customRows || [];
                          const standaloneCustomRows = customRows.filter((row: any) => !row.sheet_id);
                          // Build sections: each material sheet (sheet-linked line items are shown inside the sheet card), then linked custom rows, then standalone custom rows and subcontractors.
                          const sheetSections: Array<{ type: 'material' | 'custom' | 'subcontractor'; id: string; orderIndex: number; data: any }> = [];
                          proposalSheets.forEach((sheet: any) => {
                            const sheetOrder = sheet.order_index ?? 0;
                            sheetSections.push({
                              type: 'material' as const,
                              id: sheet.id,
                              orderIndex: sheetOrder * 1000,
                              data: sheet,
                            });
                            const linkedToSheet = customRows
                              .filter((r: any) => r.sheet_id === sheet.id)
                              .sort((a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0));
                            linkedToSheet.forEach((row: any, idx: number) => {
                              sheetSections.push({
                                type: 'custom' as const,
                                id: row.id,
                                orderIndex: sheetOrder * 1000 + 100 + (row.order_index ?? idx),
                                data: row,
                              });
                            });
                          });
                          const allSections: Array<{ type: 'material' | 'custom' | 'subcontractor'; id: string; orderIndex: number; data: any }> = [
                            ...sheetSections,
                            ...standaloneCustomRows.map((row: any) => ({
                              type: 'custom' as const,
                              id: row.id,
                              orderIndex: (row.order_index ?? 0) * 1000,
                              data: row,
                            })),
                            ...(proposalData.subcontractorEstimates || [])
                              .filter((est: any) => !est.sheet_id && !est.row_id)
                              .map((est: any) => ({
                                type: 'subcontractor' as const,
                                id: est.id,
                                orderIndex: (est.order_index ?? 0) * 1000,
                                data: est,
                              })),
                          ].sort((a, b) => a.orderIndex - b.orderIndex);

                          return allSections.map((section) => {
                            if (section.type === 'material') {
                              const sheet = section.data;
                              const linkedSubs = (proposalData.subcontractorEstimates || []).filter((e: any) => e.sheet_id === sheet.id);
                              const sheetMaterials = sheet._computedMaterials ?? 0;
                              const sheetLabor = sheet._computedLabor ?? 0;
                              const sheetTotal = sheet._computedTotal ?? (sheetMaterials + sheetLabor);
                              const isOptional = sheet.is_option === true || sheet.is_option === 'true' || sheet.is_option === 1;
                              const showPrice = showPriceForSection(sheet.id);
                              return (
                                <div key={sheet.id} className="border rounded-lg px-4 py-3 flex items-start justify-between gap-4">
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <h3 className="font-semibold text-base">{sheet.sheet_name}</h3>
                                      {isOptional && (
                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800 border border-amber-300">
                                          Optional
                                        </span>
                                      )}
                                    </div>
                                    {sheet.description && (
                                      <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{sheet.description}</p>
                                    )}
                                    {linkedSubs.map((est: any) => (
                                      <div key={est.id} className="mt-2">
                                        {est.scope_of_work && <p className="text-sm text-muted-foreground whitespace-pre-wrap">{est.scope_of_work}</p>}
                                      </div>
                                    ))}
                                  </div>
                                  {showPrice && (sheetMaterials > 0 || sheetLabor > 0) && (
                                    <div className="w-[100px] flex-shrink-0 text-right">
                                      {sheetMaterials > 0 && (
                                        <>
                                          <p className="text-sm text-slate-500">Materials</p>
                                          <p className="text-base font-bold text-blue-700">${sheetMaterials.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                        </>
                                      )}
                                      {sheetLabor > 0 && (
                                        <>
                                          <p className="text-sm text-slate-500 mt-2">Labor</p>
                                          <p className="text-base font-bold text-amber-700">${sheetLabor.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                        </>
                                      )}
                                      {isOptional && sheetTotal > 0 && (
                                        <>
                                          <p className="text-[11px] text-slate-500 mt-2">Section total</p>
                                          <p className="text-sm font-bold text-emerald-700">
                                            ${sheetTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                          </p>
                                        </>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            }
                            if (section.type === 'custom') {
                              const row = section.data;
                              const title = row.description || row.category || 'Custom';
                              const descriptionParts: string[] = [];
                              if (row.notes?.trim()) descriptionParts.push(row.notes.trim());
                              if (row.description?.trim() && row.description.trim() !== title.trim()) descriptionParts.push(row.description.trim());
                              const descriptionText = descriptionParts.join('\n\n');
                              return (
                                <div key={row.id} className="border rounded-lg px-4 py-3 flex items-start justify-between gap-4">
                                  <div className="min-w-0 flex-1">
                                    <h3 className="font-semibold text-base">{title}</h3>
                                    {descriptionText && (
                                      <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{descriptionText}</p>
                                    )}
                                  </div>
                                  {showPriceForSection(row.id) && (row._computedTotal ?? 0) > 0 && (
                                    <p className="text-base font-bold text-emerald-700 shrink-0">
                                      ${(row._computedTotal as number).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </p>
                                  )}
                                </div>
                              );
                            }
                            // subcontractor
                            const est = section.data;
                            return (
                              <div key={est.id} className="border rounded-lg px-4 py-3 flex items-start justify-between gap-4">
                                <div className="min-w-0 flex-1">
                                  <h3 className="font-semibold text-base">{est.company_name}</h3>
                                  {est.scope_of_work && (
                                    <p className="text-sm text-muted-foreground mt-1">{est.scope_of_work}</p>
                                  )}
                                </div>
                                {showPriceForSection(est.id) && (est._computedTotal ?? 0) > 0 && (
                                  <p className="text-base font-bold text-emerald-700 shrink-0">
                                    ${(est._computedTotal as number).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </p>
                                )}
                              </div>
                            );
                          });
                        })()}

                        {/* Totals — only shown when showFinancial is enabled. Prefer proposalData.totals; fall back to RPC/quote when proposalData not yet loaded. */}
                        {showFinancial && (() => {
                          const displayTotals =
                            (proposalData?.totals != null ? proposalData.totals : null) ??
                            quoteStoredTotals ??
                            ((selectedQuote && Number.isFinite(Number(selectedQuote.proposal_grand_total)) && Number.isFinite(Number(selectedQuote.proposal_subtotal))
                              ? {
                                  subtotal: Number(selectedQuote.proposal_subtotal),
                                  tax: Number(selectedQuote.proposal_tax) || 0,
                                  grandTotal: Number(selectedQuote.proposal_grand_total),
                                }
                              : null));
                          if (!displayTotals) return null;
                          return (
                            <div className="border-t-2 pt-4 space-y-2">
                              <div className="flex justify-between text-lg">
                                <span className="font-medium">Subtotal:</span>
                                <span>${displayTotals.subtotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                              </div>
                              {selectedQuote?.tax_exempt ? (
                                <div className="flex items-center gap-2 text-lg text-amber-700">
                                  <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
                                  <span className="font-medium">Tax exempt</span>
                                </div>
                              ) : (
                                <div className="flex justify-between text-lg">
                                  <span className="font-medium">Tax (7%):</span>
                                  <span>${displayTotals.tax.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                </div>
                              )}
                              <div className="flex justify-between items-center text-2xl font-bold pt-2 border-t">
                                <span>Grand Total:</span>
                                <span className="text-emerald-700">
                                  ${displayTotals.grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                              </div>
                            </div>
                          );
                        })()}

                        {/* Contract: seal replaces sign button once signed (customer e-sign, office “Set as Contract”, or pending confirm) */}
                        {(selectedQuote as any)?.customer_signed_at ? (
                          <div className="border-t-2 pt-4 mt-4 space-y-3">
                            <h4 className="font-semibold text-slate-800 flex items-center gap-2">
                              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                              This proposal is your signed contract
                            </h4>
                            <p className="text-sm text-muted-foreground">
                              {`Signed on ${(new Date((selectedQuote as any).customer_signed_at)).toLocaleDateString('en-US', { dateStyle: 'medium' })}${(selectedQuote as any).customer_signed_name ? ` by ${(selectedQuote as any).customer_signed_name}` : ''}.`}
                            </p>
                            <div className="space-y-2 pt-1">
                              <MartinBuilderContractSeal />
                            </div>
                          </div>
                        ) : selectedQuoteId && portalSignPendingByQuote[selectedQuoteId] ? (
                          <div className="border-t-2 pt-4 mt-4 space-y-3">
                            <h4 className="font-semibold text-slate-800 flex items-center gap-2">
                              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                              This proposal is your signed contract
                            </h4>
                            <p className="text-sm text-muted-foreground">
                              Signed by {portalSignPendingByQuote[selectedQuoteId].name}. Your acceptance is on file.
                            </p>
                            <div className="space-y-2 pt-1">
                              <MartinBuilderContractSeal />
                            </div>
                          </div>
                        ) : (selectedQuote as any)?.sent_at &&
                          Number((selectedQuote as any)?.signed_version) > 0 ? (
                          <div className="border-t-2 pt-4 mt-4 space-y-3">
                            <h4 className="font-semibold text-slate-800 flex items-center gap-2">
                              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                              This proposal is your signed contract
                            </h4>
                            <p className="text-sm text-muted-foreground">
                              Martin Builder has recorded this proposal as your signed contract.
                            </p>
                            <div className="space-y-2 pt-1">
                              <MartinBuilderContractSeal />
                            </div>
                          </div>
                        ) : (selectedQuote as any)?.sent_at ? (
                          <div className="border-t-2 pt-4 mt-4 space-y-3">
                            <h4 className="font-semibold text-slate-800 flex items-center gap-2">
                              <PenLine className="w-4 h-4" />
                              Use this proposal as contract
                            </h4>
                            <p className="text-sm text-muted-foreground">
                              By signing below, you accept this proposal and authorize the work as specified. This will serve as your contract.
                            </p>
                            <div className="grid gap-3 sm:grid-cols-2">
                              <div className="space-y-1.5">
                                <Label htmlFor="signer-name">Your full name *</Label>
                                <Input
                                  id="signer-name"
                                  value={signerName}
                                  onChange={(e) => setSignerName(e.target.value)}
                                  placeholder="Full name"
                                  className="bg-white"
                                />
                              </div>
                              <div className="space-y-1.5">
                                <Label htmlFor="signer-email">Your email *</Label>
                                <Input
                                  id="signer-email"
                                  type="email"
                                  value={signerEmail}
                                  onChange={(e) => setSignerEmail(e.target.value)}
                                  placeholder="email@example.com"
                                  className="bg-white"
                                />
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                id="agree-terms"
                                checked={agreeToTerms}
                                onChange={(e) => setAgreeToTerms(e.target.checked)}
                                className="rounded border-slate-300"
                              />
                              <Label htmlFor="agree-terms" className="text-sm font-normal cursor-pointer">
                                I agree to the terms and authorize the work as specified in this proposal.
                              </Label>
                            </div>
                            <div className="space-y-2">
                              {!agreeToTerms && (
                                <p className="text-xs text-amber-700">Check the agreement box above to enable signing.</p>
                              )}
                              <Button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleSignProposal(e);
                                }}
                                disabled={signing || !agreeToTerms || !signerName.trim() || !signerEmail.trim()}
                                className="bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {signing ? (
                                  <>
                                    <span className="animate-spin mr-2 inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                                    Signing…
                                  </>
                                ) : (
                                  <>
                                    <PenLine className="w-4 h-4 mr-2" />
                                    Sign & use as contract
                                  </>
                                )}
                              </Button>
                              {agreeToTerms && (!signerEmail.trim() || !signerName.trim()) && (
                                <p className="text-xs text-amber-700">Enter your full name and email above to sign.</p>
                              )}
                            </div>
                          </div>
                        ) : null}
                      </>
                    ) : null}
                  </CardContent>
                </Card>
              </>
            )}
            </>
          )}

          </TabsContent>

          <TabsContent value="change-orders" className="space-y-6">
            {changeOrderQuote ? (
              !(changeOrderQuote as any)?.sent_at ? (
                <Card className="border-orange-200 bg-orange-50/30">
                  <CardContent className="py-8 text-center text-muted-foreground">
                    <ClipboardList className="w-10 h-10 mx-auto mb-3 opacity-50 text-orange-700" />
                    <p className="font-medium text-slate-700">No change order sent yet</p>
                    <p className="text-sm mt-1">When your project manager sends a change order, it will appear here for you to review and sign.</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-6">
                  <Card className="border-orange-100 bg-orange-50/50">
                    <CardContent className="pt-6 space-y-4">
                      <p className="text-sm text-slate-700">
                        <strong>Change orders</strong> are separate from your main proposal. Each one has its own number and printable document. Sign only the change orders you authorize.
                      </p>
                      {!showFinancialCo && (
                        <p className="text-sm text-muted-foreground">Pricing appears when your contractor shares it.</p>
                      )}
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label htmlFor="co-signer-name-all">Your full name (for signing) *</Label>
                          <Input
                            id="co-signer-name-all"
                            value={coSignerName}
                            onChange={(e) => setCoSignerName(e.target.value)}
                            placeholder="Full name"
                            className="bg-white"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="co-signer-email-all">Your email *</Label>
                          <Input
                            id="co-signer-email-all"
                            type="email"
                            value={coSignerEmail}
                            onChange={(e) => setCoSignerEmail(e.target.value)}
                            placeholder="email@example.com"
                            className="bg-white"
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  {changeOrderDataLoading && !changeOrderProposalData ? (
                    <div className="flex items-center justify-center py-8 text-muted-foreground">
                      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mr-2" />
                      Loading change orders…
                    </div>
                  ) : changeOrderProposalData ? (
                    (() => {
                      const coData = changeOrderProposalData;
                      const rawSigs = (changeOrderQuote as any)?.change_order_signatures;
                      const coSigs: Record<string, { signed_at?: string; signed_name?: string }> =
                        rawSigs && typeof rawSigs === 'object' && !Array.isArray(rawSigs) ? rawSigs : {};
                      let sheets = (coData.materialSheets || []).filter(
                        (s: any) =>
                          !isFieldRequestSheetName(s.sheet_name) &&
                          (s.sheet_type === 'change_order' || s.sheet_type == null)
                      );
                      sheets = [...sheets].sort((a: any, b: any) => {
                        const sa = Number(a.change_order_seq) || 0;
                        const sb = Number(b.change_order_seq) || 0;
                        if (sa !== sb) return sa - sb;
                        return (a.order_index ?? 0) - (b.order_index ?? 0);
                      });
                      if (sheets.length === 0) {
                        return (
                          <p className="text-sm text-muted-foreground py-4 text-center">
                            No change order line items yet.
                          </p>
                        );
                      }
                      const displayTotals =
                        coData.totals ?? coQuoteStoredTotals ?? { subtotal: 0, tax: 0, grandTotal: 0 };
                      return (
                        <>
                          {sheets.map((sheet: any, idx: number) => {
                            const seq = Number(sheet.change_order_seq) || idx + 1;
                            const coLabel = `CO-${String(seq).padStart(3, '0')}`;
                            const sig = coSigs[sheet.id];
                            const linkedSubs = (coData.subcontractorEstimates || []).filter(
                              (e: any) => e.sheet_id === sheet.id
                            );
                            const linkedRows = (coData.customRows || [])
                              .filter((r: any) => r.sheet_id === sheet.id)
                              .sort((a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0));
                            const sheetMat = sheet._computedMaterials ?? 0;
                            const sheetLab = sheet._computedLabor ?? 0;
                            const taxEx = !!(changeOrderQuote as any)?.tax_exempt;
                            const lineTax = taxEx ? 0 : sheetMat * 0.07;
                            const lineGrand = sheetMat + sheetLab + lineTax;
                            const signed = !!(sig?.signed_at);
                            return (
                              <Card key={sheet.id} className="border-orange-200 overflow-hidden">
                                <CardHeader className="bg-orange-50/80 border-b border-orange-100 flex flex-row flex-wrap items-start justify-between gap-3">
                                  <div className="space-y-1">
                                    <Badge variant="outline" className="text-orange-900 border-orange-400 bg-white font-mono">
                                      {coLabel}
                                    </Badge>
                                    <CardTitle className="text-lg text-orange-950 pt-1">{sheet.sheet_name}</CardTitle>
                                  </div>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="shrink-0 border-orange-300"
                                    onClick={() => openChangeOrderDocument(sheet, coLabel)}
                                  >
                                    <Printer className="w-4 h-4 mr-2" />
                                    View document
                                  </Button>
                                </CardHeader>
                                <CardContent className="space-y-4 pt-4">
                                  {sheet.description && (
                                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{sheet.description}</p>
                                  )}
                                  {(sheet.sheetLinkedItems || []).filter((x: any) => !x.hide_from_customer).length > 0 && (
                                    <ul className="text-sm space-y-1 border-t border-orange-100 pt-3">
                                      {(sheet.sheetLinkedItems || [])
                                        .filter((item: any) => !item.hide_from_customer)
                                        .map((item: any) => {
                                          const isLabor = (item.item_type || 'material') === 'labor';
                                          const lineTotal =
                                            (Number(item.total_cost) || 0) *
                                            (1 + (Number(item.markup_percent) || 0) / 100);
                                          return (
                                            <li key={item.id} className="flex justify-between gap-2">
                                              <span>
                                                {isLabor ? 'Labor: ' : ''}
                                                {item.description || 'Line'}
                                              </span>
                                              {showPriceForCoSection(sheet.id) && lineTotal > 0 && (
                                                <span className="font-medium tabular-nums">
                                                  ${lineTotal.toLocaleString('en-US', {
                                                    minimumFractionDigits: 2,
                                                    maximumFractionDigits: 2,
                                                  })}
                                                </span>
                                              )}
                                            </li>
                                          );
                                        })}
                                    </ul>
                                  )}
                                  {linkedRows.map((row: any) => (
                                    <div key={row.id} className="border-t border-orange-50 pt-2">
                                      <p className="font-medium text-sm">{row.description || row.category}</p>
                                      {row.notes?.trim() && (
                                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">{row.notes}</p>
                                      )}
                                      {showPriceForCoSection(row.id) && (row._computedTotal ?? 0) > 0 && (
                                        <p className="text-sm font-semibold text-orange-800 mt-1">
                                          $
                                          {(row._computedTotal as number).toLocaleString('en-US', {
                                            minimumFractionDigits: 2,
                                            maximumFractionDigits: 2,
                                          })}
                                        </p>
                                      )}
                                    </div>
                                  ))}
                                  {linkedSubs.map((est: any) => (
                                    <div key={est.id} className="text-sm text-muted-foreground">
                                      {est.scope_of_work && (
                                        <p className="whitespace-pre-wrap">{est.scope_of_work}</p>
                                      )}
                                    </div>
                                  ))}
                                  {showFinancialCo && showLineItemPricesCo && (
                                    <div className="border-t pt-3 space-y-1 text-sm">
                                      {sheetMat > 0 && (
                                        <div className="flex justify-between">
                                          <span>Materials</span>
                                          <span className="font-semibold">
                                            $
                                            {sheetMat.toLocaleString('en-US', {
                                              minimumFractionDigits: 2,
                                              maximumFractionDigits: 2,
                                            })}
                                          </span>
                                        </div>
                                      )}
                                      {sheetLab > 0 && (
                                        <div className="flex justify-between">
                                          <span>Labor</span>
                                          <span className="font-semibold">
                                            $
                                            {sheetLab.toLocaleString('en-US', {
                                              minimumFractionDigits: 2,
                                              maximumFractionDigits: 2,
                                            })}
                                          </span>
                                        </div>
                                      )}
                                      {!taxEx && lineTax > 0 && (
                                        <div className="flex justify-between text-muted-foreground">
                                          <span>Tax (est.)</span>
                                          <span>
                                            $
                                            {lineTax.toLocaleString('en-US', {
                                              minimumFractionDigits: 2,
                                              maximumFractionDigits: 2,
                                            })}
                                          </span>
                                        </div>
                                      )}
                                      <div className="flex justify-between text-base font-bold text-orange-900 pt-1">
                                        <span>Total ({coLabel})</span>
                                        <span>
                                          $
                                          {lineGrand.toLocaleString('en-US', {
                                            minimumFractionDigits: 2,
                                            maximumFractionDigits: 2,
                                          })}
                                        </span>
                                      </div>
                                    </div>
                                  )}
                                  {signed ? (
                                    <div className="border-t pt-4 space-y-2">
                                      <div className="flex items-center gap-2 text-emerald-800 font-medium">
                                        <CheckCircle className="w-5 h-5 shrink-0" />
                                        Signed — {coLabel}
                                      </div>
                                      <p className="text-sm text-muted-foreground">
                                        {sig.signed_name ? `${sig.signed_name} · ` : ''}
                                        {sig.signed_at
                                          ? new Date(sig.signed_at).toLocaleDateString('en-US', {
                                              dateStyle: 'medium',
                                            })
                                          : ''}
                                      </p>
                                      <MartinBuilderContractSeal />
                                    </div>
                                  ) : (
                                    <div className="border-t pt-4 space-y-3">
                                      <p className="text-sm font-medium text-slate-800">Sign to authorize {coLabel}</p>
                                      <div className="flex items-center gap-2">
                                        <input
                                          type="checkbox"
                                          id={`co-agree-${sheet.id}`}
                                          checked={!!coAgreeBySheet[sheet.id]}
                                          onChange={(e) =>
                                            setCoAgreeBySheet((p) => ({
                                              ...p,
                                              [sheet.id]: e.target.checked,
                                            }))
                                          }
                                          className="rounded border-slate-300"
                                        />
                                        <Label htmlFor={`co-agree-${sheet.id}`} className="text-sm font-normal cursor-pointer">
                                          I authorize this change order ({coLabel}) and agree to the price shown.
                                        </Label>
                                      </div>
                                      <Button
                                        type="button"
                                        onClick={(e) => handleSignChangeOrderSheet(sheet.id, e)}
                                        disabled={
                                          coSigningSheetId === sheet.id ||
                                          !coAgreeBySheet[sheet.id] ||
                                          !coSignerName.trim() ||
                                          !coSignerEmail.trim()
                                        }
                                        className="bg-orange-700 hover:bg-orange-800"
                                      >
                                        {coSigningSheetId === sheet.id ? 'Signing…' : `Sign ${coLabel}`}
                                      </Button>
                                    </div>
                                  )}
                                </CardContent>
                              </Card>
                            );
                          })}
                          {showFinancialCo && (
                            <Card className="border-slate-200 bg-slate-50/50">
                              <CardContent className="pt-4 text-sm text-muted-foreground">
                                <span className="font-medium text-slate-700">All change orders combined: </span>
                                $
                                {(displayTotals.grandTotal ?? 0).toLocaleString('en-US', {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}{' '}
                                (job total; each document above shows its own scope and price)
                              </CardContent>
                            </Card>
                          )}
                        </>
                      );
                    })()
                  ) : null}
                </div>
              )
            ) : null}
          </TabsContent>

          {/* Payments Tab */}
          <TabsContent value="payments">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="w-5 h-5" />
                  Payment History
                </CardTitle>
              </CardHeader>
              <CardContent>
                {payments.length > 0 ? (
                  <div className="space-y-3">
                    {payments.map((payment: any) => (
                      <div key={payment.id} className="flex items-center justify-between p-4 border rounded-lg">
                        <div>
                          <p className="font-medium">
                            {new Date(payment.payment_date).toLocaleDateString()}
                          </p>
                          {payment.payment_method && (
                            <p className="text-sm text-muted-foreground">{payment.payment_method}</p>
                          )}
                          {payment.payment_notes && (
                            <p className="text-sm text-muted-foreground mt-1">{payment.payment_notes}</p>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="text-xl font-bold text-green-600">
                            ${parseFloat(payment.amount.toString()).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </p>
                          {payment.receipt_url && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => window.open(payment.receipt_url, '_blank')}
                              className="mt-1"
                            >
                              <Download className="w-4 h-4 mr-1" />
                              Receipt
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground py-8">No payments recorded yet</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Schedule Tab */}
          <TabsContent value="schedule">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="w-5 h-5" />
                  Project Schedule
                </CardTitle>
              </CardHeader>
              <CardContent>
                {scheduleEvents.length > 0 ? (
                  <div className="space-y-3">
                    {scheduleEvents.map((event: any) => (
                      <div key={event.id} className="flex items-start gap-4 p-4 border rounded-lg">
                        <div className="text-center bg-blue-50 rounded-lg p-3 min-w-[80px]">
                          <p className="text-sm text-muted-foreground">
                            {new Date(event.event_date).toLocaleDateString('en-US', { month: 'short' })}
                          </p>
                          <p className="text-2xl font-bold text-blue-600">
                            {new Date(event.event_date).getDate()}
                          </p>
                        </div>
                        <div className="flex-1">
                          <h3 className="font-bold text-lg">{event.title}</h3>
                          {event.description && (
                            <p className="text-muted-foreground mt-1">{event.description}</p>
                          )}
                          <Badge variant="outline" className="mt-2">
                            {event.event_type}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground py-8">No scheduled events</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Documents Tab */}
          <TabsContent value="documents">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  Project Documents
                </CardTitle>
              </CardHeader>
              <CardContent>
                {documents.length > 0 ? (
                  <div className="space-y-3">
                    {documents.map((doc: any) => {
                      const latestRevision = doc.job_document_revisions?.[doc.job_document_revisions.length - 1];
                      return (
                        <div key={doc.id} className="flex items-center justify-between p-4 border rounded-lg">
                          <div className="flex items-center gap-3">
                            <FileText className="w-8 h-8 text-blue-600" />
                            <div>
                              <p className="font-medium">{doc.name}</p>
                              <p className="text-sm text-muted-foreground">
                                {doc.category} • Version {doc.current_version}
                              </p>
                            </div>
                          </div>
                          {latestRevision && (
                            <Button
                              onClick={() => window.open(latestRevision.file_url, '_blank')}
                              variant="outline"
                            >
                              <Download className="w-4 h-4 mr-2" />
                              Download
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground py-8">No documents available</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Photos Tab */}
          <TabsContent value="photos">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Image className="w-5 h-5" />
                  Project Photos
                </CardTitle>
              </CardHeader>
              <CardContent>
                {photos.length > 0 ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {photos.map((photo: any) => (
                      <div key={photo.id} className="group relative">
                        <img
                          src={photo.photo_url}
                          alt={photo.caption || 'Project photo'}
                          className="w-full h-48 object-cover rounded-lg cursor-pointer hover:opacity-90 transition"
                          onClick={() => window.open(photo.photo_url, '_blank')}
                        />
                        {photo.caption && (
                          <p className="text-sm text-muted-foreground mt-2">{photo.caption}</p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {new Date(photo.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground py-8">No photos available</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Emails Tab */}
          <TabsContent value="emails">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="w-5 h-5" />
                  Project Messages
                </CardTitle>
                <Button type="button" onClick={() => { setEmailSentInDialog(false); setShowEmailDialog(true); }}>
                  <Send className="w-4 h-4 mr-2" />
                  New Message
                </Button>
              </CardHeader>
              <CardContent>
                {emails.length > 0 ? (
                  <div className="space-y-4">
                    {emails.map((email: any) => (
                      <div 
                        key={email.id} 
                        className={`border rounded-lg p-4 ${
                          email.direction === 'sent' && !email.is_read ? 'bg-blue-50 border-blue-200' : ''
                        }`}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <Badge variant={email.direction === 'sent' ? 'default' : 'secondary'}>
                                {email.direction === 'sent' ? (
                                  <>
                                    <Inbox className="w-3 h-3 mr-1" />
                                    From Team
                                  </>
                                ) : (
                                  <>
                                    <Send className="w-3 h-3 mr-1" />
                                    You
                                  </>
                                )}
                              </Badge>
                              {email.direction === 'sent' && !email.is_read && (
                                <Badge variant="destructive">New</Badge>
                              )}
                            </div>
                            <h3 className="font-bold text-lg mt-2">{email.subject}</h3>
                            <p className="text-sm text-muted-foreground">
                              {email.from_name || email.from_email} • {new Date(email.email_date).toLocaleDateString()} at {new Date(email.email_date).toLocaleTimeString()}
                            </p>
                          </div>
                        </div>
                        <div className="mt-3">
                          {email.body_html ? (
                            <div 
                              className="prose prose-sm max-w-none"
                              dangerouslySetInnerHTML={{ __html: email.body_html }}
                            />
                          ) : (
                            <p className="whitespace-pre-wrap text-sm">{email.body_text}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <MessageSquare className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground mb-4">No messages yet</p>
                    <Button type="button" onClick={() => { setEmailSentInDialog(false); setShowEmailDialog(true); }}>
                      <Send className="w-4 h-4 mr-2" />
                      Send Your First Message
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Send Email Dialog */}
      <Dialog
        open={showEmailDialog}
        onOpenChange={(open) => {
          if (!open) setEmailSentInDialog(false);
          setShowEmailDialog(open);
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {emailSentInDialog ? (
                <>
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  Sent
                </>
              ) : (
                <>
                  <Send className="w-5 h-5" />
                  Send Message to Project Team
                </>
              )}
            </DialogTitle>
          </DialogHeader>
          {emailSentInDialog ? (
            <div className="py-6 text-center space-y-4">
              <p className="text-muted-foreground">Your message was sent to the project team. They may reply here in Messages.</p>
              <Button type="button" onClick={() => { setEmailSentInDialog(false); setShowEmailDialog(false); }}>
                Done
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <Label htmlFor="email-body">Message</Label>
                <Textarea
                  id="email-body"
                  value={emailBody}
                  onChange={(e) => setEmailBody(e.target.value)}
                  placeholder="Type your message here..."
                  rows={8}
                  className="mt-2"
                />
              </div>
              <div className="flex gap-2 pt-4">
                <Button
                  type="button"
                  onClick={() => sendEmailToJob().catch((err) => { console.error(err); toast.error(err?.message ?? 'Failed to send message'); })}
                  disabled={sendingEmail}
                  className="flex-1"
                >
                  {sendingEmail ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      Send Message
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowEmailDialog(false)}
                  disabled={sendingEmail}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
