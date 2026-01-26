import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Clock, Camera, LogOut, Briefcase, FileText, ArrowLeft, History, Package, BarChart3, Calendar as CalendarIcon, ListTodo } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import type { Job, ActiveTimer } from '@/types';
import { JobSelector } from '@/components/foreman/JobSelector';
import { TimeTracker } from '@/components/foreman/TimeTracker';
import { PhotoUpload } from '@/components/foreman/PhotoUpload';
import { DailyLogForm } from '@/components/foreman/DailyLogForm';
import { JobLogsView } from '@/components/foreman/JobLogsView';
import { JobDetails } from '@/components/foreman/JobDetails';
import { ComponentHistory } from '@/components/foreman/ComponentHistory';
import { MyTimeHistory } from '@/components/foreman/MyTimeHistory';
import { JobComponents } from '@/components/office/JobComponents';

import { MaterialsList } from '@/components/foreman/MaterialsList';
import { NotificationBell } from '@/components/office/NotificationBell';
import { QuickTimeEntry } from '@/components/foreman/QuickTimeEntry';
import { MasterCalendar } from '@/components/office/MasterCalendar';
import { UpcomingEventsWidget } from '@/components/foreman/UpcomingEventsWidget';
import { JobCalendar } from '@/components/office/JobCalendar';
import { JobSchedule } from '@/components/office/JobSchedule';
import { JobGanttChart } from '@/components/office/JobGanttChart';
import { UnavailableCalendar } from '@/components/foreman/UnavailableCalendar';


type TabMode = 'timer' | 'photos' | 'documents' | 'materials' | 'history' | 'schedule' | 'components';

interface ForemanDashboardProps {
  hideHeader?: boolean;
}

