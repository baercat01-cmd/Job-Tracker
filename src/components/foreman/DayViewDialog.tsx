import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  Calendar, 
  Clock, 
  Plus, 
  Edit, 
  Trash2, 
  MapPin,
  Users,
  Package,
  Truck,
  ListChecks,
  AlertCircle,
  Briefcase,
  X,
  CheckCircle2
} from 'lucide-react';
import { toast } from 'sonner';
import type { Job, CalendarEvent } from '@/types';

interface DayViewDialogProps {
  date: string | null;
  open: boolean;
  onClose: () => void;
  onUpdate: () => void;
}

interface SystemEvent {
  id: string;
  type: 'material_order' | 'material_delivery' | 'material_pull' | 'task_completed' | 'subcontractor';
  jobId: string;
  jobName: string;
  title: string;
  description: string;
  status?: string;
  priority?: 'low' | 'medium' | 'high';
  canEdit: boolean;
}

const EVENT_TYPE_OPTIONS = [
  { value: 'meeting', label: 'Meeting', icon: Users },
  { value: 'delivery', label: 'Delivery', icon: Truck },
  { value: 'inspection', label: 'Inspection', icon: ListChecks },
  { value: 'deadline', label: 'Deadline', icon: AlertCircle },
  { value: 'other', label: 'Other', icon: Calendar },
];

