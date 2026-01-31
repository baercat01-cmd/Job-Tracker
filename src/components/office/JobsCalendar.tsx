import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Package, ListChecks, Truck, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import type { Job } from '@/types';
import { EventDetailsDialog } from './EventDetailsDialog';
import { DayViewDialog } from '../foreman/DayViewDialog';

// Helper function to parse date string as local date (not UTC)
function parseDateLocal(dateString: string): Date {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
}

interface CalendarEvent {
  id: string;
  type: 'material_order' | 'material_delivery' | 'material_pull' | 'material_pickup' | 'task_deadline' | 'task_completed' | 'subcontractor';
  date: string;
  jobId: string;
  jobName: string;
  title: string;
  description: string;
  status?: string;
  priority?: 'low' | 'medium' | 'high';
  subcontractorName?: string;
  subcontractorPhone?: string;
  assignedUserName?: string;
}

interface JobsCalendarProps {
  onJobSelect?: (jobId: string) => void;
}

export function JobsCalendar({ onJobSelect }: JobsCalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'month' | 'week' | 'agenda'>('month');
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [showEventDialog, setShowEventDialog] = useState(false);
  const [showDayView, setShowDayView] = useState(false);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);

  useEffect(() => {
    loadCalendarEvents();
  }, [currentDate]);

  async function loadCalendarEvents() {
    try {
      setLoading(true);
      const events: CalendarEvent[] = [];

      // Get all active jobs
      const { data: jobs, error: jobsError } = await supabase
        .from('jobs')
        .select('id, name, client_name')
        .eq('status', 'active');

      if (jobsError) throw jobsError;

      // Get material order dates
      const { data: materials, error: materialsError } = await supabase
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
        .not('order_by_date', 'is', null)
        .or('delivery_date.not.is.null,pull_by_date.not.is.null');

      if (!materialsError && materials) {
        materials.forEach((material: any) => {
          const job = material.jobs;
          
          // Order by date
          if (material.order_by_date && material.status === 'not_ordered') {
            events.push({
              id: `order-${material.id}`,
              type: 'material_order',
              date: material.order_by_date,
              jobId: job.id,
              jobName: job.name,
              title: `Order: ${material.name}`,
              description: `Must order by this date`,
              status: material.status,
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
              title: `Delivery: ${material.name}`,
              description: `Expected delivery to shop`,
              status: material.status,
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
              title: `Pull: ${material.name}`,
              description: `Pull from shop for delivery`,
              status: material.status,
              priority: isPastDue(material.pull_by_date) ? 'high' : isUpcoming(material.pull_by_date) ? 'medium' : 'low',
            });
          }
        });
      }

      // Get completed tasks
      const { data: completedTasks, error: tasksError } = await supabase
        .from('completed_tasks')
        .select(`
          id,
          completed_date,
          notes,
          component_id,
          job_id,
          components!inner(id, name),
          jobs!inner(id, name, client_name)
        `);

      if (!tasksError && completedTasks) {
        completedTasks.forEach((task: any) => {
          events.push({
            id: `task-${task.id}`,
            type: 'task_completed',
            date: task.completed_date,
            jobId: task.jobs.id,
            jobName: task.jobs.name,
            title: `Completed: ${task.components.name}`,
            description: task.notes || 'Task completed',
            priority: 'low',
          });
        });
      }

      // Get calendar events (pickups, deliveries, order reminders)
      const { data: calendarEvents, error: calendarEventsError } = await supabase
        .from('calendar_events')
        .select(`
          id,
          title,
          description,
          event_date,
          event_type,
          job_id,
          jobs!inner(id, name, client_name)
        `)
        .in('event_type', ['material_pickup', 'material_delivery', 'material_order_reminder']);

      if (!calendarEventsError && calendarEvents) {
        calendarEvents.forEach((event: any) => {
          const job = event.jobs;
          
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
            title: event.title,
            description: event.description || '',
            priority: isPastDue(event.event_date) ? 'high' : isUpcoming(event.event_date) ? 'medium' : 'low',
          });
        });
      }

      // Get subcontractor schedules
      const { data: subcontractorSchedules, error: subError } = await supabase
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
        `);

      if (!subError && subcontractorSchedules) {
        subcontractorSchedules.forEach((schedule: any) => {
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
              title: `${schedule.subcontractors.name}${dateRangeStr}`,
              description: `${schedule.subcontractors.trades && schedule.subcontractors.trades.length > 0 ? schedule.subcontractors.trades.join(', ') : 'Subcontractor'}: ${schedule.work_description || 'Scheduled work'}`,
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

      setEvents(events);
    } catch (error: any) {
      console.error('Error loading calendar events:', error);
      toast.error('Failed to load calendar events');
    } finally {
      setLoading(false);
    }
  }

  function isPastDue(dateStr: string): boolean {
    const date = parseDateLocal(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date < today;
  }

  function isUpcoming(dateStr: string, days: number = 7): boolean {
    const date = parseDateLocal(dateStr);
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

  // Get upcoming events (next 30 days)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const upcomingEvents = events
    .filter(event => {
      const eventDate = parseDateLocal(event.date);
      const thirtyDaysFromNow = new Date(today);
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
      return eventDate >= today && eventDate <= thirtyDaysFromNow;
    })
    .sort((a, b) => parseDateLocal(a.date).getTime() - parseDateLocal(b.date).getTime());

  const EVENT_TYPE_CONFIG = {
    material_order: { icon: Package, label: 'Order Deadline', color: 'bg-yellow-500' },
    material_delivery: { icon: Truck, label: 'Delivery', color: 'bg-blue-500' },
    material_pull: { icon: Package, label: 'Pull from Shop', color: 'bg-purple-500' },
    material_pickup: { icon: Package, label: 'Pickup', color: 'bg-orange-500' },
    task_completed: { icon: ListChecks, label: 'Task Completed', color: 'bg-green-500' },
    task_deadline: { icon: AlertCircle, label: 'Task Deadline', color: 'bg-red-500' },
    subcontractor: { icon: CalendarIcon, label: 'Subcontractor', color: 'bg-indigo-500' },
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="text-center text-muted-foreground">
            <CalendarIcon className="w-12 h-12 mx-auto mb-4 opacity-50 animate-pulse" />
            <p>Loading calendar...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* View Mode Toggle */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <Button
            variant={viewMode === 'month' ? 'default' : 'outline'}
            onClick={() => setViewMode('month')}
            size="sm"
          >
            Month
          </Button>
          <Button
            variant={viewMode === 'agenda' ? 'default' : 'outline'}
            onClick={() => setViewMode('agenda')}
            size="sm"
          >
            Agenda
          </Button>
        </div>
        <Button onClick={loadCalendarEvents} variant="outline" size="sm">
          Refresh
        </Button>
      </div>

      {viewMode === 'month' ? (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <Button variant="outline" size="icon" onClick={previousMonth}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <CardTitle className="text-xl">{monthYear}</CardTitle>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={goToToday}>
                  Today
                </Button>
                <Button variant="outline" size="icon" onClick={nextMonth}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-2">
            {/* Calendar Grid */}
            <div className="grid grid-cols-7 gap-1">
              {/* Day headers */}
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                <div key={day} className="text-center font-semibold text-sm text-muted-foreground py-2">
                  {day}
                </div>
              ))}

              {/* Calendar days */}
              {calendarDays.map((day, index) => {
                if (!day) {
                  return <div key={`empty-${index}`} className="min-h-32 p-1 border rounded bg-muted/30" />;
                }

                const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const dayEvents = getEventsForDate(dateStr);
                const isToday = dateStr === new Date().toISOString().split('T')[0];
                const isSelected = dateStr === selectedDate;

                return (
                  <div
                    key={day}
                    className={`min-h-32 p-1 border rounded cursor-pointer transition-colors ${
                      isToday ? 'bg-primary/10 border-primary' : 'hover:bg-muted/50'
                    } ${isSelected ? 'ring-2 ring-primary' : ''}`}
                    onClick={() => {
                      setSelectedDate(dateStr);
                      setExpandedEventId(null); // Don't auto-expand
                      setShowDayView(true);
                    }}
                  >
                    <div className={`text-sm font-semibold mb-1 ${isToday ? 'text-primary' : ''}`}>
                      {day}
                    </div>
                    <div className="space-y-1">
                      {dayEvents.slice(0, 3).map(event => {
                        const config = EVENT_TYPE_CONFIG[event.type];
                        const Icon = config.icon;
                        return (
                          <div
                            key={event.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              // Open day dialog with this event auto-expanded
                              setSelectedDate(dateStr);
                              setExpandedEventId(event.id);
                              setShowDayView(true);
                            }}
                            className={`text-xs px-1.5 py-0.5 rounded truncate cursor-pointer hover:shadow-sm transition-shadow ${
                              event.priority === 'high' ? 'bg-destructive/20 text-destructive font-semibold' :
                              event.priority === 'medium' ? 'bg-warning/20 text-warning-foreground' :
                              'bg-muted text-muted-foreground'
                            }`}
                            title={`${event.title} - ${event.jobName}`}
                          >
                            <Icon className="w-3 h-3 inline mr-1" />
                            {event.title}
                          </div>
                        );
                      })}
                      {dayEvents.length > 3 && (
                        <div className="text-xs text-muted-foreground">
                          +{dayEvents.length - 3} more
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
                <h3 className="font-semibold mb-3">
                  {parseDateLocal(selectedDate).toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </h3>
                <div className="space-y-2">
                  {getEventsForDate(selectedDate).map(event => {
                    const config = EVENT_TYPE_CONFIG[event.type];
                    const Icon = config.icon;
                    const isMaterialEvent = event.type.startsWith('material_');
                    return (
                      <Card
                        key={event.id}
                        className={`cursor-pointer hover:shadow-md transition-shadow ${
                          event.priority === 'high' ? 'border-destructive' : ''
                        }`}
                        onClick={() => {
                          if (isMaterialEvent) {
                            setSelectedEvent(event);
                            setShowEventDialog(true);
                          } else {
                            onJobSelect?.(event.jobId);
                          }
                        }}
                      >
                        <CardContent className="py-3">
                          <div className="flex items-start gap-3">
                            <div className={`p-2 rounded-lg ${config.color} text-white`}>
                              <Icon className="w-4 h-4" />
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center justify-between mb-1">
                                <p className="font-semibold">{event.title}</p>
                                {event.priority === 'high' && (
                                  <Badge variant="destructive">Overdue</Badge>
                                )}
                              </div>
                              <p className="text-sm text-muted-foreground">{event.description}</p>
                              <p className="text-sm text-muted-foreground mt-1">
                                Job: {event.jobName}
                              </p>
                              {isMaterialEvent && (
                                <Badge variant="outline" className="mt-2 text-xs">
                                  Click to edit
                                </Badge>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                  {getEventsForDate(selectedDate).length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No events scheduled for this date
                    </p>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        /* Agenda View */
        <Card>
          <CardHeader>
            <CardTitle>Upcoming Events (Next 30 Days)</CardTitle>
          </CardHeader>
          <CardContent>
            {upcomingEvents.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <CalendarIcon className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No upcoming events in the next 30 days</p>
              </div>
            ) : (
              <div className="space-y-3">
                {upcomingEvents.map(event => {
                  const config = EVENT_TYPE_CONFIG[event.type];
                  const Icon = config.icon;
                  const eventDate = parseDateLocal(event.date);
                  const daysUntil = Math.ceil((eventDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                  const isMaterialEvent = event.type.startsWith('material_');
                  
                  return (
                    <Card
                      key={event.id}
                      className={`cursor-pointer hover:shadow-md transition-shadow ${
                        event.priority === 'high' ? 'border-destructive border-2' : ''
                      }`}
                      onClick={() => {
                        if (isMaterialEvent) {
                          setSelectedEvent(event);
                          setShowEventDialog(true);
                        } else {
                          onJobSelect?.(event.jobId);
                        }
                      }}
                    >
                      <CardContent className="py-4">
                        <div className="flex items-start gap-4">
                          <div className={`p-3 rounded-lg ${config.color} text-white`}>
                            <Icon className="w-5 h-5" />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-start justify-between mb-2">
                              <div>
                                <p className="font-bold text-lg">{event.title}</p>
                                <p className="text-sm text-muted-foreground">
                                  {eventDate.toLocaleDateString('en-US', {
                                    weekday: 'short',
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric',
                                  })}
                                </p>
                              </div>
                              <div className="text-right">
                                {event.priority === 'high' ? (
                                  <Badge variant="destructive">Overdue</Badge>
                                ) : daysUntil === 0 ? (
                                  <Badge variant="default">Today</Badge>
                                ) : daysUntil === 1 ? (
                                  <Badge variant="default">Tomorrow</Badge>
                                ) : (
                                  <Badge variant="secondary">In {daysUntil} days</Badge>
                                )}
                              </div>
                            </div>
                            <p className="text-sm text-muted-foreground mb-1">{event.description}</p>
                            <div className="flex items-center gap-2 mt-2">
                              <Badge variant="outline">{event.jobName}</Badge>
                              <Badge variant="outline">{config.label}</Badge>
                              {isMaterialEvent && (
                                <Badge variant="secondary" className="text-xs">Click to edit</Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-500 text-white">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {events.filter(e => e.priority === 'high').length}
                </p>
                <p className="text-sm text-muted-foreground">Overdue</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-yellow-500 text-white">
                <Package className="w-5 h-5" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {events.filter(e => e.type === 'material_order').length}
                </p>
                <p className="text-sm text-muted-foreground">To Order</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500 text-white">
                <Truck className="w-5 h-5" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {events.filter(e => e.type === 'material_delivery').length}
                </p>
                <p className="text-sm text-muted-foreground">Deliveries</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500 text-white">
                <ListChecks className="w-5 h-5" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {events.filter(e => e.type === 'task_completed').length}
                </p>
                <p className="text-sm text-muted-foreground">Completed</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

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

      {/* Day View Dialog */}
      <DayViewDialog
        date={selectedDate}
        open={showDayView}
        onClose={() => {
          setShowDayView(false);
          setSelectedDate(null);
        }}
        onUpdate={() => {
          loadCalendarEvents();
        }}
      />
    </div>
  );
}