export function ForemanDashboard({ hideHeader = false }: ForemanDashboardProps = {}) {
  const { profile, clearUser } = useAuth();
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [activeTab, setActiveTab] = useState<TabMode>('timer');
  const [activeTimers, setActiveTimers] = useState<ActiveTimer[]>([]);
  const [documentTab, setDocumentTab] = useState<string>('documents');
  const [showTimeHistory, setShowTimeHistory] = useState(false);
  const [showCalendarPage, setShowCalendarPage] = useState(false);
  const [calendarJobId, setCalendarJobId] = useState<string | undefined>(undefined);
  const [showUnavailableCalendar, setShowUnavailableCalendar] = useState(false);
  const [materialsDefaultTab, setMaterialsDefaultTab] = useState<'all' | 'ready' | 'pull'>('all');
  const [showGanttChart, setShowGanttChart] = useState(false);
  const [jobData, setJobData] = useState<Job | null>(selectedJob);
  const isForeman = profile?.role === 'foreman';

  // Update jobData when selectedJob changes
  useEffect(() => {
    setJobData(selectedJob);
  }, [selectedJob]);

  // Debug logging
  useEffect(() => {
    console.log('🔍 ForemanDashboard - Role:', profile?.role, 'isForeman:', isForeman);
  }, [profile?.role, isForeman]);

  useEffect(() => {
    if (profile?.id) {
      loadActiveTimers();
    }
  }, [profile?.id]);

  async function loadActiveTimers() {
    if (!profile?.id) return;
    
    try {
      const { data, error } = await supabase
        .from('time_entries')
        .select(`
          *,
          components(name),
          jobs(*)
        `)
        .eq('user_id', profile.id)
        .eq('is_active', true)
        .not('component_id', 'is', null); // Only show component timers in badge

      if (error) throw error;

      const timers: ActiveTimer[] = (data || []).map((entry: any) => ({
        id: entry.id,
        job_id: entry.job_id,
        component_id: entry.component_id,
        component_name: entry.components?.name || 'Unknown',
        start_time: entry.start_time,
        crew_count: entry.crew_count,
      }));

      setActiveTimers(timers);

      // ✅ Auto-select job if active timers exist
      if (timers.length > 0 && data && data[0]?.jobs) {
        const activeJob = data[0].jobs;
        setSelectedJob(activeJob);
        setActiveTab('timer');
        console.log('✅ Active timer detected - auto-selecting job');
      }
    } catch (error: any) {
      console.error('Error loading active timers:', error);
    }
  }

  const handleJobSelect = (job: Job) => {
    setSelectedJob(job);
    setActiveTab('timer'); // Default to timer tab when selecting a job
  };

  const handleJobSelectForMaterials = (job: Job, defaultTab: 'all' | 'ready' | 'pull' = 'ready') => {
    setSelectedJob(job);
    setActiveTab('materials'); // Open directly to materials tab
    setMaterialsDefaultTab(defaultTab);
  };

  const handleJobSelectForPullMaterials = (job: Job) => {
    handleJobSelectForMaterials(job, 'pull');
  };

  const handleBackToJobs = () => {
    setSelectedJob(null);
    setActiveTab('timer');
  };

  const handleSignOut = () => {
    clearUser();
    toast.success('Signed out successfully');
  };

  // If showing Gantt chart, render that view
  if (showGanttChart) {
    return (
      <div className="min-h-screen bg-slate-50">
        {/* Header */}
        {!hideHeader && (
        <header className="bg-white border-b-2 border-slate-300 sticky top-0 z-10 shadow-sm">
          <div className="container mx-auto px-2 sm:px-4 py-2 sm:py-3 flex items-center justify-between gap-2 sm:gap-0">
            <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
              <Button variant="outline" size="sm" onClick={() => setShowGanttChart(false)} className="rounded-none border-slate-300 flex-shrink-0 h-8 sm:h-9 px-2 sm:px-3">
                <ArrowLeft className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Back</span>
              </Button>
              <div className="border-l border-slate-300 pl-2 sm:pl-3 min-w-0">
                <p className="font-bold text-green-900 text-sm sm:text-base truncate">All Jobs Schedule</p>
                <p className="text-xs text-black truncate hidden sm:block">
                  {profile?.username} • Foreman
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
              <Button variant="ghost" size="sm" onClick={handleSignOut} className="text-black hover:bg-slate-100 rounded-none h-8 sm:h-9 px-2 sm:px-3">
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </header>
        )}

        <main className="container mx-auto px-2 sm:px-4 py-3 sm:py-6">
          <JobGanttChart
            showWeeks={false}
            onJobSelect={(jobId) => {
              // Load and select the job
              supabase
                .from('jobs')
                .select('*')
                .eq('id', jobId)
                .single()
                .then(({ data, error }) => {
                  if (!error && data) {
                    setSelectedJob(data);
                    setShowGanttChart(false);
                  }
                });
            }}
          />
        </main>
      </div>
    );
  }

  // If showing unavailable calendar, render that view
  if (showUnavailableCalendar) {
    return (
      <div className="min-h-screen bg-slate-50">
        {/* Header */}
        {!hideHeader && (
        <header className="bg-white border-b-2 border-slate-300 sticky top-0 z-10 shadow-sm">
          <div className="container mx-auto px-2 sm:px-4 py-2 sm:py-3 flex items-center justify-between gap-2 sm:gap-0">
            <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
              <img 
                src="https://cdn-ai.onspace.ai/onspace/files/EvPiYskzE4vCidikEdjr5Z/MB_Logo_Green_192x64_12.9kb.png" 
                alt="Martin Builder" 
                className="h-6 sm:h-8 w-auto flex-shrink-0"
              />
              <div className="border-l border-slate-300 pl-2 sm:pl-3 min-w-0">
                <p className="text-xs text-black font-semibold truncate">
                  {profile?.username} • Crew
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
              <Button variant="ghost" size="sm" onClick={handleSignOut} className="text-black hover:bg-slate-100 rounded-none h-8 sm:h-9 px-2 sm:px-3">
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </header>
        )}

        <main className="container mx-auto px-2 sm:px-4 py-3 sm:py-6">
          <UnavailableCalendar
            userId={profile?.id || ''}
            onBack={() => setShowUnavailableCalendar(false)}
          />
        </main>
      </div>
    );
  }

  // If showing calendar page, render that view
  if (showCalendarPage) {
    return (
      <div className="min-h-screen bg-slate-50">
        {/* Header */}
        {!hideHeader && (
        <header className="bg-white border-b-2 border-slate-300 sticky top-0 z-10 shadow-sm">
          <div className="container mx-auto px-2 sm:px-4 py-2 sm:py-3 flex items-center justify-between gap-2 sm:gap-0">
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" onClick={() => setShowCalendarPage(false)} className="rounded-none border-slate-300 flex-shrink-0 h-8 sm:h-9 px-2 sm:px-3">
                <ArrowLeft className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Back</span>
              </Button>
              <div className="border-l border-slate-300 pl-2 sm:pl-3 min-w-0">
                <p className="font-bold text-green-900 text-sm sm:text-base truncate">Calendar</p>
                <p className="text-xs text-black truncate hidden sm:block">
                  {profile?.username} • Crew
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={handleSignOut} className="text-black hover:bg-slate-100 rounded-none">
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </header>
        )}

        <main className="container mx-auto px-2 sm:px-4 py-3 sm:py-6">
          <div className="mb-4">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => {
                setShowCalendarPage(false);
                setCalendarJobId(undefined);
              }}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Jobs
            </Button>
          </div>
          <MasterCalendar 
            jobId={calendarJobId}
            onJobSelect={(jobId) => {
              // Load and select the job
              supabase
                .from('jobs')
                .select('*')
                .eq('id', jobId)
                .single()
                .then(({ data, error }) => {
                  if (!error && data) {
                    setSelectedJob(data);
                    setShowCalendarPage(false);
                    setCalendarJobId(undefined);
                  }
                });
            }}
          />
        </main>
      </div>
    );
  }

  // If showing time history, render that view
  if (showTimeHistory) {
    return (
      <div className="min-h-screen bg-slate-50">
        {/* Header */}
        {!hideHeader && (
        <header className="bg-white border-b-2 border-slate-300 sticky top-0 z-10 shadow-sm">
          <div className="container mx-auto px-2 sm:px-4 py-2 sm:py-3 flex items-center justify-between gap-2 sm:gap-0">
            <div className="flex items-center gap-3">
              <img 
                src="https://cdn-ai.onspace.ai/onspace/files/EvPiYskzE4vCidikEdjr5Z/MB_Logo_Green_192x64_12.9kb.png" 
                alt="Martin Builder" 
                className="h-8 w-auto"
              />
              <div className="border-l border-slate-300 pl-3">
                <p className="text-xs text-black font-semibold">
                  {profile?.username} • Crew
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => setShowCalendarPage(true)}
                className="relative h-8 sm:h-9 w-8 sm:w-9 text-black hover:bg-slate-100 rounded-none"
              >
                <CalendarIcon className="w-4 sm:w-5 h-4 sm:h-5" />
              </Button>
              <Button variant="ghost" size="sm" onClick={handleSignOut} className="text-black hover:bg-slate-100 rounded-none">
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </header>
        )}

        <main className="container mx-auto px-2 sm:px-4 py-3 sm:py-6">
          <MyTimeHistory
            userId={profile?.id || ''}
            onBack={() => setShowTimeHistory(false)}
          />
        </main>
      </div>
    );
  }

  // If no job selected, show job selector
  if (!selectedJob) {
    return (
      <div className="min-h-screen bg-slate-50">
        {/* Header */}
        {!hideHeader && (
        <header className="bg-white border-b-2 border-slate-300 sticky top-0 z-10 shadow-sm">
          <div className="container mx-auto px-2 sm:px-4 py-2 sm:py-3 flex items-center justify-between gap-2 sm:gap-0">
            <div className="flex items-center gap-3">
              <img 
                src="https://cdn-ai.onspace.ai/onspace/files/EvPiYskzE4vCidikEdjr5Z/MB_Logo_Green_192x64_12.9kb.png" 
                alt="Martin Builder" 
                className="h-8 w-auto"
              />
              <div className="border-l border-slate-300 pl-3">
                <p className="text-xs text-black font-semibold">
                  {profile?.username} • Crew
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => setShowCalendarPage(true)}
                className="relative h-8 sm:h-9 w-8 sm:w-9 text-black hover:bg-slate-100 rounded-none"
              >
                <CalendarIcon className="w-4 sm:w-5 h-4 sm:h-5" />
              </Button>
              <NotificationBell
                onNotificationClick={(notification) => {
                  console.log('Crew notification clicked:', notification);
                  
                  // Navigate based on notification type
                  if (notification.type === 'document_revision') {
                    // If we have a job selected and it matches the notification job
                    if (selectedJob?.id === notification.job_id) {
                      setActiveTab('documents');
                      setDocumentTab('documents');
                    } else {
                      // Load the job first
                      supabase
                        .from('jobs')
                        .select('*')
                        .eq('id', notification.job_id)
                        .single()
                        .then(({ data, error }) => {
                          if (!error && data) {
                            setSelectedJob(data);
                            setActiveTab('documents');
                            setDocumentTab('documents');
                          }
                        });
                    }
                    toast.info('New document revision available');
                  }
                }}
                onViewAll={() => {
                  toast.info('View all notifications');
                }}
              />
              <Button variant="ghost" size="sm" onClick={handleSignOut} className="text-black hover:bg-slate-100 rounded-none">
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </header>
        )}

        {/* Active Timers Alert */}
        {activeTimers.length > 0 && (
          <div className="bg-orange-500 text-white p-2 sm:p-3 text-center text-xs sm:text-sm font-bold tracking-wide rounded-none border-b-2 border-slate-300">
            {activeTimers.length} timer{activeTimers.length > 1 ? 's' : ''} running
          </div>
        )}

        {/* Main Content - Job Selection */}
        <main className="container mx-auto px-2 sm:px-4 py-4 sm:py-8 pb-32">
          <div className="space-y-3 sm:space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg sm:text-2xl font-bold text-green-900 tracking-tight">Select a Job</h2>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowCalendarPage(true)}
                className="flex items-center gap-1 sm:gap-2 rounded-none border-slate-300 hover:bg-slate-100 text-black h-8 sm:h-9 px-2 sm:px-3 text-xs sm:text-sm flex-shrink-0"
              >
                <CalendarIcon className="w-3 sm:w-4 h-3 sm:h-4 text-green-900" />
                <span className="hidden sm:inline">All Events</span>
                <span className="sm:hidden">Events</span>
              </Button>
            </div>
            
            <div className="space-y-3 sm:space-y-4">
              {isForeman && (
                <Button
                  onClick={() => setShowGanttChart(true)}
                  variant="outline"
                  size="sm"
                  className="w-full flex items-center gap-2 rounded-none border-slate-300 hover:bg-slate-100 text-black font-semibold mb-3 sm:mb-4 h-9 sm:h-10 text-xs sm:text-sm"
                >
                  <BarChart3 className="w-4 h-4 text-green-900" />
                  <span className="hidden sm:inline">View All Jobs Schedule</span>
                  <span className="sm:hidden">Jobs Schedule</span>
                </Button>
              )}
              
              <JobSelector 
                onSelectJob={handleJobSelect} 
                userId={profile?.id || ''}
                userRole={profile?.role}
                onShowJobCalendar={(job) => {
                  setCalendarJobId(job.id);
                  setShowCalendarPage(true);
                }}
                onSelectJobForMaterials={handleJobSelectForMaterials}
                onSelectJobForPullMaterials={handleJobSelectForPullMaterials}
              />
            </div>
          </div>
        </main>

        {/* Fixed Bottom Action Bar */}
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t-2 border-slate-300 shadow-lg z-10">
          <div className="container mx-auto px-2 sm:px-4 py-2 sm:py-3 space-y-1.5 sm:space-y-2">
            {/* Time Clock Button - Full width */}
            <QuickTimeEntry 
              userId={profile?.id || ''} 
              onSuccess={loadActiveTimers}
              onBack={() => {
                // Return to jobs page (already here, but this ensures state is clean)
                setSelectedJob(null);
                setActiveTab('timer');
              }}
            />
            
            {/* Grid layout for time off calendar and my time button */}
            <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
              {/* Time Off Calendar Button - Left side */}
              <Button
                onClick={() => setShowUnavailableCalendar(true)}
                variant="ghost"
                size="sm"
                className="w-full text-xs text-black hover:bg-slate-100 hover:text-green-900 px-1.5 sm:px-2 py-2 h-auto rounded-none font-semibold"
              >
                <CalendarIcon className="w-3 h-3 mr-0.5 sm:mr-1" />
                Time Off
              </Button>
              
              {/* My Time History Button - Right side */}
              <Button
                onClick={() => setShowTimeHistory(true)}
                variant="ghost"
                size="sm"
                className="w-full text-xs text-black hover:bg-slate-100 hover:text-green-900 px-1.5 sm:px-2 py-2 h-auto rounded-none font-semibold"
              >
                <History className="w-3 h-3 mr-0.5 sm:mr-1" />
                My Time
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Reload job data function
  const reloadJobData = async () => {
    if (!selectedJob) return;
    
    const { data, error } = await supabase
      .from('jobs')
      .select('*')
      .eq('id', selectedJob.id)
      .single();
    
    if (!error && data) {
      setJobData(data);
      setSelectedJob(data);
    }
  };

  // Job selected - show tabbed interface
  return (
    <div className="min-h-screen bg-slate-50 overflow-x-hidden">
      {/* Header */}
      {!hideHeader && (
      <header className="bg-white border-b-2 border-slate-300 sticky top-0 z-10 shadow-sm">
        <div className="w-full max-w-full px-2 sm:px-4 py-2 sm:py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
            <img 
              src="https://cdn-ai.onspace.ai/onspace/files/EvPiYskzE4vCidikEdjr5Z/MB_Logo_Green_192x64_12.9kb.png" 
              alt="Martin Builder" 
              className="h-6 sm:h-8 w-auto flex-shrink-0"
            />
            <div className="border-l border-slate-300 pl-2 sm:pl-3 min-w-0">
              <p className="text-xs text-black font-semibold truncate">
                {profile?.username} • Crew
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
            <Button variant="ghost" size="sm" onClick={handleSignOut} className="text-black hover:bg-slate-100 rounded-none h-8 sm:h-9 px-2 sm:px-3">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>
      )}

      {/* Active Timers Alert */}
      {activeTimers.length > 0 && (
        <div className="bg-orange-500 text-white p-2 sm:p-3 text-center text-xs sm:text-sm font-bold tracking-wide rounded-none border-b-2 border-slate-300">
          {activeTimers.length} timer{activeTimers.length > 1 ? 's' : ''} running
        </div>
      )}

      {/* Job Header */}
      <div className="bg-white border-b-2 border-slate-300">
        <div className="w-full max-w-full px-2 sm:px-4 py-2 sm:py-4">
          <div className="flex items-center gap-2 sm:gap-3">
            <Button variant="ghost" size="sm" onClick={handleBackToJobs} className="rounded-none hover:bg-slate-100 h-8 sm:h-9 px-2 sm:px-3 flex-shrink-0">
              <ArrowLeft className="w-4 h-4 text-black" />
            </Button>
            <div className="flex-1 min-w-0">
              <h1 className="text-base sm:text-xl font-bold text-green-900 tracking-tight truncate">{selectedJob.name}</h1>
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => {
                setCalendarJobId(selectedJob.id); // Filter calendar to current job only
                setShowCalendarPage(true);
              }}
              className="relative rounded-none hover:bg-slate-100 h-8 sm:h-9 px-2 sm:px-3 flex-shrink-0"
            >
              <CalendarIcon className="w-4 h-4 text-green-900" />
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content - Tabbed Interface */}
      <main className="w-full max-w-full px-2 sm:px-4 py-3 sm:py-8 pb-20 sm:pb-24 overflow-x-hidden">
        {activeTab === 'timer' && (
          <TimeTracker
            job={selectedJob}
            userId={profile?.id || ''}
            onBack={handleBackToJobs}
            onTimerUpdate={loadActiveTimers}
          />
        )}

        {activeTab === 'photos' && (
          <PhotoUpload
            job={selectedJob}
            userId={profile?.id || ''}
            onBack={handleBackToJobs}
          />
        )}

        {activeTab === 'documents' && (
          <JobDetails
            job={selectedJob}
            onBack={handleBackToJobs}
            defaultTab={documentTab}
          />
        )}

        {activeTab === 'materials' && (
          <MaterialsList
            job={selectedJob}
            userId={profile?.id || ''}
            allowBundleCreation={false}
            defaultTab={materialsDefaultTab}
          />
        )}

        {activeTab === 'history' && (
          <ComponentHistory
            job={selectedJob}
            userId={profile?.id || ''}
          />
        )}

        {activeTab === 'schedule' && (
          <JobSchedule
            job={selectedJob}
          />
        )}

        {activeTab === 'components' && jobData && (
          <JobComponents
            job={jobData}
            onUpdate={reloadJobData}
          />
        )}
      </main>

      {/* Bottom Navigation - 7 tabs for job features */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t-2 border-slate-300 shadow-lg overflow-hidden">
        <div className="w-full max-w-full flex">
          <Button
            variant="ghost"
            className={`flex-1 flex-col h-auto py-2 sm:py-3 relative border-r border-slate-300 rounded-none px-0.5 sm:px-1 min-h-[60px] ${
              activeTab === 'timer' ? 'bg-green-900 text-white hover:bg-green-800' : 'text-black hover:bg-slate-100'
            }`}
            onClick={() => setActiveTab('timer')}
          >
            {activeTimers.length > 0 && (
              <span className="absolute top-0.5 right-0.5 sm:top-1 sm:right-1 w-2 h-2 bg-orange-500 rounded-full animate-pulse" />
            )}
            <Clock className="w-4 sm:w-5 h-4 sm:h-5 mb-0.5 sm:mb-1 flex-shrink-0" />
            <span className="text-[9px] sm:text-xs font-bold leading-tight">Timer</span>
          </Button>
          <Button
            variant="ghost"
            className={`flex-1 flex-col h-auto py-2 sm:py-3 border-r border-slate-300 rounded-none px-0.5 sm:px-1 min-h-[60px] ${
              activeTab === 'photos' ? 'bg-green-900 text-white hover:bg-green-800' : 'text-black hover:bg-slate-100'
            }`}
            onClick={() => setActiveTab('photos')}
          >
            <Camera className="w-4 sm:w-5 h-4 sm:h-5 mb-0.5 sm:mb-1 flex-shrink-0" />
            <span className="text-[9px] sm:text-xs font-bold leading-tight">Photos</span>
          </Button>
          <Button
            variant="ghost"
            className={`flex-1 flex-col h-auto py-2 sm:py-3 border-r border-slate-300 rounded-none px-0.5 sm:px-1 min-h-[60px] ${
              activeTab === 'documents' ? 'bg-green-900 text-white hover:bg-green-800' : 'text-black hover:bg-slate-100'
            }`}
            onClick={() => setActiveTab('documents')}
          >
            <Briefcase className="w-4 sm:w-5 h-4 sm:h-5 mb-0.5 sm:mb-1 flex-shrink-0" />
            <span className="text-[9px] sm:text-xs font-bold leading-tight">Docs</span>
          </Button>
          <Button
            variant="ghost"
            className={`flex-1 flex-col h-auto py-2 sm:py-3 border-r border-slate-300 rounded-none px-0.5 sm:px-1 min-h-[60px] ${
              activeTab === 'materials' ? 'bg-green-900 text-white hover:bg-green-800' : 'text-black hover:bg-slate-100'
            }`}
            onClick={() => setActiveTab('materials')}
          >
            <Package className="w-4 sm:w-5 h-4 sm:h-5 mb-0.5 sm:mb-1 flex-shrink-0" />
            <span className="text-[9px] sm:text-xs font-bold leading-tight text-center">Matl</span>
          </Button>
          <Button
            variant="ghost"
            className={`flex-1 flex-col h-auto py-2 sm:py-3 border-r border-slate-300 rounded-none px-0.5 sm:px-1 min-h-[60px] ${
              activeTab === 'history' ? 'bg-green-900 text-white hover:bg-green-800' : 'text-black hover:bg-slate-100'
            }`}
            onClick={() => setActiveTab('history')}
          >
            <History className="w-4 sm:w-5 h-4 sm:h-5 mb-0.5 sm:mb-1 flex-shrink-0" />
            <span className="text-[9px] sm:text-xs font-bold leading-tight">History</span>
          </Button>
          <Button
            variant="ghost"
            className={`flex-1 flex-col h-auto py-2 sm:py-3 border-r border-slate-300 rounded-none px-0.5 sm:px-1 min-h-[60px] ${
              activeTab === 'schedule' ? 'bg-green-900 text-white hover:bg-green-800' : 'text-black hover:bg-slate-100'
            }`}
            onClick={() => setActiveTab('schedule')}
          >
            <CalendarIcon className="w-4 sm:w-5 h-4 sm:h-5 mb-0.5 sm:mb-1 flex-shrink-0" />
            <span className="text-[9px] sm:text-xs font-bold leading-tight text-center">Sched</span>
          </Button>
          <Button
            variant="ghost"
            className={`flex-1 flex-col h-auto py-2 sm:py-3 rounded-none px-0.5 sm:px-1 min-h-[60px] ${
              activeTab === 'components' ? 'bg-green-900 text-white hover:bg-green-800' : 'text-black hover:bg-slate-100'
            }`}
            onClick={() => setActiveTab('components')}
          >
            <ListTodo className="w-4 sm:w-5 h-4 sm:h-5 mb-0.5 sm:mb-1 flex-shrink-0" />
            <span className="text-[9px] sm:text-xs font-bold leading-tight">Tasks</span>
          </Button>
        </div>
      </nav>
    </div>
  );
}
