import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Calendar as CalendarIcon, 
  ChevronLeft, 
  ChevronRight, 
  Package, 
  ListChecks, 
  Truck, 
  AlertCircle,
  Filter,
  X
} from 'lucide-react';
import { toast } from 'sonner';
import { EventDetailsDialog } from './EventDetailsDialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface CalendarEvent {
  id: string;
  type: 'material_order' | 'material_delivery' | 'material_pull' | 'task_deadline' | 'task_completed';
  date: string;
  jobId: string;
  jobName: string;
  jobColor: string;
  title: string;
  description: string;
  status?: string;
  priority?: 'low' | 'medium' | 'high';
  materialId?: string;
}

interface MasterCalendarProps {
  onJobSelect: (jobId: string) => void;
}

// Generate consistent color for each job
function getJobColor(jobName: string): string {
  const colors = [
    '#ef4444', // red
    '#f97316', // orange
    '#eab308', // yellow
    '#22c55e', // green
    '#06b6d4', // cyan
    '#3b82f6', // blue
    '#8b5cf6', // purple
    '#ec4899', // pink
  ];
  
  let hash = 0;
  for (let i = 0; i < jobName.length; i++) {
    hash = jobName.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  return colors[Math.abs(hash) % colors.length];
}

export function MasterCalendar({ onJobSelect }: MasterCalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [showEventDialog, setShowEventDialog] = useState(false);
  const [filterJob, setFilterJob] = useState<string>('all');
  const [filterTrade, setFilterTrade] = useState<string>('all');
  const [jobs, setJobs] = useState<any[]>([]);
  const [components, setComponents] = useState<any[]>([]);

  useEffect(() => {
    loadJobs();
    loadComponents();
  }, []);

  useEffect(() => {
    loadCalendarEvents();
  }, [currentDate, filterJob, filterTrade]);

  async function loadJobs() {
    try {
      const { data, error } = await supabase
        .from('jobs')
        .select('id, name, client_name')
        .eq('status', 'active')
        .order('name');

      if (error) throw error;
      setJobs(data || []);
    } catch (error) {
      console.error('Error loading jobs:', error);
    }
  }

  async function loadComponents() {
    try {
      const { data, error } = await supabase
        .from('components')
        .select('id, name')
        .eq('archived', false)
        .order('name');

      if (error) throw error;
      setComponents(data || []);
    } catch (error) {
      console.error('Error loading components:', error);
    }
  }

  async function loadCalendarEvents() {
    try {
      setLoading(true);
      const events: CalendarEvent[] = [];

      // Build job filter
      let jobQuery = supabase
        .from('materials')
        .select(`
          id,
          name,
          job_id,
          order_by_date,
          delivery_date,
          pull_by_date,
          actual_delivery_date,
          status,
          jobs!inner(id, name, client_name)
        `)
        .eq('jobs.status', 'active')
        .or('order_by_date.not.is.null,delivery_date.not.is.null,pull_by_date.not.is.null');

      if (filterJob !== 'all') {
        jobQuery = jobQuery.eq('job_id', filterJob);
      }

      const { data: materials, error: materialsError } = await jobQuery;

      if (!materialsError && materials) {
        materials.forEach((material: any) => {
          const job = material.jobs;
          const jobColor = getJobColor(job.name);
          
          // Order by date
          if (material.order_by_date && material.status === 'not_ordered') {
            events.push({
              id: `order-${material.id}`,
              type: 'material_order',
              date: material.order_by_date,
              jobId: job.id,
              jobName: job.name,
              jobColor,
              title: `Order: ${material.name}`,
              description: `Must order by this date`,
              status: material.status,
              materialId: material.id,
              priority: isPastDue(material.order_by_date) ? 'high' : isUpcoming(material.order_by_date) ? 'medium' : 'low',
            });
          }

          // Delivery date
          if (material.delivery_date && material.status === 'ordered') {
            events.push({
              id: `delivery-${material.id}`,
              type: 'material_delivery',
              date: material.delivery_date,
              jobId: job.id,
              jobName: job.name,
              jobColor,
              title: `Delivery: ${material.name}`,
              description: `Expected delivery to shop`,
              status: material.status,
              materialId: material.id,
              priority: isPastDue(material.delivery_date) ? 'high' : isUpcoming(material.delivery_date) ? 'medium' : 'low',
            });
          }

          // Pull by date
          if (material.pull_by_date && material.status === 'at_shop') {
            events.push({
              id: `pull-${material.id}`,
              type: 'material_pull',
              date: material.pull_by_date,
              jobId: job.id,
              jobName: job.name,
              jobColor,
              title: `Pull: ${material.name}`,
              description: `Pull from shop for delivery`,
              status: material.status,
              materialId: material.id,
              priority: isPastDue(material.pull_by_date) ? 'high' : isUpcoming(material.pull_by_date) ? 'medium' : 'low',
            });
          }
        });
      }

      // Get completed tasks
      let tasksQuery = supabase
        .from('completed_tasks')
        .select(`
          id,
          completed_date,
          notes,
          component_id,
          job_id,
          components!inner(id, name),
          jobs!inner(id, name, client_name, status)
        `)
        .eq('jobs.status', 'active');

      if (filterJob !== 'all') {
        tasksQuery = tasksQuery.eq('job_id', filterJob);
      }

      if (filterTrade !== 'all') {
        tasksQuery = tasksQuery.eq('component_id', filterTrade);
      }

      const { data: completedTasks, error: tasksError } = await tasksQuery;

      if (!tasksError && completedTasks) {
        completedTasks.forEach((task: any) => {
          const jobColor = getJobColor(task.jobs.name);
          events.push({
            id: `task-${task.id}`,
            type: 'task_completed',
            date: task.completed_date,
            jobId: task.jobs.id,
            jobName: task.jobs.name,
            jobColor,
            title: `Completed: ${task.components.name}`,
            description: task.notes || 'Task completed',
            priority: 'low',
          });
        });
      }

      setEvents(events);
    } catch (error: any) {
      console.error('Error loading calendar events:', error);
      toast.error('Failed to load calendar events');
    } finally {
      setLoading(false);
    }
  }

  function isPastDue(dateStr: string): boolean {
    const date = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date < today;
  }

  function isUpcoming(dateStr: string, days: number = 7): boolean {
    const date = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const upcoming = new Date(today);
    upcoming.setDate(upcoming.getDate() + days);
    return date >= today && date <= upcoming;
  }

  function getDaysInMonth(date: Date): number {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  }

  function getFirstDayOfMonth(date: Date): number {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  }

  function getEventsForDate(dateStr: string): CalendarEvent[] {
    return events.filter(event => event.date === dateStr);
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

  function clearFilters() {
    setFilterJob('all');
    setFilterTrade('all');
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

  const EVENT_TYPE_CONFIG = {
    material_order: { icon: Package, label: 'Order Deadline', color: 'bg-yellow-500' },
    material_delivery: { icon: Truck, label: 'Delivery', color: 'bg-blue-500' },
    material_pull: { icon: Package, label: 'Pull from Shop', color: 'bg-purple-500' },
    task_completed: { icon: ListChecks, label: 'Task Completed', color: 'bg-green-500' },
    task_deadline: { icon: AlertCircle, label: 'Task Deadline', color: 'bg-red-500' },
  };

  // Get job color legend
  const activeJobs = jobs.filter(job => 
    filterJob === 'all' || job.id === filterJob
  );

  if (loading) {
    return (
      <Card className="w-full">
        <CardContent className="py-12">
          <div className="text-center text-muted-foreground">
            <CalendarIcon className="w-12 h-12 mx-auto mb-4 opacity-50 animate-pulse" />
            <p>Loading master calendar...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-2xl flex items-center gap-2">
              <CalendarIcon className="w-6 h-6 text-primary" />
              Master Calendar - All Jobs
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={previousMonth}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <div className="min-w-[200px] text-center">
                <p className="text-xl font-bold">{monthYear}</p>
              </div>
              <Button variant="outline" size="sm" onClick={goToToday}>
                Today
              </Button>
              <Button variant="outline" size="icon" onClick={nextMonth}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3 p-4 bg-muted/30 rounded-lg">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">Filters:</span>
            </div>
            
            <Select value={filterJob} onValueChange={setFilterJob}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Filter by Job Site" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Job Sites</SelectItem>
                {jobs.map(job => (
                  <SelectItem key={job.id} value={job.id}>
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: getJobColor(job.name) }}
                      />
                      {job.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterTrade} onValueChange={setFilterTrade}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Filter by Trade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Trades</SelectItem>
                {components.map(comp => (
                  <SelectItem key={comp.id} value={comp.id}>
                    {comp.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {(filterJob !== 'all' || filterTrade !== 'all') && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X className="w-4 h-4 mr-1" />
                Clear Filters
              </Button>
            )}
          </div>

          {/* Job Color Legend */}
          {activeJobs.length > 0 && (
            <div className="flex flex-wrap gap-2 p-3 bg-muted/20 rounded-lg border">
              <span className="text-xs font-semibold text-muted-foreground mr-2">Job Colors:</span>
              {activeJobs.map(job => (
                <Badge 
                  key={job.id} 
                  variant="outline"
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => onJobSelect(job.id)}
                >
                  <div 
                    className="w-3 h-3 rounded-full mr-2"
                    style={{ backgroundColor: getJobColor(job.name) }}
                  />
                  {job.name}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent>
        {/* Calendar Grid */}
        <div className="grid grid-cols-7 gap-2">
          {/* Day headers */}
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
            <div key={day} className="text-center font-semibold text-sm text-muted-foreground py-2">
              {day}
            </div>
          ))}

          {/* Calendar days */}
          {calendarDays.map((day, index) => {
            if (!day) {
              return <div key={`empty-${index}`} className="min-h-28 p-2 border rounded-lg bg-muted/30" />;
            }

            const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const dayEvents = getEventsForDate(dateStr);
            const isToday = dateStr === new Date().toISOString().split('T')[0];
            const isSelected = dateStr === selectedDate;

            return (
              <div
                key={day}
                className={`min-h-28 p-2 border rounded-lg cursor-pointer transition-all ${
                  isToday ? 'bg-primary/10 border-primary ring-2 ring-primary/20' : 'hover:bg-muted/50'
                } ${isSelected ? 'ring-2 ring-blue-500' : ''}`}
                onClick={() => setSelectedDate(isSelected ? null : dateStr)}
              >
                <div className={`text-sm font-bold mb-2 ${isToday ? 'text-primary' : ''}`}>
                  {day}
                </div>
                <div className="space-y-1">
                  {dayEvents.slice(0, 4).map(event => {
                    const config = EVENT_TYPE_CONFIG[event.type];
                    const Icon = config.icon;
                    const isMaterialEvent = event.type.startsWith('material_');
                    return (
                      <div
                        key={event.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isMaterialEvent) {
                            setSelectedEvent(event);
                            setShowEventDialog(true);
                          } else {
                            onJobSelect(event.jobId);
                          }
                        }}
                        className={`text-xs px-2 py-1 rounded cursor-pointer hover:shadow-md transition-all border-l-4 ${
                          event.priority === 'high' ? 'bg-destructive/20 text-destructive font-semibold' :
                          event.priority === 'medium' ? 'bg-warning/20 text-warning-foreground' :
                          'bg-muted text-muted-foreground'
                        }`}
                        style={{ borderLeftColor: event.jobColor }}
                        title={`${event.jobName}: ${event.title}\n${isMaterialEvent ? 'Click to edit' : 'Click to view job'}`}
                      >
                        <Icon className="w-3 h-3 inline mr-1" />
                        <span className="truncate block">{event.title}</span>
                      </div>
                    );
                  })}
                  {dayEvents.length > 4 && (
                    <div 
                      className="text-xs text-muted-foreground font-semibold cursor-pointer hover:text-primary"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedDate(dateStr);
                      }}
                    >
                      +{dayEvents.length - 4} more
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Selected Date Details */}
        {selectedDate && (
          <div className="mt-6 p-4 border-t">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold">
                {new Date(selectedDate).toLocaleDateString('en-US', {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </h3>
              <Button variant="ghost" size="sm" onClick={() => setSelectedDate(null)}>
                <X className="w-4 h-4 mr-1" />
                Close
              </Button>
            </div>
            <div className="grid gap-3">
              {getEventsForDate(selectedDate).map(event => {
                const config = EVENT_TYPE_CONFIG[event.type];
                const Icon = config.icon;
                const isMaterialEvent = event.type.startsWith('material_');
                return (
                  <Card
                    key={event.id}
                    className={`cursor-pointer hover:shadow-lg transition-all border-l-4 ${
                      event.priority === 'high' ? 'border-destructive' : ''
                    }`}
                    style={{ borderLeftColor: event.jobColor }}
                    onClick={() => {
                      if (isMaterialEvent) {
                        setSelectedEvent(event);
                        setShowEventDialog(true);
                      } else {
                        onJobSelect(event.jobId);
                      }
                    }}
                  >
                    <CardContent className="py-4">
                      <div className="flex items-start gap-3">
                        <div className={`p-2 rounded-lg ${config.color} text-white`}>
                          <Icon className="w-5 h-5" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-2">
                            <div>
                              <p className="font-bold text-lg">{event.title}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <Badge 
                                  variant="outline"
                                  style={{ 
                                    borderColor: event.jobColor,
                                    color: event.jobColor 
                                  }}
                                >
                                  {event.jobName}
                                </Badge>
                                <Badge variant="secondary">{config.label}</Badge>
                              </div>
                            </div>
                            {event.priority === 'high' && (
                              <Badge variant="destructive" className="ml-2">Overdue</Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">{event.description}</p>
                          {isMaterialEvent && (
                            <Badge variant="outline" className="mt-2 text-xs">
                              Click to edit material details
                            </Badge>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
              {getEventsForDate(selectedDate).length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No events scheduled for this date
                </p>
              )}
            </div>
          </div>
        )}

        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-6 border-t">
          <Card className="bg-red-50 dark:bg-red-950/20">
            <CardContent className="py-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-red-500 text-white">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-red-700 dark:text-red-400">
                    {events.filter(e => e.priority === 'high').length}
                  </p>
                  <p className="text-sm text-muted-foreground">Overdue</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-yellow-50 dark:bg-yellow-950/20">
            <CardContent className="py-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-yellow-500 text-white">
                  <Package className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-yellow-700 dark:text-yellow-400">
                    {events.filter(e => e.type === 'material_order').length}
                  </p>
                  <p className="text-sm text-muted-foreground">To Order</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-blue-50 dark:bg-blue-950/20">
            <CardContent className="py-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-500 text-white">
                  <Truck className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-blue-700 dark:text-blue-400">
                    {events.filter(e => e.type === 'material_delivery').length}
                  </p>
                  <p className="text-sm text-muted-foreground">Deliveries</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-green-50 dark:bg-green-950/20">
            <CardContent className="py-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-500 text-white">
                  <ListChecks className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-green-700 dark:text-green-400">
                    {events.filter(e => e.type === 'task_completed').length}
                  </p>
                  <p className="text-sm text-muted-foreground">Completed</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </CardContent>

      {/* Event Details Dialog */}
      <EventDetailsDialog
        event={selectedEvent}
        open={showEventDialog}
        onClose={() => {
          setShowEventDialog(false);
          setSelectedEvent(null);
        }}
        onUpdate={() => {
          loadCalendarEvents();
        }}
      />
    </Card>
  );
}
