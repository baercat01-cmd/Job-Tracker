import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FileText, Plus, Search, CheckCircle, XCircle, Clock, DollarSign, Briefcase } from 'lucide-react';
import { toast } from 'sonner';
import { QuoteIntakeForm } from './QuoteIntakeForm';

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
  draft: { label: 'Draft', color: 'bg-gray-500', icon: Clock },
  submitted: { label: 'Submitted', color: 'bg-blue-500', icon: FileText },
  estimated: { label: 'Estimated', color: 'bg-purple-500', icon: DollarSign },
  won: { label: 'Won', color: 'bg-green-500', icon: CheckCircle },
  lost: { label: 'Lost', color: 'bg-red-500', icon: XCircle },
};

export function QuotesView() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | Quote['status']>('all');
  const [showNewQuote, setShowNewQuote] = useState(false);
  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null);

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

  const filteredQuotes = quotes.filter(quote => {
    const matchesStatus = statusFilter === 'all' || quote.status === statusFilter;
    const matchesSearch = !searchTerm || 
      quote.customer_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      quote.project_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      quote.quote_number?.toLowerCase().includes(searchTerm.toLowerCase());
    
    return matchesStatus && matchesSearch;
  });

  const statusCounts = {
    all: quotes.length,
    draft: quotes.filter(q => q.status === 'draft').length,
    submitted: quotes.filter(q => q.status === 'submitted').length,
    estimated: quotes.filter(q => q.status === 'estimated').length,
    won: quotes.filter(q => q.status === 'won').length,
    lost: quotes.filter(q => q.status === 'lost').length,
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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Quote Intake System</h2>
          <p className="text-muted-foreground">
            Manage building quotes and convert them to active jobs
          </p>
        </div>
        <Button onClick={() => setShowNewQuote(true)} size="lg">
          <Plus className="w-4 h-4 mr-2" />
          New Quote
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search quotes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
        <div className="flex gap-2 overflow-x-auto">
          <Button
            variant={statusFilter === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStatusFilter('all')}
          >
            All ({statusCounts.all})
          </Button>
          {Object.entries(STATUS_CONFIG).map(([status, config]) => (
            <Button
              key={status}
              variant={statusFilter === status ? 'default' : 'outline'}
              size="sm"
              onClick={() => setStatusFilter(status as Quote['status'])}
            >
              {config.label} ({statusCounts[status as keyof typeof statusCounts]})
            </Button>
          ))}
        </div>
      </div>

      {/* Quotes Grid */}
      {filteredQuotes.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="w-16 h-16 mx-auto text-muted-foreground/50 mb-4" />
            <p className="text-lg font-medium text-muted-foreground">
              {searchTerm || statusFilter !== 'all' ? 'No quotes found' : 'No quotes yet'}
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              {searchTerm || statusFilter !== 'all' 
                ? 'Try adjusting your filters' 
                : 'Create your first quote to get started'
              }
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredQuotes.map((quote) => {
            const config = STATUS_CONFIG[quote.status];
            const Icon = config.icon;
            
            return (
              <Card 
                key={quote.id} 
                className="cursor-pointer hover:shadow-lg transition-shadow"
                onClick={() => setSelectedQuote(quote)}
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
                    <span className="font-medium">{quote.width}' × {quote.length}'</span>
                  </div>
                  {quote.estimated_price && (
                    <div className="text-sm">
                      <span className="text-muted-foreground">Estimate:</span>{' '}
                      <span className="font-medium text-green-600">
                        ${quote.estimated_price.toLocaleString()}
                      </span>
                    </div>
                  )}
                  {quote.job_id && (
                    <div className="flex items-center gap-1 text-sm text-green-600 font-medium">
                      <Briefcase className="w-3 h-3" />
                      Converted to Job
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground pt-2 border-t">
                    Created {new Date(quote.created_at).toLocaleDateString()}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* New Quote Dialog */}
      <Dialog open={showNewQuote} onOpenChange={setShowNewQuote}>
        <DialogContent className="max-w-7xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>New Quote</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto">
            <QuoteIntakeForm
              onSuccess={() => {
                setShowNewQuote(false);
                loadQuotes();
              }}
              onCancel={() => setShowNewQuote(false)}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Quote Dialog */}
      <Dialog open={!!selectedQuote} onOpenChange={(open) => !open && setSelectedQuote(null)}>
        <DialogContent className="max-w-7xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {selectedQuote?.project_name || selectedQuote?.customer_name || 'Edit Quote'}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto">
            {selectedQuote && (
              <QuoteIntakeForm
                quoteId={selectedQuote.id}
                onSuccess={() => {
                  setSelectedQuote(null);
                  loadQuotes();
                }}
                onCancel={() => setSelectedQuote(null)}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
