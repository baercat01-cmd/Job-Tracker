import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  FileText, Plus, Search, CheckCircle, XCircle, Clock, DollarSign, 
  Briefcase, Archive, Lock, History, Eye, Download, Calendar, RefreshCw 
} from 'lucide-react';
import { toast } from 'sonner';
import { formatMeasurement } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/useAuth';

interface Quote {
  id: string;
  quote_number: string | null;
  proposal_number: string | null;
  status: 'draft' | 'submitted' | 'estimated' | 'won' | 'lost' | 'signed';
  customer_name: string | null;
  project_name: string | null;
  width: number;
  length: number;
  estimated_price: number | null;
  created_at: string;
  updated_at: string;
  submitted_at: string | null;
  estimated_at: string | null;
  converted_at: string | null;
  job_id: string | null;
  current_version: number | null;
  signed_version: number | null;
}

interface ProposalVersion {
  id: string;
  quote_id: string;
  version_number: number;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  customer_address: string | null;
  project_name: string | null;
  width: number;
  length: number;
  eave: number | null;
  pitch: string | null;
  estimated_price: number | null;
  is_signed: boolean;
  signed_at: string | null;
  signed_by: string | null;
  change_notes: string | null;
  created_by: string | null;
  created_at: string;
}

const STATUS_CONFIG = {
  draft: { label: 'Draft', color: 'bg-slate-700', icon: Clock },
  submitted: { label: 'Submitted', color: 'bg-blue-700', icon: FileText },
  estimated: { label: 'Estimated', color: 'bg-purple-700', icon: DollarSign },
  won: { label: 'Won', color: 'bg-green-700', icon: CheckCircle },
  signed: { label: 'Signed', color: 'bg-emerald-700', icon: Lock },
  lost: { label: 'Lost', color: 'bg-red-800', icon: XCircle },
};

