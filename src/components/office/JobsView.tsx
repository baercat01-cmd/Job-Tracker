import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Plus, MapPin, FileText, Clock, Camera, BarChart3, Archive, ArchiveRestore, Edit } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import type { Job } from '@/types';
import { CreateJobDialog } from './CreateJobDialog';
import { EditJobDialog } from './EditJobDialog';
import { JobDocuments } from './JobDocuments';
import { JobComponents } from './JobComponents';
import { JobTimeEntries } from './JobTimeEntries';
import { JobSummary } from './JobSummary';
import { JobDetailedView } from './JobDetailedView';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export function JobsView() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [stats, setStats] = useState<Record<string, any>>({});
  const [showArchived, setShowArchived] = useState(false);

  useEffect(() => {
    loadJobs();
  }, []);

  async function loadJobs() {
    try {
      const { data, error } = await supabase
        .from('jobs')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      setJobs(data || []);
      
      for (const job of data || []) {
        loadJobStats(job.id);
      }
    } catch (error) {
      console.error('Error loading jobs:', error);
    } finally {
      setLoading(false);
    }
  }

  async function toggleArchiveJob(jobId: string, currentStatus: string) {
    try {
      // Default to 'active' if status is undefined/null
      const effectiveStatus = currentStatus || 'active';
      const newStatus = effectiveStatus === 'archived' ? 'active' : 'archived';
      
      console.log('Archiving job:', { jobId, currentStatus: effectiveStatus, newStatus });
      
      const { data, error } = await supabase
        .from('jobs')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', jobId)
        .select();

      if (error) {
        console.error('Database error:', error);
        throw error;
      }
      
      console.log('Archive result:', data);

      toast.success(newStatus === 'archived' ? 'Job archived' : 'Job restored');
      loadJobs();
    } catch (error: any) {
      console.error('Error toggling job archive:', error);
      toast.error(`Failed to update job status: ${error.message || 'Unknown error'}`);
    }
  }

  async function loadJobStats(jobId: string) {
    const [timeData, logsData, photosData] = await Promise.all([
      supabase
        .from('time_entries')
        .select('total_hours, crew_count')
        .eq('job_id', jobId)
        .not('total_hours', 'is', null),
      supabase.from('daily_logs').select('id').eq('job_id', jobId),
      supabase.from('photos').select('id').eq('job_id', jobId),
    ]);

    // Calculate total man-hours (hours × crew count)
    const totalManHours = timeData.data?.reduce((sum, entry) => {
      const hours = entry.total_hours || 0;
      const crewCount = entry.crew_count || 1;
      return sum + (hours * crewCount);
    }, 0) || 0;

    setStats((prev) => ({
      ...prev,
      [jobId]: {
        totalHours: totalManHours.toFixed(1),
        logsCount: logsData.data?.length || 0,
        photosCount: photosData.data?.length || 0,
      },
    }));
  }

  async function reloadSelectedJob() {
    if (!selectedJob) return;
    
    try {
      const { data, error } = await supabase
        .from('jobs')
        .select('*')
        .eq('id', selectedJob.id)
        .single();

      if (error) throw error;
      if (data) setSelectedJob(data);
    } catch (error) {
      console.error('Error reloading job:', error);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">All Jobs</h2>
          <p className="text-sm text-muted-foreground">Manage job sites, documents, and assignments</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={showArchived ? 'default' : 'outline'}
            onClick={() => setShowArchived(!showArchived)}
          >
            <Archive className="w-4 h-4 mr-2" />
            {showArchived ? 'Hide Archived' : 'Show Archived'}
          </Button>
          <Button onClick={() => setShowCreateDialog(true)} className="gradient-primary">
            <Plus className="w-4 h-4 mr-2" />
            New Job
          </Button>
        </div>
      </div>

      {loading ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Loading jobs...
          </CardContent>
        </Card>
      ) : jobs.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No jobs found. Create your first job to get started.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {jobs
            .filter((job) => showArchived ? job.status === 'archived' : job.status === 'active')
            .map((job) => {
            const jobStats = stats[job.id] || {};
            return (
              <Card key={job.id} className="hover:shadow-md transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1 cursor-pointer" onClick={() => setSelectedJob(job)}>
                      <CardTitle className="text-lg">{job.name}</CardTitle>
                      <p className="text-sm font-medium text-muted-foreground mt-1">
                        {job.client_name}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Badge variant={job.status === 'active' ? 'default' : 'secondary'}>
                        {job.status}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleArchiveJob(job.id, job.status);
                        }}
                        className="h-7 px-2"
                      >
                        {job.status === 'archived' ? (
                          <>
                            <ArchiveRestore className="w-3 h-3 mr-1" />
                            <span className="text-xs">Restore</span>
                          </>
                        ) : (
                          <>
                            <Archive className="w-3 h-3 mr-1" />
                            <span className="text-xs">Archive</span>
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 cursor-pointer" onClick={() => setSelectedJob(job)}>
                  <div className="flex items-start text-sm">
                    <MapPin className="w-4 h-4 mr-2 mt-0.5 text-muted-foreground flex-shrink-0" />
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(job.address)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {job.address}
                    </a>
                  </div>
                  {job.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {job.description}
                    </p>
                  )}
                  <div className="grid grid-cols-3 gap-2 pt-2 border-t">
                    <div className="text-center">
                      <div className="flex items-center justify-center text-primary mb-1">
                        <Clock className="w-4 h-4" />
                      </div>
                      <p className="text-lg font-bold">{jobStats.totalHours || '0'}</p>
                      <p className="text-xs text-muted-foreground">Man-Hours</p>
                    </div>
                    <div className="text-center">
                      <div className="flex items-center justify-center text-primary mb-1">
                        <FileText className="w-4 h-4" />
                      </div>
                      <p className="text-lg font-bold">{jobStats.logsCount || 0}</p>
                      <p className="text-xs text-muted-foreground">Logs</p>
                    </div>
                    <div className="text-center">
                      <div className="flex items-center justify-center text-primary mb-1">
                        <Camera className="w-4 h-4" />
                      </div>
                      <p className="text-lg font-bold">{jobStats.photosCount || 0}</p>
                      <p className="text-xs text-muted-foreground">Photos</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <CreateJobDialog
        open={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        onSuccess={() => {
          setShowCreateDialog(false);
          loadJobs();
        }}
      />

      <EditJobDialog
        open={showEditDialog}
        job={selectedJob}
        onClose={() => setShowEditDialog(false)}
        onSuccess={() => {
          setShowEditDialog(false);
          loadJobs();
          reloadSelectedJob();
        }}
      />

      {/* Job Details Dialog */}
      <Dialog open={!!selectedJob} onOpenChange={() => setSelectedJob(null)}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="text-xl">
                {selectedJob?.name}
              </DialogTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowEditDialog(true);
                }}
              >
                <Edit className="w-4 h-4 mr-2" />
                Edit Job
              </Button>
            </div>
          </DialogHeader>
          {selectedJob && (
            <div className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Job Name</Label>
                  <p className="font-medium">{selectedJob.name}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Client</Label>
                  <p className="font-medium">{selectedJob.client_name}</p>
                </div>
                <div className="md:col-span-2">
                  <Label className="text-muted-foreground">Address</Label>
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectedJob.address)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-primary hover:underline flex items-center gap-1"
                  >
                    {selectedJob.address}
                    <MapPin className="w-4 h-4" />
                  </a>
                </div>
                {selectedJob.description && (
                  <div className="md:col-span-2">
                    <Label className="text-muted-foreground">Description</Label>
                    <p className="text-sm">{selectedJob.description}</p>
                  </div>
                )}
                {selectedJob.notes && (
                  <div className="md:col-span-2">
                    <Label className="text-muted-foreground">Notes</Label>
                    <p className="text-sm">{selectedJob.notes}</p>
                  </div>
                )}
              </div>

              <Tabs defaultValue="details" className="mt-6">
                <TabsList className="grid w-full grid-cols-5">
                  <TabsTrigger value="details" className="flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Details
                  </TabsTrigger>
                  <TabsTrigger value="summary" className="flex items-center gap-2">
                    <BarChart3 className="w-4 h-4" />
                    Summary
                  </TabsTrigger>
                  <TabsTrigger value="components">Components</TabsTrigger>
                  <TabsTrigger value="documents">Documents</TabsTrigger>
                  <TabsTrigger value="time">Time Entries</TabsTrigger>
                </TabsList>

                <TabsContent value="details" className="mt-4">
                  <JobDetailedView job={selectedJob} />
                </TabsContent>

                <TabsContent value="summary" className="mt-4">
                  <JobSummary job={selectedJob} />
                </TabsContent>

                <TabsContent value="components" className="mt-4">
                  <JobComponents job={selectedJob} onUpdate={reloadSelectedJob} />
                </TabsContent>

                <TabsContent value="documents" className="mt-4">
                  <JobDocuments job={selectedJob} onUpdate={reloadSelectedJob} />
                </TabsContent>

                <TabsContent value="time" className="mt-4">
                  <JobTimeEntries jobId={selectedJob.id} />
                </TabsContent>
              </Tabs>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
