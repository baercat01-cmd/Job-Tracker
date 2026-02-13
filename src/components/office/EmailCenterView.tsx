import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Mail, 
  Send, 
  Inbox, 
  RefreshCw,
  Users,
  Package,
  Briefcase,
  Search,
  Filter
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { JobCommunications } from './JobCommunications';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export function EmailCenterView() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<any[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [emailStats, setEmailStats] = useState({
    total: 0,
    customer: 0,
    vendor: 0,
    subcontractor: 0,
    unread: 0,
  });
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      await Promise.all([loadJobs(), loadEmailStats()]);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadJobs() {
    const { data, error } = await supabase
      .from('jobs')
      .select('id, name, job_number, client_name, status')
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (error) throw error;
    setJobs(data || []);
  }

  async function loadEmailStats() {
    const { data, error } = await supabase
      .from('job_emails')
      .select('entity_category, is_read');

    if (error) throw error;

    const total = data?.length || 0;
    const customer = data?.filter(e => e.entity_category === 'customer').length || 0;
    const vendor = data?.filter(e => e.entity_category === 'vendor').length || 0;
    const subcontractor = data?.filter(e => e.entity_category === 'subcontractor').length || 0;
    const unread = data?.filter(e => !e.is_read && e.entity_category).length || 0;

    setEmailStats({ total, customer, vendor, subcontractor, unread });
  }

  async function handleSyncEmails() {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('sync-emails', {
        body: { action: 'fetch' },
      });

      if (error) throw error;

      toast.success(data.message || 'Emails synced successfully');
      await loadEmailStats();
    } catch (error: any) {
      console.error('Error syncing emails:', error);
      toast.error('Failed to sync emails: ' + error.message);
    } finally {
      setSyncing(false);
    }
  }

  const filteredJobs = jobs.filter(job => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      job.name.toLowerCase().includes(query) ||
      job.job_number?.toLowerCase().includes(query) ||
      job.client_name?.toLowerCase().includes(query)
    );
  });

  const selectedJob = selectedJobId === 'all' ? null : jobs.find(j => j.id === selectedJobId);

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading email center...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats Overview */}
      <Card className="border-2 border-blue-200 bg-gradient-to-r from-blue-50 to-cyan-50">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Mail className="w-6 h-6 text-blue-600" />
              Email Communications Overview
            </CardTitle>
            <Button onClick={handleSyncEmails} variant="outline" disabled={syncing}>
              <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
              Sync All
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-5 gap-4">
            <div className="text-center p-3 bg-white rounded-lg border">
              <p className="text-2xl font-bold text-blue-600">{emailStats.total}</p>
              <p className="text-xs text-muted-foreground mt-1">Total Emails</p>
            </div>
            <div className="text-center p-3 bg-white rounded-lg border">
              <div className="flex items-center justify-center gap-2 mb-1">
                <Users className="w-4 h-4 text-green-600" />
                <p className="text-2xl font-bold text-green-600">{emailStats.customer}</p>
              </div>
              <p className="text-xs text-muted-foreground mt-1">Customers</p>
            </div>
            <div className="text-center p-3 bg-white rounded-lg border">
              <div className="flex items-center justify-center gap-2 mb-1">
                <Package className="w-4 h-4 text-orange-600" />
                <p className="text-2xl font-bold text-orange-600">{emailStats.vendor}</p>
              </div>
              <p className="text-xs text-muted-foreground mt-1">Vendors</p>
            </div>
            <div className="text-center p-3 bg-white rounded-lg border">
              <div className="flex items-center justify-center gap-2 mb-1">
                <Briefcase className="w-4 h-4 text-blue-600" />
                <p className="text-2xl font-bold text-blue-600">{emailStats.subcontractor}</p>
              </div>
              <p className="text-xs text-muted-foreground mt-1">Subcontractors</p>
            </div>
            <div className="text-center p-3 bg-white rounded-lg border">
              <p className="text-2xl font-bold text-red-600">{emailStats.unread}</p>
              <p className="text-xs text-muted-foreground mt-1">Unread</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Job Selector */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <label className="text-sm font-medium mb-2 block">Select Job</label>
              <Select value={selectedJobId} onValueChange={setSelectedJobId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a job..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Jobs - Combined View</SelectItem>
                  {filteredJobs.map((job) => (
                    <SelectItem key={job.id} value={job.id}>
                      {job.job_number ? `#${job.job_number} - ` : ''}{job.name} ({job.client_name})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <label className="text-sm font-medium mb-2 block">Search Jobs</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by name, number, or client..."
                  className="pl-10"
                />
              </div>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Email Communications Display */}
      {selectedJob ? (
        <div className="space-y-4">
          <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white rounded-lg p-4 shadow-lg">
            <h3 className="text-xl font-bold">
              {selectedJob.job_number ? `#${selectedJob.job_number} - ` : ''}{selectedJob.name}
            </h3>
            <p className="text-slate-300">Client: {selectedJob.client_name}</p>
          </div>
          <JobCommunications job={selectedJob} />
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <Inbox className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">All Jobs Email View</h3>
            <p className="text-muted-foreground mb-4">
              Select a specific job from the dropdown above to view and manage its email communications
            </p>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 max-w-md mx-auto">
              <p className="text-sm text-blue-800">
                💡 <strong>Tip:</strong> Use the search box to quickly find jobs by name, number, or client
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
