import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar as CalendarIcon, Package, Truck, AlertCircle, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import type { Job, SharedCalendarEvent } from '@/types';

interface UpcomingEventsWidgetProps {
  userId: string;
  onJobSelect?: (job: Job) => void;
}

export function UpcomingEventsWidget({ userId, onJobSelect }: UpcomingEventsWidgetProps) {
  const [events, setEvents] = useState<SharedCalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUpcomingEvents();
  }, [userId]);

  async function loadUpcomingEvents() {
    try {
      setLoading(true);
      const events: SharedCalendarEvent[] = [];

      // Get user's assigned jobs or all active jobs
      const { data: assignments } = await supabase
        .from('job_assignments')
        .select('job_id')
        .eq('user_id', userId);

      const assignedJobIds = assignments?.map(a => a.job_id) || [];

      // Get jobs (either assigned or all active if no assignments)
      let jobsQuery = supabase
        .from('jobs')
        .select('id, name, client_name')
        .eq('status', 'active');

      if (assignedJobIds.length > 0) {
        jobsQuery = jobsQuery.in('id', assignedJobIds);
      }

      const { data: jobs, error: jobsError } = await jobsQuery;
      if (jobsError) throw jobsError;

      if (!jobs || jobs.length === 0) {
        setEvents([]);
        setLoading(false);
        return;
      }

      const jobIds = jobs.map(j => j.id);

      // Get material dates
      const { data: materials, error: materialsError } = await supabase
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
        .in('job_id', jobIds)
        .or('order_by_date.not.is.null,delivery_date.not.is.null,pull_by_date.not.is.null');

      if (!materialsError && materials) {
        materials.forEach((material: any) => {
          const job = material.jobs;
          
          if (material.order_by_date && material.status === 'not_ordered') {
            events.push({
              id: `order-${material.id}`,
              type: 'material_order',
              date: material.order_by_date,
              jobId: job.id,
              jobName: job.name,
              title: material.name,
              description: 'Must order by this date',
              priority: isPastDue(material.order_by_date) ? 'high' : isUpcoming(material.order_by_date) ? 'medium' : 'low',
            });
          }

          if (material.delivery_date && material.status === 'ordered') {
            events.push({
              id: `delivery-${material.id}`,
              type: 'material_delivery',
              date: material.delivery_date,
              jobId: job.id,
              jobName: job.name,
              title: material.name,
              description: 'Expected delivery to shop',
              priority: isPastDue(material.delivery_date) ? 'high' : isUpcoming(material.delivery_date) ? 'medium' : 'low',
            });
          }

          if (material.pull_by_date && material.status === 'at_shop') {
            events.push({
              id: `pull-${material.id}`,
              type: 'material_pull',
              date: material.pull_by_date,
              jobId: job.id,
              jobName: job.name,
              title: material.name,
              description: 'Pull from shop for delivery',
              priority: isPastDue(material.pull_by_date) ? 'high' : isUpcoming(material.pull_by_date) ? 'medium' : 'low',
            });
          }
        });
      }

      setEvents(events);
    } catch (error: any) {
      console.error('Error loading upcoming events:', error);
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

  async function handleEventClick(event: SharedCalendarEvent) {
    if (!onJobSelect) return;

    try {
      const { data: job, error } = await supabase
        .from('jobs')
        .select('*')
        .eq('id', event.jobId)
        .single();

      if (error) throw error;
      if (job) onJobSelect(job);
    } catch (error) {
      console.error('Error loading job:', error);
      toast.error('Failed to load job');
    }
  }

  const EVENT_TYPE_CONFIG = {
    material_order: { icon: Package, label: 'Order', color: 'bg-yellow-500' },
    material_delivery: { icon: Truck, label: 'Delivery', color: 'bg-blue-500' },
    material_pull: { icon: Package, label: 'Pull', color: 'bg-purple-500' },
  };

  // Get upcoming events (next 14 days)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const upcomingEvents = events
    .filter(event => {
      const eventDate = new Date(event.date);
      const fourteenDaysFromNow = new Date(today);
      fourteenDaysFromNow.setDate(fourteenDaysFromNow.getDate() + 14);
      return eventDate >= today && eventDate <= fourteenDaysFromNow;
    })
    .sort((a, b) => {
      // Sort by priority first (high > medium > low), then by date
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      const aPriority = priorityOrder[a.priority || 'low'];
      const bPriority = priorityOrder[b.priority || 'low'];
      
      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }
      
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    })
    .slice(0, 3); // Show max 3 most important events

  if (loading) {
    return (
      <Card className="border-2 border-primary/20">
        <CardContent className="py-6">
          <div className="text-center text-muted-foreground">
            <CalendarIcon className="w-8 h-8 mx-auto mb-2 opacity-50 animate-pulse" />
            <p className="text-sm">Loading events...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (upcomingEvents.length === 0) {
    return (
      <Card className="border-2 border-primary/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarIcon className="w-4 h-4 text-primary" />
            Upcoming Events
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground py-4">
            <CalendarIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No events in the next 2 weeks</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-2 border-primary/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <CalendarIcon className="w-4 h-4 text-primary" />
          Upcoming Events
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {upcomingEvents.map(event => {
          const config = EVENT_TYPE_CONFIG[event.type];
          const Icon = config.icon;
          const eventDate = new Date(event.date);
          const daysUntil = Math.ceil((eventDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          
          return (
            <div
              key={event.id}
              onClick={() => handleEventClick(event)}
              className={`p-3 border-2 rounded-lg cursor-pointer hover:shadow-md transition-all ${
                event.priority === 'high' ? 'border-destructive bg-destructive/5' : 'border-border hover:bg-muted/50'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded ${config.color} text-white shrink-0`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">{event.title}</p>
                      <p className="text-xs text-muted-foreground truncate">{event.jobName}</p>
                    </div>
                    {event.priority === 'high' ? (
                      <Badge variant="destructive" className="text-xs shrink-0">
                        <AlertCircle className="w-3 h-3 mr-1" />
                        Overdue
                      </Badge>
                    ) : daysUntil === 0 ? (
                      <Badge variant="default" className="text-xs shrink-0">Today</Badge>
                    ) : daysUntil === 1 ? (
                      <Badge variant="default" className="text-xs shrink-0">Tomorrow</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs shrink-0">{daysUntil}d</Badge>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <Badge variant="outline" className="text-xs">
                      {config.label}
                    </Badge>
                    <span className="text-muted-foreground">
                      {eventDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
