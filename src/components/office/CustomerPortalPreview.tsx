// Interactive Customer Portal Preview Component
// This component renders a full-featured preview of what customers will see in their portal

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Building2, 
  MapPin, 
  ChevronRight, 
  FileText, 
  DollarSign, 
  Calendar, 
  Image, 
  Download,
  CheckCircle,
  Clock,
  ExternalLink
} from 'lucide-react';

interface CustomerPortalPreviewProps {
  customerName: string;
  jobs: any[];
  visibilitySettings: any;
  customMessage?: string | null;
}

export function CustomerPortalPreview({ customerName, jobs, visibilitySettings, customMessage }: CustomerPortalPreviewProps) {
  const [selectedJob, setSelectedJob] = useState<any>(null);

  // When previewing a single job (e.g. from Create dialog), open straight to its detail view
  useEffect(() => {
    if (jobs.length === 1) setSelectedJob(jobs[0]);
    else if (jobs.length === 0) setSelectedJob(null);
  }, [jobs]);

  if (selectedJob) {
    return (
      <JobDetailPreview 
        jobData={selectedJob} 
        onBack={() => setSelectedJob(null)}
        visibilitySettings={visibilitySettings}
      />
    );
  }

  return (
    <div className="min-h-full">
      {/* Header: black, gold, dark green */}
      <div className="bg-gradient-to-r from-zinc-900 via-emerald-950 to-zinc-900 text-white shadow-xl border-b-2 border-amber-500/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-amber-400">Your Projects</h1>
              <p className="text-emerald-100/90 mt-1">Welcome back, {customerName}</p>
            </div>
            <Badge variant="outline" className="bg-amber-500/10 text-amber-300 border-amber-500/40 px-4 py-2">
              Customer Portal
            </Badge>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Custom Message */}
        {customMessage && (
          <div className="bg-amber-50/80 border-2 border-amber-200/60 rounded-lg p-4 mb-6">
            <p className="text-slate-800">{customMessage}</p>
          </div>
        )}

        <div className="space-y-4">
          <h2 className="text-2xl font-bold mb-4">All Projects ({jobs.length})</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {jobs.map((jobData: any) => {
              const { totalPaid, estimatedPrice, remainingBalance, documents, photos, scheduleEvents } = jobData;
              
              return (
                <Card 
                  key={jobData.id} 
                  className="hover:shadow-lg transition-shadow cursor-pointer border-2"
                  onClick={() => setSelectedJob(jobData)}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="flex items-center gap-2">
                          <Building2 className="w-5 h-5 text-emerald-600" />
                          {jobData.name}
                        </CardTitle>
                        <p className="text-sm text-muted-foreground mt-1">
                          <MapPin className="w-3 h-3 inline mr-1" />
                          {jobData.address}
                        </p>
                      </div>
                      <Badge variant={jobData.status === 'active' ? 'default' : 'secondary'}>
                        {jobData.status}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Financial Summary - Only if enabled */}
                    {visibilitySettings?.show_financial_summary && (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 p-3 bg-slate-50 rounded-lg">
                        <div className="text-center">
                          <p className="text-xs text-muted-foreground">Quote Total</p>
                          <p className="font-bold text-sm text-emerald-700">${estimatedPrice.toLocaleString()}</p>
                        </div>
                        {(jobData.quote?.status === 'accepted' || jobData.quote?.status === 'signed') && (
                          <>
                            <div className="text-center">
                              <p className="text-xs text-muted-foreground">Paid</p>
                              <p className="font-bold text-sm text-green-600">${totalPaid.toLocaleString()}</p>
                            </div>
                            <div className="text-center">
                              <p className="text-xs text-muted-foreground">Balance</p>
                              <p className="font-bold text-sm text-amber-600">${remainingBalance.toLocaleString()}</p>
                            </div>
                          </>
                        )}
                      </div>
                    )}

                    {/* Quick Stats - Only show enabled sections */}
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      {visibilitySettings?.show_photos && (
                        <div className="flex items-center gap-1">
                          <Image className="w-4 h-4" />
                          <span>{photos?.length || 0} photos</span>
                        </div>
                      )}
                      {visibilitySettings?.show_documents && (
                        <div className="flex items-center gap-1">
                          <FileText className="w-4 h-4" />
                          <span>{documents?.length || 0} docs</span>
                        </div>
                      )}
                      {visibilitySettings?.show_schedule && (
                        <div className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          <span>{scheduleEvents?.length || 0} events</span>
                        </div>
                      )}
                    </div>

                    <Button variant="outline" className="w-full">
                      View Details
                      <ChevronRight className="w-4 h-4 ml-2" />
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// Job Detail Preview Component - Shows individual job with all tabs
function JobDetailPreview({ jobData, onBack, visibilitySettings }: any) {
  const [activeTab, setActiveTab] = useState('overview');
  const jobQuotes = jobData.jobQuotes || (jobData.quote ? [jobData.quote] : []);
  const proposalDataByQuoteId = jobData.proposalDataByQuoteId || {};
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(jobData.quote?.id ?? jobQuotes[0]?.id ?? null);
  const selectedQuote = jobQuotes.find((q: any) => q.id === selectedQuoteId) ?? jobData.quote ?? jobQuotes[0];
  const proposalData = (selectedQuoteId && proposalDataByQuoteId[selectedQuoteId]) ? proposalDataByQuoteId[selectedQuoteId] : jobData.proposalData;
  const { payments, documents, photos, scheduleEvents, viewerLinks = [] } = jobData;
  const totalPaid = payments?.reduce((sum: number, p: any) => sum + parseFloat(p.amount || '0'), 0) || 0;
  const balance = (proposalData?.totals?.grandTotal || 0) - totalPaid;
  const isSignedContract = selectedQuote?.status === 'accepted' || selectedQuote?.status === 'signed';
  const proposalNumber = selectedQuote?.proposal_number || selectedQuote?.quote_number || 'N/A';

  // Filter tabs: no separate Proposal tab – proposal is on Overview
  const visibleTabs = [
    { value: 'overview', label: 'Overview', show: true },
    { value: 'payments', label: 'Payments', show: visibilitySettings?.show_payments },
    { value: 'schedule', label: 'Schedule', show: visibilitySettings?.show_schedule },
    { value: 'documents', label: 'Documents', show: visibilitySettings?.show_documents },
    { value: 'photos', label: 'Photos', show: visibilitySettings?.show_photos },
  ].filter(tab => tab.show);

  return (
    <div className="min-h-full">
      {/* Header: black, gold, dark green – project name, proposal #, client, address */}
      <div className="bg-gradient-to-r from-zinc-900 via-emerald-950 to-zinc-900 text-white shadow-xl border-b-2 border-amber-500/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4 flex-wrap">
              <Button variant="ghost" size="sm" onClick={onBack} className="text-white hover:bg-white/10 shrink-0">
                ← Back to Projects
              </Button>
              <div>
                <div className="flex items-center gap-3 flex-wrap">
                  <h1 className="text-3xl font-bold text-amber-400">{jobData.name}</h1>
                  {jobQuotes.length > 1 ? (
                    <Select value={selectedQuoteId ?? ''} onValueChange={(v) => setSelectedQuoteId(v || null)}>
                      <SelectTrigger className="w-[180px] bg-amber-500/10 border-amber-500/50 text-amber-200">
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
                  ) : (
                    <Badge variant="outline" className="bg-amber-500/20 text-amber-300 border-amber-500/50">
                      #{proposalNumber}
                    </Badge>
                  )}
                </div>
                <p className="text-emerald-100/90 mt-1">{jobData.client_name}</p>
                {jobData.address && (
                  <p className="text-emerald-200/80 text-sm mt-1 flex items-center gap-1">
                    <MapPin className="w-4 h-4 shrink-0 text-amber-400/90" />
                    {jobData.address}
                  </p>
                )}
              </div>
            </div>
            <Badge variant="outline" className="bg-amber-500/10 text-amber-300 border-amber-500/40 px-4 py-2">
              Project Details
            </Badge>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className={`grid w-full mb-6`} style={{ gridTemplateColumns: `repeat(${visibleTabs.length}, 1fr)` }}>
            {visibleTabs.map(tab => (
              <TabsTrigger key={tab.value} value={tab.value}>{tab.label}</TabsTrigger>
            ))}
          </TabsList>

          {/* Overview Tab – matches customer portal: custom message, drawings, proposal */}
          <TabsContent value="overview" className="space-y-6">
            {/* Custom welcome message (from Portal settings) */}
            {visibilitySettings?.custom_message && (
              <Card className="border-amber-200 bg-amber-50/50">
                <CardContent className="pt-6">
                  <p className="text-slate-800 whitespace-pre-wrap">{visibilitySettings.custom_message}</p>
                </CardContent>
              </Card>
            )}
            {/* Drawings & 3D Views (viewer links from Manage links) */}
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

            {/* Proposal on same page as overview */}
            {visibilitySettings?.show_proposal && (
              <Card className="border-emerald-200/60">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-emerald-900">
                    <FileText className="w-5 h-5" />
                    Project Proposal
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {(() => {
                    const showPrice = !!(visibilitySettings?.show_financial_summary && visibilitySettings?.show_line_item_prices);
                    // Combine all sections in order_index order — mirrors JobFinancials allItemsUnsorted
                    const allSections: Array<{ type: 'material' | 'custom' | 'subcontractor'; id: string; orderIndex: number; data: any }> = [
                      ...(proposalData?.materialSheets || []).map((s: any) => ({ type: 'material' as const, id: s.id, orderIndex: s.order_index ?? 0, data: s })),
                      ...(proposalData?.customRows || []).filter((r: any) => !r.sheet_id).map((r: any) => ({ type: 'custom' as const, id: r.id, orderIndex: r.order_index ?? 0, data: r })),
                      ...(proposalData?.subcontractorEstimates || []).filter((e: any) => !e.sheet_id && !e.row_id).map((e: any) => ({ type: 'subcontractor' as const, id: e.id, orderIndex: e.order_index ?? 0, data: e })),
                    ].sort((a, b) => a.orderIndex - b.orderIndex);

                    return allSections.map((section) => {
                      if (section.type === 'material') {
                        const sheet = section.data;
                        const total = sheet._computedTotal ?? 0;
                        return (
                          <div key={sheet.id} className="border rounded-lg p-4 flex items-start justify-between gap-4">
                            <div className="min-w-0 flex-1">
                              <h3 className="font-bold text-lg">{sheet.sheet_name}</h3>
                              {sheet.description && <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{sheet.description}</p>}
                            </div>
                            {showPrice && total > 0 && <p className="text-xl font-bold text-emerald-700 shrink-0">${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>}
                          </div>
                        );
                      }
                      if (section.type === 'custom') {
                        const row = section.data;
                        const items = (row.custom_financial_row_items || []).slice().sort((a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0));
                        const total = row._computedTotal ?? 0;
                        return (
                          <div key={row.id} className="border rounded-lg p-4 flex items-start justify-between gap-4">
                            <div className="min-w-0 flex-1">
                              <h3 className="font-bold text-lg">{row.description || row.category}</h3>
                              {items.length > 0 && (
                                <ul className="text-sm text-muted-foreground mt-2 space-y-1 list-disc list-inside">
                                  {items.map((item: any) => <li key={item.id}>{item.description}</li>)}
                                </ul>
                              )}
                            </div>
                            {showPrice && total > 0 && <p className="text-xl font-bold text-emerald-700 shrink-0">${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>}
                          </div>
                        );
                      }
                      const est = section.data;
                      const total = est._computedTotal ?? 0;
                      return (
                        <div key={est.id} className="border rounded-lg p-4 flex items-start justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <h3 className="font-bold text-lg">{est.company_name}</h3>
                            {est.scope_of_work && <p className="text-sm text-muted-foreground mt-1">{est.scope_of_work}</p>}
                          </div>
                          {showPrice && total > 0 && <p className="text-xl font-bold text-emerald-700 shrink-0">${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>}
                        </div>
                      );
                    });
                  })()}

                  {visibilitySettings?.show_financial_summary && (
                    <div className="border-t-2 pt-4 space-y-2">
                      <div className="flex justify-between text-lg">
                        <span className="font-medium">Subtotal:</span>
                        <span>${(proposalData?.totals?.subtotal ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between text-lg">
                        <span className="font-medium">Tax (7%):</span>
                        <span>${(proposalData?.totals?.tax ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between text-2xl font-bold pt-2 border-t">
                        <span>Grand Total:</span>
                        <span className="text-emerald-700">
                          ${(proposalData?.totals?.grandTotal ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

          </TabsContent>

          {/* Payments Tab */}
          {visibilitySettings?.show_payments && (
            <TabsContent value="payments">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <DollarSign className="w-5 h-5" />
                    Payment History
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {payments && payments.length > 0 ? (
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
                          <p className="text-xl font-bold text-green-600">
                            ${parseFloat(payment.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-center text-muted-foreground py-8">No payments recorded yet</p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {/* Schedule, Documents, and Photos tabs similarly structured */}
          {visibilitySettings?.show_schedule && (
            <TabsContent value="schedule">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="w-5 h-5" />
                    Project Schedule
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {scheduleEvents && scheduleEvents.length > 0 ? (
                    <div className="space-y-3">
                      {scheduleEvents.map((event: any) => (
                        <div key={event.id} className="flex items-start gap-4 p-4 border rounded-lg">
                          <div className="text-center bg-emerald-50 rounded-lg p-3 min-w-[80px]">
                            <p className="text-sm text-muted-foreground">
                              {new Date(event.event_date).toLocaleDateString('en-US', { month: 'short' })}
                            </p>
                            <p className="text-2xl font-bold text-emerald-700">
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
          )}

          {visibilitySettings?.show_documents && (
            <TabsContent value="documents">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="w-5 h-5" />
                    Project Documents
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {documents && documents.length > 0 ? (
                    <div className="space-y-3">
                      {documents.map((doc: any) => (
                        <div key={doc.id} className="flex items-center justify-between p-4 border rounded-lg">
                          <div className="flex items-center gap-3">
                            <FileText className="w-8 h-8 text-emerald-600" />
                            <div>
                              <p className="font-medium">{doc.name}</p>
                              <p className="text-sm text-muted-foreground">
                                {doc.category}
                              </p>
                            </div>
                          </div>
                          <Button variant="outline" size="sm">
                            <Download className="w-4 h-4 mr-2" />
                            Download
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-center text-muted-foreground py-8">No documents available</p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {visibilitySettings?.show_photos && (
            <TabsContent value="photos">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Image className="w-5 h-5" />
                    Project Photos
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {photos && photos.length > 0 ? (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                      {photos.map((photo: any) => (
                        <div key={photo.id} className="group relative">
                          <img
                            src={photo.photo_url}
                            alt={photo.caption || 'Project photo'}
                            className="w-full h-48 object-cover rounded-lg cursor-pointer hover:opacity-90 transition"
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
          )}
        </Tabs>
      </div>
    </div>
  );
}
