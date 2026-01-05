import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ArrowLeft, Play, Pause, StopCircle, Clock, Users, Edit, Plus, MapPin, Search, ChevronDown, ChevronRight, Camera, X, Target, TrendingUp, ListChecks, CheckCircle2 } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { createNotification } from '@/lib/notifications';
import type { Job, Component } from '@/types';
import { getLocalDateString } from '@/lib/utils';

interface LocalTimer {
  id: string;
  jobId: string;
  componentId: string;
  componentName: string;
  startTime: string;
  pauseTime: string | null;
  totalElapsedMs: number;
  crewCount: number;
  state: 'running' | 'paused';
  workerNames: string[];
}

interface Worker {
  id: string;
  name: string;
  active: boolean;
}

interface TimeTrackerProps {
  job: Job;
  userId: string;
  onBack: () => void;
  onTimerUpdate: () => void;
}

export function TimeTracker({ job, userId, onBack, onTimerUpdate }: TimeTrackerProps) {
  const [components, setComponents] = useState<Component[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [localTimers, setLocalTimers] = useState<LocalTimer[]>([]);
  const [selectedComponent, setSelectedComponent] = useState('');
  const [loading, setLoading] = useState(false);
  const [componentSearch, setComponentSearch] = useState('');
  const [showComponentDropdown, setShowComponentDropdown] = useState(false);
  const [totalJobHours, setTotalJobHours] = useState(0);
  const [totalComponentHours, setTotalComponentHours] = useState(0);
  const [totalClockInHours, setTotalClockInHours] = useState(0);
  
  // Entry mode selection
  const [entryMode, setEntryMode] = useState<'none' | 'timer' | 'manual'>('none');
  
  // Timer start mode and selection
  const [timerMode, setTimerMode] = useState<'count' | 'workers'>('workers');
  const [timerCrewCount, setTimerCrewCount] = useState('0');
  const [timerSelectedWorkers, setTimerSelectedWorkers] = useState<string[]>([]);
  const [showTimerWorkers, setShowTimerWorkers] = useState(false);
  
  // Review modal state
  const [reviewTimer, setReviewTimer] = useState<LocalTimer | null>(null);
  const [reviewMode, setReviewMode] = useState<'count' | 'workers'>('count');
  const [reviewCrewCount, setReviewCrewCount] = useState('0');
  const [reviewSelectedWorkers, setReviewSelectedWorkers] = useState<string[]>([]);
  const [reviewNotes, setReviewNotes] = useState('');
  const [showReviewWorkers, setShowReviewWorkers] = useState(false);
  
  // Manual entry modal - WITH WIZARD STEP STATE
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [manualStep, setManualStep] = useState(1); // Wizard step: 1=Component, 2=Time, 3=People, 4=Notes&Photos
  const [manualComponent, setManualComponent] = useState('');
  const [manualDate, setManualDate] = useState(getLocalDateString());
  const [manualHours, setManualHours] = useState('0');
  const [manualMinutes, setManualMinutes] = useState('0');
  const [manualMode, setManualMode] = useState<'count' | 'workers'>('workers');
  const [manualCrewCount, setManualCrewCount] = useState('0');
  const [manualSelectedWorkers, setManualSelectedWorkers] = useState<string[]>([]);
  const [manualNotes, setManualNotes] = useState('');
  const [showManualWorkers, setShowManualWorkers] = useState(false);
  const [manualComponentSearch, setManualComponentSearch] = useState('');
  const [showManualComponentDropdown, setShowManualComponentDropdown] = useState(false);
  const [manualPhotos, setManualPhotos] = useState<File[]>([]);
  const [manualPhotoUrls, setManualPhotoUrls] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const tickIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    loadComponents();
    loadWorkers();
    loadLocalTimers();
    loadTotalComponentHours();
    loadTotalClockInHours();
    
    // Start tick interval for live timer updates
    tickIntervalRef.current = setInterval(() => {
      setLocalTimers(prev => [...prev]); // Force re-render
    }, 1000);
    
    return () => {
      if (tickIntervalRef.current) {
        clearInterval(tickIntervalRef.current);
      }
    };
  }, [job.id]);

  function loadLocalTimers() {
    try {
      const storageKey = `fieldtrack_timers_${userId}`;
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const allTimers: LocalTimer[] = JSON.parse(stored);
        // Filter timers for this job only
        setLocalTimers(allTimers.filter(t => t.jobId === job.id));
      }
    } catch (error) {
      console.error('Error loading local timers:', error);
    }
  }

  function saveLocalTimers(timers: LocalTimer[]) {
    try {
      const storageKey = `fieldtrack_timers_${userId}`;
      const existing = localStorage.getItem(storageKey);
      let allTimers: LocalTimer[] = existing ? JSON.parse(existing) : [];
      
      // Remove old timers for this job
      allTimers = allTimers.filter(t => t.jobId !== job.id);
      
      // Add current job timers
      allTimers = [...allTimers, ...timers];
      
      localStorage.setItem(storageKey, JSON.stringify(allTimers));
      setLocalTimers(timers);
    } catch (error) {
      console.error('Error saving local timers:', error);
    }
  }

  async function loadWorkers() {
    try {
      const { data, error } = await supabase
        .from('workers')
        .select('*')
        .eq('active', true)
        .order('name');

      if (error) throw error;
      setWorkers(data || []);
    } catch (error: any) {
      console.error('Error loading workers:', error);
    }
  }

  async function loadTotalComponentHours() {
    try {
      // Only count component-level time entries (not job clock-in/out)
      const { data, error } = await supabase
        .from('time_entries')
        .select('total_hours, crew_count')
        .eq('job_id', job.id)
        .not('component_id', 'is', null) // Only component time
        .not('total_hours', 'is', null);

      if (error) throw error;

      const totalManHours = (data || []).reduce((sum, entry) => 
        sum + ((entry.total_hours || 0) * (entry.crew_count || 1)), 0
      );

      setTotalComponentHours(totalManHours);
    } catch (error) {
      console.error('Error loading total component hours:', error);
    }
  }

  async function loadTotalClockInHours() {
    try {
      // Only count clock-in hours (where component_id IS NULL)
      const { data, error } = await supabase
        .from('time_entries')
        .select('total_hours, crew_count')
        .eq('job_id', job.id)
        .is('component_id', null) // Only clock-in time
        .not('total_hours', 'is', null);

      if (error) throw error;

      const totalManHours = (data || []).reduce((sum, entry) => 
        sum + ((entry.total_hours || 0) * (entry.crew_count || 1)), 0
      );

      setTotalClockInHours(totalManHours);
    } catch (error) {
      console.error('Error loading total clock-in hours:', error);
    }
  }

  async function loadComponents() {
    // Load components assigned to this job
    const jobComponents = Array.isArray(job.components) ? job.components : [];
    
    if (jobComponents.length > 0) {
      // Get active components from job
      const activeJobComponents = jobComponents.filter(c => c.isActive);
      
      // Fetch full component details
      const { data, error } = await supabase
        .from('components')
        .select('*')
        .in('id', activeJobComponents.map(c => c.id))
        .eq('archived', false);

      if (error) {
        console.error('Error loading components:', error);
        return;
      }

      setComponents(data || []);
    } else {
      // Fallback: load all active components if job has no components assigned
      const { data, error } = await supabase
        .from('components')
        .select('*')
        .eq('archived', false)
        .order('name');

      if (error) {
        console.error('Error loading components:', error);
        return;
      }

      setComponents(data || []);
    }
  }

  function startTimer() {
    if (!selectedComponent) {
      toast.error('Please select a component');
      return;
    }

    const component = components.find(c => c.id === selectedComponent);
    if (!component) return;

    // Determine crew count and worker names based on mode
    let finalCrewCount: number;
    let finalWorkerNames: string[];
    
    if (timerMode === 'workers') {
      // If no workers selected, default to just the user (crew count = 1)
      finalWorkerNames = timerSelectedWorkers
        .map(workerId => workers.find(w => w.id === workerId)?.name)
        .filter((name): name is string => !!name);
      finalCrewCount = finalWorkerNames.length + 1; // +1 for the person logging
    } else {
      finalCrewCount = (parseInt(timerCrewCount) || 0) + 1; // +1 for the person logging
      finalWorkerNames = [];
    }

    const newTimer: LocalTimer = {
      id: crypto.randomUUID(),
      jobId: job.id,
      componentId: selectedComponent,
      componentName: component.name,
      startTime: new Date().toISOString(),
      pauseTime: null,
      totalElapsedMs: 0,
      crewCount: finalCrewCount,
      state: 'running',
      workerNames: finalWorkerNames,
    };

    const updatedTimers = [...localTimers, newTimer];
    saveLocalTimers(updatedTimers);
    
    toast.success(`Timer started for ${component.name}`);
    setSelectedComponent('');
    setTimerCrewCount('0');
    setTimerSelectedWorkers([]);
    onTimerUpdate();
  }

  function pauseTimer(timerId: string) {
    const updatedTimers = localTimers.map(timer => {
      if (timer.id === timerId && timer.state === 'running') {
        const now = Date.now();
        const startMs = new Date(timer.pauseTime || timer.startTime).getTime();
        const elapsed = now - startMs;
        
        return {
          ...timer,
          state: 'paused' as const,
          pauseTime: new Date().toISOString(),
          totalElapsedMs: timer.totalElapsedMs + elapsed,
        };
      }
      return timer;
    });
    
    saveLocalTimers(updatedTimers);
    toast.success('Timer paused');
  }

  function resumeTimer(timerId: string) {
    const updatedTimers = localTimers.map(timer => {
      if (timer.id === timerId && timer.state === 'paused') {
        return {
          ...timer,
          state: 'running' as const,
          pauseTime: null,
          startTime: new Date().toISOString(), // Reset start time for next running period
        };
      }
      return timer;
    });
    
    saveLocalTimers(updatedTimers);
    toast.success('Timer resumed');
  }

  function openReviewModal(timer: LocalTimer) {
    // Calculate final elapsed time
    let finalElapsedMs = timer.totalElapsedMs;
    
    if (timer.state === 'running' && !timer.pauseTime) {
      const now = Date.now();
      const startMs = new Date(timer.startTime).getTime();
      finalElapsedMs += (now - startMs);
    }
    
    const timerWithFinalTime = {
      ...timer,
      totalElapsedMs: finalElapsedMs,
    };
    
    setReviewTimer(timerWithFinalTime);
    
    // Pre-populate with timer's worker data
    if (timer.workerNames && timer.workerNames.length > 0) {
      setReviewMode('workers');
      // Convert worker names back to IDs
      const workerIds = timer.workerNames
        .map(name => workers.find(w => w.name === name)?.id)
        .filter((id): id is string => !!id);
      setReviewSelectedWorkers(workerIds);
      setReviewCrewCount('0');
    } else {
      setReviewMode('count');
      setReviewCrewCount((timer.crewCount - 1).toString()); // -1 to show additional crew
      setReviewSelectedWorkers([]);
    }
    
    setReviewNotes('');
  }

  function cancelTimer() {
    if (!reviewTimer) return;
    
    // Remove timer from local storage without saving
    const updatedTimers = localTimers.filter(t => t.id !== reviewTimer.id);
    saveLocalTimers(updatedTimers);
    
    toast.success('Timer cancelled');
    setReviewTimer(null);
    onTimerUpdate();
  }

  async function saveTimeEntry() {
    if (!reviewTimer) return;
    
    setLoading(true);
    
    try {
      const totalHours = reviewTimer.totalElapsedMs / (1000 * 60 * 60);
      const roundedHours = Math.round(totalHours * 4) / 4; // Round to nearest 0.25 hour
      
      // Determine crew count and worker names based on mode
      let finalCrewCount: number;
      let finalWorkerNames: string[];
      
      if (reviewMode === 'workers') {
        // Get worker names from selected IDs
        finalWorkerNames = reviewSelectedWorkers
          .map(workerId => workers.find(w => w.id === workerId)?.name)
          .filter((name): name is string => !!name);
        // +1 for the person logging the time
        finalCrewCount = finalWorkerNames.length + 1;
      } else {
        // Use crew count mode: add +1 for the person logging
        finalCrewCount = (parseInt(reviewCrewCount) || 0) + 1;
        finalWorkerNames = [];
      }
      
      const { error } = await supabase.from('time_entries').insert({
        job_id: job.id,
        component_id: reviewTimer.componentId,
        user_id: userId,
        start_time: reviewTimer.startTime,
        end_time: new Date().toISOString(),
        total_hours: roundedHours,
        crew_count: finalCrewCount,
        is_manual: false,
        is_active: false,
        notes: reviewNotes || null,
        worker_names: finalWorkerNames,
      });

      if (error) throw error;

      // Create notification for office
      const component = components.find(c => c.id === reviewTimer.componentId);
      await createNotification({
        jobId: job.id,
        createdBy: userId,
        type: 'time_entry',
        brief: `Time entry: ${roundedHours.toFixed(2)}h on ${component?.name || 'Unknown Component'} with ${finalCrewCount} crew member${finalCrewCount > 1 ? 's' : ''}`,
        referenceId: reviewTimer.id,
        referenceData: {
          componentName: component?.name,
          hours: roundedHours,
          crewCount: finalCrewCount,
        },
      });

      // Remove timer from local storage
      const updatedTimers = localTimers.filter(t => t.id !== reviewTimer.id);
      saveLocalTimers(updatedTimers);
      
      toast.success(`Time entry saved: ${roundedHours.toFixed(2)} hours`);
      setReviewTimer(null);
      loadTotalComponentHours(); // Reload component time
      loadTotalClockInHours(); // Reload clock-in time
      onTimerUpdate();
    } catch (error: any) {
      toast.error('Failed to save time entry');
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  async function saveManualEntry() {
    if (!manualComponent) {
      toast.error('Please select a component');
      return;
    }
    
    const totalHours = parseInt(manualHours) + parseInt(manualMinutes) / 60;
    
    if (totalHours <= 0) {
      toast.error('Please enter valid time');
      return;
    }
    
    // Validate worker selection if in workers mode
    if (manualMode === 'workers' && manualSelectedWorkers.length === 0) {
      toast.error('Please select at least one worker');
      return;
    }
    
    setLoading(true);
    
    try {
      const hours = totalHours;
      
      // Use the selected date for the time entry
      const entryDate = new Date(manualDate + 'T12:00:00');
      
      // Determine crew count and worker names based on mode
      let finalCrewCount: number;
      let finalWorkerNames: string[];
      
      if (manualMode === 'workers') {
        // Get worker names from selected IDs (do NOT include the user)
        finalWorkerNames = manualSelectedWorkers
          .map(workerId => workers.find(w => w.id === workerId)?.name)
          .filter((name): name is string => !!name);
        // Crew count is just the selected workers
        finalCrewCount = finalWorkerNames.length;
      } else {
        // Use crew count mode (do NOT add +1 for the person logging)
        finalCrewCount = parseInt(manualCrewCount) || 0;
        finalWorkerNames = [];
      }
      
      const { data: timeEntry, error } = await supabase.from('time_entries').insert({
        job_id: job.id,
        component_id: manualComponent,
        user_id: userId,
        start_time: entryDate.toISOString(),
        end_time: entryDate.toISOString(),
        total_hours: Math.round(hours * 4) / 4,
        crew_count: finalCrewCount,
        is_manual: true,
        is_active: false,
        notes: manualNotes || null,
        worker_names: finalWorkerNames,
      }).select().single();

      if (error) throw error;

      // Upload photos if any
      if (manualPhotos.length > 0 && timeEntry) {
        for (const photo of manualPhotos) {
          const fileExt = photo.name.split('.').pop();
          const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
          const filePath = `${job.id}/${fileName}`;

          const { error: uploadError } = await supabase.storage
            .from('job-files')
            .upload(filePath, photo);

          if (uploadError) throw uploadError;

          const { data: { publicUrl } } = supabase.storage
            .from('job-files')
            .getPublicUrl(filePath);

          // Create photo record linked to time entry
          await supabase.from('photos').insert({
            job_id: job.id,
            time_entry_id: timeEntry.id,
            component_id: manualComponent,
            photo_url: publicUrl,
            photo_date: manualDate,
            uploaded_by: userId,
            caption: `Time entry photo - ${hours.toFixed(2)}h`,
          });
        }
      }

      // Create notification for office
      const component = components.find(c => c.id === manualComponent);
      const photoText = manualPhotos.length > 0 ? ` with ${manualPhotos.length} photo${manualPhotos.length > 1 ? 's' : ''}` : '';
      await createNotification({
        jobId: job.id,
        createdBy: userId,
        type: 'time_entry',
        brief: `Manual time entry: ${hours.toFixed(2)}h on ${component?.name || 'Unknown Component'} with ${finalCrewCount} crew member${finalCrewCount > 1 ? 's' : ''}${photoText}`,
        referenceData: {
          componentName: component?.name,
          hours: Math.round(hours * 100) / 100,
          crewCount: finalCrewCount,
          manual: true,
          photoCount: manualPhotos.length,
        },
      });

      toast.success(`Manual entry saved: ${hours.toFixed(2)} hours${photoText}`);
      setEntryMode('none');
      setManualStep(1); // Reset wizard
      setManualComponent('');
      setManualComponentSearch('');
      setManualDate(getLocalDateString());
      setManualHours('0');
      setManualMinutes('0');
      setManualMode('workers');
      setManualCrewCount('0');
      setManualSelectedWorkers([]);
      setManualNotes('');
      setManualPhotos([]);
      setManualPhotoUrls([]);
      loadTotalComponentHours(); // Reload component time
      loadTotalClockInHours(); // Reload clock-in time
      onTimerUpdate();
    } catch (error: any) {
      toast.error('Failed to save manual entry');
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    // Create preview URLs
    const urls = files.map(file => URL.createObjectURL(file));
    setManualPhotoUrls(prev => [...prev, ...urls]);
    setManualPhotos(prev => [...prev, ...files]);
  }

  function removePhoto(index: number) {
    URL.revokeObjectURL(manualPhotoUrls[index]);
    setManualPhotoUrls(prev => prev.filter((_, i) => i !== index));
    setManualPhotos(prev => prev.filter((_, i) => i !== index));
  }

  function formatElapsedTime(timer: LocalTimer): string {
    let elapsedMs = timer.totalElapsedMs;
    
    if (timer.state === 'running' && !timer.pauseTime) {
      const now = Date.now();
      const startMs = new Date(timer.startTime).getTime();
      elapsedMs += (now - startMs);
    }
    
    const totalSeconds = Math.floor(elapsedMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  function formatHoursDecimal(ms: number): string {
    const hours = ms / (1000 * 60 * 60);
    return hours.toFixed(2);
  }

  // Calculate progress based on clock-in time (matches office project progress)
  const estimatedHours = job.estimated_hours || 0;
  const progressPercent = estimatedHours > 0 ? Math.min((totalClockInHours / estimatedHours) * 100, 100) : 0;
  const isOverBudget = totalClockInHours > estimatedHours && estimatedHours > 0;
  const remainingHours = Math.max(estimatedHours - totalClockInHours, 0);

  return (
    <div className="space-y-4">
      {/* Time Tracking Summary */}
      <Card className="border-2 border-primary/20">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Target className="w-4 h-4 text-primary" />
            Project Progress (Clock-In Hours)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Progress Bar (Clock-In Hours) */}
          {estimatedHours > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Budget Progress</span>
                <span className={`font-bold text-lg ${
                  isOverBudget ? 'text-destructive' : 'text-primary'
                }`}>
                  {progressPercent.toFixed(0)}%
                </span>
              </div>
              <Progress value={progressPercent} className="h-3" />
              {isOverBudget ? (
                <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 text-center">
                  <p className="text-sm text-destructive font-medium flex items-center justify-center gap-1">
                    <TrendingUp className="w-4 h-4" />
                    Over budget by {(totalClockInHours - estimatedHours).toFixed(2)}h
                  </p>
                </div>
              ) : (
                <div className="bg-success/10 border border-success/30 rounded-lg p-3 text-center">
                  <p className="text-sm text-success font-medium">
                    {remainingHours.toFixed(2)}h remaining
                  </p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Entry Mode Selection - Show only if no mode selected */}
      {entryMode === 'none' && (
        <Card>
          <CardHeader>
            <CardTitle>How would you like to track time?</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              onClick={() => setEntryMode('timer')}
              size="lg"
              className="w-full touch-target h-20 text-lg"
              variant="outline"
            >
              <Play className="w-6 h-6 mr-3" />
              <div className="text-left flex-1">
                <div className="font-bold">Start Timer</div>
                <div className="text-xs text-muted-foreground font-normal">Track time in real-time</div>
              </div>
            </Button>
            
            <Button
              onClick={() => setEntryMode('manual')}
              size="lg"
              className="w-full touch-target h-20 text-lg"
              variant="outline"
            >
              <Edit className="w-6 h-6 mr-3" />
              <div className="text-left flex-1">
                <div className="font-bold">Manual Entry</div>
                <div className="text-xs text-muted-foreground font-normal">Enter time after work is done</div>
              </div>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Active Timers */}
      {localTimers.map((timer) => (
        <Card 
          key={timer.id} 
          className={timer.state === 'running' ? 'border-l-4 border-l-orange shadow-lg' : 'border-warning'}
        >
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Clock className={`w-5 h-5 ${timer.state === 'running' ? 'text-success' : 'text-warning'}`} />
                {timer.componentName}
              </CardTitle>
              <Badge variant={timer.state === 'running' ? 'default' : 'secondary'}>
                {timer.state === 'running' ? 'Running' : 'Paused'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-center py-4">
              <div className="text-5xl font-mono font-bold tabular-nums">
                {formatElapsedTime(timer)}
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                {formatHoursDecimal(timer.totalElapsedMs + (timer.state === 'running' ? Date.now() - new Date(timer.startTime).getTime() : 0))} hours
              </p>
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Users className="w-4 h-4" />
                <span>{timer.crewCount} crew member{timer.crewCount > 1 ? 's' : ''}</span>
              </div>
              
              {timer.workerNames && timer.workerNames.length > 0 && (
                <div className="flex flex-wrap gap-1 justify-center">
                  {timer.workerNames.map((name, idx) => (
                    <Badge key={idx} variant="secondary" className="text-xs">
                      {name}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            
            <div className="grid grid-cols-2 gap-2">
              {timer.state === 'running' ? (
                <>
                  <Button
                    variant="outline"
                    onClick={() => pauseTimer(timer.id)}
                    className="touch-target"
                  >
                    <Pause className="w-4 h-4 mr-2" />
                    Pause
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => openReviewModal(timer)}
                    className="touch-target"
                  >
                    <StopCircle className="w-4 h-4 mr-2" />
                    Stop
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="default"
                    onClick={() => resumeTimer(timer.id)}
                    className="touch-target gradient-primary"
                  >
                    <Play className="w-4 h-4 mr-2" />
                    Resume
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => openReviewModal(timer)}
                    className="touch-target"
                  >
                    <StopCircle className="w-4 h-4 mr-2" />
                    Stop
                  </Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Start New Timer - Show only if timer mode selected */}
      {entryMode === 'timer' && (
        <Card className="border-2 border-primary/30 shadow-md">
          <CardHeader className="pb-3 bg-gradient-to-r from-primary/10 to-primary/5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                  <Clock className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-lg">Component Timer</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">Track time by component</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEntryMode('none');
                  setSelectedComponent('');
                  setComponentSearch('');
                  setTimerCrewCount('0');
                  setTimerSelectedWorkers([]);
                }}
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {components.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-4">
                No components available for this job. Office staff can assign components.
              </p>
            ) : (
              <>
              {/* Component Selection with Searchable Dropdown */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Component</Label>
                <div className="space-y-2">
                  {/* Search Input with Icon and Dropdown */}
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground z-10" />
                    <Input
                      type="text"
                      placeholder="Search or select component..."
                      value={componentSearch}
                      onChange={(e) => {
                        setComponentSearch(e.target.value);
                        setShowComponentDropdown(true);
                      }}
                      onFocus={() => setShowComponentDropdown(true)}
                      className="h-12 text-base pl-10 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowComponentDropdown(!showComponentDropdown)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 z-10"
                    >
                      {showComponentDropdown ? (
                        <ChevronDown className="w-5 h-5 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="w-5 h-5 text-muted-foreground" />
                      )}
                    </button>
                  </div>

                  {/* Dropdown List - Show when open or when searching */}
                  {showComponentDropdown && (
                    <div className="border rounded-lg max-h-[240px] overflow-y-auto bg-card shadow-lg">
                      {components
                        .filter((comp) => 
                          componentSearch === '' || 
                          comp.name.toLowerCase().includes(componentSearch.toLowerCase()) ||
                          comp.description?.toLowerCase().includes(componentSearch.toLowerCase())
                        )
                        .map((comp) => (
                          <button
                            key={comp.id}
                            type="button"
                            onClick={() => {
                              setSelectedComponent(comp.id);
                              setComponentSearch('');
                              setShowComponentDropdown(false);
                            }}
                            className="w-full text-left p-3 hover:bg-muted/50 transition-colors border-b last:border-b-0"
                          >
                            <p className="font-medium">{comp.name}</p>
                            {comp.description && (
                              <p className="text-xs text-muted-foreground mt-1">{comp.description}</p>
                            )}
                          </button>
                        ))}
                      {components.filter((comp) => 
                        componentSearch === '' || 
                        comp.name.toLowerCase().includes(componentSearch.toLowerCase()) ||
                        comp.description?.toLowerCase().includes(componentSearch.toLowerCase())
                      ).length === 0 && (
                        <div className="p-4 text-center text-sm text-muted-foreground">
                          No components found
                        </div>
                      )}
                    </div>
                  )}

                  {/* Selected Component Display */}
                  {selectedComponent && !componentSearch && !showComponentDropdown && (
                    <div className="flex items-center justify-between p-3 bg-primary/10 border-2 border-primary rounded-lg">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">Selected:</span>
                        <Badge variant="default">
                          {components.find(c => c.id === selectedComponent)?.name}
                        </Badge>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedComponent('');
                          setShowComponentDropdown(true);
                        }}
                        className="h-8 text-xs"
                      >
                        Change
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              {/* Mode Toggle */}
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={timerMode === 'workers' ? 'default' : 'outline'}
                  onClick={() => setTimerMode('workers')}
                  className="h-11"
                >
                  <Users className="w-4 h-4 mr-2" />
                  Select Workers
                </Button>
                <Button
                  type="button"
                  variant={timerMode === 'count' ? 'default' : 'outline'}
                  onClick={() => setTimerMode('count')}
                  className="h-11"
                >
                  <Users className="w-4 h-4 mr-2" />
                  Crew Count
                </Button>
              </div>

              {/* Workers or Count Selection */}
              {timerMode === 'workers' ? (
                <div className="space-y-2">
                  {workers.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-3 text-center border rounded-lg bg-muted/30">
                      No workers available
                    </p>
                  ) : (
                    <>
                      {/* Toggle Button */}
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setShowTimerWorkers(!showTimerWorkers)}
                        className="w-full h-12 justify-between"
                      >
                        <span>
                          {timerSelectedWorkers.length > 0 
                            ? `${timerSelectedWorkers.length} worker${timerSelectedWorkers.length > 1 ? 's' : ''} selected`
                            : 'Select workers'}
                        </span>
                        {showTimerWorkers ? (
                          <ChevronDown className="w-5 h-5" />
                        ) : (
                          <ChevronRight className="w-5 h-5" />
                        )}
                      </Button>

                      {/* Dropdown List */}
                      {showTimerWorkers && (
                        <div className="border rounded-lg max-h-[180px] overflow-y-auto">
                          <div className="p-2 space-y-1">
                            {workers.map((worker) => (
                              <div
                                key={worker.id}
                                className="flex items-center space-x-2 p-2 hover:bg-muted/50 rounded transition-colors"
                              >
                                <Checkbox
                                  id={`timer-worker-${worker.id}`}
                                  checked={timerSelectedWorkers.includes(worker.id)}
                                  onCheckedChange={(checked) => {
                                    if (checked) {
                                      setTimerSelectedWorkers([...timerSelectedWorkers, worker.id]);
                                    } else {
                                      setTimerSelectedWorkers(timerSelectedWorkers.filter(id => id !== worker.id));
                                    }
                                  }}
                                />
                                <Label htmlFor={`timer-worker-${worker.id}`} className="cursor-pointer flex-1">
                                  {worker.name}
                                </Label>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="bg-muted/30 rounded-lg p-2 text-center">
                        <p className="text-xs font-medium">
                          {timerSelectedWorkers.length > 0 ? (
                            <>
                              <span className="text-primary font-bold">{timerSelectedWorkers.length + 1}</span> total crew
                              <span className="text-muted-foreground ml-1">({timerSelectedWorkers.length} + you)</span>
                            </>
                          ) : (
                            <>
                              <span className="text-primary font-bold">1</span> crew member
                              <span className="text-muted-foreground ml-1">(just you)</span>
                            </>
                          )}
                        </p>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <Select value={timerCrewCount} onValueChange={setTimerCrewCount}>
                    <SelectTrigger>
                      <SelectValue placeholder="Additional Crew" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[200px]">
                      <SelectItem value="0">Just me (1 total)</SelectItem>
                      {[...Array(19)].map((_, i) => (
                        <SelectItem key={i + 1} value={(i + 1).toString()}>
                          +{i + 1} crew ({i + 2} total)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground text-center">You are always included</p>
                </div>
              )}

              {/* Start Timer Button */}
                <Button
                  onClick={startTimer}
                  disabled={loading || !selectedComponent}
                  size="lg"
                  className="w-full touch-target gradient-primary"
                >
                  <Play className="w-5 h-5 mr-2" />
                  Start Timer
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Review & Save Modal */}
      <Dialog open={!!reviewTimer} onOpenChange={() => setReviewTimer(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Review Time Entry</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-muted-foreground">Component</Label>
              <p className="font-medium">{reviewTimer?.componentName}</p>
            </div>
            
            <div>
              <Label className="text-muted-foreground">Total Time</Label>
              <p className="text-3xl font-mono font-bold">
                {reviewTimer && formatElapsedTime(reviewTimer)}
              </p>
              <p className="text-sm text-muted-foreground">
                {reviewTimer && formatHoursDecimal(reviewTimer.totalElapsedMs)} hours
              </p>
            </div>
            
            <div className="space-y-4">
              <div className="space-y-3">
                <Label>Entry Mode</Label>
                <RadioGroup value={reviewMode} onValueChange={(v) => setReviewMode(v as 'count' | 'workers')}>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="count" id="review-mode-count" />
                    <Label htmlFor="review-mode-count" className="cursor-pointer">Crew Count</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="workers" id="review-mode-workers" />
                    <Label htmlFor="review-mode-workers" className="cursor-pointer">Select Workers</Label>
                  </div>
                </RadioGroup>
              </div>

              {reviewMode === 'count' ? (
                <div className="space-y-2">
                  <Label htmlFor="review-crew">Additional Crew</Label>
                  <Select value={reviewCrewCount} onValueChange={setReviewCrewCount}>
                    <SelectTrigger id="review-crew">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">Just me (1 person total)</SelectItem>
                      {[...Array(19)].map((_, i) => (
                        <SelectItem key={i + 1} value={(i + 1).toString()}>
                          +{i + 1} crew ({i + 2} total)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-sm text-muted-foreground">You are always included</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label>Select Workers</Label>
                  {workers.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-2">No workers available. Office staff can add workers.</p>
                  ) : (
                    <>
                      {/* Toggle Button */}
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setShowReviewWorkers(!showReviewWorkers)}
                        className="w-full h-12 justify-between"
                      >
                        <span>
                          {reviewSelectedWorkers.length > 0 
                            ? `${reviewSelectedWorkers.length} worker${reviewSelectedWorkers.length > 1 ? 's' : ''} selected`
                            : 'Select workers'}
                        </span>
                        {showReviewWorkers ? (
                          <ChevronDown className="w-5 h-5" />
                        ) : (
                          <ChevronRight className="w-5 h-5" />
                        )}
                      </Button>

                      {/* Dropdown List */}
                      {showReviewWorkers && (
                        <div className="border rounded-lg p-3 max-h-[200px] overflow-y-auto space-y-2">
                          {workers.map((worker) => (
                            <div key={worker.id} className="flex items-center space-x-2">
                              <Checkbox
                                id={`review-worker-${worker.id}`}
                                checked={reviewSelectedWorkers.includes(worker.id)}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    setReviewSelectedWorkers([...reviewSelectedWorkers, worker.id]);
                                  } else {
                                    setReviewSelectedWorkers(reviewSelectedWorkers.filter(id => id !== worker.id));
                                  }
                                }}
                              />
                              <Label htmlFor={`review-worker-${worker.id}`} className="cursor-pointer">
                                {worker.name}
                              </Label>
                            </div>
                          ))}
                        </div>
                      )}
                      
                      {reviewSelectedWorkers.length > 0 && (
                        <p className="text-xs text-muted-foreground">
                          {reviewSelectedWorkers.length} additional + you = {reviewSelectedWorkers.length + 1} total
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="review-notes">Notes (Optional)</Label>
              <Textarea
                id="review-notes"
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder="Add any notes about this work..."
                rows={3}
              />
            </div>
            
            <div className="flex gap-2 justify-end pt-4 border-t">
              <Button 
                variant="outline" 
                onClick={() => setReviewTimer(null)}
                disabled={loading}
              >
                Back
              </Button>
              <Button 
                variant="destructive"
                onClick={cancelTimer}
                disabled={loading}
              >
                Cancel Timer
              </Button>
              <Button 
                onClick={saveTimeEntry}
                disabled={loading}
                className="gradient-primary"
              >
                {loading ? 'Saving...' : 'Save Entry'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Manual Entry Wizard Modal */}
      <Dialog 
        open={entryMode === 'manual'} 
        onOpenChange={(open) => {
          if (!open) {
            setEntryMode('none');
            setManualStep(1);
            setManualComponent('');
            setManualComponentSearch('');
            setManualDate(getLocalDateString());
            setManualHours('0');
            setManualMinutes('0');
            setManualMode('workers');
            setManualCrewCount('0');
            setManualSelectedWorkers([]);
            setManualNotes('');
            setManualPhotos([]);
            setManualPhotoUrls([]);
          }
        }}
      >
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>Manual Time Entry</span>
              <span className="text-sm font-normal text-muted-foreground">Step {manualStep} of 4</span>
            </DialogTitle>
          </DialogHeader>
          
          {/* Progress Indicator */}
          <div className="flex gap-1 mb-4">
            {[1, 2, 3, 4].map((step) => (
              <div
                key={step}
                className={`h-1.5 flex-1 rounded-full transition-all ${
                  step <= manualStep ? 'bg-primary' : 'bg-muted'
                }`}
              />
            ))}
          </div>

          <div className="space-y-4">
            {/* STEP 1: Component Selection */}
            {manualStep === 1 && (
              <>
                <div className="text-center mb-6">
                  <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-primary/10 flex items-center justify-center">
                    <ListChecks className="w-8 h-8 text-primary" />
                  </div>
                  <h3 className="text-xl font-bold mb-2">Select Component</h3>
                  <p className="text-sm text-muted-foreground">Choose the component you worked on</p>
                </div>

                {/* Date Selection */}
                <div className="space-y-2">
                  <Label htmlFor="manual-date">Date</Label>
                  <Input
                    id="manual-date"
                    type="date"
                    value={manualDate}
                    onChange={(e) => setManualDate(e.target.value)}
                    max={getLocalDateString()}
                    className="h-11"
                  />
                </div>

                {/* Component Selection with Searchable Dropdown */}
                <div className="space-y-2">
                  <Label className="text-base font-semibold">Component *</Label>
                  <div className="space-y-2">
                    {/* Search Input with Icon and Dropdown */}
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground z-10" />
                      <Input
                        type="text"
                        placeholder="Search or select component..."
                        value={manualComponentSearch}
                        onChange={(e) => {
                          setManualComponentSearch(e.target.value);
                          setShowManualComponentDropdown(true);
                        }}
                        onFocus={() => setShowManualComponentDropdown(true)}
                        className="h-12 text-base pl-10 pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowManualComponentDropdown(!showManualComponentDropdown)}
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 z-10"
                      >
                        {showManualComponentDropdown ? (
                          <ChevronDown className="w-5 h-5 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="w-5 h-5 text-muted-foreground" />
                        )}
                      </button>
                    </div>

                    {/* Dropdown List - Show when open or when searching */}
                    {showManualComponentDropdown && (
                      <div className="border rounded-lg max-h-[240px] overflow-y-auto bg-card shadow-lg">
                        {components
                          .filter((comp) => 
                            manualComponentSearch === '' || 
                            comp.name.toLowerCase().includes(manualComponentSearch.toLowerCase()) ||
                            comp.description?.toLowerCase().includes(manualComponentSearch.toLowerCase())
                          )
                          .map((comp) => (
                            <button
                              key={comp.id}
                              type="button"
                              onClick={() => {
                                setManualComponent(comp.id);
                                setManualComponentSearch('');
                                setShowManualComponentDropdown(false);
                              }}
                              className="w-full text-left p-3 hover:bg-muted/50 transition-colors border-b last:border-b-0"
                            >
                              <p className="font-medium">{comp.name}</p>
                              {comp.description && (
                                <p className="text-xs text-muted-foreground mt-1">{comp.description}</p>
                              )}
                            </button>
                          ))}
                        {components.filter((comp) => 
                          manualComponentSearch === '' || 
                          comp.name.toLowerCase().includes(manualComponentSearch.toLowerCase()) ||
                          comp.description?.toLowerCase().includes(manualComponentSearch.toLowerCase())
                        ).length === 0 && (
                          <div className="p-4 text-center text-sm text-muted-foreground">
                            No components found
                          </div>
                        )}
                      </div>
                    )}

                    {/* Selected Component Display */}
                    {manualComponent && !manualComponentSearch && !showManualComponentDropdown && (
                      <div className="flex items-center justify-between p-3 bg-primary/10 border-2 border-primary rounded-lg">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">Selected:</span>
                          <Badge variant="default">
                            {components.find(c => c.id === manualComponent)?.name}
                          </Badge>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setManualComponent('');
                            setShowManualComponentDropdown(true);
                          }}
                          className="h-8 text-xs"
                        >
                          Change
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* STEP 2: Time Entry */}
            {manualStep === 2 && (
              <>
                <div className="text-center mb-6">
                  <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-primary/10 flex items-center justify-center">
                    <Clock className="w-8 h-8 text-primary" />
                  </div>
                  <h3 className="text-xl font-bold mb-2">Enter Time Worked</h3>
                  <p className="text-sm text-muted-foreground">
                    {components.find(c => c.id === manualComponent)?.name}
                  </p>
                </div>

                {/* Time Scroll Wheels - Larger for Mobile */}
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="manual-hours" className="text-sm font-semibold text-center block">Hours</Label>
                      <Select value={manualHours} onValueChange={setManualHours}>
                        <SelectTrigger id="manual-hours" className="text-center text-4xl font-mono h-24">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="max-h-[200px]">
                          {[...Array(25)].map((_, i) => (
                            <SelectItem key={i} value={i.toString()} className="text-center text-xl py-3">
                              {i.toString().padStart(2, '0')}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="manual-minutes" className="text-sm font-semibold text-center block">Minutes</Label>
                      <Select value={manualMinutes} onValueChange={setManualMinutes}>
                        <SelectTrigger id="manual-minutes" className="text-center text-4xl font-mono h-24">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="max-h-[200px]">
                          {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((min) => (
                            <SelectItem key={min} value={min.toString()} className="text-center text-xl py-3">
                              {min.toString().padStart(2, '0')}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Total Time Display */}
                  <div className="bg-primary/10 rounded-lg p-4 text-center border-2 border-primary">
                    <p className="text-sm text-muted-foreground mb-1">Total Time</p>
                    <p className="text-3xl font-bold text-primary">
                      {parseInt(manualHours)}.{(parseInt(manualMinutes) / 60 * 100).toFixed(0).padStart(2, '0')} hrs
                    </p>
                  </div>
                </div>
              </>
            )}

            {/* STEP 3: People/Workers */}
            {manualStep === 3 && (
              <>
                <div className="text-center mb-6">
                  <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-primary/10 flex items-center justify-center">
                    <Users className="w-8 h-8 text-primary" />
                  </div>
                  <h3 className="text-xl font-bold mb-2">Who Worked on This?</h3>
                  <p className="text-sm text-muted-foreground">Select workers or enter crew count</p>
                </div>

                {/* Workers Selection - Default and Collapsible */}
                <div className="space-y-3">
                  {/* Toggle Buttons */}
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant={manualMode === 'workers' ? 'default' : 'outline'}
                      onClick={() => setManualMode('workers')}
                      className="h-12"
                    >
                      <Users className="w-4 h-4 mr-2" />
                      Select Workers
                    </Button>
                    <Button
                      type="button"
                      variant={manualMode === 'count' ? 'default' : 'outline'}
                      onClick={() => setManualMode('count')}
                      className="h-12"
                    >
                      <Users className="w-4 h-4 mr-2" />
                      Crew Count
                    </Button>
                  </div>

                  {/* Content Based on Mode */}
                  {manualMode === 'workers' ? (
                    <div className="space-y-2">
                      {workers.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-4 text-center border rounded-lg bg-muted/30">
                          No workers available. Office staff can add workers.
                        </p>
                      ) : (
                        <>
                          {/* Toggle Button */}
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setShowManualWorkers(!showManualWorkers)}
                            className="w-full h-12 justify-between text-base"
                          >
                            <span>
                              {manualSelectedWorkers.length > 0 
                                ? `${manualSelectedWorkers.length} worker${manualSelectedWorkers.length > 1 ? 's' : ''} selected`
                                : 'Select workers'}
                            </span>
                            {showManualWorkers ? (
                              <ChevronDown className="w-5 h-5" />
                            ) : (
                              <ChevronRight className="w-5 h-5" />
                            )}
                          </Button>

                          {/* Dropdown List */}
                          {showManualWorkers && (
                            <div className="border rounded-lg max-h-[240px] overflow-y-auto">
                              <div className="p-3 space-y-2">
                                {workers.map((worker) => (
                                  <div key={worker.id} className="flex items-center space-x-3 p-2 hover:bg-muted/50 rounded transition-colors">
                                    <Checkbox
                                      id={`manual-worker-${worker.id}`}
                                      checked={manualSelectedWorkers.includes(worker.id)}
                                      onCheckedChange={(checked) => {
                                        if (checked) {
                                          setManualSelectedWorkers([...manualSelectedWorkers, worker.id]);
                                        } else {
                                          setManualSelectedWorkers(manualSelectedWorkers.filter(id => id !== worker.id));
                                        }
                                      }}
                                      className="h-5 w-5"
                                    />
                                    <Label htmlFor={`manual-worker-${worker.id}`} className="cursor-pointer text-base flex-1">
                                      {worker.name}
                                    </Label>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          <div className="bg-muted/30 rounded-lg p-3 text-center">
                            <p className="text-sm font-medium">
                              {manualSelectedWorkers.length > 0 ? (
                                <>
                                  <span className="text-primary text-lg font-bold">{manualSelectedWorkers.length}</span> crew member{manualSelectedWorkers.length !== 1 ? 's' : ''}
                                  <span className="text-xs text-muted-foreground block mt-1">
                                    ({manualSelectedWorkers.length} selected)
                                  </span>
                                </>
                              ) : (
                                <>
                                  <span className="text-primary text-lg font-bold">0</span> crew members
                                  <span className="text-xs text-muted-foreground block mt-1">(add workers to track)</span>
                                </>
                              )}
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="border rounded-lg max-h-[240px] overflow-y-auto">
                        <div className="p-3 space-y-2">
                          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20].map((count) => (
                            <div
                              key={count}
                              onClick={() => setManualCrewCount(count.toString())}
                              className={`flex items-center justify-between p-3 hover:bg-muted/50 rounded cursor-pointer transition-colors ${
                                manualCrewCount === count.toString() ? 'bg-primary/10 border-2 border-primary' : 'border-2 border-transparent'
                              }`}
                            >
                              <span className="text-base font-medium">
                                {count === 0 ? 'No crew' : `${count} crew`}
                              </span>
                              <Badge variant={manualCrewCount === count.toString() ? 'default' : 'outline'}>
                                {count} total
                              </Badge>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="bg-muted/30 rounded-lg p-3 text-center">
                        <p className="text-sm font-medium">
                          <span className="text-primary text-lg font-bold">{parseInt(manualCrewCount)}</span> crew member{parseInt(manualCrewCount) !== 1 ? 's' : ''}
                          <span className="text-xs text-muted-foreground block mt-1">
                            {parseInt(manualCrewCount) === 0 ? '(no crew members)' : `(${manualCrewCount} selected)`}
                          </span>
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* STEP 4: Notes & Photos */}
            {manualStep === 4 && (
              <>
                <div className="text-center mb-6">
                  <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-primary/10 flex items-center justify-center">
                    <CheckCircle2 className="w-8 h-8 text-primary" />
                  </div>
                  <h3 className="text-xl font-bold mb-2">Add Details</h3>
                  <p className="text-sm text-muted-foreground">Photos and notes (optional)</p>
                </div>

                {/* Photos */}
                <div className="space-y-2">
                  <Label className="text-base font-semibold">Photos</Label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    capture="environment"
                    onChange={handlePhotoSelect}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full h-12"
                  >
                    <Camera className="w-5 h-5 mr-2" />
                    {manualPhotos.length > 0 ? `${manualPhotos.length} Photo${manualPhotos.length > 1 ? 's' : ''} Selected` : 'Add Photos'}
                  </Button>
                  {manualPhotoUrls.length > 0 && (
                    <div className="grid grid-cols-3 gap-2">
                      {manualPhotoUrls.map((url, index) => (
                        <div key={index} className="relative aspect-square">
                          <img
                            src={url}
                            alt={`Preview ${index + 1}`}
                            className="w-full h-full object-cover rounded-lg border"
                          />
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            onClick={() => removePhoto(index)}
                            className="absolute -top-2 -right-2 h-6 w-6 rounded-full p-0"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Notes */}
                <div className="space-y-2">
                  <Label htmlFor="manual-notes" className="text-base font-semibold">Notes</Label>
                  <Textarea
                    id="manual-notes"
                    value={manualNotes}
                    onChange={(e) => setManualNotes(e.target.value)}
                    placeholder="Add any notes about this work..."
                    rows={4}
                    className="resize-none text-base"
                  />
                </div>
              </>
            )}
            
            {/* Navigation Buttons */}
            <div className="flex gap-3 pt-4 border-t">
              {/* Back Button - Show on steps 2-4 */}
              {manualStep > 1 && (
                <Button 
                  variant="outline" 
                  onClick={() => setManualStep(manualStep - 1)}
                  disabled={loading}
                  className="flex-1 h-12 text-base"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back
                </Button>
              )}
              
              {/* Cancel Button - Show on step 1 */}
              {manualStep === 1 && (
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setEntryMode('none');
                    setManualStep(1);
                    setManualComponent('');
                    setManualComponentSearch('');
                    setManualDate(getLocalDateString());
                    setManualHours('0');
                    setManualMinutes('0');
                    setManualMode('workers');
                    setManualCrewCount('0');
                    setManualSelectedWorkers([]);
                    setManualNotes('');
                    setManualPhotos([]);
                    setManualPhotoUrls([]);
                  }}
                  disabled={loading}
                  className="flex-1 h-12 text-base"
                >
                  Cancel
                </Button>
              )}
              
              {/* Next Button - Show on steps 1-3 */}
              {manualStep < 4 && (
                <Button 
                  onClick={() => {
                    // Validation
                    if (manualStep === 1 && !manualComponent) {
                      toast.error('Please select a component');
                      return;
                    }
                    if (manualStep === 2 && parseInt(manualHours) === 0 && parseInt(manualMinutes) === 0) {
                      toast.error('Please enter time worked');
                      return;
                    }
                    setManualStep(manualStep + 1);
                  }}
                  disabled={loading || (manualStep === 1 && !manualComponent)}
                  className="flex-1 h-12 text-base gradient-primary"
                >
                  Next
                  <ChevronRight className="w-4 h-4 ml-2" />
                </Button>
              )}
              
              {/* Save Button - Show on step 4 */}
              {manualStep === 4 && (
                <Button 
                  onClick={saveManualEntry}
                  disabled={loading}
                  className="flex-1 h-12 text-base gradient-primary"
                >
                  {loading ? 'Saving...' : 'Save Entry'}
                  <CheckCircle2 className="w-4 h-4 ml-2" />
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
