// Interactive Customer Portal Preview Component
// This component renders a full-featured preview of what customers will see in their portal

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  Clock
} from 'lucide-react';

interface CustomerPortalPreviewProps {
  customerName: string;
  jobs: any[];
  visibilitySettings: any;
  customMessage?: string | null;
}

export function CustomerPortalPreview({ customerName, jobs, visibilitySettings, customMessage }: CustomerPortalPreviewProps) {
  const [selectedJob, setSelectedJob] = useState<any>(null);

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
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-800 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">Your Projects</h1>
              <p className="text-blue-100 mt-1">Welcome back, {customerName}</p>
            </div>
            <Badge variant="outline" className="bg-white/10 text-white border-white/30 px-4 py-2">
              Customer Portal
            </Badge>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Custom Message */}
        {customMessage && (
          <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4 mb-6">
            <p className="text-blue-900">{customMessage}</p>
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
                          <Building2 className="w-5 h-5 text-blue-600" />
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
                      <div className="grid grid-cols-3 gap-2 p-3 bg-slate-50 rounded-lg">
                        <div className="text-center">
                          <p className="text-xs text-muted-foreground">Total</p>
                          <p className="font-bold text-sm">${estimatedPrice.toLocaleString()}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-muted-foreground">Paid</p>
                          <p className="font-bold text-sm text-green-600">${totalPaid.toLocaleString()}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-muted-foreground">Balance</p>
                          <p className="font-bold text-sm text-amber-600">${remainingBalance.toLocaleString()}</p>
                        </div>
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
  const { payments, documents, photos, scheduleEvents, proposalData } = jobData;
  const totalPaid = payments?.reduce((sum: number, p: any) => sum + parseFloat(p.amount || '0'), 0) || 0;
  const balance = (proposalData?.totals?.grandTotal || 0) - totalPaid;

  // Filter tabs based on visibility settings
  const visibleTabs = [
    { value: 'overview', label: 'Overview', show: true },
    { value: 'proposal', label: 'Proposal', show: visibilitySettings?.show_proposal },
    { value: 'payments', label: 'Payments', show: visibilitySettings?.show_payments },
    { value: 'schedule', label: 'Schedule', show: visibilitySettings?.show_schedule },
    { value: 'documents', label: 'Documents', show: visibilitySettings?.show_documents },
    { value: 'photos', label: 'Photos', show: visibilitySettings?.show_photos },
  ].filter(tab => tab.show);

  return (
    <div className="min-h-full">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-800 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="sm" onClick={onBack} className="text-white hover:bg-white/10">
                ← Back to Projects
              </Button>
              <div>
                <h1 className="text-3xl font-bold">{jobData.name}</h1>
                <p className="text-blue-100 mt-1">{jobData.client_name}</p>
              </div>
            </div>
            <Badge variant="outline" className="bg-white/10 text-white border-white/30 px-4 py-2">
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

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            {visibilitySettings?.show_financial_summary && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <DollarSign className="w-4 h-4" />
                      Project Total
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-3xl font-bold text-blue-600">
                      ${(proposalData?.totals?.grandTotal || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <CheckCircle className="w-4 h-4" />
                      Amount Paid
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-3xl font-bold text-green-600">
                      ${totalPaid.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      Balance Due
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className={`text-3xl font-bold ${balance > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                      ${balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </p>
                  </CardContent>
                </Card>
              </div>
            )}

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
                    <p className="font-medium mt-1">{jobData.address}</p>
                  </div>
                  {jobData.description && (
                    <div>
                      <p className="text-sm text-muted-foreground">Description</p>
                      <p className="font-medium mt-1">{jobData.description}</p>
                    </div>
                  )}
                </div>
                {jobData.notes && (
                  <div>
                    <p className="text-sm text-muted-foreground">Notes</p>
                    <p className="mt-1">{jobData.notes}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Proposal Tab */}
          {visibilitySettings?.show_proposal && (
            <TabsContent value="proposal">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="w-5 h-5" />
                    Project Proposal
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {proposalData?.customRows?.map((row: any) => (
                    <div key={row.id} className="border rounded-lg p-4 flex items-center justify-between">
                      <div>
                        <h3 className="font-bold">{row.description}</h3>
                        <p className="text-sm text-muted-foreground">
                          {row.quantity} × ${row.unit_cost?.toFixed(2)}
                        </p>
                      </div>
                      <p className="text-xl font-bold text-blue-600">
                        ${row.selling_price?.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                  ))}

                  {proposalData?.subcontractorEstimates?.map((est: any) => {
                    const finalPrice = (est.total_amount || 0) * (1 + (est.markup_percent || 0) / 100);
                    return (
                      <div key={est.id} className="border rounded-lg p-4 flex items-center justify-between">
                        <div>
                          <h3 className="font-bold">{est.company_name}</h3>
                          {est.scope_of_work && (
                            <p className="text-sm text-muted-foreground mt-1">{est.scope_of_work}</p>
                          )}
                        </div>
                        <p className="text-xl font-bold text-blue-600">
                          ${finalPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                    );
                  })}

                  <div className="border-t-2 pt-4 space-y-2">
                    <div className="flex justify-between text-lg">
                      <span className="font-medium">Subtotal:</span>
                      <span>${proposalData?.totals?.subtotal?.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between text-lg">
                      <span className="font-medium">Tax (7%):</span>
                      <span>${proposalData?.totals?.tax?.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between text-2xl font-bold pt-2 border-t">
                      <span>Grand Total:</span>
                      <span className="text-blue-600">
                        ${proposalData?.totals?.grandTotal?.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          )}

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
                            <FileText className="w-8 h-8 text-blue-600" />
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
