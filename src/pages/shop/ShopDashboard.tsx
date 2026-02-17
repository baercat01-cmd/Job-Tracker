import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LogOut, Package, ListTodo, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { ShopMaterialsView } from '@/components/shop/ShopMaterialsView';
import { ShopTasksList } from '@/components/shop/ShopTasksList';
import { ShopClockIn } from '@/components/shop/ShopClockIn';
import type { Job } from '@/types';
import { PWAInstallButton } from '@/components/ui/pwa-install-button';

export function ShopDashboard() {
  const { profile, clearUser } = useAuth();
  const [activeTab, setActiveTab] = useState(() => {
    return localStorage.getItem('shop-active-tab') || 'materials';
  });
  const [shopJob, setShopJob] = useState<Job | null>(null);
  const [loadingJob, setLoadingJob] = useState(true);
  const [showClockDialog, setShowClockDialog] = useState(false);

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
        <div className="container mx-auto px-2 py-1 flex items-center justify-between">
          <img 
            src="https://cdn-ai.onspace.ai/onspace/files/EvPiYskzE4vCidikEdjr5Z/MB_Logo_Green_192x64_12.9kb.png" 
            alt="Martin Builder" 
            className="h-6 w-auto"
          />
          <div className="flex items-center gap-2">
            <div className="text-right hidden sm:block">
              <p className="text-xs font-medium">{profile?.username || profile?.email}</p>
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setShowClockDialog(true)} 
              className="h-7 px-2"
              title="Clock In/Out"
            >
              <Clock className="w-3.5 h-3.5" />
            </Button>
            <Button variant="outline" size="sm" onClick={handleSignOut} className="h-7 w-7 p-0">
              <LogOut className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="materials" className="flex items-center gap-2">
              <Package className="w-4 h-4" />
              <span className="hidden sm:inline">Materials</span>
            </TabsTrigger>
            <TabsTrigger value="tasks" className="flex items-center gap-2">
              <ListTodo className="w-4 h-4" />
              <span className="hidden sm:inline">Tasks</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="materials">
            <ShopMaterialsView userId={profile?.id || ''} />
          </TabsContent>

          <TabsContent value="tasks">
            <ShopTasksList userId={profile?.id || ''} />
          </TabsContent>
        </Tabs>
      </main>

      {/* PWA Install Button */}
      <PWAInstallButton />

      {/* Clock In/Out Dialog */}
      {showClockDialog && shopJob && (
        <ShopClockIn
          userId={profile?.id || ''}
          shopJob={shopJob}
          onClose={() => setShowClockDialog(false)}
        />
      )}
    </div>
  );
}
