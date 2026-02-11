import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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
import {
  FileText,
  Upload,
  Trash2,
  Eye,
  AlertCircle,
  CheckCircle2,
  Clock,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Download,
  ChevronDown,
  ChevronRight,
  Package,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';

interface SubcontractorEstimate {
  id: string;
  quote_id: string | null;
  job_id: string | null;
  subcontractor_id: string | null;
  pdf_url: string;
  file_name: string;
  company_name: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  total_amount: number | null;
  scope_of_work: string | null;
  notes: string | null;
  exclusions: string | null;
  extraction_status: string;
  raw_extraction_data: any;
  uploaded_by: string | null;
  uploaded_at: string;
  created_at: string;
  line_items: LineItem[];
}

interface SubcontractorInvoice {
  id: string;
  estimate_id: string | null;
  job_id: string;
  subcontractor_id: string | null;
  pdf_url: string;
  file_name: string;
  invoice_number: string | null;
  invoice_date: string | null;
  company_name: string | null;
  total_amount: number | null;
  payment_status: string;
  paid_date: string | null;
  paid_amount: number | null;
  extraction_status: string;
  raw_extraction_data: any;
  uploaded_by: string | null;
  uploaded_at: string;
  created_at: string;
  line_items: LineItem[];
}

interface LineItem {
  id: string;
  description: string;
  quantity: number | null;
  unit_price: number | null;
  total_price: number;
  notes: string | null;
  order_index: number;
}

interface SubcontractorEstimatesManagementProps {
  jobId?: string;
  quoteId?: string;
}

export function SubcontractorEstimatesManagement({ jobId, quoteId }: SubcontractorEstimatesManagementProps) {
  const { profile } = useAuth();
  const [estimates, setEstimates] = useState<SubcontractorEstimate[]>([]);
  const [invoices, setInvoices] = useState<SubcontractorInvoice[]>([]);
  const [subcontractors, setSubcontractors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [showInvoiceUploadDialog, setShowInvoiceUploadDialog] = useState(false);
  const [showVarianceDialog, setShowVarianceDialog] = useState(false);
  const [selectedEstimate, setSelectedEstimate] = useState<SubcontractorEstimate | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<SubcontractorInvoice | null>(null);
  const [uploading, setUploading] = useState(false);
  const [activeTab, setActiveTab] = useState<'estimates' | 'invoices'>('estimates');

  // Upload form state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedSubcontractor, setSelectedSubcontractor] = useState('');
  const [selectedEstimateForInvoice, setSelectedEstimateForInvoice] = useState('');
  
  // Drag and drop state
  const [isDraggingEstimate, setIsDraggingEstimate] = useState(false);
  const [isDraggingInvoice, setIsDraggingInvoice] = useState(false);
  const [expandedDetails, setExpandedDetails] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadData();
    
    // Subscribe to changes
    const estimatesChannel = supabase
      .channel('subcontractor_estimates_changes')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'subcontractor_estimates' },
        () => loadEstimates()
      )
      .subscribe();

    const invoicesChannel = supabase
      .channel('subcontractor_invoices_changes')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'subcontractor_invoices' },
        () => loadInvoices()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(estimatesChannel);
      supabase.removeChannel(invoicesChannel);
    };
  }, [jobId, quoteId]);

  async function loadData() {
    setLoading(true);
    await Promise.all([
      loadEstimates(),
      loadInvoices(),
      loadSubcontractors(),
    ]);
    setLoading(false);
  }

  async function loadSubcontractors() {
    try {
      const { data, error } = await supabase
        .from('subcontractors')
        .select('*')
        .eq('active', true)
        .order('name');

      if (error) throw error;
      setSubcontractors(data || []);
    } catch (error: any) {
      console.error('Error loading subcontractors:', error);
    }
  }

  async function loadEstimates() {
    try {
      let query = supabase
        .from('subcontractor_estimates')
        .select(`
          *,
          line_items:subcontractor_estimate_line_items(*)
        `)
        .order('created_at', { ascending: false });

      if (jobId) {
        query = query.eq('job_id', jobId);
      }
      if (quoteId) {
        query = query.eq('quote_id', quoteId);
      }

      const { data, error } = await query;

      if (error) throw error;
      setEstimates(data || []);
    } catch (error: any) {
      console.error('Error loading estimates:', error);
    }
  }

  async function loadInvoices() {
    try {
      let query = supabase
        .from('subcontractor_invoices')
        .select(`
          *,
          line_items:subcontractor_invoice_line_items(*)
        `)
        .order('created_at', { ascending: false });

      if (jobId) {
        query = query.eq('job_id', jobId);
      }

      const { data, error } = await query;

      if (error) throw error;
      setInvoices(data || []);
    } catch (error: any) {
      console.error('Error loading invoices:', error);
    }
  }

  function handleDragOver(e: React.DragEvent, type: 'estimate' | 'invoice') {
    e.preventDefault();
    e.stopPropagation();
    if (type === 'estimate') {
      setIsDraggingEstimate(true);
    } else {
      setIsDraggingInvoice(true);
    }
  }

  function handleDragLeave(e: React.DragEvent, type: 'estimate' | 'invoice') {
    e.preventDefault();
    e.stopPropagation();
    if (type === 'estimate') {
      setIsDraggingEstimate(false);
    } else {
      setIsDraggingInvoice(false);
    }
  }

  function handleDrop(e: React.DragEvent, type: 'estimate' | 'invoice') {
    e.preventDefault();
    e.stopPropagation();
    
    if (type === 'estimate') {
      setIsDraggingEstimate(false);
    } else {
      setIsDraggingInvoice(false);
    }

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      
      // Check if it's a PDF
      if (file.type === 'application/pdf') {
        setSelectedFile(file);
        toast.success(`${file.name} ready to upload`);
      } else {
        toast.error('Please upload a PDF file');
      }
    }
  }

  async function handleEstimateUpload() {
    if (!selectedFile) {
      toast.error('Please select a PDF file');
      return;
    }

    if (!jobId && !quoteId) {
      toast.error('Job or Quote ID is required');
      return;
    }

    console.log('Starting estimate upload:', {
      fileName: selectedFile.name,
      fileSize: selectedFile.size,
      fileType: selectedFile.type,
      jobId,
      quoteId,
      profileId: profile?.id
    });

    setUploading(true);

    try {
      // Upload PDF to storage
      const fileExt = selectedFile.name.split('.').pop();
      const fileName = `${Date.now()}_${selectedFile.name}`;
      const filePath = `subcontractor-estimates/${fileName}`;

      console.log('Uploading to storage:', filePath);
      const { error: uploadError } = await supabase.storage
        .from('job-files')
        .upload(filePath, selectedFile);

      if (uploadError) {
        console.error('Storage upload error:', uploadError);
        throw new Error(`Storage upload failed: ${uploadError.message}`);
      }

      console.log('File uploaded successfully, getting public URL');
      // Get public URL
      const { data: urlData } = supabase.storage
        .from('job-files')
        .getPublicUrl(filePath);

      console.log('Public URL:', urlData.publicUrl);

      // Create estimate record
      console.log('Creating database record');
      const { data: estimateData, error: estimateError } = await supabase
        .from('subcontractor_estimates')
        .insert({
          quote_id: quoteId || null,
          job_id: jobId || null,
          subcontractor_id: selectedSubcontractor || null,
          pdf_url: urlData.publicUrl,
          file_name: selectedFile.name,
          extraction_status: 'pending',
          uploaded_by: profile?.id || null,
        })
        .select()
        .single();

      if (estimateError) {
        console.error('Database insert error:', estimateError);
        throw new Error(`Database insert failed: ${estimateError.message}`);
      }

      console.log('Database record created:', estimateData);

      // Trigger AI extraction
      toast.info('AI is extracting data from the PDF...');
      
      console.log('Invoking AI extraction function');
      const { data: functionData, error: functionError } = await supabase.functions.invoke('extract-subcontractor-document', {
        body: {
          documentId: estimateData.id,
          documentType: 'estimate',
          pdfUrl: urlData.publicUrl,
        },
      });

      if (functionError) {
        console.error('AI extraction error:', functionError);
        toast.error('Document uploaded but AI extraction failed - you can manually enter data');
      } else {
        console.log('AI extraction response:', functionData);
        toast.success('Estimate uploaded and data extracted successfully!');
      }

      setShowUploadDialog(false);
      setSelectedFile(null);
      setSelectedSubcontractor('');
      loadEstimates();
    } catch (error: any) {
      console.error('Error uploading estimate:', error);
      toast.error(`Failed to upload estimate: ${error.message || 'Unknown error'}`);
    } finally {
      setUploading(false);
    }
  }

  async function handleInvoiceUpload() {
    if (!selectedFile) {
      toast.error('Please select a PDF file');
      return;
    }

    if (!jobId && !selectedEstimateForInvoice) {
      toast.error('Job or Estimate is required');
      return;
    }

    console.log('Starting invoice upload:', {
      fileName: selectedFile.name,
      fileSize: selectedFile.size,
      fileType: selectedFile.type,
      jobId,
      selectedEstimateForInvoice,
      profileId: profile?.id
    });

    setUploading(true);

    try {
      // Upload PDF to storage
      const fileName = `${Date.now()}_${selectedFile.name}`;
      const filePath = `subcontractor-invoices/${fileName}`;

      console.log('Uploading to storage:', filePath);
      const { error: uploadError } = await supabase.storage
        .from('job-files')
        .upload(filePath, selectedFile);

      if (uploadError) {
        console.error('Storage upload error:', uploadError);
        throw new Error(`Storage upload failed: ${uploadError.message}`);
      }

      console.log('File uploaded successfully, getting public URL');
      // Get public URL
      const { data: urlData } = supabase.storage
        .from('job-files')
        .getPublicUrl(filePath);

      console.log('Public URL:', urlData.publicUrl);

      // Get job_id from estimate if not provided
      let finalJobId = jobId;
      if (!finalJobId && selectedEstimateForInvoice) {
        const estimate = estimates.find(e => e.id === selectedEstimateForInvoice);
        finalJobId = estimate?.job_id || null;
        console.log('Got job_id from estimate:', finalJobId);
      }

      if (!finalJobId) {
        throw new Error('Job ID is required');
      }

      // Create invoice record
      console.log('Creating database record');
      const { data: invoiceData, error: invoiceError } = await supabase
        .from('subcontractor_invoices')
        .insert({
          estimate_id: selectedEstimateForInvoice || null,
          job_id: finalJobId,
          subcontractor_id: selectedSubcontractor || null,
          pdf_url: urlData.publicUrl,
          file_name: selectedFile.name,
          extraction_status: 'pending',
          payment_status: 'pending',
          uploaded_by: profile?.id || null,
        })
        .select()
        .single();

      if (invoiceError) {
        console.error('Database insert error:', invoiceError);
        throw new Error(`Database insert failed: ${invoiceError.message}`);
      }

      console.log('Database record created:', invoiceData);

      // Trigger AI extraction
      toast.info('AI is extracting data from the PDF...');
      
      console.log('Invoking AI extraction function');
      const { data: functionData, error: functionError } = await supabase.functions.invoke('extract-subcontractor-document', {
        body: {
          documentId: invoiceData.id,
          documentType: 'invoice',
          pdfUrl: urlData.publicUrl,
        },
      });

      if (functionError) {
        console.error('AI extraction error:', functionError);
        toast.error('Document uploaded but AI extraction failed');
      } else {
        console.log('AI extraction response:', functionData);
        toast.success('Invoice uploaded and data extracted successfully!');
      }

      setShowInvoiceUploadDialog(false);
      setSelectedFile(null);
      setSelectedSubcontractor('');
      setSelectedEstimateForInvoice('');
      loadInvoices();
    } catch (error: any) {
      console.error('Error uploading invoice:', error);
      toast.error(`Failed to upload invoice: ${error.message || 'Unknown error'}`);
    } finally {
      setUploading(false);
    }
  }

  async function deleteEstimate(id: string) {
    if (!confirm('Delete this estimate?')) return;

    try {
      const { error } = await supabase
        .from('subcontractor_estimates')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('Estimate deleted');
      loadEstimates();
    } catch (error: any) {
      console.error('Error deleting estimate:', error);
      toast.error('Failed to delete estimate');
    }
  }

  async function deleteInvoice(id: string) {
    if (!confirm('Delete this invoice?')) return;

    try {
      const { error } = await supabase
        .from('subcontractor_invoices')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('Invoice deleted');
      loadInvoices();
    } catch (error: any) {
      console.error('Error deleting invoice:', error);
      toast.error('Failed to delete invoice');
    }
  }

  function showVarianceComparison(estimate: SubcontractorEstimate) {
    setSelectedEstimate(estimate);
    // Find related invoice
    const relatedInvoice = invoices.find(inv => inv.estimate_id === estimate.id);
    setSelectedInvoice(relatedInvoice || null);
    setShowVarianceDialog(true);
  }

  function toggleDetails(id: string) {
    setExpandedDetails(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  }

  function categorizeLineItems(lineItems: LineItem[]) {
    const materials: LineItem[] = [];
    const labor: LineItem[] = [];

    lineItems.forEach(item => {
      const desc = item.description.toLowerCase();
      if (desc.includes('labor') || desc.includes('install') || desc.includes('service')) {
        labor.push(item);
      } else {
        materials.push(item);
      }
    });

    return { materials, labor };
  }

  function getStatusIcon(status: string) {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="w-4 h-4 text-green-600" />;
      case 'processing':
        return <Clock className="w-4 h-4 text-blue-600 animate-spin" />;
      case 'failed':
        return <AlertCircle className="w-4 h-4 text-red-600" />;
      default:
        return <Clock className="w-4 h-4 text-slate-400" />;
    }
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case 'completed':
        return <Badge className="bg-green-100 text-green-800">Extracted</Badge>;
      case 'processing':
        return <Badge className="bg-blue-100 text-blue-800">Processing...</Badge>;
      case 'failed':
        return <Badge variant="destructive">Failed</Badge>;
      default:
        return <Badge variant="outline">Pending</Badge>;
    }
  }

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-muted-foreground">Loading documents...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl flex items-center gap-2">
            <FileText className="w-6 h-6" />
            Subcontractor Documents
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Upload estimates and invoices - AI will automatically extract data
          </p>
        </CardHeader>
      </Card>

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        <Button
          variant={activeTab === 'estimates' ? 'default' : 'ghost'}
          onClick={() => setActiveTab('estimates')}
          className="rounded-b-none"
        >
          Estimates ({estimates.length})
        </Button>
        <Button
          variant={activeTab === 'invoices' ? 'default' : 'ghost'}
          onClick={() => setActiveTab('invoices')}
          className="rounded-b-none"
        >
          Invoices ({invoices.length})
        </Button>
      </div>

      {/* Estimates Tab */}
      {activeTab === 'estimates' && (
        <div className="space-y-2">
          {estimates.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <FileText className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                <h3 className="text-lg font-semibold mb-2">No Estimates Yet</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Upload subcontractor estimates and AI will extract the data automatically
                </p>
              </CardContent>
            </Card>
          ) : (
            estimates.map((estimate) => {
              const isExpanded = expandedDetails.has(estimate.id);
              const { materials, labor } = categorizeLineItems(estimate.line_items || []);

              return (
                <Card key={estimate.id} className="border hover:border-primary/50 transition-colors">
                  {/* Collapsed Row */}
                  <div 
                    className="flex items-center justify-between p-4 cursor-pointer"
                    onClick={() => toggleDetails(estimate.id)}
                  >
                    <div className="flex items-center gap-3 flex-1">
                      {isExpanded ? (
                        <ChevronDown className="w-5 h-5 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="w-5 h-5 text-muted-foreground" />
                      )}
                      {getStatusIcon(estimate.extraction_status)}
                      <div>
                        <h3 className="font-semibold text-lg">{estimate.company_name || estimate.file_name}</h3>
                        <p className="text-xs text-muted-foreground">
                          {new Date(estimate.uploaded_at).toLocaleDateString()}
                        </p>
                      </div>
                      {getStatusBadge(estimate.extraction_status)}
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-2xl font-bold text-primary">
                          ${(estimate.total_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          window.open(estimate.pdf_url, '_blank');
                        }}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteEstimate(estimate.id);
                        }}
                        className="text-destructive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {isExpanded && (
                    <div className="px-4 pb-4 space-y-4 border-t">
                      {/* Contact Info */}
                      {(estimate.contact_name || estimate.contact_email || estimate.contact_phone) && (
                        <div className="pt-4 grid grid-cols-3 gap-4 text-sm">
                          {estimate.contact_name && (
                            <div>
                              <p className="text-muted-foreground">Contact</p>
                              <p className="font-medium">{estimate.contact_name}</p>
                            </div>
                          )}
                          {estimate.contact_email && (
                            <div>
                              <p className="text-muted-foreground">Email</p>
                              <p className="font-medium">{estimate.contact_email}</p>
                            </div>
                          )}
                          {estimate.contact_phone && (
                            <div>
                              <p className="text-muted-foreground">Phone</p>
                              <p className="font-medium">{estimate.contact_phone}</p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Scope of Work */}
                      {estimate.scope_of_work && (
                        <div>
                          <h4 className="font-semibold mb-2 text-sm">Scope of Work</h4>
                          <p className="text-sm text-muted-foreground">{estimate.scope_of_work}</p>
                        </div>
                      )}

                      {/* Materials */}
                      {materials.length > 0 && (
                        <div>
                          <div className="flex items-center gap-2 mb-3">
                            <Package className="w-4 h-4 text-blue-600" />
                            <h4 className="font-semibold">Materials</h4>
                            <Badge variant="outline">{materials.length} items</Badge>
                          </div>
                          <div className="space-y-1">
                            {materials.map((item) => (
                              <div key={item.id} className="flex items-center justify-between py-2 px-3 bg-blue-50/50 rounded border border-blue-100">
                                <div className="flex-1">
                                  <p className="font-medium text-sm">{item.description}</p>
                                  {item.quantity && item.unit_price && (
                                    <p className="text-xs text-muted-foreground">
                                      {item.quantity} × ${item.unit_price.toFixed(2)}
                                    </p>
                                  )}
                                </div>
                                <p className="font-semibold">${item.total_price.toFixed(2)}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Labor */}
                      {labor.length > 0 && (
                        <div>
                          <div className="flex items-center gap-2 mb-3">
                            <Users className="w-4 h-4 text-amber-600" />
                            <h4 className="font-semibold">Labor</h4>
                            <Badge variant="outline">{labor.length} items</Badge>
                          </div>
                          <div className="space-y-1">
                            {labor.map((item) => (
                              <div key={item.id} className="flex items-center justify-between py-2 px-3 bg-amber-50/50 rounded border border-amber-100">
                                <div className="flex-1">
                                  <p className="font-medium text-sm">{item.description}</p>
                                  {item.quantity && item.unit_price && (
                                    <p className="text-xs text-muted-foreground">
                                      {item.quantity} hrs × ${item.unit_price.toFixed(2)}
                                    </p>
                                  )}
                                </div>
                                <p className="font-semibold">${item.total_price.toFixed(2)}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Exclusions */}
                      {estimate.exclusions && (
                        <div>
                          <h4 className="font-semibold mb-2 text-sm">Exclusions</h4>
                          <p className="text-sm text-muted-foreground">{estimate.exclusions}</p>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex gap-2 pt-3 border-t">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => window.open(estimate.pdf_url, '_blank')}
                        >
                          <Eye className="w-4 h-4 mr-2" />
                          View PDF
                        </Button>
                        {invoices.some(inv => inv.estimate_id === estimate.id) && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => showVarianceComparison(estimate)}
                          >
                            <TrendingUp className="w-4 h-4 mr-2" />
                            Compare to Invoice
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </Card>
              );
            })
          )}
          
          {/* Upload Button at Bottom */}
          <div className="pt-4 border-t">
            <Button onClick={() => setShowUploadDialog(true)} className="w-full">
              <Upload className="w-4 h-4 mr-2" />
              Upload New Estimate
            </Button>
          </div>
        </div>
      )}

      {/* Invoices Tab */}
      {activeTab === 'invoices' && (
        <div className="space-y-2">
          {invoices.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <FileText className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                <h3 className="text-lg font-semibold mb-2">No Invoices Yet</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Upload subcontractor invoices to compare with estimates
                </p>
              </CardContent>
            </Card>
          ) : (
            invoices.map((invoice) => {
              const relatedEstimate = estimates.find(e => e.id === invoice.estimate_id);
              const variance = relatedEstimate && invoice.total_amount 
                ? invoice.total_amount - (relatedEstimate.total_amount || 0)
                : null;
              const isExpanded = expandedDetails.has(invoice.id);
              const { materials, labor } = categorizeLineItems(invoice.line_items || []);

              return (
                <Card key={invoice.id} className="border hover:border-primary/50 transition-colors">
                  {/* Collapsed Row */}
                  <div 
                    className="flex items-center justify-between p-4 cursor-pointer"
                    onClick={() => toggleDetails(invoice.id)}
                  >
                    <div className="flex items-center gap-3 flex-1">
                      {isExpanded ? (
                        <ChevronDown className="w-5 h-5 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="w-5 h-5 text-muted-foreground" />
                      )}
                      {getStatusIcon(invoice.extraction_status)}
                      <div>
                        <h3 className="font-semibold text-lg">{invoice.company_name || invoice.file_name}</h3>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          {invoice.invoice_number && <span>Invoice #{invoice.invoice_number}</span>}
                          {invoice.invoice_date && <span>{new Date(invoice.invoice_date).toLocaleDateString()}</span>}
                        </div>
                      </div>
                      {getStatusBadge(invoice.extraction_status)}
                      <Badge variant={invoice.payment_status === 'paid' ? 'default' : 'outline'}>
                        {invoice.payment_status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-2xl font-bold text-red-700">
                          ${(invoice.total_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </p>
                        {variance !== null && (
                          <div className={`flex items-center gap-1 justify-end ${variance > 0 ? 'text-red-600' : variance < 0 ? 'text-green-600' : 'text-slate-600'}`}>
                            {variance > 0 ? <TrendingUp className="w-3 h-3" /> : variance < 0 ? <TrendingDown className="w-3 h-3" /> : null}
                            <span className="text-xs font-semibold">
                              {variance > 0 ? '+' : ''}${Math.abs(variance).toFixed(2)}
                            </span>
                          </div>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          window.open(invoice.pdf_url, '_blank');
                        }}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteInvoice(invoice.id);
                        }}
                        className="text-destructive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {isExpanded && (
                    <div className="px-4 pb-4 space-y-4 border-t">
                      {relatedEstimate && (
                        <div className="pt-4">
                          <p className="text-sm text-blue-600">
                            Linked to estimate: {relatedEstimate.company_name || relatedEstimate.file_name}
                          </p>
                        </div>
                      )}

                      {/* Materials */}
                      {materials.length > 0 && (
                        <div>
                          <div className="flex items-center gap-2 mb-3">
                            <Package className="w-4 h-4 text-blue-600" />
                            <h4 className="font-semibold">Materials</h4>
                            <Badge variant="outline">{materials.length} items</Badge>
                          </div>
                          <div className="space-y-1">
                            {materials.map((item) => (
                              <div key={item.id} className="flex items-center justify-between py-2 px-3 bg-blue-50/50 rounded border border-blue-100">
                                <div className="flex-1">
                                  <p className="font-medium text-sm">{item.description}</p>
                                  {item.quantity && item.unit_price && (
                                    <p className="text-xs text-muted-foreground">
                                      {item.quantity} × ${item.unit_price.toFixed(2)}
                                    </p>
                                  )}
                                </div>
                                <p className="font-semibold">${item.total_price.toFixed(2)}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Labor */}
                      {labor.length > 0 && (
                        <div>
                          <div className="flex items-center gap-2 mb-3">
                            <Users className="w-4 h-4 text-amber-600" />
                            <h4 className="font-semibold">Labor</h4>
                            <Badge variant="outline">{labor.length} items</Badge>
                          </div>
                          <div className="space-y-1">
                            {labor.map((item) => (
                              <div key={item.id} className="flex items-center justify-between py-2 px-3 bg-amber-50/50 rounded border border-amber-100">
                                <div className="flex-1">
                                  <p className="font-medium text-sm">{item.description}</p>
                                  {item.quantity && item.unit_price && (
                                    <p className="text-xs text-muted-foreground">
                                      {item.quantity} hrs × ${item.unit_price.toFixed(2)}
                                    </p>
                                  )}
                                </div>
                                <p className="font-semibold">${item.total_price.toFixed(2)}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex gap-2 pt-3 border-t">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => window.open(invoice.pdf_url, '_blank')}
                        >
                          <Eye className="w-4 h-4 mr-2" />
                          View PDF
                        </Button>
                        {relatedEstimate && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setSelectedEstimate(relatedEstimate);
                              setSelectedInvoice(invoice);
                              setShowVarianceDialog(true);
                            }}
                          >
                            <TrendingUp className="w-4 h-4 mr-2" />
                            Compare to Estimate
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </Card>
              );
            })
          )}

          {/* Upload Button at Bottom */}
          <div className="pt-4 border-t">
            <Button onClick={() => setShowInvoiceUploadDialog(true)} className="w-full">
              <Upload className="w-4 h-4 mr-2" />
              Upload New Invoice
            </Button>
          </div>
        </div>
      )}

      {/* Upload Estimate Dialog */}
      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload Subcontractor Estimate</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Drag and Drop Zone */}
            <div
              onDragOver={(e) => handleDragOver(e, 'estimate')}
              onDragLeave={(e) => handleDragLeave(e, 'estimate')}
              onDrop={(e) => handleDrop(e, 'estimate')}
              onClick={() => document.getElementById('estimate-file')?.click()}
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all ${
                isDraggingEstimate
                  ? 'border-primary bg-primary/5 scale-[1.02]'
                  : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50'
              }`}
            >
              <Upload className={`w-12 h-12 mx-auto mb-4 ${
                isDraggingEstimate ? 'text-primary animate-bounce' : 'text-muted-foreground'
              }`} />
              {selectedFile ? (
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-primary">{selectedFile.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Click to change or drag a different file
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm font-semibold">
                    {isDraggingEstimate ? 'Drop PDF here' : 'Drag & drop PDF here'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    or click to browse files
                  </p>
                </div>
              )}
              <input
                id="estimate-file"
                type="file"
                accept=".pdf"
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                className="hidden"
              />
            </div>
            <p className="text-xs text-muted-foreground text-center">
              AI will automatically extract company info, line items, and totals
            </p>

            <div className="space-y-2">
              <Label htmlFor="subcontractor">Subcontractor (Optional)</Label>
              <Select value={selectedSubcontractor || undefined} onValueChange={setSelectedSubcontractor}>
                <SelectTrigger>
                  <SelectValue placeholder="Select subcontractor..." />
                </SelectTrigger>
                <SelectContent>
                  {subcontractors.map((sub) => (
                    <SelectItem key={sub.id} value={sub.id}>
                      {sub.name} {sub.company_name && `(${sub.company_name})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-3 pt-4 border-t">
              <Button
                onClick={handleEstimateUpload}
                disabled={uploading || !selectedFile}
                className="flex-1"
              >
                {uploading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    Upload & Extract
                  </>
                )}
              </Button>
              <Button variant="outline" onClick={() => setShowUploadDialog(false)} disabled={uploading}>
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Upload Invoice Dialog */}
      <Dialog open={showInvoiceUploadDialog} onOpenChange={setShowInvoiceUploadDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload Subcontractor Invoice</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Drag and Drop Zone */}
            <div
              onDragOver={(e) => handleDragOver(e, 'invoice')}
              onDragLeave={(e) => handleDragLeave(e, 'invoice')}
              onDrop={(e) => handleDrop(e, 'invoice')}
              onClick={() => document.getElementById('invoice-file')?.click()}
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all ${
                isDraggingInvoice
                  ? 'border-primary bg-primary/5 scale-[1.02]'
                  : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50'
              }`}
            >
              <Upload className={`w-12 h-12 mx-auto mb-4 ${
                isDraggingInvoice ? 'text-primary animate-bounce' : 'text-muted-foreground'
              }`} />
              {selectedFile ? (
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-primary">{selectedFile.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Click to change or drag a different file
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm font-semibold">
                    {isDraggingInvoice ? 'Drop PDF here' : 'Drag & drop PDF here'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    or click to browse files
                  </p>
                </div>
              )}
              <input
                id="invoice-file"
                type="file"
                accept=".pdf"
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                className="hidden"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="linked-estimate">Link to Estimate (Optional)</Label>
              <Select value={selectedEstimateForInvoice || undefined} onValueChange={setSelectedEstimateForInvoice}>
                <SelectTrigger>
                  <SelectValue placeholder="Select estimate to compare..." />
                </SelectTrigger>
                <SelectContent>
                  {estimates.map((est) => (
                    <SelectItem key={est.id} value={est.id}>
                      {est.company_name || est.file_name}
                      {est.total_amount && ` - $${est.total_amount.toFixed(2)}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Link to an estimate to enable variance comparison
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="invoice-subcontractor">Subcontractor (Optional)</Label>
              <Select value={selectedSubcontractor || undefined} onValueChange={setSelectedSubcontractor}>
                <SelectTrigger>
                  <SelectValue placeholder="Select subcontractor..." />
                </SelectTrigger>
                <SelectContent>
                  {subcontractors.map((sub) => (
                    <SelectItem key={sub.id} value={sub.id}>
                      {sub.name} {sub.company_name && `(${sub.company_name})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-3 pt-4 border-t">
              <Button
                onClick={handleInvoiceUpload}
                disabled={uploading || !selectedFile}
                className="flex-1"
              >
                {uploading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    Upload & Extract
                  </>
                )}
              </Button>
              <Button variant="outline" onClick={() => setShowInvoiceUploadDialog(false)} disabled={uploading}>
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Variance Comparison Dialog */}
      {selectedEstimate && (
        <Dialog open={showVarianceDialog} onOpenChange={setShowVarianceDialog}>
          <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                Estimate vs Invoice Comparison
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-6">
              {/* Summary */}
              <div className="grid grid-cols-3 gap-4">
                <Card className="border-2 border-blue-200">
                  <CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground mb-1">Estimated</p>
                    <p className="text-3xl font-bold text-blue-700">
                      ${(selectedEstimate.total_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </p>
                  </CardContent>
                </Card>
                <Card className="border-2 border-red-200">
                  <CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground mb-1">Invoiced</p>
                    <p className="text-3xl font-bold text-red-700">
                      ${(selectedInvoice?.total_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </p>
                  </CardContent>
                </Card>
                <Card className={`border-2 ${
                  !selectedInvoice || !selectedInvoice.total_amount || !selectedEstimate.total_amount
                    ? 'border-slate-200'
                    : (selectedInvoice.total_amount - selectedEstimate.total_amount) > 0
                    ? 'border-red-300 bg-red-50'
                    : (selectedInvoice.total_amount - selectedEstimate.total_amount) < 0
                    ? 'border-green-300 bg-green-50'
                    : 'border-slate-200'
                }`}>
                  <CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground mb-1">Variance</p>
                    {selectedInvoice && selectedInvoice.total_amount && selectedEstimate.total_amount ? (
                      <>
                        <p className={`text-3xl font-bold ${
                          (selectedInvoice.total_amount - selectedEstimate.total_amount) > 0
                            ? 'text-red-700'
                            : (selectedInvoice.total_amount - selectedEstimate.total_amount) < 0
                            ? 'text-green-700'
                            : 'text-slate-700'
                        }`}>
                          {selectedInvoice.total_amount - selectedEstimate.total_amount > 0 ? '+' : ''}
                          ${(selectedInvoice.total_amount - selectedEstimate.total_amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </p>
                        <p className="text-sm text-muted-foreground mt-1">
                          {((selectedInvoice.total_amount - selectedEstimate.total_amount) / selectedEstimate.total_amount * 100).toFixed(1)}%
                        </p>
                      </>
                    ) : (
                      <p className="text-xl text-muted-foreground">N/A</p>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Line Items Comparison */}
              {selectedEstimate.line_items && selectedEstimate.line_items.length > 0 && (
                <div className="border rounded-lg overflow-hidden">
                  <div className="bg-slate-100 p-3 font-semibold border-b">
                    Line Items Comparison
                  </div>
                  <table className="w-full">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left p-3 font-semibold">Description</th>
                        <th className="text-right p-3 font-semibold">Estimated</th>
                        <th className="text-right p-3 font-semibold">Invoiced</th>
                        <th className="text-right p-3 font-semibold">Variance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {selectedEstimate.line_items.map((estItem) => {
                        const invItem = selectedInvoice?.line_items?.find(
                          inv => inv.description.toLowerCase() === estItem.description.toLowerCase()
                        );
                        const variance = invItem ? invItem.total_price - estItem.total_price : null;

                        return (
                          <tr key={estItem.id}>
                            <td className="p-3">
                              <p className="font-medium">{estItem.description}</p>
                              {estItem.quantity && estItem.unit_price && (
                                <p className="text-xs text-muted-foreground">
                                  Est: {estItem.quantity} × ${estItem.unit_price.toFixed(2)}
                                </p>
                              )}
                              {invItem?.quantity && invItem?.unit_price && (
                                <p className="text-xs text-muted-foreground">
                                  Inv: {invItem.quantity} × ${invItem.unit_price.toFixed(2)}
                                </p>
                              )}
                            </td>
                            <td className="p-3 text-right font-semibold">
                              ${estItem.total_price.toFixed(2)}
                            </td>
                            <td className="p-3 text-right font-semibold">
                              {invItem ? `$${invItem.total_price.toFixed(2)}` : '-'}
                            </td>
                            <td className={`p-3 text-right font-semibold ${
                              !variance ? 'text-muted-foreground' :
                              variance > 0 ? 'text-red-600' :
                              variance < 0 ? 'text-green-600' :
                              'text-slate-600'
                            }`}>
                              {variance !== null ? (
                                <>
                                  {variance > 0 ? '+' : ''}${variance.toFixed(2)}
                                </>
                              ) : (
                                'N/A'
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
