import { useState, useEffect, useRef } from 'react';
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
  Building2,
  FileSpreadsheet,
  ChevronRight,
  Briefcase,
  Send,
  MessageSquare,
  Inbox,
  Copy,
  LayoutDashboard,
  Printer
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
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

interface Job {
  id: string;
  name: string;
  client_name: string;
  address: string;
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

// Omit show_line_item_prices so portal works when PostgREST schema cache is stale (PGRST204)
const CUSTOMER_PORTAL_ACCESS_SELECT =
  'id,job_id,customer_identifier,access_token,customer_name,customer_email,customer_phone,is_active,expires_at,last_accessed_at,created_by,created_at,updated_at,show_proposal,show_payments,show_schedule,show_documents,show_photos,show_financial_summary,custom_message';

export default function CustomerPortal() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');
  
  const [loading, setLoading] = useState(true);
  const [validToken, setValidToken] = useState(false);
  const [customerInfo, setCustomerInfo] = useState<any>(null);
  const [jobData, setJobData] = useState<any>(null);

  useEffect(() => {
    if (token) {
      validateAndLoadData();
    } else {
      setLoading(false);
      toast.error('No access token provided');
    }
  }, [token]);

  async function validateAndLoadData() {
    if (!token) return;

    try {
      // Validate token
      const { data: accessData, error: accessError } = await supabase
        .from('customer_portal_access')
        .select(CUSTOMER_PORTAL_ACCESS_SELECT)
        .eq('access_token', token)
        .eq('is_active', true)
        .maybeSingle();

      if (accessError || !accessData) {
        toast.error('Invalid or expired access link');
        setLoading(false);
        return;
      }

      // Check expiration
      if (accessData.expires_at && new Date(accessData.expires_at) < new Date()) {
        toast.error('This access link has expired');
        setLoading(false);
        return;
      }

      setValidToken(true);
      setCustomerInfo(accessData);

      // Update last accessed time
      await supabase
        .from('customer_portal_access')
        .update({ last_accessed_at: new Date().toISOString() })
        .eq('id', accessData.id);

      // Load data for the customer (use job from link when set, else find by customer)
      await loadCustomerData(accessData);
    } catch (error: any) {
      console.error('Error validating token:', error);
      toast.error('Failed to load portal data');
      setLoading(false);
    }
  }

  async function loadCustomerData(accessData: any) {
    try {
      let job: any = null;
      if (accessData.job_id) {
        const { data: jobRow, error: jobError } = await supabase
          .from('jobs')
          .select('*')
          .eq('id', accessData.job_id)
          .maybeSingle();
        if (!jobError && jobRow) job = jobRow;
      }
      if (!job) {
        const { data: jobsData, error: jobsError } = await supabase
          .from('jobs')
          .select('*')
          .ilike('client_name', `%${accessData.customer_name || accessData.customer_identifier || ''}%`)
          .order('created_at', { ascending: false });
        if (jobsError || !jobsData?.length) {
          toast.error('No projects found for your account');
          setLoading(false);
          return;
        }
        job = jobsData[0];
      }

      // Load all quotes (proposals) for this job so customer can switch if multiple
      const { data: quotesData } = await supabase
        .from('quotes')
        .select('*')
        .eq('job_id', job.id)
        .order('created_at', { ascending: false });
      const jobQuotes = quotesData || [];
      const quoteData = jobQuotes[0] ?? null;

      // Load payments
      const { data: paymentsData } = await supabase
        .from('customer_payments')
        .select('*')
        .eq('job_id', job.id)
        .order('payment_date', { ascending: false });

      // Load documents
      const { data: documentsData } = await supabase
        .from('job_documents')
        .select(`
          *,
          job_document_revisions(*)
        `)
        .eq('job_id', job.id)
        .eq('visible_to_crew', true);

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

      // Load emails for this job
      const { data: emailsData } = await supabase
        .from('job_emails')
        .select('*')
        .eq('job_id', job.id)
        .order('email_date', { ascending: false })
        .limit(100);

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
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="text-center text-2xl text-destructive">Access Denied</CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-muted-foreground mb-4">
              The access link you're using is invalid or has expired. Please contact your project manager for a new link.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!jobData) {
    return null; // Still loading
  }

  // Show job detail view directly
  return <JobDetailView jobData={jobData} customerInfo={customerInfo} />;
}

// Job Detail View Component
function JobDetailView({ jobData, customerInfo }: { jobData: any; customerInfo: any }) {
  const { job, quote, jobQuotes = [], payments, documents, photos, scheduleEvents, emails, viewerLinks = [], totalPaid } = jobData;
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(quote?.id ?? null);
  const selectedQuote = jobQuotes.find((q: any) => q.id === selectedQuoteId) ?? jobQuotes[0] ?? quote;
  const [proposalData, setProposalData] = useState<any>(null);
  const [proposalDataLoading, setProposalDataLoading] = useState(false);
  const proposalDataCacheRef = useRef<Record<string, any>>({});
  const showFinancial = !!customerInfo?.show_financial_summary;
  /** When true, show $ on each line; when false (default), only show total / tax / grand total at bottom */
  const showLineItemPrices = customerInfo?.show_line_item_prices === true;
  const showProposal = customerInfo?.show_proposal !== false;
  const showPayments = customerInfo?.show_payments !== false;
  const showSchedule = customerInfo?.show_schedule !== false;
  const showDocuments = customerInfo?.show_documents !== false;
  const showPhotos = customerInfo?.show_photos !== false;
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);

