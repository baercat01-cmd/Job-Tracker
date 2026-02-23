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
import { ArrowLeft, Play, Pause, StopCircle, Clock, Users, Edit, Plus, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import type { Job, Component } from '@/types';

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
  const [crewCount, setCrewCount] = useState('0');
  const [loading, setLoading] = useState(false);
  
  // Mode selection: 'count' or 'workers'
  const [entryMode, setEntryMode] = useState<'count' | 'workers'>('count');
  const [selectedWorkers, setSelectedWorkers] = useState<string[]>([]);
  
  // Review modal state
  const [reviewTimer, setReviewTimer] = useState<LocalTimer | null>(null);
  const [reviewMode, setReviewMode] = useState<'count' | 'workers'>('count');
  const [reviewCrewCount, setReviewCrewCount] = useState('0');
  const [reviewSelectedWorkers, setReviewSelectedWorkers] = useState<string[]>([]);
  const [reviewNotes, setReviewNotes] = useState('');
  
  // Manual entry modal
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [manualComponent, setManualComponent] = useState('');
  const [manualDate, setManualDate] = useState(new Date().toISOString().split('T')[0]);
  const [manualHours, setManualHours] = useState('0');
  const [manualMinutes, setManualMinutes] = useState('0');
  const [manualMode, setManualMode] = useState<'count' | 'workers'>('count');
  const [manualCrewCount, setManualCrewCount] = useState('0');
  const [manualSelectedWorkers, setManualSelectedWorkers] = useState<string[]>([]);
  const [manualNotes, setManualNotes] = useState('');
  
  const tickIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    loadComponents();
    loadWorkers();
    loadLocalTimers();
    
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

    const newTimer: LocalTimer = {
      id: crypto.randomUUID(),
      jobId: job.id,
      componentId: selectedComponent,
      componentName: component.name,
      startTime: new Date().toISOString(),
      pauseTime: null,
      totalElapsedMs: 0,
      crewCount: (parseInt(crewCount) || 0) + 1, // +1 for the person logging
      state: 'running',
    };

    const updatedTimers = [...localTimers, newTimer];
    saveLocalTimers(updatedTimers);
    
    toast.success(`Timer started for ${component.name}`);
    setSelectedComponent('');
    setCrewCount('0');
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
    setReviewMode('count');
    setReviewCrewCount(timer.crewCount.toString());
    setReviewSelectedWorkers([]);
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
      const roundedHours = Math.round(totalHours * 100) / 100; // Round to 2 decimals
      
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

      // Remove timer from local storage
      const updatedTimers = localTimers.filter(t => t.id !== reviewTimer.id);
      saveLocalTimers(updatedTimers);
      
      toast.success(`Time entry saved: ${roundedHours.toFixed(2)} hours`);
      setReviewTimer(null);
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
        // Get worker names from selected IDs
        finalWorkerNames = manualSelectedWorkers
          .map(workerId => workers.find(w => w.id === workerId)?.name)
          .filter((name): name is string => !!name);
        // +1 for the person logging the time
        finalCrewCount = finalWorkerNames.length + 1;
      } else {
        // Use crew count mode: add +1 for the person logging
        finalCrewCount = (parseInt(manualCrewCount) || 0) + 1;
        finalWorkerNames = [];
      }
      
      const { error } = await supabase.from('time_entries').insert({
        job_id: job.id,
        component_id: manualComponent,
        user_id: userId,
        start_time: entryDate.toISOString(),
        end_time: entryDate.toISOString(),
        total_hours: Math.round(hours * 100) / 100,
        crew_count: finalCrewCount,
        is_manual: true,
        is_active: false,
        notes: manualNotes || null,
        worker_names: finalWorkerNames,
      });

      if (error) throw error;

      toast.success(`Manual entry saved: ${hours.toFixed(2)} hours`);
      setShowManualEntry(false);
      setManualComponent('');
      setManualDate(new Date().toISOString().split('T')[0]);
      setManualHours('0');
      setManualMinutes('0');
      setManualMode('count');
      setManualCrewCount('0');
      setManualSelectedWorkers([]);
      setManualNotes('');
      onTimerUpdate();
    } catch (error: any) {
      toast.error('Failed to save manual entry');
      console.error(error);
    } finally {
      setLoading(false);
    }
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

  return (
    <div className="space-y-4">
      {/* Manual Entry Button - Prominent with light green */}
      <Button
        onClick={() => setShowManualEntry(true)}
        size="lg"
        className="w-full touch-target border-2 bg-green-800/30 hover:bg-green-800/40 text-green-900 border-green-600/40"
      >
        <Edit className="w-5 h-5 mr-2" />
        Manual Time Entry
      </Button>

      {/* Active Timers */}
      {localTimers.map((timer) => (
        <Card 
          key={timer.id} 
          className={timer.state === 'running' ? 'border-success' : 'border-warning'}
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
            
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Users className="w-4 h-4" />
              <span>{timer.crewCount} crew member{timer.crewCount > 1 ? 's' : ''}</span>
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

      {/* Start New Timer - Condensed */}
      <Card>
        <CardContent className="pt-6 space-y-3">
          {components.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-4">
              No components available for this job. Office staff can assign components.
            </p>
          ) : (
            <>
              <Select value={selectedComponent} onValueChange={setSelectedComponent}>
                <SelectTrigger>
                  <SelectValue placeholder="Select component to track" />
                </SelectTrigger>
                <SelectContent>
                  {components.map((comp) => (
                    <SelectItem key={comp.id} value={comp.id}>
                      {comp.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="flex gap-2">
                <div className="flex-1">
                  <Select value={crewCount} onValueChange={setCrewCount}>
                    <SelectTrigger>
                      <SelectValue placeholder="Additional Crew" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">Just me (1 person)</SelectItem>
                      {[...Array(19)].map((_, i) => (
                        <SelectItem key={i + 1} value={(i + 1).toString()}>
                          +{i + 1} crew ({i + 2} total)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  onClick={startTimer}
                  disabled={loading || !selectedComponent}
                  className="flex-[2] touch-target gradient-primary"
                >
                  <Play className="w-4 h-4 mr-2" />
                  Start Timer
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

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
                  <p className="text-xs text-muted-foreground">You are always included in the count</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label>Select Workers</Label>
                  {workers.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-2">No workers available. Office staff can add workers.</p>
                  ) : (
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

      {/* Manual Entry Modal */}
      <Dialog open={showManualEntry} onOpenChange={setShowManualEntry}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manual Time Entry</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="manual-component">Component *</Label>
              <Select value={manualComponent} onValueChange={setManualComponent}>
                <SelectTrigger id="manual-component">
                  <SelectValue placeholder="Select component" />
                </SelectTrigger>
                <SelectContent>
                  {components.map((comp) => (
                    <SelectItem key={comp.id} value={comp.id}>
                      {comp.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="manual-date">Date *</Label>
              <Input
                id="manual-date"
                type="date"
                value={manualDate}
                onChange={(e) => setManualDate(e.target.value)}
                max={new Date().toISOString().split('T')[0]}
              />
            </div>
            
            <div className="space-y-2">
              <Label>Time *</Label>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="manual-hours" className="text-xs text-muted-foreground">Hours</Label>
                  <Select value={manualHours} onValueChange={setManualHours}>
                    <SelectTrigger id="manual-hours" className="text-center text-2xl font-mono h-16">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[...Array(25)].map((_, i) => (
                        <SelectItem key={i} value={i.toString()}>
                          {i.toString().padStart(2, '0')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="manual-minutes" className="text-xs text-muted-foreground">Minutes</Label>
                  <Select value={manualMinutes} onValueChange={setManualMinutes}>
                    <SelectTrigger id="manual-minutes" className="text-center text-2xl font-mono h-16">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((min) => (
                        <SelectItem key={min} value={min.toString()}>
                          {min.toString().padStart(2, '0')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <p className="text-xs text-muted-foreground text-center">Scroll to select hours and minutes</p>
            </div>
            
            <div className="space-y-4">
              <div className="space-y-3">
                <Label>Entry Mode</Label>
                <RadioGroup value={manualMode} onValueChange={(v) => setManualMode(v as 'count' | 'workers')}>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="count" id="manual-mode-count" />
                    <Label htmlFor="manual-mode-count" className="cursor-pointer">Crew Count</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="workers" id="manual-mode-workers" />
                    <Label htmlFor="manual-mode-workers" className="cursor-pointer">Select Workers</Label>
                  </div>
                </RadioGroup>
              </div>

              {manualMode === 'count' ? (
                <div className="space-y-2">
                  <Label htmlFor="manual-crew">Additional Crew</Label>
                  <Select value={manualCrewCount} onValueChange={setManualCrewCount}>
                    <SelectTrigger id="manual-crew">
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
                  <p className="text-xs text-muted-foreground">You are always included in the count</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label>Select Workers</Label>
                  {workers.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-2">No workers available. Office staff can add workers.</p>
                  ) : (
                    <div className="border rounded-lg p-3 max-h-[200px] overflow-y-auto space-y-2">
                      {workers.map((worker) => (
                        <div key={worker.id} className="flex items-center space-x-2">
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
                          />
                          <Label htmlFor={`manual-worker-${worker.id}`} className="cursor-pointer">
                            {worker.name}
                          </Label>
                        </div>
                      ))}
                    </div>
                  )}
                  {manualSelectedWorkers.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {manualSelectedWorkers.length} additional + you = {manualSelectedWorkers.length + 1} total
                    </p>
                  )}
                </div>
              )}
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="manual-notes">Notes (Optional)</Label>
              <Textarea
                id="manual-notes"
                value={manualNotes}
                onChange={(e) => setManualNotes(e.target.value)}
                placeholder="Add any notes..."
                rows={3}
              />
            </div>
            
            <div className="flex gap-2 justify-end pt-4 border-t">
              <Button 
                variant="outline" 
                onClick={() => setShowManualEntry(false)}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button 
                onClick={saveManualEntry}
                disabled={loading || !manualComponent}
                className="gradient-primary"
              >
                {loading ? 'Saving...' : 'Save Entry'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
