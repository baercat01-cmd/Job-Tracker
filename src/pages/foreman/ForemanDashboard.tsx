import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Clock, Camera, LogOut, Briefcase, FileText, ArrowLeft, History } from 'lucide-react';
import { toast } from 'sonner';
import type { Job, ActiveTimer } from '@/types';
import { JobSelector } from '@/components/foreman/JobSelector';
import { TimeTracker } from '@/components/foreman/TimeTracker';
import { PhotoUpload } from '@/components/foreman/PhotoUpload';
import { DailyLogForm } from '@/components/foreman/DailyLogForm';
import { JobLogsView } from '@/components/foreman/JobLogsView';
import { JobDetails } from '@/components/foreman/JobDetails';
import { ComponentHistory } from '@/components/foreman/ComponentHistory';

type TabMode = 'timer' | 'photos' | 'documents' | 'history';

export function ForemanDashboard() {
  const { profile, clearUser } = useAuth();
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [activeTab, setActiveTab] = useState<TabMode>('timer');
  const [activeTimers, setActiveTimers] = useState<ActiveTimer[]>([]);

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
        .eq('is_active', true);

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

  // If no job selected, show job selector
  if (!selectedJob) {
    return (
      <div className="min-h-screen bg-muted/30">
        {/* Header */}
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
            <Button variant="ghost" size="sm" onClick={handleSignOut}>
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </header>

        {/* Active Timers Alert */}
        {activeTimers.length > 0 && (
          <div className="bg-success text-success-foreground p-3 text-center text-sm font-medium">
            {activeTimers.length} timer{activeTimers.length > 1 ? 's' : ''} running
          </div>
        )}

        {/* Main Content - Job Selection */}
        <main className="container mx-auto px-4 py-6">
          <div className="space-y-4">
            <div>
              <h2 className="text-2xl font-bold mb-2">Select a Job</h2>
            </div>
            <JobSelector onSelectJob={handleJobSelect} userId={profile?.id || ''} />
          </div>
        </main>
      </div>
    );
  }

  // Job selected - show tabbed interface
  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
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
          <Button variant="ghost" size="sm" onClick={handleSignOut}>
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </header>

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
          />
        )}

        {activeTab === 'history' && (
          <ComponentHistory
            job={selectedJob}
            userId={profile?.id || ''}
          />
        )}
      </main>

      {/* Bottom Navigation - 4 tabs for job features */}
      <nav className="fixed bottom-0 left-0 right-0 bg-card border-t shadow-lg">
        <div className="container mx-auto px-4 py-2 grid grid-cols-4 gap-1">
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
            variant={activeTab === 'history' ? 'default' : 'ghost'}
            className="flex-col h-auto py-3 touch-target"
            onClick={() => setActiveTab('history')}
          >
            <History className="w-6 h-6 mb-1" />
            <span className="text-xs font-medium">History</span>
          </Button>
        </div>
      </nav>
    </div>
  );
}
