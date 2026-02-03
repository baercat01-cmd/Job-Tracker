import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar as CalendarIcon, Package, ListChecks, Truck, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
export type CalendarEventType = 
  | "task_completed" 
  | "material_order" 
  | "material_delivery" 
  | "material_pull" 
  | "task_deadline" 
  | "subcontractor" 
  | "material_pickup"
  | "meeting"; // This tells the app 'meeting' is allowed

// Helper function to parse date string as local date (not UTC)
function parseDateLocal(dateString: string): Date {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
}

interface CalendarEvent {
  id: string;
  type: 'material_order' | 'material_delivery' | 'material_pull' | 'material_pickup' | 'task_deadline' | 'task_completed' | 'subcontractor';
  date: string;
  title: string;
  description: string;
  status?: string;
  priority?: 'low' | 'medium' | 'high';
  subcontractorName?: string;
  subcontractorPhone?: string;
  assignedUserName?: string;
}

interface JobCalendarProps {
  jobId: string;
  showTitle?: boolean;
}

export function JobCalendar({ jobId, showTitle = true }: JobCalendarProps) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadJobEvents();
  }, [jobId]);

  async function loadJobEvents() {
    try {
      setLoading(true);
      const events: CalendarEvent[] = [];

      // Get material order dates for this job
      const { data: materials, error: materialsError } = await supabase
        .from('materials')
        .select('id, name, order_by_date, delivery_date, pull_by_date, actual_delivery_date, status')
        .eq('job_id', jobId)
        .or('order_by_date.not.is.null,delivery_date.not.is.null,pull_by_date.not.is.null');

      if (!materialsError && materials) {
        materials.forEach((material: any) => {
          // Order by date
          if (material.order_by_date && material.status === 'not_ordered') {
            events.push({
              id: `order-${material.id}`,
              type: 'material_order',
              date: material.order_by_date,
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
              title: `Delivery: ${material.name}`,
              description: `Expected delivery to shop`,
              status: material.status,
              priority: isPastDue(material.delivery_date) ? 'high' : isUpcoming(material.delivery_date) ? 'medium' : 'low',
            });
          }

          // Pull by date
          if (material.pull_by_date && material.status === 'ready_for_job') {
            events.push({
              id: `pull-${material.id}`,
              type: 'material_pull',
              date: material.pull_by_date,
              title: `Pull: ${material.name}`,
              description: `Pull from shop for delivery`,
              status: material.status,
              priority: isPastDue(material.pull_by_date) ? 'high' : isUpcoming(material.pull_by_date) ? 'medium' : 'low',
            });
          }
        });
      }

      // Get completed tasks for this job
      const { data: completedTasks, error: tasksError } = await supabase
        .from('completed_tasks')
        .select(`
          id,
          completed_date,
          notes,
          component_id,
          components!inner(id, name)
        `)
        .eq('job_id', jobId);

      if (!tasksError && completedTasks) {
        completedTasks.forEach((task: any) => {
          events.push({
            id: `task-${task.id}`,
            type: 'task_completed',
            date: task.completed_date,
            title: `Completed: ${task.components.name}`,
            description: task.notes || 'Task completed',
            priority: 'low',
          });
        });
      }

      // Get calendar events (pickups, deliveries, order reminders)
      const { data: calendarEvents, error: calendarEventsError } = await supabase
        .from('calendar_events')
        .select('id, title, description, event_date, event_type')
        .eq('job_id', jobId)
        .in('event_type', ['material_pickup', 'material_delivery', 'material_order_reminder']);

      if (!calendarEventsError && calendarEvents) {
        calendarEvents.forEach((event: any) => {
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
            title: event.title,
            description: event.description || '',
            priority: isPastDue(event.event_date) ? 'high' : isUpcoming(event.event_date) ? 'medium' : 'low',
          });
        });
      }

      // Get subcontractor schedules for this job
      const { data: subcontractorSchedules, error: subError } = await supabase
        .from('subcontractor_schedules')
        .select(`
          id,
          start_date,
          end_date,
          work_description,
          notes,
          status,
          subcontractors!inner(id, name, phone, trades)
        `)
        .eq('job_id', jobId);

      if (!subError && subcontractorSchedules) {
        subcontractorSchedules.forEach((schedule: any) => {
          const startDate = parseDateLocal(schedule.start_date);
          const endDate = schedule.end_date ? parseDateLocal(schedule.end_date) : startDate;
          
          // Create date range string for display
          const dateRangeStr = endDate.getTime() !== startDate.getTime()
            ? ` (${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})`
            : '';

          // Add event for each day in the range (skip weekends)
          const currentDate = new Date(startDate);
          while (currentDate <= endDate) {
            const dayOfWeek = currentDate.getDay();
            const dateStr = currentDate.toISOString().split('T')[0];
            
            // Only add event if it's not a weekend (0 = Sunday, 6 = Saturday)
            if (dayOfWeek !== 0 && dayOfWeek !== 6) {
              events.push({
                id: `sub-${schedule.id}-${dateStr}`,
                type: 'subcontractor',
                date: dateStr,
                title: `${schedule.subcontractors.name}${dateRangeStr}`,
                description: `${schedule.subcontractors.trades && schedule.subcontractors.trades.length > 0 ? schedule.subcontractors.trades.join(', ') : 'Subcontractor'}: ${schedule.work_description || 'Scheduled work'}`,
                subcontractorName: schedule.subcontractors.name,
                subcontractorPhone: schedule.subcontractors.phone,
                status: schedule.status,
                priority: schedule.status === 'cancelled' ? 'low' : isPastDue(schedule.start_date) && schedule.status === 'scheduled' ? 'high' : 'medium',
              });
            }
            
            // Move to next day
            currentDate.setDate(currentDate.getDate() + 1);
          }
        });
      }

      setEvents(events);
    } catch (error: any) {
      console.error('Error loading job events:', error);
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

  const EVENT_TYPE_CONFIG = {
    material_order: { icon: Package, label: 'Order Deadline', color: 'bg-yellow-500' },
    material_delivery: { icon: Truck, label: 'Delivery', color: 'bg-blue-500' },
    material_pull: { icon: Package, label: 'Pull from Shop', color: 'bg-purple-500' },
    material_pickup: { icon: Package, label: 'Pickup', color: 'bg-orange-500' },
    task_completed: { icon: ListChecks, label: 'Task Completed', color: 'bg-green-500' },
    task_deadline: { icon: AlertCircle, label: 'Task Deadline', color: 'bg-red-500' },
    subcontractor: { icon: CalendarIcon, label: 'Subcontractor', color: 'bg-indigo-500' },
  };

  // Get upcoming events (next 30 days)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const upcomingEvents = events
    .filter(event => {
      const eventDate = new Date(event.date);
      const thirtyDaysFromNow = new Date(today);
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
      return eventDate >= today && eventDate <= thirtyDaysFromNow;
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(0, 5); // Show max 5 upcoming events

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="text-center text-muted-foreground">
            <CalendarIcon className="w-8 h-8 mx-auto mb-2 opacity-50 animate-pulse" />
            <p className="text-sm">Loading calendar...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (upcomingEvents.length === 0) {
    return (
      <Card>
        {showTitle && (
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarIcon className="w-4 h-4" />
              Upcoming Events
            </CardTitle>
          </CardHeader>
        )}
        <CardContent className={showTitle ? '' : 'py-8'}>
          <div className="text-center text-muted-foreground">
            <CalendarIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No upcoming events in the next 30 days</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      {showTitle && (
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarIcon className="w-4 h-4" />
            Upcoming Events
          </CardTitle>
        </CardHeader>
      )}
      <CardContent className={showTitle ? 'space-y-2' : 'space-y-2 pt-6'}>
        {upcomingEvents.map(event => {
          const config = EVENT_TYPE_CONFIG[event.type];
          const Icon = config.icon;
          const eventDate = new Date(event.date);
          const daysUntil = Math.ceil((eventDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          
          return (
            <div
              key={event.id}
              className={`p-3 border-2 rounded-lg ${
                event.priority === 'high' ? 'border-destructive bg-destructive/5' : 'border-border'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`p-2 rounded ${config.color} text-white`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <p className="font-semibold text-sm leading-tight">{event.title}</p>
                    {event.priority === 'high' ? (
                      <Badge variant="destructive" className="text-xs shrink-0">Overdue</Badge>
                    ) : daysUntil === 0 ? (
                      <Badge variant="default" className="text-xs shrink-0">Today</Badge>
                    ) : daysUntil === 1 ? (
                      <Badge variant="default" className="text-xs shrink-0">Tomorrow</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs shrink-0">{daysUntil}d</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mb-1">{event.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {eventDate.toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </p>
                  {event.subcontractorPhone && (
                    <p className="text-xs text-muted-foreground mt-1">
                      📞 {event.subcontractorPhone}
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        
        {events.length > 5 && (
          <p className="text-xs text-muted-foreground text-center pt-2">
            +{events.length - 5} more event{events.length - 5 !== 1 ? 's' : ''} in the next 30 days
          </p>
        )}
      </CardContent>
    </Card>
  );
}
