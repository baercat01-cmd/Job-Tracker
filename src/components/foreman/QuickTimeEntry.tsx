import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  LogIn,
  LogOut,
  Clock,
  Users,
  Timer,
  Edit3,
  ArrowLeft,
} from 'lucide-react';
import { toast } from 'sonner';
import type { Job } from '@/types';

interface TimeDropdownPickerProps {
  value: string; // "HH:MM" format
  onChange: (value: string) => void;
  label: string;
}

function TimeDropdownPicker({ value, onChange, label }: TimeDropdownPickerProps) {
  const [hour24, minute] = value.split(':');
  
  // Convert 24-hour to 12-hour format
  const hour24Int = parseInt(hour24);
  const isPM = hour24Int >= 12;
  const hour12 = hour24Int === 0 ? 12 : hour24Int > 12 ? hour24Int - 12 : hour24Int;
  const period = isPM ? 'PM' : 'AM';

  const hours = Array.from({ length: 12 }, (_, i) => (i + 1).toString());
  const minutes = ['00', '15', '30', '45'];

  const handleHourChange = (h: string) => {
    const hour12Int = parseInt(h);
    let hour24Int = hour12Int;
    
    if (period === 'PM' && hour12Int !== 12) {
      hour24Int = hour12Int + 12;
    } else if (period === 'AM' && hour12Int === 12) {
      hour24Int = 0;
    }
    
    onChange(`${hour24Int.toString().padStart(2, '0')}:${minute}`);
  };

  const handleMinuteChange = (m: string) => {
    onChange(`${hour24.padStart(2, '0')}:${m}`);
  };

  const handlePeriodChange = (p: string) => {
    let newHour24 = hour24Int;
    
    if (p === 'PM' && hour24Int < 12) {
      newHour24 = hour24Int + 12;
    } else if (p === 'AM' && hour24Int >= 12) {
      newHour24 = hour24Int - 12;
    }
    
    onChange(`${newHour24.toString().padStart(2, '0')}:${minute}`);
  };

  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">{label}</Label>
      <div className="flex items-center gap-1">
        <div className="flex-1">
          <Select value={hour12.toString()} onValueChange={handleHourChange}>
            <SelectTrigger className="h-12 text-lg font-mono">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {hours.map((h) => (
                <SelectItem key={h} value={h} className="text-lg font-mono">
                  {h}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="text-2xl font-bold text-muted-foreground pb-1">:</div>

        <div className="flex-1">
          <Select value={minute} onValueChange={handleMinuteChange}>
            <SelectTrigger className="h-12 text-lg font-mono">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {minutes.map((m) => (
                <SelectItem key={m} value={m} className="text-lg font-mono">
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="w-20 ml-1">
          <Select value={period} onValueChange={handlePeriodChange}>
            <SelectTrigger className="h-12 text-lg font-mono">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="AM" className="text-lg font-mono">AM</SelectItem>
              <SelectItem value="PM" className="text-lg font-mono">PM</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}

interface ClockInEntry {
  id: string;
  job_id: string;
  job_name: string;
  start_time: string;
  elapsed_seconds: number;
}

interface QuickTimeEntryProps {
  userId: string;
  onSuccess?: () => void;
  onOpenTimeClock?: () => void;
}

export function QuickTimeEntry({ userId, onSuccess, onOpenTimeClock }: QuickTimeEntryProps) {
  const [loading, setLoading] = useState(false);
  const [clockedInEntry, setClockedInEntry] = useState<ClockInEntry | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [mode, setMode] = useState<'select' | 'timer' | 'manual'>('select');
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string>('');
  const [manualData, setManualData] = useState({
    date: new Date().toISOString().split('T')[0],
    startTime: '06:00',
    endTime: '17:00',
  });

  useEffect(() => {
    loadJobs();
    loadClockedInStatus();
  }, [userId]);

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

  async function loadJobs() {
    try {
      const { data, error } = await supabase
        .from('jobs')
        .select('*')
        .eq('status', 'active')
        .order('name');

      if (error) throw error;
      setJobs(data || []);
    } catch (error) {
      console.error('Error loading jobs:', error);
    }
  }

  async function loadClockedInStatus() {
    try {
      // Check if user has an active clock-in (job-level time entry with is_active = true and no component)
      const { data, error } = await supabase
        .from('time_entries')
        .select(`
          id,
          job_id,
          start_time,
          jobs(name)
        `)
        .eq('user_id', userId)
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
          job_name: (data.jobs as any)?.name || 'Unknown Job',
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

  async function handleTimerClockIn() {
    if (!selectedJobId) {
      toast.error('Please select a job');
      return;
    }

    setLoading(true);

    try {
      const now = new Date().toISOString();
      
      // Create a time entry with no component (job-level clock in)
      const { data, error } = await supabase
        .from('time_entries')
        .insert({
          job_id: selectedJobId,
          component_id: null, // NULL = job-level time
          user_id: userId,
          start_time: now,
          end_time: null,
          total_hours: null,
          crew_count: 1, // Just the person clocking in
          is_manual: false,
          is_active: true,
          notes: 'Clock in - Timer',
          worker_names: [],
        })
        .select()
        .single();

      if (error) throw error;

      const job = jobs.find(j => j.id === selectedJobId);
      
      setClockedInEntry({
        id: data.id,
        job_id: selectedJobId,
        job_name: job?.name || 'Unknown Job',
        start_time: now,
        elapsed_seconds: 0,
      });
      setElapsedSeconds(0);

      toast.success(`Clocked in to ${job?.name}`);
      setMode('select');
      setSelectedJobId('');
      onSuccess?.();
    } catch (error: any) {
      console.error('Clock in error:', error);
      toast.error('Failed to clock in');
    } finally {
      setLoading(false);
    }
  }

  async function handleManualEntry() {
    if (!selectedJobId) {
      toast.error('Please select a job');
      return;
    }

    if (!manualData.startTime || !manualData.endTime) {
      toast.error('Please enter both start and end times');
      return;
    }

    // Calculate total hours
    const start = new Date(`${manualData.date}T${manualData.startTime}`);
    const end = new Date(`${manualData.date}T${manualData.endTime}`);
    
    if (end <= start) {
      toast.error('Clock out time must be after clock in time');
      return;
    }
    
    const totalHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);

    setLoading(true);

    try {
      const startDateTime = new Date(`${manualData.date}T${manualData.startTime}`).toISOString();
      const endDateTime = new Date(`${manualData.date}T${manualData.endTime}`).toISOString();

      const { error } = await supabase
        .from('time_entries')
        .insert({
          job_id: selectedJobId,
          component_id: null,
          user_id: userId,
          start_time: startDateTime,
          end_time: endDateTime,
          total_hours: Math.round(totalHours * 100) / 100,
          crew_count: 1,
          is_manual: true,
          is_active: false,
          notes: 'Manual entry',
          worker_names: [],
        });

      if (error) throw error;

      const job = jobs.find(j => j.id === selectedJobId);
      toast.success(`${totalHours.toFixed(2)} hours logged to ${job?.name}`);
      
      // Reset form
      setMode('select');
      setSelectedJobId('');
      setManualData({
        date: new Date().toISOString().split('T')[0],
        startTime: '06:00',
        endTime: '17:00',
      });
      onSuccess?.();
    } catch (error: any) {
      console.error('Manual entry error:', error);
      toast.error('Failed to log time');
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
      const roundedHours = Math.round(totalHours * 100) / 100;

      // Update the time entry
      const { error } = await supabase
        .from('time_entries')
        .update({
          end_time: endTime.toISOString(),
          total_hours: roundedHours,
          is_active: false,
          notes: 'Clock out',
        })
        .eq('id', clockedInEntry.id);

      if (error) throw error;

      toast.success(`Clocked out: ${roundedHours.toFixed(2)} hours`);
      setClockedInEntry(null);
      setElapsedSeconds(0);
      onSuccess?.();
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

  // If clocked in, show clocked in status
  if (clockedInEntry) {
    return (
      <Card className="border-2 border-success bg-success/10">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <div className="w-3 h-3 bg-success rounded-full animate-pulse" />
              Clocked In
            </CardTitle>
            <Badge variant="default" className="bg-success">
              Active
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-center py-4 bg-card rounded-lg">
            <p className="text-sm text-muted-foreground mb-2">Time on job</p>
            <p className="text-4xl font-mono font-bold text-success">
              {formatTimerDisplay(elapsedSeconds)}
            </p>
          </div>

          <div className="space-y-2 p-3 bg-card rounded-lg">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Job:</span>
              <span className="font-medium">{clockedInEntry.job_name}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Started:</span>
              <span className="font-medium">
                {new Date(clockedInEntry.start_time).toLocaleTimeString([], { 
                  hour: '2-digit', 
                  minute: '2-digit' 
                })}
              </span>
            </div>
          </div>

          <Button
            onClick={handleClockOut}
            disabled={loading}
            size="lg"
            className="w-full h-14 text-lg"
            variant="destructive"
          >
            <LogOut className="w-6 h-6 mr-3" />
            {loading ? 'Clocking Out...' : 'Clock Out'}
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Mode selection screen
  if (mode === 'select') {
    if (!isExpanded) {
      return (
        <Button
          onClick={() => onOpenTimeClock ? onOpenTimeClock() : setIsExpanded(true)}
          size="lg"
          className="w-full h-12 gradient-primary"
        >
          <Clock className="w-5 h-5 mr-2" />
          Time Clock
        </Button>
      );
    }

    return (
      <Card>
        <CardContent className="pt-4 pb-3 space-y-2">
          <Button
            onClick={() => setMode('timer')}
            size="lg"
            className="w-full h-auto py-4 justify-start"
            variant="outline"
          >
            <div className="flex items-center gap-3 w-full">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Timer className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 text-left">
                <p className="font-semibold text-sm">Clock In (Timer)</p>
                <p className="text-xs text-muted-foreground">
                  Start a live timer
                </p>
              </div>
            </div>
          </Button>

          <Button
            onClick={() => setMode('manual')}
            size="lg"
            className="w-full h-auto py-4 justify-start"
            variant="outline"
          >
            <div className="flex items-center gap-3 w-full">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Edit3 className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 text-left">
                <p className="font-semibold text-sm">Manual Entry</p>
                <p className="text-xs text-muted-foreground">
                  Enter time manually
                </p>
              </div>
            </div>
          </Button>

          <Button
            onClick={() => setIsExpanded(false)}
            variant="ghost"
            size="sm"
            className="w-full text-xs text-muted-foreground"
          >
            Cancel
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Timer mode - select job and clock in
  if (mode === 'timer') {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setMode('select');
                setSelectedJobId('');
                setIsExpanded(false);
              }}
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <CardTitle className="flex items-center gap-2">
              <Timer className="w-5 h-5 text-primary" />
              Clock In with Timer
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="timer-job">Select Job</Label>
            <Select value={selectedJobId} onValueChange={setSelectedJobId}>
              <SelectTrigger id="timer-job">
                <SelectValue placeholder="Choose a job..." />
              </SelectTrigger>
              <SelectContent>
                {jobs.map((job) => (
                  <SelectItem key={job.id} value={job.id}>
                    <div className="flex flex-col">
                      <span className="font-medium">{job.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {job.client_name}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            onClick={handleTimerClockIn}
            disabled={loading || !selectedJobId}
            size="lg"
            className="w-full h-14 text-lg gradient-primary"
          >
            <LogIn className="w-6 h-6 mr-3" />
            {loading ? 'Clocking In...' : 'Start Timer'}
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Manual mode - select job and enter time
  if (mode === 'manual') {
    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setMode('select');
                setSelectedJobId('');
                setIsExpanded(false);
                setManualData({
                  date: new Date().toISOString().split('T')[0],
                  startTime: '06:00',
                  endTime: '17:00',
                });
              }}
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <CardTitle className="flex items-center gap-2 text-base">
              <Edit3 className="w-4 h-4 text-primary" />
              Manual Entry
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="manual-job" className="text-sm">Job</Label>
            <Select value={selectedJobId} onValueChange={setSelectedJobId}>
              <SelectTrigger id="manual-job" className="h-9">
                <SelectValue placeholder="Select job..." />
              </SelectTrigger>
              <SelectContent>
                {jobs.map((job) => (
                  <SelectItem key={job.id} value={job.id}>
                    <div className="flex flex-col">
                      <span className="font-medium">{job.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {job.client_name}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="date" className="text-sm">Date</Label>
            <Input
              id="date"
              type="date"
              className="h-9"
              value={manualData.date}
              onChange={(e) => setManualData({ ...manualData, date: e.target.value })}
              max={new Date().toISOString().split('T')[0]}
            />
          </div>

          <TimeDropdownPicker
            label="Clock In Time"
            value={manualData.startTime}
            onChange={(time) => setManualData({ ...manualData, startTime: time })}
          />

          <TimeDropdownPicker
            label="Clock Out Time"
            value={manualData.endTime}
            onChange={(time) => setManualData({ ...manualData, endTime: time })}
          />

          <Button
            onClick={handleManualEntry}
            disabled={loading || !selectedJobId}
            className="w-full gradient-primary"
          >
            <Clock className="w-4 h-4 mr-2" />
            {loading ? 'Logging...' : 'Log Time'}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return null;
}
