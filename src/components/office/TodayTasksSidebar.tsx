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
import { CheckCircle2, Calendar as CalendarIcon, AlertCircle, Clock, Briefcase, Eye, Edit, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { formatDateLocal, getTodayString } from '@/lib/date-utils';

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
  const [showCalendarView, setShowCalendarView] = useState(false);
  const [calendarTasks, setCalendarTasks] = useState<Task[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [showTaskDialog, setShowTaskDialog] = useState(false);
  const [showEventDialog, setShowEventDialog] = useState(false);
  const [users, setUsers] = useState<any[]>([]);

  const todayStr = getTodayString();

  useEffect(() => {
    loadTodayItems();
    loadUsers();

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

      console.log('Loading tasks for today:', todayStr);
      console.log('Today date parts:', todayStr.split('-'));

      // First, let's load ALL tasks to see what's in the database
      const { data: allTasksData, error: allTasksError } = await supabase
        .from('job_tasks')
        .select(`
          *,
          job:jobs(id, name, client_name, status),
          assigned_user:assigned_to(id, username, email)
        `)
        .not('due_date', 'is', null)
        .order('due_date', { ascending: true });

      if (allTasksError) {
        console.error('All tasks query error:', allTasksError);
      } else {
        console.log('=== ALL TASKS IN DATABASE (with due_date) ===');
        console.log('Total count:', allTasksData?.length || 0);
        (allTasksData || []).forEach((task, idx) => {
          console.log(`Task ${idx + 1}:`, {
            title: task.title,
            due_date: task.due_date,
            status: task.status,
            task_type: task.task_type,
            job_name: task.job?.name,
            job_status: task.job?.status,
          });
        });
      }

      // Load office and shop tasks only (exclude field tasks) - due today OR overdue that are not completed from active/quoting/on hold jobs
      const { data: tasksData, error: tasksError } = await supabase
        .from('job_tasks')
        .select(`
          *,
          job:jobs!inner(id, name, client_name, status),
          assigned_user:assigned_to(id, username, email)
        `)
        .not('due_date', 'is', null)
        .lte('due_date', todayStr)
        .neq('status', 'completed')
        .neq('task_type', 'field')
        .in('jobs.status', ['active', 'quoting', 'on hold'])
        .order('due_date', { ascending: true })
        .order('priority', { ascending: false });

      if (tasksError) {
        console.error('Tasks query error:', tasksError);
        throw tasksError;
      }

      console.log('\n=== FILTERED TASKS (for today) ===');
      console.log('Number of tasks loaded:', tasksData?.length || 0);
      (tasksData || []).forEach((task, idx) => {
        console.log(`Task ${idx + 1}:`, {
          title: task.title,
          due_date: task.due_date,
          status: task.status,
          task_type: task.task_type,
          job_name: task.job?.name,
          job_status: task.job?.status,
        });
      });

      const filteredTasks = tasksData || [];

      console.log('Filtered tasks:', filteredTasks);
      console.log('Number of filtered tasks:', filteredTasks.length);

      // Load calendar events for today that are not completed from active/quoting/on hold jobs
      const { data: eventsData, error: eventsError } = await supabase
        .from('calendar_events')
        .select(`
          *,
          job:jobs!inner(id, name, client_name, status)
        `)
        .eq('event_date', todayStr)
        .is('completed_at', null)
        .in('jobs.status', ['active', 'quoting', 'on hold'])
        .order('start_time', { ascending: true });

      if (eventsError) {
        console.error('Events query error:', eventsError);
        throw eventsError;
      }

      const filteredEvents = eventsData || [];

      console.log('Final tasks to display:', filteredTasks.length);
      console.log('Final events to display:', filteredEvents.length);

      setTasks(filteredTasks);
      setEvents(filteredEvents);
    } catch (error) {
      console.error('Error loading today items:', error);
      toast.error('Failed to load today\'s tasks');
    } finally {
      setLoading(false);
    }
  }

  async function loadUsers() {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .order('username', { ascending: true });

      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      console.error('Error loading users:', error);
    }
  }

  async function handleDeleteTask(taskId: string) {
    if (!confirm('Are you sure you want to delete this task?')) return;

    try {
      const { error } = await supabase
        .from('job_tasks')
        .delete()
        .eq('id', taskId);

      if (error) throw error;
      toast.success('Task deleted');
      setShowTaskDialog(false);
      loadTodayItems();
    } catch (error) {
      console.error('Error deleting task:', error);
      toast.error('Failed to delete task');
    }
  }

  async function handleDeleteEvent(eventId: string) {
    if (!confirm('Are you sure you want to delete this event?')) return;

    try {
      const { error } = await supabase
        .from('calendar_events')
        .delete()
        .eq('id', eventId);

      if (error) throw error;
      toast.success('Event deleted');
      setShowEventDialog(false);
      loadTodayItems();
    } catch (error) {
      console.error('Error deleting event:', error);
      toast.error('Failed to delete event');
    }
  }

  async function loadAllCalendarItems() {
    try {
      // Load all upcoming tasks from active/quoting/on hold jobs
      const { data: tasksData, error: tasksError } = await supabase
        .from('job_tasks')
        .select(`
          *,
          job:jobs(id, name, client_name, status)
        `)
        .not('due_date', 'is', null)
        .neq('status', 'completed')
        .gte('due_date', todayStr)
        .order('due_date', { ascending: true });

      if (tasksError) throw tasksError;

      // Filter to only include tasks from active, quoting, or on hold jobs
      const filteredTasks = (tasksData || []).filter(
        task => task.job && ['active', 'quoting', 'on hold'].includes((task.job as any).status)
      );

      // Load all upcoming events from active/quoting/on hold jobs
      const { data: eventsData, error: eventsError } = await supabase
        .from('calendar_events')
        .select(`
          *,
          job:jobs(id, name, client_name, status)
        `)
        .is('completed_at', null)
        .gte('event_date', todayStr)
        .order('event_date', { ascending: true });

      if (eventsError) throw eventsError;

      // Filter to only include events from active, quoting, or on hold jobs
      const filteredEvents = (eventsData || []).filter(
        event => event.job && ['active', 'quoting', 'on hold'].includes((event.job as any).status)
      );

      setCalendarTasks(filteredTasks);
      setCalendarEvents(filteredEvents);
    } catch (error) {
      console.error('Error loading calendar items:', error);
      toast.error('Failed to load calendar');
    }
  }

  async function loadUsers() {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .order('username', { ascending: true });

      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      console.error('Error loading users:', error);
    }
  }

  async function handleDeleteTask(taskId: string) {
    if (!confirm('Are you sure you want to delete this task?')) return;

    try {
      const { error } = await supabase
        .from('job_tasks')
        .delete()
        .eq('id', taskId);

      if (error) throw error;
      toast.success('Task deleted');
      setShowTaskDialog(false);
      loadTodayItems();
    } catch (error) {
      console.error('Error deleting task:', error);
      toast.error('Failed to delete task');
    }
  }

  async function handleDeleteEvent(eventId: string) {
    if (!confirm('Are you sure you want to delete this event?')) return;

    try {
      const { error } = await supabase
        .from('calendar_events')
        .delete()
        .eq('id', eventId);

      if (error) throw error;
      toast.success('Event deleted');
      setShowEventDialog(false);
      loadTodayItems();
    } catch (error) {
      console.error('Error deleting event:', error);
      toast.error('Failed to delete event');
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

  async function loadUsers() {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .order('username', { ascending: true });

      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      console.error('Error loading users:', error);
    }
  }

  async function handleDeleteTask(taskId: string) {
    if (!confirm('Are you sure you want to delete this task?')) return;

    try {
      const { error } = await supabase
        .from('job_tasks')
        .delete()
        .eq('id', taskId);

      if (error) throw error;
      toast.success('Task deleted');
      setShowTaskDialog(false);
      loadTodayItems();
    } catch (error) {
      console.error('Error deleting task:', error);
      toast.error('Failed to delete task');
    }
  }

  async function handleDeleteEvent(eventId: string) {
    if (!confirm('Are you sure you want to delete this event?')) return;

    try {
      const { error } = await supabase
        .from('calendar_events')
        .delete()
        .eq('id', eventId);

      if (error) throw error;
      toast.success('Event deleted');
      setShowEventDialog(false);
      loadTodayItems();
    } catch (error) {
      console.error('Error deleting event:', error);
      toast.error('Failed to delete event');
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

  async function loadUsers() {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .order('username', { ascending: true });

      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      console.error('Error loading users:', error);
    }
  }

  async function handleDeleteTask(taskId: string) {
    if (!confirm('Are you sure you want to delete this task?')) return;

    try {
      const { error } = await supabase
        .from('job_tasks')
        .delete()
        .eq('id', taskId);

      if (error) throw error;
      toast.success('Task deleted');
      setShowTaskDialog(false);
      loadTodayItems();
    } catch (error) {
      console.error('Error deleting task:', error);
      toast.error('Failed to delete task');
    }
  }

  async function handleDeleteEvent(eventId: string) {
    if (!confirm('Are you sure you want to delete this event?')) return;

    try {
      const { error } = await supabase
        .from('calendar_events')
        .delete()
        .eq('id', eventId);

      if (error) throw error;
      toast.success('Event deleted');
      setShowEventDialog(false);
      loadTodayItems();
    } catch (error) {
      console.error('Error deleting event:', error);
      toast.error('Failed to delete event');
    }
  }

  async function handleReschedule() {
    if (!rescheduleItem || !newDate) return;

    try {
      const newDateStr = formatDateLocal(newDate);

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

  async function loadUsers() {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .order('username', { ascending: true });

      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      console.error('Error loading users:', error);
    }
  }

  async function handleDeleteTask(taskId: string) {
    if (!confirm('Are you sure you want to delete this task?')) return;

    try {
      const { error } = await supabase
        .from('job_tasks')
        .delete()
        .eq('id', taskId);

      if (error) throw error;
      toast.success('Task deleted');
      setShowTaskDialog(false);
      loadTodayItems();
    } catch (error) {
      console.error('Error deleting task:', error);
      toast.error('Failed to delete task');
    }
  }

  async function handleDeleteEvent(eventId: string) {
    if (!confirm('Are you sure you want to delete this event?')) return;

    try {
      const { error } = await supabase
        .from('calendar_events')
        .delete()
        .eq('id', eventId);

      if (error) throw error;
      toast.success('Event deleted');
      setShowEventDialog(false);
      loadTodayItems();
    } catch (error) {
      console.error('Error deleting event:', error);
      toast.error('Failed to delete event');
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
  }

  async function loadUsers() {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .order('username', { ascending: true });

      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      console.error('Error loading users:', error);
    }
  }

  async function handleDeleteTask(taskId: string) {
    if (!confirm('Are you sure you want to delete this task?')) return;

    try {
      const { error } = await supabase
        .from('job_tasks')
        .delete()
        .eq('id', taskId);

      if (error) throw error;
      toast.success('Task deleted');
      setShowTaskDialog(false);
      loadTodayItems();
    } catch (error) {
      console.error('Error deleting task:', error);
      toast.error('Failed to delete task');
    }
  }

  async function handleDeleteEvent(eventId: string) {
    if (!confirm('Are you sure you want to delete this event?')) return;

    try {
      const { error } = await supabase
        .from('calendar_events')
        .delete()
        .eq('id', eventId);

      if (error) throw error;
      toast.success('Event deleted');
      setShowEventDialog(false);
      loadTodayItems();
    } catch (error) {
      console.error('Error deleting event:', error);
      toast.error('Failed to delete event');
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
      <Card className="h-full flex flex-col bg-gradient-to-br from-slate-50 via-white to-slate-50 border-2 border-slate-200 shadow-xl">
        <CardHeader className="pb-3 bg-gradient-to-r from-slate-900 via-black to-slate-900 text-white rounded-t-lg border-b-4 border-yellow-500">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="w-5 h-5 text-yellow-400" />
              Office Tasks
            </CardTitle>
            <Badge className="bg-yellow-500 text-black font-bold text-sm border-2 border-yellow-400">
              {totalItems}
            </Badge>
          </div>
          <p className="text-xs text-slate-300 font-medium">
            {(() => {
              // Use the same date string that's used for the query to ensure consistency
              const parts = todayStr.split('-'); // todayStr is in YYYY-MM-DD format
              const year = parseInt(parts[0]);
              const month = parseInt(parts[1]) - 1; // Month is 0-indexed
              const day = parseInt(parts[2]);
              const displayDate = new Date(year, month, day);
              return displayDate.toLocaleDateString('en-US', { 
                weekday: 'long', 
                month: 'short', 
                day: 'numeric',
                year: 'numeric'
              });
            })()}
          </p>
          <p className="text-xs text-yellow-300 font-medium mt-1">
            Office & shop tasks due today or overdue
          </p>
          <Button
            variant="outline"
            size="sm"
            className="w-full mt-2 bg-yellow-500 hover:bg-yellow-600 text-black font-semibold border-2 border-yellow-400 shadow-md"
            onClick={() => {
              loadAllCalendarItems();
              setShowCalendarView(true);
            }}
          >
            <Eye className="w-4 h-4 mr-2" />
            View All Tasks Calendar
          </Button>
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto space-y-3">
          {totalItems === 0 ? (
            <div className="text-center py-8">
              <CheckCircle2 className="w-12 h-12 mx-auto text-green-500 mb-2" />
              <p className="text-sm font-medium">All caught up!</p>
              <p className="text-xs text-muted-foreground">No overdue or due tasks</p>
            </div>
          ) : (
            <>
              {/* Job Tasks */}
              {tasks.map((task) => {
                const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'completed';
                const isDueToday = task.due_date === todayStr;
                
                return (
                <div
                  key={task.id}
                  onClick={() => {
                    setSelectedTask(task);
                    setShowTaskDialog(true);
                  }}
                  className={`border-2 rounded-lg p-3 space-y-2 hover:shadow-lg transition-all cursor-pointer ${
                    isOverdue 
                      ? 'border-red-900 bg-red-50 hover:border-red-700' 
                      : 'border-slate-200 bg-white hover:border-yellow-500'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <Checkbox
                      checked={false}
                      onCheckedChange={() => handleCompleteTask(task.id)}
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      {/* Job Name - Prominent Display */}
                      {task.job ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onJobSelect?.(task.job_id);
                          }}
                          className={`flex items-center gap-2 mb-2 text-base font-extrabold hover:underline ${
                            isOverdue ? 'text-red-900 hover:text-red-700' : 'text-green-800 hover:text-green-600'
                          }`}
                        >
                          <Briefcase className="w-5 h-5 flex-shrink-0" />
                          {task.job.name}
                        </button>
                      ) : (
                        <div className="flex items-center gap-2 mb-2 text-base font-extrabold text-slate-500">
                          <Briefcase className="w-5 h-5 flex-shrink-0" />
                          (No Job Linked)
                        </div>
                      )}
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        {isOverdue && (
                          <Badge variant="destructive" className="bg-red-900 text-white font-bold border-2 border-red-950">
                            <AlertCircle className="w-3 h-3 mr-1" />
                            OVERDUE
                          </Badge>
                        )}
                        {isDueToday && !isOverdue && (
                          <Badge className="bg-yellow-500 text-black font-bold border-2 border-yellow-600">
                            <Clock className="w-3 h-3 mr-1" />
                            DUE TODAY
                          </Badge>
                        )}
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
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="flex-1 text-xs h-7"
                      onClick={(e) => {
                        e.stopPropagation();
                        setRescheduleItem({ type: 'task', item: task });
                      }}
                    >
                      <CalendarIcon className="w-3 h-3 mr-1" />
                      Reschedule
                    </Button>
                  </div>
                </div>
              );
              })}

              {/* Calendar Events */}
              {events.map((event) => (
                <div
                  key={event.id}
                  onClick={() => {
                    setSelectedEvent(event);
                    setShowEventDialog(true);
                  }}
                  className="border-2 border-slate-200 rounded-lg p-3 space-y-2 hover:shadow-lg hover:border-yellow-500 transition-all bg-white border-l-4 border-l-yellow-500 cursor-pointer"
                >
                  <div className="flex items-start gap-2">
                    <Checkbox
                      checked={false}
                      onCheckedChange={() => handleCompleteEvent(event.id)}
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      {/* Job Name - Prominent Display */}
                      {event.job ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onJobSelect?.(event.job_id);
                          }}
                          className="flex items-center gap-2 mb-2 text-base font-extrabold text-yellow-800 hover:text-yellow-600 hover:underline"
                        >
                          <Briefcase className="w-5 h-5 flex-shrink-0" />
                          {event.job.name}
                        </button>
                      ) : (
                        <div className="flex items-center gap-2 mb-2 text-base font-extrabold text-slate-500">
                          <Briefcase className="w-5 h-5 flex-shrink-0" />
                          (No Job Linked)
                        </div>
                      )}
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
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="flex-1 text-xs h-7"
                      onClick={(e) => {
                        e.stopPropagation();
                        setRescheduleItem({ type: 'event', item: event });
                      }}
                    >
                      <CalendarIcon className="w-3 h-3 mr-1" />
                      Reschedule
                    </Button>
                  </div>
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

      {/* Calendar View Dialog */}
      <Dialog open={showCalendarView} onOpenChange={setShowCalendarView}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarIcon className="w-5 h-5" />
              Tasks & Events Calendar
            </DialogTitle>
          </DialogHeader>
          <div className="grid md:grid-cols-2 gap-6">
            {/* Calendar */}
            <div>
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={setSelectedDate}
                className="rounded-md border"
                modifiers={{
                  hasItems: (date) => {
                    const dateStr = formatDateLocal(date);
                    return calendarTasks.some(t => t.due_date === dateStr) ||
                           calendarEvents.some(e => e.event_date === dateStr);
                  }
                }}
                modifiersStyles={{
                  hasItems: {
                    fontWeight: 'bold',
                    backgroundColor: '#22c55e',
                    color: 'white',
                    borderRadius: '50%',
                  }
                }}
              />
            </div>

            {/* Items for selected date */}
            <div className="space-y-3">
              {selectedDate ? (
                <>
                  <h3 className="font-semibold text-sm">
                    {selectedDate.toLocaleDateString('en-US', {
                      weekday: 'long',
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </h3>
                  {(() => {
                    const dateStr = formatDateLocal(selectedDate);
                    const dayTasks = calendarTasks.filter(t => t.due_date === dateStr);
                    const dayEvents = calendarEvents.filter(e => e.event_date === dateStr);
                    const totalDayItems = dayTasks.length + dayEvents.length;

                    if (totalDayItems === 0) {
                      return (
                        <div className="text-center py-8 text-muted-foreground">
                          <p className="text-sm">No tasks or events scheduled</p>
                        </div>
                      );
                    }

                    return (
                      <div className="space-y-2 max-h-96 overflow-y-auto">
                        {/* Tasks */}
                        {dayTasks.map(task => (
                          <Card key={task.id} className="border-l-4 border-l-blue-500">
                            <CardContent className="p-3">
                              <div className="flex items-center gap-2 mb-1">
                                <Badge variant="secondary" className="text-xs">
                                  Task
                                </Badge>
                                <Badge className={getPriorityColor(task.priority) + ' text-xs'}>
                                  {task.priority}
                                </Badge>
                              </div>
                              <p className="font-medium text-sm">{task.title}</p>
                              {task.description && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  {task.description}
                                </p>
                              )}
                              {task.job && (
                                <button
                                  onClick={() => {
                                    onJobSelect?.(task.job_id);
                                    setShowCalendarView(false);
                                  }}
                                  className="flex items-center gap-1 text-xs text-primary hover:underline mt-2"
                                >
                                  <Briefcase className="w-3 h-3" />
                                  {task.job.name}
                                </button>
                              )}
                            </CardContent>
                          </Card>
                        ))}

                        {/* Events */}
                        {dayEvents.map(event => (
                          <Card key={event.id} className="border-l-4 border-l-green-500">
                            <CardContent className="p-3">
                              <Badge variant="secondary" className="text-xs mb-2">
                                {event.event_type}
                              </Badge>
                              <p className="font-medium text-sm">{event.title}</p>
                              {event.description && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  {event.description}
                                </p>
                              )}
                              {event.job && (
                                <button
                                  onClick={() => {
                                    onJobSelect?.(event.job_id);
                                    setShowCalendarView(false);
                                  }}
                                  className="flex items-center gap-1 text-xs text-primary hover:underline mt-2"
                                >
                                  <Briefcase className="w-3 h-3" />
                                  {event.job.name}
                                </button>
                              )}
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    );
                  })()}
                </>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <CalendarIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">Select a date to view tasks and events</p>
                  <p className="text-xs mt-1">Dates with items are highlighted in green</p>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Task Details Dialog */}
      <Dialog open={showTaskDialog} onOpenChange={setShowTaskDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>Task Details</span>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (selectedTask) {
                      handleCompleteTask(selectedTask.id);
                      setShowTaskDialog(false);
                    }
                  }}
                  className="text-green-600 hover:text-green-700"
                >
                  <CheckCircle2 className="w-4 h-4 mr-1" />
                  Complete
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (selectedTask) {
                      handleDeleteTask(selectedTask.id);
                    }
                  }}
                  className="text-red-600 hover:text-red-700"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </DialogTitle>
          </DialogHeader>
          {selectedTask && (
            <div className="space-y-4">
              {/* Job Info */}
              {selectedTask.job && (
                <div className="p-4 bg-green-50 border-2 border-green-200 rounded-lg">
                  <p className="text-xs text-green-700 font-semibold mb-1">Job</p>
                  <button
                    onClick={() => {
                      onJobSelect?.(selectedTask.job_id);
                      setShowTaskDialog(false);
                    }}
                    className="flex items-center gap-2 text-lg font-bold text-green-900 hover:text-green-700 hover:underline"
                  >
                    <Briefcase className="w-5 h-5" />
                    {selectedTask.job.name}
                  </button>
                  <p className="text-sm text-green-700 mt-1">{selectedTask.job.client_name}</p>
                </div>
              )}

              {/* Task Title */}
              <div>
                <p className="text-xs text-muted-foreground font-semibold mb-1">Title</p>
                <p className="text-lg font-bold">{selectedTask.title}</p>
              </div>

              {/* Description */}
              {selectedTask.description && (
                <div>
                  <p className="text-xs text-muted-foreground font-semibold mb-1">Description</p>
                  <p className="text-sm">{selectedTask.description}</p>
                </div>
              )}

              {/* Badges */}
              <div className="flex flex-wrap gap-2">
                <div>
                  <p className="text-xs text-muted-foreground font-semibold mb-1">Status</p>
                  <Badge variant="secondary" className="capitalize">{selectedTask.status.replace('_', ' ')}</Badge>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-semibold mb-1">Priority</p>
                  <Badge 
                    className={selectedTask.priority === 'high' || selectedTask.priority === 'urgent' 
                      ? 'bg-red-500 text-white' 
                      : selectedTask.priority === 'medium' 
                        ? 'bg-yellow-500 text-black' 
                        : 'bg-blue-500 text-white'
                    }
                  >
                    {selectedTask.priority}
                  </Badge>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-semibold mb-1">Type</p>
                  <Badge variant="outline" className="capitalize">{selectedTask.task_type}</Badge>
                </div>
              </div>

              {/* Due Date */}
              {selectedTask.due_date && (
                <div>
                  <p className="text-xs text-muted-foreground font-semibold mb-1">Due Date</p>
                  <div className="flex items-center gap-2">
                    <CalendarIcon className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium">
                      {new Date(selectedTask.due_date).toLocaleDateString('en-US', {
                        weekday: 'long',
                        month: 'long',
                        day: 'numeric',
                        year: 'numeric'
                      })}
                    </span>
                    {selectedTask.due_date && new Date(selectedTask.due_date) < new Date() && selectedTask.status !== 'completed' && (
                      <Badge variant="destructive" className="ml-2">
                        <AlertCircle className="w-3 h-3 mr-1" />
                        OVERDUE
                      </Badge>
                    )}
                  </div>
                </div>
              )}

              {/* Assigned To */}
              {selectedTask.assigned_to && (
                <div>
                  <p className="text-xs text-muted-foreground font-semibold mb-1">Assigned To</p>
                  <p className="text-sm">{users.find(u => u.id === selectedTask.assigned_to)?.username || users.find(u => u.id === selectedTask.assigned_to)?.email || 'Unknown'}</p>
                </div>
              )}

              {/* Timestamps */}
              <div className="pt-4 border-t space-y-2 text-xs text-muted-foreground">
                <p>Created: {new Date(selectedTask.created_at).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit'
                })}</p>
                {selectedTask.status === 'completed' && (
                  <p>Completed: {new Date(selectedTask.created_at).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit'
                  })}</p>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowTaskDialog(false);
                    setRescheduleItem({ type: 'task', item: selectedTask });
                  }}
                  className="flex-1"
                >
                  <CalendarIcon className="w-4 h-4 mr-2" />
                  Reschedule
                </Button>
                <Button
                  variant="outline"
                  onClick={() => onJobSelect?.(selectedTask.job_id)}
                  className="flex-1"
                >
                  <Briefcase className="w-4 h-4 mr-2" />
                  View Job
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Event Details Dialog */}
      <Dialog open={showEventDialog} onOpenChange={setShowEventDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>Event Details</span>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (selectedEvent) {
                      handleCompleteEvent(selectedEvent.id);
                      setShowEventDialog(false);
                    }
                  }}
                  className="text-green-600 hover:text-green-700"
                >
                  <CheckCircle2 className="w-4 h-4 mr-1" />
                  Complete
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (selectedEvent) {
                      handleDeleteEvent(selectedEvent.id);
                    }
                  }}
                  className="text-red-600 hover:text-red-700"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </DialogTitle>
          </DialogHeader>
          {selectedEvent && (
            <div className="space-y-4">
              {/* Job Info */}
              {selectedEvent.job && (
                <div className="p-4 bg-yellow-50 border-2 border-yellow-200 rounded-lg">
                  <p className="text-xs text-yellow-700 font-semibold mb-1">Job</p>
                  <button
                    onClick={() => {
                      onJobSelect?.(selectedEvent.job_id);
                      setShowEventDialog(false);
                    }}
                    className="flex items-center gap-2 text-lg font-bold text-yellow-900 hover:text-yellow-700 hover:underline"
                  >
                    <Briefcase className="w-5 h-5" />
                    {selectedEvent.job.name}
                  </button>
                  <p className="text-sm text-yellow-700 mt-1">{selectedEvent.job.client_name}</p>
                </div>
              )}

              {/* Event Title */}
              <div>
                <p className="text-xs text-muted-foreground font-semibold mb-1">Title</p>
                <p className="text-lg font-bold">{selectedEvent.title}</p>
              </div>

              {/* Description */}
              {selectedEvent.description && (
                <div>
                  <p className="text-xs text-muted-foreground font-semibold mb-1">Description</p>
                  <p className="text-sm">{selectedEvent.description}</p>
                </div>
              )}

              {/* Event Type */}
              <div>
                <p className="text-xs text-muted-foreground font-semibold mb-1">Event Type</p>
                <Badge variant="secondary" className="capitalize">{selectedEvent.event_type.replace('_', ' ')}</Badge>
              </div>

              {/* Event Date */}
              <div>
                <p className="text-xs text-muted-foreground font-semibold mb-1">Date</p>
                <div className="flex items-center gap-2">
                  <CalendarIcon className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium">
                    {new Date(selectedEvent.event_date).toLocaleDateString('en-US', {
                      weekday: 'long',
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric'
                    })}
                  </span>
                </div>
              </div>

              {/* Timestamps */}
              <div className="pt-4 border-t space-y-2 text-xs text-muted-foreground">
                {selectedEvent.completed_at && (
                  <p>Completed: {new Date(selectedEvent.completed_at).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit'
                  })}</p>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowEventDialog(false);
                    setRescheduleItem({ type: 'event', item: selectedEvent });
                  }}
                  className="flex-1"
                >
                  <CalendarIcon className="w-4 h-4 mr-2" />
                  Reschedule
                </Button>
                <Button
                  variant="outline"
                  onClick={() => onJobSelect?.(selectedEvent.job_id)}
                  className="flex-1"
                >
                  <Briefcase className="w-4 h-4 mr-2" />
                  View Job
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
