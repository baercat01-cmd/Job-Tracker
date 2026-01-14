import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Clock, Users, Edit, Save, X, FileText, ChevronDown, ChevronRight, Trash2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { getLocalDateString } from '@/lib/utils';
import type { Job } from '@/types';

interface TimeEntry {
  id: string;
  component_id: string;
  user_id: string;
  start_time: string;
  end_time: string;
  total_hours: number;
  crew_count: number;
  is_manual: boolean;
  notes: string | null;
  worker_names: string[] | null;
  created_at: string;
  components: { name: string } | null;
  user_profiles: { username: string } | null;
  photos: Array<{
    id: string;
    photo_url: string;
    caption: string | null;
  }>;
}

interface Worker {
  id: string;
  name: string;
  active: boolean;
}

interface ComponentHistoryProps {
  job: Job;
  userId: string;
}

export function ComponentHistory({ job, userId }: ComponentHistoryProps) {
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [editEntry, setEditEntry] = useState<TimeEntry | null>(null);
  const [editNotes, setEditNotes] = useState('');
  const [editMode, setEditMode] = useState<'count' | 'workers'>('count');
  const [editCrewCount, setEditCrewCount] = useState('1');
  const [editSelectedWorkers, setEditSelectedWorkers] = useState<string[]>([]);
  const [editDate, setEditDate] = useState('');
  const [editStartTime, setEditStartTime] = useState('');
  const [editEndTime, setEditEndTime] = useState('');
  const [showEditWorkers, setShowEditWorkers] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Delete confirmation
  const [deleteEntryId, setDeleteEntryId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    loadTimeEntries();
    loadWorkers();
  }, [job.id]);

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

  async function loadTimeEntries() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('time_entries')
        .select(`
          *,
          components(name),
          user_profiles(username),
          photos:photos!time_entry_id(id, photo_url, caption)
        `)
        .eq('job_id', job.id)
        .order('start_time', { ascending: false });

      if (error) throw error;
      setTimeEntries(data || []);
    } catch (error: any) {
      console.error('Error loading time entries:', error);
      toast.error('Failed to load work history');
    } finally {
      setLoading(false);
    }
  }

  function openEditDialog(entry: TimeEntry) {
    setEditEntry(entry);
    setEditNotes(entry.notes || '');
    
    // Set mode based on whether worker names exist
    if (entry.worker_names && entry.worker_names.length > 0) {
      setEditMode('workers');
      // Convert worker names to IDs
      const workerIds = entry.worker_names
        .map(name => workers.find(w => w.name === name)?.id)
        .filter((id): id is string => !!id);
      setEditSelectedWorkers(workerIds);
      setEditCrewCount('0');
    } else {
      setEditMode('count');
      setEditCrewCount((entry.crew_count || 1).toString());
      setEditSelectedWorkers([]);
    }
    
    // Set date and times separately
    const startDate = new Date(entry.start_time);
    const endDate = new Date(entry.end_time);
    
    // Date in YYYY-MM-DD format
    const year = startDate.getFullYear();
    const month = String(startDate.getMonth() + 1).padStart(2, '0');
    const day = String(startDate.getDate()).padStart(2, '0');
    setEditDate(`${year}-${month}-${day}`);
    
    // Time in HH:MM format (24-hour)
    const startHours = String(startDate.getHours()).padStart(2, '0');
    const startMinutes = String(startDate.getMinutes()).padStart(2, '0');
    setEditStartTime(`${startHours}:${startMinutes}`);
    
    const endHours = String(endDate.getHours()).padStart(2, '0');
    const endMinutes = String(endDate.getMinutes()).padStart(2, '0');
    setEditEndTime(`${endHours}:${endMinutes}`);
  }

  function closeEditDialog() {
    setEditEntry(null);
    setEditNotes('');
    setEditMode('count');
    setEditCrewCount('1');
    setEditSelectedWorkers([]);
    setEditDate('');
    setEditStartTime('');
    setEditEndTime('');
    setShowEditWorkers(false);
  }

  async function saveTimeEntry() {
    if (!editEntry) return;

    // Validate inputs
    if (!editDate || !editStartTime || !editEndTime) {
      toast.error('Please enter date and both times');
      return;
    }

    // Combine date and time to create full datetime
    const startDateTime = new Date(`${editDate}T${editStartTime}`);
    const endDateTime = new Date(`${editDate}T${editEndTime}`);
    
    if (endDateTime <= startDateTime) {
      toast.error('End time must be after start time');
      return;
    }

    // Calculate total hours automatically
    const totalHours = (endDateTime.getTime() - startDateTime.getTime()) / (1000 * 60 * 60);
    
    if (totalHours <= 0) {
      toast.error('Invalid time range');
      return;
    }

    // Validate worker selection if in workers mode
    if (editMode === 'workers' && editSelectedWorkers.length === 0) {
      toast.error('Please select at least one worker');
      return;
    }

    setSaving(true);
    try {
      // Determine crew count and worker names based on mode
      let finalCrewCount: number;
      let finalWorkerNames: string[];
      
      if (editMode === 'workers') {
        // Get worker names from selected IDs
        finalWorkerNames = editSelectedWorkers
          .map(workerId => workers.find(w => w.id === workerId)?.name)
          .filter((name): name is string => !!name);
        finalCrewCount = finalWorkerNames.length;
      } else {
        // Use crew count mode
        finalCrewCount = parseInt(editCrewCount) || 1;
        finalWorkerNames = [];
      }

      const { error } = await supabase
        .from('time_entries')
        .update({ 
          start_time: startDateTime.toISOString(),
          end_time: endDateTime.toISOString(),
          total_hours: Math.round(totalHours * 4) / 4,
          crew_count: finalCrewCount,
          worker_names: finalWorkerNames,
          notes: editNotes || null 
        })
        .eq('id', editEntry.id);

      if (error) throw error;

      // Reload entries to get fresh data
      await loadTimeEntries();

      toast.success('Time entry updated');
      closeEditDialog();
    } catch (error: any) {
      console.error('Error updating time entry:', error);
      toast.error('Failed to update time entry');
    } finally {
      setSaving(false);
    }
  }

  function startDeleteEntry(entryId: string) {
    setDeleteEntryId(entryId);
    setShowDeleteConfirm(true);
  }

  function cancelDelete() {
    setDeleteEntryId(null);
    setShowDeleteConfirm(false);
  }

  async function confirmDeleteEntry() {
    if (!deleteEntryId) return;
    
    setDeleting(true);
    
    try {
      const { error } = await supabase
        .from('time_entries')
        .delete()
        .eq('id', deleteEntryId);
      
      if (error) throw error;
      
      toast.success('Time entry deleted');
      cancelDelete();
      await loadTimeEntries();
    } catch (error: any) {
      console.error('Error deleting time entry:', error);
      toast.error('Failed to delete time entry');
    } finally {
      setDeleting(false);
    }
  }

  function formatDate(dateString: string): string {
    // Parse as local date by adding time component
    const date = new Date(dateString + 'T12:00:00');
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: 'numeric'
    });
  }

  function formatTime(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true
    });
  }

  // Only show component entries (filter out clock-in entries)
  const componentEntries = timeEntries.filter(e => e.component_id !== null);

  // Group component entries by date, then by component
  const componentEntriesByDate = componentEntries.reduce((acc, entry) => {
    // Use local date for grouping
    const entryDate = new Date(entry.start_time);
    const date = getLocalDateString(entryDate);
    if (!acc[date]) {
      acc[date] = {};
    }
    
    const componentName = entry.components?.name || 'Unknown Component';
    if (!acc[date][componentName]) {
      acc[date][componentName] = [];
    }
    acc[date][componentName].push(entry);
    return acc;
  }, {} as Record<string, Record<string, TimeEntry[]>>);

  // Sort dates (most recent first)
  const sortedDates = Object.keys(componentEntriesByDate).sort((a, b) => b.localeCompare(a));
  
  // Calculate stats for component entries
  const getComponentDateStats = (date: string) => {
    const componentsForDate = componentEntriesByDate[date] || {};
    const totalEntries = Object.values(componentsForDate).reduce((sum, entries) => sum + entries.length, 0);
    const totalManHours = Object.values(componentsForDate).reduce(
      (sum, entries) => sum + entries.reduce((s, e) => s + ((e.total_hours || 0) * (e.crew_count || 1)), 0),
      0
    );
    return { totalEntries, totalManHours };
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="w-8 h-8 border-4 border-green-900 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">Loading work history...</p>
      </div>
    );
  }

  if (timeEntries.length === 0) {
    return (
      <Card className="rounded-none border-slate-300 bg-white">
        <CardContent className="py-12 text-center text-muted-foreground">
          <FileText className="w-16 h-16 mx-auto mb-4 opacity-50" />
          <p className="text-lg">No work history yet</p>
          <p className="text-sm mt-1">Time entries will appear here</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {sortedDates.map((date, index) => {
        const componentsForDate = componentEntriesByDate[date] || {};
        const componentStats = getComponentDateStats(date);

        return (
          <Card key={date} className="border-2 shadow-md rounded-none border-slate-300 bg-white">
            <CardHeader className="pb-4 bg-slate-50 border-b-2 border-slate-300">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <Clock className="w-5 h-5 text-green-900" />
                    <CardTitle className="text-2xl font-bold text-green-900">
                      {formatDate(date)}
                    </CardTitle>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span>{componentStats.totalEntries} component {componentStats.totalEntries === 1 ? 'entry' : 'entries'}</span>
                  </div>
                </div>
                <div className="text-right bg-white rounded-none px-4 py-3 border-2 border-slate-300">
                  <p className="text-3xl font-bold text-green-900">
                    {componentStats.totalManHours.toFixed(2)}
                  </p>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Total Man-Hours</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6 pt-4 bg-white">
              {/* Component Time Section */}
              <div className="space-y-4">
                {Object.entries(componentsForDate).map(([componentName, entries], compIndex) => (
                    <div key={componentName} className="space-y-3 border-l-4 border-l-green-900 pl-4 py-2">
                      {/* Component Name Header */}
                      <div className="flex items-center justify-between pb-3 border-b-2">
                        <h4 className="font-bold text-base text-foreground">{componentName}</h4>
                        <Badge variant="secondary" className="text-sm font-semibold rounded-none">
                          {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
                        </Badge>
                      </div>

                      {/* Component Entries */}
                      <div className="space-y-3">
                        {entries.map((entry) => (
                          <div
                            key={entry.id}
                            className="border rounded-none border-slate-300 p-4 space-y-3 bg-white hover:bg-slate-50 transition-colors"
                          >
                            {/* Entry Header */}
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  {entry.is_manual && (
                                    <Badge variant="outline" className="text-xs rounded-none border-slate-300">
                                      Manual
                                    </Badge>
                                  )}
                                  {!entry.is_manual && (
                                    <span className="text-sm text-muted-foreground">
                                      {formatTime(entry.start_time)} - {formatTime(entry.end_time)}
                                    </span>
                                  )}
                                </div>
                              </div>
                              {entry.user_id === userId && (
                                <div className="flex gap-1 flex-shrink-0">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => openEditDialog(entry)}
                                    className="rounded-none hover:bg-slate-100"
                                  >
                                    <Edit className="w-4 h-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => startDeleteEntry(entry.id)}
                                    className="text-destructive hover:text-destructive rounded-none hover:bg-red-50"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </div>
                              )}
                            </div>

                            {/* Entry Details */}
                            <div className="flex items-center gap-4 text-sm flex-wrap">
                              <div className="flex items-center gap-1">
                                <Clock className="w-4 h-4 text-muted-foreground" />
                                <div>
                                  <span className="font-medium">{((entry.total_hours || 0) * (entry.crew_count || 1)).toFixed(2)}</span>
                                  <span className="text-xs text-muted-foreground ml-1">man-hours</span>
                                </div>
                              </div>
                              <div className="flex items-center gap-1">
                                <Users className="w-4 h-4 text-muted-foreground" />
                                <span>{entry.crew_count} crew</span>
                              </div>
                              <div className="text-muted-foreground">
                                by {entry.user_profiles?.username || 'Unknown'}
                              </div>
                            </div>

                            {/* Worker Names */}
                            {entry.worker_names && entry.worker_names.length > 0 && (
                              <div className="bg-slate-50 rounded-none border border-slate-300 p-3">
                                <p className="text-sm text-muted-foreground mb-1 font-medium">Workers:</p>
                                <div className="flex flex-wrap gap-2">
                                  {entry.worker_names.map((name, idx) => (
                                    <Badge key={idx} variant="secondary" className="text-xs rounded-none">
                                      {name}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Photos */}
                            {entry.photos && entry.photos.length > 0 && (
                              <div className="bg-slate-50 rounded-none border border-slate-300 p-3">
                                <p className="text-sm text-muted-foreground mb-2 font-medium">Photos ({entry.photos.length}):</p>
                                <div className="grid grid-cols-3 gap-2">
                                  {entry.photos.map((photo) => (
                                    <a
                                      key={photo.id}
                                      href={photo.photo_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="aspect-square rounded-none overflow-hidden border border-slate-300 hover:opacity-80 transition-opacity"
                                    >
                                      <img
                                        src={photo.photo_url}
                                        alt={photo.caption || 'Time entry photo'}
                                        className="w-full h-full object-cover"
                                      />
                                    </a>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Notes */}
                            {entry.notes && (
                              <div className="bg-slate-50 rounded-none border border-slate-300 p-3">
                                <p className="text-sm text-muted-foreground mb-1 font-medium">Notes:</p>
                                <p className="text-sm whitespace-pre-wrap">{entry.notes}</p>
                              </div>
                            )}
                            {!entry.notes && entry.user_id === userId && (
                              <button
                                onClick={() => openEditDialog(entry)}
                                className="text-sm text-muted-foreground hover:text-green-900 transition-colors"
                              >
                                + Add notes
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })}

      {/* Edit Time Entry Dialog */}
      <Dialog open={!!editEntry} onOpenChange={closeEditDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto rounded-none border-slate-300">
          <DialogHeader>
            <DialogTitle>Edit Time Entry</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Component Info */}
            <div className="bg-slate-50 rounded-none border border-slate-300 p-3">
              <p className="text-sm text-muted-foreground mb-1">Component</p>
              <p className="font-medium">
                {editEntry?.components?.name || (editEntry?.component_id === null ? 'Clock-In Time' : 'Unknown')}
              </p>
            </div>

            {/* Time Summary - Auto-calculated */}
            <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-none border-2 border-green-900">
              <div className="text-center">
                <p className="text-xs text-muted-foreground mb-1">Duration</p>
                <p className="text-2xl font-bold text-green-900">
                  {editDate && editStartTime && editEndTime ? 
                    (() => {
                      const start = new Date(`${editDate}T${editStartTime}`);
                      const end = new Date(`${editDate}T${editEndTime}`);
                      const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
                      return hours > 0 ? hours.toFixed(2) : '0.00';
                    })()
                    : '0.00'
                  }
                </p>
                <p className="text-xs text-muted-foreground">hours</p>
              </div>
              <div className="text-center border-l border-slate-300">
                <p className="text-xs text-muted-foreground mb-1">Original</p>
                <p className="text-2xl font-bold text-muted-foreground">
                  {editEntry?.total_hours?.toFixed(2) || '0.00'}
                </p>
                <p className="text-xs text-muted-foreground">hours</p>
              </div>
            </div>

            {/* Date */}
            <div className="space-y-2">
              <Label htmlFor="edit-date">Date</Label>
              <Input
                id="edit-date"
                type="date"
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
                className="h-11 rounded-none border-slate-300"
              />
            </div>

            {/* Time Inputs - Larger and More Prominent */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="edit-start-time" className="text-sm font-semibold">Start Time</Label>
                <Input
                  id="edit-start-time"
                  type="time"
                  value={editStartTime}
                  onChange={(e) => setEditStartTime(e.target.value)}
                  className="h-14 text-xl font-mono rounded-none border-slate-300"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-end-time" className="text-sm font-semibold">End Time</Label>
                <Input
                  id="edit-end-time"
                  type="time"
                  value={editEndTime}
                  onChange={(e) => setEditEndTime(e.target.value)}
                  className="h-14 text-xl font-mono rounded-none border-slate-300"
                />
              </div>
            </div>

            {/* Crew Mode Toggle */}
            <div className="space-y-3 pt-2 border-t border-slate-300">
              <Label>Crew Tracking</Label>
              <RadioGroup value={editMode} onValueChange={(v) => setEditMode(v as 'count' | 'workers')}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="count" id="edit-mode-count" />
                  <Label htmlFor="edit-mode-count" className="cursor-pointer">Crew Count</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="workers" id="edit-mode-workers" />
                  <Label htmlFor="edit-mode-workers" className="cursor-pointer">Select Workers</Label>
                </div>
              </RadioGroup>
            </div>

            {/* Crew Count or Workers Selection */}
            {editMode === 'count' ? (
              <div className="space-y-2">
                <Label htmlFor="edit-crew-count">Crew Count</Label>
                <Input
                  id="edit-crew-count"
                  type="number"
                  min="1"
                  max="20"
                  value={editCrewCount}
                  onChange={(e) => setEditCrewCount(e.target.value)}
                  className="h-11 rounded-none border-slate-300"
                />
                <p className="text-xs text-muted-foreground">Total number of crew members</p>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Select Workers</Label>
                {workers.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-3 text-center border rounded-none border-slate-300 bg-slate-50">
                    No workers available
                  </p>
                ) : (
                  <>
                    {/* Toggle Button */}
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setShowEditWorkers(!showEditWorkers)}
                      className="w-full h-11 justify-between rounded-none border-slate-300 bg-white hover:bg-slate-100"
                    >
                      <span>
                        {editSelectedWorkers.length > 0 
                          ? `${editSelectedWorkers.length} worker${editSelectedWorkers.length > 1 ? 's' : ''} selected`
                          : 'Select workers'}
                      </span>
                      {showEditWorkers ? (
                        <ChevronDown className="w-5 h-5" />
                      ) : (
                        <ChevronRight className="w-5 h-5" />
                      )}
                    </Button>

                    {/* Dropdown List */}
                    {showEditWorkers && (
                      <div className="border rounded-none border-slate-300 max-h-[200px] overflow-y-auto">
                        <div className="p-3 space-y-2">
                          {workers.map((worker) => (
                            <div key={worker.id} className="flex items-center space-x-3 p-2 hover:bg-slate-50 rounded-none transition-colors">
                              <Checkbox
                                id={`edit-worker-${worker.id}`}
                                checked={editSelectedWorkers.includes(worker.id)}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    setEditSelectedWorkers([...editSelectedWorkers, worker.id]);
                                  } else {
                                    setEditSelectedWorkers(editSelectedWorkers.filter(id => id !== worker.id));
                                  }
                                }}
                                className="h-5 w-5"
                              />
                              <Label htmlFor={`edit-worker-${worker.id}`} className="cursor-pointer flex-1">
                                {worker.name}
                              </Label>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="bg-slate-50 rounded-none border border-slate-300 p-3 text-center">
                      <p className="text-sm font-medium">
                        {editSelectedWorkers.length > 0 ? (
                          <>
                            <span className="text-green-900 text-lg font-bold">{editSelectedWorkers.length}</span> crew member{editSelectedWorkers.length !== 1 ? 's' : ''}
                          </>
                        ) : (
                          <>
                            <span className="text-green-900 text-lg font-bold">0</span> crew members
                          </>
                        )}
                      </p>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Notes */}
            <div className="space-y-2 pt-2 border-t border-slate-300">
              <Label htmlFor="edit-notes">Notes (Optional)</Label>
              <Textarea
                id="edit-notes"
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder="Add notes about this work..."
                rows={3}
                className="resize-none rounded-none border-slate-300"
              />
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2 justify-end pt-4 border-t border-slate-300">
              <Button
                variant="outline"
                onClick={closeEditDialog}
                disabled={saving}
                className="rounded-none border-slate-300 bg-white hover:bg-slate-100"
              >
                <X className="w-4 h-4 mr-2" />
                Cancel
              </Button>
              <Button
                onClick={saveTimeEntry}
                disabled={saving}
                className="bg-green-900 text-white hover:bg-green-800 rounded-none font-bold"
              >
                <Save className="w-4 h-4 mr-2" />
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteConfirm} onOpenChange={cancelDelete}>
        <DialogContent className="max-w-md rounded-none border-slate-300">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              Confirm Deletion
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete this time entry? This action cannot be undone.
            </p>
            
            <div className="flex gap-2 justify-end pt-4 border-t border-slate-300">
              <Button
                variant="outline"
                onClick={cancelDelete}
                disabled={deleting}
                className="rounded-none border-slate-300 bg-white hover:bg-slate-100"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={confirmDeleteEntry}
                disabled={deleting}
                className="rounded-none"
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
        </DialogContent>
      </Dialog>
    </div>
  );
}
