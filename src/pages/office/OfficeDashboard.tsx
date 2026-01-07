import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LogOut, Briefcase, Clock, Camera, Settings, Users, Download, Eye, Archive, Calendar } from 'lucide-react';
import { toast } from 'sonner';
import { JobsView } from '@/components/office/JobsView';
import { TimeEntriesView } from '@/components/office/TimeEntriesView';
import { DailyLogsView } from '@/components/office/DailyLogsView';
import { PhotosView } from '@/components/office/PhotosView';
import { ComponentsManagement } from '@/components/office/ComponentsManagement';
import { UserManagement } from '@/components/office/UserManagement';
import { WorkerManagement } from '@/components/office/WorkerManagement';
import { InternalJobsManagement } from '@/components/office/InternalJobsManagement';
import { DataExport } from '@/components/office/DataExport';
import { NotificationsCenter } from '@/components/office/NotificationsCenter';
import { NotificationBell } from '@/components/office/NotificationBell';
import { JobsCalendar } from '@/components/office/JobsCalendar';
import { MasterCalendar } from '@/components/office/MasterCalendar';
import { SubcontractorManagement } from '@/components/office/SubcontractorManagement';
import { SubcontractorScheduling } from '@/components/office/SubcontractorScheduling';
import { JobGanttChart } from '@/components/office/JobGanttChart';
import { ForemanDashboard } from '@/pages/foreman/ForemanDashboard';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function OfficeDashboard() {
  const { profile, clearUser } = useAuth();
  const [activeTab, setActiveTab] = useState(() => {
    return localStorage.getItem('office-active-tab') || 'jobs';
  });
  const [calendarView, setCalendarView] = useState(() => {
    return localStorage.getItem('office-calendar-view') || 'calendar';
  });
  const [unreadCount, setUnreadCount] = useState(0);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'office' | 'field'>(() => {
    return (localStorage.getItem('office-view-mode') as 'office' | 'field') || 'field';
  });

  // Save view state to localStorage
  useEffect(() => {
    localStorage.setItem('office-active-tab', activeTab);
  }, [activeTab]);

  useEffect(() => {
    localStorage.setItem('office-calendar-view', calendarView);
  }, [calendarView]);

  useEffect(() => {
    localStorage.setItem('office-view-mode', viewMode);
  }, [viewMode]);

  useEffect(() => {
    loadUnreadCount();
    
    // Subscribe to notification changes
    const channel = supabase
      .channel('notifications_count')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'notifications' },
        () => {
          loadUnreadCount();
        }
      )
      .subscribe();
    
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);
  
  async function loadUnreadCount() {
    try {
      const { count, error } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('is_read', false);
      
      if (error) throw error;
      setUnreadCount(count || 0);
    } catch (error) {
      console.error('Error loading unread count:', error);
    }
  }

  const handleSignOut = () => {
    clearUser();
    toast.success('Signed out successfully');
  };

  // If in field view mode, render the foreman dashboard
  if (viewMode === 'field') {
    return (
      <div className="min-h-screen bg-muted/30">
        {/* Header with view switcher */}
        <header className="bg-card border-b shadow-sm">
          <div className="container mx-auto px-4 py-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <img 
                src="https://cdn-ai.onspace.ai/onspace/files/EvPiYskzE4vCidikEdjr5Z/MB_Logo_Green_192x64_12.9kb.png" 
                alt="Martin Builder" 
                className="h-10 w-auto"
              />
              <div className="border-l pl-4">
                <h1 className="text-lg font-bold text-foreground">FieldTrack Pro</h1>
                <p className="text-xs text-muted-foreground">Field View Preview</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Eye className="w-4 h-4 mr-2" />
                    Field View
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setViewMode('office')}>
                    Switch to Office View
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <div className="text-right">
                <p className="text-sm font-medium">{profile?.username || profile?.email}</p>
                <p className="text-xs text-muted-foreground capitalize">{profile?.role}</p>
              </div>
              <Button variant="outline" size="sm" onClick={handleSignOut}>
                <LogOut className="w-4 h-4 mr-2" />
                Sign Out
              </Button>
            </div>
          </div>
        </header>
        {/* Render the Foreman Dashboard */}
        <ForemanDashboard hideHeader={true} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <header className="bg-card border-b shadow-sm">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img 
              src="https://cdn-ai.onspace.ai/onspace/files/EvPiYskzE4vCidikEdjr5Z/MB_Logo_Green_192x64_12.9kb.png" 
              alt="Martin Builder" 
              className="h-10 w-auto"
            />
            <div className="border-l pl-4">
              <h1 className="text-lg font-bold text-foreground">FieldTrack Pro</h1>
              <p className="text-xs text-muted-foreground">Office Dashboard</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Eye className="w-4 h-4 mr-2" />
                  Office View
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setViewMode('field')}>
                  Switch to Field View
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <NotificationBell
              onNotificationClick={(notification) => {
                // Navigate based on notification type
                console.log('Notification clicked:', notification);
                
                // Set the job context if needed
                if (notification.job_id) {
                  setSelectedJobId(notification.job_id);
                }
                
                // Switch to appropriate tab
                switch (notification.type) {
                  case 'daily_log':
                    setActiveTab('logs');
                    break;
                  case 'time_entry':
                    setActiveTab('time');
                    break;
                  case 'photos':
                    setActiveTab('photos');
                    break;
                  case 'material_request':
                  case 'material_status':
                    setActiveTab('jobs');
                    break;
                  case 'document_revision':
                    setActiveTab('jobs');
                    break;
                  default:
                    setActiveTab('notifications');
                }
              }}
              onViewAll={() => setActiveTab('notifications')}
            />
            <div className="text-right">
              <p className="text-sm font-medium">{profile?.username || profile?.email}</p>
              <p className="text-xs text-muted-foreground capitalize">{profile?.role}</p>
            </div>
            <Button variant="outline" size="sm" onClick={handleSignOut}>
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-5 mb-6">
            <TabsTrigger value="jobs" className="flex items-center gap-2">
              <Briefcase className="w-4 h-4" />
              <span className="hidden sm:inline">Jobs</span>
            </TabsTrigger>
            <TabsTrigger value="calendar" className="flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              <span className="hidden sm:inline">Calendar</span>
            </TabsTrigger>
            <TabsTrigger value="time" className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              <span className="hidden sm:inline">Time</span>
            </TabsTrigger>
            <TabsTrigger value="photos" className="flex items-center gap-2">
              <Camera className="w-4 h-4" />
              <span className="hidden sm:inline">Photos</span>
            </TabsTrigger>
            <TabsTrigger value="settings" className="flex items-center gap-2">
              <Settings className="w-4 h-4" />
              <span className="hidden sm:inline">Settings</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="jobs">
            <div className="space-y-6">
              {/* Active Jobs Cards */}
              <JobsView selectedJobId={selectedJobId} />
              
              {/* Master Calendar - Full Width Below Jobs */}
              <MasterCalendar 
                onJobSelect={(jobId) => {
                  setSelectedJobId(jobId);
                  // JobsView will auto-scroll to the selected job
                }} 
              />
            </div>
          </TabsContent>

          <TabsContent value="calendar">
            <Tabs value={calendarView} onValueChange={setCalendarView} className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-6">
                <TabsTrigger value="calendar">
                  <Calendar className="w-4 h-4 mr-2" />
                  Calendar View
                </TabsTrigger>
                <TabsTrigger value="gantt">
                  <Briefcase className="w-4 h-4 mr-2" />
                  Gantt Chart
                </TabsTrigger>
              </TabsList>

              <TabsContent value="calendar">
                <JobsCalendar onJobSelect={(jobId) => {
                  setSelectedJobId(jobId);
                  setActiveTab('jobs');
                }} />
              </TabsContent>

              <TabsContent value="gantt">
                <JobGanttChart onJobSelect={(jobId) => {
                  setSelectedJobId(jobId);
                  setActiveTab('jobs');
                }} />
              </TabsContent>
            </Tabs>
          </TabsContent>

          <TabsContent value="time">
            <TimeEntriesView />
          </TabsContent>

          <TabsContent value="photos">
            <PhotosView />
          </TabsContent>

          <TabsContent value="settings">
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold mb-2">Settings</h2>
                <p className="text-muted-foreground">Manage system configuration, users, and data export</p>
              </div>
              
              <Tabs defaultValue="export" className="w-full">
                <TabsList className="grid w-full grid-cols-8">
                  <TabsTrigger value="export">
                    <Download className="w-4 h-4 mr-2" />
                    Export
                  </TabsTrigger>
                  <TabsTrigger value="components">
                    <Settings className="w-4 h-4 mr-2" />
                    Components
                  </TabsTrigger>
                  <TabsTrigger value="workers">
                    <Users className="w-4 h-4 mr-2" />
                    Workers
                  </TabsTrigger>
                  <TabsTrigger value="subcontractors">
                    <Users className="w-4 h-4 mr-2" />
                    Subs
                  </TabsTrigger>
                  <TabsTrigger value="schedule">
                    <Calendar className="w-4 h-4 mr-2" />
                    Schedule
                  </TabsTrigger>
                  <TabsTrigger value="internal">
                    <Briefcase className="w-4 h-4 mr-2" />
                    Internal
                  </TabsTrigger>
                  <TabsTrigger value="users">
                    <Users className="w-4 h-4 mr-2" />
                    Users
                  </TabsTrigger>
                  <TabsTrigger value="archived">
                    <Archive className="w-4 h-4 mr-2" />
                    Archived
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="export" className="mt-6">
                  <DataExport />
                </TabsContent>

                <TabsContent value="components" className="mt-6">
                  <ComponentsManagement />
                </TabsContent>

                <TabsContent value="workers" className="mt-6">
                  <WorkerManagement />
                </TabsContent>

                <TabsContent value="subcontractors" className="mt-6">
                  <SubcontractorManagement />
                </TabsContent>

                <TabsContent value="schedule" className="mt-6">
                  <SubcontractorScheduling />
                </TabsContent>

                <TabsContent value="internal" className="mt-6">
                  <InternalJobsManagement userId={profile?.id || ''} />
                </TabsContent>

                <TabsContent value="users" className="mt-6">
                  <UserManagement />
                </TabsContent>

                <TabsContent value="archived" className="mt-6">
                  <JobsView showArchived={true} />
                </TabsContent>
              </Tabs>
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