  async function sendEmailToJob() {
    if (!emailSubject.trim() || !emailBody.trim()) {
      toast.error('Please enter both subject and message');
      return;
    }

    setSendingEmail(true);

    try {
      // Create email record in job_emails table
      const { error } = await supabase
        .from('job_emails')
        .insert({
          job_id: job.id,
          message_id: `customer-${Date.now()}-${Math.random().toString(36).substring(7)}`,
          subject: emailSubject,
          from_email: customerInfo.customer_email || '',
          from_name: customerInfo.customer_name,
          to_emails: ['office@company.com'], // This would be your office email
          body_text: emailBody,
          email_date: new Date().toISOString(),
          direction: 'received',
          is_read: false,
        });

      if (error) throw error;

      toast.success('Message sent to project team');
      setShowEmailDialog(false);
      setEmailSubject('');
      setEmailBody('');

      // Reload emails to show the new one
      const { data: updatedEmails } = await supabase
        .from('job_emails')
        .select('*')
        .eq('job_id', job.id)
        .order('email_date', { ascending: false })
        .limit(100);

      jobData.emails = updatedEmails || [];
    } catch (error: any) {
      console.error('Error sending email:', error);
      toast.error('Failed to send message');
    } finally {
      setSendingEmail(false);
    }
  }

  async function loadProposalDataForQuote(jobId: string, quoteId: string | null, taxExempt: boolean) {
    try {
      // Workbook: quote-specific first, then legacy (quote_id null)
      let workbookData: { id: string } | null = null;
      if (quoteId) {
        const { data: wb } = await supabase
          .from('material_workbooks')
          .select('id')
          .eq('job_id', jobId)
          .eq('quote_id', quoteId)
          .eq('status', 'working')
          .maybeSingle();
        workbookData = wb ?? null;
      }
      if (!workbookData) {
        const { data: wb } = await supabase
          .from('material_workbooks')
          .select('id')
          .eq('job_id', jobId)
          .is('quote_id', null)
          .eq('status', 'working')
          .maybeSingle();
        workbookData = wb ?? null;
      }

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

      // Custom rows: quote-specific + job-level (quote_id null), merged and sorted
      const [quoteRowsRes, jobRowsRes] = await Promise.all([
        quoteId
          ? supabase.from('custom_financial_rows').select('*, custom_financial_row_items(*)').eq('job_id', jobId).eq('quote_id', quoteId).order('order_index')
          : { data: [] as any[] },
        supabase.from('custom_financial_rows').select('*, custom_financial_row_items(*)').eq('job_id', jobId).is('quote_id', null).order('order_index'),
      ]);
      const quoteRows = quoteRowsRes.data || [];
      const jobRows = jobRowsRes.data || [];
      const customRowsData = [...quoteRows, ...jobRows].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));

