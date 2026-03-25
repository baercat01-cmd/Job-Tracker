import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { CreateJobDialog } from '@/components/office/CreateJobDialog';
import { toast } from 'sonner';
import { Plus, Search, ChevronRight } from 'lucide-react';

type JobRow = {
  id: string;
  name: string | null;
  client_name: string | null;
  address: string | null;
  quote_number: string | null;
  status: string | null;
  created_at: string | null;
};

export default function EstimatorHomePage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [query, setQuery] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  async function loadJobs() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('jobs')
        .select('id, name, client_name, address, quote_number, status, created_at')
        .neq('status', 'archived')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      setJobs((data || []) as JobRow[]);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Could not load jobs');
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadJobs();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return jobs;
    return jobs.filter((j) => {
      const hay = `${j.name ?? ''} ${j.client_name ?? ''} ${j.address ?? ''} ${j.quote_number ?? ''} ${j.status ?? ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [jobs, query]);

  return (
    <div className="min-h-[100dvh] bg-slate-50">
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Estimator</h1>
            <p className="text-sm text-slate-600">Pick a job to start designing in 2D/3D, or create a new job.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => navigate('/office')} title="Back to office dashboard">
              Exit
            </Button>
            <Button onClick={() => setShowCreate(true)} className="rounded-none font-bold">
              <Plus className="w-4 h-4 mr-2" />
              New Job
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm uppercase tracking-widest text-slate-600">Jobs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search jobs (name, customer, address, quote #)…"
                  className="pl-9"
                />
              </div>
              <Button variant="outline" onClick={loadJobs}>
                Refresh
              </Button>
            </div>

            {loading ? (
              <div className="text-sm text-muted-foreground py-10 text-center">Loading jobs…</div>
            ) : filtered.length === 0 ? (
              <div className="text-sm text-muted-foreground py-10 text-center">No jobs found.</div>
            ) : (
              <div className="divide-y">
                {filtered.slice(0, 50).map((job) => (
                  <button
                    key={job.id}
                    className="w-full text-left py-3 flex items-center justify-between gap-3 hover:bg-slate-50 px-2 rounded"
                    onClick={() => navigate(`/office/estimator/build?jobId=${encodeURIComponent(job.id)}`)}
                  >
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900 truncate">
                        {job.name || '(Untitled job)'}
                        {job.quote_number ? <span className="ml-2 text-xs text-slate-500">#{job.quote_number}</span> : null}
                      </div>
                      <div className="text-xs text-slate-600 truncate">
                        {job.client_name || '—'}
                        {job.address ? ` · ${job.address}` : ''}
                        {job.status ? ` · ${job.status}` : ''}
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <CreateJobDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onSuccess={async () => {
          setShowCreate(false);
          await loadJobs();
        }}
      />
    </div>
  );
}

