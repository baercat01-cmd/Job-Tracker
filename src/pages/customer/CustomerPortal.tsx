import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
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
  Briefcase
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { PWAInstallButton } from '@/components/ui/pwa-install-button';

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

export default function CustomerPortal() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');
  
  const [loading, setLoading] = useState(true);
  const [validToken, setValidToken] = useState(false);
  const [customerInfo, setCustomerInfo] = useState<any>(null);
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [selectedJob, setSelectedJob] = useState<JobSummary | null>(null);

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
        .select('*')
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

      // Load all jobs for this customer
      await loadCustomerJobs(accessData.customer_identifier);
    } catch (error: any) {
      console.error('Error validating token:', error);
      toast.error('Failed to load portal data');
      setLoading(false);
    }
  }

  async function loadCustomerJobs(customerIdentifier: string) {
    try {
      // Find all jobs for this customer (by client_name matching customer_name)
      // You might want to use customer_email to match instead, depending on your data structure
      const { data: jobsData, error: jobsError } = await supabase
        .from('jobs')
        .select('*')
        .ilike('client_name', `%${customerInfo?.customer_name || customerIdentifier}%`)
        .order('created_at', { ascending: false });

      if (jobsError) throw jobsError;

      // Load summary data for each job
      const jobSummaries = await Promise.all(
        (jobsData || []).map(async (job) => {
          // Load proposal data
          const proposalData = await loadProposalData(job.id);
          
          // Load payments
          const { data: paymentsData } = await supabase
            .from('customer_payments')
            .select('amount')
            .eq('job_id', job.id);
          
          const totalPaid = (paymentsData || []).reduce((sum, p) => sum + parseFloat(p.amount.toString()), 0);
          
          // Load photo count
          const { data: photosData } = await supabase
            .from('photos')
            .select('id')
            .eq('job_id', job.id);
          
          // Load document count
          const { data: documentsData } = await supabase
            .from('job_documents')
            .select('id')
            .eq('job_id', job.id)
            .eq('visible_to_crew', true);
          
          // Load schedule event count
          const { data: scheduleData } = await supabase
            .from('calendar_events')
            .select('id')
            .eq('job_id', job.id);

          return {
            job,
            totalAmount: proposalData.totals.grandTotal,
            totalPaid,
            balance: proposalData.totals.grandTotal - totalPaid,
            photoCount: photosData?.length || 0,
            documentCount: documentsData?.length || 0,
            scheduleEventCount: scheduleData?.length || 0,
          };
        })
      );

      setJobs(jobSummaries);
      setLoading(false);
    } catch (error: any) {
      console.error('Error loading customer jobs:', error);
      toast.error('Failed to load your projects');
      setLoading(false);
    }
  }

  async function loadProposalData(jobId: string) {
    try {
      // Get workbook
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

      // Get custom rows
      const { data: customRowsData } = await supabase
        .from('custom_financial_rows')
        .select('*')
        .eq('job_id', jobId)
        .order('order_index');

      // Get subcontractor estimates
      const { data: subEstimatesData } = await supabase
        .from('subcontractor_estimates')
        .select('*')
        .eq('job_id', jobId)
        .order('order_index');

      // Calculate totals
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

  // If a job is selected, show job detail view (existing view)
  if (selectedJob) {
    return <JobDetailView job={selectedJob} onBack={() => setSelectedJob(null)} />;
  }

  // Job list view
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-800 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">Your Projects</h1>
              <p className="text-blue-100 mt-1">Welcome back, {customerInfo.customer_name}</p>
            </div>
            <div className="flex items-center gap-3">
              <PWAInstallButton className="bg-white/10 hover:bg-white/20 text-white border-white/30" />
              <Badge variant="outline" className="bg-white/10 text-white border-white/30 px-4 py-2">
                Customer Portal
              </Badge>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {jobs.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12">
              <Briefcase className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
              <h2 className="text-xl font-semibold mb-2">No Projects Found</h2>
              <p className="text-muted-foreground">
                We couldn't find any projects associated with your account. Please contact your project manager for assistance.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold mb-4">All Projects ({jobs.length})</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {jobs.map((jobSummary) => {
                const { job, totalAmount, totalPaid, balance, photoCount, documentCount, scheduleEventCount } = jobSummary;
                
                return (
                  <Card 
                    key={job.id} 
                    className="hover:shadow-lg transition-shadow cursor-pointer border-2"
                    onClick={() => setSelectedJob(jobSummary)}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <CardTitle className="flex items-center gap-2">
                            <Building2 className="w-5 h-5 text-blue-600" />
                            {job.name}
                          </CardTitle>
                          <p className="text-sm text-muted-foreground mt-1">
                            <MapPin className="w-3 h-3 inline mr-1" />
                            {job.address}
                          </p>
                        </div>
                        <Badge variant={job.status === 'active' ? 'default' : 'secondary'}>
                          {job.status}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Financial Summary */}
                      <div className="grid grid-cols-3 gap-2 p-3 bg-slate-50 rounded-lg">
                        <div className="text-center">
                          <p className="text-xs text-muted-foreground">Total</p>
                          <p className="font-bold text-sm">${totalAmount.toLocaleString()}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-muted-foreground">Paid</p>
                          <p className="font-bold text-sm text-green-600">${totalPaid.toLocaleString()}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-muted-foreground">Balance</p>
                          <p className="font-bold text-sm text-amber-600">${balance.toLocaleString()}</p>
                        </div>
                      </div>

                      {/* Quick Stats */}
                      <div className="flex items-center justify-between text-sm text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Image className="w-4 h-4" />
                          <span>{photoCount} photos</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <FileText className="w-4 h-4" />
                          <span>{documentCount} docs</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          <span>{scheduleEventCount} events</span>
                        </div>
                      </div>

                      {/* View Details Button */}
                      <Button variant="outline" className="w-full" onClick={() => setSelectedJob(jobSummary)}>
                        View Details
                        <ChevronRight className="w-4 h-4 ml-2" />
                      </Button>

                      {/* Date Info */}
                      {job.projected_start_date && (
                        <p className="text-xs text-muted-foreground text-center">
                          Started: {new Date(job.projected_start_date).toLocaleDateString()}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Job Detail View Component (existing single-job view)
function JobDetailView({ job: jobSummary, onBack }: { job: JobSummary; onBack: () => void }) {
  const { job } = jobSummary;
  const [loading, setLoading] = useState(true);
  const [portalData, setPortalData] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    loadJobData();
  }, [job.id]);

  async function loadJobData() {
    try {
      // Load quote
      const { data: quoteData } = await supabase
        .from('quotes')
        .select('*')
        .eq('job_id', job.id)
        .maybeSingle();

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
        .limit(50);

      // Load schedule events
      const { data: scheduleData } = await supabase
        .from('calendar_events')
        .select('*')
        .eq('job_id', job.id)
        .order('event_date', { ascending: true });

      // Load proposal data
      const proposalData = await loadProposalData(job.id);

      setPortalData({
        job,
        quote: quoteData,
        payments: paymentsData || [],
        documents: documentsData || [],
        photos: photosData || [],
        scheduleEvents: scheduleData || [],
        proposalData,
      });

      setLoading(false);
    } catch (error: any) {
      console.error('Error loading job data:', error);
      toast.error('Failed to load project details');
      setLoading(false);
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

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-lg text-slate-600">Loading project details...</p>
        </div>
      </div>
    );
  }

  const { payments, documents, photos, scheduleEvents, proposalData } = portalData;
  const totalPaid = payments.reduce((sum: number, p: any) => sum + parseFloat(p.amount.toString()), 0);
  const balance = proposalData.totals.grandTotal - totalPaid;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-800 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="sm" onClick={onBack} className="text-white hover:bg-white/10">
                ← Back to Projects
              </Button>
              <div>
                <h1 className="text-3xl font-bold">{job.name}</h1>
                <p className="text-blue-100 mt-1">{job.client_name}</p>
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
          <TabsList className="grid w-full grid-cols-6 mb-6">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="proposal">Proposal</TabsTrigger>
            <TabsTrigger value="payments">Payments</TabsTrigger>
            <TabsTrigger value="schedule">Schedule</TabsTrigger>
            <TabsTrigger value="documents">Documents</TabsTrigger>
            <TabsTrigger value="photos">Photos</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
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
                    ${proposalData.totals.grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
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

            {/* Project Info */}
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
                    <p className="font-medium mt-1">{job.address}</p>
                  </div>
                  {job.description && (
                    <div>
                      <p className="text-sm text-muted-foreground">Description</p>
                      <p className="font-medium mt-1">{job.description}</p>
                    </div>
                  )}
                </div>
                {job.notes && (
                  <div>
                    <p className="text-sm text-muted-foreground">Notes</p>
                    <p className="mt-1">{job.notes}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Proposal Tab */}
          <TabsContent value="proposal">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5" />
                  Project Proposal
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {proposalData.materialSheets.map((sheet: any) => (
                  <div key={sheet.id} className="border rounded-lg p-4">
                    <h3 className="font-bold text-lg">{sheet.sheet_name}</h3>
                    {sheet.description && (
                      <p className="text-sm text-muted-foreground mt-1">{sheet.description}</p>
                    )}
                  </div>
                ))}

                {proposalData.customRows.map((row: any) => (
                  <div key={row.id} className="border rounded-lg p-4 flex items-center justify-between">
                    <div>
                      <h3 className="font-bold">{row.description}</h3>
                      <p className="text-sm text-muted-foreground">
                        {row.quantity} × ${row.unit_cost.toFixed(2)}
                      </p>
                    </div>
                    <p className="text-xl font-bold text-blue-600">
                      ${row.selling_price.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                ))}

                {proposalData.subcontractorEstimates.map((est: any) => {
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
                    <span>${proposalData.totals.subtotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between text-lg">
                    <span className="font-medium">Tax (7%):</span>
                    <span>${proposalData.totals.tax.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between text-2xl font-bold pt-2 border-t">
                    <span>Grand Total:</span>
                    <span className="text-blue-600">
                      ${proposalData.totals.grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
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
        </Tabs>
      </div>
    </div>
  );
}
