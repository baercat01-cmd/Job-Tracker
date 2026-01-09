
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  LogIn,
  LogOut,
  Clock,
  Users,
  Timer,
  Edit3,
  ArrowLeft,
  X,
  Briefcase,
  MapPin,
  FileText,
  Package,
} from 'lucide-react';
import { toast } from 'sonner';
import type { Job, Component } from '@/types';

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
      <Label className="text-base font-semibold text-blue-700">{label}</Label>
      <div className="flex items-center gap-1">
        <div className="flex-1">
          <Select value={hour12.toString()} onValueChange={handleHourChange}>
            <SelectTrigger className="h-14 text-xl font-mono font-bold border-2 border-blue-300 bg-white shadow-sm hover:border-blue-500 transition-colors">
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

        <div className="text-2xl font-bold text-blue-600 pb-1">:</div>

        <div className="flex-1">
          <Select value={minute} onValueChange={handleMinuteChange}>
            <SelectTrigger className="h-14 text-xl font-mono font-bold border-2 border-blue-300 bg-white shadow-sm hover:border-blue-500 transition-colors">
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
            <SelectTrigger className="h-14 text-xl font-mono font-bold border-2 border-blue-300 bg-white shadow-sm hover:border-blue-500 transition-colors">
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
  onBack?: () => void;
  allowedJobs?: Job[]; // Optional: restrict to specific jobs only
}

