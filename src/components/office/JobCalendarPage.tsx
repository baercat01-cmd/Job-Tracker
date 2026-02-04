import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Calendar as CalendarIcon, ChevronLeft, ChevronRight, Package, ListChecks, Truck, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
// Import the global types to ensure consistency
import type { Job, CalendarEvent, CalendarEventType } from '@/types';
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
  // Using the global CalendarEvent type instead of a local one
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
      const calendarEvents: CalendarEvent[] = [];

      // Get material order dates
      const { data: materials, error: materialsError } = await supabase
        .from('materials')
        .select('id, name, order_by_date, delivery_date, pull_by_date, actual_delivery_date, status')
        .eq('job_id', job.id)
        .or('order_by_date.not.is.null,delivery_date.not.is.null,pull_by_date.not.is.null');

      if (!materialsError && materials) {
        materials.forEach((material: any) => {
          const common = {
            job_id: job.id,
            jobId: job.id, // UI helper
            jobName: job.name,
            all_day: true,
            start_time: null,
            end_time: null,
            created_by: 'system',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            materialId: material.id,
            status: material.status,
          };

          if (material.order_by_date && material.status === 'not_ordered') {
            calendarEvents.push({
              ...common,
              id: `order-${material.id}`,
              event_type: 'material_order',
              type: 'material_order', // UI helper
              event_date: material.order_by_date,
              date: material.order_by_date, // UI helper
              title: `Order: ${material.name}`,
              description: `Must order by this date`,
              priority: isPastDue(material.order_by_date) ? 'high' : isUpcoming(material.order_by_date) ? 'medium' : 'low',
            } as CalendarEvent);
          }

          if (material.delivery_date && material.status === 'ordered') {
            calendarEvents.push({
              ...common,
              id: `delivery-${material.id}`,
              event_type: 'material_delivery',
              type: 'material_delivery',
              event_date: material.delivery_date,
              date: material.delivery_date,
              title: `Delivery: ${material.name}`,
              description: `Expected delivery to shop`,
              priority: isPastDue(material.delivery_date) ? 'high' : isUpcoming(material.delivery_date) ? 'medium' : 'low',
            } as CalendarEvent);
          }

          if (material.pull_by_date && material.status === 'at_shop') {
            calendarEvents.push({
              ...common,
              id: `pull-${material.id}`,
              event_type: 'material_pull',
              type: 'material_pull',
              event_date: material.pull_by_date,
              date: material.pull_by_date,
              title: `Pull: ${material.name}`,
              description: `Pull from shop for delivery`,
              priority: isPastDue(material.pull_by_date) ? 'high' : isUpcoming(material.pull_by_date) ? 'medium' : 'low',
            } as CalendarEvent);
          }
        });
      }

      // Get completed tasks
      const { data: completedTasks, error: tasksError } = await supabase
        .from('completed_tasks')
        .select('id, completed_date, notes, component_id, components!inner(id, name)')
        .eq('job_id', job.id);

      if (!tasksError && completedTasks) {
        completedTasks.forEach((task: any) => {
          calendarEvents.push({
            id: `task-${task.id}`,
            event_type: 'task_completed',
            type: 'task_completed',
            event_date: task.completed_date,
            date: task.completed_date,
            job_id: job.id,
            jobId: job.id,
            jobName: job.name,
            title: `Completed: ${task.components.name}`,
            description: task.notes || 'Task completed',
            all_day: true,
            start_time: null,
            end_time: null,
            created_by: 'system',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            priority: 'low',
          } as CalendarEvent);
        });
      }

      // Get subcontractor schedules
      const { data: subcontractorSchedules, error: subError } = await supabase
        .from('subcontractor_schedules')
        .select(`
          id, start_date, end_date, work_description, notes, status,
          subcontractors!inner(id, name, phone, trades)
        `)
        .eq('job_id', job.id);

      if (!subError && subcontractorSchedules) {
        subcontractorSchedules.forEach((schedule: any) => {
          const startDate = parseDateLocal(schedule.start_date);
          const endDate = schedule.end_date ? parseDateLocal(schedule.end_date) : startDate;
          
          const dateRangeStr = endDate.getTime() !== startDate.getTime()
            ? ` (${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})`
            : '';

          const iterateDate = new Date(startDate);
          while (iterateDate <= endDate) {
            const dateStr = iterateDate.toISOString().split('T')[0];
            calendarEvents.push({
              id: `sub-${schedule.id}-${dateStr}`,
              event_type: 'subcontractor',
              type: 'subcontractor',
              event_date: dateStr,
              date: dateStr,
              job_id: job.id,
              jobId: job.id,
              jobName: job.name,
              title: `${schedule.subcontractors.name}${dateRangeStr}`,
              description: `${schedule.subcontractors.trades?.join(', ') || 'Subcontractor'}: ${schedule.work_description || 'Scheduled work'}`,
              subcontractorName: schedule.subcontractors.name,
              subcontractorPhone: schedule.subcontractors.phone,
              status: schedule.status,
              all_day: true,
              start_time: null,
              end_time: null,
              created_by: 'system',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              priority: schedule.status === 'cancelled' ? 'low' : isPastDue(schedule.start_date) && schedule.status === 'scheduled' ? 'high' : 'medium',
            } as CalendarEvent);
            iterateDate.setDate(iterateDate.getDate() + 1);
          }
        });
      }

      setEvents(calendarEvents);
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

  const getEventsForDate = (dateStr: string) => events.filter(event => (event.event_date === dateStr || event.date === dateStr));

  const previousMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1));
  const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1));
  const goToToday = () => setCurrentDate(new Date());

  async function handleDateDrop(event: CalendarEvent, newDateStr: string) {
    if (!event.materialId) {
      toast.error('Only material events can be moved');
      return;
    }

    try {
      let dateField = '';
      if (event.event_type === 'material_order') dateField = 'order_by_date';
      else if (event.event_type === 'material_delivery') dateField = 'delivery_date';
      else if (event.event_type === 'material_pull') dateField = 'pull_by_date';

      if (!dateField) return;

      const { error } = await supabase
        .from('materials')
        .update({ [dateField]: newDateStr, updated_at: new Date().toISOString() })
        .eq('id', event.materialId);

      if (error) throw error;
      toast.success('Event date updated');
      loadCalendarEvents();
    } catch (error: any) {
      toast.error('Update failed');
    }
  }

  const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
  const firstDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();
  const monthYear = currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const calendarDays: (number | null)[] = Array(firstDay).fill(null).concat(Array.from({ length: daysInMonth }, (_, i) => i + 1));

  const EVENT_TYPE_CONFIG: Record<string, { icon: any, label: string, color: string }> = {
    material_order: { icon: Package, label: 'Order Deadline', color: 'bg-yellow-500' },
    material_delivery: { icon: Truck, label: 'Delivery', color: 'bg-blue-500' },
    material_pull: { icon: Package, label: 'Pull from Shop', color: 'bg-purple-500' },
    task_completed: { icon: ListChecks, label: 'Task Completed', color: 'bg-green-500' },
    task_deadline: { icon: AlertCircle, label: 'Task Deadline', color: 'bg-red-500' },
    subcontractor: { icon: CalendarIcon, label: 'Subcontractor', color: 'bg-indigo-500' },
    meeting: { icon: CalendarIcon, label: 'Meeting', color: 'bg-orange-500' }
  };

  if (loading) {
    return (
      <div className="p-8 text-center">
        <CalendarIcon className="w-12 h-12 mx-auto animate-pulse text-muted-foreground" />
        <p className="mt-4">Loading calendar...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Back
        </Button>
        <div>
          <h2 className="text-2xl font-bold text-orange-700">{job.name}</h2>
          <p className="text-sm text-muted-foreground">Calendar View</p>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <Button variant="outline" size="icon" onClick={previousMonth}><ChevronLeft className="w-4 h-4" /></Button>
          <CardTitle className="text-xl">{monthYear}</CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={goToToday}>Today</Button>
            <Button variant="outline" size="icon" onClick={nextMonth}><ChevronRight className="w-4 h-4" /></Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-2">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
              <div key={d} className="text-center font-semibold text-sm py-2">{d}</div>
            ))}
            {calendarDays.map((day, index) => {
              if (!day) return <div key={`empty-${index}`} className="min-h-24 p-2 border rounded-lg bg-muted/30" />;
              
              const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
              const dateStr = date.toISOString().split('T')[0];
              const dayEvents = getEventsForDate(dateStr);
              const isToday = dateStr === new Date().toISOString().split('T')[0];

              return (
                <div
                  key={day}
                  className={`min-h-24 p-2 border rounded-lg cursor-pointer ${isToday ? 'bg-primary/5 border-primary' : 'hover:bg-muted/50'}`}
                  onClick={() => setSelectedDate(dateStr)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => draggedEvent && handleDateDrop(draggedEvent, dateStr)}
                >
                  <div className="text-sm font-semibold mb-1">{day}</div>
                  <div className="space-y-1">
                    {dayEvents.slice(0, 3).map(event => {
                      const config = EVENT_TYPE_CONFIG[event.event_type] || EVENT_TYPE_CONFIG.subcontractor;
                      const Icon = config.icon;
                      return (
                        <div
                          key={event.id}
                          draggable={!!event.materialId}
                          onDragStart={() => setDraggedEvent(event)}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedEvent(event);
                            setShowEventDialog(true);
                          }}
                          className={`text-[10px] px-1 py-0.5 rounded truncate flex items-center gap-1 ${
                            event.priority === 'high' ? 'bg-red-100 text-red-700' : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          <Icon className="w-2.5 h-2.5" /> {event.title}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {selectedDate && (
            <div className="mt-6 p-4 border-t space-y-3">
              <h3 className="font-bold">{new Date(selectedDate).toLocaleDateString()}</h3>
              {getEventsForDate(selectedDate).map(event => (
                <Card key={event.id} className="p-3 cursor-pointer" onClick={() => { setSelectedEvent(event); setShowEventDialog(true); }}>
                  <div className="flex gap-3">
                    <div className={`p-2 rounded ${EVENT_TYPE_CONFIG[event.event_type]?.color || 'bg-gray-500'} text-white`}>
                      {(() => { const Icon = EVENT_TYPE_CONFIG[event.event_type]?.icon || Package; return <Icon className="w-4 h-4" />; })()}
                    </div>
                    <div>
                      <p className="font-semibold text-sm">{event.title}</p>
                      <p className="text-xs text-muted-foreground">{event.description}</p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <EventDetailsDialog
        event={selectedEvent}
        open={showEventDialog}
        onClose={() => { setShowEventDialog(false); setSelectedEvent(null); }}
        onUpdate={loadCalendarEvents}
      />
    </div>
  );
}