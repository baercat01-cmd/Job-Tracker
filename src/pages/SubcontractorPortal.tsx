import { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  FileText,
  Calendar,
  Image,
  Download,
  LogOut,
  MapPin,
  Building2,
  ChevronRight,
  Briefcase,
  User,
  Lock,
  ClipboardList,
  Printer,
  Pencil,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { PWAInstallButton } from '@/components/ui/pwa-install-button';
import { loadProposalDataForQuote } from '@/lib/loadProposalDataForQuote';
import { buildProposalHtmlForPortal } from '@/lib/proposalPortalHtml';
import { isFieldRequestSheetName } from '@/lib/materialWorkbook';
import {
  Dialog,
  DialogContent,
  DialogFooter,
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
import { Textarea } from '@/components/ui/textarea';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

interface PortalUser {
  id: string;
  email: string;
  username: string;
  full_name: string;
  company_name: string | null;
}

interface JobAccess {
  id: string;
  job_id: string;
  can_view_schedule: boolean;
  can_view_documents: boolean;
  can_view_photos: boolean;
  can_view_financials: boolean;
  can_view_proposal?: boolean;
  can_view_materials?: boolean;
  can_edit_schedule?: boolean;
  notes: string | null;
}

type JobWithAccess = Record<string, unknown> & {
  id: string;
  access: JobAccess;
  documents: any[];
  scheduleEvents: any[];
  photos: any[];
  jobQuotes?: any[];
  mainQuote?: any | null;
  proposalData?: Awaited<ReturnType<typeof loadProposalDataForQuote>> | null;
  quoteStoredTotals?: { subtotal: number; tax: number; grandTotal: number } | null;
};

const EVENT_TYPES = [
  { value: 'material_order', label: 'Order deadline' },
  { value: 'material_delivery', label: 'Delivery' },
  { value: 'material_pickup', label: 'Pickup' },
  { value: 'material_pull', label: 'Pull from shop' },
  { value: 'material_order_reminder', label: 'Order reminder' },
  { value: 'task_deadline', label: 'Task deadline' },
  { value: 'subcontractor', label: 'Subcontractor' },
  { value: 'general', label: 'General' },
];

function normalizeAccess(raw: Record<string, unknown>): JobAccess {
  return {
    id: String(raw.id),
    job_id: String(raw.job_id),
    can_view_schedule: raw.can_view_schedule === true,
    can_view_documents: raw.can_view_documents === true,
    can_view_photos: raw.can_view_photos === true,
    can_view_financials: raw.can_view_financials === true,
    can_view_proposal: raw.can_view_proposal === true,
    can_view_materials: raw.can_view_materials === true,
    can_edit_schedule: raw.can_edit_schedule === true,
    notes: (raw.notes as string) ?? null,
  };
}

export default function SubcontractorPortal() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState<PortalUser | null>(null);
  const [loading, setLoading] = useState(true);

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);

  const [jobs, setJobs] = useState<JobWithAccess[]>([]);
  const [selectedJob, setSelectedJob] = useState<JobWithAccess | null>(null);
  const [proposalLoading, setProposalLoading] = useState(false);

  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<any | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editEventType, setEditEventType] = useState('general');
  const [savingEvent, setSavingEvent] = useState(false);

  useEffect(() => {
    checkAuthStatus();
  }, []);

  async function checkAuthStatus() {
    const storedUser = localStorage.getItem('subcontractor_portal_user');
    if (storedUser) {
      try {
        const user = JSON.parse(storedUser);
        setCurrentUser(user);
        setIsAuthenticated(true);
        await loadUserJobs(user.id);
      } catch {
        localStorage.removeItem('subcontractor_portal_user');
      }
    }
    setLoading(false);
  }

  async function handleLogin() {
    if (!loginEmail || !loginPassword) {
      toast.error('Please enter email and password');
      return;
    }

    setLoggingIn(true);
    try {
      const { data: users, error } = await supabase
        .from('portal_users')
        .select('*')
        .eq('email', loginEmail)
        .eq('user_type', 'subcontractor')
        .eq('is_active', true)
        .maybeSingle();

      if (error || !users) {
        toast.error('Invalid email or password');
        setLoggingIn(false);
        return;
      }

      if (users.password_hash !== loginPassword) {
        toast.error('Invalid email or password');
        setLoggingIn(false);
        return;
      }

      await supabase.from('portal_users').update({ last_login_at: new Date().toISOString() }).eq('id', users.id);

      const userData: PortalUser = {
        id: users.id,
        email: users.email,
        username: users.username,
        full_name: users.full_name,
        company_name: users.company_name,
      };

      localStorage.setItem('subcontractor_portal_user', JSON.stringify(userData));
      setCurrentUser(userData);
      setIsAuthenticated(true);

      await loadUserJobs(users.id);
      toast.success(`Welcome back, ${users.full_name}!`);
    } catch (error: unknown) {
      console.error('Login error:', error);
      toast.error('Login failed. Please try again.');
    } finally {
      setLoggingIn(false);
    }
  }

  const loadUserJobs = useCallback(async (userId: string): Promise<JobWithAccess[]> => {
    try {
      const { data: accessData, error: accessError } = await supabase
        .from('portal_job_access')
        .select(`*, jobs(*)`)
        .eq('portal_user_id', userId);

      if (accessError) throw accessError;

      const jobsWithData = await Promise.all(
        (accessData || []).map(async (row: Record<string, unknown>) => {
          const access = normalizeAccess(row);
          const job = row.jobs as Record<string, unknown>;
          const jobId = String(job.id);

          let documents: any[] = [];
          if (access.can_view_documents) {
            const { data: docsData } = await supabase
              .from('job_documents')
              .select(`*, job_document_revisions(*)`)
              .eq('job_id', jobId)
              .eq('visible_to_crew', true);
            documents = docsData || [];
          }

          let scheduleEvents: any[] = [];
          if (access.can_view_schedule) {
            const { data: scheduleData } = await supabase
              .from('calendar_events')
              .select('*')
              .eq('job_id', jobId)
              .order('event_date', { ascending: true });
            scheduleEvents = scheduleData || [];
          }

          let photos: any[] = [];
          if (access.can_view_photos) {
            const { data: photosData } = await supabase
              .from('photos')
              .select('*')
              .eq('job_id', jobId)
              .order('created_at', { ascending: false })
              .limit(50);
            photos = photosData || [];
          }

          let jobQuotes: any[] = [];
          if (access.can_view_proposal || access.can_view_materials) {
            const { data: quotesData } = await supabase
              .from('quotes')
              .select('*')
              .eq('job_id', jobId)
              .order('created_at', { ascending: false });
            jobQuotes = quotesData || [];
          }

          const mainQuote =
            jobQuotes.find((q: any) => !q.is_change_order_proposal) ?? jobQuotes[0] ?? null;

          return {
            ...job,
            access,
            documents,
            scheduleEvents,
            photos,
            jobQuotes,
            mainQuote,
            proposalData: null,
            quoteStoredTotals: null,
          } as JobWithAccess;
        })
      );

      setJobs(jobsWithData);
      return jobsWithData;
    } catch (error: unknown) {
      console.error('Error loading jobs:', error);
      toast.error('Failed to load your projects');
      return [];
    }
  }, []);

  useEffect(() => {
    const jobId = selectedJob?.id;
    const quoteId = selectedJob?.mainQuote?.id;
    const needProposal =
      selectedJob?.access.can_view_proposal === true || selectedJob?.access.can_view_materials === true;
    if (!jobId || !quoteId || !needProposal || !currentUser?.id) {
      setProposalLoading(false);
      return;
    }

    let cancelled = false;
    setProposalLoading(true);

    const taxExempt = !!selectedJob?.mainQuote?.tax_exempt;
    loadProposalDataForQuote(jobId, quoteId, taxExempt).then((data) => {
      if (cancelled) return;
      setSelectedJob((prev) => (prev && prev.id === jobId ? { ...prev, proposalData: data } : prev));
      setJobs((list) => list.map((j) => (j.id === jobId ? { ...j, proposalData: data } : j)));
      setProposalLoading(false);
    });

    supabase.rpc('get_quote_proposal_totals', { p_quote_id: quoteId }).then(({ data, error }) => {
      if (cancelled) return;
      if (error || !data || !Array.isArray(data) || data.length === 0) return;
      const row = data[0] as { subtotal?: number | null; tax?: number | null; grand_total?: number | null };
      const sub = row?.subtotal != null ? Number(row.subtotal) : NaN;
      const tax = row?.tax != null ? Number(row.tax) : 0;
      const grand = row?.grand_total != null ? Number(row.grand_total) : NaN;
      if (!Number.isFinite(sub) || !Number.isFinite(grand)) return;
      const totals = { subtotal: sub, tax: Number.isFinite(tax) ? tax : 0, grandTotal: grand };
      setSelectedJob((prev) => (prev && prev.id === jobId ? { ...prev, quoteStoredTotals: totals } : prev));
      setJobs((list) => list.map((j) => (j.id === jobId ? { ...j, quoteStoredTotals: totals } : j)));
    });

    return () => {
      cancelled = true;
    };
  }, [
    selectedJob?.id,
    selectedJob?.mainQuote?.id,
    currentUser?.id,
    selectedJob?.access.can_view_proposal,
    selectedJob?.access.can_view_materials,
  ]);

  const proposalHtml = useMemo(() => {
    if (!selectedJob?.proposalData || !selectedJob.mainQuote) return '';
    const showFin = selectedJob.access.can_view_financials === true;
    const showProposalOrMaterials =
      selectedJob.access.can_view_proposal === true || selectedJob.access.can_view_materials === true;
    const showMaterialItemsNoPrices = showProposalOrMaterials && !showFin;
    return buildProposalHtmlForPortal({
      job: {
        client_name: String(selectedJob.client_name ?? ''),
        address: String(selectedJob.address ?? ''),
        name: String(selectedJob.name ?? ''),
        customer_phone: selectedJob.customer_phone as string | undefined,
        description: (selectedJob.description as string) ?? undefined,
      },
      quote: selectedJob.mainQuote,
      proposalData: selectedJob.proposalData,
      showFinancial: showFin,
      showLineItemPrices: showFin,
      showSectionPrices: null,
      showMaterialItemsNoPrices,
      quoteStoredTotals: selectedJob.quoteStoredTotals ?? undefined,
    });
  }, [selectedJob]);

  function openEditEvent(ev: any) {
    if (!selectedJob?.access.can_edit_schedule) return;
    setEditingEvent(ev);
    setEditTitle(ev.title || '');
    setEditDescription(ev.description || '');
    const d = ev.event_date ? String(ev.event_date).slice(0, 10) : '';
    setEditDate(d);
    setEditEventType(ev.event_type || 'general');
    setScheduleDialogOpen(true);
  }

  async function saveScheduleEvent() {
    if (!currentUser || !selectedJob || !editingEvent?.id) return;
    setSavingEvent(true);
    try {
      const { data, error } = await supabase.rpc('subcontractor_update_calendar_event', {
        p_portal_user_id: currentUser.id,
        p_job_id: selectedJob.id,
        p_event_id: editingEvent.id,
        p_title: editTitle.trim(),
        p_description: editDescription.trim() || null,
        p_event_date: editDate || null,
        p_event_type: editEventType || null,
      });
      if (error) throw error;
      const result = data as { ok?: boolean; error?: string } | null;
      if (!result?.ok) {
        toast.error(result?.error === 'access_denied' ? 'You cannot edit the schedule for this job.' : 'Could not save event');
        return;
      }
      toast.success('Schedule updated');
      setScheduleDialogOpen(false);
      setEditingEvent(null);
      const refreshed = await loadUserJobs(currentUser.id);
      const jid = selectedJob.id;
      const updated = refreshed.find((j) => j.id === jid);
      if (updated) setSelectedJob(updated);
    } catch (e: unknown) {
      const msg = String((e as { message?: string })?.message ?? '');
      if (/function.*does not exist|42883|PGRST202/i.test(msg)) {
        toast.error('Schedule editing requires the latest database migration (subcontractor portal).');
      } else {
        toast.error(msg || 'Failed to save');
      }
    } finally {
      setSavingEvent(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem('subcontractor_portal_user');
    setCurrentUser(null);
    setIsAuthenticated(false);
    setJobs([]);
    setSelectedJob(null);
    toast.success('Logged out successfully');
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-lg text-slate-600">Loading…</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <Briefcase className="w-8 h-8 text-white" />
            </div>
            <CardTitle className="text-2xl">Subcontractor Portal</CardTitle>
            <p className="text-muted-foreground mt-2">Sign in to access your projects</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Email Address</Label>
              <div className="relative">
                <User className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                <Input
                  type="email"
                  placeholder="your@email.com"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                  className="pl-10"
                />
              </div>
            </div>
            <div>
              <Label>Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                <Input
                  type="password"
                  placeholder="Enter your password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                  className="pl-10"
                />
              </div>
            </div>
            <Button onClick={handleLogin} disabled={loggingIn} className="w-full">
              {loggingIn ? 'Signing in…' : 'Sign In'}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const tabCount =
    1 +
    (selectedJob.access.can_view_proposal ? 1 : 0) +
    (selectedJob.access.can_view_materials ? 1 : 0) +
    (selectedJob.access.can_view_schedule ? 1 : 0) +
    (selectedJob.access.can_view_documents ? 1 : 0) +
    (selectedJob.access.can_view_photos ? 1 : 0);

  const gridClass =
    tabCount <= 3
      ? 'grid-cols-3'
      : tabCount <= 4
        ? 'grid-cols-2 sm:grid-cols-4'
        : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6';

  if (selectedJob) {
    const matSheets = (selectedJob.proposalData?.materialSheets || []).filter(
      (s: any) => s.sheet_type !== 'change_order' && !isFieldRequestSheetName(s.sheet_name)
    );

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="bg-gradient-to-r from-blue-900 to-slate-900 text-white shadow-lg">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-4 min-w-0">
                <Button variant="ghost" size="sm" onClick={() => setSelectedJob(null)} className="text-white hover:bg-white/10 shrink-0">
                  ← Back
                </Button>
                <div className="min-w-0">
                  <h1 className="text-2xl sm:text-3xl font-bold truncate">{String(selectedJob.name)}</h1>
                  <p className="text-blue-100 mt-1 truncate">{String(selectedJob.client_name)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {selectedJob.access.can_view_proposal && proposalHtml && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="bg-white/10 border-white/30 text-white hover:bg-white/20"
                    onClick={() => {
                      const w = window.open('', '_blank');
                      if (w) {
                        w.document.write(proposalHtml);
                        w.document.close();
                        w.focus();
                        setTimeout(() => w.print(), 400);
                      }
                    }}
                  >
                    <Printer className="w-4 h-4 mr-1" />
                    Print
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={handleLogout} className="text-white hover:bg-white/10">
                  <LogOut className="w-4 h-4 mr-2" />
                  Sign Out
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Tabs defaultValue="overview">
            <TabsList className={`grid w-full ${gridClass} mb-6 h-auto gap-1`}>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              {selectedJob.access.can_view_proposal && (
                <TabsTrigger value="proposal">Proposal</TabsTrigger>
              )}
              {selectedJob.access.can_view_materials && (
                <TabsTrigger value="materials">Materials</TabsTrigger>
              )}
              {selectedJob.access.can_view_schedule && (
                <TabsTrigger value="schedule">Schedule</TabsTrigger>
              )}
              {selectedJob.access.can_view_documents && (
                <TabsTrigger value="documents">Documents</TabsTrigger>
              )}
              {selectedJob.access.can_view_photos && <TabsTrigger value="photos">Photos</TabsTrigger>}
            </TabsList>

            <TabsContent value="overview">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="w-5 h-5" />
                    Project Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground flex items-center gap-2">
                        <MapPin className="w-4 h-4" />
                        Address
                      </p>
                      <p className="font-medium mt-1">{String(selectedJob.address ?? '')}</p>
                    </div>
                    {selectedJob.description && (
                      <div>
                        <p className="text-sm text-muted-foreground">Description</p>
                        <p className="font-medium mt-1">{String(selectedJob.description)}</p>
                      </div>
                    )}
                  </div>
                  {selectedJob.access.notes && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <p className="text-sm font-medium text-blue-900 mb-2">Notes from the office</p>
                      <p className="text-blue-800">{selectedJob.access.notes}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {selectedJob.access.can_view_proposal && (
              <TabsContent value="proposal">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <ClipboardList className="w-5 h-5" />
                      Proposal
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {proposalLoading ? (
                      <p className="text-muted-foreground py-12 text-center">Loading proposal…</p>
                    ) : !selectedJob.mainQuote ? (
                      <p className="text-muted-foreground py-8 text-center">No proposal is linked to this job yet.</p>
                    ) : proposalHtml ? (
                      <iframe
                        title="Proposal preview"
                        className="w-full min-h-[70vh] border rounded-md bg-white"
                        srcDoc={proposalHtml}
                        sandbox="allow-same-origin allow-scripts allow-modals allow-popups"
                      />
                    ) : (
                      <p className="text-muted-foreground py-8 text-center">Could not build proposal preview.</p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            )}

            {selectedJob.access.can_view_materials && (
              <TabsContent value="materials">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="w-5 h-5" />
                      Material sheets
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {proposalLoading ? (
                      <p className="text-muted-foreground py-12 text-center">Loading sheets…</p>
                    ) : matSheets.length === 0 ? (
                      <p className="text-muted-foreground py-8 text-center">No material sheets for this proposal.</p>
                    ) : (
                      <Accordion type="multiple" className="w-full">
                        {matSheets.map((sheet: any) => (
                          <AccordionItem key={sheet.id} value={sheet.id}>
                            <AccordionTrigger className="text-left">
                              <span className="font-medium">{sheet.sheet_name || 'Sheet'}</span>
                              {selectedJob.access.can_view_financials && sheet._computedTotal != null && (
                                <span className="ml-2 text-sm text-muted-foreground">
                                  ${Number(sheet._computedTotal).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                </span>
                              )}
                            </AccordionTrigger>
                            <AccordionContent>
                              {sheet.description && (
                                <p className="text-sm text-muted-foreground mb-3 whitespace-pre-wrap">{sheet.description}</p>
                              )}
                              <div className="border rounded-md overflow-hidden">
                                <table className="w-full text-sm">
                                  <thead className="bg-muted/50">
                                    <tr>
                                      <th className="text-left p-2">Item</th>
                                      <th className="text-right p-2">Qty</th>
                                      {selectedJob.access.can_view_financials && (
                                        <th className="text-right p-2">Price</th>
                                      )}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {(sheet.items || [])
                                      .filter((i: any) => !i.excluded)
                                      .map((item: any) => (
                                        <tr key={item.id} className="border-t">
                                          <td className="p-2">
                                            <span className="text-muted-foreground">{item.category ? `${item.category} · ` : ''}</span>
                                            {item.description || item.name || '—'}
                                          </td>
                                          <td className="p-2 text-right">{item.quantity ?? '—'}</td>
                                          {selectedJob.access.can_view_financials && (
                                            <td className="p-2 text-right">
                                              {item.extended_price != null
                                                ? `$${Number(item.extended_price).toLocaleString()}`
                                                : '—'}
                                            </td>
                                          )}
                                        </tr>
                                      ))}
                                  </tbody>
                                </table>
                              </div>
                            </AccordionContent>
                          </AccordionItem>
                        ))}
                      </Accordion>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            )}

            {selectedJob.access.can_view_schedule && (
              <TabsContent value="schedule">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Calendar className="w-5 h-5" />
                      Schedule
                      {selectedJob.access.can_edit_schedule && (
                        <Badge variant="secondary" className="ml-2">
                          You can edit
                        </Badge>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {selectedJob.scheduleEvents.length > 0 ? (
                      <div className="space-y-3">
                        {selectedJob.scheduleEvents.map((event: any) => (
                          <div key={event.id} className="flex items-start gap-4 p-4 border rounded-lg">
                            <div className="text-center bg-blue-50 rounded-lg p-3 min-w-[80px]">
                              <p className="text-sm text-muted-foreground">
                                {new Date(event.event_date).toLocaleDateString('en-US', { month: 'short' })}
                              </p>
                              <p className="text-2xl font-bold text-blue-600">
                                {new Date(event.event_date).getDate()}
                              </p>
                            </div>
                            <div className="flex-1 min-w-0">
                              <h3 className="font-bold text-lg">{event.title}</h3>
                              {event.description && (
                                <p className="text-muted-foreground mt-1 whitespace-pre-wrap">{event.description}</p>
                              )}
                              <Badge variant="outline" className="mt-2">
                                {event.event_type}
                              </Badge>
                            </div>
                            {selectedJob.access.can_edit_schedule && (
                              <Button size="sm" variant="outline" onClick={() => openEditEvent(event)}>
                                <Pencil className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-center text-muted-foreground py-8">No scheduled events</p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            )}

            {selectedJob.access.can_view_documents && (
              <TabsContent value="documents">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="w-5 h-5" />
                      Documents
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {selectedJob.documents.length > 0 ? (
                      <div className="space-y-3">
                        {selectedJob.documents.map((doc: any) => {
                          const revs = doc.job_document_revisions;
                          const latestRevision = Array.isArray(revs) ? revs[revs.length - 1] : undefined;
                          return (
                            <div key={doc.id} className="flex items-center justify-between p-4 border rounded-lg gap-4">
                              <div className="flex items-center gap-3 min-w-0">
                                <FileText className="w-8 h-8 text-blue-600 shrink-0" />
                                <div className="min-w-0">
                                  <p className="font-medium truncate">{doc.name}</p>
                                  <p className="text-sm text-muted-foreground">
                                    {doc.category} · v{doc.current_version}
                                  </p>
                                </div>
                              </div>
                              {latestRevision?.file_url && (
                                <Button onClick={() => window.open(latestRevision.file_url, '_blank')} variant="outline" className="shrink-0">
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
            )}

            {selectedJob.access.can_view_photos && (
              <TabsContent value="photos">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Image className="w-5 h-5" />
                      Photos
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {selectedJob.photos.length > 0 ? (
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {selectedJob.photos.map((photo: any) => (
                          <div key={photo.id} className="group relative">
                            <img
                              src={photo.photo_url}
                              alt={photo.caption || 'Project photo'}
                              className="w-full h-48 object-cover rounded-lg cursor-pointer hover:opacity-90 transition"
                              onClick={() => window.open(photo.photo_url, '_blank')}
                            />
                            {photo.caption && <p className="text-sm text-muted-foreground mt-2">{photo.caption}</p>}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-center text-muted-foreground py-8">No photos available</p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            )}
          </Tabs>
        </div>

        <Dialog open={scheduleDialogOpen} onOpenChange={setScheduleDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit event</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div>
                <Label>Title</Label>
                <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
              </div>
              <div>
                <Label>Date</Label>
                <Input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} />
              </div>
              <div>
                <Label>Type</Label>
                <Select value={editEventType} onValueChange={setEditEventType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EVENT_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Description</Label>
                <Textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} rows={4} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setScheduleDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={saveScheduleEvent} disabled={savingEvent || !editTitle.trim()}>
                {savingEvent ? 'Saving…' : 'Save'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="bg-gradient-to-r from-blue-900 to-slate-900 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">Your Projects</h1>
              <p className="text-blue-100 mt-1">
                Welcome, {currentUser?.full_name}
                {currentUser?.company_name && ` · ${currentUser.company_name}`}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <PWAInstallButton />
              <Button variant="outline" onClick={handleLogout} className="bg-white/10 hover:bg-white/20 text-white border-white/30">
                <LogOut className="w-4 h-4 mr-2" />
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {jobs.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12">
              <Briefcase className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
              <h2 className="text-xl font-semibold mb-2">No Projects Assigned</h2>
              <p className="text-muted-foreground">Ask your project manager to grant access to a job.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold mb-4">Assigned Projects ({jobs.length})</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {jobs.map((job) => (
                <Card
                  key={job.id}
                  className="hover:shadow-lg transition-shadow cursor-pointer border-2"
                  onClick={() => setSelectedJob(job)}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <CardTitle className="flex items-center gap-2">
                          <Building2 className="w-5 h-5 text-blue-600 shrink-0" />
                          <span className="truncate">{String(job.name)}</span>
                        </CardTitle>
                        <p className="text-sm text-muted-foreground mt-1 truncate">
                          <MapPin className="w-3 h-3 inline mr-1" />
                          {String(job.address ?? '')}
                        </p>
                      </div>
                      <Badge variant={job.status === 'active' ? 'default' : 'secondary'}>{String(job.status ?? '')}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex flex-wrap gap-2">
                      {job.access.can_view_proposal && (
                        <Badge variant="outline" className="bg-amber-50 text-amber-900">
                          <ClipboardList className="w-3 h-3 mr-1" />
                          Proposal
                        </Badge>
                      )}
                      {job.access.can_view_materials && (
                        <Badge variant="outline" className="bg-teal-50 text-teal-900">
                          <FileText className="w-3 h-3 mr-1" />
                          Materials
                        </Badge>
                      )}
                      {job.access.can_view_schedule && (
                        <Badge variant="outline" className="bg-blue-50 text-blue-700">
                          <Calendar className="w-3 h-3 mr-1" />
                          Schedule
                        </Badge>
                      )}
                      {job.access.can_view_documents && (
                        <Badge variant="outline" className="bg-green-50 text-green-700">
                          <FileText className="w-3 h-3 mr-1" />
                          {job.documents.length} docs
                        </Badge>
                      )}
                      {job.access.can_view_photos && (
                        <Badge variant="outline" className="bg-purple-50 text-purple-700">
                          <Image className="w-3 h-3 mr-1" />
                          {job.photos.length} photos
                        </Badge>
                      )}
                    </div>

                    <Button variant="outline" className="w-full">
                      Open
                      <ChevronRight className="w-4 h-4 ml-2" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
