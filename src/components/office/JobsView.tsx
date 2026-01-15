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
import { Plus, MapPin, FileText, Clock, Camera, BarChart3, Archive, ArchiveRestore, Edit, FileCheck, Calendar, AlertTriangle, ListTodo, Users, Wrench } from 'lucide-react';
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
import { ShopTasksManagement } from './ShopTasksManagement';
import { SubcontractorScheduling } from './SubcontractorScheduling';

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
  const [shopTasks, setShopTasks] = useState<any[]>([]);
  const [subcontractorSchedules, setSubcontractorSchedules] = useState<any[]>([]);

  useEffect(() => {
    loadJobs();
    loadShopTasks();
    loadSubcontractorSchedules();
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

  async function loadShopTasks() {
    try {
      const { data, error } = await supabase
        .from('shop_tasks')
        .select(`
          *,
          jobs!inner(id, name, status),
          assigned_user:assigned_to(id, username),
          created_user:created_by(id, username)
        `)
        .eq('jobs.status', 'active')
        .in('status', ['pending', 'in_progress'])
        .order('priority', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      setShopTasks(data || []);
    } catch (error) {
      console.error('Error loading shop tasks:', error);
    }
  }

  async function loadSubcontractorSchedules() {
    try {
      // Get upcoming schedules (next 14 days)
      const today = new Date();
      const twoWeeksFromNow = new Date();
      twoWeeksFromNow.setDate(today.getDate() + 14);

      const { data, error } = await supabase
        .from('subcontractor_schedules')
        .select(`
          *,
          jobs!inner(id, name, status),
          subcontractors!inner(id, name, phone, trades)
        `)
        .eq('jobs.status', 'active')
        .in('status', ['scheduled', 'in_progress'])
        .gte('start_date', today.toISOString().split('T')[0])
        .lte('start_date', twoWeeksFromNow.toISOString().split('T')[0])
        .order('start_date', { ascending: true })
        .limit(10);

      if (error) throw error;
      setSubcontractorSchedules(data || []);
    } catch (error) {
      console.error('Error loading subcontractor schedules:', error);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-green-900">{showArchived ? 'Archived Jobs' : 'Jobs Dashboard'}</h2>
          <p className="text-sm text-black">
            {showArchived ? 'View and restore archived jobs' : 'Manage jobs, shop tasks, and schedules'}
          </p>
        </div>
        {!showArchived && (
          <Button onClick={() => setShowCreateDialog(true)} className="bg-green-900 text-white hover:bg-green-800 rounded-none font-bold">
            <Plus className="w-4 h-4 mr-2" />
            New Job
          </Button>
        )}
      </div>

      {/* Management Dashboard - Only show for non-archived view */}
      {!showArchived && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Shop Tasks Widget */}
          <Card className="rounded-none border-2 border-slate-300 bg-white">
            <CardHeader className="pb-3 bg-slate-50 border-b-2 border-slate-300">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2 text-green-900">
                  <Wrench className="w-5 h-5" />
                  Shop Tasks
                </CardTitle>
                <Badge variant="secondary" className="bg-green-900 text-white rounded-none">
                  {shopTasks.length} active
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              {shopTasks.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Wrench className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No active shop tasks</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-[300px] overflow-y-auto">
                  {shopTasks.map((task) => (
                    <div
                      key={task.id}
                      className="p-3 border-l-4 rounded-none border-slate-300 bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer"
                      style={{ borderLeftColor: task.priority === 'high' ? '#ef4444' : task.priority === 'medium' ? '#f97316' : '#64748b' }}
                      onClick={() => {
                        const job = jobs.find(j => j.id === task.job_id);
                        if (job) {
                          setSelectedJob(job);
                          setSelectedTab('overview');
                        }
                      }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-sm truncate">{task.title}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {task.jobs?.name}
                          </p>
                          {task.description && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                              {task.description}
                            </p>
                          )}
                        </div>
                        <Badge
                          variant={task.priority === 'high' ? 'destructive' : task.priority === 'medium' ? 'default' : 'secondary'}
                          className="rounded-none text-xs"
                        >
                          {task.priority}
                        </Badge>
                      </div>
                      {task.due_date && (
                        <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                          <Calendar className="w-3 h-3" />
                          Due: {new Date(task.due_date).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Subcontractor Schedule Widget */}
          <Card className="rounded-none border-2 border-slate-300 bg-white">
            <CardHeader className="pb-3 bg-slate-50 border-b-2 border-slate-300">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2 text-green-900">
                  <Users className="w-5 h-5" />
                  Subcontractor Schedule
                </CardTitle>
                <Badge variant="secondary" className="bg-green-900 text-white rounded-none">
                  Next 14 days
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              {subcontractorSchedules.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No upcoming subcontractor work</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-[300px] overflow-y-auto">
                  {subcontractorSchedules.map((schedule) => (
                    <div
                      key={schedule.id}
                      className="p-3 border-l-4 border-indigo-500 rounded-none bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer"
                      onClick={() => {
                        const job = jobs.find(j => j.id === schedule.job_id);
                        if (job) {
                          setSelectedJob(job);
                          setSelectedTab('overview');
                        }
                      }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-sm">{schedule.subcontractors?.name}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {schedule.jobs?.name}
                          </p>
                          {schedule.work_description && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                              {schedule.work_description}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 mt-2 text-xs">
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <Calendar className="w-3 h-3" />
                          {new Date(schedule.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          {schedule.end_date && ` - ${new Date(schedule.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                        </div>
                        {schedule.subcontractors?.trades && schedule.subcontractors.trades.length > 0 && (
                          <Badge variant="outline" className="rounded-none text-xs">
                            {schedule.subcontractors.trades[0]}
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}



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
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
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

                  <div className="grid grid-cols-2 gap-2 pt-2 border-t">
                    <div 
                      className="text-center cursor-pointer hover:bg-muted/50 rounded-lg p-2 transition-colors"
                      onClick={() => {
                        setSelectedJob(job);
                        setSelectedTab('overview');
                      }}
                    >
                      <div className="flex items-center justify-center text-primary mb-1">
                        <Clock className="w-4 h-4" />
                      </div>
                      <p className="text-lg font-bold">{jobStats.totalHours || '0'}</p>
                      <p className="text-xs text-muted-foreground">Clock-In Hrs</p>
                    </div>
                    <div 
                      className="text-center cursor-pointer hover:bg-muted/50 rounded-lg p-2 transition-colors"
                      onClick={() => {
                        setSelectedJob(job);
                        setSelectedTab('photos');
                      }}
                    >
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
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {/* Active Column */}
          <div className="flex flex-col">
            <div className="bg-gradient-to-r from-green-100 to-green-50 border-2 border-green-200 rounded-lg p-3 mb-3">
              <h3 className="text-lg font-bold text-green-900 flex items-center gap-2">
                Active
                <Badge variant="secondary" className="bg-green-200 text-green-900">
                  {jobs.filter(j => j.status === 'active' && !j.is_internal).length}
                </Badge>
              </h3>
            </div>
            <div className="space-y-3">
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
                            <div className="flex flex-col gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setJobOnHold(job.id);
                                }}
                                className="h-7 px-2 justify-start"
                              >
                                <AlertTriangle className="w-3 h-3 mr-1" />
                                <span className="text-xs">Hold</span>
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

                        <div className="grid grid-cols-2 gap-2 pt-2 border-t">
                          <div 
                            className="text-center cursor-pointer hover:bg-muted/50 rounded-lg p-2 transition-colors"
                            onClick={() => {
                              setSelectedJob(job);
                              setSelectedTab('overview');
                            }}
                          >
                            <div className="flex items-center justify-center text-primary mb-1">
                              <Clock className="w-4 h-4" />
                            </div>
                            <p className="text-lg font-bold">{jobStats.totalHours || '0'}</p>
                            <p className="text-xs text-muted-foreground">Clock-In Hrs</p>
                          </div>
                          <div 
                            className="text-center cursor-pointer hover:bg-muted/50 rounded-lg p-2 transition-colors"
                            onClick={() => {
                              setSelectedJob(job);
                              setSelectedTab('photos');
                            }}
                          >
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
            <div className="space-y-3">
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
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <div className="flex-1 cursor-pointer" onClick={() => setSelectedJob(job)}>
                            <CardTitle className="text-lg">{job.name}</CardTitle>
                            <p className="text-sm font-medium text-muted-foreground mt-1">
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
            <div className="space-y-3">
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
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <div className="flex-1 cursor-pointer" onClick={() => setSelectedJob(job)}>
                            <CardTitle className="text-lg">{job.name}</CardTitle>
                            <p className="text-sm font-medium text-muted-foreground mt-1">
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
                      </CardContent>
                    </Card>
                  );
                })}
            </div>
          </div>
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
              <div className="space-y-3">
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
