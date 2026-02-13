import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileText, Plus, Search, CheckCircle, XCircle, Clock, DollarSign, Briefcase, Archive } from 'lucide-react';
import { toast } from 'sonner';
import { formatMeasurement } from '@/lib/utils';

interface Quote {
  id: string;
  quote_number: string | null;
  status: 'draft' | 'submitted' | 'estimated' | 'won' | 'lost';
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
}

const STATUS_CONFIG = {
  draft: { label: 'Draft', color: 'bg-slate-700', icon: Clock },
  submitted: { label: 'Submitted', color: 'bg-blue-700', icon: FileText },
  estimated: { label: 'Estimated', color: 'bg-purple-700', icon: DollarSign },
  won: { label: 'Won', color: 'bg-green-700', icon: CheckCircle },
  lost: { label: 'Lost', color: 'bg-red-800', icon: XCircle },
};

export function QuotesView() {
  const navigate = useNavigate();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | Quote['status']>('all');

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

  async function markQuoteAsWon(quoteId: string, e: React.MouseEvent) {
    e.stopPropagation();
    
    if (!confirm('Convert this quote to an active job? This will create a job with a job number and move it to "Prepping" status.')) {
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

      // Create a new job from the quote
      const { data: newJob, error: jobError } = await supabase
        .from('jobs')
        .insert({
          name: quote.project_name || quote.customer_name || 'Untitled Job',
          client_name: quote.customer_name || '',
          address: quote.customer_address || '',
          description: `Converted from Quote #${quote.quote_number}`,
          status: 'prepping', // Start in prepping status
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

      toast.success(`Quote converted to Job #${newJob.job_number}`);
      loadQuotes();
    } catch (error: any) {
      console.error('Error converting quote to job:', error);
      toast.error('Failed to convert quote to job');
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

  const getFilteredQuotes = (status: 'all' | Quote['status']) => {
    return quotes.filter(quote => {
      const matchesStatus = status === 'all' ? quote.status !== 'lost' : quote.status === status;
      const matchesSearch = !searchTerm || 
        quote.customer_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        quote.project_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        quote.quote_number?.toLowerCase().includes(searchTerm.toLowerCase());
      
      return matchesStatus && matchesSearch;
    });
  };

  const statusCounts = {
    all: quotes.filter(q => q.status !== 'lost').length,
    draft: quotes.filter(q => q.status === 'draft').length,
    submitted: quotes.filter(q => q.status === 'submitted').length,
    estimated: quotes.filter(q => q.status === 'estimated').length,
    won: quotes.filter(q => q.status === 'won').length,
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
              {quote.quote_number && (
                <p className="text-sm text-muted-foreground mt-1">
                  #{quote.quote_number}
                </p>
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
          
          {/* Action buttons for estimated quotes */}
          {quote.status === 'estimated' && !quote.job_id && (
            <div className="flex gap-2 pt-2 border-t" onClick={(e) => e.stopPropagation()}>
              <Button
                size="sm"
                variant="outline"
                className="flex-1 text-white bg-gradient-to-r from-green-700 to-green-800 hover:from-green-800 hover:to-green-900 border-2 border-green-600 font-semibold"
                onClick={(e) => markQuoteAsWon(quote.id, e)}
              >
                <CheckCircle className="w-3 h-3 mr-1" />
                Won
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
        <TabsList className="grid w-full grid-cols-6">
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
    </div>
  );
}
