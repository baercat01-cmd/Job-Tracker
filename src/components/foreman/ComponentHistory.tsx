import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Clock, Users, Edit, Save, X, FileText } from 'lucide-react';
import { toast } from 'sonner';
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
}

interface ComponentHistoryProps {
  job: Job;
  userId: string;
}

export function ComponentHistory({ job, userId }: ComponentHistoryProps) {
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [editEntry, setEditEntry] = useState<TimeEntry | null>(null);
  const [editNotes, setEditNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadTimeEntries();
  }, [job.id]);

  async function loadTimeEntries() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('time_entries')
        .select(`
          *,
          components(name),
          user_profiles(username)
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
  }

  function closeEditDialog() {
    setEditEntry(null);
    setEditNotes('');
  }

  async function saveNotes() {
    if (!editEntry) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('time_entries')
        .update({ notes: editNotes || null })
        .eq('id', editEntry.id);

      if (error) throw error;

      // Update local state
      setTimeEntries(prev => 
        prev.map(entry => 
          entry.id === editEntry.id 
            ? { ...entry, notes: editNotes || null }
            : entry
        )
      );

      toast.success('Notes updated');
      closeEditDialog();
    } catch (error: any) {
      console.error('Error updating notes:', error);
      toast.error('Failed to update notes');
    } finally {
      setSaving(false);
    }
  }

  function formatDate(dateString: string): string {
    const date = new Date(dateString);
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

  // Group entries by component
  const entriesByComponent = timeEntries.reduce((acc, entry) => {
    const componentName = entry.components?.name || 'Unknown Component';
    if (!acc[componentName]) {
      acc[componentName] = [];
    }
    acc[componentName].push(entry);
    return acc;
  }, {} as Record<string, TimeEntry[]>);

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">Loading work history...</p>
      </div>
    );
  }

  if (timeEntries.length === 0) {
    return (
      <Card>
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
      {Object.entries(entriesByComponent).map(([componentName, entries]) => (
        <Card key={componentName}>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center justify-between">
              <span>{componentName}</span>
              <Badge variant="secondary">
                {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className="border rounded-lg p-4 space-y-3 bg-card hover:bg-muted/30 transition-colors"
              >
                {/* Entry Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">
                        {formatDate(entry.start_time)}
                      </span>
                      {entry.is_manual && (
                        <Badge variant="outline" className="text-xs">
                          Manual
                        </Badge>
                      )}
                    </div>
                    {!entry.is_manual && (
                      <p className="text-sm text-muted-foreground">
                        {formatTime(entry.start_time)} - {formatTime(entry.end_time)}
                      </p>
                    )}
                  </div>
                  {entry.user_id === userId && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEditDialog(entry)}
                      className="flex-shrink-0"
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
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
                  <div className="bg-muted/50 rounded-md p-3">
                    <p className="text-sm text-muted-foreground mb-1 font-medium">Workers:</p>
                    <div className="flex flex-wrap gap-2">
                      {entry.worker_names.map((name, idx) => (
                        <Badge key={idx} variant="secondary" className="text-xs">
                          {name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Notes */}
                {entry.notes && (
                  <div className="bg-muted/50 rounded-md p-3">
                    <p className="text-sm text-muted-foreground mb-1 font-medium">Notes:</p>
                    <p className="text-sm whitespace-pre-wrap">{entry.notes}</p>
                  </div>
                )}
                {!entry.notes && entry.user_id === userId && (
                  <button
                    onClick={() => openEditDialog(entry)}
                    className="text-sm text-muted-foreground hover:text-primary transition-colors"
                  >
                    + Add notes
                  </button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      ))}

      {/* Edit Notes Dialog */}
      <Dialog open={!!editEntry} onOpenChange={closeEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Notes</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Component</p>
              <p className="font-medium">{editEntry?.components?.name}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1">Date</p>
              <p className="font-medium">
                {editEntry && formatDate(editEntry.start_time)}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1">Time</p>
              <p className="font-medium">
                {editEntry && `${formatTime(editEntry.start_time)} - ${formatTime(editEntry.end_time)}`}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1">Total Hours</p>
              <p className="font-medium">
                {editEntry && `${editEntry.total_hours.toFixed(2)} hours`}
              </p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Notes</label>
              <Textarea
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder="Add notes about this work..."
                rows={4}
                className="resize-none"
              />
            </div>
            <div className="flex gap-2 justify-end pt-4 border-t">
              <Button
                variant="outline"
                onClick={closeEditDialog}
                disabled={saving}
              >
                <X className="w-4 h-4 mr-2" />
                Cancel
              </Button>
              <Button
                onClick={saveNotes}
                disabled={saving}
                className="gradient-primary"
              >
                <Save className="w-4 h-4 mr-2" />
                {saving ? 'Saving...' : 'Save Notes'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
