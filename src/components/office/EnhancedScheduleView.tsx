import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar as CalendarIcon, Users, ListTodo, Plus, CheckCircle2, Edit, Trash2 } from 'lucide-react';
import { SubcontractorScheduling } from './SubcontractorScheduling';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { parseDateLocal } from '@/lib/date-utils';

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
  assigned_user?: {
    id: string;
    username: string;
    email: string;
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

interface Schedule {
  id: string;
  subcontractor_id: string;
  job_id: string;
  start_date: string;
  end_date: string | null;
  work_description: string | null;
  status: string;
  subcontractors: {
    name: string;
    trades: string[] | null;
  };
  jobs: {
    name: string;
  };
}

export function EnhancedScheduleView() {
  const { profile } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState<'week' | 'month' | 'all'>('week');

  useEffect(() => {
    loadAllData();
  }, []);

  async function loadAllData() {
    try {
      setLoading(true);
      await Promise.all([
        loadTasks(),
        loadEvents(),
        loadSchedules(),
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function loadTasks() {
    try {
      const { data, error } = await supabase
        .from('job_tasks')
        .select(`
          *,
          jobs(id, name, client_name),
          assigned_user:assigned_to(id, username, email)
        `)
        .not('due_date', 'is', null)
        .neq('status', 'completed')
        .order('due_date', { ascending: true });

      if (error) throw error;
      setTasks(data || []);
    } catch (error) {
      console.error('Error loading tasks:', error);
    }
  }

  async function loadEvents() {
    try {
      const { data, error } = await supabase
        .from('calendar_events')
        .select(`
          *,
          jobs(id, name, client_name)
        `)
        .is('completed_at', null)
        .order('event_date', { ascending: true });

      if (error) throw error;
      setEvents(data || []);
    } catch (error) {
      console.error('Error loading events:', error);
    }
  }

  async function loadSchedules() {
    try {
      const { data, error } = await supabase
        .from('subcontractor_schedules')
        .select(`
          *,
          subcontractors(name, trades),
          jobs(name)
        `)
        .eq('status', 'scheduled')
        .order('start_date', { ascending: true });

      if (error) throw error;
      setSchedules(data || []);
    } catch (error) {
      console.error('Error loading schedules:', error);
    }
  }

  const getDateRange = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    let endDate = new Date(today);
    if (dateFilter === 'week') {
      endDate.setDate(endDate.getDate() + 7);
    } else if (dateFilter === 'month') {
      endDate.setDate(endDate.getDate() + 30);
    } else {
      endDate.setFullYear(endDate.getFullYear() + 1);
    }
    
    return { start: today, end: endDate };
  };

  const filterByDate = (dateStr: string) => {
    if (dateFilter === 'all') return true;
    const date = new Date(dateStr);
    const { start, end } = getDateRange();
    return date >= start && date <= end;
  };

  const filteredTasks = tasks.filter(t => filterByDate(t.due_date));
  const filteredEvents = events.filter(e => filterByDate(e.event_date));
  const filteredSchedules = schedules.filter(s => filterByDate(s.start_date));

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return 'bg-red-500 text-white';
      case 'high':
        return 'bg-orange-500 text-white';
      case 'medium':
        return 'bg-blue-500 text-white';
      default:
        return 'bg-gray-500 text-white';
    }
  };

  // Group items by date
  const itemsByDate = new Map<string, { tasks: Task[]; events: CalendarEvent[]; schedules: Schedule[] }>();

  filteredTasks.forEach(task => {
    const key = task.due_date;
    if (!itemsByDate.has(key)) {
      itemsByDate.set(key, { tasks: [], events: [], schedules: [] });
    }
    itemsByDate.get(key)!.tasks.push(task);
  });

  filteredEvents.forEach(event => {
    const key = event.event_date;
    if (!itemsByDate.has(key)) {
      itemsByDate.set(key, { tasks: [], events: [], schedules: [] });
    }
    itemsByDate.get(key)!.events.push(event);
  });

  filteredSchedules.forEach(schedule => {
    const key = schedule.start_date;
    if (!itemsByDate.has(key)) {
      itemsByDate.set(key, { tasks: [], events: [], schedules: [] });
    }
    itemsByDate.get(key)!.schedules.push(schedule);
  });

  const sortedDates = Array.from(itemsByDate.keys()).sort();

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">Loading schedule...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-green-900 tracking-tight">Master Schedule</h2>
          <p className="text-black">Tasks, events, and subcontractor work</p>
        </div>
      </div>

      <Tabs defaultValue="timeline" className="w-full">
        <TabsList className="grid w-full grid-cols-2 bg-white border-2 border-slate-300 rounded-none">
          <TabsTrigger value="timeline" className="rounded-none data-[state=active]:bg-green-900 data-[state=active]:text-white">
            <CalendarIcon className="w-4 h-4 mr-2" />
            Timeline View
          </TabsTrigger>
          <TabsTrigger value="subcontractors" className="rounded-none data-[state=active]:bg-green-900 data-[state=active]:text-white">
            <Users className="w-4 h-4 mr-2" />
            Subcontractors
          </TabsTrigger>
        </TabsList>

        <TabsContent value="timeline" className="space-y-4 mt-4">
          {/* Date Filter */}
          <div className="flex gap-2">
            <Button
              variant={dateFilter === 'week' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setDateFilter('week')}
            >
              Next 7 Days
            </Button>
            <Button
              variant={dateFilter === 'month' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setDateFilter('month')}
            >
              Next 30 Days
            </Button>
            <Button
              variant={dateFilter === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setDateFilter('all')}
            >
              All Upcoming
            </Button>
          </div>

          {/* Timeline */}
          {sortedDates.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <CalendarIcon className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No scheduled items found</p>
                <p className="text-sm mt-1">Tasks and events will appear here</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {sortedDates.map(dateStr => {
                const date = parseDateLocal(dateStr);
                const items = itemsByDate.get(dateStr)!;
                const totalItems = items.tasks.length + items.events.length + items.schedules.length;
                
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const isToday = date.toDateString() === today.toDateString();
                const isPast = date < today && !isToday;

                return (
                  <Card key={dateStr} className={isToday ? 'border-primary border-2' : isPast ? 'opacity-60' : ''}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="text-lg flex items-center gap-2">
                            <CalendarIcon className="w-5 h-5" />
                            {date.toLocaleDateString('en-US', {
                              weekday: 'long',
                              month: 'long',
                              day: 'numeric',
                              year: 'numeric',
                            })}
                            {isToday && (
                              <Badge variant="default" className="ml-2">Today</Badge>
                            )}
                          </CardTitle>
                        </div>
                        <Badge variant="secondary">{totalItems} items</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {/* Tasks */}
                      {items.tasks.map(task => (
                        <div
                          key={task.id}
                          className="border-l-4 border-l-blue-500 bg-blue-50 rounded-r-lg p-3 space-y-1"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <ListTodo className="w-4 h-4 text-blue-600 flex-shrink-0" />
                                <p className="font-medium text-sm">Task: {task.title}</p>
                              </div>
                              {task.description && (
                                <p className="text-xs text-muted-foreground ml-6">
                                  {task.description}
                                </p>
                              )}
                              <div className="flex items-center gap-2 ml-6 mt-1">
                                {task.job && (
                                  <p className="text-xs text-muted-foreground">
                                    Job: {task.job.name}
                                  </p>
                                )}
                                {task.assigned_user && (
                                  <Badge variant="outline" className="text-xs">
                                    {task.assigned_user.username}
                                  </Badge>
                                )}
                                <Badge className={getPriorityColor(task.priority) + ' text-xs'}>
                                  {task.priority}
                                </Badge>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}

                      {/* Events */}
                      {items.events.map(event => (
                        <div
                          key={event.id}
                          className="border-l-4 border-l-green-500 bg-green-50 rounded-r-lg p-3 space-y-1"
                        >
                          <div className="flex items-start gap-2">
                            <CalendarIcon className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm">{event.title}</p>
                              {event.description && (
                                <p className="text-xs text-muted-foreground">
                                  {event.description}
                                </p>
                              )}
                              {event.job && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  Job: {event.job.name}
                                </p>
                              )}
                              <Badge variant="outline" className="text-xs mt-1">
                                {event.event_type}
                              </Badge>
                            </div>
                          </div>
                        </div>
                      ))}

                      {/* Subcontractor Schedules */}
                      {items.schedules.map(schedule => (
                        <div
                          key={schedule.id}
                          className="border-l-4 border-l-purple-500 bg-purple-50 rounded-r-lg p-3 space-y-1"
                        >
                          <div className="flex items-start gap-2">
                            <Users className="w-4 h-4 text-purple-600 flex-shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm">
                                {schedule.jobs.name}{schedule.work_description ? `: ${schedule.work_description}` : ''}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="subcontractors" className="mt-4">
          <SubcontractorScheduling />
        </TabsContent>
      </Tabs>
    </div>
  );
}
