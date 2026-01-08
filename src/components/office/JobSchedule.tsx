import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Calendar, 
  Plus, 
  User, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  Edit,
  Trash2,
  Phone,
  AlertCircle,
  ListTodo
} from 'lucide-react';
import { toast } from 'sonner';
import type { Job } from '@/types';

// Helper function to parse date string as local date (not UTC)
function parseDateLocal(dateString: string): Date {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
}

interface Subcontractor {
  id: string;
  name: string;
  company_name: string | null;
  trades: string[] | null;
  phone: string | null;
}

interface Schedule {
  id: string;
  subcontractor_id: string;
  start_date: string;
  end_date: string | null;
  work_description: string | null;
  notes: string | null;
  status: string;
  subcontractors: Subcontractor;
}

interface CalendarEvent {
  id: string;
  title: string;
  description: string | null;
  event_date: string;
  event_type: string;
  job_id: string;
  all_day: boolean;
  start_time: string | null;
  end_time: string | null;
  created_by: string;
}

interface JobScheduleProps {
  job: Job;
}

export function JobSchedule({ job }: JobScheduleProps) {
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState('tasks');
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [subcontractors, setSubcontractors] = useState<Subcontractor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showAddEventDialog, setShowAddEventDialog] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [formData, setFormData] = useState({
    subcontractor_id: '',
    start_date: '',
    end_date: '',
    work_description: '',
    notes: '',
    status: 'scheduled',
  });
  const [eventFormData, setEventFormData] = useState({
    title: '',
    description: '',
    event_date: '',
    event_type: 'task',
    all_day: true,
    start_time: '',
    end_time: '',
  });

  useEffect(() => {
    loadData();
  }, [job.id]);

  async function loadData() {
    try {
      setLoading(true);
      await Promise.all([
        loadSchedules(),
        loadEvents(),
        loadSubcontractors(),
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function loadSchedules() {
    const { data, error } = await supabase
      .from('subcontractor_schedules')
      .select(`
        *,
        subcontractors(id, name, company_name, trades, phone)
      `)
      .eq('job_id', job.id)
      .order('start_date', { ascending: true });

    if (error) {
      console.error('Error loading schedules:', error);
      return;
    }

    setSchedules(data || []);
  }

  async function loadEvents() {
    const { data, error } = await supabase
      .from('calendar_events')
      .select('*')
      .eq('job_id', job.id)
      .order('event_date', { ascending: true });

    if (error) {
      console.error('Error loading events:', error);
      return;
    }

    setEvents(data || []);
  }

  async function loadSubcontractors() {
    const { data, error } = await supabase
      .from('subcontractors')
      .select('id, name, company_name, trades, phone')
      .eq('active', true)
      .order('name');

    if (error) {
      console.error('Error loading subcontractors:', error);
      return;
    }

    setSubcontractors(data || []);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!formData.subcontractor_id || !formData.start_date) {
      toast.error('Please select a subcontractor and start date');
      return;
    }

    try {
      const scheduleData = {
        job_id: job.id,
        subcontractor_id: formData.subcontractor_id,
        start_date: formData.start_date,
        end_date: formData.end_date || null,
        work_description: formData.work_description || null,
        notes: formData.notes || null,
        status: formData.status,
        created_by: profile?.id,
      };

      if (editingSchedule) {
        const { error } = await supabase
          .from('subcontractor_schedules')
          .update(scheduleData)
          .eq('id', editingSchedule.id);

        if (error) throw error;
        toast.success('Schedule updated');
      } else {
        const { error } = await supabase
          .from('subcontractor_schedules')
          .insert(scheduleData);

        if (error) throw error;
        toast.success('Schedule created');
      }

      handleCloseDialog();
      loadSchedules();
    } catch (error: any) {
      console.error('Error saving schedule:', error);
      toast.error('Failed to save schedule');
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this schedule?')) return;

    try {
      const { error } = await supabase
        .from('subcontractor_schedules')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('Schedule deleted');
      loadSchedules();
    } catch (error: any) {
      console.error('Error deleting schedule:', error);
      toast.error('Failed to delete schedule');
    }
  }

  async function updateStatus(id: string, newStatus: string) {
    try {
      const { error } = await supabase
        .from('subcontractor_schedules')
        .update({ status: newStatus })
        .eq('id', id);

      if (error) throw error;
      toast.success(`Marked as ${newStatus}`);
      loadSchedules();
    } catch (error: any) {
      console.error('Error updating status:', error);
      toast.error('Failed to update status');
    }
  }

  function handleEdit(schedule: Schedule) {
    setEditingSchedule(schedule);
    setFormData({
      subcontractor_id: schedule.subcontractor_id,
      start_date: schedule.start_date,
      end_date: schedule.end_date || '',
      work_description: schedule.work_description || '',
      notes: schedule.notes || '',
      status: schedule.status,
    });
    setShowAddDialog(true);
  }

  async function handleEventSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!eventFormData.title || !eventFormData.event_date) {
      toast.error('Please enter a title and date');
      return;
    }

    try {
      const eventData = {
        job_id: job.id,
        title: eventFormData.title,
        description: eventFormData.description || null,
        event_date: eventFormData.event_date,
        event_type: eventFormData.event_type,
        all_day: eventFormData.all_day,
        start_time: !eventFormData.all_day ? eventFormData.start_time : null,
        end_time: !eventFormData.all_day ? eventFormData.end_time : null,
        created_by: profile?.id,
      };

      if (editingEvent) {
        const { error } = await supabase
          .from('calendar_events')
          .update(eventData)
          .eq('id', editingEvent.id);

        if (error) throw error;
        toast.success('Task updated');
      } else {
        const { error } = await supabase
          .from('calendar_events')
          .insert(eventData);

        if (error) throw error;
        toast.success('Task created');
      }

      handleCloseEventDialog();
      loadEvents();
    } catch (error: any) {
      console.error('Error saving task:', error);
      toast.error('Failed to save task');
    }
  }

  async function handleDeleteEvent(id: string) {
    if (!confirm('Delete this task?')) return;

    try {
      const { error } = await supabase
        .from('calendar_events')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('Task deleted');
      loadEvents();
    } catch (error: any) {
      console.error('Error deleting task:', error);
      toast.error('Failed to delete task');
    }
  }

  function handleEditEvent(event: CalendarEvent) {
    setEditingEvent(event);
    setEventFormData({
      title: event.title,
      description: event.description || '',
      event_date: event.event_date,
      event_type: event.event_type,
      all_day: event.all_day,
      start_time: event.start_time || '',
      end_time: event.end_time || '',
    });
    setShowAddEventDialog(true);
  }

  function handleCloseDialog() {
    setShowAddDialog(false);
    setEditingSchedule(null);
    setFormData({
      subcontractor_id: '',
      start_date: '',
      end_date: '',
      work_description: '',
      notes: '',
      status: 'scheduled',
    });
  }

  function handleCloseEventDialog() {
    setShowAddEventDialog(false);
    setEditingEvent(null);
    setEventFormData({
      title: '',
      description: '',
      event_date: '',
      event_type: 'task',
      all_day: true,
      start_time: '',
      end_time: '',
    });
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const upcomingSchedules = schedules.filter(s => {
    const startDate = new Date(s.start_date);
    return startDate >= today && s.status === 'scheduled';
  });

  const pastSchedules = schedules.filter(s => {
    const endDate = new Date(s.end_date || s.start_date);
    return endDate < today || s.status !== 'scheduled';
  });

  const upcomingEvents = events.filter(e => {
    const eventDate = new Date(e.event_date);
    return eventDate >= today;
  });

  const pastEvents = events.filter(e => {
    const eventDate = new Date(e.event_date);
    return eventDate < today;
  });

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <Calendar className="w-12 h-12 mx-auto mb-4 opacity-50 animate-pulse" />
          <p>Loading schedule...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Job Schedule</h2>
          <p className="text-muted-foreground">{job.name}</p>
        </div>
      </div>

      {/* Tabs for Tasks and Subcontractors */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="tasks" className="flex items-center gap-2">
            <ListTodo className="w-4 h-4" />
            Tasks & Events ({events.length})
          </TabsTrigger>
          <TabsTrigger value="subcontractors" className="flex items-center gap-2">
            <User className="w-4 h-4" />
            Subcontractors ({schedules.length})
          </TabsTrigger>
        </TabsList>

        {/* Tasks Tab */}
        <TabsContent value="tasks" className="space-y-6">
          <div className="flex items-center justify-end">
            <Button onClick={() => setShowAddEventDialog(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Add Task
            </Button>
          </div>

          {/* Upcoming Tasks */}
          {upcomingEvents.length > 0 && (
            <div>
              <h3 className="text-xl font-bold mb-4">Upcoming</h3>
              <div className="grid gap-4 md:grid-cols-2">
                {upcomingEvents.map(event => (
                  <EventCard
                    key={event.id}
                    event={event}
                    onEdit={handleEditEvent}
                    onDelete={handleDeleteEvent}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Past Tasks */}
          {pastEvents.length > 0 && (
            <div>
              <h3 className="text-xl font-bold mb-4">Past</h3>
              <div className="grid gap-4 md:grid-cols-2">
                {pastEvents.map(event => (
                  <EventCard
                    key={event.id}
                    event={event}
                    onEdit={handleEditEvent}
                    onDelete={handleDeleteEvent}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Empty State */}
          {events.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <ListTodo className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p className="mb-4">No tasks or events yet</p>
                <Button onClick={() => setShowAddEventDialog(true)} variant="outline">
                  <Plus className="w-4 h-4 mr-2" />
                  Add First Task
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Subcontractors Tab */}
        <TabsContent value="subcontractors" className="space-y-6">
          <div className="flex items-center justify-end">
            <Button onClick={() => setShowAddDialog(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Schedule Work
            </Button>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-3 gap-4">
            <Card>
              <CardContent className="py-4">
                <div className="text-center">
                  <p className="text-3xl font-bold text-primary">{upcomingSchedules.length}</p>
                  <p className="text-sm text-muted-foreground">Upcoming</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4">
                <div className="text-center">
                  <p className="text-3xl font-bold text-green-600">
                    {schedules.filter(s => s.status === 'completed').length}
                  </p>
                  <p className="text-sm text-muted-foreground">Completed</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4">
                <div className="text-center">
                  <p className="text-3xl font-bold text-muted-foreground">
                    {schedules.filter(s => s.status === 'cancelled').length}
                  </p>
                  <p className="text-sm text-muted-foreground">Cancelled</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Upcoming Work */}
          {upcomingSchedules.length > 0 && (
            <div>
              <h3 className="text-xl font-bold mb-4">Upcoming Work</h3>
              <div className="grid gap-4 md:grid-cols-2">
                {upcomingSchedules.map(schedule => (
                  <ScheduleCard
                    key={schedule.id}
                    schedule={schedule}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onUpdateStatus={updateStatus}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Past Work */}
          {pastSchedules.length > 0 && (
            <div>
              <h3 className="text-xl font-bold mb-4">Past & Completed</h3>
              <div className="grid gap-4 md:grid-cols-2">
                {pastSchedules.map(schedule => (
                  <ScheduleCard
                    key={schedule.id}
                    schedule={schedule}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onUpdateStatus={updateStatus}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Empty State */}
          {schedules.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <User className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p className="mb-4">No scheduled work yet</p>
                <Button onClick={() => setShowAddDialog(true)} variant="outline">
                  <Plus className="w-4 h-4 mr-2" />
                  Schedule First Work
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Add/Edit Task Dialog */}
      <Dialog open={showAddEventDialog} onOpenChange={(open) => !open && handleCloseEventDialog()}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingEvent ? 'Edit Task' : 'Add Task'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEventSubmit} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label>Title *</Label>
                <Input
                  value={eventFormData.title}
                  onChange={(e) => setEventFormData({ ...eventFormData, title: e.target.value })}
                  placeholder="Task or event name"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label>Date *</Label>
                <Input
                  type="date"
                  value={eventFormData.event_date}
                  onChange={(e) => setEventFormData({ ...eventFormData, event_date: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label>Type</Label>
                <Select
                  value={eventFormData.event_type}
                  onValueChange={(value) => setEventFormData({ ...eventFormData, event_type: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="task">Task</SelectItem>
                    <SelectItem value="milestone">Milestone</SelectItem>
                    <SelectItem value="inspection">Inspection</SelectItem>
                    <SelectItem value="delivery">Delivery</SelectItem>
                    <SelectItem value="meeting">Meeting</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 md:col-span-2">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="all-day"
                    checked={eventFormData.all_day}
                    onChange={(e) => setEventFormData({ ...eventFormData, all_day: e.target.checked })}
                    className="rounded"
                  />
                  <Label htmlFor="all-day">All Day</Label>
                </div>
              </div>

              {!eventFormData.all_day && (
                <>
                  <div className="space-y-2">
                    <Label>Start Time</Label>
                    <Input
                      type="time"
                      value={eventFormData.start_time}
                      onChange={(e) => setEventFormData({ ...eventFormData, start_time: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>End Time</Label>
                    <Input
                      type="time"
                      value={eventFormData.end_time}
                      onChange={(e) => setEventFormData({ ...eventFormData, end_time: e.target.value })}
                    />
                  </div>
                </>
              )}

              <div className="space-y-2 md:col-span-2">
                <Label>Description</Label>
                <Textarea
                  value={eventFormData.description}
                  onChange={(e) => setEventFormData({ ...eventFormData, description: e.target.value })}
                  placeholder="Additional details..."
                  rows={3}
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleCloseEventDialog}>
                Cancel
              </Button>
              <Button type="submit">
                {editingEvent ? 'Update' : 'Add'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Subcontractor Dialog */}
      <Dialog open={showAddDialog} onOpenChange={(open) => !open && handleCloseDialog()}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingSchedule ? 'Edit Schedule' : 'Schedule Work'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Subcontractor *</Label>
                <Select
                  value={formData.subcontractor_id}
                  onValueChange={(value) => setFormData({ ...formData, subcontractor_id: value })}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select subcontractor" />
                  </SelectTrigger>
                  <SelectContent>
                    {subcontractors.map(sub => (
                      <SelectItem key={sub.id} value={sub.id}>
                        {sub.name} {sub.trades && sub.trades.length > 0 && `- ${sub.trades.join(', ')}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {subcontractors.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    No active subcontractors. Add them in Settings → Subs
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Start Date *</Label>
                <Input
                  type="date"
                  value={formData.start_date}
                  onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label>End Date</Label>
                <Input
                  type="date"
                  value={formData.end_date}
                  onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                  min={formData.start_date}
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label>Work Description</Label>
                <Input
                  value={formData.work_description}
                  onChange={(e) => setFormData({ ...formData, work_description: e.target.value })}
                  placeholder="What work will be performed?"
                />
              </div>

              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value) => setFormData({ ...formData, status: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="scheduled">Scheduled</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label>Notes</Label>
                <Textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Additional notes or instructions..."
                  rows={3}
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleCloseDialog}>
                Cancel
              </Button>
              <Button type="submit">
                {editingSchedule ? 'Update' : 'Schedule'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EventCard({
  event,
  onEdit,
  onDelete,
}: {
  event: CalendarEvent;
  onEdit: (event: CalendarEvent) => void;
  onDelete: (id: string) => void;
}) {
  const eventDate = parseDateLocal(event.event_date);
  const isPast = eventDate < new Date();

  const eventTypeColors: Record<string, string> = {
    task: 'bg-blue-100 text-blue-700',
    milestone: 'bg-purple-100 text-purple-700',
    inspection: 'bg-orange-100 text-orange-700',
    delivery: 'bg-green-100 text-green-700',
    meeting: 'bg-yellow-100 text-yellow-700',
    other: 'bg-gray-100 text-gray-700',
  };

  return (
    <Card className={isPast ? 'opacity-60' : ''}>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-lg flex items-center gap-2">
              <ListTodo className="w-5 h-5 text-primary" />
              {event.title}
            </CardTitle>
            <Badge className={`mt-2 ${eventTypeColors[event.event_type] || eventTypeColors.other}`}>
              {event.event_type}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <span className="font-medium">
              {eventDate.toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </span>
            {!event.all_day && event.start_time && (
              <span className="text-muted-foreground">
                {event.start_time}
                {event.end_time && ` - ${event.end_time}`}
              </span>
            )}
          </div>

          {event.description && (
            <div>
              <p className="text-xs text-muted-foreground">Description</p>
              <p className="text-sm">{event.description}</p>
            </div>
          )}

          <div className="flex gap-2 pt-3 border-t">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onEdit(event)}
            >
              <Edit className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDelete(event.id)}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ScheduleCard({
  schedule,
  onEdit,
  onDelete,
  onUpdateStatus,
}: {
  schedule: Schedule;
  onEdit: (schedule: Schedule) => void;
  onDelete: (id: string) => void;
  onUpdateStatus: (id: string, status: string) => void;
}) {
  const startDate = parseDateLocal(schedule.start_date);
  const endDate = schedule.end_date ? parseDateLocal(schedule.end_date) : null;
  const isPast = (endDate || startDate) < new Date();
  const dateRangeStr = endDate && endDate.getTime() !== startDate.getTime()
    ? ` - ${endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
    : '';

  return (
    <Card className={schedule.status === 'cancelled' ? 'opacity-60' : ''}>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-lg flex items-center gap-2">
              <User className="w-5 h-5 text-primary" />
              {schedule.subcontractors.name}
            </CardTitle>
            {schedule.subcontractors.trades && schedule.subcontractors.trades.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {schedule.subcontractors.trades.map((trade, idx) => (
                  <Badge key={idx} variant="outline" className="text-xs">
                    {trade}
                  </Badge>
                ))}
              </div>
            )}
          </div>
          <Badge
            variant={
              schedule.status === 'completed' ? 'default' :
              schedule.status === 'cancelled' ? 'secondary' :
              isPast ? 'destructive' : 'outline'
            }
          >
            {schedule.status === 'completed' ? 'Completed' :
             schedule.status === 'cancelled' ? 'Cancelled' :
             isPast ? 'Overdue' : 'Scheduled'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <span className="font-medium">
              {startDate.toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
              {dateRangeStr}
            </span>
          </div>

          {schedule.work_description && (
            <div>
              <p className="text-xs text-muted-foreground">Work</p>
              <p className="text-sm">{schedule.work_description}</p>
            </div>
          )}

          {schedule.notes && (
            <div>
              <p className="text-xs text-muted-foreground">Notes</p>
              <p className="text-sm">{schedule.notes}</p>
            </div>
          )}

          {schedule.subcontractors.phone && (
            <div className="flex items-center gap-2 text-sm">
              <Phone className="w-4 h-4 text-muted-foreground" />
              <a href={`tel:${schedule.subcontractors.phone}`} className="hover:underline">
                {schedule.subcontractors.phone}
              </a>
            </div>
          )}

          <div className="flex gap-2 pt-3 border-t">
            {schedule.status === 'scheduled' && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => onUpdateStatus(schedule.id, 'completed')}
                >
                  <CheckCircle2 className="w-4 h-4 mr-1" />
                  Complete
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onUpdateStatus(schedule.id, 'cancelled')}
                >
                  <XCircle className="w-4 h-4" />
                </Button>
              </>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onEdit(schedule)}
            >
              <Edit className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDelete(schedule.id)}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
