import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LogOut, Package, Calendar, ListTodo, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { ShopMaterialsView } from '@/components/shop/ShopMaterialsView';
import { ShopTasksList } from '@/components/shop/ShopTasksList';
import { MasterCalendar } from '@/components/office/MasterCalendar';
import { TimeTracker } from '@/components/foreman/TimeTracker';
import type { Job } from '@/types';

export function ShopDashboard() {
  const { profile, clearUser } = useAuth();
  const [activeTab, setActiveTab] = useState(() => {
    return localStorage.getItem('shop-active-tab') || 'timer';
  });
  const [shopJob, setShopJob] = useState<Job | null>(null);
  const [loadingJob, setLoadingJob] = useState(true);

  // Save active tab to localStorage
  useEffect(() => {
    localStorage.setItem('shop-active-tab', activeTab);
  }, [activeTab]);

  // Load the internal Shop job
  useEffect(() => {
    loadShopJob();
  }, []);

  async function loadShopJob() {
    try {
      setLoadingJob(true);
      const { data, error } = await supabase
        .from('jobs')
        .select('*')
        .eq('is_internal', true)
        .ilike('name', '%shop%')
        .single();

      if (error) throw error;
      setShopJob(data);
    } catch (error: any) {
      console.error('Error loading shop job:', error);
      toast.error('Failed to load shop job');
    } finally {
      setLoadingJob(false);
    }
  }

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
              <p className="text-xs text-muted-foreground">Shop Dashboard</p>
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
          <TabsList className="grid w-full grid-cols-4 mb-6">
            <TabsTrigger value="timer" className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              <span className="hidden sm:inline">Clock In</span>
            </TabsTrigger>
            <TabsTrigger value="materials" className="flex items-center gap-2">
              <Package className="w-4 h-4" />
              <span className="hidden sm:inline">Materials</span>
            </TabsTrigger>
            <TabsTrigger value="tasks" className="flex items-center gap-2">
              <ListTodo className="w-4 h-4" />
              <span className="hidden sm:inline">Tasks</span>
            </TabsTrigger>
            <TabsTrigger value="calendar" className="flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              <span className="hidden sm:inline">Calendar</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="timer">
            {loadingJob ? (
              <div className="text-center py-8">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                <p className="text-muted-foreground">Loading shop job...</p>
              </div>
            ) : shopJob ? (
              <TimeTracker
                job={shopJob}
                userId={profile?.id || ''}
                onBack={() => {}}
                onTimerUpdate={() => {}}
              />
            ) : (
              <div className="text-center py-8">
                <p className="text-muted-foreground">
                  Shop job not found. Please contact office staff to create an internal "Shop" job.
                </p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="materials">
            <ShopMaterialsView userId={profile?.id || ''} />
          </TabsContent>

          <TabsContent value="tasks">
            <ShopTasksList userId={profile?.id || ''} />
          </TabsContent>

          <TabsContent value="calendar">
            <MasterCalendar />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
