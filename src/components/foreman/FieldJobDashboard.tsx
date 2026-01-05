import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Clock, Users, Calendar, TrendingUp, CheckCircle2 } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import type { Job } from '@/types';

interface FieldJobDashboardProps {
  job: Job;
  userId: string;
  activeTimerCount?: number;
}

interface DayStats {
  totalHours: number;
  totalManHours: number;
  entriesCount: number;
}

interface WeekStats {
  totalHours: number;
  totalManHours: number;
  daysWorked: number;
}

interface RecentEntry {
  id: string;
  component_name: string;
  total_hours: number;
  crew_count: number;
  created_at: string;
  is_manual: boolean;
}

export function FieldJobDashboard({ job, userId, activeTimerCount = 0 }: FieldJobDashboardProps) {
  const [loading, setLoading] = useState(true);
  const [todayStats, setTodayStats] = useState<DayStats>({ totalHours: 0, totalManHours: 0, entriesCount: 0 });
  const [weekStats, setWeekStats] = useState<WeekStats>({ totalHours: 0, totalManHours: 0, daysWorked: 0 });
  const [recentEntries, setRecentEntries] = useState<RecentEntry[]>([]);
  const [totalJobHours, setTotalJobHours] = useState(0);

  useEffect(() => {
    loadDashboardData();
  }, [job.id, userId]);

  async function loadDashboardData() {
    setLoading(true);
    try {
      await Promise.all([
        loadTodayStats(),
        loadWeekStats(),
        loadRecentEntries(),
        loadTotalJobHours(),
      ]);
    } catch (error) {
      console.error('Error loading dashboard:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadTodayStats() {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      const { data, error } = await supabase
        .from('time_entries')
        .select('total_hours, crew_count')
        .eq('job_id', job.id)
        .eq('user_id', userId)
        .gte('start_time', `${today}T00:00:00`)
        .lte('start_time', `${today}T23:59:59`)
        .not('total_hours', 'is', null);

      if (error) throw error;

      const totalHours = (data || []).reduce((sum, entry) => sum + (entry.total_hours || 0), 0);
      const totalManHours = (data || []).reduce((sum, entry) => 
        sum + ((entry.total_hours || 0) * (entry.crew_count || 1)), 0
      );

      setTodayStats({
        totalHours,
        totalManHours,
        entriesCount: data?.length || 0,
      });
    } catch (error) {
      console.error('Error loading today stats:', error);
    }
  }

  async function loadWeekStats() {
    try {
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      
      const { data, error } = await supabase
        .from('time_entries')
        .select('total_hours, crew_count, start_time')
        .eq('job_id', job.id)
        .eq('user_id', userId)
        .gte('start_time', weekAgo.toISOString())
        .not('total_hours', 'is', null);

      if (error) throw error;

      const totalHours = (data || []).reduce((sum, entry) => sum + (entry.total_hours || 0), 0);
      const totalManHours = (data || []).reduce((sum, entry) => 
        sum + ((entry.total_hours || 0) * (entry.crew_count || 1)), 0
      );

      // Count unique days worked
      const uniqueDays = new Set((data || []).map(entry => 
        new Date(entry.start_time).toISOString().split('T')[0]
      ));

      setWeekStats({
        totalHours,
        totalManHours,
        daysWorked: uniqueDays.size,
      });
    } catch (error) {
      console.error('Error loading week stats:', error);
    }
  }

  async function loadRecentEntries() {
    try {
      const { data, error } = await supabase
        .from('time_entries')
        .select(`
          id,
          total_hours,
          crew_count,
          created_at,
          is_manual,
          components(name)
        `)
        .eq('job_id', job.id)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) throw error;

      const entries: RecentEntry[] = (data || []).map((entry: any) => ({
        id: entry.id,
        component_name: entry.components?.name || 'Unknown',
        total_hours: entry.total_hours || 0,
        crew_count: entry.crew_count || 1,
        created_at: entry.created_at,
        is_manual: entry.is_manual,
      }));

      setRecentEntries(entries);
    } catch (error) {
      console.error('Error loading recent entries:', error);
    }
  }

  async function loadTotalJobHours() {
    try {
      const { data, error } = await supabase
        .from('time_entries')
        .select('total_hours, crew_count')
        .eq('job_id', job.id)
        .not('total_hours', 'is', null);

      if (error) throw error;

      const totalManHours = (data || []).reduce((sum, entry) => 
        sum + ((entry.total_hours || 0) * (entry.crew_count || 1)), 0
      );

      setTotalJobHours(totalManHours);
    } catch (error) {
      console.error('Error loading total job hours:', error);
    }
  }

  function formatTimeAgo(timestamp: string): string {
    const now = Date.now();
    const time = new Date(timestamp).getTime();
    const diff = now - time;
    
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    return `${days}d ago`;
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading...</p>
        </CardContent>
      </Card>
    );
  }

  const estimatedHours = job.estimated_hours || 0;
  const progressPercent = estimatedHours > 0 ? Math.min((totalJobHours / estimatedHours) * 100, 100) : 0;
  const isOverBudget = totalJobHours > estimatedHours && estimatedHours > 0;

  return (
    <div className="space-y-4">
      {/* Active Status Banner */}
      {activeTimerCount > 0 && (
        <Card className="border-2 border-success bg-success/10">
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 bg-success rounded-full animate-pulse" />
              <div className="flex-1">
                <p className="font-bold text-success">
                  {activeTimerCount} Active Timer{activeTimerCount > 1 ? 's' : ''}
                </p>
                <p className="text-xs text-muted-foreground">Currently tracking time</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Stats */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-primary">
                <Clock className="w-4 h-4" />
                <span className="text-xs font-medium uppercase tracking-wide">Today</span>
              </div>
              <div>
                <p className="text-3xl font-bold">{todayStats.totalManHours.toFixed(1)}</p>
                <p className="text-xs text-muted-foreground">man-hours</p>
              </div>
              {todayStats.entriesCount > 0 && (
                <p className="text-xs text-muted-foreground">
                  {todayStats.entriesCount} {todayStats.entriesCount === 1 ? 'entry' : 'entries'}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-primary">
                <Calendar className="w-4 h-4" />
                <span className="text-xs font-medium uppercase tracking-wide">This Week</span>
              </div>
              <div>
                <p className="text-3xl font-bold">{weekStats.totalManHours.toFixed(1)}</p>
                <p className="text-xs text-muted-foreground">man-hours</p>
              </div>
              {weekStats.daysWorked > 0 && (
                <p className="text-xs text-muted-foreground">
                  {weekStats.daysWorked} {weekStats.daysWorked === 1 ? 'day' : 'days'} worked
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Project Progress */}
      {estimatedHours > 0 && (
        <Card className="border-2 border-primary/20">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="w-4 h-4 text-primary" />
              Project Progress
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Completion</span>
              <span className={`font-bold ${isOverBudget ? 'text-destructive' : 'text-primary'}`}>
                {progressPercent.toFixed(0)}%
              </span>
            </div>
            <Progress value={progressPercent} className="h-3" />
            <div className="grid grid-cols-2 gap-3 text-center text-sm">
              <div className="p-2 bg-muted/30 rounded-lg">
                <p className="text-lg font-bold">{totalJobHours.toFixed(1)}</p>
                <p className="text-xs text-muted-foreground">Hours Used</p>
              </div>
              <div className="p-2 bg-muted/30 rounded-lg">
                <p className="text-lg font-bold">{estimatedHours.toFixed(1)}</p>
                <p className="text-xs text-muted-foreground">Estimated</p>
              </div>
            </div>
            {isOverBudget && (
              <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-2 text-center">
                <p className="text-xs text-destructive font-medium">Over Budget</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Recent Activity */}
      {recentEntries.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckCircle2 className="w-4 h-4 text-primary" />
              Your Recent Work
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {recentEntries.map((entry) => (
                <div key={entry.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm truncate">{entry.component_name}</p>
                      {entry.is_manual && (
                        <Badge variant="outline" className="text-xs">Manual</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {(entry.total_hours * entry.crew_count).toFixed(1)}h
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        {entry.crew_count}
                      </span>
                      <span>{formatTimeAgo(entry.created_at)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {recentEntries.length === 0 && todayStats.entriesCount === 0 && (
        <Card>
          <CardContent className="py-8 text-center">
            <Clock className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No time logged yet</p>
            <p className="text-xs text-muted-foreground mt-1">Start a timer to begin tracking</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
