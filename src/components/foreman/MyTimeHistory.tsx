import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Clock, Calendar, Edit, Trash2, Briefcase, ChevronDown, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isSameDay, isSameWeek, isSameMonth, parseISO } from 'date-fns';

interface TimeEntry {
  id: string;
  job_id: string;
  component_id: string | null;
  start_time: string;
  end_time: string | null;
  total_hours: number;
  crew_count: number;
  is_manual: boolean;
  notes: string | null;
  jobs: {
    name: string;
    client_name: string;
    is_internal: boolean;
  };
  components: {
    name: string;
  } | null;
}

interface DayGroup {
  date: Date;
  entries: TimeEntry[];
  totalHours: number;
}

interface WeekGroup {
  weekStart: Date;
  weekEnd: Date;
  days: DayGroup[];
  totalHours: number;
  collapsed: boolean;
}

interface MonthGroup {
  month: Date;
  weeks: WeekGroup[];
  totalHours: number;
  collapsed: boolean;
}

interface MyTimeHistoryProps {
  userId: string;
  onBack: () => void;
}

export function MyTimeHistory({ userId, onBack }: MyTimeHistoryProps) {
  const [loading, setLoading] = useState(false);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [monthGroups, setMonthGroups] = useState<MonthGroup[]>([]);
  const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null);
  const [editForm, setEditForm] = useState({
    hours: '0',
    minutes: '0',
    notes: '',
  });

  useEffect(() => {
    loadTimeHistory();
  }, [userId]);

  async function loadTimeHistory() {
    setLoading(true);
    try {
      // Fetch last 90 days of time entries
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

      const { data, error } = await supabase
        .from('time_entries')
        .select(`
          *,
          jobs(name, client_name, is_internal),
          components(name)
        `)
        .eq('user_id', userId)
        .gte('start_time', ninetyDaysAgo.toISOString())
        .not('total_hours', 'is', null)
        .order('start_time', { ascending: false });

      if (error) throw error;

      setTimeEntries(data || []);
      groupEntries(data || []);
    } catch (error: any) {
      console.error('Error loading time history:', error);
      toast.error('Failed to load time history');
    } finally {
      setLoading(false);
    }
  }

  function groupEntries(entries: TimeEntry[]) {
    const months: MonthGroup[] = [];

    // Group by month
    entries.forEach((entry) => {
      const entryDate = parseISO(entry.start_time);
      const monthStart = startOfMonth(entryDate);

      let monthGroup = months.find((m) => isSameMonth(m.month, monthStart));
      if (!monthGroup) {
        monthGroup = {
          month: monthStart,
          weeks: [],
          totalHours: 0,
          collapsed: false,
        };
        months.push(monthGroup);
      }

      // Group by week within month
      const weekStart = startOfWeek(entryDate, { weekStartsOn: 0 }); // Sunday
      const weekEnd = endOfWeek(entryDate, { weekStartsOn: 0 });

      let weekGroup = monthGroup.weeks.find((w) => isSameWeek(w.weekStart, weekStart, { weekStartsOn: 0 }));
      if (!weekGroup) {
        weekGroup = {
          weekStart,
          weekEnd,
          days: [],
          totalHours: 0,
          collapsed: false,
        };
        monthGroup.weeks.push(weekGroup);
      }

      // Group by day within week
      let dayGroup = weekGroup.days.find((d) => isSameDay(d.date, entryDate));
      if (!dayGroup) {
        dayGroup = {
          date: entryDate,
          entries: [],
          totalHours: 0,
        };
        weekGroup.days.push(dayGroup);
      }

      dayGroup.entries.push(entry);
      dayGroup.totalHours += entry.total_hours || 0;
      weekGroup.totalHours += entry.total_hours || 0;
      monthGroup.totalHours += entry.total_hours || 0;
    });

    // Sort days within each week (descending)
    months.forEach((month) => {
      month.weeks.forEach((week) => {
        week.days.sort((a, b) => b.date.getTime() - a.date.getTime());
      });
      // Sort weeks within each month (descending)
      month.weeks.sort((a, b) => b.weekStart.getTime() - a.weekStart.getTime());
    });

    // Sort months (descending)
    months.sort((a, b) => b.month.getTime() - a.month.getTime());

    setMonthGroups(months);
  }

  function openEditDialog(entry: TimeEntry) {
    const hours = Math.floor(entry.total_hours || 0);
    const minutes = Math.round(((entry.total_hours || 0) - hours) * 60);

    setEditForm({
      hours: hours.toString(),
      minutes: minutes.toString(),
      notes: entry.notes || '',
    });
    setEditingEntry(entry);
  }

  async function saveEdit() {
    if (!editingEntry) return;

    const totalHours = parseInt(editForm.hours) + parseInt(editForm.minutes) / 60;

    if (totalHours <= 0) {
      toast.error('Total hours must be greater than 0');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from('time_entries')
        .update({
          total_hours: Math.round(totalHours * 4) / 4, // Round to nearest 0.25
          notes: editForm.notes || null,
        })
        .eq('id', editingEntry.id);

      if (error) throw error;

      toast.success('Time entry updated');
      setEditingEntry(null);
      loadTimeHistory();
    } catch (error: any) {
      console.error('Error updating time entry:', error);
      toast.error('Failed to update time entry');
    } finally {
      setLoading(false);
    }
  }

  async function deleteEntry(entryId: string) {
    if (!confirm('Are you sure you want to delete this time entry?')) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('time_entries')
        .delete()
        .eq('id', entryId);

      if (error) throw error;

      toast.success('Time entry deleted');
      loadTimeHistory();
    } catch (error: any) {
      console.error('Error deleting time entry:', error);
      toast.error('Failed to delete time entry');
    } finally {
      setLoading(false);
    }
  }

  function toggleMonthCollapse(monthIndex: number) {
    setMonthGroups((prev) =>
      prev.map((month, i) =>
        i === monthIndex ? { ...month, collapsed: !month.collapsed } : month
      )
    );
  }

  function toggleWeekCollapse(monthIndex: number, weekIndex: number) {
    setMonthGroups((prev) =>
      prev.map((month, mIdx) =>
        mIdx === monthIndex
          ? {
              ...month,
              weeks: month.weeks.map((week, wIdx) =>
                wIdx === weekIndex ? { ...week, collapsed: !week.collapsed } : week
              ),
            }
          : month
      )
    );
  }

  if (loading && timeEntries.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">Loading time history...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={onBack}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div className="flex-1">
              <CardTitle className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-primary" />
                My Time History
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">Last 90 days</p>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Time History - Grouped by Month/Week/Day */}
      {monthGroups.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Clock className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
            <p className="text-muted-foreground">No time entries found</p>
          </CardContent>
        </Card>
      ) : (
        monthGroups.map((monthGroup, monthIndex) => (
          <Card key={monthIndex} className="overflow-hidden">
            <CardHeader className="pb-3 bg-primary/5">
              <button
                onClick={() => toggleMonthCollapse(monthIndex)}
                className="flex items-center justify-between w-full text-left hover:bg-primary/10 -m-3 p-3 rounded transition-colors"
              >
                <div className="flex items-center gap-2">
                  {monthGroup.collapsed ? (
                    <ChevronRight className="w-5 h-5 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-muted-foreground" />
                  )}
                  <Calendar className="w-5 h-5 text-primary" />
                  <CardTitle className="text-lg">
                    {format(monthGroup.month, 'MMMM yyyy')}
                  </CardTitle>
                </div>
                <Badge variant="default" className="text-base font-bold">
                  {monthGroup.totalHours.toFixed(2)}h
                </Badge>
              </button>
            </CardHeader>

            {!monthGroup.collapsed && (
              <CardContent className="space-y-4 pt-4">
                {monthGroup.weeks.map((weekGroup, weekIndex) => (
                  <div key={weekIndex} className="space-y-3">
                    {/* Week Header */}
                    <button
                      onClick={() => toggleWeekCollapse(monthIndex, weekIndex)}
                      className="flex items-center justify-between w-full text-left p-3 bg-muted/30 hover:bg-muted/50 rounded-lg transition-colors"
                    >
                      <div className="flex items-center gap-2 text-sm">
                        {weekGroup.collapsed ? (
                          <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-muted-foreground" />
                        )}
                        <span className="font-medium">
                          Week of {format(weekGroup.weekStart, 'MMM d')} - {format(weekGroup.weekEnd, 'MMM d')}
                        </span>
                      </div>
                      <Badge variant="secondary" className="font-bold">
                        {weekGroup.totalHours.toFixed(2)}h
                      </Badge>
                    </button>

                    {/* Days in Week */}
                    {!weekGroup.collapsed && (
                      <div className="space-y-3 pl-4">
                        {weekGroup.days.map((dayGroup, dayIndex) => (
                          <div key={dayIndex} className="space-y-2">
                            {/* Day Header */}
                            <div className="flex items-center justify-between p-2 bg-card border rounded-lg">
                              <div className="flex items-center gap-2">
                                <Calendar className="w-4 h-4 text-primary" />
                                <span className="font-medium text-sm">
                                  {format(dayGroup.date, 'EEEE, MMM d, yyyy')}
                                </span>
                              </div>
                              <Badge variant="outline" className="font-bold">
                                {dayGroup.totalHours.toFixed(2)}h
                              </Badge>
                            </div>

                            {/* Entries for Day */}
                            <div className="space-y-2 pl-4">
                              {dayGroup.entries.map((entry) => (
                                <div
                                  key={entry.id}
                                  className="flex items-center justify-between p-3 bg-muted/20 border rounded-lg hover:bg-muted/40 transition-colors"
                                >
                                  <div className="flex-1 space-y-1">
                                    <div className="flex items-center gap-2">
                                      <Briefcase className="w-4 h-4 text-muted-foreground" />
                                      <span className="font-medium text-sm">
                                        {entry.jobs?.name || 'Unknown Job'}
                                      </span>
                                      {entry.is_manual && (
                                        <Badge variant="secondary" className="text-xs">
                                          Manual
                                        </Badge>
                                      )}
                                    </div>
                                    {entry.components && (
                                      <p className="text-xs text-muted-foreground pl-6">
                                        {entry.components.name}
                                      </p>
                                    )}
                                    {entry.notes && (
                                      <p className="text-xs text-muted-foreground pl-6 italic">
                                        {entry.notes}
                                      </p>
                                    )}
                                    <div className="text-xs text-muted-foreground pl-6">
                                      {entry.crew_count} crew • {entry.total_hours.toFixed(2)} hours
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-2">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => openEditDialog(entry)}
                                    >
                                      <Edit className="w-4 h-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => deleteEntry(entry.id)}
                                      className="text-destructive hover:text-destructive"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </CardContent>
            )}
          </Card>
        ))
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editingEntry} onOpenChange={() => setEditingEntry(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Time Entry</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {editingEntry && (
              <>
                <div>
                  <Label className="text-muted-foreground">Job</Label>
                  <p className="font-medium">{editingEntry.jobs?.name}</p>
                </div>

                {editingEntry.components && (
                  <div>
                    <Label className="text-muted-foreground">Component</Label>
                    <p className="font-medium">{editingEntry.components.name}</p>
                  </div>
                )}

                <div>
                  <Label className="text-muted-foreground">Date</Label>
                  <p className="font-medium">
                    {format(parseISO(editingEntry.start_time), 'EEEE, MMM d, yyyy')}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Time Worked</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label htmlFor="edit-hours" className="text-xs">
                        Hours
                      </Label>
                      <Select
                        value={editForm.hours}
                        onValueChange={(value) =>
                          setEditForm({ ...editForm, hours: value })
                        }
                      >
                        <SelectTrigger id="edit-hours">
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
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="edit-minutes" className="text-xs">
                        Minutes
                      </Label>
                      <Select
                        value={editForm.minutes}
                        onValueChange={(value) =>
                          setEditForm({ ...editForm, minutes: value })
                        }
                      >
                        <SelectTrigger id="edit-minutes">
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
                  </div>
                  <div className="bg-primary/10 rounded p-2 text-center">
                    <p className="text-sm font-bold text-primary">
                      Total: {(parseInt(editForm.hours) + parseInt(editForm.minutes) / 60).toFixed(2)} hours
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-notes">Notes (Optional)</Label>
                  <Input
                    id="edit-notes"
                    value={editForm.notes}
                    onChange={(e) =>
                      setEditForm({ ...editForm, notes: e.target.value })
                    }
                    placeholder="Add notes..."
                  />
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingEntry(null)}>
              Cancel
            </Button>
            <Button onClick={saveEdit} disabled={loading}>
              {loading ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
