import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { LogIn, LogOut, Clock, Calendar, Edit } from 'lucide-react';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';
import type { Job } from '@/types';

function roundToQuarterHours(exactMinutes: number): number {
  const roundedMinutes = Math.round(exactMinutes / 15) * 15;
  return roundedMinutes / 60;
}

function createUTCTimestamp(dateStr: string, timeStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hours, minutes] = timeStr.split(':').map(Number);
  const localDate = new Date(year, month - 1, day, hours, minutes, 0, 0);
  return localDate.toISOString();
}

interface ClockInEntry {
  id: string;
  job_id: string;
  job_name: string;
  start_time: string;
  elapsed_seconds: number;
}

interface ShopTimeEntry {
  id: string;
  start_time: string;
  end_time: string | null;
  total_hours: number | null;
  is_manual: boolean;
}

interface ShopClockInProps {
  userId: string;
  shopJob: Job | null;
}

export function ShopClockIn({ userId, shopJob }: ShopClockInProps) {
  const [loading, setLoading] = useState(false);
  const [clockedInEntry, setClockedInEntry] = useState<ClockInEntry | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [recentEntries, setRecentEntries] = useState<ShopTimeEntry[]>([]);
  const [manualDate, setManualDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [manualStartTime, setManualStartTime] = useState('08:00');
  const [manualEndTime, setManualEndTime] = useState('17:00');
  const [editingEntry, setEditingEntry] = useState<ShopTimeEntry | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editStartTime, setEditStartTime] = useState('');
  const [editEndTime, setEditEndTime] = useState('');

  useEffect(() => {
    if (shopJob) {
      loadClockedInStatus();
      loadRecentEntries();
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

  async function loadRecentEntries() {
    if (!shopJob) return;
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data, error } = await supabase
        .from('time_entries')
        .select('id, start_time, end_time, total_hours, is_manual')
        .eq('user_id', userId)
        .eq('job_id', shopJob.id)
        .is('component_id', null)
        .gte('start_time', thirtyDaysAgo.toISOString())
        .order('start_time', { ascending: false })
        .limit(50);

      if (error) throw error;
      setRecentEntries((data || []).filter((e) => e.end_time != null) as ShopTimeEntry[]);
    } catch (e) {
      console.error('Error loading recent entries', e);
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

      const { data, error } = await supabase
        .from('time_entries')
        .insert({
          job_id: shopJob.id,
          component_id: null,
          user_id: userId,
          start_time: now,
          end_time: null,
          total_hours: null,
          crew_count: 1,
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
      const startMs = new Date(clockedInEntry.start_time).getTime();
      const endMs = Date.now();
      const exactMinutes = (endMs - startMs) / (1000 * 60);
      const roundedMinutes = Math.round(exactMinutes / 15) * 15;
      const roundedHours = roundedMinutes / 60;
      const endTimeRounded = new Date(startMs + roundedMinutes * 60 * 1000);

      const { error } = await supabase
        .from('time_entries')
        .update({
          end_time: endTimeRounded.toISOString(),
          total_hours: roundedHours,
          is_active: false,
          notes: 'Shop - Clock out',
        })
        .eq('id', clockedInEntry.id);

      if (error) throw error;

      toast.success(`Clocked out: ${roundedHours.toFixed(2)} hours`);
      setClockedInEntry(null);
      setElapsedSeconds(0);
      loadRecentEntries();
    } catch (error: any) {
      console.error('Clock out error:', error);
      toast.error('Failed to clock out');
    } finally {
      setLoading(false);
    }
  }

  async function handleManualEntry() {
    if (!shopJob) return;
    if (!manualStartTime || !manualEndTime) {
      toast.error('Please enter both start and end times');
      return;
    }

    const [startH, startM] = manualStartTime.split(':').map(Number);
    const [endH, endM] = manualEndTime.split(':').map(Number);
    const startMins = startH * 60 + startM;
    const endMins = endH * 60 + endM;
    if (endMins <= startMins) {
      toast.error('End time must be after start time');
      return;
    }

    const exactMinutes = endMins - startMins;
    const totalHours = roundToQuarterHours(exactMinutes);
    const startDateTime = createUTCTimestamp(manualDate, manualStartTime);
    const startMs = new Date(startDateTime).getTime();
    const endDateTime = new Date(startMs + totalHours * 60 * 60 * 1000).toISOString();

    setLoading(true);
    try {
      const { error } = await supabase
        .from('time_entries')
        .insert({
          job_id: shopJob.id,
          component_id: null,
          user_id: userId,
          start_time: startDateTime,
          end_time: endDateTime,
          total_hours: totalHours,
          crew_count: 1,
          is_manual: true,
          is_active: false,
          notes: 'Shop - Manual entry',
          worker_names: [],
        });

      if (error) throw error;

      toast.success(`${totalHours.toFixed(2)} hours logged`);
      setManualDate(new Date().toISOString().split('T')[0]);
      setManualStartTime('08:00');
      setManualEndTime('17:00');
      loadRecentEntries();
    } catch (error: any) {
      console.error('Manual entry error:', error);
      toast.error('Failed to log time');
    } finally {
      setLoading(false);
    }
  }

  function openEditDialog(entry: ShopTimeEntry) {
    const d = new Date(entry.start_time);
    setEditDate(d.toISOString().split('T')[0]);
    setEditStartTime(format(d, 'HH:mm'));
    setEditEndTime(entry.end_time ? format(parseISO(entry.end_time), 'HH:mm') : '');
    setEditingEntry(entry);
  }

  async function saveEdit() {
    if (!editingEntry || !editStartTime || !editEndTime) {
      toast.error('Please enter both start and end times');
      return;
    }

    const [startH, startM] = editStartTime.split(':').map(Number);
    const [endH, endM] = editEndTime.split(':').map(Number);
    const startMins = startH * 60 + startM;
    const endMins = endH * 60 + endM;
    if (endMins <= startMins) {
      toast.error('End time must be after start time');
      return;
    }

    const exactMinutes = endMins - startMins;
    const totalHours = roundToQuarterHours(exactMinutes);
    const startDateTime = createUTCTimestamp(editDate, editStartTime);
    const startMs = new Date(startDateTime).getTime();
    const endDateTime = new Date(startMs + totalHours * 60 * 60 * 1000).toISOString();

    setLoading(true);
    try {
      const { error } = await supabase
        .from('time_entries')
        .update({
          start_time: startDateTime,
          end_time: endDateTime,
          total_hours: totalHours,
        })
        .eq('id', editingEntry.id);

      if (error) throw error;

      toast.success('Time entry updated');
      setEditingEntry(null);
      loadRecentEntries();
    } catch (error: any) {
      console.error('Edit entry error:', error);
      toast.error('Failed to update time entry');
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

  const manualEntryCard = (
    <Card className="border-2 border-primary/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Calendar className="w-5 h-5 text-primary" />
          Enter time for a specific day
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3">
          <div>
            <Label htmlFor="shop-manual-date">Date</Label>
            <Input
              id="shop-manual-date"
              type="date"
              value={manualDate}
              onChange={(e) => setManualDate(e.target.value)}
              max={new Date().toISOString().split('T')[0]}
              className="mt-1"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="shop-manual-start">Start time</Label>
              <Input
                id="shop-manual-start"
                type="time"
                value={manualStartTime}
                onChange={(e) => setManualStartTime(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="shop-manual-end">End time</Label>
              <Input
                id="shop-manual-end"
                type="time"
                value={manualEndTime}
                onChange={(e) => setManualEndTime(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
        </div>
        <Button
          onClick={handleManualEntry}
          disabled={loading}
          className="w-full"
          variant="secondary"
        >
          <Clock className="w-4 h-4 mr-2" />
          {loading ? 'Logging...' : 'Log time'}
        </Button>
      </CardContent>
    </Card>
  );

  const recentList = (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Recent shop time</CardTitle>
      </CardHeader>
      <CardContent>
        {recentEntries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No recent entries.</p>
        ) : (
          <ul className="space-y-2 max-h-[280px] overflow-y-auto">
            {recentEntries.map((entry) => (
              <li
                key={entry.id}
                className="flex items-center justify-between gap-2 py-2 px-3 rounded-md bg-muted/50 text-sm"
              >
                <div>
                  <span className="font-medium">
                    {format(parseISO(entry.start_time), 'MMM d, yyyy')}
                  </span>
                  <span className="text-muted-foreground ml-2">
                    {format(parseISO(entry.start_time), 'h:mm a')}
                    {entry.end_time && ` – ${format(parseISO(entry.end_time), 'h:mm a')}`}
                  </span>
                  {entry.total_hours != null && (
                    <span className="ml-2 font-medium">
                      ({(entry.total_hours).toFixed(2)} h)
                    </span>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0 h-8"
                  onClick={() => openEditDialog(entry)}
                  title="Edit entry"
                >
                  <Edit className="w-4 h-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );

  if (clockedInEntry) {
    return (
      <div className="space-y-4">
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
                    minute: '2-digit',
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

        {recentList}
      </div>
    );
  }

  return (
    <div className="space-y-4">
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

      {manualEntryCard}
      {recentList}

      <Dialog open={!!editingEntry} onOpenChange={(open) => !open && setEditingEntry(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit time entry</DialogTitle>
          </DialogHeader>
          {editingEntry && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="edit-date">Date</Label>
                <Input
                  id="edit-date"
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="edit-start">Start time</Label>
                  <Input
                    id="edit-start"
                    type="time"
                    value={editStartTime}
                    onChange={(e) => setEditStartTime(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="edit-end">End time</Label>
                  <Input
                    id="edit-end"
                    type="time"
                    value={editEndTime}
                    onChange={(e) => setEditEndTime(e.target.value)}
                    className="mt-1"
                  />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingEntry(null)}>
              Cancel
            </Button>
            <Button onClick={saveEdit} disabled={loading}>
              {loading ? 'Saving...' : 'Save changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