export function QuickTimeEntry({ userId, onSuccess, onBack, allowedJobs }: QuickTimeEntryProps) {
  const [loading, setLoading] = useState(false);
  const [clockedInEntry, setClockedInEntry] = useState<ClockInEntry | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [mode, setMode] = useState<'timer' | 'manual'>('manual'); // Default to manual
  const [showDialog, setShowDialog] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string>('');
  const [manualData, setManualData] = useState({
    date: new Date().toISOString().split('T')[0],
    startTime: '06:00',
    endTime: '17:00',
  });
  const [jobType, setJobType] = useState<'existing' | 'misc'>('existing');
  const [miscJobData, setMiscJobData] = useState({
    name: '',
    address: '',
    date: new Date().toISOString().split('T')[0],
    startTime: '06:00',
    endTime: '17:00',
    notes: '',
  });
  const [miscJobsId, setMiscJobsId] = useState<string | null>(null);
  const [components, setComponents] = useState<Component[]>([]);
  const [jobComponents, setJobComponents] = useState<Array<{
    componentId: string;
    hours: string;
    minutes: string;
  }>>([]);

  useEffect(() => {
    loadJobs();
    loadClockedInStatus();
    loadOrCreateMiscJobsCategory();
  }, [userId]);

  useEffect(() => {
    if (selectedJobId) {
      loadComponents(selectedJobId);
    }
  }, [selectedJobId]);

  // Calculate default component time from job time
  const calculateDefaultComponentTime = () => {
    if (!manualData.startTime || !manualData.endTime) return { hours: '0', minutes: '0' };
    
    const start = new Date(`${manualData.date}T${manualData.startTime}`);
    const end = new Date(`${manualData.date}T${manualData.endTime}`);
    
    if (end <= start) return { hours: '0', minutes: '0' };
    
    const totalMinutes = Math.floor((end.getTime() - start.getTime()) / (1000 * 60));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = Math.floor((totalMinutes % 60) / 15) * 15; // Round to nearest 15
    
    return { hours: hours.toString(), minutes: minutes.toString() };
  };

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
      // If allowedJobs is provided, use those instead of loading from database
      if (allowedJobs) {
        setJobs(allowedJobs);
        return;
      }

      const { data, error } = await supabase
        .from('jobs')
        .select('*')
        .eq('status', 'active')
        .order('name');

      if (error) throw error;
      
      // Sort: regular jobs first, then internal jobs at bottom
      const sortedJobs = (data || []).sort((a, b) => {
        // If both are internal or both are not, sort by name
        if (a.is_internal === b.is_internal) {
          return a.name.localeCompare(b.name);
        }
        // Regular jobs (is_internal = false) come first
        return a.is_internal ? 1 : -1;
      });
      
      setJobs(sortedJobs);
    } catch (error) {
      console.error('Error loading jobs:', error);
    }
  }

  async function loadComponents(jobId: string) {
    try {
      // Get job to find its components
      const { data: job, error: jobError } = await supabase
        .from('jobs')
        .select('components')
        .eq('id', jobId)
        .single();

      if (jobError) throw jobError;

      const jobComponents = Array.isArray(job.components) ? job.components : [];
      
      if (jobComponents.length > 0) {
        const activeJobComponents = jobComponents.filter((c: any) => c.isActive);
        
        const { data, error } = await supabase
          .from('components')
          .select('*')
          .in('id', activeJobComponents.map((c: any) => c.id))
          .eq('archived', false);

        if (error) throw error;
        setComponents(data || []);
      } else {
        // Fallback: load all active components
        const { data, error } = await supabase
          .from('components')
          .select('*')
          .eq('archived', false)
          .order('name');

        if (error) throw error;
        setComponents(data || []);
      }
    } catch (error) {
      console.error('Error loading components:', error);
      setComponents([]);
    }
  }

  async function loadOrCreateMiscJobsCategory() {
    try {
      // Check if Misc Jobs internal job exists (created manually by crew member)
      const { data: existing, error: fetchError } = await supabase
        .from('jobs')
        .select('id')
        .eq('name', 'Misc Jobs')
        .eq('is_internal', true)
        .maybeSingle();

      if (fetchError && fetchError.code !== 'PGRST116') throw fetchError;

      if (existing) {
        setMiscJobsId(existing.id);
      }
      // No auto-creation - user must manually create via Internal Jobs Management
    } catch (error) {
      console.error('Error loading Misc Jobs category:', error);
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
      setShowDialog(false);
      setSelectedJobId('');
      onSuccess?.();
      onBack?.();
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

    // Validate component times if any components are selected
    if (jobComponents.length > 0) {
      for (const comp of jobComponents) {
        const compHours = parseInt(comp.hours) + parseInt(comp.minutes) / 60;
        if (compHours <= 0) {
          toast.error('All component times must be greater than 0');
          return;
        }
        if (compHours > totalHours) {
          toast.error('Component time cannot exceed total job time');
          return;
        }
      }
    }

    setLoading(true);

    try {
      const startDateTime = new Date(`${manualData.date}T${manualData.startTime}`).toISOString();
      const endDateTime = new Date(`${manualData.date}T${manualData.endTime}`).toISOString();

      // Save job-level time entry
      const { error } = await supabase
        .from('time_entries')
        .insert({
          job_id: selectedJobId,
          component_id: null,
          user_id: userId,
          start_time: startDateTime,
          end_time: endDateTime,
          total_hours: Math.round(totalHours * 4) / 4,
          crew_count: 1,
          is_manual: true,
          is_active: false,
          notes: 'Manual entry',
          worker_names: [],
        });

      if (error) throw error;

      // Save component time entries if any components are selected
      if (jobComponents.length > 0) {
        const componentEntries = jobComponents.map(comp => {
          const compHours = parseInt(comp.hours) + parseInt(comp.minutes) / 60;
          return {
            job_id: selectedJobId,
            component_id: comp.componentId,
            user_id: userId,
            start_time: startDateTime,
            end_time: endDateTime,
            total_hours: Math.round(compHours * 4) / 4,
            crew_count: 1,
            is_manual: true,
            is_active: false,
            notes: 'Component time from job entry',
            worker_names: [],
          };
        });

        const { error: compError } = await supabase
          .from('time_entries')
          .insert(componentEntries);

        if (compError) throw compError;
      }

      const job = jobs.find(j => j.id === selectedJobId);
      const componentMsg = jobComponents.length > 0
        ? ` (${jobComponents.length} component${jobComponents.length > 1 ? 's' : ''})`
        : '';
      toast.success(`${totalHours.toFixed(2)} hours logged to ${job?.name}${componentMsg}`);
      
      // Reset and close
      setShowDialog(false);
      setSelectedJobId('');
      setManualData({
        date: new Date().toISOString().split('T')[0],
        startTime: '06:00',
        endTime: '17:00',
      });
      setJobComponents([]);
      onSuccess?.();
      onBack?.();
    } catch (error: any) {
      console.error('Manual entry error:', error);
      toast.error('Failed to log time');
    } finally {
      setLoading(false);
    }
  }



  async function handleMiscJobEntry() {
    if (!miscJobData.name.trim()) {
      toast.error('Please enter a job name');
      return;
    }

    if (!miscJobData.address.trim()) {
      toast.error('Please enter a job address');
      return;
    }

    if (!miscJobData.startTime || !miscJobData.endTime) {
      toast.error('Please enter both start and end times');
      return;
    }

    if (!miscJobsId) {
      toast.error('Misc Jobs category not available');
      return;
    }

    // Calculate total hours
    const start = new Date(`${miscJobData.date}T${miscJobData.startTime}`);
    const end = new Date(`${miscJobData.date}T${miscJobData.endTime}`);
    
    if (end <= start) {
      toast.error('Clock out time must be after clock in time');
      return;
    }
    
    const totalHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);

    setLoading(true);

    try {
      const startDateTime = new Date(`${miscJobData.date}T${miscJobData.startTime}`).toISOString();
      const endDateTime = new Date(`${miscJobData.date}T${miscJobData.endTime}`).toISOString();

      // Create structured notes with job details
      const notesData = {
        type: 'misc_job',
        jobName: miscJobData.name,
        address: miscJobData.address,
        notes: miscJobData.notes || '',
      };

      const { error } = await supabase
        .from('time_entries')
        .insert({
          job_id: miscJobsId,
          component_id: null,
          user_id: userId,
          start_time: startDateTime,
          end_time: endDateTime,
          total_hours: Math.round(totalHours * 4) / 4,
          crew_count: 1,
          is_manual: true,
          is_active: false,
          notes: JSON.stringify(notesData),
          worker_names: [],
        });

      if (error) throw error;

      toast.success(`${totalHours.toFixed(2)} hours logged to misc job: ${miscJobData.name}`);
      
      // Reset and close
      setShowDialog(false);
      setMiscJobData({
        name: '',
        address: '',
        date: new Date().toISOString().split('T')[0],
        startTime: '06:00',
        endTime: '17:00',
        notes: '',
      });
      onSuccess?.();
      onBack?.();
    } catch (error: any) {
      console.error('Misc job entry error:', error);
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
      const roundedHours = Math.round(totalHours * 4) / 4;

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
      onBack?.();
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

  // Main button to open dialog
  return (
    <>
      <Button
        onClick={() => setShowDialog(true)}
        className="w-full h-10 gradient-primary text-sm"
      >
        <Clock className="w-4 h-4 mr-2" />
        Time Clock
      </Button>

      {/* Time Clock Dialog */}
      <Dialog 
        open={showDialog} 
        onOpenChange={(open) => {
          setShowDialog(open);
          if (!open) {
            // Reset when closing
            setMode('manual');
            setSelectedJobId('');
            setManualData({
              date: new Date().toISOString().split('T')[0],
              startTime: '06:00',
              endTime: '17:00',
            });
            setMiscJobData({
              name: '',
              address: '',
              date: new Date().toISOString().split('T')[0],
              startTime: '06:00',
              endTime: '17:00',
              notes: '',
            });
            setJobComponents([]);
            onBack?.(); // Go back to jobs page
          }
        }}
      >
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-primary" />
                Time Clock
              </DialogTitle>
            </div>
          </DialogHeader>

          {/* Job Type Selection */}
          <div className="grid grid-cols-2 gap-1.5 p-1 bg-muted/50 rounded-md">
            <Button
              variant={jobType === 'existing' ? 'secondary' : 'ghost'}
              onClick={() => setJobType('existing')}
              size="sm"
              className="h-8 text-xs"
            >
              <Briefcase className="w-3 h-3 mr-1.5" />
              Existing Job
            </Button>
            <Button
              variant={jobType === 'misc' ? 'secondary' : 'ghost'}
              onClick={() => setJobType('misc')}
              size="sm"
              className="h-8 text-xs"
            >
              <FileText className="w-3 h-3 mr-1.5" />
              Misc Job
            </Button>
          </div>

          <div className="space-y-4">
            {/* Existing Job Flow */}
            {jobType === 'existing' && (
              <>
                {/* Mode Toggle */}
                <div className="grid grid-cols-2 gap-1.5 p-1 bg-muted/50 rounded-md">
                  <Button
                    variant={mode === 'manual' ? 'secondary' : 'ghost'}
                    onClick={() => setMode('manual')}
                    size="sm"
                    className="h-8 text-xs"
                  >
                    <Edit3 className="w-3 h-3 mr-1.5" />
                    Manual Entry
                  </Button>
                  <Button
                    variant={mode === 'timer' ? 'secondary' : 'ghost'}
                    onClick={() => setMode('timer')}
                    size="sm"
                    className="h-8 text-xs"
                  >
                    <Timer className="w-3 h-3 mr-1.5" />
                    Timer
                  </Button>
                </div>

                {/* Date Field - Show above job selection in manual mode */}
                {mode === 'manual' && (
                  <div className="space-y-2">
                    <Label htmlFor="dialog-date" className="text-base font-semibold">Date *</Label>
                    <Input
                      id="dialog-date"
                      type="date"
                      className="h-12"
                      value={manualData.date}
                      onChange={(e) => setManualData({ ...manualData, date: e.target.value })}
                      max={new Date().toISOString().split('T')[0]}
                    />
                  </div>
                )}

                {/* Job Selection - Highlighted */}
                <div className="space-y-2 p-4 border-2 border-primary/50 rounded-lg bg-primary/5">
                  <Label htmlFor="dialog-job" className="text-lg font-bold text-primary flex items-center gap-2">
                    <Briefcase className="w-5 h-5" />
                    Select Job *
                  </Label>
                  <Select value={selectedJobId} onValueChange={setSelectedJobId}>
                    <SelectTrigger id="dialog-job" className="h-14 text-base font-semibold border-2 border-primary/30 bg-background shadow-sm hover:border-primary transition-colors">
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

                {/* Manual Entry Fields */}
                {mode === 'manual' && (
                  <>

                    <div className="p-4 border-2 border-blue-500/50 rounded-lg bg-blue-50/50 space-y-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Clock className="w-5 h-5 text-blue-600" />
                        <span className="text-lg font-bold text-blue-700">Time Entry *</span>
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
                    </div>
                  </>
                )}

                {/* Timer Mode Info */}
                {mode === 'timer' && (
                  <div className="p-4 bg-muted/30 rounded-lg border">
                    <p className="text-sm text-muted-foreground">
                      Start a live timer to track your time on this job. You'll be able to clock out when you're done.
                    </p>
                  </div>
                )}

                {/* Component Time (Optional) - Only show in manual mode */}
                {mode === 'manual' && selectedJobId && components.length > 0 && (
                  <div className="space-y-3 pt-4 border-t">
                    <div className="space-y-3">
                        {jobComponents.map((comp, index) => (
                          <div key={index} className="space-y-2 p-3 border rounded-lg bg-card">
                            <div className="flex items-center justify-between">
                              <Label className="text-xs font-medium">Component {index + 1}</Label>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setJobComponents(jobComponents.filter((_, i) => i !== index));
                                }}
                              >
                                <X className="w-3 h-3" />
                              </Button>
                            </div>
                            
                            <div className="space-y-2">
                              <Select 
                                value={comp.componentId} 
                                onValueChange={(value) => {
                                  const updated = [...jobComponents];
                                  updated[index].componentId = value;
                                  setJobComponents(updated);
                                }}
                              >
                                <SelectTrigger className="h-10">
                                  <SelectValue placeholder="Select component..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {components
                                    .filter(c => !jobComponents.some((jc, i) => i !== index && jc.componentId === c.id))
                                    .map((c) => (
                                      <SelectItem key={c.id} value={c.id}>
                                        {c.name}
                                      </SelectItem>
                                    ))}
                                </SelectContent>
                              </Select>
                            </div>

                            {comp.componentId && (
                              <div className="space-y-2">
                                <Label className="text-xs">Time on Component</Label>
                                <div className="grid grid-cols-2 gap-2">
                                  <Select 
                                    value={comp.hours} 
                                    onValueChange={(value) => {
                                      const updated = [...jobComponents];
                                      updated[index].hours = value;
                                      setJobComponents(updated);
                                    }}
                                  >
                                    <SelectTrigger className="h-10">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="max-h-[200px]">
                                      {[...Array(25)].map((_, i) => (
                                        <SelectItem key={i} value={i.toString()}>
                                          {i}h
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <Select 
                                    value={comp.minutes} 
                                    onValueChange={(value) => {
                                      const updated = [...jobComponents];
                                      updated[index].minutes = value;
                                      setJobComponents(updated);
                                    }}
                                  >
                                    <SelectTrigger className="h-10">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="max-h-[200px]">
                                      {[0, 15, 30, 45].map((min) => (
                                        <SelectItem key={min} value={min.toString()}>
                                          {min}m
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="bg-primary/10 rounded p-2 text-center">
                                  <p className="text-xs text-muted-foreground">Total Time</p>
                                  <p className="text-base font-bold text-primary">
                                    {(parseInt(comp.hours) + parseInt(comp.minutes) / 60).toFixed(2)} hours
                                  </p>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>

                    {/* Add Another Component Button */}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const defaultTime = calculateDefaultComponentTime();
                        setJobComponents([...jobComponents, {
                          componentId: '',
                          hours: defaultTime.hours,
                          minutes: defaultTime.minutes,
                        }]);
                        // Auto-open the newly added component's dropdown
                        requestAnimationFrame(() => {
                          // Find all comboboxes and click the last one (newly added)
                          const allSelects = document.querySelectorAll('[role="combobox"]');
                          const lastSelect = allSelects[allSelects.length - 1] as HTMLElement;
                          if (lastSelect) {
                            lastSelect.click();
                          }
                        });
                      }}
                      className="w-full"
                    >
                      <Package className="w-3 h-3 mr-1" />
                      Add Another Component
                    </Button>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex gap-3 pt-4 border-t">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSelectedJobId('');
                      setManualData({
                        date: new Date().toISOString().split('T')[0],
                        startTime: '06:00',
                        endTime: '17:00',
                      });
                      setJobComponents([]);
                      onBack?.();
                    }}                    
                    className="flex-1 h-12"
                    disabled={loading}
                  >
                    <X className="w-4 h-4 mr-2" />
                    Cancel
                  </Button>
                  <Button
                    onClick={mode === 'manual' ? handleManualEntry : handleTimerClockIn}
                    disabled={loading || !selectedJobId}
                    className="flex-1 h-12 gradient-primary"
                  >
                    {mode === 'manual' ? (
                      <>
                        <Clock className="w-4 h-4 mr-2" />
                        {loading ? 'Logging...' : 'Log Time'}
                      </>
                    ) : (
                      <>
                        <LogIn className="w-4 h-4 mr-2" />
                        {loading ? 'Starting...' : 'Start Timer'}
                      </>
                    )}
                  </Button>
                </div>
              </>
            )}

            {/* Misc Job Flow */}
            {jobType === 'misc' && (
              <>
                <div className="bg-warning/10 border border-warning/30 rounded-lg p-3">
                  <p className="text-sm text-warning-foreground">
                    Use this for odd jobs not in the system. All details will be visible in payroll.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="misc-job-name" className="text-base font-semibold">Job Name *</Label>
                  <Input
                    id="misc-job-name"
                    placeholder="Enter job name..."
                    className="h-12"
                    value={miscJobData.name}
                    onChange={(e) => setMiscJobData({ ...miscJobData, name: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="misc-job-address" className="text-base font-semibold flex items-center gap-2">
                    <MapPin className="w-4 h-4" />
                    Address *
                  </Label>
                  <Input
                    id="misc-job-address"
                    placeholder="Enter job address..."
                    className="h-12"
                    value={miscJobData.address}
                    onChange={(e) => setMiscJobData({ ...miscJobData, address: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="misc-date" className="text-base font-semibold">Date *</Label>
                  <Input
                    id="misc-date"
                    type="date"
                    className="h-12"
                    value={miscJobData.date}
                    onChange={(e) => setMiscJobData({ ...miscJobData, date: e.target.value })}
                    max={new Date().toISOString().split('T')[0]}
                  />
                </div>

                <div className="p-4 border-2 border-blue-500/50 rounded-lg bg-blue-50/50 space-y-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="w-5 h-5 text-blue-600" />
                    <span className="text-lg font-bold text-blue-700">Time Entry *</span>
                  </div>
                  <TimeDropdownPicker
                    label="Clock In Time"
                    value={miscJobData.startTime}
                    onChange={(time) => setMiscJobData({ ...miscJobData, startTime: time })}
                  />

                  <TimeDropdownPicker
                    label="Clock Out Time"
                    value={miscJobData.endTime}
                    onChange={(time) => setMiscJobData({ ...miscJobData, endTime: time })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="misc-notes" className="text-base font-semibold">Notes (Optional)</Label>
                  <Textarea
                    id="misc-notes"
                    placeholder="Additional notes..."
                    className="resize-none"
                    rows={3}
                    value={miscJobData.notes}
                    onChange={(e) => setMiscJobData({ ...miscJobData, notes: e.target.value })}
                  />
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3 pt-4 border-t">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowDialog(false);
                      setMiscJobData({
                        name: '',
                        address: '',
                        date: new Date().toISOString().split('T')[0],
                        startTime: '06:00',
                        endTime: '17:00',
                        notes: '',
                      });
                      onBack?.();
                    }}
                    className="flex-1 h-12"
                    disabled={loading}
                  >
                    <X className="w-4 h-4 mr-2" />
                    Cancel
                  </Button>
                  <Button
                    onClick={handleMiscJobEntry}
                    disabled={loading || !miscJobData.name.trim() || !miscJobData.address.trim()}
                    className="flex-1 h-12 gradient-primary"
                  >
                    <Clock className="w-4 h-4 mr-2" />
                    {loading ? 'Logging...' : 'Log Time'}
                  </Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
