import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Plus, X, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { getLocalDateString } from '@/lib/utils';

interface UnavailableDate {
  id: string;
  user_id: string;
  start_date: string;
  end_date: string;
  reason: string | null;
  created_at: string;
  user_profiles?: {
    username: string;
  };
}

interface UnavailableCalendarProps {
  userId: string;
  onBack?: () => void;
}

export function UnavailableCalendar({ userId, onBack }: UnavailableCalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [unavailableDates, setUnavailableDates] = useState<UnavailableDate[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [startDate, setStartDate] = useState(getLocalDateString());
  const [endDate, setEndDate] = useState(getLocalDateString());
  const [reason, setReason] = useState('');
  const [showAllStaff, setShowAllStaff] = useState(true);

  useEffect(() => {
    loadUnavailableDates();
  }, [userId, showAllStaff]);

  async function loadUnavailableDates() {
    try {
      let query = supabase
        .from('user_unavailable_dates')
        .select('*, user_profiles(username)');

      // If not showing all staff, filter by current user
      if (!showAllStaff) {
        query = query.eq('user_id', userId);
      }

      const { data, error } = await query.order('start_date');

      if (error) throw error;
      setUnavailableDates(data || []);
    } catch (error: any) {
      console.error('Error loading unavailable dates:', error);
    }
  }

  async function addUnavailableDate() {
    if (!startDate || !endDate) {
      toast.error('Please select start and end dates');
      return;
    }

    if (new Date(endDate) < new Date(startDate)) {
      toast.error('End date must be after start date');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from('user_unavailable_dates')
        .insert({
          user_id: userId,
          start_date: startDate,
          end_date: endDate,
          reason: reason || null,
        });

      if (error) throw error;

      toast.success('Time off added');
      setShowAddDialog(false);
      setStartDate(getLocalDateString());
      setEndDate(getLocalDateString());
      setReason('');
      loadUnavailableDates();
    } catch (error: any) {
      toast.error('Failed to add time off');
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  async function deleteUnavailableDate(id: string) {
    if (!confirm('Remove this time off?')) return;

    try {
      const { error } = await supabase
        .from('user_unavailable_dates')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success('Time off removed');
      loadUnavailableDates();
    } catch (error: any) {
      toast.error('Failed to remove time off');
      console.error(error);
    }
  }

  function getDaysInMonth(date: Date): number {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  }

  function getFirstDayOfMonth(date: Date): number {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  }

  function isDateUnavailable(dateStr: string): boolean {
    const date = new Date(dateStr);
    return unavailableDates.some(range => {
      const start = new Date(range.start_date);
      const end = new Date(range.end_date);
      return date >= start && date <= end;
    });
  }

  function getUnavailableInfo(dateStr: string): string | null {
    const date = new Date(dateStr);
    const ranges = unavailableDates.filter(range => {
      const start = new Date(range.start_date);
      const end = new Date(range.end_date);
      return date >= start && date <= end;
    });
    
    if (ranges.length === 0) return null;
    
    if (showAllStaff) {
      const names = ranges.map(r => r.user_profiles?.username || 'Unknown').join(', ');
      return `Off: ${names}`;
    } else {
      return ranges[0]?.reason || 'Time off';
    }
  }

  function getUnavailableUsers(dateStr: string): string[] {
    const date = new Date(dateStr);
    const ranges = unavailableDates.filter(range => {
      const start = new Date(range.start_date);
      const end = new Date(range.end_date);
      return date >= start && date <= end;
    });
    
    return ranges.map(r => r.user_profiles?.username || 'Unknown');
  }

  function previousMonth() {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1));
  }

  function nextMonth() {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1));
  }

  function goToToday() {
    setCurrentDate(new Date());
  }

  const daysInMonth = getDaysInMonth(currentDate);
  const firstDay = getFirstDayOfMonth(currentDate);
  const monthYear = currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  // Generate calendar grid
  const calendarDays: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) {
    calendarDays.push(null);
  }
  for (let day = 1; day <= daysInMonth; day++) {
    calendarDays.push(day);
  }

  return (
    <>
      <Card className="w-full">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              {onBack && (
                <Button variant="ghost" size="icon" onClick={onBack} className="h-8 w-8 mr-2">
                  <ChevronLeft className="w-4 h-4" />
                </Button>
              )}
              <CalendarIcon className="w-5 h-5 text-primary" />
              {showAllStaff ? 'All Staff Time Off' : 'My Time Off'}
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant={showAllStaff ? 'default' : 'outline'}
                size="sm"
                onClick={() => setShowAllStaff(!showAllStaff)}
                className="h-9"
              >
                <Users className="w-4 h-4 mr-2" />
                {showAllStaff ? 'My Time' : 'All Staff'}
              </Button>
              <Button
                size="sm"
                onClick={() => setShowAddDialog(true)}
                className="h-9"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-3 space-y-3">
          {/* Calendar Navigation */}
          <div className="flex items-center justify-between">
            <Button variant="outline" size="icon" onClick={previousMonth} className="h-8 w-8">
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <div className="min-w-[140px] text-center">
              <p className="text-sm font-bold">{monthYear}</p>
            </div>
            <Button variant="outline" size="sm" onClick={goToToday} className="h-8 px-3 text-xs">
              Today
            </Button>
            <Button variant="outline" size="icon" onClick={nextMonth} className="h-8 w-8">
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          {/* Calendar Grid - Compact */}
          <div className="grid grid-cols-7 gap-1">
            {/* Day headers */}
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => (
              <div key={`header-${index}`} className="text-center font-semibold text-xs text-muted-foreground py-1">
                {day}
              </div>
            ))}

            {/* Calendar days */}
            {calendarDays.map((day, index) => {
              if (!day) {
                return <div key={`empty-${index}`} className="h-12 border rounded bg-muted/30" />;
              }

              const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const isUnavailable = isDateUnavailable(dateStr);
              const isToday = dateStr === new Date().toISOString().split('T')[0];
              const unavailableInfo = getUnavailableInfo(dateStr);
              const unavailableUsers = showAllStaff ? getUnavailableUsers(dateStr) : [];

              return (
                <div
                  key={day}
                  className={`h-12 border rounded flex flex-col items-center justify-center text-xs font-medium p-0.5 ${
                    isToday ? 'border-primary ring-1 ring-primary/20' : ''
                  } ${isUnavailable ? 'bg-destructive/20 text-destructive font-bold' : 'hover:bg-muted/50'}`}
                  title={unavailableInfo || undefined}
                >
                  <div className="font-bold">{day}</div>
                  {showAllStaff && unavailableUsers.length > 0 && (
                    <div className="text-[9px] leading-tight text-center truncate w-full px-0.5">
                      {unavailableUsers.join(', ')}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Upcoming Time Off List */}
          {unavailableDates.length > 0 && (
            <div className="pt-2 border-t">
              <p className="text-xs font-semibold text-muted-foreground mb-2">Scheduled Time Off</p>
              <div className="space-y-2 max-h-[150px] overflow-y-auto">
                {unavailableDates
                  .filter(range => new Date(range.end_date) >= new Date())
                  .map(range => (
                    <div
                      key={range.id}
                      className="bg-destructive/10 border border-destructive/30 rounded p-2 text-xs"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          {showAllStaff && (
                            <p className="font-semibold text-primary mb-1">
                              {range.user_profiles?.username || 'Unknown User'}
                            </p>
                          )}
                          <p className="font-bold text-destructive">
                            {new Date(range.start_date).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                            })}
                            {' - '}
                            {new Date(range.end_date).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })}
                          </p>
                          {range.reason && (
                            <p className="text-muted-foreground mt-1">{range.reason}</p>
                          )}
                        </div>
                        {!showAllStaff && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteUnavailableDate(range.id)}
                            className="h-6 w-6 text-destructive hover:text-destructive"
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Time Off Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Time Off</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="start-date">Start Date *</Label>
                <Input
                  id="start-date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  min={getLocalDateString()}
                  className="h-12"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end-date">End Date *</Label>
                <Input
                  id="end-date"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  min={startDate}
                  className="h-12"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reason">Reason (Optional)</Label>
              <Textarea
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Vacation, Personal, etc."
                rows={2}
                className="resize-none"
              />
            </div>

            <div className="flex gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => setShowAddDialog(false)}
                className="flex-1"
                disabled={loading}
              >
                Cancel
              </Button>
              <Button
                onClick={addUnavailableDate}
                className="flex-1 gradient-primary"
                disabled={loading}
              >
                {loading ? 'Adding...' : 'Add Time Off'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