export function QuotesView() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | Quote['status']>('all');
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(null);
  const [versions, setVersions] = useState<ProposalVersion[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [showSignDialog, setShowSignDialog] = useState(false);
  const [signQuoteId, setSignQuoteId] = useState<string | null>(null);
  const [changeNotes, setChangeNotes] = useState('');
  const [restoringVersion, setRestoringVersion] = useState(false);

  useEffect(() => {
    loadQuotes();

    // Subscribe to real-time changes
    const channel = supabase
      .channel('quotes_changes')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'quotes' },
        () => {
          loadQuotes();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function loadQuotes() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('quotes')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setQuotes(data || []);
    } catch (error: any) {
      console.error('Error loading quotes:', error);
      toast.error('Failed to load quotes');
    } finally {
      setLoading(false);
    }
  }

  async function loadVersionHistory(quoteId: string) {
    try {
      setLoadingVersions(true);
      setSelectedQuoteId(quoteId);

      const { data, error } = await supabase
        .from('proposal_versions')
        .select('*')
        .eq('quote_id', quoteId)
        .order('version_number', { ascending: false });

      if (error) throw error;
      setVersions(data || []);
      setShowVersionHistory(true);
    } catch (error: any) {
      console.error('Error loading version history:', error);
      toast.error('Failed to load version history');
    } finally {
      setLoadingVersions(false);
    }
  }

  async function createNewVersion(quoteId: string, notes?: string) {
    try {
      // Get the current quote to find the job_id
      const { data: currentQuote, error: quoteError } = await supabase
        .from('quotes')
        .select('job_id, proposal_number')
        .eq('id', quoteId)
        .single();

      if (quoteError) throw quoteError;

      // Call the database function to create a new version
      const { data, error } = await supabase.rpc('create_proposal_version', {
        p_quote_id: quoteId
      });

      if (error) throw error;

      // If notes provided, update the version with notes
      if (notes && data) {
        const { error: updateError } = await supabase
          .from('proposal_versions')
          .update({ 
            change_notes: notes,
            created_by: profile?.id 
          })
          .eq('id', data);

        if (updateError) throw updateError;
      }

      toast.success('New proposal version created');
      return data;
    } catch (error: any) {
      console.error('Error creating version:', error);
      toast.error('Failed to create new version');
      throw error;
    }
  }

  async function submitForEstimating(quoteId: string, e: React.MouseEvent) {
    e.stopPropagation();
    
    if (!confirm('Submit this quote for estimating? It will move to the Jobs page in the Quoting column where you can build the detailed proposal and estimate.')) {
      return;
    }
    
    try {
      // Get the quote details
      const { data: quote, error: quoteError } = await supabase
        .from('quotes')
        .select('*')
        .eq('id', quoteId)
        .single();

      if (quoteError) throw quoteError;

      // Create a snapshot version before converting
      await createNewVersion(quoteId, 'Quote submitted for estimating - moved to Jobs page');

      // Create a new job from the quote with 'quoting' status (will get quote number)
      const { data: newJob, error: jobError } = await supabase
        .from('jobs')
        .insert({
          name: quote.project_name || quote.customer_name || 'Untitled Job',
          client_name: quote.customer_name || '',
          address: quote.customer_address || '',
          description: `From Quote #${quote.quote_number}${quote.project_name ? ' - ' + quote.project_name : ''}`,
          status: 'quoting', // Start in quoting status - will auto-get quote number from trigger
          estimated_hours: 0,
          is_internal: false,
        })
        .select()
        .single();

      if (jobError) throw jobError;

      // Update the quote to reference the new job
      const { error: updateError } = await supabase
        .from('quotes')
        .update({ 
          status: 'won',
          converted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          job_id: newJob.id,
        })
        .eq('id', quoteId);

      if (updateError) throw updateError;

      toast.success(
        `✅ Quote submitted for estimating!\n\nQuote #${quote.quote_number} is now in the Jobs page (Quoting column) where you can:\n• Build detailed proposal\n• Add materials & financials\n• Create proposal versions\n• Set as contract when ready`,
        { duration: 5000 }
      );
      loadQuotes();
      
      // Navigate to jobs page to show the new quote
      navigate('/office?tab=jobs');
    } catch (error: any) {
      console.error('Error submitting quote for estimating:', error);
      toast.error('Failed to submit quote for estimating');
    }
  }

  async function markQuoteAsLost(quoteId: string, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      const { error } = await supabase
        .from('quotes')
        .update({ 
          status: 'lost',
          updated_at: new Date().toISOString(),
        })
        .eq('id', quoteId);

      if (error) throw error;
      toast.success('Quote marked as lost and archived');
      loadQuotes();
    } catch (error: any) {
      console.error('Error marking quote as lost:', error);
      toast.error('Failed to update quote');
    }
  }

  async function openSignDialog(quoteId: string, e: React.MouseEvent) {
    e.stopPropagation();
    setSignQuoteId(quoteId);
    setChangeNotes('');
    setShowSignDialog(true);
  }

  async function restoreVersionToWorkbook(versionId: string, versionNumber: number) {
    if (!confirm(
      `⚠️ This will replace the current working materials with Version ${versionNumber}'s snapshot.\n\n` +
      `Any unsaved changes to the current workbook will be lost.\n\n` +
      `Are you sure you want to restore Version ${versionNumber}?`
    )) {
      return;
    }

    try {
      setRestoringVersion(true);
      
      const { data, error } = await supabase.rpc('restore_version_to_workbook', {
        p_version_id: versionId
      });

      if (error) throw error;

      toast.success(
        `✅ Version ${versionNumber} restored to workbook!\n\n` +
        `${data.sheets_restored} sheets restored\n` +
        `${data.items_restored} materials restored\n` +
        `${data.financial_rows_restored} financial rows restored\n\n` +
        `You can now edit these materials in the Materials tab.`,
        { duration: 6000 }
      );
      
      setShowVersionHistory(false);
    } catch (error: any) {
      console.error('Error restoring version:', error);
      toast.error('Failed to restore version: ' + error.message);
    } finally {
      setRestoringVersion(false);
    }
  }

  async function markQuoteAsSigned() {
    if (!signQuoteId) return;
    
    try {
      // Get the quote details
      const { data: quote, error: quoteError } = await supabase
        .from('quotes')
        .select('*')
        .eq('id', signQuoteId)
        .single();

      if (quoteError) throw quoteError;

      if (!quote.job_id) {
        toast.error('This quote must be converted to a job first');
        return;
      }

      if (!quote.estimated_price || quote.estimated_price <= 0) {
        toast.error('Quote must have a valid estimated price');
        return;
      }

      // Check if budget already exists for this job
      const { data: existingBudget } = await supabase
        .from('job_budgets')
        .select('id')
        .eq('job_id', quote.job_id)
        .maybeSingle();

      if (existingBudget) {
        toast.error('A budget already exists for this job. Please edit the existing budget instead.');
        return;
      }

      // Create a signed version snapshot
      const versionId = await createNewVersion(signQuoteId, changeNotes || 'Proposal signed and locked');

      // Mark the version as signed
      const { error: versionSignError } = await supabase
        .from('proposal_versions')
        .update({
          is_signed: true,
          signed_at: new Date().toISOString(),
          signed_by: profile?.id,
        })
        .eq('id', versionId);

      if (versionSignError) throw versionSignError;

      // Get the version number that was just created
      const { data: signedVersion } = await supabase
        .from('proposal_versions')
        .select('version_number')
        .eq('id', versionId)
        .single();

      // Get any subcontractor estimates for this quote
      const { data: subEstimates } = await supabase
        .from('subcontractor_estimates')
        .select('*')
        .eq('quote_id', quote.id)
        .not('total_amount', 'is', null);

      const totalSubcontractorBudget = subEstimates?.reduce((sum, est) => {
        const markup = (est.markup_percent || 0) / 100;
        return sum + (est.total_amount * (1 + markup));
      }, 0) || 0;

      const subcontractorBreakdown = subEstimates?.map(est => ({
        description: est.company_name || 'Subcontractor',
        scope: est.scope_of_work,
        cost: est.total_amount,
        markup: est.markup_percent || 0,
      })) || [];

      // Create the job budget from the quote
      const { error: budgetError } = await supabase
        .from('job_budgets')
        .insert({
          job_id: quote.job_id,
          total_quoted_price: quote.estimated_price,
          total_subcontractor_budget: totalSubcontractorBudget > 0 ? totalSubcontractorBudget : null,
          subcontractor_breakdown: subcontractorBreakdown,
          target_profit_margin: 15, // Default 15% target margin
          estimated_labor_hours: null,
          labor_rate_per_hour: 30, // Default $30/hr
          total_labor_budget: null,
          total_materials_budget: null,
          materials_breakdown: [],
          total_equipment_budget: null,
          equipment_breakdown: [],
          other_costs: null,
          overhead_allocation: null,
          created_by: profile?.id,
        });

      if (budgetError) throw budgetError;

      // Update the quote status to 'signed' and record the signed version
      const { error: updateError } = await supabase
        .from('quotes')
        .update({ 
          status: 'signed',
          signed_version: signedVersion?.version_number,
          updated_at: new Date().toISOString(),
        })
        .eq('id', signQuoteId);

      if (updateError) throw updateError;

      toast.success(`✅ Proposal Version ${signedVersion?.version_number} signed and locked!\n\nBudget created: $${quote.estimated_price.toLocaleString()}\n\nYou can now track costs in the Financials tab.`);
      setShowSignDialog(false);
      setSignQuoteId(null);
      setChangeNotes('');
      loadQuotes();
    } catch (error: any) {
      console.error('Error marking quote as signed:', error);
      toast.error('Failed to create budget from proposal: ' + error.message);
    }
  }

  const getFilteredQuotes = (status: 'all' | Quote['status']) => {
    return quotes.filter(quote => {
      const matchesStatus = status === 'all' ? quote.status !== 'lost' : quote.status === status;
      const matchesSearch = !searchTerm || 
        quote.customer_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        quote.project_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        quote.quote_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        quote.proposal_number?.toLowerCase().includes(searchTerm.toLowerCase());
      
      return matchesStatus && matchesSearch;
    });
  };

  const statusCounts = {
    all: quotes.filter(q => q.status !== 'lost').length,
    draft: quotes.filter(q => q.status === 'draft').length,
    submitted: quotes.filter(q => q.status === 'submitted').length,
    estimated: quotes.filter(q => q.status === 'estimated').length,
    won: quotes.filter(q => q.status === 'won').length,
    signed: quotes.filter(q => q.status === 'signed').length,
    lost: quotes.filter(q => q.status === 'lost').length,
  };

  const renderQuoteCard = (quote: Quote) => {
    const config = STATUS_CONFIG[quote.status];
    const Icon = config.icon;
    
    return (
      <Card 
        key={quote.id} 
        className="cursor-pointer hover:shadow-lg transition-shadow"
        onClick={() => navigate(`/office/quotes/${quote.id}`)}
      >
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <CardTitle className="text-lg">
                {quote.project_name || quote.customer_name || 'Untitled Quote'}
              </CardTitle>
              <div className="flex items-center gap-2 mt-1">
                {quote.quote_number && (
                  <p className="text-sm text-muted-foreground">
                    Quote #{quote.quote_number}
                  </p>
                )}
                {quote.proposal_number && (
                  <p className="text-sm text-muted-foreground">
                    • Proposal #{quote.proposal_number}
                  </p>
                )}
              </div>
              {quote.current_version && (
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className="text-xs">
                    Version {quote.current_version}
                  </Badge>
                  {quote.signed_version && (
                    <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-700 border-emerald-300">
                      <Lock className="w-3 h-3 mr-1" />
                      Signed v{quote.signed_version}
                    </Badge>
                  )}
                </div>
              )}
            </div>
            <Badge className={`${config.color} text-white`}>
              <Icon className="w-3 h-3 mr-1" />
              {config.label}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {quote.customer_name && (
            <div className="text-sm">
              <span className="text-muted-foreground">Customer:</span>{' '}
              <span className="font-medium">{quote.customer_name}</span>
            </div>
          )}
          <div className="text-sm">
            <span className="text-muted-foreground">Size:</span>{' '}
            <span className="font-medium">{formatMeasurement(quote.width)} × {formatMeasurement(quote.length)}</span>
          </div>
          {quote.estimated_price && (
            <div className="text-sm">
              <span className="text-muted-foreground">Estimate:</span>{' '}
              <span className="font-medium text-green-700">
                ${quote.estimated_price.toLocaleString()}
              </span>
            </div>
          )}
          {quote.job_id && (
            <div className="flex items-center gap-1 text-sm text-green-700 font-medium">
              <Briefcase className="w-3 h-3" />
              Converted to Job
            </div>
          )}

          {/* Version History Button */}
          {quote.current_version && (
            <Button
              size="sm"
              variant="outline"
              className="w-full mt-2"
              onClick={(e) => {
                e.stopPropagation();
                loadVersionHistory(quote.id);
              }}
            >
              <History className="w-3 h-3 mr-2" />
              View Version History ({quote.current_version} {quote.current_version === 1 ? 'version' : 'versions'})
            </Button>
          )}
          
          {/* Action buttons for estimated quotes */}
          {quote.status === 'estimated' && !quote.job_id && (
            <div className="flex gap-2 pt-2 border-t" onClick={(e) => e.stopPropagation()}>
              <Button
                size="sm"
                variant="outline"
                className="flex-1 text-white bg-gradient-to-r from-blue-700 to-blue-800 hover:from-blue-800 hover:to-blue-900 border-2 border-blue-600 font-semibold"
                onClick={(e) => submitForEstimating(quote.id, e)}
              >
                <FileText className="w-3 h-3 mr-1" />
                Submit for Estimating
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1 text-white bg-gradient-to-r from-red-700 to-red-800 hover:from-red-800 hover:to-red-900 border-2 border-red-600 font-semibold"
                onClick={(e) => markQuoteAsLost(quote.id, e)}
              >
                <XCircle className="w-3 h-3 mr-1" />
                Lost
              </Button>
            </div>
          )}
          
          {/* Action button for won quotes with jobs */}
          {quote.status === 'won' && quote.job_id && (
            <div className="pt-2 border-t" onClick={(e) => e.stopPropagation()}>
              <Button
                size="sm"
                variant="outline"
                className="w-full text-white bg-gradient-to-r from-emerald-700 to-emerald-800 hover:from-emerald-800 hover:to-emerald-900 border-2 border-emerald-600 font-semibold"
                onClick={(e) => openSignDialog(quote.id, e)}
              >
                <Lock className="w-3 h-3 mr-1" />
                Sign Proposal & Lock Budget
              </Button>
            </div>
          )}
          
          {/* Signed indicator */}
          {quote.status === 'signed' && (
            <div className="pt-2 border-t">
              <div className="bg-emerald-50 border-2 border-emerald-200 rounded-lg p-2 text-center">
                <Lock className="w-4 h-4 text-emerald-700 mx-auto mb-1" />
                <p className="text-xs font-semibold text-emerald-900">Proposal Signed</p>
                <p className="text-xs text-emerald-700">
                  Version {quote.signed_version} Locked - Budget Active
                </p>
              </div>
            </div>
          )}
          
          <div className="text-xs text-muted-foreground pt-2 border-t">
            Created {new Date(quote.created_at).toLocaleDateString()}
          </div>
        </CardContent>
      </Card>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-muted-foreground">Loading quotes...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between bg-gradient-to-r from-slate-900 via-black to-slate-900 text-white rounded-lg p-4 shadow-lg border-2 border-yellow-500">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Quote Intake System</h2>
          <p className="text-yellow-400">
            Manage building quotes and convert them to active jobs
          </p>
        </div>
        <Button onClick={() => navigate('/office/quotes/new')} size="lg" className="bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-600 hover:to-yellow-700 text-black font-semibold shadow-lg border-2 border-yellow-400">
          <Plus className="w-4 h-4 mr-2" />
          New Quote
        </Button>
      </div>

      {/* Search Bar - Above Tabs */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search quotes by customer, project, or quote number..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as typeof activeTab)} className="space-y-4">
        <TabsList className="grid w-full grid-cols-7">
          <TabsTrigger value="all" className="relative">
            All
            <Badge variant="secondary" className="ml-2 h-5 min-w-5 px-1">
              {statusCounts.all}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="draft" className="relative">
            <Clock className="w-3 h-3 mr-1" />
            Draft
            <Badge variant="secondary" className="ml-2 h-5 min-w-5 px-1">
              {statusCounts.draft}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="submitted" className="relative">
            <FileText className="w-3 h-3 mr-1" />
            Submitted
            <Badge variant="secondary" className="ml-2 h-5 min-w-5 px-1">
              {statusCounts.submitted}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="estimated" className="relative">
            <DollarSign className="w-3 h-3 mr-1" />
            Estimated
            <Badge variant="secondary" className="ml-2 h-5 min-w-5 px-1">
              {statusCounts.estimated}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="won" className="relative">
            <CheckCircle className="w-3 h-3 mr-1" />
            Won
            <Badge variant="secondary" className="ml-2 h-5 min-w-5 px-1">
              {statusCounts.won}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="signed" className="relative">
            <Lock className="w-3 h-3 mr-1" />
            Signed
            <Badge variant="secondary" className="ml-2 h-5 min-w-5 px-1">
              {statusCounts.signed}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="lost" className="relative">
            <Archive className="w-3 h-3 mr-1" />
            Lost
            <Badge variant="secondary" className="ml-2 h-5 min-w-5 px-1">
              {statusCounts.lost}
            </Badge>
          </TabsTrigger>
        </TabsList>

        {/* Tab Content - All */}
        <TabsContent value="all" className="space-y-4">
          {getFilteredQuotes('all').length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <FileText className="w-16 h-16 mx-auto text-muted-foreground/50 mb-4" />
                <p className="text-lg font-medium text-muted-foreground">
                  {searchTerm ? 'No quotes found' : 'No active quotes yet'}
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  {searchTerm ? 'Try adjusting your search' : 'Create your first quote to get started'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {getFilteredQuotes('all').map(renderQuoteCard)}
            </div>
          )}
        </TabsContent>

        {/* Tab Content - Draft */}
        <TabsContent value="draft" className="space-y-4">
          {getFilteredQuotes('draft').length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Clock className="w-16 h-16 mx-auto text-muted-foreground/50 mb-4" />
                <p className="text-lg font-medium text-muted-foreground">No draft quotes</p>
                <p className="text-sm text-muted-foreground mt-2">
                  {searchTerm ? 'Try adjusting your search' : 'All quotes have been submitted or converted'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {getFilteredQuotes('draft').map(renderQuoteCard)}
            </div>
          )}
        </TabsContent>

        {/* Tab Content - Submitted */}
        <TabsContent value="submitted" className="space-y-4">
          {getFilteredQuotes('submitted').length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <FileText className="w-16 h-16 mx-auto text-muted-foreground/50 mb-4" />
                <p className="text-lg font-medium text-muted-foreground">No submitted quotes</p>
                <p className="text-sm text-muted-foreground mt-2">
                  {searchTerm ? 'Try adjusting your search' : 'No quotes are awaiting estimation'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {getFilteredQuotes('submitted').map(renderQuoteCard)}
            </div>
          )}
        </TabsContent>

        {/* Tab Content - Estimated */}
        <TabsContent value="estimated" className="space-y-4">
          {getFilteredQuotes('estimated').length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <DollarSign className="w-16 h-16 mx-auto text-muted-foreground/50 mb-4" />
                <p className="text-lg font-medium text-muted-foreground">No estimated quotes</p>
                <p className="text-sm text-muted-foreground mt-2">
                  {searchTerm ? 'Try adjusting your search' : 'No quotes are awaiting customer decision'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {getFilteredQuotes('estimated').map(renderQuoteCard)}
            </div>
          )}
        </TabsContent>

        {/* Tab Content - Won */}
        <TabsContent value="won" className="space-y-4">
          {getFilteredQuotes('won').length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <CheckCircle className="w-16 h-16 mx-auto text-muted-foreground/50 mb-4" />
                <p className="text-lg font-medium text-muted-foreground">No won quotes</p>
                <p className="text-sm text-muted-foreground mt-2">
                  {searchTerm ? 'Try adjusting your search' : 'No quotes have been won yet'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {getFilteredQuotes('won').map(renderQuoteCard)}
            </div>
          )}
        </TabsContent>

        {/* Tab Content - Signed */}
        <TabsContent value="signed" className="space-y-4">
          {getFilteredQuotes('signed').length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Lock className="w-16 h-16 mx-auto text-muted-foreground/50 mb-4" />
                <p className="text-lg font-medium text-muted-foreground">No signed proposals</p>
                <p className="text-sm text-muted-foreground mt-2">
                  {searchTerm ? 'Try adjusting your search' : 'No proposals have been signed yet'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {getFilteredQuotes('signed').map(renderQuoteCard)}
            </div>
          )}
        </TabsContent>

        {/* Tab Content - Lost (Archived) */}
        <TabsContent value="lost" className="space-y-4">
          {getFilteredQuotes('lost').length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Archive className="w-16 h-16 mx-auto text-muted-foreground/50 mb-4" />
                <p className="text-lg font-medium text-muted-foreground">No lost quotes</p>
                <p className="text-sm text-muted-foreground mt-2">
                  {searchTerm ? 'Try adjusting your search' : 'No quotes have been marked as lost'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {getFilteredQuotes('lost').map(renderQuoteCard)}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Version History Dialog */}
      <Dialog open={showVersionHistory} onOpenChange={setShowVersionHistory}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="w-5 h-5" />
              Proposal Version History
            </DialogTitle>
            <DialogDescription>
              View all versions of this proposal. Signed versions are locked and cannot be modified.
            </DialogDescription>
          </DialogHeader>

          {loadingVersions ? (
            <div className="py-12 text-center">
              <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-muted-foreground">Loading version history...</p>
            </div>
          ) : versions.length === 0 ? (
            <div className="py-12 text-center">
              <History className="w-16 h-16 mx-auto text-muted-foreground/50 mb-4" />
              <p className="text-lg font-medium text-muted-foreground">No versions found</p>
              <p className="text-sm text-muted-foreground mt-2">
                Versions are automatically created when proposals are modified
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {versions.map((version) => (
                <Card key={version.id} className={version.is_signed ? 'border-emerald-300 bg-emerald-50' : ''}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-lg">Version {version.version_number}</CardTitle>
                          {version.is_signed && (
                            <Badge className="bg-emerald-600">
                              <Lock className="w-3 h-3 mr-1" />
                              Signed
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                          <Calendar className="w-3 h-3" />
                          <span>
                            {new Date(version.created_at).toLocaleDateString('en-US', {
                              month: 'long',
                              day: 'numeric',
                              year: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                        {version.is_signed && version.signed_at && (
                          <div className="flex items-center gap-2 mt-1 text-sm text-emerald-700 font-medium">
                            <Lock className="w-3 h-3" />
                            <span>
                              Signed on {new Date(version.signed_at).toLocaleDateString('en-US', {
                                month: 'long',
                                day: 'numeric',
                                year: 'numeric',
                              })}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            restoreVersionToWorkbook(version.id, version.version_number);
                          }}
                          disabled={restoringVersion}
                          className="text-blue-700 border-blue-300 hover:bg-blue-50"
                        >
                          {restoringVersion ? (
                            <>
                              <div className="w-3 h-3 mr-2 border-2 border-blue-700 border-t-transparent rounded-full animate-spin" />
                              Restoring...
                            </>
                          ) : (
                            <>
                              <RefreshCw className="w-3 h-3 mr-2" />
                              Restore to Workbook
                            </>
                          )}
                        </Button>
                        <Button size="sm" variant="outline">
                          <Eye className="w-3 h-3 mr-2" />
                          View Details
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-xs text-muted-foreground">Customer</Label>
                        <p className="font-medium">{version.customer_name || 'N/A'}</p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Project</Label>
                        <p className="font-medium">{version.project_name || 'N/A'}</p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Size</Label>
                        <p className="font-medium">
                          {formatMeasurement(version.width)} × {formatMeasurement(version.length)}
                        </p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Estimated Price</Label>
                        <p className="font-medium text-green-700">
                          {version.estimated_price ? `$${version.estimated_price.toLocaleString()}` : 'N/A'}
                        </p>
                      </div>
                    </div>
                    {version.change_notes && (
                      <div className="pt-3 border-t">
                        <Label className="text-xs text-muted-foreground">Notes</Label>
                        <p className="text-sm mt-1">{version.change_notes}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Sign Proposal Dialog */}
      <Dialog open={showSignDialog} onOpenChange={setShowSignDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="w-5 h-5 text-emerald-600" />
              Sign Proposal & Lock Budget
            </DialogTitle>
            <DialogDescription>
              This will create a locked version of the proposal and establish it as the official contract budget.
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-semibold text-blue-900 mb-2">What happens when you sign:</h4>
              <ul className="space-y-1 text-sm text-blue-800">
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>A new version snapshot is created and locked (cannot be modified)</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>A job budget is created using the proposal price</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>You can track actual costs vs. budget in the Financials tab</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>Previous versions remain accessible in version history</span>
                </li>
              </ul>
            </div>

            <div>
              <Label>Notes (Optional)</Label>
              <Textarea
                value={changeNotes}
                onChange={(e) => setChangeNotes(e.target.value)}
                placeholder="Add notes about this signed version (e.g., 'Client requested extended warranty')"
                rows={3}
                className="mt-2"
              />
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button variant="outline" onClick={() => setShowSignDialog(false)}>
                Cancel
              </Button>
              <Button 
                onClick={markQuoteAsSigned}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                <Lock className="w-4 h-4 mr-2" />
                Sign & Lock Proposal
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
