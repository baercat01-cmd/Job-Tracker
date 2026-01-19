import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar } from '@/components/ui/calendar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { CheckCircle2, Calendar as CalendarIcon, AlertCircle, Clock, Briefcase } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';

interface Task {
  id: string;
  title: string;
  description: string | null;
  due_date: string;
  priority: string;
  status: string;
  job_id: string;
  task_type: string;
  job?: {
    id: string;
    name: string;
    client_name: string;
  };
}

interface CalendarEvent {
  id: string;
  title: string;
  description: string | null;
  event_date: string;
  event_type: string;
  job_id: string;
  completed_at: string | null;
  job?: {
    id: string;
    name: string;
    client_name: string;
  };
}

interface TodayTasksSidebarProps {
  onJobSelect?: (jobId: string) => void;
}

export function TodayTasksSidebar({ onJobSelect }: TodayTasksSidebarProps) {
  const { profile } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [rescheduleItem, setRescheduleItem] = useState<{ type: 'task' | 'event'; item: any } | null>(null);
  const [newDate, setNewDate] = useState<Date | undefined>(undefined);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split('T')[0];

  useEffect(() => {
    loadTodayItems();

    // Subscribe to changes
    const tasksChannel = supabase
      .channel('today_tasks_changes')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'job_tasks' },
        () => loadTodayItems()
      )
      .subscribe();

    const eventsChannel = supabase
      .channel('today_events_changes')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'calendar_events' },
        () => loadTodayItems()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(tasksChannel);
      supabase.removeChannel(eventsChannel);
    };
  }, []);

  async function loadTodayItems() {
    try {
      setLoading(true);

      // Load tasks due today that are not completed
      const { data: tasksData, error: tasksError } = await supabase
        .from('job_tasks')
        .select(`
          *,
          jobs(id, name, client_name)
        `)
        .eq('due_date', todayStr)
        .neq('status', 'completed')
        .order('priority', { ascending: false });

      if (tasksError) throw tasksError;

      // Load calendar events for today that are not completed
      const { data: eventsData, error: eventsError } = await supabase
        .from('calendar_events')
        .select(`
          *,
          jobs(id, name, client_name)
        `)
        .eq('event_date', todayStr)
        .is('completed_at', null)
        .order('start_time', { ascending: true });

      if (eventsError) throw eventsError;

      setTasks(tasksData || []);
      setEvents(eventsData || []);
    } catch (error) {
      console.error('Error loading today items:', error);
      toast.error('Failed to load today\'s tasks');
    } finally {
      setLoading(false);
    }
  }

  async function handleCompleteTask(taskId: string) {
    try {
      const { error } = await supabase
        .from('job_tasks')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          completed_by: profile?.id,
        })
        .eq('id', taskId);

      if (error) throw error;
      toast.success('Task completed');
      loadTodayItems();
    } catch (error) {
      console.error('Error completing task:', error);
      toast.error('Failed to complete task');
    }
  }

  async function handleCompleteEvent(eventId: string) {
    try {
      const { error } = await supabase
        .from('calendar_events')
        .update({
          completed_at: new Date().toISOString(),
          completed_by: profile?.id,
        })
        .eq('id', eventId);

      if (error) throw error;
      toast.success('Event completed');
      loadTodayItems();
    } catch (error) {
      console.error('Error completing event:', error);
      toast.error('Failed to complete event');
    }
  }

  async function handleReschedule() {
    if (!rescheduleItem || !newDate) return;

    try {
      const newDateStr = newDate.toISOString().split('T')[0];

      if (rescheduleItem.type === 'task') {
        const { error } = await supabase
          .from('job_tasks')
          .update({ due_date: newDateStr, updated_at: new Date().toISOString() })
          .eq('id', rescheduleItem.item.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('calendar_events')
          .update({ event_date: newDateStr, updated_at: new Date().toISOString() })
          .eq('id', rescheduleItem.item.id);

        if (error) throw error;
      }

      toast.success('Item rescheduled');
      setRescheduleItem(null);
      setNewDate(undefined);
      loadTodayItems();
    } catch (error) {
      console.error('Error rescheduling:', error);
      toast.error('Failed to reschedule');
    }
  }

  const totalItems = tasks.length + events.length;

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'bg-red-500';
      case 'medium':
        return 'bg-yellow-500';
      default:
        return 'bg-blue-500';
    }
  };

  if (loading) {
    return (
      <Card className="h-full">
        <CardContent className="py-12 text-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">Loading tasks...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="h-full flex flex-col">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Today's Tasks
            </CardTitle>
            <Badge variant="secondary" className="text-sm">
              {totalItems}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            {new Date().toLocaleDateString('en-US', { 
              weekday: 'long', 
              month: 'short', 
              day: 'numeric' 
            })}
          </p>
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto space-y-3">
          {totalItems === 0 ? (
            <div className="text-center py-8">
              <CheckCircle2 className="w-12 h-12 mx-auto text-green-500 mb-2" />
              <p className="text-sm font-medium">All caught up!</p>
              <p className="text-xs text-muted-foreground">No tasks due today</p>
            </div>
          ) : (
            <>
              {/* Job Tasks */}
              {tasks.map((task) => (
                <div
                  key={task.id}
                  className="border rounded-lg p-3 space-y-2 hover:shadow-md transition-shadow bg-card"
                >
                  <div className="flex items-start gap-2">
                    <Checkbox
                      checked={false}
                      onCheckedChange={() => handleCompleteTask(task.id)}
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge
                          variant="secondary"
                          className={`${getPriorityColor(task.priority)} text-white text-xs`}
                        >
                          {task.priority}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {task.task_type}
                        </Badge>
                      </div>
                      <p className="font-medium text-sm line-clamp-2">{task.title}</p>
                      {task.description && (
                        <p className="text-xs text-muted-foreground line-clamp-1">
                          {task.description}
                        </p>
                      )}
                      {task.job && (
                        <button
                          onClick={() => onJobSelect?.(task.job_id)}
                          className="flex items-center gap-1 text-xs text-primary hover:underline mt-1"
                        >
                          <Briefcase className="w-3 h-3" />
                          {task.job.name}
                        </button>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-xs h-7"
                    onClick={() => setRescheduleItem({ type: 'task', item: task })}
                  >
                    <CalendarIcon className="w-3 h-3 mr-1" />
                    Reschedule
                  </Button>
                </div>
              ))}

              {/* Calendar Events */}
              {events.map((event) => (
                <div
                  key={event.id}
                  className="border rounded-lg p-3 space-y-2 hover:shadow-md transition-shadow bg-card border-l-4 border-l-primary"
                >
                  <div className="flex items-start gap-2">
                    <Checkbox
                      checked={false}
                      onCheckedChange={() => handleCompleteEvent(event.id)}
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="secondary" className="text-xs">
                          {event.event_type}
                        </Badge>
                      </div>
                      <p className="font-medium text-sm line-clamp-2">{event.title}</p>
                      {event.description && (
                        <p className="text-xs text-muted-foreground line-clamp-1">
                          {event.description}
                        </p>
                      )}
                      {event.job && (
                        <button
                          onClick={() => onJobSelect?.(event.job_id)}
                          className="flex items-center gap-1 text-xs text-primary hover:underline mt-1"
                        >
                          <Briefcase className="w-3 h-3" />
                          {event.job.name}
                        </button>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-xs h-7"
                    onClick={() => setRescheduleItem({ type: 'event', item: event })}
                  >
                    <CalendarIcon className="w-3 h-3 mr-1" />
                    Reschedule
                  </Button>
                </div>
              ))}
            </>
          )}
        </CardContent>
      </Card>

      {/* Reschedule Dialog */}
      <Dialog open={!!rescheduleItem} onOpenChange={() => setRescheduleItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reschedule Item</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <p className="font-medium text-sm mb-2">
                {rescheduleItem?.item.title}
              </p>
              <p className="text-xs text-muted-foreground">
                Select a new date for this {rescheduleItem?.type === 'task' ? 'task' : 'event'}
              </p>
            </div>
            <Calendar
              mode="single"
              selected={newDate}
              onSelect={setNewDate}
              disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
              className="rounded-md border"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRescheduleItem(null)}>
              Cancel
            </Button>
            <Button onClick={handleReschedule} disabled={!newDate}>
              Reschedule
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
