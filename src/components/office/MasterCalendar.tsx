
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { 
  Calendar as CalendarIcon, 
  ChevronLeft, 
  ChevronRight, 
  Package, 
  ListChecks, 
  Truck, 
  AlertCircle,
  Filter,
  X,
  Palette,
  Users,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Edit2
} from 'lucide-react';
import { toast } from 'sonner';
import { EventDetailsDialog } from './EventDetailsDialog';
import { parseDateLocal } from '@/lib/date-utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

interface CalendarEvent {
  id: string;
  type: 'material_order' | 'material_delivery' | 'material_pull' | 'material_pickup' | 'task_deadline' | 'task_completed' | 'subcontractor';
  date: string;
  jobId: string;
  jobName: string;
  jobColor: string;
  title: string;
  description: string;
  status?: string;
  priority?: 'low' | 'medium' | 'high';
  materialId?: string;
  subcontractorName?: string;
  subcontractorPhone?: string;
  assignedUserName?: string;
  subcontractorTrades?: string[]; // Added this to fix an issue later if needed
}

interface MasterCalendarProps {
  onJobSelect: (jobId: string) => void;
  jobId?: string; // Optional: if provided, filter to show only this job's events
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

export function MasterCalendar({ onJobSelect, jobId }: MasterCalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [showEventDialog, setShowEventDialog] = useState(false);
  const [showDayDialog, setShowDayDialog] = useState(false);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [filterJob, setFilterJob] = useState<string>(jobId || 'all'); // Initialize with jobId if provided
  const [filterTrade, setFilterTrade] = useState<string>('all');
  const [jobs, setJobs] = useState<any[]>([]);
  const [components, setComponents] = useState<any[]>([]);
  const [showJobLegend, setShowJobLegend] = useState(false);
  const [openDialog, setOpenDialog] = useState<'to_order' | 'deliveries' | 'subcontractors' | null>(null);
  const [displayUnavailableDates, setDisplayUnavailableDates] = useState(false);
  const [unavailableDates, setUnavailableDates] = useState<any[]>([]);
  const [editingEventDate, setEditingEventDate] = useState<CalendarEvent | null>(null);
  const [newEventDate, setNewEventDate] = useState('');
  const [savingDate, setSavingDate] = useState(false);
  const [completingEvent, setCompletingEvent] = useState(false);

  useEffect(() => {
    loadJobs();
    loadComponents();
    loadUnavailableDates();
    // If jobId prop is provided, set filter to that job
    if (jobId) {
      setFilterJob(jobId);
    }
  }, [jobId]);

  useEffect(() => {
    loadCalendarEvents();
  }, [currentDate, filterJob, filterTrade]);

  async function loadJobs() {
    try {
      const { data, error } = await supabase
        .from('jobs')
        .select('id, name, client_name')
        .in('status', ['active', 'prepping'])
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

  async function loadUnavailableDates() {
    try {
      const { data, error } = await supabase
        .from('user_unavailable_dates')
        .select(`
          *,
          user_profiles!inner(id, username)
        `)
        .order('start_date');

      if (error) throw error;
      setUnavailableDates(data || []);
    } catch (error) {
      console.error('Error loading unavailable dates:', error);
    }
  }

  function getUnavailableUsers(dateStr: string): string[] {
    if (!displayUnavailableDates) return [];
    
    const date = new Date(dateStr);
    const unavailableUsers: string[] = [];
    
    unavailableDates.forEach(range => {
      const start = new Date(range.start_date);
      const end = new Date(range.end_date);
      if (date >= start && date <= end) {
        unavailableUsers.push((range.user_profiles as any)?.username || 'Unknown');
      }
    });
    
    return unavailableUsers;
  }

  async function loadCalendarEvents() {
    try {
      setLoading(true);
      const events: CalendarEvent[] = [];

      // Load material events for all active and prepping jobs
      let materialsQuery = supabase
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
        .in('jobs.status', ['active', 'prepping'])
        .or('order_by_date.not.is.null,delivery_date.not.is.null,pull_by_date.not.is.null');

      // If viewing a specific job, filter to that job only
      if (jobId) {
        materialsQuery = materialsQuery.eq('job_id', jobId);
      }

      // If master calendar filter is active, apply it
      if (filterJob !== 'all' && !jobId) {
        materialsQuery = materialsQuery.eq('job_id', filterJob);
      }

      const { data: materials, error: materialsError } = await materialsQuery;

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
              description: `${job.name} - Must order by this date`,
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
              description: `${job.name} - Expected delivery to shop`,
              status: material.status,
              materialId: material.id,
              priority: isPastDue(material.delivery_date) ? 'high' : isUpcoming(material.delivery_date) ? 'medium' : 'low',
            });
          }

          // Pull by date - only show when material is NOT yet at shop (still ordered)
          // Once at shop, the pull event is no longer needed on calendar
          if (material.pull_by_date && material.status === 'ordered') {
            events.push({
              id: `pull-${material.id}`,
              type: 'material_pull',
              date: material.pull_by_date,
              jobId: job.id,
              jobName: job.name,
              jobColor,
              title: `Pull: ${material.name}`,
              description: `${job.name} - Pull from shop for delivery`,
              status: material.status,
              materialId: material.id,
              priority: isPastDue(material.pull_by_date) ? 'high' : isUpcoming(material.pull_by_date) ? 'medium' : 'low',
            });
          }
        });
      }

      // Get subcontractor schedules
      let subcontractorQuery = supabase
        .from('subcontractor_schedules')
        .select(`
          id,
          start_date,
          end_date,
          work_description,
          notes,
          status,
          job_id,
          subcontractors!inner(id, name, phone, trades),
          jobs!inner(id, name, client_name, status)
        `)
        .in('jobs.status', ['active', 'prepping']);

      if (filterJob !== 'all') {
        subcontractorQuery = subcontractorQuery.eq('job_id', filterJob);
      }

      const { data: subcontractorSchedules, error: subError } = await subcontractorQuery;

      if (!subError && subcontractorSchedules) {
        subcontractorSchedules.forEach((schedule: any) => {
          const jobColor = getJobColor(schedule.jobs.name);
          const startDate = parseDateLocal(schedule.start_date);
          const endDate = schedule.end_date ? parseDateLocal(schedule.end_date) : startDate;
          
          // Create date range string for display
          const dateRangeStr = endDate.getTime() !== startDate.getTime()
            ? ` (${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})`
            : '';

          // Add event for each day in the range
          const currentDate = new Date(startDate);
          while (currentDate <= endDate) {
            const dateStr = currentDate.toISOString().split('T')[0];
            
            events.push({
              id: `sub-${schedule.id}-${dateStr}`,
              type: 'subcontractor',
              date: dateStr,
              jobId: schedule.jobs.id,
              jobName: schedule.jobs.name,
              jobColor,
              title: `${schedule.subcontractors.name}${dateRangeStr}`,
              description: `${schedule.subcontractors.trades && schedule.subcontractors.trades.length > 0 ? schedule.subcontractors.trades.join(', ') : 'Subcontractor'}: ${schedule.work_description || 'Scheduled work'}`,
              subcontractorTrades: schedule.subcontractors.trades,
              subcontractorName: schedule.subcontractors.name,
              subcontractorPhone: schedule.subcontractors.phone,
              status: schedule.status,
              priority: schedule.status === 'cancelled' ? 'low' : isPastDue(schedule.start_date) && schedule.status === 'scheduled' ? 'high' : 'medium',
            });
            
            // Move to next day
            currentDate.setDate(currentDate.getDate() + 1);
          }
        });
      }

      // Get calendar events (pickups, deliveries, order reminders)
      let calendarEventsQuery = supabase
        .from('calendar_events')
        .select(`
          id,
          title,
          description,
          event_date,
          event_type,
          job_id,
          jobs!inner(id, name, client_name, status)
        `)
        .in('jobs.status', ['active', 'prepping'])
        .in('event_type', ['material_pickup', 'material_delivery', 'material_order_reminder']);

      // If viewing a specific job, filter to that job
      if (jobId) {
        calendarEventsQuery = calendarEventsQuery.eq('job_id', jobId);
      }

      // If master calendar filter is active, apply it
      if (filterJob !== 'all' && !jobId) {
        calendarEventsQuery = calendarEventsQuery.eq('job_id', filterJob);
      }

      const { data: calendarEvents, error: calendarEventsError } = await calendarEventsQuery;

      if (!calendarEventsError && calendarEvents) {
        calendarEvents.forEach((event: any) => {
          const job = event.jobs;
          const jobColor = getJobColor(job.name);
          
          let eventType: CalendarEvent['type'] = 'material_pickup';
          if (event.event_type === 'material_delivery') {
            eventType = 'material_delivery';
          } else if (event.event_type === 'material_order_reminder') {
            eventType = 'material_order';
          } else if (event.event_type === 'material_pickup') {
            eventType = 'material_pickup';
          }
          
          events.push({
            id: `calendar-${event.id}`,
            type: eventType,
            date: event.event_date,
            jobId: job.id,
            jobName: job.name,
            jobColor,
            title: event.title,
            description: `${job.name} - ${event.description || ''}`,
            priority: isPastDue(event.event_date) ? 'high' : isUpcoming(event.event_date) ? 'medium' : 'low',
          });
        });
      }

      // Load tasks with due dates (excluding completed tasks)
      let tasksQuery = supabase
        .from('job_tasks')
        .select(`
          id,
          title,
          description,
          due_date,
          priority,
          status,
          task_type,
          job_id,
          assigned_to,
          assigned_user:assigned_to(id, username, email),
          jobs!inner(id, name, client_name, status)
        `)
        .in('jobs.status', ['active', 'prepping'])
        .neq('status', 'completed')
        .not('due_date', 'is', null);

      if (filterJob !== 'all') {
        tasksQuery = tasksQuery.eq('job_id', filterJob);
      }

      const { data: tasks, error: tasksError } = await tasksQuery;

      if (!tasksError && tasks) {
        tasks.forEach((task: any) => {
          const job = task.jobs;
          const jobColor = getJobColor(job.name);
          const assignedUserName = task.assigned_user 
            ? (task.assigned_user.username || task.assigned_user.email)
            : undefined;
          
          events.push({
            id: `task-${task.id}`,
            type: 'task_deadline',
            date: task.due_date,
            jobId: job.id,
            jobName: job.name,
            jobColor,
            title: task.title,
            description: task.description || `${task.task_type} task`,
            status: task.status,
            priority: isPastDue(task.due_date) ? 'high' : isUpcoming(task.due_date) ? 'medium' : 'low',
            assignedUserName,
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
    const eventDate = new Date(dateStr + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // Only mark as overdue if BEFORE today, not ON today
    return eventDate < today;
  }

  function isToday(dateStr: string): boolean {
    const eventDate = new Date(dateStr + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    eventDate.setHours(0, 0, 0, 0);
    return eventDate.getTime() === today.getTime();
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
    // Filter by trade if filterTrade is not 'all'
    const filteredByTrade = filterTrade === 'all'
      ? events
      : events.filter(event => {
          // If it's a subcontractor event, check its trades
          if (event.type === 'subcontractor' && event.subcontractorTrades) {
            return event.subcontractorTrades.includes(components.find(c => c.id === filterTrade)?.name);
          }
          // For other event types, we might need a different filtering logic
          // or assume they don't have a 'trade' for this filter.
          // For now, let's exclude non-subcontractor events if a trade is selected.
          return false;
        });

    return filteredByTrade.filter(event => event.date === dateStr);
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
    material_pickup: { icon: Package, label: 'Pickup', color: 'bg-orange-500' },
    task_completed: { icon: ListChecks, label: 'Task Completed', color: 'bg-green-500' },
    task_deadline: { icon: AlertCircle, label: 'Task Deadline', color: 'bg-red-500' },
    subcontractor: { icon: Users, label: 'Subcontractor', color: 'bg-indigo-500' }, // Changed to Users icon
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
    <>
      <Card className="w-full rounded-none border-slate-300 bg-white">
        <CardHeader className="p-3 sm:p-6">
          <div className="flex flex-col gap-3 sm:gap-4">
            {/* Mobile-optimized header */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="text-lg sm:text-2xl flex items-center gap-2">
                <CalendarIcon className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
                <span className="truncate">
                  {jobId ? jobs.find(j => j.id === jobId)?.name || 'Loading...' : 'Calendar'}
                </span>
              </CardTitle>
              
              {/* Mobile-optimized navigation */}
              <div className="flex items-center justify-between sm:justify-end gap-2">
                <Button variant="outline" size="icon" onClick={previousMonth} className="h-9 w-9 rounded-none border-slate-300 bg-white hover:bg-slate-100">
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <div className="min-w-[140px] sm:min-w-[200px] text-center">
                  <p className="text-base sm:text-xl font-bold">{monthYear}</p>
                </div>
                <Button variant="outline" size="sm" onClick={goToToday} className="h-9 px-3 rounded-none border-slate-300 bg-white hover:bg-slate-100">
                  Today
                </Button>
                <Button variant="outline" size="icon" onClick={nextMonth} className="h-9 w-9 rounded-none border-slate-300 bg-white hover:bg-slate-100">
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>


          </div>
        </CardHeader>

        <CardContent className="p-2 sm:p-6">
          {/* Calendar Grid */}
          <div className="grid grid-cols-7 gap-1 sm:gap-2">
            {/* Day headers - abbreviated on mobile */}
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, index) => (
              <div key={day} className="text-center font-semibold text-xs sm:text-sm text-muted-foreground py-1 sm:py-2">
                <span className="hidden sm:inline">{day}</span>
                <span className="sm:hidden">{['S', 'M', 'T', 'W', 'T', 'F', 'S'][index]}</span>
              </div>
            ))}

            {/* Calendar days */}
            {calendarDays.map((day, index) => {
              if (!day) {
                return <div key={`empty-${index}`} className="min-h-14 sm:min-h-28 p-1 sm:p-2 border rounded-none border-slate-300 bg-slate-50" />;
              }

              const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const dayEvents = getEventsForDate(dateStr);
              const isTodayDate = dateStr === new Date().toISOString().split('T')[0];
              const isSelected = dateStr === selectedDate;
              const unavailableUsers = getUnavailableUsers(dateStr);

              return (
                <div
                  key={day}
                  className={`min-h-14 sm:min-h-28 p-1 sm:p-2 border rounded-none border-slate-300 cursor-pointer transition-all ${
                    isTodayDate ? 'bg-primary/10 border-primary ring-1 sm:ring-2 ring-primary/20' : 'hover:bg-muted/50 active:bg-muted'
                  } ${isSelected ? 'ring-1 sm:ring-2 ring-blue-500' : ''} ${
                    unavailableUsers.length > 0 ? 'bg-orange-50 border-orange-300' : ''
                  }`}
                  onClick={() => {
                    if (dayEvents.length > 0 || unavailableUsers.length > 0) {
                      setSelectedDate(dateStr);
                      setExpandedEventId(null); // Don't auto-expand any event
                      setShowDayDialog(true);
                    }
                  }}
                  title={unavailableUsers.length > 0 ? `Off: ${unavailableUsers.join(', ')}` : undefined}
                >
                  <div className={`text-xs sm:text-sm font-bold mb-1 sm:mb-2 ${
                    isTodayDate ? 'text-primary' : unavailableUsers.length > 0 ? 'text-orange-600' : ''
                  }`}>
                    {day}
                    {unavailableUsers.length > 0 && (
                      <div className="text-[8px] sm:text-[10px] text-orange-600 font-normal mt-0.5">Off</div>
                    )}
                  </div>
                  <div className="space-y-0.5 sm:space-y-1">
                    {/* Mobile: Show up to 2 events with dots, Desktop: Show up to 4 events with details */}
                    {dayEvents.slice(0, 2).map(event => {
                      const config = EVENT_TYPE_CONFIG[event.type];
                      const Icon = config.icon;
                      const isMaterialEvent = event.type.startsWith('material_');
                      const eventIsPast = isPastDue(event.date);
                      const eventIsToday = isToday(event.date);
                      
                      let bgClass = '';
                      let textClass = '';
                      let fontWeight = '';
                      
                      if (eventIsPast) {
                        bgClass = 'bg-muted/40';
                        textClass = 'text-muted-foreground/60';
                        fontWeight = '';
                      } else if (eventIsToday) {
                        if (event.priority === 'medium') {
                          bgClass = 'bg-yellow-500/20';
                          textClass = 'text-yellow-800';
                          fontWeight = '';
                        } else {
                          bgClass = 'bg-muted';
                          textClass = 'text-muted-foreground';
                          fontWeight = '';
                        }
                      } else {
                        if (event.priority === 'high') {
                          bgClass = 'bg-destructive/20';
                          textClass = 'text-destructive';
                          fontWeight = 'font-semibold';
                        } else if (event.priority === 'medium') {
                          bgClass = 'bg-yellow-500/20';
                          textClass = 'text-yellow-800';
                          fontWeight = '';
                        } else {
                          bgClass = 'bg-muted';
                          textClass = 'text-muted-foreground';
                          fontWeight = '';
                        }
                      }
                      
                      return (
                        <div
                          key={event.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            // Open day dialog with this event auto-expanded
                            setSelectedDate(dateStr);
                            setExpandedEventId(event.id);
                            setShowDayDialog(true);
                          }}
                          className={`text-xs px-1 sm:px-2 py-0.5 sm:py-1 rounded-none cursor-pointer hover:shadow-md transition-all border-l-2 sm:border-l-4 ${bgClass} ${textClass} ${fontWeight}`}
                          style={{ borderLeftColor: event.jobColor }}
                          title={`${event.jobName}: ${event.title}\nClick to view event details`}
                        >
                          {/* Desktop: Show icon and text */}
                          <div className="hidden sm:flex items-center gap-1">
                            <Icon className="w-3 h-3 flex-shrink-0" />
                            <span className="truncate">{event.title}</span>
                          </div>
                          {/* Mobile: Show dot only */}
                          <div className="sm:hidden flex items-center gap-1">
                            <div className="w-1.5 h-1.5 rounded-full bg-current" />
                            <span className="truncate text-[10px]">{event.title.substring(0, 15)}{event.title.length > 15 ? '...' : ''}</span>
                          </div>
                        </div>
                      );
                    })}
                    {dayEvents.length > 2 && (
                      <div className="text-[10px] sm:text-xs text-muted-foreground font-semibold px-1">
                        +{dayEvents.length - 2}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>



          {/* Quick Access Buttons + Toggle Unavailable Dates */}
          <div className="mt-4 sm:mt-6 pt-4 sm:pt-6 border-t space-y-3">
            {/* Toggle Button for Unavailable Dates */}
            <div className="flex items-center justify-between px-1">
              <Label className="text-sm font-medium">Show Staff Time Off</Label>
              <Button
                variant={displayUnavailableDates ? 'default' : 'outline'}
                size="sm"
                onClick={() => setDisplayUnavailableDates(!displayUnavailableDates)}
                className="h-8"
              >
                {displayUnavailableDates ? 'Hide' : 'Show'}
              </Button>
            </div>

            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              <Button
                variant="outline"
                size="lg"
                className="h-auto py-3 sm:py-4 flex-col gap-1 sm:gap-2 min-h-[60px] sm:min-h-[80px] rounded-none border-slate-300 bg-white hover:bg-slate-100"
                onClick={() => setOpenDialog('to_order')}
              >
                <Package className="w-5 h-5" />
                <div className="text-center">
                  <div className="text-xs sm:text-sm font-semibold">To Order</div>
                  <div className="text-[10px] sm:text-xs text-muted-foreground">
                    {events.filter(e => e.type === 'material_order').length} items
                  </div>
                </div>
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="h-auto py-3 sm:py-4 flex-col gap-1 sm:gap-2 min-h-[60px] sm:min-h-[80px] rounded-none border-slate-300 bg-white hover:bg-slate-100"
                onClick={() => setOpenDialog('deliveries')}
              >
                <Truck className="w-5 h-5" />
                <div className="text-center">
                  <div className="text-xs sm:text-sm font-semibold">Deliveries</div>
                  <div className="text-[10px] sm:text-xs text-muted-foreground">
                    {events.filter(e => e.type === 'material_delivery').length} scheduled
                  </div>
                </div>
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="h-auto py-3 sm:py-4 flex-col gap-1 sm:gap-2 min-h-[60px] sm:min-h-[80px] rounded-none border-slate-300 bg-white hover:bg-slate-100"
                onClick={() => setOpenDialog('subcontractors')}
              >
                <Users className="w-5 h-5" />
                <div className="text-center">
                  <div className="text-xs sm:text-sm font-semibold">Subcontractors</div>
                  <div className="text-[10px] sm:text-xs text-muted-foreground">
                    {events.filter(e => e.type === 'subcontractor').length} scheduled
                  </div>
                </div>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* To Order Dialog */}
      <Dialog open={openDialog === 'to_order'} onOpenChange={(open) => !open && setOpenDialog(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto rounded-none border-slate-300">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="w-5 h-5" />
              Materials To Order
            </DialogTitle>
          </DialogHeader>
          <div className="mt-4">
            <div className="space-y-3">
              {events.filter(e => e.type === 'material_order').length === 0 ? (
                <Card className="rounded-none border-slate-300 bg-white">
                  <CardContent className="py-12 text-center">
                    <Package className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
                    <p className="text-muted-foreground">No materials to order</p>
                  </CardContent>
                </Card>
              ) : (
                events
                  .filter(e => e.type === 'material_order')
                  .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                  .map(event => (
                    <Card
                      key={event.id}
                      className={`cursor-pointer hover:shadow-lg transition-all border-l-4 rounded-none border-slate-300 bg-white ${
                        event.priority === 'high' ? 'border-destructive bg-destructive/5' : 'border-yellow-500'
                      }`}
                      style={{ borderLeftColor: event.jobColor }}
                      onClick={() => {
                        setSelectedEvent(event);
                        setShowEventDialog(true);
                        setOpenDialog(null);
                      }}
                    >
                      <CardContent className="py-4">
                        <div className="flex items-start gap-3">
                          <div className="p-2 rounded-lg bg-yellow-500 text-white">
                            <Package className="w-5 h-5" />
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
                                  <Badge variant="secondary">
                                    Order by: {new Date(event.date).toLocaleDateString('en-US', {
                                      month: 'short',
                                      day: 'numeric',
                                      year: 'numeric'
                                    })}
                                  </Badge>
                                </div>
                              </div>
                              {event.priority === 'high' && (
                                <Badge variant="destructive">Overdue</Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground">{event.description}</p>
                            <Badge variant="outline" className="mt-2 text-xs">
                              Click to edit material details
                            </Badge>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Deliveries Dialog */}
      <Dialog open={openDialog === 'deliveries'} onOpenChange={(open) => !open && setOpenDialog(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto rounded-none border-slate-300">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Truck className="w-5 h-5" />
              Scheduled Deliveries
            </DialogTitle>
          </DialogHeader>
          <div className="mt-4">
            <div className="space-y-3">
              {events.filter(e => e.type === 'material_delivery').length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <Truck className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
                    <p className="text-muted-foreground">No scheduled deliveries</p>
                  </CardContent>
                </Card>
              ) : (
                events
                  .filter(e => e.type === 'material_delivery')
                  .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                  .map(event => (
                    <Card
                      key={event.id}
                      className={`cursor-pointer hover:shadow-lg transition-all border-l-4 rounded-none border-slate-300 bg-white ${
                        event.priority === 'high' ? 'border-destructive bg-destructive/5' : 'border-blue-500'
                      }`}
                      style={{ borderLeftColor: event.jobColor }}
                      onClick={() => {
                        setSelectedEvent(event);
                        setShowEventDialog(true);
                        setOpenDialog(null);
                      }}
                    >
                      <CardContent className="py-4">
                        <div className="flex items-start gap-3">
                          <div className="p-2 rounded-lg bg-blue-500 text-white">
                            <Truck className="w-5 h-5" />
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
                                  <Badge variant="secondary">
                                    Delivery: {new Date(event.date).toLocaleDateString('en-US', {
                                      month: 'short',
                                      day: 'numeric',
                                      year: 'numeric'
                                    })}
                                  </Badge>
                                </div>
                              </div>
                              {event.priority === 'high' && (
                                <Badge variant="destructive">Overdue</Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground">{event.description}</p>
                            <Badge variant="outline" className="mt-2 text-xs">
                              Click to edit material details
                            </Badge>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Subcontractors Dialog */}
      <Dialog open={openDialog === 'subcontractors'} onOpenChange={(open) => !open && setOpenDialog(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto rounded-none border-slate-300">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              Scheduled Subcontractors
            </DialogTitle>
          </DialogHeader>
          <div className="mt-4">
            <div className="space-y-3">
              {events.filter(e => e.type === 'subcontractor').length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <Users className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
                    <p className="text-muted-foreground">No scheduled subcontractors</p>
                  </CardContent>
                </Card>
              ) : (
                // Group subcontractor events by subcontractor and job to show date ranges
                (() => {
                  const subEvents = events.filter(e => e.type === 'subcontractor');
                  // Create unique key for each subcontractor-job combination
                  const grouped = new Map<string, CalendarEvent[]>();
                  
                  subEvents.forEach(event => {
                    const key = `${event.subcontractorName}-${event.jobId}`;
                    if (!grouped.has(key)) {
                      grouped.set(key, []);
                    }
                    grouped.get(key)!.push(event);
                  });

                  return Array.from(grouped.entries())
                    .sort((a, b) => {
                      const dateA = new Date(a[1][0].date).getTime();
                      const dateB = new Date(b[1][0].date).getTime();
                      return dateA - dateB;
                    })
                    .map(([key, groupEvents]) => {
                      const firstEvent = groupEvents[0];
                      const dates = groupEvents.map(e => e.date).sort();
                      const startDate = dates[0];
                      const endDate = dates[dates.length - 1];
                      const dateRangeDisplay = startDate === endDate 
                        ? new Date(startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                        : `${new Date(startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${new Date(endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

                      return (
                        <Card
                          key={key}
                          className="cursor-pointer hover:shadow-lg transition-all border-l-4 border-indigo-500"
                          style={{ borderLeftColor: firstEvent.jobColor }}
                          onClick={() => {
                            onJobSelect(firstEvent.jobId);
                            setOpenDialog(null);
                          }}
                        >
                          <CardContent className="py-4">
                            <div className="flex items-start gap-3">
                              <div className="p-2 rounded-lg bg-indigo-500 text-white">
                                <Users className="w-5 h-5" />
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center justify-between mb-2">
                                  <div>
                                    <p className="font-bold text-lg">{firstEvent.subcontractorName}</p>
                                    <div className="flex items-center gap-2 mt-1">
                                      <Badge 
                                        variant="outline"
                                        style={{ 
                                          borderColor: firstEvent.jobColor,
                                          color: firstEvent.jobColor 
                                        }}
                                      >
                                        {firstEvent.jobName}
                                      </Badge>
                                      <Badge variant="secondary">
                                        {dateRangeDisplay}
                                      </Badge>
                                    </div>
                                  </div>
                                </div>
                                <p className="text-sm text-muted-foreground">{firstEvent.description}</p>
                                {firstEvent.subcontractorPhone && (
                                  <p className="text-xs text-muted-foreground mt-2">
                                    📞 {firstEvent.subcontractorPhone}
                                  </p>
                                )}
                                <Badge variant="outline" className="mt-2 text-xs">
                                  Click to view job details
                                </Badge>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    });
                })()
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Day Events Dialog */}
      <Dialog open={showDayDialog} onOpenChange={setShowDayDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto rounded-none border-slate-300">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarIcon className="w-5 h-5" />
              {selectedDate && parseDateLocal(selectedDate).toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })}
            </DialogTitle>
          </DialogHeader>
          <div className="mt-4">
            {/* Show unavailable users first if any */}
            {selectedDate && getUnavailableUsers(selectedDate).length > 0 && (
              <Card className="mb-4 border-orange-300 bg-orange-50">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2 text-orange-700">
                    <Users className="w-4 h-4" />
                    Staff Unavailable
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {getUnavailableUsers(selectedDate).map((username, idx) => (
                      <Badge key={idx} variant="outline" className="border-orange-400 text-orange-700">
                        {username}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {selectedDate && getEventsForDate(selectedDate).length === 0 && getUnavailableUsers(selectedDate).length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <CalendarIcon className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
                  <p className="text-muted-foreground">No events scheduled for this date</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {selectedDate && getEventsForDate(selectedDate).map(event => {
                  const config = EVENT_TYPE_CONFIG[event.type];
                  const Icon = config.icon;
                  const isMaterialEvent = event.type.startsWith('material_');
                  const isExpanded = expandedEventId === event.id;

                  return (
                    <Collapsible
                      key={event.id}
                      open={isExpanded}
                      onOpenChange={(open) => setExpandedEventId(open ? event.id : null)}
                    >
                      <Card
                        className={`border-l-4 ${
                          event.priority === 'high' ? 'border-destructive bg-destructive/5' : ''
                        }`}
                        style={{ borderLeftColor: event.jobColor }}
                      >
                        <CollapsibleTrigger asChild>
                          <div className="cursor-pointer hover:bg-muted/50 transition-colors">
                            <CardContent className="py-3">
                              <div className="flex items-center gap-3">
                                <div className={`p-2 rounded-lg ${config.color} text-white`}>
                                  <Icon className="w-4 h-4" />
                                </div>
                                <div className="flex-1">
                                  <div className="flex items-center gap-2">
                                    <p className="font-bold">{event.title}</p>
                                    {event.priority === 'high' && (
                                      <Badge variant="destructive" className="text-xs">Overdue</Badge>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 mt-1">
                                    <Badge 
                                      variant="outline"
                                      className="text-xs"
                                      style={{ 
                                        borderColor: event.jobColor,
                                        color: event.jobColor 
                                      }}
                                    >
                                      {event.jobName}
                                    </Badge>
                                    <Badge variant="secondary" className="text-xs">{config.label}</Badge>
                                  </div>
                                </div>
                                {isExpanded ? (
                                  <ChevronUp className="w-5 h-5 text-muted-foreground" />
                                ) : (
                                  <ChevronDown className="w-5 h-5 text-muted-foreground" />
                                )}
                              </div>
                            </CardContent>
                          </div>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <CardContent className="pt-0 pb-4 space-y-3">
                            <div className="pl-11 space-y-3">
                              {/* Description */}
                              <div>
                                <p className="text-sm font-semibold text-muted-foreground mb-1">Description</p>
                                <p className="text-sm">{event.description}</p>
                              </div>

                              {/* Event Date */}
                              <div>
                                <p className="text-sm font-semibold text-muted-foreground mb-1">Date</p>
                                <p className="text-sm">
                                  {parseDateLocal(event.date).toLocaleDateString('en-US', {
                                    weekday: 'long',
                                    month: 'long',
                                    day: 'numeric',
                                    year: 'numeric'
                                  })}
                                </p>
                              </div>

                              {/* Status */}
                              {event.status && (
                                <div>
                                  <p className="text-sm font-semibold text-muted-foreground mb-1">Status</p>
                                  <Badge variant="outline" className="capitalize">{event.status.replace('_', ' ')}</Badge>
                                </div>
                              )}

                              {/* Priority */}
                              {event.priority && (
                                <div>
                                  <p className="text-sm font-semibold text-muted-foreground mb-1">Priority</p>
                                  <Badge 
                                    variant={event.priority === 'high' ? 'destructive' : event.priority === 'medium' ? 'default' : 'secondary'}
                                    className="capitalize"
                                  >
                                    {event.priority}
                                  </Badge>
                                </div>
                              )}

                              {/* Subcontractor Info */}
                              {event.subcontractorName && (
                                <div>
                                  <p className="text-sm font-semibold text-muted-foreground mb-1">Subcontractor</p>
                                  <p className="text-sm">{event.subcontractorName}</p>
                                  {event.subcontractorPhone && (
                                    <p className="text-xs text-muted-foreground mt-1">📞 {event.subcontractorPhone}</p>
                                  )}
                                </div>
                              )}

                              {/* Assigned User */}
                              {event.assignedUserName && (
                                <div>
                                  <p className="text-sm font-semibold text-muted-foreground mb-1">Assigned To</p>
                                  <p className="text-sm">{event.assignedUserName}</p>
                                </div>
                              )}

                              {/* Action Buttons */}
                              <div className="flex gap-2 pt-2 flex-wrap">
                                {/* Check Off / Mark Complete Button */}
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={async () => {
                                    setCompletingEvent(true);
                                    try {
                                      // Handle completion based on event type
                                      if (event.id.startsWith('calendar-')) {
                                        // Calendar events - mark as completed
                                        const calendarEventId = event.id.replace('calendar-', '');
                                        const { error } = await supabase
                                          .from('calendar_events')
                                          .update({ 
                                            completed_at: new Date().toISOString(),
                                          })
                                          .eq('id', calendarEventId);
                                        
                                        if (error) throw error;
                                        toast.success('Event marked as complete');
                                      } else if (event.id.startsWith('task-')) {
                                        // Tasks - mark as completed
                                        const taskId = event.id.replace('task-', '');
                                        const { error } = await supabase
                                          .from('job_tasks')
                                          .update({ 
                                            status: 'completed',
                                            completed_at: new Date().toISOString()
                                          })
                                          .eq('id', taskId);
                                        
                                        if (error) throw error;
                                        toast.success('Task marked as complete');
                                      } else {
                                        toast.info('This event type cannot be checked off from the calendar');
                                      }
                                      
                                      await loadCalendarEvents();
                                      setShowDayDialog(false);
                                    } catch (error: any) {
                                      console.error('Error completing event:', error);
                                      toast.error('Failed to mark event as complete');
                                    } finally {
                                      setCompletingEvent(false);
                                    }
                                  }}
                                  disabled={completingEvent}
                                  className="flex items-center gap-2"
                                >
                                  {completingEvent ? (
                                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                  ) : (
                                    <CheckCircle2 className="w-4 h-4" />
                                  )}
                                  {completingEvent ? 'Marking...' : 'Check Off'}
                                </Button>

                                {/* Change Date Button */}
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setEditingEventDate(event);
                                    setNewEventDate(event.date);
                                  }}
                                  className="flex items-center gap-2"
                                >
                                  <Edit2 className="w-4 h-4" />
                                  Change Date
                                </Button>

                                {isMaterialEvent && event.materialId ? (
                                  <Button
                                    size="sm"
                                    onClick={() => {
                                      setSelectedEvent(event);
                                      setShowEventDialog(true);
                                      setShowDayDialog(false);
                                    }}
                                  >
                                    Edit Material Details
                                  </Button>
                                ) : (
                                  <Button
                                    size="sm"
                                    onClick={() => {
                                      onJobSelect(event.jobId);
                                      setShowDayDialog(false);
                                    }}
                                  >
                                    View Job
                                  </Button>
                                )}
                              </div>
                            </div>
                          </CardContent>
                        </CollapsibleContent>
                      </Card>
                    </Collapsible>
                  );
                })}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

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

      {/* Change Event Date Dialog */}
      <Dialog open={!!editingEventDate} onOpenChange={(open) => !open && setEditingEventDate(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarIcon className="w-5 h-5" />
              Change Event Date
            </DialogTitle>
          </DialogHeader>

          {editingEventDate && (
            <div className="space-y-4">
              <div className="bg-primary/5 rounded-lg p-4 border border-primary/20">
                <p className="font-semibold text-base">{editingEventDate.title}</p>
                <div className="flex items-center gap-2 mt-2">
                  <Badge 
                    variant="outline"
                    style={{ 
                      borderColor: editingEventDate.jobColor,
                      color: editingEventDate.jobColor 
                    }}
                  >
                    {editingEventDate.jobName}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  Current Date: {parseDateLocal(editingEventDate.date).toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric'
                  })}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="new-event-date">New Date</Label>
                <Input
                  id="new-event-date"
                  type="date"
                  value={newEventDate}
                  onChange={(e) => setNewEventDate(e.target.value)}
                  className="h-10"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditingEventDate(null)}
              disabled={savingDate}
            >
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (!editingEventDate || !newEventDate) return;
                
                setSavingDate(true);
                try {
                  // Handle different event types
                  if (editingEventDate.id.startsWith('calendar-')) {
                    // Calendar events (pickups, deliveries, order reminders)
                    const calendarEventId = editingEventDate.id.replace('calendar-', '');
                    const { error } = await supabase
                      .from('calendar_events')
                      .update({ event_date: newEventDate })
                      .eq('id', calendarEventId);
                    
                    if (error) throw error;
                  } else if (editingEventDate.id.startsWith('order-')) {
                    // Material order dates
                    const materialId = editingEventDate.id.replace('order-', '');
                    const { error } = await supabase
                      .from('materials')
                      .update({ order_by_date: newEventDate })
                      .eq('id', materialId);
                    
                    if (error) throw error;
                  } else if (editingEventDate.id.startsWith('delivery-')) {
                    // Material delivery dates
                    const materialId = editingEventDate.id.replace('delivery-', '');
                    const { error } = await supabase
                      .from('materials')
                      .update({ delivery_date: newEventDate })
                      .eq('id', materialId);
                    
                    if (error) throw error;
                  } else if (editingEventDate.id.startsWith('pull-')) {
                    // Material pull dates
                    const materialId = editingEventDate.id.replace('pull-', '');
                    const { error } = await supabase
                      .from('materials')
                      .update({ pull_by_date: newEventDate })
                      .eq('id', materialId);
                    
                    if (error) throw error;
                  } else if (editingEventDate.id.startsWith('task-')) {
                    // Task due dates
                    const taskId = editingEventDate.id.replace('task-', '');
                    const { error } = await supabase
                      .from('job_tasks')
                      .update({ due_date: newEventDate })
                      .eq('id', taskId);
                    
                    if (error) throw error;
                  } else if (editingEventDate.id.startsWith('sub-')) {
                    // Subcontractor schedules
                    const scheduleId = editingEventDate.id.split('-')[1];
                    const { error } = await supabase
                      .from('subcontractor_schedules')
                      .update({ start_date: newEventDate })
                      .eq('id', scheduleId);
                    
                    if (error) throw error;
                  }

                  toast.success('Event date updated');
                  setEditingEventDate(null);
                  await loadCalendarEvents();
                  setShowDayDialog(false);
                } catch (error: any) {
                  console.error('Error updating event date:', error);
                  toast.error('Failed to update event date');
                } finally {
                  setSavingDate(false);
                }
              }}
              disabled={savingDate || !newEventDate}
              className="gradient-primary"
            >
              {savingDate ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  Saving...
                </>
              ) : (
                'Update Date'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
