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
import { Plus, MapPin, FileText, Clock, Camera, BarChart3, Archive, ArchiveRestore, Edit, FileCheck, Calendar, AlertTriangle } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import type { Job } from '@/types';
import { CreateJobDialog } from './CreateJobDialog';
import { EditJobDialog } from './EditJobDialog';
import { JobDocuments } from './JobDocuments';
import { JobComponents } from './JobComponents';
import { JobTimeEntries } from './JobTimeEntries';
import { JobDetailedView } from './JobDetailedView';
import { MaterialsManagement } from './MaterialsManagement';
import { JobPhotosView } from './JobPhotosView';
import { JobSchedule } from './JobSchedule';
import { useAuth } from '@/hooks/useAuth';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Package, Calendar as CalendarIcon } from 'lucide-react';
import { TodayTasksSidebar } from './TodayTasksSidebar';

interface JobsViewProps {
  showArchived?: boolean;
  selectedJobId?: string | null;
}

export function JobsView({ showArchived = false, selectedJobId }: JobsViewProps) {
  const { profile } = useAuth();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [selectedTab, setSelectedTab] = useState('overview');
  const [stats, setStats] = useState<Record<string, any>>({});
  const [statusFilter, setStatusFilter] = useState<'active' | 'quoting' | 'on_hold'>('active');

  useEffect(() => {
    loadJobs();
  }, []);

  // Auto-scroll to selected job when selectedJobId changes
  useEffect(() => {
    if (selectedJobId && selectedJob?.id !== selectedJobId) {
      const job = jobs.find(j => j.id === selectedJobId);
      if (job) {
        setSelectedJob(job);
        // Scroll to job card if it exists in the DOM
        setTimeout(() => {
          const element = document.getElementById(`job-${selectedJobId}`);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 100);
      }
    }
  }, [selectedJobId, jobs]);

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

  async function toggleJobStatus(jobId: string, currentStatus: string) {
    try {
      const newStatus = currentStatus === 'quoting' ? 'active' : 'quoting';
      
      const { error } = await supabase
        .from('jobs')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', jobId);

      if (error) throw error;

      toast.success(newStatus === 'active' ? 'Job activated - now visible to crew' : 'Job set to quoting - hidden from crew');
      loadJobs();
    } catch (error: any) {
      console.error('Error toggling job status:', error);
      toast.error('Failed to update job status');
    }
  }

  async function setJobOnHold(jobId: string) {
    try {
      const { error } = await supabase
        .from('jobs')
        .update({ status: 'on_hold', updated_at: new Date().toISOString() })
        .eq('id', jobId);

      if (error) throw error;

      toast.success('Job put on hold - hidden from crew');
      loadJobs();
    } catch (error: any) {
      console.error('Error setting job on hold:', error);
      toast.error('Failed to update job status');
    }
  }

  async function activateJob(jobId: string) {
    try {
      const { error } = await supabase
        .from('jobs')
        .update({ status: 'active', updated_at: new Date().toISOString() })
        .eq('id', jobId);

      if (error) throw error;

      toast.success('Job activated - now visible to crew');
      loadJobs();
    } catch (error: any) {
      console.error('Error activating job:', error);
      toast.error('Failed to update job status');
    }
  }

  async function loadJobStats(jobId: string) {
    const [clockInData, photosData] = await Promise.all([
      // Only load CLOCK-IN hours (component_id IS NULL) for progress calculation
      supabase
        .from('time_entries')
        .select('total_hours, crew_count')
        .eq('job_id', jobId)
        .is('component_id', null) // Only clock-in hours
        .not('total_hours', 'is', null),
      supabase.from('photos').select('id').eq('job_id', jobId),
    ]);

    // Calculate total clock-in man-hours (hours × crew count)
    const totalClockInHours = clockInData.data?.reduce((sum, entry) => {
      const hours = entry.total_hours || 0;
      const crewCount = entry.crew_count || 1;
      return sum + (hours * crewCount);
    }, 0) || 0;

    setStats((prev) => ({
      ...prev,
      [jobId]: {
        totalHours: totalClockInHours.toFixed(2),
        totalClockInHours: totalClockInHours,
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
    <div className="flex flex-col lg:flex-row gap-3 sm:gap-6">
      {/* Left Sidebar - Today's Tasks */}
      {!showArchived && (
        <div className="w-full lg:w-80 flex-shrink-0 overflow-hidden relative max-h-[400px] lg:max-h-[calc(100vh-12rem)]">
          {/* Gold accent border on the right */}
          <div className="absolute top-0 right-0 w-1 h-full bg-gradient-to-b from-yellow-500 via-yellow-600 to-yellow-700 opacity-80 rounded-full"></div>
          <TodayTasksSidebar onJobSelect={(jobId) => setSelectedJobId(jobId)} />
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 space-y-3 sm:space-y-4 overflow-y-auto pr-1 sm:pr-2 pl-1 sm:pl-2">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white rounded-lg p-3 sm:p-4 shadow-lg border border-yellow-600/20">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight">{showArchived ? 'Archived Jobs' : 'Jobs'}</h2>
            <p className="text-xs sm:text-sm text-slate-300">
              {showArchived ? 'View and restore archived jobs' : 'Manage job sites, documents, and assignments'}
            </p>
          </div>
          {!showArchived && (
            <Button 
              onClick={() => setShowCreateDialog(true)} 
              size="sm"
              className="bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-600 hover:to-yellow-700 text-black font-semibold shadow-lg border-2 border-yellow-400 w-full sm:w-auto"
            >
              <Plus className="w-4 h-4 mr-2" />
              New Job
            </Button>
          )}
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
        ) : showArchived ? (
          <div className="grid gap-3 sm:gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
            {jobs
              .filter((job) => job.status === 'archived')
              .filter((job) => !job.is_internal)
              .map((job) => {
              const jobStats = stats[job.id] || {};
              
              // Calculate scheduling status
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              const startDate = job.projected_start_date ? new Date(job.projected_start_date + 'T00:00:00') : null;
              const endDate = job.projected_end_date ? new Date(job.projected_end_date + 'T00:00:00') : null;
              
              const isNotStarted = startDate && startDate > today;
              const isInProgress = startDate && startDate <= today && (!endDate || endDate >= today);
              const isOverdue = endDate && endDate < today && job.status !== 'completed';
              
              return (
                <Card
                  id={`job-${job.id}`}
                  key={job.id}
                  className={`hover:shadow-md transition-all ${
                    selectedJobId === job.id ? 'ring-2 ring-primary shadow-lg' : ''
                  } ${
                    isOverdue ? 'border-destructive border-2' : ''
                  }`}
                >
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1 cursor-pointer" onClick={() => setSelectedJob(job)}>
                        <CardTitle className="text-lg">{job.name}</CardTitle>
                        <p className="text-sm font-medium text-muted-foreground mt-1">
                          {job.client_name}
                        </p>
                        {/* Scheduling Status Badges */}
                        {(startDate || endDate) && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {isNotStarted && (
                              <Badge variant="secondary" className="text-xs">
                                <Calendar className="w-3 h-3 mr-1" />
                                Starts {startDate?.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                              </Badge>
                            )}
                            {isInProgress && startDate && (
                              <Badge variant="default" className="text-xs">
                                <Calendar className="w-3 h-3 mr-1" />
                                In Progress
                              </Badge>
                            )}
                            {isOverdue && (
                              <Badge variant="destructive" className="text-xs">
                                <AlertTriangle className="w-3 h-3 mr-1" />
                                Overdue
                              </Badge>
                            )}
                            {endDate && !isOverdue && (
                              <Badge variant="outline" className="text-xs">
                                Due {endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                              </Badge>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <Badge variant={
                          job.status === 'active' ? 'default' : 
                          job.status === 'quoting' ? 'secondary' : 
                          'outline'
                        }>
                          {job.status === 'quoting' ? 'Quoting' : job.status}
                        </Badge>
                        <div className="flex flex-col gap-1">
                          {/* On Hold button - show for active, quoting, and on_hold jobs */}
                          {(job.status === 'active' || job.status === 'quoting' || job.status === 'on_hold') && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (job.status === 'on_hold') {
                                  activateJob(job.id);
                                } else {
                                  setJobOnHold(job.id);
                                }
                              }}
                              className="h-7 px-2 justify-start"
                            >
                              {job.status === 'on_hold' ? (
                                <>
                                  <FileCheck className="w-3 h-3 mr-1" />
                                  <span className="text-xs">Activate</span>
                                </>
                              ) : (
                                <>
                                  <AlertTriangle className="w-3 h-3 mr-1" />
                                  <span className="text-xs">Hold</span>
                                </>
                              )}
                            </Button>
                          )}
                          {/* Archive button */}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleArchiveJob(job.id, job.status);
                            }}
                            className="h-7 px-2 justify-start"
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
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="cursor-pointer" onClick={() => {
                      setSelectedJob(job);
                      setSelectedTab('overview');
                    }}>
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
                    </div>

                    {/* Progress Bar - Clock-In Hours Only */}
                    {job.estimated_hours && job.estimated_hours > 0 && (
                      <div className="space-y-1.5 pt-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Progress (Clock-In)</span>
                          <span className="font-bold">
                            {((jobStats.totalClockInHours || 0) / job.estimated_hours * 100).toFixed(0)}%
                          </span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div 
                            className={`h-full transition-all duration-500 ${
                              (jobStats.totalClockInHours || 0) > job.estimated_hours
                                ? 'bg-destructive'
                                : 'bg-primary'
                            }`}
                            style={{ 
                              width: `${Math.min(((jobStats.totalClockInHours || 0) / job.estimated_hours * 100), 100)}%` 
                            }}
                          />
                        </div>
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>{jobStats.totalHours || '0'} / {job.estimated_hours} hrs</span>
                          {(jobStats.totalClockInHours || 0) > job.estimated_hours && (
                            <span className="text-destructive font-medium">Over Budget</span>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="flex justify-end pt-2 border-t">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedJob(job);
                          setSelectedTab('photos');
                        }}
                      >
                        <Camera className="w-3 h-3 mr-1" />
                        {jobStats.photosCount || 0} Photos
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <div className="grid gap-3 sm:gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
            {/* Active Column */}
            <div className="flex flex-col min-w-0">
              <div className="bg-gradient-to-r from-green-100 to-green-50 border-2 border-green-200 rounded-lg p-2 sm:p-3 mb-2 sm:mb-3">
                <h3 className="text-base sm:text-lg font-bold text-green-900 flex items-center gap-2">
                  Active
                  <Badge variant="secondary" className="bg-green-200 text-green-900">
                    {jobs.filter(j => j.status === 'active' && !j.is_internal).length}
                  </Badge>
                </h3>
              </div>
              <div className="space-y-2 sm:space-y-3">
                {jobs
                  .filter((job) => job.status === 'active' && !job.is_internal)
                  .map((job) => {
                    const jobStats = stats[job.id] || {};
                    
                    // Calculate scheduling status
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    const startDate = job.projected_start_date ? new Date(job.projected_start_date + 'T00:00:00') : null;
                    const endDate = job.projected_end_date ? new Date(job.projected_end_date + 'T00:00:00') : null;
                    
                    const isNotStarted = startDate && startDate > today;
                    const isInProgress = startDate && startDate <= today && (!endDate || endDate >= today);
                    const isOverdue = endDate && endDate < today && job.status !== 'completed';
                    
                    return (
                      <Card
                        id={`job-${job.id}`}
                        key={job.id}
                        className={`hover:shadow-md transition-all ${
                          selectedJobId === job.id ? 'ring-2 ring-primary shadow-lg' : ''
                        } ${
                          isOverdue ? 'border-destructive border-2' : ''
                        }`}
                      >
                        <CardHeader className="pb-1.5 pt-2 px-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 cursor-pointer min-w-0" onClick={() => setSelectedJob(job)}>
                              <CardTitle className="text-sm leading-tight">{job.name}</CardTitle>
                              <p className="text-[10px] font-medium text-muted-foreground mt-0.5">
                                {job.client_name}
                              </p>
                              {/* Scheduling Status Badges */}
                              {(startDate || endDate) && (
                                <div className="flex flex-wrap gap-0.5 mt-1">
                                  {isNotStarted && (
                                    <Badge variant="secondary" className="text-[9px] py-0 h-3.5 px-1">
                                      <Calendar className="w-2 h-2 mr-0.5" />
                                      {startDate?.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                    </Badge>
                                  )}
                                  {isInProgress && startDate && (
                                    <Badge variant="default" className="text-[9px] py-0 h-3.5 px-1">
                                      In Progress
                                    </Badge>
                                  )}
                                  {isOverdue && (
                                    <Badge variant="destructive" className="text-[9px] py-0 h-3.5 px-1">
                                      <AlertTriangle className="w-2 h-2 mr-0.5" />
                                      Overdue
                                    </Badge>
                                  )}
                                  {endDate && !isOverdue && (
                                    <Badge variant="outline" className="text-[9px] py-0 h-3.5 px-1">
                                      {endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                    </Badge>
                                  )}
                                </div>
                              )}
                            </div>
                            <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setJobOnHold(job.id);
                                }}
                                className="h-5 px-1 text-[9px]"
                              >
                                <AlertTriangle className="w-2.5 h-2.5 mr-0.5" />
                                Hold
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleArchiveJob(job.id, job.status);
                                }}
                                className="h-5 px-1 text-[9px]"
                              >
                                <Archive className="w-2.5 h-2.5 mr-0.5" />
                                Archive
                              </Button>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="pt-1.5 px-3 pb-2 space-y-1.5">
                          <div className="cursor-pointer" onClick={() => {
                            setSelectedJob(job);
                            setSelectedTab('overview');
                          }}>
                            <div className="flex items-start text-[10px]">
                              <MapPin className="w-2.5 h-2.5 mr-1 mt-0.5 text-muted-foreground flex-shrink-0" />
                              <a
                                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(job.address)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:underline leading-tight"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {job.address}
                              </a>
                            </div>
                          </div>

                          {/* Progress Bar - Clock-In Hours Only */}
                          {job.estimated_hours && job.estimated_hours > 0 && (
                            <div className="space-y-0.5">
                              <div className="flex items-center justify-between text-[9px]">
                                <span className="text-muted-foreground">Progress</span>
                                <span className="font-bold">
                                  {((jobStats.totalClockInHours || 0) / job.estimated_hours * 100).toFixed(0)}%
                                </span>
                              </div>
                              <div className="h-1 bg-muted rounded-full overflow-hidden">
                                <div 
                                  className={`h-full transition-all duration-500 ${
                                    (jobStats.totalClockInHours || 0) > job.estimated_hours
                                      ? 'bg-destructive'
                                      : 'bg-primary'
                                  }`}
                                  style={{ 
                                    width: `${Math.min(((jobStats.totalClockInHours || 0) / job.estimated_hours * 100), 100)}%` 
                                  }}
                                />
                              </div>
                              <div className="flex items-center justify-between text-[9px] text-muted-foreground">
                                <span>{jobStats.totalHours || '0'} / {job.estimated_hours} hrs</span>
                                {(jobStats.totalClockInHours || 0) > job.estimated_hours && (
                                  <span className="text-destructive font-medium">Over</span>
                                )}
                              </div>
                            </div>
                          )}

                          <div className="flex justify-end pt-0.5 border-t">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-5 px-1 text-[9px]"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedJob(job);
                                setSelectedTab('photos');
                              }}
                            >
                              <Camera className="w-2.5 h-2.5 mr-0.5" />
                              {jobStats.photosCount || 0}
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
              </div>
            </div>

            {/* Quoting Column */}
            <div className="flex flex-col">
              <div className="bg-gradient-to-r from-yellow-100 to-yellow-50 border-2 border-yellow-200 rounded-lg p-3 mb-3">
                <h3 className="text-lg font-bold text-yellow-900 flex items-center gap-2">
                  Quoting
                  <Badge variant="secondary" className="bg-yellow-200 text-yellow-900">
                    {jobs.filter(j => j.status === 'quoting' && !j.is_internal).length}
                  </Badge>
                </h3>
              </div>
              <div className="space-y-2 sm:space-y-3">
                {jobs
                  .filter((job) => job.status === 'quoting' && !job.is_internal)
                  .map((job) => {
                    const jobStats = stats[job.id] || {};
                    
                    return (
                      <Card
                        id={`job-${job.id}`}
                        key={job.id}
                        className={`hover:shadow-md transition-all ${
                          selectedJobId === job.id ? 'ring-2 ring-primary shadow-lg' : ''
                        }`}
                      >
                        <CardHeader className="p-3 sm:p-6">
                          <div className="flex flex-col sm:flex-row items-start justify-between gap-2 sm:gap-0">
                            <div className="flex-1 cursor-pointer w-full sm:w-auto" onClick={() => setSelectedJob(job)}>
                              <CardTitle className="text-base sm:text-lg">{job.name}</CardTitle>
                              <p className="text-xs sm:text-sm font-medium text-muted-foreground mt-1">
                                {job.client_name}
                              </p>
                            </div>
                            <div className="flex flex-col items-end gap-2">
                              <div className="flex flex-col gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    activateJob(job.id);
                                  }}
                                  className="h-7 px-2 justify-start"
                                >
                                  <FileCheck className="w-3 h-3 mr-1" />
                                  <span className="text-xs">Activate</span>
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleArchiveJob(job.id, job.status);
                                  }}
                                  className="h-7 px-2 justify-start"
                                >
                                  <Archive className="w-3 h-3 mr-1" />
                                  <span className="text-xs">Archive</span>
                                </Button>
                              </div>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="p-3 sm:p-6 space-y-2 sm:space-y-3">
                          <div className="cursor-pointer" onClick={() => {
                            setSelectedJob(job);
                            setSelectedTab('overview');
                          }}>
                            <div className="flex items-start text-xs sm:text-sm">
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
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
              </div>
            </div>

            {/* On Hold Column */}
            <div className="flex flex-col">
              <div className="bg-gradient-to-r from-orange-100 to-orange-50 border-2 border-orange-200 rounded-lg p-3 mb-3">
                <h3 className="text-lg font-bold text-orange-900 flex items-center gap-2">
                  On Hold
                  <Badge variant="secondary" className="bg-orange-200 text-orange-900">
                    {jobs.filter(j => j.status === 'on_hold' && !j.is_internal).length}
                  </Badge>
                </h3>
              </div>
              <div className="space-y-2 sm:space-y-3">
                {jobs
                  .filter((job) => job.status === 'on_hold' && !job.is_internal)
                  .map((job) => {
                    const jobStats = stats[job.id] || {};
                    
                    return (
                      <Card
                        id={`job-${job.id}`}
                        key={job.id}
                        className={`hover:shadow-md transition-all ${
                          selectedJobId === job.id ? 'ring-2 ring-primary shadow-lg' : ''
                        }`}
                      >
                        <CardHeader className="p-3 sm:p-6">
                          <div className="flex flex-col sm:flex-row items-start justify-between gap-2 sm:gap-0">
                            <div className="flex-1 cursor-pointer w-full sm:w-auto" onClick={() => setSelectedJob(job)}>
                              <CardTitle className="text-base sm:text-lg">{job.name}</CardTitle>
                              <p className="text-xs sm:text-sm font-medium text-muted-foreground mt-1">
                                {job.client_name}
                              </p>
                            </div>
                            <div className="flex flex-col items-end gap-2">
                              <div className="flex flex-col gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    activateJob(job.id);
                                  }}
                                  className="h-7 px-2 justify-start"
                                >
                                  <FileCheck className="w-3 h-3 mr-1" />
                                  <span className="text-xs">Activate</span>
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleArchiveJob(job.id, job.status);
                                  }}
                                  className="h-7 px-2 justify-start"
                                >
                                  <Archive className="w-3 h-3 mr-1" />
                                  <span className="text-xs">Archive</span>
                                </Button>
                              </div>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="p-3 sm:p-6 space-y-2 sm:space-y-3">
                          <div className="cursor-pointer" onClick={() => {
                            setSelectedJob(job);
                            setSelectedTab('overview');
                          }}>
                            <div className="flex items-start text-xs sm:text-sm">
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
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
              </div>
            </div>
          </div>
        )}
      </div>

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
        <DialogContent className="h-screen max-w-5xl flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-3 border-b shrink-0">
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
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <div className="space-y-2 sm:space-y-3">
                <div className="grid md:grid-cols-4 gap-3 text-sm">
                  <div>
                    <Label className="text-xs text-muted-foreground">Job Name</Label>
                    <p className="font-medium">{selectedJob.name}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Client</Label>
                    <p className="font-medium">{selectedJob.client_name}</p>
                  </div>
                  <div className="md:col-span-2">
                    <Label className="text-xs text-muted-foreground">Address</Label>
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectedJob.address)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-primary hover:underline flex items-center gap-1 text-sm"
                    >
                      {selectedJob.address}
                      <MapPin className="w-3 h-3" />
                    </a>
                  </div>
                  {selectedJob.description && (
                    <div className="md:col-span-4">
                      <Label className="text-xs text-muted-foreground">Description</Label>
                      <p className="text-sm">{selectedJob.description}</p>
                    </div>
                  )}
                  {selectedJob.notes && (
                    <div className="md:col-span-4">
                      <Label className="text-xs text-muted-foreground">Notes</Label>
                      <p className="text-sm">{selectedJob.notes}</p>
                    </div>
                  )}
                  {(selectedJob.projected_start_date || selectedJob.projected_end_date) && (
                    <div className="md:col-span-4 grid md:grid-cols-2 gap-3 pt-2 border-t">
                      {selectedJob.projected_start_date && (
                        <div>
                          <Label className="text-xs text-muted-foreground">Projected Start</Label>
                          <p className="text-sm font-medium flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {new Date(selectedJob.projected_start_date + 'T00:00:00').toLocaleDateString('en-US', {
                              month: 'long',
                              day: 'numeric',
                              year: 'numeric',
                            })}
                          </p>
                        </div>
                      )}
                      {selectedJob.projected_end_date && (
                        <div>
                          <Label className="text-xs text-muted-foreground">Projected End</Label>
                          <p className="text-sm font-medium flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {new Date(selectedJob.projected_end_date + 'T00:00:00').toLocaleDateString('en-US', {
                              month: 'long',
                              day: 'numeric',
                              year: 'numeric',
                            })}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <Tabs value={selectedTab} onValueChange={setSelectedTab} className="mt-3">
                  <TabsList className="grid w-full grid-cols-6 h-9">
                    <TabsTrigger value="overview" className="flex items-center gap-1.5 text-xs">
                      <BarChart3 className="w-3.5 h-3.5" />
                      Overview
                    </TabsTrigger>
                    <TabsTrigger value="components" className="text-xs">Components</TabsTrigger>
                    <TabsTrigger value="schedule" className="flex items-center gap-1.5 text-xs">
                      <CalendarIcon className="w-3.5 h-3.5" />
                      Schedule
                    </TabsTrigger>
                    <TabsTrigger value="documents" className="text-xs">Documents</TabsTrigger>
                    <TabsTrigger value="materials" className="flex items-center gap-1.5 text-xs">
                      <Package className="w-3.5 h-3.5" />
                      Materials
                    </TabsTrigger>
                    <TabsTrigger value="photos" className="flex items-center gap-1.5 text-xs">
                      <Camera className="w-3.5 h-3.5" />
                      Photos
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="overview" className="mt-3">
                    <JobDetailedView job={selectedJob} />
                  </TabsContent>

                  <TabsContent value="components" className="mt-3">
                    <JobComponents job={selectedJob} onUpdate={reloadSelectedJob} />
                  </TabsContent>

                  <TabsContent value="schedule" className="mt-3">
                    <JobSchedule job={selectedJob} />
                  </TabsContent>

                  <TabsContent value="documents" className="mt-3">
                    <JobDocuments job={selectedJob} onUpdate={reloadSelectedJob} />
                  </TabsContent>

                  <TabsContent value="materials" className="mt-3">
                    {profile?.id && <MaterialsManagement job={selectedJob} userId={profile.id} />}
                  </TabsContent>

                  <TabsContent value="photos" className="mt-3">
                    <JobPhotosView job={selectedJob} />
                  </TabsContent>
                </Tabs>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
