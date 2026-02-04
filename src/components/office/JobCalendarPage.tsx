
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Calendar as CalendarIcon, ChevronLeft, ChevronRight, Package, ListChecks, Truck, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import type { Job, CalendarEvent, CalendarEventType, SharedCalendarEvent } from '@/types';
import { EventDetailsDialog } from './EventDetailsDialog';

// Helper function to parse date string as local date (not UTC)
function parseDateLocal(dateString: string): Date {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
}


interface JobCalendarPageProps {
  job: Job;
  onBack: () => void;
}

export function JobCalendarPage({ job, onBack }: JobCalendarPageProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [showEventDialog, setShowEventDialog] = useState(false);
  const [draggedEvent, setDraggedEvent] = useState<CalendarEvent | null>(null);

  useEffect(() => {
    loadCalendarEvents();
  }, [job.id, currentDate]);

  async function loadCalendarEvents() {
    try {
      setLoading(true);
      const events: CalendarEvent[] = [];

      // Get material order dates for this specific job
      const { data: materials, error: materialsError } = await supabase
        .from('materials')
        .select('id, name, order_by_date, delivery_date, pull_by_date, actual_delivery_date, status')
        .eq('job_id', job.id)
        .or('order_by_date.not.is.null,delivery_date.not.is.null,pull_by_date.not.is.null');

      if (!materialsError && materials) {
        materials.forEach((material: any) => {
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
              title: `Pull: ${material.name}`,
              description: `Pull from shop for delivery`,
              status: material.status,
              materialId: material.id,
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
        .eq('job_id', job.id);

      if (!tasksError && completedTasks) {
        completedTasks.forEach((task: any) => {
          events.push({
            id: `task-${task.id}`,
            type: 'task_completed',
            date: task.completed_date,
            jobId: job.id,
            jobName: job.name,
            title: `Completed: ${task.components.name}`,
            description: task.notes || 'Task completed',
            priority: 'low',
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
        .eq('job_id', job.id);

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
              type: 'subcontractor' as CalendarEventType,
              date: dateStr,
              jobId: job.id,
              jobName: job.name,
              title: `${schedule.subcontractors.name}${dateRangeStr}`,
              description: `${schedule.subcontractors.trades && schedule.subcontractors.trades.length > 0 ? schedule.subcontractors.trades.join(', ') : 'Subcontractor'}: ${schedule.work_description || 'Scheduled work'}`,
              subcontractorName: schedule.subcontractors.name,
              subcontractorPhone: schedule.subcontractors.phone,
              status: schedule.status,
              priority: schedule.status === 'cancelled' ? 'low' : isPastDue(schedule.start_date) && schedule.status === 'scheduled' ? 'high' : 'medium',
            } as SharedCalendarEvent);
            
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

  async function handleDateDrop(event: CalendarEvent, newDateStr: string) {
    if (!event.materialId) {
      toast.error('Only material events can be moved');
      return;
    }

    try {
      // Determine which date field to update based on event type
      let dateField = '';
      if (event.type === 'material_order') dateField = 'order_by_date';
      else if (event.type === 'material_delivery') dateField = 'delivery_date';
      else if (event.type === 'material_pull') dateField = 'pull_by_date';

      if (!dateField) {
        toast.error('Cannot move this type of event');
        return;
      }

      const { error } = await supabase
        .from('materials')
        .update({ 
          [dateField]: newDateStr,
          updated_at: new Date().toISOString() 
        })
        .eq('id', event.materialId);

      if (error) throw error;

      toast.success('Event date updated successfully');
      loadCalendarEvents();
    } catch (error: any) {
      console.error('Error updating event date:', error);
      toast.error('Failed to update event date');
    }
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
    subcontractor: { icon: CalendarIcon, label: 'Subcontractor', color: 'bg-indigo-500' },
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={onBack}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <h2 className="text-2xl font-bold">{job.name} - Calendar</h2>
        </div>
        <Card>
          <CardContent className="py-12">
            <div className="text-center text-muted-foreground">
              <CalendarIcon className="w-12 h-12 mx-auto mb-4 opacity-50 animate-pulse" />
              <p>Loading calendar...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with Back Button */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <div className="flex-1">
          <h2 className="text-2xl font-bold text-orange-700">{job.name}</h2>
          <p className="text-sm text-muted-foreground">Calendar View</p>
        </div>
      </div>

      {/* Calendar */}
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
                return <div key={`empty-${index}`} className="min-h-24 p-2 border rounded-lg bg-muted/30" />;
              }

              const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
              const dateStr = date.toISOString().split('T')[0]; // Format as YYYY-MM-DD
              const dayEvents = getEventsForDate(dateStr);
              const isToday = dateStr === new Date().toISOString().split('T')[0];
              const isSelected = dateStr === selectedDate;

              return (
                <div
                  key={day}
                  className={`min-h-24 p-2 border rounded-lg cursor-pointer transition-colors ${
                    isToday ? 'bg-primary/10 border-primary' : 'hover:bg-muted/50'
                  } ${isSelected ? 'ring-2 ring-primary' : ''}`}
                  onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.currentTarget.classList.add('bg-primary/20');
                  }}
                  onDragLeave={(e) => {
                    e.currentTarget.classList.remove('bg-primary/20');
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.currentTarget.classList.remove('bg-primary/20');
                    if (draggedEvent) {
                      handleDateDrop(draggedEvent, dateStr);
                      setDraggedEvent(null);
                    }
                  }}
                >
                  <div className={`text-sm font-semibold mb-1 ${isToday ? 'text-primary' : ''}`}>
                    {day}
                  </div>
                  <div className="space-y-1">
                    {dayEvents.slice(0, 3).map(event => {
                      const config = EVENT_TYPE_CONFIG[event.type];
                      const Icon = config.icon;
                      const isMaterialEvent = event.type.startsWith('material_');
                      return (
                        <div
                          key={event.id}
                          draggable={isMaterialEvent}
                          onDragStart={(e) => {
                            if (isMaterialEvent) {
                              setDraggedEvent(event);
                              e.currentTarget.classList.add('opacity-50');
                            }
                          }}
                          onDragEnd={(e) => {
                            e.currentTarget.classList.remove('opacity-50');
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedEvent(event);
                            setShowEventDialog(true);
                          }}
                          className={`text-xs px-1.5 py-0.5 rounded truncate cursor-pointer hover:shadow-md transition-all ${
                            event.priority === 'high' ? 'bg-destructive/20 text-destructive font-semibold' :
                            event.priority === 'medium' ? 'bg-warning/20 text-warning-foreground' :
                            'bg-muted text-muted-foreground'
                          }`}
                          title={`${event.title} - ${isMaterialEvent ? 'Drag to move date' : 'Click for details'}`}
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
                {new Date(selectedDate).toLocaleDateString('en-US', {
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
                      draggable={isMaterialEvent}
                      onDragStart={() => isMaterialEvent && setDraggedEvent(event)}
                      onClick={() => {
                        setSelectedEvent(event);
                        setShowEventDialog(true);
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
                            {event.subcontractorPhone && (
                              <p className="text-xs text-muted-foreground mt-1">
                                📞 {event.subcontractorPhone}
                              </p>
                            )}
                            {isMaterialEvent && (
                              <Badge variant="outline" className="mt-2 text-xs">
                                Drag to reschedule • Click to edit
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

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
        event={selectedEvent} // Pass the selected event to the dialog
        open={showEventDialog}
        onClose={() => {
          setShowEventDialog(false);
          setSelectedEvent(null);
        }}
        onUpdate={() => {
          loadCalendarEvents();
        }}
      />
    </div>
  );
}