export function DayViewDialog({ date, open, onClose, onUpdate }: DayViewDialogProps) {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [systemEvents, setSystemEvents] = useState<SystemEvent[]>([]);
  const [userEvents, setUserEvents] = useState<CalendarEvent[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  
  // Form state for adding/editing events
  const [showEventForm, setShowEventForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    event_type: 'other' as CalendarEvent['event_type'],
    job_id: '',
    all_day: true,
    start_time: '',
    end_time: '',
  });

  useEffect(() => {
    if (open && date) {
      loadDayEvents();
      loadJobs();
    }
  }, [open, date]);

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

  async function loadDayEvents() {
    if (!date) return;
    
    setLoading(true);
    try {
      // Get today's date for comparison
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const selectedDate = new Date(date + 'T00:00:00');
      // Only mark as overdue if BEFORE today, not ON today
      const isOverdue = selectedDate < today;

      // Load system events (materials, tasks, subcontractors)
      const systemEventsData: SystemEvent[] = [];

      // Load material events
      const { data: materials } = await supabase
        .from('materials')
        .select(`
          id,
          name,
          job_id,
          order_by_date,
          delivery_date,
          pull_by_date,
          status,
          jobs!inner(id, name)
        `)
        .or(`order_by_date.eq.${date},delivery_date.eq.${date},pull_by_date.eq.${date}`);

      if (materials) {
        materials.forEach((material: any) => {
          if (material.order_by_date === date && material.status === 'not_ordered') {
            systemEventsData.push({
              id: `order-${material.id}`,
              type: 'material_order',
              jobId: material.job_id,
              jobName: material.jobs.name,
              title: `Order: ${material.name}`,
              description: 'Must order by this date',
              status: material.status,
              priority: isOverdue ? 'high' : 'medium',
              canEdit: true,
            });
          }
          if (material.delivery_date === date && material.status === 'ordered') {
            systemEventsData.push({
              id: `delivery-${material.id}`,
              type: 'material_delivery',
              jobId: material.job_id,
              jobName: material.jobs.name,
              title: `Delivery: ${material.name}`,
              description: 'Expected delivery to shop',
              status: material.status,
              priority: isOverdue ? 'high' : 'medium',
              canEdit: true,
            });
          }
          if (material.pull_by_date === date && material.status === 'at_shop') {
            systemEventsData.push({
              id: `pull-${material.id}`,
              type: 'material_pull',
              jobId: material.job_id,
              jobName: material.jobs.name,
              title: `Pull: ${material.name}`,
              description: 'Pull from shop for delivery',
              status: material.status,
              priority: isOverdue ? 'high' : 'medium',
              canEdit: true,
            });
          }
        });
      }

      // Load completed tasks
      const { data: completedTasks } = await supabase
        .from('completed_tasks')
        .select(`
          id,
          notes,
          components!inner(name),
          jobs!inner(id, name)
        `)
        .eq('completed_date', date);

      if (completedTasks) {
        completedTasks.forEach((task: any) => {
          systemEventsData.push({
            id: `task-${task.id}`,
            type: 'task_completed',
            jobId: task.jobs.id,
            jobName: task.jobs.name,
            title: `Completed: ${task.components.name}`,
            description: task.notes || 'Task completed',
            priority: 'low',
            canEdit: false,
          });
        });
      }

      // Load subcontractor schedules
      const { data: schedules } = await supabase
        .from('subcontractor_schedules')
        .select(`
          id,
          work_description,
          status,
          subcontractors!inner(name, phone),
          jobs!inner(id, name)
        `)
        .lte('start_date', date)
        .gte('end_date', date);

      if (schedules) {
        schedules.forEach((schedule: any) => {
          systemEventsData.push({
            id: `sub-${schedule.id}`,
            type: 'subcontractor',
            jobId: schedule.jobs.id,
            jobName: schedule.jobs.name,
            title: schedule.subcontractors.name,
            description: schedule.work_description || 'Scheduled work',
            status: schedule.status,
            priority: 'medium',
            canEdit: false,
          });
        });
      }

      setSystemEvents(systemEventsData);

      // Load user-created calendar events
      const { data: userEventsData, error: userEventsError } = await supabase
        .from('calendar_events')
        .select(`
          *,
          completed_user:completed_by(username, email)
        `)
        .eq('event_date', date)
        .order('start_time', { ascending: true, nullsFirst: false });

      if (userEventsError) throw userEventsError;
      setUserEvents(userEventsData || []);
    } catch (error: any) {
      console.error('Error loading day events:', error);
      toast.error('Failed to load events');
    } finally {
      setLoading(false);
    }
  }

  function openEventForm(event?: CalendarEvent) {
    if (event) {
      setEditingEvent(event);
      setFormData({
        title: event.title,
        description: event.description || '',
        event_type: event.event_type,
        job_id: event.job_id || '',
        all_day: event.all_day,
        start_time: event.start_time || '',
        end_time: event.end_time || '',
      });
    } else {
      setEditingEvent(null);
      setFormData({
        title: '',
        description: '',
        event_type: 'other',
        job_id: '',
        all_day: true,
        start_time: '',
        end_time: '',
      });
    }
    setShowEventForm(true);
  }

  async function saveEvent() {
    if (!formData.title.trim()) {
      toast.error('Please enter an event title');
      return;
    }

    if (!date || !profile?.id) return;

    setLoading(true);
    try {
      const eventData = {
        title: formData.title,
        description: formData.description || null,
        event_date: date,
        event_type: formData.event_type,
        job_id: formData.job_id || null,
        all_day: formData.all_day,
        start_time: formData.all_day ? null : formData.start_time || null,
        end_time: formData.all_day ? null : formData.end_time || null,
        created_by: profile.id,
        updated_at: new Date().toISOString(),
      };

      if (editingEvent) {
        // Update existing event
        const { error } = await supabase
          .from('calendar_events')
          .update(eventData)
          .eq('id', editingEvent.id);

        if (error) throw error;
        toast.success('Event updated');
      } else {
        // Create new event
        const { error } = await supabase
          .from('calendar_events')
          .insert(eventData);

        if (error) throw error;
        toast.success('Event added');
      }

      setShowEventForm(false);
      loadDayEvents();
      onUpdate();
    } catch (error: any) {
      console.error('Error saving event:', error);
      toast.error('Failed to save event');
    } finally {
      setLoading(false);
    }
  }

  async function deleteEvent(eventId: string) {
    if (!confirm('Are you sure you want to delete this event?')) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('calendar_events')
        .delete()
        .eq('id', eventId);

      if (error) throw error;

      toast.success('Event deleted');
      loadDayEvents();
      onUpdate();
    } catch (error: any) {
      console.error('Error deleting event:', error);
      toast.error('Failed to delete event');
    } finally {
      setLoading(false);
    }
  }

  async function toggleEventCompletion(eventId: string, isCompleted: boolean) {
    if (!profile?.id) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('calendar_events')
        .update({
          completed_at: isCompleted ? null : new Date().toISOString(),
          completed_by: isCompleted ? null : profile.id,
        })
        .eq('id', eventId);

      if (error) throw error;

      toast.success(isCompleted ? 'Event marked as incomplete' : 'Event marked as complete');
      loadDayEvents();
      onUpdate();
    } catch (error: any) {
      console.error('Error toggling event completion:', error);
      toast.error('Failed to update event');
    } finally {
      setLoading(false);
    }
  }

  if (!date) return null;

  const dateObj = new Date(date + 'T00:00:00');
  const formattedDate = dateObj.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const EVENT_TYPE_ICONS = {
    material_order: Package,
    material_delivery: Truck,
    material_pull: Package,
    material_pickup: Truck,
    material_order_reminder: AlertCircle,
    task_completed: ListChecks,
    task: ListChecks,
    subcontractor: Users,
    meeting: Users,
    delivery: Truck,
    inspection: ListChecks,
    deadline: AlertCircle,
    other: Calendar,
  };

  const totalEvents = systemEvents.length + userEvents.length;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-primary" />
            {formattedDate}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Add Event Button */}
          <Button
            onClick={() => openEventForm()}
            className="w-full h-12 gradient-primary"
          >
            <Plus className="w-5 h-5 mr-2" />
            Add Event
          </Button>

          {/* Event Form */}
          {showEventForm && (
            <Card className="border-2 border-primary">
              <CardContent className="pt-6 space-y-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-lg">
                    {editingEvent ? 'Edit Event' : 'New Event'}
                  </h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowEventForm(false)}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="event-title">Title *</Label>
                  <Input
                    id="event-title"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="Event title..."
                    className="h-12 text-base"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="event-type">Type</Label>
                  <Select
                    value={formData.event_type}
                    onValueChange={(value: CalendarEvent['event_type']) =>
                      setFormData({ ...formData, event_type: value })
                    }
                  >
                    <SelectTrigger id="event-type" className="h-12">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EVENT_TYPE_OPTIONS.map(option => {
                        const Icon = option.icon;
                        return (
                          <SelectItem key={option.value} value={option.value}>
                            <div className="flex items-center gap-2">
                              <Icon className="w-4 h-4" />
                              {option.label}
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="event-job">Link to Job (Optional)</Label>
                  <div className="flex gap-2">
                    <Select
                      value={formData.job_id || undefined}
                      onValueChange={(value) =>
                        setFormData({ ...formData, job_id: value })
                      }
                    >
                      <SelectTrigger id="event-job" className="h-12 flex-1">
                        <SelectValue placeholder="No job selected" />
                      </SelectTrigger>
                      <SelectContent>
                        {jobs.map(job => (
                          <SelectItem key={job.id} value={job.id}>
                            {job.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {formData.job_id && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setFormData({ ...formData, job_id: '' })}
                        className="h-12 px-3"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="event-description">Description (Optional)</Label>
                  <Textarea
                    id="event-description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Add details..."
                    rows={3}
                    className="resize-none"
                  />
                </div>

                <div className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="all-day"
                      checked={formData.all_day}
                      onCheckedChange={(checked) =>
                        setFormData({ ...formData, all_day: !!checked })
                      }
                    />
                    <Label htmlFor="all-day" className="cursor-pointer">
                      All day event
                    </Label>
                  </div>

                  {!formData.all_day && (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label htmlFor="start-time">Start Time</Label>
                        <Input
                          id="start-time"
                          type="time"
                          value={formData.start_time}
                          onChange={(e) =>
                            setFormData({ ...formData, start_time: e.target.value })
                          }
                          className="h-12"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="end-time">End Time</Label>
                        <Input
                          id="end-time"
                          type="time"
                          value={formData.end_time}
                          onChange={(e) =>
                            setFormData({ ...formData, end_time: e.target.value })
                          }
                          className="h-12"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex gap-2 pt-4 border-t">
                  <Button
                    variant="outline"
                    onClick={() => setShowEventForm(false)}
                    className="flex-1"
                    disabled={loading}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={saveEvent}
                    className="flex-1 gradient-primary"
                    disabled={loading}
                  >
                    {loading ? 'Saving...' : editingEvent ? 'Update' : 'Add Event'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Events List */}
          {loading && !showEventForm ? (
            <div className="py-12 text-center">
              <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-muted-foreground">Loading events...</p>
            </div>
          ) : totalEvents === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Calendar className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
                <p className="text-muted-foreground">No events scheduled for this date</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Click "Add Event" to create one
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {/* User Events */}
              {userEvents.map(event => {
                const Icon = EVENT_TYPE_ICONS[event.event_type];
                const linkedJob = event.job_id ? jobs.find(j => j.id === event.job_id) : null;
                const isCompleted = !!(event as any).completed_at;
                const completedUser = (event as any).completed_user;
                
                return (
                  <Card key={event.id} className={`border-l-4 border-l-primary ${
                    isCompleted ? 'opacity-60 bg-muted/30' : ''
                  }`}>
                    <CardContent className="py-4">
                      <div className="flex items-start gap-3">
                        {/* Completion Checkbox */}
                        <div className="pt-1">
                          <input
                            type="checkbox"
                            checked={isCompleted}
                            onChange={() => toggleEventCompletion(event.id, isCompleted)}
                            className="w-5 h-5 rounded border-2 border-primary cursor-pointer"
                          />
                        </div>
                        <div className="p-2 rounded-lg bg-primary/10 text-primary">
                          <Icon className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1">
                              <p className={`font-bold text-lg ${
                                isCompleted ? 'line-through text-muted-foreground' : ''
                              }`}>{event.title}</p>
                              {!event.all_day && event.start_time && (
                                <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                                  <Clock className="w-4 h-4" />
                                  <span>
                                    {event.start_time}
                                    {event.end_time && ` - ${event.end_time}`}
                                  </span>
                                </div>
                              )}
                              {isCompleted && completedUser && (
                                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                                  <CheckCircle2 className="w-3 h-3" />
                                  <span>
                                    Completed by {completedUser.username || completedUser.email}
                                  </span>
                                </div>
                              )}
                            </div>
                            <div className="flex flex-col gap-1 ml-2">
                              <Badge variant="secondary">
                                {EVENT_TYPE_OPTIONS.find(o => o.value === event.event_type)?.label}
                              </Badge>
                              {isCompleted && (
                                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">
                                  ✓ Done
                                </Badge>
                              )}
                            </div>
                          </div>
                          {event.description && (
                            <p className={`text-sm text-muted-foreground mb-2 ${
                              isCompleted ? 'line-through' : ''
                            }`}>
                              {event.description}
                            </p>
                          )}
                          {linkedJob && (
                            <div className="flex items-center gap-1 text-sm text-muted-foreground mb-2">
                              <Briefcase className="w-4 h-4" />
                              <span>{linkedJob.name}</span>
                            </div>
                          )}
                          <div className="flex gap-2 mt-3">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openEventForm(event)}
                            >
                              <Edit className="w-4 h-4 mr-1" />
                              Edit
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => deleteEvent(event.id)}
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="w-4 h-4 mr-1" />
                              Delete
                            </Button>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}

              {/* System Events */}
              {systemEvents.map(event => {
                const Icon = EVENT_TYPE_ICONS[event.type];
                
                return (
                  <Card key={event.id} className="border-l-4 border-l-muted">
                    <CardContent className="py-4">
                      <div className="flex items-start gap-3">
                        <div className={`p-2 rounded-lg ${
                          event.priority === 'high' ? 'bg-destructive/10 text-destructive' :
                          event.priority === 'medium' ? 'bg-warning/10 text-warning' :
                          'bg-muted text-muted-foreground'
                        }`}>
                          <Icon className="w-5 h-5" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-start justify-between mb-1">
                            <p className="font-bold">{event.title}</p>
                            {event.priority === 'high' && (
                              <Badge variant="destructive">Overdue</Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">{event.description}</p>
                          <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                            <Briefcase className="w-4 h-4" />
                            <span>{event.jobName}</span>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