      // Subcontractor estimates: same pattern
      const [quoteSubsRes, jobSubsRes] = await Promise.all([
        quoteId
          ? supabase.from('subcontractor_estimates').select('*, subcontractor_estimate_line_items(*)').eq('job_id', jobId).eq('quote_id', quoteId).order('order_index')
          : { data: [] as any[] },
        supabase.from('subcontractor_estimates').select('*, subcontractor_estimate_line_items(*)').eq('job_id', jobId).is('quote_id', null).order('order_index'),
      ]);
      const quoteSubs = quoteSubsRes.data || [];
      const jobSubs = jobSubsRes.data || [];
      const subEstimatesData = [...quoteSubs, ...jobSubs].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));

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

      const tax = taxExempt ? 0 : subtotal * TAX_RATE;
      const grandTotal = taxExempt ? subtotal : subtotal + tax;

      return {
        materialSheets,
        customRows: customRowsData,
        subcontractorEstimates: subEstimatesData,
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

  useEffect(() => {
    if (!job?.id || !selectedQuoteId) {
      setProposalData(null);
      return;
    }
    const cacheKey = selectedQuoteId;
    if (proposalDataCacheRef.current[cacheKey]) {
      setProposalData(proposalDataCacheRef.current[cacheKey]);
      return;
    }
    let cancelled = false;
    setProposalDataLoading(true);
    const taxExempt = !!selectedQuote?.tax_exempt;
    loadProposalDataForQuote(job.id, selectedQuoteId, taxExempt).then((data) => {
      if (cancelled) return;
      proposalDataCacheRef.current[cacheKey] = data;
      setProposalData(data);
      setProposalDataLoading(false);
    });
    return () => { cancelled = true; };
  }, [job?.id, selectedQuoteId, selectedQuote?.tax_exempt]);

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

  const viewOptions = [
    { value: 'overview', label: 'Overview', icon: LayoutDashboard },
    ...(showPayments ? [{ value: 'payments' as const, label: 'Payments', icon: DollarSign }] : []),
    ...(showSchedule ? [{ value: 'schedule' as const, label: 'Schedule', icon: Calendar }] : []),
    ...(showDocuments ? [{ value: 'documents' as const, label: 'Documents', icon: FileSpreadsheet }] : []),
    ...(showPhotos ? [{ value: 'photos' as const, label: 'Photos', icon: Image }] : []),
    { value: 'emails' as const, label: 'Messages', icon: Mail },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header: black, gold, dark green – matches portal settings preview */}
      <div className="bg-gradient-to-r from-zinc-900 via-emerald-950 to-zinc-900 text-white shadow-xl border-b-2 border-amber-500/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-3xl font-bold text-amber-400">{job.name}</h1>
                {jobQuotes.length > 1 ? (
                  <Select value={selectedQuoteId ?? ''} onValueChange={(v) => setSelectedQuoteId(v || null)}>
                    <SelectTrigger className="w-[180px] bg-amber-500/20 text-amber-300 border-amber-500/50">
                      <SelectValue placeholder="Select proposal" />
                    </SelectTrigger>
                    <SelectContent>
                      {jobQuotes.map((q: any) => (
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

          {/* Overview Tab – order matches portal settings: custom message, drawings, proposal, project info */}
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
            {/* Drawings & 3D Views (viewer links) */}
            {viewerLinks.length > 0 && (
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

            {/* Project Proposal (visibility: Proposal + Show final price from portal settings) */}
            {showProposal && (
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
                      onClick={() => window.print()}
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
                        {/* Material sheets — section name only; prices hidden unless showLineItemPrices */}
                        {(proposalData.materialSheets || []).map((sheet: any) => {
                          const itemsTotal = (sheet.items || []).reduce((s: number, item: any) => s + ((item.price_per_unit ?? item.cost_per_unit ?? 0) * (item.quantity ?? 0)), 0);
                          const sheetTotal = itemsTotal + (sheet.laborTotal ?? 0) + (sheet.sheetLineItemsTotal ?? 0);
                          return (
                            <div key={sheet.id} className="border rounded-lg px-4 py-3 flex items-center justify-between gap-4">
                              <h3 className="font-semibold text-base">{sheet.sheet_name}</h3>
                              {showFinancial && showLineItemPrices && sheetTotal > 0 && (
                                <p className="text-base font-bold text-emerald-700 shrink-0">
                                  ${sheetTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                </p>
                              )}
                            </div>
                          );
                        })}

                        {/* Custom rows — description/category only; prices hidden unless showLineItemPrices */}
                        {(proposalData.customRows || []).map((row: any) => {
                          const lineItems = (row.custom_financial_row_items || [])
                            .slice()
                            .sort((a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0));
                          return (
                            <div key={row.id} className="border rounded-lg px-4 py-3 flex items-start justify-between gap-4">
                              <div className="min-w-0 flex-1">
                                <h3 className="font-semibold text-base">{row.description || row.category}</h3>
                                {lineItems.length > 0 && (
                                  <ul className="text-sm text-muted-foreground mt-1.5 space-y-0.5 list-disc list-inside">
                                    {lineItems.map((item: any) => (
                                      <li key={item.id}>{item.description}</li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                              {showFinancial && showLineItemPrices && (
                                <p className="text-base font-bold text-emerald-700 shrink-0">
                                  ${(row.selling_price ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                </p>
                              )}
                            </div>
                          );
                        })}

                        {/* Subcontractors — company name + scope */}
                        {(proposalData.subcontractorEstimates || []).map((est: any) => (
                          <div key={est.id} className="border rounded-lg px-4 py-3">
                            <h3 className="font-semibold text-base">{est.company_name}</h3>
                            {est.scope_of_work && (
                              <p className="text-sm text-muted-foreground mt-1">{est.scope_of_work}</p>
                            )}
                          </div>
                        ))}

                        {/* Totals — only shown when showFinancial is enabled */}
                        {showFinancial && proposalData.totals && (
                          <div className="border-t-2 pt-4 space-y-2">
                            <div className="flex justify-between text-lg">
                              <span className="font-medium">Subtotal:</span>
                              <span>${proposalData.totals.subtotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                            </div>
                            {selectedQuote?.tax_exempt ? (
                              <div className="flex items-center gap-2 text-lg text-amber-700">
                                <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
                                <span className="font-medium">Tax exempt</span>
                              </div>
                            ) : (
                              <div className="flex justify-between text-lg">
                                <span className="font-medium">Tax (7%):</span>
                                <span>${proposalData.totals.tax.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                              </div>
                            )}
                            <div className="flex justify-between items-center text-2xl font-bold pt-2 border-t">
                              <span>Grand Total:</span>
                              <span className="text-emerald-700">
                                ${proposalData.totals.grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                              </span>
                            </div>
                          </div>
                        )}
                      </>
                    ) : null}
                  </CardContent>
                </Card>
              </>
            )}

            {/* Project notes — only shown when there's no proposal (avoids duplicating description that's already in proposal sections) */}
            {!showProposal && job.notes && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="w-5 h-5" />
                    Project Notes
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="whitespace-pre-wrap">{job.notes}</p>
                </CardContent>
              </Card>
            )}
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
                <Button onClick={() => setShowEmailDialog(true)}>
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
                    <Button onClick={() => setShowEmailDialog(true)}>
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
      <Dialog open={showEmailDialog} onOpenChange={setShowEmailDialog}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="w-5 h-5" />
              Send Message to Project Team
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="email-subject">Subject</Label>
              <Input
                id="email-subject"
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                placeholder="e.g., Question about project schedule"
                className="mt-2"
              />
            </div>
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
                onClick={sendEmailToJob} 
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
        </DialogContent>
      </Dialog>
    </div>
  );
}
