import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Building2, Calendar, ClipboardList, FileText, Image, MapPin } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { loadProposalDataForQuote } from '@/lib/loadProposalDataForQuote';
import { buildProposalHtmlForPortal } from '@/lib/proposalPortalHtml';
import { isFieldRequestSheetName } from '@/lib/materialWorkbook';
import { fetchPortalJobAccessRowsForSubcontractor } from '@/lib/portalJobAccess';

interface PortalUser {
  id: string;
  full_name: string;
  company_name: string | null;
  is_active: boolean;
}

interface JobAccess {
  id: string;
  job_id: string;
  can_view_schedule: boolean;
  can_view_documents: boolean;
  can_view_photos: boolean;
  can_view_proposal?: boolean;
  can_view_materials?: boolean;
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
};

function normalizeAccess(raw: Record<string, unknown>): JobAccess {
  return {
    id: String(raw.id),
    job_id: String(raw.job_id),
    can_view_schedule: raw.can_view_schedule === true,
    can_view_documents: raw.can_view_documents === true,
    can_view_photos: raw.can_view_photos === true,
    can_view_proposal: raw.can_view_proposal === true,
    can_view_materials: raw.can_view_materials === true,
    notes: (raw.notes as string) ?? null,
  };
}

export default function SubcontractorPortal() {
  const [searchParams] = useSearchParams();
  const subId = (searchParams.get('sub') || '').trim();

  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [user, setUser] = useState<PortalUser | null>(null);
  const [jobs, setJobs] = useState<JobWithAccess[]>([]);
  const [selectedJob, setSelectedJob] = useState<JobWithAccess | null>(null);
  const [proposalLoading, setProposalLoading] = useState(false);

  const loadJobsForSub = useCallback(async (portalUserId: string): Promise<JobWithAccess[]> => {
    const { rows: accessList, error: accessErr } = await fetchPortalJobAccessRowsForSubcontractor(
      supabase,
      portalUserId
    );
    if (accessErr) throw accessErr;

    const rows = await Promise.all(
      accessList.map(async (row: Record<string, unknown>) => {
        const access = normalizeAccess(row);
        const job = row.jobs as Record<string, unknown> | null | undefined;
        if (!job || job.id == null) {
          return null;
        }
        const jobId = String(job.id);

        let documents: any[] = [];
        if (access.can_view_documents) {
          const { data } = await supabase
            .from('job_documents')
            .select('*, job_document_revisions(*)')
            .eq('job_id', jobId)
            .eq('visible_to_crew', true);
          documents = data || [];
        }

        let scheduleEvents: any[] = [];
        if (access.can_view_schedule) {
          const { data } = await supabase
            .from('calendar_events')
            .select('*')
            .eq('job_id', jobId)
            .order('event_date', { ascending: true });
          scheduleEvents = data || [];
        }

        let photos: any[] = [];
        if (access.can_view_photos) {
          const { data } = await supabase
            .from('photos')
            .select('*')
            .eq('job_id', jobId)
            .order('created_at', { ascending: false })
            .limit(80);
          photos = data || [];
        }

        let jobQuotes: any[] = [];
        if (access.can_view_proposal || access.can_view_materials) {
          const { data } = await supabase
            .from('quotes')
            .select('*')
            .eq('job_id', jobId)
            .order('created_at', { ascending: false });
          jobQuotes = data || [];
        }

        const mainQuote = jobQuotes.find((q: any) => !q.is_change_order_proposal) ?? jobQuotes[0] ?? null;
        return {
          ...job,
          access,
          documents,
          scheduleEvents,
          photos,
          jobQuotes,
          mainQuote,
          proposalData: null,
        } as JobWithAccess;
      })
    );

    const validRows = rows.filter((r): r is JobWithAccess => r != null);
    setJobs(validRows);
    return validRows;
  }, []);

  useEffect(() => {
    async function boot() {
      if (!subId) {
        setAccessDenied(true);
        setLoading(false);
        return;
      }
      try {
        const { data: subFromSubs, error: subsErr } = await supabase
          .from('subcontractors')
          .select('id, name, company_name, active')
          .eq('id', subId)
          .eq('active', true)
          .maybeSingle();

        if (!subsErr && subFromSubs) {
          setUser({
            id: String(subFromSubs.id),
            full_name: String(subFromSubs.name ?? ''),
            company_name: subFromSubs.company_name ?? null,
            is_active: subFromSubs.active !== false,
          });
          await loadJobsForSub(subId);
          return;
        }

        const { data: subFromPortalUsers, error } = await supabase
          .from('portal_users')
          .select('id, full_name, company_name, is_active')
          .eq('id', subId)
          .eq('user_type', 'subcontractor')
          .eq('is_active', true)
          .maybeSingle();
        if (error || !subFromPortalUsers) {
          setAccessDenied(true);
          setLoading(false);
          return;
        }
        setUser(subFromPortalUsers as PortalUser);
        await loadJobsForSub(subId);
      } catch (e) {
        console.error(e);
        toast.error('Could not load subcontractor portal');
        setAccessDenied(true);
      } finally {
        setLoading(false);
      }
    }
    void boot();
  }, [subId, loadJobsForSub]);

  useEffect(() => {
    const jobId = selectedJob?.id;
    const quoteId = selectedJob?.mainQuote?.id;
    const showProposalOrMaterials =
      selectedJob?.access.can_view_proposal === true || selectedJob?.access.can_view_materials === true;
    if (!jobId || !quoteId || !showProposalOrMaterials) {
      setProposalLoading(false);
      return;
    }
    let cancelled = false;
    setProposalLoading(true);
    loadProposalDataForQuote(jobId, quoteId, !!selectedJob?.mainQuote?.tax_exempt).then((data) => {
      if (cancelled) return;
      setSelectedJob((prev) => (prev && prev.id === jobId ? { ...prev, proposalData: data } : prev));
      setProposalLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedJob?.id, selectedJob?.mainQuote?.id, selectedJob?.access.can_view_proposal, selectedJob?.access.can_view_materials]);

  const proposalHtml = useMemo(() => {
    if (!selectedJob?.proposalData || !selectedJob.mainQuote) return '';
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
      // Force no-pricing view for subcontractor link
      showFinancial: false,
      showLineItemPrices: false,
      showSectionPrices: null,
      showMaterialItemsNoPrices: true,
      quoteStoredTotals: undefined,
    });
  }, [selectedJob]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading subcontractor portal…</div>;
  }

  if (accessDenied || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-lg w-full">
          <CardHeader>
            <CardTitle>Invalid subcontractor link</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Ask your office manager to send the current subcontractor link.
          </CardContent>
        </Card>
      </div>
    );
  }

  if (selectedJob) {
    const matSheets = (selectedJob.proposalData?.materialSheets || []).filter(
      (s: any) => s.sheet_type !== 'change_order' && !isFieldRequestSheetName(s.sheet_name)
    );
    const tabCount =
      1 +
      (selectedJob.access.can_view_proposal ? 1 : 0) +
      (selectedJob.access.can_view_materials ? 1 : 0) +
      (selectedJob.access.can_view_schedule ? 1 : 0) +
      (selectedJob.access.can_view_documents ? 1 : 0) +
      (selectedJob.access.can_view_photos ? 1 : 0);
    const gridClass =
      tabCount <= 3 ? 'grid-cols-3' : tabCount <= 4 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6';

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="bg-gradient-to-r from-blue-900 to-slate-900 text-white shadow-lg">
          <div className="max-w-7xl mx-auto px-4 py-6">
            <button className="text-sm underline mb-2" onClick={() => setSelectedJob(null)}>Back to jobs</button>
            <h1 className="text-2xl font-bold">{String(selectedJob.name)}</h1>
            <p className="text-blue-100">{String(selectedJob.client_name ?? '')}</p>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-4 py-6">
          <Tabs defaultValue="overview">
            <TabsList className={`grid w-full ${gridClass} mb-6`}>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              {selectedJob.access.can_view_proposal && <TabsTrigger value="proposal">Proposal</TabsTrigger>}
              {selectedJob.access.can_view_materials && <TabsTrigger value="materials">Materials</TabsTrigger>}
              {selectedJob.access.can_view_schedule && <TabsTrigger value="schedule">Schedule</TabsTrigger>}
              {selectedJob.access.can_view_documents && <TabsTrigger value="documents">Documents</TabsTrigger>}
              {selectedJob.access.can_view_photos && <TabsTrigger value="photos">Photos</TabsTrigger>}
            </TabsList>
            <TabsContent value="overview">
              <Card>
                <CardHeader><CardTitle>Project Information</CardTitle></CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">Address</p>
                  <p>{String(selectedJob.address ?? '')}</p>
                  {selectedJob.access.notes && <p className="mt-4 text-sm">{selectedJob.access.notes}</p>}
                </CardContent>
              </Card>
            </TabsContent>
            {selectedJob.access.can_view_proposal && (
              <TabsContent value="proposal">
                <Card><CardContent className="pt-6">
                  {proposalLoading ? <p>Loading proposal…</p> : proposalHtml ? <iframe title="proposal" className="w-full min-h-[70vh] border rounded" srcDoc={proposalHtml} /> : <p>No proposal available.</p>}
                </CardContent></Card>
              </TabsContent>
            )}
            {selectedJob.access.can_view_materials && (
              <TabsContent value="materials">
                <Card><CardContent className="pt-6">
                  {proposalLoading ? <p>Loading sheets…</p> : (
                    <Accordion type="multiple">
                      {matSheets.map((sheet: any) => (
                        <AccordionItem key={sheet.id} value={sheet.id}>
                          <AccordionTrigger>{sheet.sheet_name || 'Sheet'}</AccordionTrigger>
                          <AccordionContent>
                            <table className="w-full text-sm">
                              <thead><tr><th className="text-left p-2">Item</th><th className="text-right p-2">Qty</th></tr></thead>
                              <tbody>
                                {(sheet.items || []).filter((i: any) => !i.excluded).map((item: any) => (
                                  <tr key={item.id} className="border-t">
                                    <td className="p-2">{item.description || item.name || '—'}</td>
                                    <td className="p-2 text-right">{item.quantity ?? '—'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  )}
                </CardContent></Card>
              </TabsContent>
            )}
            {selectedJob.access.can_view_schedule && (
              <TabsContent value="schedule"><Card><CardContent className="pt-6 space-y-2">
                {selectedJob.scheduleEvents.length === 0 ? <p>No scheduled events.</p> : selectedJob.scheduleEvents.map((ev: any) => (
                  <div key={ev.id} className="p-3 border rounded">
                    <p className="font-medium">{ev.title}</p>
                    <p className="text-sm text-muted-foreground">{new Date(ev.event_date).toLocaleDateString()}</p>
                  </div>
                ))}
              </CardContent></Card></TabsContent>
            )}
            {selectedJob.access.can_view_documents && (
              <TabsContent value="documents"><Card><CardContent className="pt-6 space-y-2">
                {selectedJob.documents.length === 0 ? <p>No documents.</p> : selectedJob.documents.map((doc: any) => (
                  <div key={doc.id} className="p-3 border rounded flex items-center justify-between">
                    <span>{doc.name}</span>
                    {doc.job_document_revisions?.[doc.job_document_revisions.length - 1]?.file_url && (
                      <a className="underline text-sm" href={doc.job_document_revisions[doc.job_document_revisions.length - 1].file_url} target="_blank" rel="noreferrer">Open</a>
                    )}
                  </div>
                ))}
              </CardContent></Card></TabsContent>
            )}
            {selectedJob.access.can_view_photos && (
              <TabsContent value="photos"><Card><CardContent className="pt-6 grid grid-cols-2 md:grid-cols-3 gap-4">
                {selectedJob.photos.length === 0 ? <p>No photos.</p> : selectedJob.photos.map((p: any) => (
                  <img key={p.id} src={p.photo_url} alt={p.caption || 'photo'} className="w-full h-40 object-cover rounded" />
                ))}
              </CardContent></Card></TabsContent>
            )}
          </Tabs>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="bg-gradient-to-r from-blue-900 to-slate-900 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <h1 className="text-3xl font-bold">Subcontractor Projects</h1>
          <p className="text-blue-100 mt-1">
            {user.full_name}
            {user.company_name ? ` · ${user.company_name}` : ''}
          </p>
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-4 py-8">
        {jobs.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">No jobs assigned yet.</CardContent></Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {jobs.map((job) => (
              <Card key={job.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setSelectedJob(job)}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-blue-600" />
                    <span className="truncate">{String(job.name)}</span>
                  </CardTitle>
                  <p className="text-sm text-muted-foreground"><MapPin className="w-3 h-3 inline mr-1" />{String(job.address ?? '')}</p>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  {job.access.can_view_proposal && <Badge variant="outline"><ClipboardList className="w-3 h-3 mr-1" />Proposal</Badge>}
                  {job.access.can_view_materials && <Badge variant="outline"><FileText className="w-3 h-3 mr-1" />Materials</Badge>}
                  {job.access.can_view_schedule && <Badge variant="outline"><Calendar className="w-3 h-3 mr-1" />Schedule</Badge>}
                  {job.access.can_view_documents && <Badge variant="outline"><FileText className="w-3 h-3 mr-1" />Docs</Badge>}
                  {job.access.can_view_photos && <Badge variant="outline"><Image className="w-3 h-3 mr-1" />Photos</Badge>}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
