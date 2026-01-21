import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LogOut, Briefcase, Clock, Camera, Settings, Users, Download, Eye, Archive, Calendar, ListTodo, FileText } from 'lucide-react';
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
import { EnhancedScheduleView } from '@/components/office/EnhancedScheduleView';
import { JobGanttChart } from '@/components/office/JobGanttChart';
import { ShopTasksManagement } from '@/components/office/ShopTasksManagement';
import { QuotesView } from '@/components/office/QuotesView';
import { QuoteConfigManagement } from '@/components/office/QuoteConfigManagement';
import { ForemanDashboard } from '@/pages/foreman/ForemanDashboard';
import { QuickTimeEntry } from '@/components/foreman/QuickTimeEntry';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function OfficeDashboard() {
  const { profile, clearUser } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState(() => {
    // Always default to 'jobs' tab for office users (ignore localStorage on initial load)
    return tabParam || 'jobs';
  });
  const [unreadCount, setUnreadCount] = useState(0);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'office' | 'field'>('office');

  // Save view state to localStorage and update URL
  // CRITICAL: Use replace: true to prevent scroll reset on URL changes
  // Background state sync - never causes page reload
  useEffect(() => {
    localStorage.setItem('office-active-tab', activeTab);
    // Silent URL update without triggering navigation/reload
    setSearchParams({ tab: activeTab }, { replace: true });
  }, [activeTab, setSearchParams]);

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
  };

  // If in field view mode, render the foreman dashboard
  if (viewMode === 'field') {
    return (
      <div className="min-h-screen bg-slate-50">
        {/* Header with view switcher */}
        <header className="bg-white border-b-2 border-slate-300 shadow-sm">
          <div className="container mx-auto px-4 py-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <img 
                src="https://cdn-ai.onspace.ai/onspace/files/EvPiYskzE4vCidikEdjr5Z/MB_Logo_Green_192x64_12.9kb.png" 
                alt="Martin Builder" 
                className="h-10 w-auto"
              />
              <div className="border-l border-slate-300 pl-4">
                <h1 className="text-lg font-bold text-green-900 tracking-tight">FieldTrack Pro</h1>
                <p className="text-xs text-black">Field View Preview</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="rounded-none border-slate-300 bg-white text-black hover:bg-slate-100">
                    <Eye className="w-4 h-4 mr-2" />
                    Field View
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="rounded-none border-slate-300">
                  <DropdownMenuItem onClick={() => setViewMode('office')} className="rounded-none">
                    Switch to Office View
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <div className="text-right">
                <p className="text-sm font-bold text-black">{profile?.username || profile?.email}</p>
                <p className="text-xs text-black capitalize">{profile?.role}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={handleSignOut} className="rounded-none text-black hover:bg-slate-100">
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
    <div className="min-h-screen bg-slate-50">
      {/* Header with Navigation */}
      <header className="bg-white border-b-4 border-yellow-500 shadow-lg sticky top-0 z-50">
        <div className="container mx-auto px-2 sm:px-4 py-2 sm:py-3 flex items-center justify-between gap-2 sm:gap-4">
          {/* Logo */}
          <img 
            src="https://cdn-ai.onspace.ai/onspace/files/EvPiYskzE4vCidikEdjr5Z/MB_Logo_Green_192x64_12.9kb.png" 
            alt="Martin Builder" 
            className="h-8 sm:h-10 w-auto flex-shrink-0"
          />
          
          {/* Navigation Tabs */}
          <div className="flex items-center gap-0.5 sm:gap-1 flex-1 overflow-x-auto scrollbar-hide">
            <Button
              variant={activeTab === 'jobs' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveTab('jobs')}
              className={`rounded-none h-8 sm:h-9 px-2 sm:px-3 text-xs sm:text-sm flex-shrink-0 ${
                activeTab === 'jobs'
                  ? 'bg-gradient-to-r from-yellow-500 to-yellow-600 text-black font-bold hover:from-yellow-600 hover:to-yellow-700'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <Briefcase className="w-4 h-4 mr-1.5" />
              <span className="hidden sm:inline">Jobs</span>
            </Button>
            <Button
              variant={activeTab === 'quotes' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveTab('quotes')}
              className={`rounded-none h-8 sm:h-9 px-2 sm:px-3 text-xs sm:text-sm flex-shrink-0 ${
                activeTab === 'quotes'
                  ? 'bg-gradient-to-r from-yellow-500 to-yellow-600 text-black font-bold hover:from-yellow-600 hover:to-yellow-700'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <FileText className="w-4 h-4 mr-1.5" />
              <span className="hidden sm:inline">Quotes</span>
            </Button>
            <Button
              variant={activeTab === 'schedule' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveTab('schedule')}
              className={`rounded-none h-8 sm:h-9 px-2 sm:px-3 text-xs sm:text-sm flex-shrink-0 ${
                activeTab === 'schedule'
                  ? 'bg-gradient-to-r from-yellow-500 to-yellow-600 text-black font-bold hover:from-yellow-600 hover:to-yellow-700'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <Calendar className="w-4 h-4 mr-1.5" />
              <span className="hidden sm:inline">Schedule</span>
            </Button>
            <Button
              variant={activeTab === 'calendar' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveTab('calendar')}
              className={`rounded-none h-8 sm:h-9 px-2 sm:px-3 text-xs sm:text-sm flex-shrink-0 ${
                activeTab === 'calendar'
                  ? 'bg-gradient-to-r from-yellow-500 to-yellow-600 text-black font-bold hover:from-yellow-600 hover:to-yellow-700'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <Calendar className="w-4 h-4 mr-1.5" />
              <span className="hidden sm:inline">Calendar</span>
            </Button>
            <Button
              variant={activeTab === 'settings' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveTab('settings')}
              className={`rounded-none h-8 sm:h-9 px-2 sm:px-3 text-xs sm:text-sm flex-shrink-0 ${
                activeTab === 'settings'
                  ? 'bg-gradient-to-r from-yellow-500 to-yellow-600 text-black font-bold hover:from-yellow-600 hover:to-yellow-700'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <Settings className="w-4 h-4 mr-1.5" />
              <span className="hidden sm:inline">Settings</span>
            </Button>
          </div>

          {/* Right Side Actions */}
          <div className="flex items-center gap-1.5 sm:gap-3 flex-shrink-0">
            {/* Quick Time Clock for Office Users */}
            <div className="hidden sm:block w-28">
              <QuickTimeEntry 
                userId={profile?.id || ''} 
                onSuccess={() => {
                  toast.success('Time logged successfully');
                }}
              />
            </div>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="rounded-none border-green-800 bg-white text-green-900 hover:bg-green-800 hover:text-white font-semibold h-8 sm:h-9 px-2 sm:px-3 text-xs sm:text-sm">
                  <Eye className="w-4 h-4 mr-1.5" />
                  <span className="hidden md:inline">Office View</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="rounded-none border-green-800 bg-white">
                <DropdownMenuItem onClick={() => setViewMode('field')} className="rounded-none hover:bg-green-800 hover:text-white">
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
            
            <div className="text-right hidden lg:block">
              <p className="text-sm font-bold text-slate-900">{profile?.username || profile?.email}</p>
              <p className="text-xs text-slate-600 capitalize">{profile?.role}</p>
            </div>
            
            <Button variant="ghost" size="sm" onClick={handleSignOut} className="rounded-none text-slate-900 hover:bg-green-800 hover:text-white h-8 sm:h-9 px-2 sm:px-3 text-xs sm:text-sm">
              <LogOut className="w-4 h-4 mr-1.5" />
              <span className="hidden md:inline">Sign Out</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-2 sm:px-4 py-3 sm:py-6">
        {activeTab === 'jobs' && (
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
        )}

        {activeTab === 'quotes' && (
          <QuotesView />
        )}

        {activeTab === 'schedule' && (
          <EnhancedScheduleView />
        )}

        {activeTab === 'calendar' && (
          <div className="space-y-4">
            <div className="bg-gradient-to-r from-slate-900 via-black to-slate-900 text-white rounded-lg p-4 shadow-lg border-2 border-yellow-500">
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight">Project Timeline</h2>
              <p className="text-yellow-400">Gantt chart view of all active projects</p>
            </div>
            <JobGanttChart onJobSelect={(jobId) => {
              setSelectedJobId(jobId);
              setActiveTab('jobs');
            }} />
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="space-y-6">
            <div className="bg-gradient-to-r from-slate-900 via-black to-slate-900 text-white rounded-lg p-4 shadow-lg border-2 border-yellow-500">
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight">Settings</h2>
              <p className="text-yellow-400">Manage system configuration, users, and data export</p>
            </div>
            
            <Tabs defaultValue="export" className="w-full">
              <TabsList className="grid w-full grid-cols-5 sm:grid-cols-11 bg-black border-2 border-yellow-500 rounded-none shadow-lg overflow-x-auto">
                <TabsTrigger value="export" className="rounded-none data-[state=active]:bg-gradient-to-r data-[state=active]:from-green-800 data-[state=active]:to-green-900 data-[state=active]:text-white data-[state=active]:font-bold text-white hover:bg-green-900/20">
                  <Download className="w-4 h-4 mr-2" />
                  Export
                </TabsTrigger>
                <TabsTrigger value="time" className="rounded-none data-[state=active]:bg-gradient-to-r data-[state=active]:from-green-800 data-[state=active]:to-green-900 data-[state=active]:text-white data-[state=active]:font-bold text-white hover:bg-green-900/20">
                  <Clock className="w-4 h-4 mr-2" />
                  Time
                </TabsTrigger>
                <TabsTrigger value="photos" className="rounded-none data-[state=active]:bg-gradient-to-r data-[state=active]:from-green-800 data-[state=active]:to-green-900 data-[state=active]:text-white data-[state=active]:font-bold text-white hover:bg-green-900/20">
                  <Camera className="w-4 h-4 mr-2" />
                  Photos
                </TabsTrigger>
                <TabsTrigger value="components" className="rounded-none data-[state=active]:bg-gradient-to-r data-[state=active]:from-green-800 data-[state=active]:to-green-900 data-[state=active]:text-white data-[state=active]:font-bold text-white hover:bg-green-900/20">
                  <Settings className="w-4 h-4 mr-2" />
                  Components
                </TabsTrigger>
                <TabsTrigger value="workers" className="rounded-none data-[state=active]:bg-gradient-to-r data-[state=active]:from-green-800 data-[state=active]:to-green-900 data-[state=active]:text-white data-[state=active]:font-bold text-white hover:bg-green-900/20">
                  <Users className="w-4 h-4 mr-2" />
                  Workers
                </TabsTrigger>
                <TabsTrigger value="subcontractors" className="rounded-none data-[state=active]:bg-gradient-to-r data-[state=active]:from-green-800 data-[state=active]:to-green-900 data-[state=active]:text-white data-[state=active]:font-bold text-white hover:bg-green-900/20">
                  <Users className="w-4 h-4 mr-2" />
                  Subs
                </TabsTrigger>
                <TabsTrigger value="internal" className="rounded-none data-[state=active]:bg-gradient-to-r data-[state=active]:from-green-800 data-[state=active]:to-green-900 data-[state=active]:text-white data-[state=active]:font-bold text-white hover:bg-green-900/20">
                  <Briefcase className="w-4 h-4 mr-2" />
                  Internal
                </TabsTrigger>
                <TabsTrigger value="users" className="rounded-none data-[state=active]:bg-gradient-to-r data-[state=active]:from-green-800 data-[state=active]:to-green-900 data-[state=active]:text-white data-[state=active]:font-bold text-white hover:bg-green-900/20">
                  <Users className="w-4 h-4 mr-2" />
                  Users
                </TabsTrigger>
                <TabsTrigger value="archived" className="rounded-none data-[state=active]:bg-gradient-to-r data-[state=active]:from-green-800 data-[state=active]:to-green-900 data-[state=active]:text-white data-[state=active]:font-bold text-white hover:bg-green-900/20">
                  <Archive className="w-4 h-4 mr-2" />
                  Archived
                </TabsTrigger>
                <TabsTrigger value="shop-tasks" className="rounded-none data-[state=active]:bg-gradient-to-r data-[state=active]:from-green-800 data-[state=active]:to-green-900 data-[state=active]:text-white data-[state=active]:font-bold text-white hover:bg-green-900/20">
                  <ListTodo className="w-4 h-4 mr-2" />
                  Shop Tasks
                </TabsTrigger>
                <TabsTrigger value="quote-config" className="rounded-none data-[state=active]:bg-gradient-to-r data-[state=active]:from-green-800 data-[state=active]:to-green-900 data-[state=active]:text-white data-[state=active]:font-bold text-white hover:bg-green-900/20">
                  <Settings className="w-4 h-4 mr-2" />
                  Quote Config
                </TabsTrigger>
              </TabsList>

              <TabsContent value="export" className="mt-6">
                <DataExport />
              </TabsContent>

              <TabsContent value="time" className="mt-6">
                <TimeEntriesView />
              </TabsContent>

              <TabsContent value="photos" className="mt-6">
                <PhotosView />
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

              <TabsContent value="internal" className="mt-6">
                <InternalJobsManagement userId={profile?.id || ''} />
              </TabsContent>

              <TabsContent value="users" className="mt-6">
                <UserManagement />
              </TabsContent>

              <TabsContent value="archived" className="mt-6">
                <JobsView showArchived={true} />
              </TabsContent>

              <TabsContent value="shop-tasks" className="mt-6">
                <ShopTasksManagement userId={profile?.id || ''} />
              </TabsContent>

              <TabsContent value="quote-config" className="mt-6">
                <QuoteConfigManagement />
              </TabsContent>
            </Tabs>
          </div>
        )}
      </main>
    </div>
  );
}
