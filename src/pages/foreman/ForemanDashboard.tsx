import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Clock, Camera, LogOut, Briefcase, FileText, ArrowLeft, History, Package, BarChart3, Calendar as CalendarIcon } from 'lucide-react';
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

import { MaterialsList } from '@/components/foreman/MaterialsList';
import { NotificationBell } from '@/components/office/NotificationBell';
import { QuickTimeEntry } from '@/components/foreman/QuickTimeEntry';
import { JobsCalendar } from '@/components/office/JobsCalendar';
import { UpcomingEventsWidget } from '@/components/foreman/UpcomingEventsWidget';
import { JobCalendar } from '@/components/office/JobCalendar';
import { JobCalendarPage } from '@/components/office/JobCalendarPage';
import { JobSchedule } from '@/components/office/JobSchedule';


type TabMode = 'timer' | 'photos' | 'documents' | 'materials' | 'history' | 'schedule';

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
  const [showJobCalendar, setShowJobCalendar] = useState<Job | null>(null);

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

  const handleBackToJobs = () => {
    setSelectedJob(null);
    setActiveTab('timer');
  };

  const handleSignOut = () => {
    clearUser();
    toast.success('Signed out successfully');
  };

  // If showing job-specific calendar, render that view
  if (showJobCalendar) {
    return (
      <div className="min-h-screen bg-muted/30">
        {/* Header */}
        {!hideHeader && (
        <header className="bg-card border-b sticky top-0 z-10 shadow-sm">
          <div className="container mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img 
                src="https://cdn-ai.onspace.ai/onspace/files/EvPiYskzE4vCidikEdjr5Z/MB_Logo_Green_192x64_12.9kb.png" 
                alt="Martin Builder" 
                className="h-8 w-auto"
              />
              <div className="border-l pl-3">
                <p className="text-xs text-muted-foreground">
                  {profile?.username} • Crew
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={handleSignOut}>
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </header>
        )}

        <main className="container mx-auto px-4 py-6">
          <JobCalendarPage
            job={showJobCalendar}
            onBack={() => setShowJobCalendar(null)}
          />
        </main>
      </div>
    );
  }

  // If showing calendar page, render that view
  if (showCalendarPage) {
    return (
      <div className="min-h-screen bg-muted/30">
        {/* Header */}
        {!hideHeader && (
        <header className="bg-card border-b sticky top-0 z-10 shadow-sm">
          <div className="container mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" onClick={() => setShowCalendarPage(false)}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
              <div className="border-l pl-3">
                <p className="font-bold">Calendar</p>
                <p className="text-xs text-muted-foreground">
                  {profile?.username} • Crew
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={handleSignOut}>
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </header>
        )}

        <main className="container mx-auto px-4 py-6">
          <div className="mb-4">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setShowCalendarPage(false)}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Jobs
            </Button>
          </div>
          <JobsCalendar 
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
      <div className="min-h-screen bg-muted/30">
        {/* Header */}
        {!hideHeader && (
        <header className="bg-card border-b sticky top-0 z-10 shadow-sm">
          <div className="container mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img 
                src="https://cdn-ai.onspace.ai/onspace/files/EvPiYskzE4vCidikEdjr5Z/MB_Logo_Green_192x64_12.9kb.png" 
                alt="Martin Builder" 
                className="h-8 w-auto"
              />
              <div className="border-l pl-3">
                <p className="text-xs text-muted-foreground">
                  {profile?.username} • Crew
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => setShowCalendarPage(true)}
                className="relative h-9 w-9"
              >
                <CalendarIcon className="w-5 h-5" />
              </Button>
              <Button variant="ghost" size="sm" onClick={handleSignOut}>
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </header>
        )}

        <main className="container mx-auto px-4 py-6">
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
      <div className="min-h-screen bg-muted/30">
        {/* Header */}
        {!hideHeader && (
        <header className="bg-card border-b sticky top-0 z-10 shadow-sm">
          <div className="container mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img 
                src="https://cdn-ai.onspace.ai/onspace/files/EvPiYskzE4vCidikEdjr5Z/MB_Logo_Green_192x64_12.9kb.png" 
                alt="Martin Builder" 
                className="h-8 w-auto"
              />
              <div className="border-l pl-3">
                <p className="text-xs text-muted-foreground">
                  {profile?.username} • Crew
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => setShowCalendarPage(true)}
                className="relative h-9 w-9"
              >
                <CalendarIcon className="w-5 h-5" />
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
              <Button variant="ghost" size="sm" onClick={handleSignOut}>
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </header>
        )}

        {/* Active Timers Alert */}
        {activeTimers.length > 0 && (
          <div className="bg-success text-success-foreground p-3 text-center text-sm font-medium">
            {activeTimers.length} timer{activeTimers.length > 1 ? 's' : ''} running
          </div>
        )}

        {/* Main Content - Job Selection */}
        <main className="container mx-auto px-4 py-6 pb-32">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold">Select a Job</h2>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowCalendarPage(true)}
                className="flex items-center gap-2"
              >
                <CalendarIcon className="w-4 h-4" />
                All Events
              </Button>
            </div>
            
            <JobSelector 
              onSelectJob={handleJobSelect} 
              userId={profile?.id || ''}
              onShowJobCalendar={(job) => setShowJobCalendar(job)}
            />
          </div>
        </main>

        {/* Fixed Bottom Action Bar */}
        <div className="fixed bottom-0 left-0 right-0 bg-card border-t shadow-lg z-10">
          <div className="container mx-auto px-4 py-3 space-y-2">
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
          </div>
        </div>
      </div>
    );
  }

  // Job selected - show tabbed interface
  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      {!hideHeader && (
      <header className="bg-card border-b sticky top-0 z-10 shadow-sm">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img 
              src="https://cdn-ai.onspace.ai/onspace/files/EvPiYskzE4vCidikEdjr5Z/MB_Logo_Green_192x64_12.9kb.png" 
              alt="Martin Builder" 
              className="h-8 w-auto"
            />
            <div className="border-l pl-3">
              <p className="text-xs text-muted-foreground">
                {profile?.username} • Crew
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handleSignOut}>
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>
      )}

      {/* Active Timers Alert */}
      {activeTimers.length > 0 && (
        <div className="bg-success text-success-foreground p-3 text-center text-sm font-medium">
          {activeTimers.length} timer{activeTimers.length > 1 ? 's' : ''} running
        </div>
      )}

      {/* Job Header */}
      <div className="bg-card border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={handleBackToJobs}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div className="flex-1">
              <h1 className="text-xl font-bold">{selectedJob.name}</h1>
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setShowCalendarPage(true)}
              className="relative"
            >
              <CalendarIcon className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content - Tabbed Interface */}
      <main className="container mx-auto px-4 py-6 pb-24">
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
      </main>

      {/* Bottom Navigation - 6 tabs for job features */}
      <nav className="fixed bottom-0 left-0 right-0 bg-card border-t shadow-lg">
        <div className="container mx-auto px-4 py-2 grid grid-cols-6 gap-1">
          <Button
            variant={activeTab === 'timer' ? 'default' : 'ghost'}
            className="flex-col h-auto py-3 touch-target relative"
            onClick={() => setActiveTab('timer')}
          >
            {activeTimers.length > 0 && (
              <span className="absolute top-1 right-1 w-2 h-2 bg-success rounded-full animate-pulse" />
            )}
            <Clock className="w-6 h-6 mb-1" />
            <span className="text-xs font-medium">Timer</span>
          </Button>
          <Button
            variant={activeTab === 'photos' ? 'default' : 'ghost'}
            className="flex-col h-auto py-3 touch-target"
            onClick={() => setActiveTab('photos')}
          >
            <Camera className="w-6 h-6 mb-1" />
            <span className="text-xs font-medium">Photos</span>
          </Button>
          <Button
            variant={activeTab === 'documents' ? 'default' : 'ghost'}
            className="flex-col h-auto py-3 touch-target"
            onClick={() => setActiveTab('documents')}
          >
            <Briefcase className="w-6 h-6 mb-1" />
            <span className="text-xs font-medium">Documents</span>
          </Button>
          <Button
            variant={activeTab === 'materials' ? 'default' : 'ghost'}
            className="flex-col h-auto py-3 touch-target"
            onClick={() => setActiveTab('materials')}
          >
            <Package className="w-6 h-6 mb-1" />
            <span className="text-xs font-medium">Materials</span>
          </Button>
          <Button
            variant={activeTab === 'history' ? 'default' : 'ghost'}
            className="flex-col h-auto py-3 touch-target"
            onClick={() => setActiveTab('history')}
          >
            <History className="w-6 h-6 mb-1" />
            <span className="text-xs font-medium">History</span>
          </Button>
          <Button
            variant={activeTab === 'schedule' ? 'default' : 'ghost'}
            className="flex-col h-auto py-3 touch-target"
            onClick={() => setActiveTab('schedule')}
          >
            <CalendarIcon className="w-6 h-6 mb-1" />
            <span className="text-xs font-medium">Schedule</span>
          </Button>
        </div>
      </nav>
    </div>
  );
}
