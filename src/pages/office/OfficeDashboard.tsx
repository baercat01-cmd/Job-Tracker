import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LogOut, Briefcase, Clock, FileText, Camera, Settings, Users, Download } from 'lucide-react';
import { toast } from 'sonner';
import { JobsView } from '@/components/office/JobsView';
import { TimeEntriesView } from '@/components/office/TimeEntriesView';
import { DailyLogsView } from '@/components/office/DailyLogsView';
import { PhotosView } from '@/components/office/PhotosView';
import { ComponentsManagement } from '@/components/office/ComponentsManagement';
import { UserManagement } from '@/components/office/UserManagement';
import { WorkerManagement } from '@/components/office/WorkerManagement';
import { DataExport } from '@/components/office/DataExport';

export function OfficeDashboard() {
  const { profile, clearUser } = useAuth();
  const [activeTab, setActiveTab] = useState('jobs');

  const handleSignOut = () => {
    clearUser();
    toast.success('Signed out successfully');
  };

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
          <TabsList className="grid w-full grid-cols-8 mb-6">
            <TabsTrigger value="jobs" className="flex items-center gap-2">
              <Briefcase className="w-4 h-4" />
              <span className="hidden sm:inline">Jobs</span>
            </TabsTrigger>
            <TabsTrigger value="time" className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              <span className="hidden sm:inline">Time</span>
            </TabsTrigger>
            <TabsTrigger value="logs" className="flex items-center gap-2">
              <FileText className="w-4 h-4" />
              <span className="hidden sm:inline">Logs</span>
            </TabsTrigger>
            <TabsTrigger value="photos" className="flex items-center gap-2">
              <Camera className="w-4 h-4" />
              <span className="hidden sm:inline">Photos</span>
            </TabsTrigger>
            <TabsTrigger value="export" className="flex items-center gap-2">
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Export</span>
            </TabsTrigger>
            <TabsTrigger value="components" className="flex items-center gap-2">
              <Settings className="w-4 h-4" />
              <span className="hidden sm:inline">Components</span>
            </TabsTrigger>
            <TabsTrigger value="workers" className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              <span className="hidden sm:inline">Workers</span>
            </TabsTrigger>
            <TabsTrigger value="users" className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              <span className="hidden sm:inline">Users</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="jobs">
            <JobsView />
          </TabsContent>

          <TabsContent value="time">
            <TimeEntriesView />
          </TabsContent>

          <TabsContent value="logs">
            <DailyLogsView />
          </TabsContent>

          <TabsContent value="photos">
            <PhotosView />
          </TabsContent>

          <TabsContent value="export">
            <DataExport />
          </TabsContent>

          <TabsContent value="components">
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold mb-2">Component Management</h2>
                <p className="text-muted-foreground">Create and manage global components for job tracking</p>
              </div>
              <ComponentsManagement />
            </div>
          </TabsContent>

          <TabsContent value="workers">
            <WorkerManagement />
          </TabsContent>

          <TabsContent value="users">
            <UserManagement />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
