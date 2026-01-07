import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LogIn, LogOut, Clock } from 'lucide-react';
import { toast } from 'sonner';
import type { Job } from '@/types';

interface ClockInEntry {
  id: string;
  job_id: string;
  job_name: string;
  start_time: string;
  elapsed_seconds: number;
}

interface ShopClockInProps {
  userId: string;
  shopJob: Job | null;
}

export function ShopClockIn({ userId, shopJob }: ShopClockInProps) {
  const [loading, setLoading] = useState(false);
  const [clockedInEntry, setClockedInEntry] = useState<ClockInEntry | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (shopJob) {
      loadClockedInStatus();
    }
  }, [shopJob, userId]);

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    
    if (clockedInEntry) {
      interval = setInterval(() => {
        const start = new Date(clockedInEntry.start_time).getTime();
        const now = Date.now();
        const elapsed = Math.floor((now - start) / 1000);
        setElapsedSeconds(elapsed);
      }, 1000);
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [clockedInEntry]);

  async function loadClockedInStatus() {
    if (!shopJob) return;

    try {
      // Check if user has an active clock-in on the Shop job
      const { data, error } = await supabase
        .from('time_entries')
        .select(`
          id,
          job_id,
          start_time,
          jobs(name)
        `)
        .eq('user_id', userId)
        .eq('job_id', shopJob.id)
        .eq('is_active', true)
        .is('component_id', null)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;

      if (data) {
        const start = new Date(data.start_time).getTime();
        const now = Date.now();
        const elapsed = Math.floor((now - start) / 1000);

        setClockedInEntry({
          id: data.id,
          job_id: data.job_id,
          job_name: (data.jobs as any)?.name || 'Shop',
          start_time: data.start_time,
          elapsed_seconds: elapsed,
        });
        setElapsedSeconds(elapsed);
      } else {
        setClockedInEntry(null);
      }
    } catch (error) {
      console.error('Error loading clocked in status:', error);
    }
  }

  async function handleClockIn() {
    if (!shopJob) {
      toast.error('Shop job not found');
      return;
    }

    setLoading(true);

    try {
      const now = new Date().toISOString();
      
      // Create a time entry with no component (job-level clock in)
      const { data, error } = await supabase
        .from('time_entries')
        .insert({
          job_id: shopJob.id,
          component_id: null, // NULL = job-level time
          user_id: userId,
          start_time: now,
          end_time: null,
          total_hours: null,
          crew_count: 1, // Just the person clocking in
          is_manual: false,
          is_active: true,
          notes: 'Shop - Clock in',
          worker_names: [],
        })
        .select()
        .single();

      if (error) throw error;

      setClockedInEntry({
        id: data.id,
        job_id: shopJob.id,
        job_name: shopJob.name,
        start_time: now,
        elapsed_seconds: 0,
      });
      setElapsedSeconds(0);

      toast.success('Clocked in to Shop');
    } catch (error: any) {
      console.error('Clock in error:', error);
      toast.error('Failed to clock in');
    } finally {
      setLoading(false);
    }
  }

  async function handleClockOut() {
    if (!clockedInEntry) return;

    setLoading(true);

    try {
      const endTime = new Date();
      const totalHours = (endTime.getTime() - new Date(clockedInEntry.start_time).getTime()) / (1000 * 60 * 60);
      const roundedHours = Math.round(totalHours * 4) / 4;

      // Update the time entry
      const { error } = await supabase
        .from('time_entries')
        .update({
          end_time: endTime.toISOString(),
          total_hours: roundedHours,
          is_active: false,
          notes: 'Shop - Clock out',
        })
        .eq('id', clockedInEntry.id);

      if (error) throw error;

      toast.success(`Clocked out: ${roundedHours.toFixed(2)} hours`);
      setClockedInEntry(null);
      setElapsedSeconds(0);
    } catch (error: any) {
      console.error('Clock out error:', error);
      toast.error('Failed to clock out');
    } finally {
      setLoading(false);
    }
  }

  function formatTimerDisplay(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  if (!shopJob) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Clock className="w-16 h-16 mx-auto text-muted-foreground/50 mb-4" />
          <p className="text-lg font-medium text-muted-foreground">
            Shop job not found
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            Please contact office staff to create an internal "Shop" job.
          </p>
        </CardContent>
      </Card>
    );
  }

  // If clocked in, show active status
  if (clockedInEntry) {
    return (
      <div className="space-y-4">
        {/* Active Timer Card */}
        <Card className="border-2 border-success bg-success/10">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <div className="w-3 h-3 bg-success rounded-full animate-pulse" />
                Clocked In to Shop
              </CardTitle>
              <Badge variant="default" className="bg-success">
                Active
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-center py-6 bg-card rounded-lg">
              <p className="text-sm text-muted-foreground mb-2">Time on Shop</p>
              <p className="text-5xl font-mono font-bold text-success">
                {formatTimerDisplay(elapsedSeconds)}
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                {(elapsedSeconds / 3600).toFixed(2)} hours
              </p>
            </div>

            <div className="space-y-2 p-4 bg-card rounded-lg">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Started:</span>
                <span className="font-medium">
                  {new Date(clockedInEntry.start_time).toLocaleTimeString([], { 
                    hour: '2-digit', 
                    minute: '2-digit' 
                  })}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Date:</span>
                <span className="font-medium">
                  {new Date(clockedInEntry.start_time).toLocaleDateString()}
                </span>
              </div>
            </div>

            <Button
              onClick={handleClockOut}
              disabled={loading}
              size="lg"
              className="w-full h-16 text-lg"
              variant="destructive"
            >
              <LogOut className="w-6 h-6 mr-3" />
              {loading ? 'Clocking Out...' : 'Clock Out'}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Not clocked in - show clock in button
  return (
    <div className="space-y-4">
      {/* Clock In Card */}
      <Card className="border-2 border-primary/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary" />
            Shop Time Clock
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 bg-muted/30 rounded-lg border text-center">
            <p className="text-sm text-muted-foreground">
              Clock in to track your time working in the shop. Your hours will be logged to the internal Shop job.
            </p>
          </div>

          <Button
            onClick={handleClockIn}
            disabled={loading}
            size="lg"
            className="w-full h-16 text-lg gradient-primary"
          >
            <LogIn className="w-6 h-6 mr-3" />
            {loading ? 'Clocking In...' : 'Clock In to Shop'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
