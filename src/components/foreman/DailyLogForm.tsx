
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ArrowLeft, FileText, Clock, Camera, AlertTriangle, Package, Cloud, Users, CheckCircle2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { createNotification, getDailyLogBrief } from '@/lib/notifications';
import type { Job, ComponentWorked, TimeSummaryEntry, PhotoLogged, Issue, MaterialRequest, WeatherDetails } from '@/types';
import { getCurrentPosition } from '@/lib/geolocation';
import { getWeatherForLocation } from '@/lib/weather';
import { getLocalDateString } from '@/lib/utils';

interface DailyLogFormProps {
  job: Job;
  onBack: () => void;
}

export function DailyLogForm({ job, onBack }: DailyLogFormProps) {
  const { profile } = useAuth();
  const isCrew = profile?.role === 'crew';
  const isOffice = profile?.role === 'office';
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const today = getLocalDateString();
  
  // Auto-collected data
  const [componentsWorked, setComponentsWorked] = useState<ComponentWorked[]>([]);
  const [timeSummary, setTimeSummary] = useState<TimeSummaryEntry[]>([]);
  const [photosLogged, setPhotosLogged] = useState<PhotoLogged[]>([]);
  const [crewCount, setCrewCount] = useState(0);
  const [weatherDetails, setWeatherDetails] = useState<WeatherDetails | null>(null);
  const [autoSummary, setAutoSummary] = useState('');
  
  // Manual entry
  const [issues, setIssues] = useState<Issue[]>([]);
  const [materialRequests, setMaterialRequests] = useState<MaterialRequest[]>([]);
  const [finalNotes, setFinalNotes] = useState('');
  
  // New issue/material form
  const [newIssue, setNewIssue] = useState('');
  const [issueSeverity, setIssueSeverity] = useState<'low' | 'medium' | 'high'>('medium');
  const [newMaterial, setNewMaterial] = useState('');
  const [materialQty, setMaterialQty] = useState('');
  const [materialPriority, setMaterialPriority] = useState<'low' | 'medium' | 'high'>('medium');
  
  // Existing log ID (if editing)
  const [existingLogId, setExistingLogId] = useState<string | null>(null);
  const [existingLogCreatedBy, setExistingLogCreatedBy] = useState<string | null>(null);
  
  // Delete confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    loadDailyData();
    loadDraftData(); // ✅ Restore draft on mount
  }, [job.id, today]);
  
  // ✅ AUTO-SAVE DRAFT - Persist in-progress log
  useEffect(() => {
    if (!loading && !saving) {
      saveDraftData();
    }
  }, [issues, materialRequests, finalNotes, autoSummary]); // Added missing closing parenthesis and dependency array
  
  // Removed duplicate confirmDelete functions.
  // The original error (line 78:2 error:Parsing error: ',' expected.)
  // was caused by the `useEffect` block missing its closing parenthesis and dependency array.
  // The multiple `confirmDelete` function definitions also point to a copy-paste error.

  async function confirmDelete() {
    if (!existingLogId) return;
    
    setDeleting(true);
    
    try {
      const { error } = await supabase
        .from('daily_logs')
        .delete()
        .eq('id', existingLogId);
      
      if (error) throw error;
      
      toast.success('Daily log deleted');
      clearDraftData();
      onBack();
    } catch (error: any) {
      console.error('Error deleting daily log:', error);
      toast.error('Failed to delete daily log');
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  }
  
  function saveDraftData() {
    try {
      const draft = {
        jobId: job.id,
        date: today,
        issues,
        materialRequests,
        finalNotes,
        autoSummary,
        timestamp: Date.now(),
      };
      localStorage.setItem('fieldtrack_daily_log_draft', JSON.stringify(draft));
    } catch (error) {
      console.error('Error saving draft:', error);
    }
  }
  
  function loadDraftData() {
    try {
      const stored = localStorage.getItem('fieldtrack_daily_log_draft');
      if (!stored) return;
      
      const draft = JSON.parse(stored);
      
      // Only restore if it's for the same job and recent (within 24 hours)
      if (draft.jobId === job.id && Date.now() - draft.timestamp < 24 * 60 * 60 * 1000) {
        console.log('✅ Restoring daily log draft');
        setIssues(draft.issues || []);
        setMaterialRequests(draft.materialRequests || []);
        setFinalNotes(draft.finalNotes || '');
        if (draft.autoSummary && isOffice) {
          setAutoSummary(draft.autoSummary);
        }
      }
    } catch (error) {
      console.error('Error loading draft:', error);
    }
  }
  
  function clearDraftData() {
    try {
      localStorage.removeItem('fieldtrack_daily_log_draft');
      console.log('🧹 Daily log draft cleared');
    } catch (error) {
      console.error('Error clearing draft:', error);
    }
  }

  async function loadDailyData() {
    setLoading(true);
    
    try {
      // Check if log already exists for today
      const { data: existingLog } = await supabase
        .from('daily_logs')
        .select('*')
        .eq('job_id', job.id)
        .eq('log_date', today)
        .eq('created_by', profile?.id)
        .single();

      if (existingLog) {
        // Load existing log data
        setExistingLogId(existingLog.id);
        setExistingLogCreatedBy(existingLog.created_by);
        setComponentsWorked(existingLog.components_worked || []);
        setTimeSummary(existingLog.time_summary || []);
        setPhotosLogged(existingLog.photos_logged || []);
        setIssues(existingLog.issues || []);
        setMaterialRequests(existingLog.material_requests_structured || []);
        setCrewCount(existingLog.crew_count || 0);
        setWeatherDetails(existingLog.weather_details);
        setAutoSummary(existingLog.auto_summary_text || '');
        setFinalNotes(existingLog.final_notes || '');
      } else {
        // Auto-gather data for new log (office only)
        if (isOffice) {
          await gatherDailyData();
        } else {
          // Crew: just load empty state
          setLoading(false);
        }
      }
    } catch (error) {
      console.error('Error loading daily log:', error);
      // If no existing log, gather fresh data for office
      if (isOffice) {
        await gatherDailyData();
      }
    } finally {
      setLoading(false);
    }
  }

  async function gatherDailyData() {
    try {
      // 1. Fetch time entries for today
      const { data: timeEntries, error: timeError } = await supabase
        .from('time_entries')
        .select(`
          *,
          components(id, name),
          user_profiles(username, email)
        `)
        .eq('job_id', job.id)
        .eq('user_id', profile?.id)
        .gte('created_at', `${today}T00:00:00`)
        .lte('created_at', `${today}T23:59:59`)
        .eq('is_active', false);

      if (timeError) throw timeError;

      // 2. Fetch photos uploaded today
      const { data: photos, error: photosError } = await supabase
        .from('photos')
        .select(`
          *,
          components(name)
        `)
        .eq('job_id', job.id)
        .eq('uploaded_by', profile?.id)
        .eq('photo_date', today);

      if (photosError) throw photosError;

      // 3. Get weather for job location
      let weather: any = null;
      try {
        const position = await getCurrentPosition();
        if (position) {
          const weatherData = await getWeatherForLocation(position.latitude, position.longitude);
          // Ensure we get a WeatherDetails object
          if (weatherData && typeof weatherData === 'object') {
            weather = weatherData as WeatherDetails;
          }
        }
      } catch (error) {
        console.error('Weather fetch failed:', error);
      }

      // 4. Process time entries
      const componentMap = new Map<string, { id: string; name: string; hours: number }>();
      const summaryEntries: TimeSummaryEntry[] = [];
      let maxCrew = 0;

      (timeEntries || []).forEach((entry: any) => {
        const hours = entry.total_hours || 0;
        const componentId = entry.component_id;
        const componentName = entry.components?.name || 'Unknown';
        
        // Track max crew count
        if (entry.crew_count > maxCrew) {
          maxCrew = entry.crew_count;
        }

        // Aggregate hours per component
        if (componentMap.has(componentId)) {
          const existing = componentMap.get(componentId)!;
          existing.hours += hours;
        } else {
          componentMap.set(componentId, {
            id: componentId,
            name: componentName,
            hours: hours,
          });
        }

        // Add to time summary
        summaryEntries.push({
          componentName,
          totalHours: hours,
          method: entry.is_manual ? 'manual' : 'timer',
          crewCount: entry.crew_count,
          uploadedBy: entry.user_profiles?.username || entry.user_profiles?.email || 'Unknown',
        });
      });

      const componentsWorkedArray = Array.from(componentMap.values()) as any;

      // 5. Process photos
      const photosLoggedArray = (photos || []).map((photo: any) => ({
        url: photo.photo_url,
        uploadedBy: profile?.username || profile?.email || 'Unknown',
        uploadedAt: photo.created_at,
        componentId: photo.component_id,
        componentName: photo.components?.name,
      })) as any;

      // 6. Generate auto summary
      const summary = generateAutoSummary(
        componentsWorkedArray,
        summaryEntries,
        maxCrew,
        photosLoggedArray,
        weather
      );

      // Set state
      setComponentsWorked(componentsWorkedArray);
      setTimeSummary(summaryEntries);
      setPhotosLogged(photosLoggedArray);
      setCrewCount(maxCrew);
      setWeatherDetails(weather);
      setAutoSummary(summary);
    } catch (error) {
      console.error('Error gathering daily data:', error);
      toast.error('Failed to gather daily data');
    }
  }

  function generateAutoSummary(
    components: ComponentWorked[],
    timeSummary: TimeSummaryEntry[],
    crew: number,
    photos: PhotoLogged[],
    weather: WeatherDetails | null
  ): string {
    const totalHours = components.reduce((sum, c) => sum + c.hours, 0);
    const componentNames = components.map(c => c.name).join(', ');
    
    let summary = '';
    
    if (components.length > 0) {
      summary += `Today the crew worked on ${componentNames}. `;
      summary += `A total of ${totalHours.toFixed(2)} hours were logged`;
      if (crew > 0) {
        summary += ` with ${crew} crew member${crew > 1 ? 's' : ''}`;
      }
      summary += '. ';
    } else {
      summary += 'No time entries recorded for today. ';
    }
    
    if (photos.length > 0) {
      summary += `${photos.length} photo${photos.length > 1 ? 's were' : ' was'} uploaded documenting progress. `;
    }
    
    if (weather) {
      summary += `Weather conditions: ${weather.conditions}, ${weather.temp}°F`;
      if (weather.wind) {
        summary += `, ${weather.wind}`;
      }
      summary += '.';
    }
    
    return summary.trim();
  }

  function addIssue() {
    if (!newIssue.trim()) {
      toast.error('Please enter an issue description');
      return;
    }

    const issue: Issue = {
      description: newIssue.trim(),
      reportedBy: profile?.username || profile?.email || 'Unknown',
      severity: issueSeverity,
      timestamp: new Date().toISOString(),
    };

    setIssues([...issues, issue]);
    setNewIssue('');
    setIssueSeverity('medium');
    toast.success('Issue added');
  }

  function removeIssue(index: number) {
    setIssues(issues.filter((_, i) => i !== index));
  }

  function addMaterialRequest() {
    if (!newMaterial.trim() || !materialQty.trim()) {
      toast.error('Please enter material name and quantity');
      return;
    }

    const request: MaterialRequest = {
      item: newMaterial.trim(),
      quantity: materialQty.trim(),
      priority: materialPriority,
    };

    setMaterialRequests([...materialRequests, request]);
    setNewMaterial('');
    setMaterialQty('');
    setMaterialPriority('medium');
    toast.success('Material request added');
  }

  function removeMaterialRequest(index: number) {
    setMaterialRequests(materialRequests.filter((_, i) => i !== index));
  }

  async function saveDailyLog() {
    setSaving(true);

    try {
      let logData: any;

      if (isCrew) {
        // Crew can only save issues, material requests, and final notes
        // BUT must provide defaults for required fields
        logData = {
          job_id: job.id,
          log_date: today,
          issues: issues,
          material_requests_structured: materialRequests,
          final_notes: finalNotes || null,
          created_by: profile?.id,
          updated_at: new Date().toISOString(),
          // Required fields with defaults
          crew_count: null,
          weather: null,
          weather_details: null,
          components_worked: [],
          time_summary: [],
          photos_logged: [],
          auto_summary_text: null,
        };
      } else {
        // Office can save everything
        logData = {
          job_id: job.id,
          log_date: today,
          weather: weatherDetails ? `${weatherDetails.conditions}, ${weatherDetails.temp}°F` : null,
          weather_details: weatherDetails,
          crew_count: crewCount,
          components_worked: componentsWorked,
          time_summary: timeSummary,
          photos_logged: photosLogged,
          issues: issues,
          material_requests_structured: materialRequests,
          auto_summary_text: autoSummary,
          final_notes: finalNotes || null,
          created_by: profile?.id,
          updated_at: new Date().toISOString(),
        };
      }

      let savedLogId = existingLogId;
      
      if (existingLogId) {
        // Update existing log
        const { error } = await supabase
          .from('daily_logs')
          .update(logData)
          .eq('id', existingLogId);

        if (error) throw error;
        toast.success('Daily log updated');
      } else {
        // Insert new log
        const { data: newLog, error } = await supabase
          .from('daily_logs')
          .insert({
            ...logData,
            created_at: new Date().toISOString(),
          })
          .select()
          .single();

        if (error) throw error;
        savedLogId = newLog.id;
        toast.success('Daily log saved');
        
        // Create notification for office
        if (isCrew) {
          await createNotification({
            jobId: job.id,
            createdBy: profile!.id,
            type: 'daily_log',
            brief: getDailyLogBrief(logData),
            referenceId: savedLogId,
            referenceData: { issues, materialRequests, finalNotes },
          });
        }
      }

      clearDraftData(); // ✅ Clear draft after successful save
      onBack();
    } catch (error: any) {
      console.error('Error saving daily log:', error);
      toast.error('Failed to save daily log');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-muted-foreground">Gathering daily activity...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h2 className="text-xl font-bold">Daily Log</h2>
          <p className="text-sm text-muted-foreground">
            {job.name} • {new Date(today).toLocaleDateString()}
          </p>
        </div>
      </div>

      {/* Weather - OFFICE ONLY */}
      {isOffice && <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Cloud className="w-4 h-4" />
            Weather
          </CardTitle>
        </CardHeader>
        <CardContent>
          {weatherDetails ? (
            <div className="space-y-1 text-sm">
              <p><strong>Conditions:</strong> {weatherDetails.conditions}</p>
              <p><strong>Temperature:</strong> {weatherDetails.temp}°F</p>
              {weatherDetails.wind && <p><strong>Wind:</strong> {weatherDetails.wind}</p>}
              {weatherDetails.precipitation && <p><strong>Precipitation:</strong> {weatherDetails.precipitation}</p>}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Weather data unavailable</p>
          )}
        </CardContent>
      </Card>}

      {/* Crew Count - OFFICE ONLY */}
      {isOffice && <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="w-4 h-4" />
            Crew Count
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">{crewCount || 'N/A'}</p>
          <p className="text-xs text-muted-foreground">Maximum crew size from time entries</p>
        </CardContent>
      </Card>}

      {/* Components Worked - OFFICE ONLY */}
      {isOffice && <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            Components Worked
          </CardTitle>
        </CardHeader>
        <CardContent>
          {componentsWorked.length === 0 ? (
            <p className="text-sm text-muted-foreground">No components recorded</p>
          ) : (
            <div className="space-y-2">
              {componentsWorked.map((comp) => (
                <div key={comp.id} className="flex items-center justify-between p-2 border rounded-lg">
                  <span className="font-medium">{comp.name}</span>
                  <Badge>{comp.hours.toFixed(2)}h</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>}

      {/* Time Summary - OFFICE ONLY */}
      {isOffice && <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Time Entries ({timeSummary.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {timeSummary.length === 0 ? (
            <p className="text-sm text-muted-foreground">No time entries</p>
          ) : (
            <div className="space-y-2">
              {timeSummary.map((entry, index) => (
                <div key={index} className="text-sm border-l-2 border-primary pl-3 py-1">
                  <p className="font-medium">{entry.componentName}</p>
                  <p className="text-muted-foreground">
                    {entry.totalHours.toFixed(2)}h • {entry.crewCount} crew • {entry.method}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>}

      {/* Photos - OFFICE ONLY */}
      {isOffice && <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Camera className="w-4 h-4" />
            Photos Uploaded ({photosLogged.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {photosLogged.length === 0 ? (
            <p className="text-sm text-muted-foreground">No photos uploaded</p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {photosLogged.map((photo, index) => (
                <div key={index} className="relative aspect-square">
                  <img
                    src={photo.url}
                    alt={`Photo ${index + 1}`}
                    className="w-full h-full object-cover rounded-lg"
                  />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>}

      {/* Issues - AVAILABLE TO ALL */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Issues
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {issues.map((issue, index) => (
            <div key={index} className="flex items-start justify-between p-2 border rounded-lg">
              <div className="flex-1">
                <p className="text-sm">{issue.description}</p>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant={issue.severity === 'high' ? 'destructive' : 'secondary'}>
                    {issue.severity}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{issue.reportedBy}</span>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeIssue(index)}
                className="text-destructive"
              >
                Remove
              </Button>
            </div>
          ))}
          
          <div className="space-y-2 pt-2 border-t">
            <Input
              placeholder="Describe issue..."
              value={newIssue}
              onChange={(e) => setNewIssue(e.target.value)}
            />
            <div className="flex gap-2">
              <Select value={issueSeverity} onValueChange={(v: any) => setIssueSeverity(v)}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={addIssue} size="sm" variant="outline" className="flex-1">
                Add Issue
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Material Requests */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="w-4 h-4" />
            Material Requests
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {materialRequests.map((request, index) => (
            <div key={index} className="flex items-start justify-between p-2 border rounded-lg">
              <div className="flex-1">
                <p className="text-sm font-medium">{request.item}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-muted-foreground">Qty: {request.quantity}</span>
                  <Badge variant={request.priority === 'high' ? 'destructive' : 'secondary'}>
                    {request.priority}
                  </Badge>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeMaterialRequest(index)}
                className="text-destructive"
              >
                Remove
              </Button>
            </div>
          ))}
          
          <div className="space-y-2 pt-2 border-t">
            <Input
              placeholder="Material name..."
              value={newMaterial}
              onChange={(e) => setNewMaterial(e.target.value)}
            />
            <div className="flex gap-2">
              <Input
                placeholder="Quantity..."
                value={materialQty}
                onChange={(e) => setMaterialQty(e.target.value)}
                className="flex-1"
              />
              <Select value={materialPriority} onValueChange={(v: any) => setMaterialPriority(v)}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={addMaterialRequest} size="sm" variant="outline" className="w-full">
              Add Material Request
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Auto Summary (Editable) - OFFICE ONLY */}
      {isOffice && <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Auto-Generated Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={autoSummary}
            onChange={(e) => setAutoSummary(e.target.value)}
            rows={4}
            placeholder="Summary will be auto-generated..."
            className="text-sm"
          />
          <p className="text-xs text-muted-foreground mt-2">
            You can edit this auto-generated summary before saving
          </p>
        </CardContent>
      </Card>}

      {/* Final Notes - AVAILABLE TO ALL */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Additional Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={finalNotes}
            onChange={(e) => setFinalNotes(e.target.value)}
            rows={3}
            placeholder="Add any additional notes or comments..."
          />
        </CardContent>
      </Card>

      {/* Save & Delete Buttons */}
      <div className="space-y-2">
        <Button
          onClick={saveDailyLog}
          disabled={saving || deleting}
          className="w-full touch-target gradient-primary"
          size="lg"
        >
          {saving ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
              Saving...
            </>
          ) : (
            <>
              <CheckCircle2 className="w-4 h-4 mr-2" />
              {existingLogId ? 'Update Daily Log' : 'Submit Daily Log'}
            </>
          )}
        </Button>
        
        {/* Delete Button - Only show if user created this log */}
        {existingLogId && existingLogCreatedBy === profile?.id && (
          <>
            {!showDeleteConfirm ? (
              <Button
                variant="outline"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={saving || deleting}
                className="w-full border-destructive text-destructive hover:bg-destructive/10"
                size="lg"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Daily Log
              </Button>
            ) : (
              <div className="border-2 border-destructive rounded-lg p-4 space-y-3">
                <div className="text-center">
                  <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-destructive" />
                  <p className="font-semibold text-destructive">Confirm Deletion</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    This will permanently delete this daily log. This action cannot be undone.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setShowDeleteConfirm(false)}
                    disabled={deleting}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={confirmDelete}
                    disabled={deleting}
                  >
                    {deleting ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                        Deleting...
                      </>
                    ) : (
                      <>
                        <Trash2 className="w-4 h-4 mr-2" />
                        Yes, Delete
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
