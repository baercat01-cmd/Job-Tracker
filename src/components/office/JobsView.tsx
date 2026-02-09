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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Plus, MapPin, FileText, Clock, Camera, BarChart3, Archive, ArchiveRestore, Edit, FileCheck, Calendar, AlertTriangle, MoreVertical, DollarSign, TrendingUp, TrendingDown } from 'lucide-react';
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
import { ShopMaterialsDialog } from './ShopMaterialsDialog';
import { Warehouse } from 'lucide-react';
import { JobBudgetManagement } from './JobBudgetManagement';

interface JobsViewProps {
  showArchived?: boolean;
  selectedJobId?: string | null;
  openMaterialsTab?: boolean; // New prop to auto-open materials tab
  onAddTask?: () => void; // Callback to open task creation dialog
}

export function JobsView({ showArchived = false, selectedJobId, openMaterialsTab = false, onAddTask }: JobsViewProps) {
  const { profile } = useAuth();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [selectedTab, setSelectedTab] = useState('overview');
  const [stats, setStats] = useState<Record<string, any>>({});
  const [statusFilter, setStatusFilter] = useState<'active' | 'quoting' | 'on_hold'>('active');
  const [crewOrderCounts, setCrewOrderCounts] = useState<Record<string, number>>({});
  const [showShopMaterialsDialog, setShowShopMaterialsDialog] = useState(false);
  const [jobBudgets, setJobBudgets] = useState<Record<string, any>>({});
  const [showBudgetDialog, setShowBudgetDialog] = useState(false);
  const [budgetJobId, setBudgetJobId] = useState<string | null>(null);

  useEffect(() => {
    loadJobs();
    loadCrewOrderCounts();
    loadJobBudgets();

    // Subscribe to material changes to update crew order counts in real-time
    const materialsChannel = supabase
      .channel('materials_changes_for_counts')
      .on('postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'materials'
        },
        () => {
          loadCrewOrderCounts(); // Reload counts when materials change
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(materialsChannel);
    };
  }, []);

  // Auto-scroll to selected job when selectedJobId changes
  useEffect(() => {
    if (selectedJobId && selectedJob?.id !== selectedJobId) {
      const job = jobs.find(j => j.id === selectedJobId);
      if (job) {
        setSelectedJob(job);
        // Auto-open materials tab if requested (from notification)
        if (openMaterialsTab) {
          setSelectedTab('materials');
        }
        // Scroll to job card if it exists in the DOM
        setTimeout(() => {
          const element = document.getElementById(`job-${selectedJobId}`);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 100);
      }
    }
  }, [selectedJobId, jobs, openMaterialsTab]);

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

  async function setJobPrepping(jobId: string) {
    try {
      const { error } = await supabase
        .from('jobs')
        .update({ status: 'prepping', updated_at: new Date().toISOString() })
        .eq('id', jobId);

      if (error) throw error;

      toast.success('Job set to prepping - hidden from crew');
      loadJobs();
    } catch (error: any) {
      console.error('Error setting job to prepping:', error);
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

  async function loadCrewOrderCounts() {
    try {
      // Count pending crew orders (not yet processed by office)
      const { data, error } = await supabase
        .from('materials')
        .select('job_id')
        .in('import_source', ['field_catalog', 'field_custom'])
        .eq('status', 'not_ordered'); // Pending orders that haven't been approved yet

      if (error) throw error;

      // Count crew orders by job
      const counts: Record<string, number> = {};
      (data || []).forEach((material: any) => {
        counts[material.job_id] = (counts[material.job_id] || 0) + 1;
      });

      setCrewOrderCounts(counts);
    } catch (error: any) {
      console.error('Error loading crew order counts:', error);
    }
  }

  async function loadJobBudgets() {
    try {
      const { data, error } = await supabase
        .from('job_budgets')
        .select('*');

      if (error) throw error;

      const budgetsMap: Record<string, any> = {};
      (data || []).forEach(budget => {
        budgetsMap[budget.job_id] = budget;
      });

      setJobBudgets(budgetsMap);
    } catch (error: any) {
      console.error('Error loading job budgets:', error);
    }
  }

  function openBudgetDialog(jobId: string) {
    setBudgetJobId(jobId);
    setShowBudgetDialog(true);
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
          <TodayTasksSidebar 
            onJobSelect={(jobId) => setSelectedJob(jobs.find(j => j.id === jobId) || null)}
            onAddTask={onAddTask}
          />
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
            <div className="flex gap-2 w-full sm:w-auto">
              <Button 
                onClick={() => setShowShopMaterialsDialog(true)} 
                size="sm"
                variant="outline"
                className="flex-1 sm:flex-initial bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white"
              >
                <Warehouse className="w-4 h-4 mr-2" />
                Shop Materials
              </Button>
              <Button 
                onClick={() => setShowCreateDialog(true)} 
                size="sm"
                className="flex-1 sm:flex-initial bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-600 hover:to-yellow-700 text-black font-semibold shadow-lg border-2 border-yellow-400"
              >
                <Plus className="w-4 h-4 mr-2" />
                New Job
              </Button>
            </div>
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

                    <div className="flex items-center justify-between pt-2 border-t">
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedJob(job);
                            setSelectedTab('materials');
                          }}
                        >
                          <Package className="w-3 h-3 mr-1" />
                          Materials
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedJob(job);
                            setSelectedTab('schedule');
                          }}
                        >
                          <CalendarIcon className="w-3 h-3 mr-1" />
                          Schedule
                        </Button>
                      </div>
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
                        {jobStats.photosCount || 0}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <div className="grid gap-3 sm:gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
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
                              <div className="flex items-center gap-1.5">
                                <CardTitle className="text-base leading-tight flex-1">{job.name}</CardTitle>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 px-1.5 text-xs flex-shrink-0"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedJob(job);
                                    setSelectedTab('photos');
                                  }}
                                >
                                  <Camera className="w-3 h-3 mr-0.5" />
                                  {jobStats.photosCount || 0}
                                </Button>
                              </div>
                              <p className="text-xs font-medium text-muted-foreground mt-0.5">
                                {job.client_name}
                              </p>
                              {/* Scheduling Status Badges */}
                              {(startDate || endDate) && (
                                <div className="flex flex-wrap gap-0.5 mt-1">
                                  {isNotStarted && (
                                    <Badge variant="secondary" className="text-[10px] py-0 h-4 px-1.5">
                                      <Calendar className="w-2.5 h-2.5 mr-0.5" />
                                      {startDate?.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                    </Badge>
                                  )}
                                  {isInProgress && startDate && (
                                    <Badge variant="default" className="text-[10px] py-0 h-4 px-1.5">
                                      In Progress
                                    </Badge>
                                  )}
                                  {isOverdue && (
                                    <Badge variant="destructive" className="text-[10px] py-0 h-4 px-1.5">
                                      <AlertTriangle className="w-2.5 h-2.5 mr-0.5" />
                                      Overdue
                                    </Badge>
                                  )}
                                  {endDate && !isOverdue && (
                                    <Badge variant="outline" className="text-[10px] py-0 h-4 px-1.5">
                                      {endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                    </Badge>
                                  )}
                                </div>
                              )}
                            </div>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => e.stopPropagation()}
                                  className="h-6 w-6 p-0 flex-shrink-0"
                                >
                                  <MoreVertical className="w-4 h-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setJobOnHold(job.id);
                                  }}
                                >
                                  <AlertTriangle className="w-4 h-4 mr-2" />
                                  Put On Hold
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleArchiveJob(job.id, job.status);
                                  }}
                                >
                                  <Archive className="w-4 h-4 mr-2" />
                                  Archive
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </CardHeader>
                        <CardContent className="pt-1.5 px-3 pb-2 space-y-1.5">
                          <div className="cursor-pointer" onClick={() => {
                            setSelectedJob(job);
                            setSelectedTab('overview');
                          }}>
                            <div className="flex items-start text-xs">
                              <MapPin className="w-3 h-3 mr-1 mt-0.5 text-muted-foreground flex-shrink-0" />
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
                              <div className="flex items-center justify-between text-[10px]">
                                <span className="text-muted-foreground">Progress</span>
                                <span className="font-bold">
                                  {((jobStats.totalClockInHours || 0) / job.estimated_hours * 100).toFixed(0)}%
                                </span>
                              </div>
                              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
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
                              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                                <span>{jobStats.totalHours || '0'} / {job.estimated_hours} hrs</span>
                                {(jobStats.totalClockInHours || 0) > job.estimated_hours && (
                                  <span className="text-destructive font-medium">Over</span>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Financial Summary */}
                          {jobBudgets[job.id] && (
                            <div 
                              className="p-2 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded cursor-pointer hover:shadow-sm transition-shadow"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedJob(job);
                                setSelectedTab('financials');
                              }}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1">
                                  <DollarSign className="w-3 h-3 text-green-700" />
                                  <span className="text-[10px] font-semibold text-green-900">Budget</span>
                                </div>
                                <div className="text-[10px] font-bold text-green-700">
                                  ${jobBudgets[job.id].total_quoted_price.toLocaleString()}
                                </div>
                              </div>
                              {(() => {
                                const budget = jobBudgets[job.id];
                                const costs = (budget.total_labor_budget || 0) + (budget.total_materials_budget || 0) + 
                                            (budget.total_subcontractor_budget || 0) + (budget.total_equipment_budget || 0) + 
                                            (budget.other_costs || 0);
                                const profit = budget.total_quoted_price - costs - (budget.overhead_allocation || 0);
                                const margin = budget.total_quoted_price > 0 ? (profit / budget.total_quoted_price) * 100 : 0;
                                return (
                                  <div className="flex items-center justify-between mt-0.5">
                                    <span className="text-[9px] text-green-700">Margin</span>
                                    <div className="flex items-center gap-0.5">
                                      {margin >= 15 ? (
                                        <TrendingUp className="w-2.5 h-2.5 text-green-600" />
                                      ) : margin >= 10 ? (
                                        <TrendingUp className="w-2.5 h-2.5 text-yellow-600" />
                                      ) : (
                                        <TrendingDown className="w-2.5 h-2.5 text-red-600" />
                                      )}
                                      <span className={`text-[9px] font-semibold ${
                                        margin >= 15 ? 'text-green-600' : 
                                        margin >= 10 ? 'text-yellow-600' : 
                                        'text-red-600'
                                      }`}>
                                        {margin.toFixed(1)}%
                                      </span>
                                    </div>
                                  </div>
                                );
                              })()}
                            </div>
                          )}

                          {/* Quick Action Buttons */}
                          <div className="flex gap-0.5 pt-1 border-t">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-1.5 text-[10px] flex-1 relative"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedJob(job);
                                setSelectedTab('materials');
                              }}
                            >
                              <Package className="w-2.5 h-2.5 mr-0.5" />
                              Materials
                              {crewOrderCounts[job.id] > 0 && (
                                <Badge variant="secondary" className="ml-1 bg-orange-500 text-white text-[8px] py-0 px-1 h-3.5 leading-none">
                                  {crewOrderCounts[job.id]}
                                </Badge>
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-1.5 text-[10px] flex-1"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedJob(job);
                                setSelectedTab('schedule');
                              }}
                            >
                              <CalendarIcon className="w-2.5 h-2.5 mr-0.5" />
                              Schedule
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-1.5 text-[10px] flex-1"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedJob(job);
                                setSelectedTab('financials');
                              }}
                            >
                              <DollarSign className="w-2.5 h-2.5 mr-0.5" />
                              {jobBudgets[job.id] ? 'Budget' : 'Add $'}
                            </Button>
                          </div>

                        </CardContent>
                      </Card>
                    );
                  })}
              </div>
            </div>

            {/* Prepping Column */}
            <div className="flex flex-col min-w-0">
              <div className="bg-gradient-to-r from-blue-100 to-blue-50 border-2 border-blue-200 rounded-lg p-2 sm:p-3 mb-2 sm:mb-3">
                <h3 className="text-base sm:text-lg font-bold text-blue-900 flex items-center gap-2">
                  Prepping
                  <Badge variant="secondary" className="bg-blue-200 text-blue-900">
                    {jobs.filter(j => j.status === 'prepping' && !j.is_internal).length}
                  </Badge>
                </h3>
              </div>
              <div className="space-y-2 sm:space-y-3">
                {jobs
                  .filter((job) => job.status === 'prepping' && !job.is_internal)
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
                        <CardHeader className="pb-1.5 pt-2 px-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 cursor-pointer min-w-0" onClick={() => setSelectedJob(job)}>
                              <div className="flex items-center gap-1.5">
                                <CardTitle className="text-base leading-tight flex-1">{job.name}</CardTitle>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 px-1.5 text-xs flex-shrink-0"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedJob(job);
                                    setSelectedTab('photos');
                                  }}
                                >
                                  <Camera className="w-3 h-3 mr-0.5" />
                                  {jobStats.photosCount || 0}
                                </Button>
                              </div>
                              <p className="text-xs font-medium text-muted-foreground mt-0.5">
                                {job.client_name}
                              </p>
                            </div>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => e.stopPropagation()}
                                  className="h-6 w-6 p-0 flex-shrink-0"
                                >
                                  <MoreVertical className="w-4 h-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    activateJob(job.id);
                                  }}
                                >
                                  <FileCheck className="w-4 h-4 mr-2" />
                                  Activate
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setJobOnHold(job.id);
                                  }}
                                >
                                  <AlertTriangle className="w-4 h-4 mr-2" />
                                  Put On Hold
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleArchiveJob(job.id, job.status);
                                  }}
                                >
                                  <Archive className="w-4 h-4 mr-2" />
                                  Archive
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </CardHeader>
                        <CardContent className="pt-1.5 px-3 pb-2 space-y-1.5">
                          <div className="cursor-pointer" onClick={() => {
                            setSelectedJob(job);
                            setSelectedTab('overview');
                          }}>
                            <div className="flex items-start text-xs">
                              <MapPin className="w-3 h-3 mr-1 mt-0.5 text-muted-foreground flex-shrink-0" />
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

                          {/* Financial Summary */}
                          {jobBudgets[job.id] && (
                            <div 
                              className="p-2 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded cursor-pointer hover:shadow-sm transition-shadow"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedJob(job);
                                setSelectedTab('financials');
                              }}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1">
                                  <DollarSign className="w-3 h-3 text-green-700" />
                                  <span className="text-[10px] font-semibold text-green-900">Budget</span>
                                </div>
                                <div className="text-[10px] font-bold text-green-700">
                                  ${jobBudgets[job.id].total_quoted_price.toLocaleString()}
                                </div>
                              </div>
                              {(() => {
                                const budget = jobBudgets[job.id];
                                const costs = (budget.total_labor_budget || 0) + (budget.total_materials_budget || 0) + 
                                            (budget.total_subcontractor_budget || 0) + (budget.total_equipment_budget || 0) + 
                                            (budget.other_costs || 0);
                                const profit = budget.total_quoted_price - costs - (budget.overhead_allocation || 0);
                                const margin = budget.total_quoted_price > 0 ? (profit / budget.total_quoted_price) * 100 : 0;
                                return (
                                  <div className="flex items-center justify-between mt-0.5">
                                    <span className="text-[9px] text-green-700">Margin</span>
                                    <div className="flex items-center gap-0.5">
                                      {margin >= 15 ? (
                                        <TrendingUp className="w-2.5 h-2.5 text-green-600" />
                                      ) : margin >= 10 ? (
                                        <TrendingUp className="w-2.5 h-2.5 text-yellow-600" />
                                      ) : (
                                        <TrendingDown className="w-2.5 h-2.5 text-red-600" />
                                      )}
                                      <span className={`text-[9px] font-semibold ${
                                        margin >= 15 ? 'text-green-600' : 
                                        margin >= 10 ? 'text-yellow-600' : 
                                        'text-red-600'
                                      }`}>
                                        {margin.toFixed(1)}%
                                      </span>
                                    </div>
                                  </div>
                                );
                              })()}
                            </div>
                          )}

                          {/* Quick Action Buttons */}
                          <div className="flex gap-0.5 pt-1 border-t">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-1.5 text-[10px] flex-1 relative"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedJob(job);
                                setSelectedTab('materials');
                              }}
                            >
                              <Package className="w-2.5 h-2.5 mr-0.5" />
                              Materials
                              {crewOrderCounts[job.id] > 0 && (
                                <Badge variant="secondary" className="ml-1 bg-orange-500 text-white text-[8px] py-0 px-1 h-3.5 leading-none">
                                  {crewOrderCounts[job.id]}
                                </Badge>
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-1.5 text-[10px] flex-1"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedJob(job);
                                setSelectedTab('schedule');
                              }}
                            >
                              <CalendarIcon className="w-2.5 h-2.5 mr-0.5" />
                              Schedule
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-1.5 text-[10px] flex-1"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedJob(job);
                                setSelectedTab('financials');
                              }}
                            >
                              <DollarSign className="w-2.5 h-2.5 mr-0.5" />
                              {jobBudgets[job.id] ? 'Budget' : 'Add $'}
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
              </div>
            </div>

            {/* Quoting Column */}
            <div className="flex flex-col min-w-0">
              <div className="bg-gradient-to-r from-yellow-100 to-yellow-50 border-2 border-yellow-200 rounded-lg p-2 sm:p-3 mb-2 sm:mb-3">
                <h3 className="text-base sm:text-lg font-bold text-yellow-900 flex items-center gap-2">
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
                        <CardHeader className="pb-1.5 pt-2 px-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 cursor-pointer min-w-0" onClick={() => setSelectedJob(job)}>
                              <div className="flex items-center gap-1.5">
                                <CardTitle className="text-base leading-tight flex-1">{job.name}</CardTitle>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 px-1.5 text-xs flex-shrink-0"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedJob(job);
                                    setSelectedTab('photos');
                                  }}
                                >
                                  <Camera className="w-3 h-3 mr-0.5" />
                                  {jobStats.photosCount || 0}
                                </Button>
                              </div>
                              <p className="text-xs font-medium text-muted-foreground mt-0.5">
                                {job.client_name}
                              </p>
                            </div>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => e.stopPropagation()}
                                  className="h-6 w-6 p-0 flex-shrink-0"
                                >
                                  <MoreVertical className="w-4 h-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setJobPrepping(job.id);
                                  }}
                                >
                                  <FileCheck className="w-4 h-4 mr-2" />
                                  Set to Prepping
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleArchiveJob(job.id, job.status);
                                  }}
                                >
                                  <Archive className="w-4 h-4 mr-2" />
                                  Archive
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </CardHeader>
                        <CardContent className="pt-1.5 px-3 pb-2 space-y-1.5">
                          <div className="cursor-pointer" onClick={() => {
                            setSelectedJob(job);
                            setSelectedTab('overview');
                          }}>
                            <div className="flex items-start text-xs">
                              <MapPin className="w-3 h-3 mr-1 mt-0.5 text-muted-foreground flex-shrink-0" />
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

                          {/* Financial Summary */}
                          {jobBudgets[job.id] && (
                            <div 
                              className="p-2 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded cursor-pointer hover:shadow-sm transition-shadow"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedJob(job);
                                setSelectedTab('financials');
                              }}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1">
                                  <DollarSign className="w-3 h-3 text-green-700" />
                                  <span className="text-[10px] font-semibold text-green-900">Budget</span>
                                </div>
                                <div className="text-[10px] font-bold text-green-700">
                                  ${jobBudgets[job.id].total_quoted_price.toLocaleString()}
                                </div>
                              </div>
                              {(() => {
                                const budget = jobBudgets[job.id];
                                const costs = (budget.total_labor_budget || 0) + (budget.total_materials_budget || 0) + 
                                            (budget.total_subcontractor_budget || 0) + (budget.total_equipment_budget || 0) + 
                                            (budget.other_costs || 0);
                                const profit = budget.total_quoted_price - costs - (budget.overhead_allocation || 0);
                                const margin = budget.total_quoted_price > 0 ? (profit / budget.total_quoted_price) * 100 : 0;
                                return (
                                  <div className="flex items-center justify-between mt-0.5">
                                    <span className="text-[9px] text-green-700">Margin</span>
                                    <div className="flex items-center gap-0.5">
                                      {margin >= 15 ? (
                                        <TrendingUp className="w-2.5 h-2.5 text-green-600" />
                                      ) : margin >= 10 ? (
                                        <TrendingUp className="w-2.5 h-2.5 text-yellow-600" />
                                      ) : (
                                        <TrendingDown className="w-2.5 h-2.5 text-red-600" />
                                      )}
                                      <span className={`text-[9px] font-semibold ${
                                        margin >= 15 ? 'text-green-600' : 
                                        margin >= 10 ? 'text-yellow-600' : 
                                        'text-red-600'
                                      }`}>
                                        {margin.toFixed(1)}%
                                      </span>
                                    </div>
                                  </div>
                                );
                              })()}
                            </div>
                          )}

                          {/* Quick Action Buttons */}
                          <div className="flex gap-0.5 pt-1 border-t">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-1.5 text-[10px] flex-1 relative"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedJob(job);
                                setSelectedTab('materials');
                              }}
                            >
                              <Package className="w-2.5 h-2.5 mr-0.5" />
                              Materials
                              {crewOrderCounts[job.id] > 0 && (
                                <Badge variant="secondary" className="ml-1 bg-orange-500 text-white text-[8px] py-0 px-1 h-3.5 leading-none">
                                  {crewOrderCounts[job.id]}
                                </Badge>
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-1.5 text-[10px] flex-1"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedJob(job);
                                setSelectedTab('schedule');
                              }}
                            >
                              <CalendarIcon className="w-2.5 h-2.5 mr-0.5" />
                              Schedule
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-1.5 text-[10px] flex-1"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedJob(job);
                                setSelectedTab('financials');
                              }}
                            >
                              <DollarSign className="w-2.5 h-2.5 mr-0.5" />
                              {jobBudgets[job.id] ? 'Budget' : 'Add $'}
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
              </div>
            </div>

            {/* On Hold Column */}
            <div className="flex flex-col min-w-0">
              <div className="bg-gradient-to-r from-orange-100 to-orange-50 border-2 border-orange-200 rounded-lg p-2 sm:p-3 mb-2 sm:mb-3">
                <h3 className="text-base sm:text-lg font-bold text-orange-900 flex items-center gap-2">
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
                        <CardHeader className="pb-1.5 pt-2 px-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 cursor-pointer min-w-0" onClick={() => setSelectedJob(job)}>
                              <div className="flex items-center gap-1.5">
                                <CardTitle className="text-base leading-tight flex-1">{job.name}</CardTitle>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 px-1.5 text-xs flex-shrink-0"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedJob(job);
                                    setSelectedTab('photos');
                                  }}
                                >
                                  <Camera className="w-3 h-3 mr-0.5" />
                                  {jobStats.photosCount || 0}
                                </Button>
                              </div>
                              <p className="text-xs font-medium text-muted-foreground mt-0.5">
                                {job.client_name}
                              </p>
                            </div>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => e.stopPropagation()}
                                  className="h-6 w-6 p-0 flex-shrink-0"
                                >
                                  <MoreVertical className="w-4 h-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setJobPrepping(job.id);
                                  }}
                                >
                                  <FileCheck className="w-4 h-4 mr-2" />
                                  Set to Prepping
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleArchiveJob(job.id, job.status);
                                  }}
                                >
                                  <Archive className="w-4 h-4 mr-2" />
                                  Archive
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </CardHeader>
                        <CardContent className="pt-1.5 px-3 pb-2 space-y-1.5">
                          <div className="cursor-pointer" onClick={() => {
                            setSelectedJob(job);
                            setSelectedTab('overview');
                          }}>
                            <div className="flex items-start text-xs">
                              <MapPin className="w-3 h-3 mr-1 mt-0.5 text-muted-foreground flex-shrink-0" />
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

                          {/* Financial Summary */}
                          {jobBudgets[job.id] && (
                            <div 
                              className="p-2 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded cursor-pointer hover:shadow-sm transition-shadow"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedJob(job);
                                setSelectedTab('financials');
                              }}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1">
                                  <DollarSign className="w-3 h-3 text-green-700" />
                                  <span className="text-[10px] font-semibold text-green-900">Budget</span>
                                </div>
                                <div className="text-[10px] font-bold text-green-700">
                                  ${jobBudgets[job.id].total_quoted_price.toLocaleString()}
                                </div>
                              </div>
                              {(() => {
                                const budget = jobBudgets[job.id];
                                const costs = (budget.total_labor_budget || 0) + (budget.total_materials_budget || 0) + 
                                            (budget.total_subcontractor_budget || 0) + (budget.total_equipment_budget || 0) + 
                                            (budget.other_costs || 0);
                                const profit = budget.total_quoted_price - costs - (budget.overhead_allocation || 0);
                                const margin = budget.total_quoted_price > 0 ? (profit / budget.total_quoted_price) * 100 : 0;
                                return (
                                  <div className="flex items-center justify-between mt-0.5">
                                    <span className="text-[9px] text-green-700">Margin</span>
                                    <div className="flex items-center gap-0.5">
                                      {margin >= 15 ? (
                                        <TrendingUp className="w-2.5 h-2.5 text-green-600" />
                                      ) : margin >= 10 ? (
                                        <TrendingUp className="w-2.5 h-2.5 text-yellow-600" />
                                      ) : (
                                        <TrendingDown className="w-2.5 h-2.5 text-red-600" />
                                      )}
                                      <span className={`text-[9px] font-semibold ${
                                        margin >= 15 ? 'text-green-600' : 
                                        margin >= 10 ? 'text-yellow-600' : 
                                        'text-red-600'
                                      }`}>
                                        {margin.toFixed(1)}%
                                      </span>
                                    </div>
                                  </div>
                                );
                              })()}
                            </div>
                          )}

                          {/* Quick Action Buttons */}
                          <div className="flex gap-0.5 pt-1 border-t">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-1.5 text-[10px] flex-1 relative"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedJob(job);
                                setSelectedTab('materials');
                              }}
                            >
                              <Package className="w-2.5 h-2.5 mr-0.5" />
                              Materials
                              {crewOrderCounts[job.id] > 0 && (
                                <Badge variant="secondary" className="ml-1 bg-orange-500 text-white text-[8px] py-0 px-1 h-3.5 leading-none">
                                  {crewOrderCounts[job.id]}
                                </Badge>
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-1.5 text-[10px] flex-1"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedJob(job);
                                setSelectedTab('schedule');
                              }}
                            >
                              <CalendarIcon className="w-2.5 h-2.5 mr-0.5" />
                              Schedule
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-1.5 text-[10px] flex-1"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedJob(job);
                                setSelectedTab('financials');
                              }}
                            >
                              <DollarSign className="w-2.5 h-2.5 mr-0.5" />
                              {jobBudgets[job.id] ? 'Budget' : 'Add $'}
                            </Button>
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

      {/* Shop Materials Dialog */}
      <ShopMaterialsDialog
        open={showShopMaterialsDialog}
        onClose={() => setShowShopMaterialsDialog(false)}
        onJobSelect={(jobId) => {
          const job = jobs.find(j => j.id === jobId);
          if (job) {
            setSelectedJob(job);
            setSelectedTab('materials');
          }
        }}
      />

      {/* Budget Management Dialog */}
      <Dialog open={showBudgetDialog} onOpenChange={setShowBudgetDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {budgetJobId && jobs.find(j => j.id === budgetJobId)?.name} - Budget
            </DialogTitle>
          </DialogHeader>
          {budgetJobId && (
            <div className="mt-4">
              <JobBudgetManagement 
                onUpdate={() => {
                  loadJobBudgets();
                  loadJobs();
                }}
                jobIdFilter={budgetJobId}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

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
              <JobDetailedView 
                job={selectedJob} 
                onBack={() => setSelectedJob(null)}
                onEdit={() => {
                  setShowEditDialog(true);
                }}
                initialTab={selectedTab}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
