import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Clock, Users, Calendar, ChevronDown, ChevronRight, TrendingUp, Target, Camera, FileText, AlertCircle, Package, Activity, Briefcase, Building2, MapPin, FileCheck } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MaterialsManagement } from './MaterialsManagement';
import { useAuth } from '@/hooks/useAuth';
import type { Job } from '@/types';

interface JobDetailedViewProps {
  job: Job;
}

interface ComponentWorkEntry {
  id: string;
  component_id: string;
  component_name: string;
  start_time: string;
  end_time: string;
  total_hours: number;
  crew_count: number;
  is_manual: boolean;
  notes: string | null;
  worker_names: string[] | null;
  user_name: string;
  photos: Array<{
    id: string;
    photo_url: string;
    caption: string | null;
  }>;
}

interface ComponentSummary {
  component_id: string;
  component_name: string;
  total_duration: number;
  total_man_hours: number;
  entry_count: number;
  entries: ComponentWorkEntry[];
}

interface DateGroup {
  date: string;
  total_man_hours: number;
  components: ComponentSummary[];
}

interface ComponentGroup {
  component_id: string;
  component_name: string;
  total_duration: number;
  total_man_hours: number;
  entry_count: number;
  dates: DateSummary[];
}

interface DateSummary {
  date: string;
  total_duration: number;
  total_man_hours: number;
  entries: ComponentWorkEntry[];
}

interface PersonGroup {
  user_name: string;
  total_duration: number;
  total_man_hours: number;
  entry_count: number;
  dates: DateSummary[];
  component_hours: number;
  clock_in_hours: number;
}

interface DailyLog {
  id: string;
  log_date: string;
  weather: string | null;
  weather_details: any;
  crew_count: number | null;
  components_worked: any[];
  time_summary: any[];
  issues: any[];
  material_requests_structured: any[];
  client_summary: string | null;
  final_notes: string | null;
  user_name: string;
  created_at: string;
}

export function JobDetailedView({ job }: JobDetailedViewProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [dateGroups, setDateGroups] = useState<DateGroup[]>([]);
  const [componentGroups, setComponentGroups] = useState<ComponentGroup[]>([]);
  const [personGroups, setPersonGroups] = useState<PersonGroup[]>([]);
  const [dailyLogs, setDailyLogs] = useState<DailyLog[]>([]);
  const [totalDuration, setTotalDuration] = useState(0);
  const [totalManHours, setTotalManHours] = useState(0);
  const [totalClockInHours, setTotalClockInHours] = useState(0);
  const [totalComponentHours, setTotalComponentHours] = useState(0);
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());
  const [expandedComponents, setExpandedComponents] = useState<Set<string>>(new Set());
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'date' | 'component' | 'person'>('date');
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [photoCount, setPhotoCount] = useState(0);
  const [materialCount, setMaterialCount] = useState(0);
  const [issueCount, setIssueCount] = useState(0);
  const [crewMembers, setCrewMembers] = useState<string[]>([]);
  const [firstWorkDate, setFirstWorkDate] = useState<string | null>(null);
  const [lastWorkDate, setLastWorkDate] = useState<string | null>(null);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);

  function toggleDate(date: string) {
    setExpandedDates(prev => {
      const next = new Set(prev);
      if (next.has(date)) {
        next.delete(date);
      } else {
        next.add(date);
      }
      return next;
    });
  }

  function toggleComponent(componentKey: string) {
    setExpandedComponents(prev => {
      const next = new Set(prev);
      if (next.has(componentKey)) {
        next.delete(componentKey);
      } else {
        next.add(componentKey);
      }
      return next;
    });
  }

  function toggleLog(logId: string) {
    setExpandedLogs(prev => {
      const next = new Set(prev);
      if (next.has(logId)) {
        next.delete(logId);
      } else {
        next.add(logId);
      }
      return next;
    });
  }

  function expandAllComponents() {
    const allDates = new Set(dateGroups.map(g => g.date));
    const allComponents = new Set<string>();
    dateGroups.forEach(dateGroup => {
      dateGroup.components.forEach(comp => {
        allComponents.add(`${dateGroup.date}-${comp.component_id}`);
      });
    });
    setExpandedDates(allDates);
    setExpandedComponents(allComponents);
  }

  function collapseAllComponents() {
    setExpandedDates(new Set());
    setExpandedComponents(new Set());
  }

  function expandAllLogs() {
    setExpandedLogs(new Set(dailyLogs.map(l => l.id)));
  }

  function collapseAllLogs() {
    setExpandedLogs(new Set());
  }

  useEffect(() => {
    loadData();
    loadNotifications();
    
    // Subscribe to new notifications
    const subscription = supabase
      .channel('job_notifications')
      .on('postgres_changes', 
        { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'notifications',
          filter: `job_id=eq.${job.id}`
        }, 
        () => {
          loadNotifications();
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [job.id]);

  async function loadData() {
    setLoading(true);
    try {
      await Promise.all([
        loadComponentWork(),
        loadDailyLogs(),
        loadJobStats(),
        loadRecentActivity(),
      ]);
    } catch (error) {
      console.error('Error loading job details:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadJobStats() {
    try {
      // Load photos count
      const { data: photosData } = await supabase
        .from('photos')
        .select('id')
        .eq('job_id', job.id);
      setPhotoCount(photosData?.length || 0);

      // Load materials count
      const { data: materialsData } = await supabase
        .from('materials')
        .select('id')
        .eq('job_id', job.id);
      setMaterialCount(materialsData?.length || 0);

      // Load issues from daily logs
      const { data: logsData } = await supabase
        .from('daily_logs')
        .select('issues')
        .eq('job_id', job.id);
      const totalIssues = (logsData || []).reduce((sum, log) => {
        return sum + (Array.isArray(log.issues) ? log.issues.length : 0);
      }, 0);
      setIssueCount(totalIssues);
    } catch (error) {
      console.error('Error loading job stats:', error);
    }
  }

  async function loadRecentActivity() {
    try {
      const activities: any[] = [];

      // Get recent time entries
      const { data: timeEntries } = await supabase
        .from('time_entries')
        .select(`
          *,
          components(name),
          user_profiles(username)
        `)
        .eq('job_id', job.id)
        .order('created_at', { ascending: false })
        .limit(5);

      (timeEntries || []).forEach((entry: any) => {
        activities.push({
          type: 'time_entry',
          timestamp: entry.created_at,
          description: `${entry.user_profiles?.username || 'Unknown'} logged ${entry.total_hours?.toFixed(2)}h on ${entry.components?.name || 'Unknown'}`,
          icon: 'clock',
        });
      });

      // Get recent photos
      const { data: photos } = await supabase
        .from('photos')
        .select(`
          *,
          user_profiles(username)
        `)
        .eq('job_id', job.id)
        .order('created_at', { ascending: false })
        .limit(3);

      (photos || []).forEach((photo: any) => {
        activities.push({
          type: 'photo',
          timestamp: photo.created_at,
          description: `${photo.user_profiles?.username || 'Unknown'} uploaded a photo`,
          icon: 'camera',
        });
      });

      // Get recent logs
      const { data: logs } = await supabase
        .from('daily_logs')
        .select(`
          *,
          user_profiles(username)
        `)
        .eq('job_id', job.id)
        .order('created_at', { ascending: false })
        .limit(3);

      (logs || []).forEach((log: any) => {
        activities.push({
          type: 'daily_log',
          timestamp: log.created_at,
          description: `${log.user_profiles?.username || 'Unknown'} submitted daily log`,
          icon: 'file',
        });
      });

      // Sort by timestamp and take top 10
      activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setRecentActivity(activities.slice(0, 10));
    } catch (error) {
      console.error('Error loading recent activity:', error);
    }
  }

  async function loadNotifications() {
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('job_id', job.id)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      setNotifications(data || []);
      setUnreadCount((data || []).filter(n => !n.is_read).length);
    } catch (error) {
      console.error('Error loading notifications:', error);
    }
  }

  async function handleNotificationClick(notification: any) {
    // Mark as read
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notification.id);

    loadNotifications();
  }

  async function loadComponentWork() {
    try {
      const { data, error } = await supabase
        .from('time_entries')
        .select(`
          *,
          components(name),
          user_profiles(username),
          photos:photos!time_entry_id(id, photo_url, caption)
        `)
        .eq('job_id', job.id)
        .order('start_time', { ascending: false });

      if (error) throw error;

      // Group by date, then by component (for date view)
      const dateMap = new Map<string, Map<string, ComponentSummary>>();
      // Group by component, then by date (for component view)
      const componentMap = new Map<string, Map<string, DateSummary>>();
      // Group by person, then by date (for person view)
      const personMap = new Map<string, Map<string, DateSummary>>();

      // Track totals for clock-in and component time
      let clockInManHours = 0;
      let componentManHours = 0;

      (data || []).forEach((entry: any) => {
        const date = new Date(entry.start_time).toISOString().split('T')[0];
        const componentId = entry.component_id;
        const componentName = entry.components?.name || 'Unknown Component';
        const userName = entry.user_profiles?.username || 'Unknown';
        const duration = entry.total_hours || 0;
        const crewCount = entry.crew_count || 1;
        const manHours = duration * crewCount;

        // Track clock-in vs component hours
        if (componentId === null) {
          clockInManHours += manHours;
        } else {
          componentManHours += manHours;
        }

        const workEntry: ComponentWorkEntry = {
          id: entry.id,
          component_id: componentId,
          component_name: componentName,
          start_time: entry.start_time,
          end_time: entry.end_time,
          total_hours: duration,
          crew_count: crewCount,
          is_manual: entry.is_manual,
          notes: entry.notes,
          worker_names: entry.worker_names,
          user_name: userName,
          photos: entry.photos || [],
        };

        // Date view grouping
        if (!dateMap.has(date)) {
          dateMap.set(date, new Map());
        }
        const componentsForDate = dateMap.get(date)!;
        if (componentsForDate.has(componentId)) {
          const existing = componentsForDate.get(componentId)!;
          existing.total_duration += duration;
          existing.total_man_hours += manHours;
          existing.entry_count += 1;
          existing.entries.push(workEntry);
        } else {
          componentsForDate.set(componentId, {
            component_id: componentId,
            component_name: componentName,
            total_duration: duration,
            total_man_hours: manHours,
            entry_count: 1,
            entries: [workEntry],
          });
        }

        // Component view grouping
        if (!componentMap.has(componentId)) {
          componentMap.set(componentId, new Map());
        }
        const datesForComponent = componentMap.get(componentId)!;
        if (datesForComponent.has(date)) {
          const existing = datesForComponent.get(date)!;
          existing.total_duration += duration;
          existing.total_man_hours += manHours;
          existing.entries.push(workEntry);
        } else {
          datesForComponent.set(date, {
            date,
            total_duration: duration,
            total_man_hours: manHours,
            entries: [workEntry],
          });
        }

        // Person view grouping
        if (!personMap.has(userName)) {
          personMap.set(userName, new Map());
        }
        const datesForPerson = personMap.get(userName)!;
        if (datesForPerson.has(date)) {
          const existing = datesForPerson.get(date)!;
          existing.total_duration += duration;
          existing.total_man_hours += manHours;
          existing.entries.push(workEntry);
        } else {
          datesForPerson.set(date, {
            date,
            total_duration: duration,
            total_man_hours: manHours,
            entries: [workEntry],
          });
        }
      });

      // Convert date view to array
      const dateGroupsArray: DateGroup[] = Array.from(dateMap.entries())
        .map(([date, componentsMap]) => {
          const components = Array.from(componentsMap.values()).sort(
            (a, b) => b.total_man_hours - a.total_man_hours
          );
          const total_man_hours = components.reduce((sum, c) => sum + c.total_man_hours, 0);
          return {
            date,
            total_man_hours,
            components,
          };
        })
        .sort((a, b) => b.date.localeCompare(a.date));

      setDateGroups(dateGroupsArray);

      // Convert component view to array
      const componentGroupsArray: ComponentGroup[] = Array.from(componentMap.entries())
        .map(([componentId, datesMap]) => {
          const dates = Array.from(datesMap.entries())
            .map(([date, summary]) => summary)
            .sort((a, b) => b.date.localeCompare(a.date));
          const total_duration = dates.reduce((sum, d) => sum + d.total_duration, 0);
          const total_man_hours = dates.reduce((sum, d) => sum + d.total_man_hours, 0);
          const entry_count = dates.reduce((sum, d) => sum + d.entries.length, 0);
          const componentName = dates[0]?.entries[0]?.component_name || 'Unknown';
          return {
            component_id: componentId,
            component_name: componentName,
            total_duration,
            total_man_hours,
            entry_count,
            dates,
          };
        })
        .sort((a, b) => b.total_man_hours - a.total_man_hours);

      setComponentGroups(componentGroupsArray);

      // Convert person view to array
      const personGroupsArray: PersonGroup[] = Array.from(personMap.entries())
        .map(([userName, datesMap]) => {
          const dates = Array.from(datesMap.entries())
            .map(([date, summary]) => summary)
            .sort((a, b) => b.date.localeCompare(a.date));
          const total_duration = dates.reduce((sum, d) => sum + d.total_duration, 0);
          const total_man_hours = dates.reduce((sum, d) => sum + d.total_man_hours, 0);
          const entry_count = dates.reduce((sum, d) => sum + d.entries.length, 0);
          
          // Calculate component vs clock-in hours for this user
          let component_hours = 0;
          let clock_in_hours = 0;
          dates.forEach(dateSummary => {
            dateSummary.entries.forEach(entry => {
              const entryManHours = entry.total_hours * entry.crew_count;
              if (entry.component_id === null) {
                clock_in_hours += entryManHours;
              } else {
                component_hours += entryManHours;
              }
            });
          });
          
          return {
            user_name: userName,
            total_duration,
            total_man_hours,
            entry_count,
            dates,
            component_hours,
            clock_in_hours,
          };
        })
        .sort((a, b) => b.total_man_hours - a.total_man_hours);

      setPersonGroups(personGroupsArray);
      
      const totalDur = dateGroupsArray.reduce(
        (sum, dg) => sum + dg.components.reduce((s, c) => s + c.total_duration, 0), 
        0
      );
      const totalMan = dateGroupsArray.reduce((sum, dg) => sum + dg.total_man_hours, 0);
      
      setTotalDuration(totalDur);
      setTotalManHours(totalMan);
      setTotalClockInHours(clockInManHours);
      setTotalComponentHours(componentManHours);

      // Extract crew members
      const uniqueUsers = new Set<string>();
      (data || []).forEach((entry: any) => {
        if (entry.user_profiles?.username) {
          uniqueUsers.add(entry.user_profiles.username);
        }
      });
      setCrewMembers(Array.from(uniqueUsers));

      // Get first and last work dates
      if (data && data.length > 0) {
        const dates = data.map((entry: any) => new Date(entry.start_time).getTime());
        const minDate = new Date(Math.min(...dates));
        const maxDate = new Date(Math.max(...dates));
        setFirstWorkDate(minDate.toISOString().split('T')[0]);
        setLastWorkDate(maxDate.toISOString().split('T')[0]);
      }
    } catch (error) {
      console.error('Error loading component work:', error);
    }
  }

  async function loadDailyLogs() {
    try {
      const { data, error } = await supabase
        .from('daily_logs')
        .select(`
          *,
          user_profiles(username)
        `)
        .eq('job_id', job.id)
        .order('log_date', { ascending: false });

      if (error) throw error;

      const logs: DailyLog[] = (data || []).map((log: any) => ({
        id: log.id,
        log_date: log.log_date,
        weather: log.weather,
        weather_details: log.weather_details,
        crew_count: log.crew_count,
        components_worked: log.components_worked || [],
        time_summary: log.time_summary || [],
        issues: log.issues || [],
        material_requests_structured: log.material_requests_structured || [],
        client_summary: log.client_summary,
        final_notes: log.final_notes,
        user_name: log.user_profiles?.username || 'Unknown',
        created_at: log.created_at,
      }));

      setDailyLogs(logs);
    } catch (error) {
      console.error('Error loading daily logs:', error);
    }
  }

  function formatDate(dateString: string): string {
    // Parse as local date by adding time component
    const date = new Date(dateString + 'T12:00:00');
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: 'numeric'
    });
  }

  function formatTime(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true
    });
  }

  function formatTimeAgo(timestamp: string): string {
    const now = Date.now();
    const time = new Date(timestamp).getTime();
    const diff = now - time;
    
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return formatDate(timestamp.split('T')[0]);
  }

  function calculateDaysActive(): number {
    if (!firstWorkDate || !lastWorkDate) return 0;
    const start = new Date(firstWorkDate).getTime();
    const end = new Date(lastWorkDate).getTime();
    return Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
  }

  function renderWorkEntry(entry: ComponentWorkEntry) {
    return (
      <div
        key={entry.id}
        className="bg-muted/50 rounded-md p-3 space-y-2"
      >
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              {viewMode === 'person' && (
                <span className="font-medium text-sm">{entry.component_name}</span>
              )}
              {entry.is_manual && (
                <Badge variant="outline" className="text-xs">
                  Manual
                </Badge>
              )}
              {!entry.is_manual && (
                <span className="text-sm text-muted-foreground">
                  {formatTime(entry.start_time)} - {formatTime(entry.end_time)}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              By {entry.user_name}
            </p>
          </div>
          <div className="text-right">
            <p className="font-bold">{(entry.total_hours * entry.crew_count).toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">man-hours</p>
            <p className="text-xs text-muted-foreground">{entry.crew_count} crew</p>
          </div>
        </div>

        {entry.worker_names && entry.worker_names.length > 0 && (
          <div className="pt-2 border-t">
            <p className="text-xs font-medium text-muted-foreground mb-1">Workers:</p>
            <div className="flex flex-wrap gap-1">
              {entry.worker_names.map((name, idx) => (
                <Badge key={idx} variant="secondary" className="text-xs">
                  {name}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {entry.photos && entry.photos.length > 0 && (
          <div className="pt-2 border-t">
            <p className="text-xs font-medium text-muted-foreground mb-2">Photos ({entry.photos.length}):</p>
            <div className="grid grid-cols-3 gap-2">
              {entry.photos.map((photo) => (
                <a
                  key={photo.id}
                  href={photo.photo_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="aspect-square rounded-lg overflow-hidden border hover:opacity-80 transition-opacity"
                >
                  <img
                    src={photo.photo_url}
                    alt={photo.caption || 'Time entry photo'}
                    className="w-full h-full object-cover"
                  />
                </a>
              ))}
            </div>
          </div>
        )}

        {entry.notes && (
          <div className="pt-2 border-t">
            <p className="text-xs font-medium text-muted-foreground mb-1">Notes:</p>
            <p className="text-sm">{entry.notes}</p>
          </div>
        )}
      </div>
    );
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading job dashboard...</p>
        </CardContent>
      </Card>
    );
  }

  // Calculate progress using clock-in time only
  const estimatedHours = job.estimated_hours || 0;
  const actualHours = totalDuration;
  const actualManHours = totalManHours;
  const progressPercent = estimatedHours > 0 ? Math.min((totalClockInHours / estimatedHours) * 100, 100) : 0;
  const isOverBudget = totalClockInHours > estimatedHours && estimatedHours > 0;
  const remainingHours = Math.max(estimatedHours - totalClockInHours, 0);

  return (
    <div className="w-full">
      <Tabs defaultValue="overview" className="w-full">
        {/* Main Navigation Tabs - Prominent at Top */}
        <div className="sticky top-0 z-50 bg-background border-b-2 border-primary/20 shadow-md mb-6">
          <TabsList className="grid w-full grid-cols-6 h-14 rounded-none bg-gradient-to-r from-primary/10 to-primary/5">
            <TabsTrigger value="overview" className="font-bold text-base data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Activity className="w-5 h-5 mr-2" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="components" className="font-bold text-base data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Target className="w-5 h-5 mr-2" />
              Components
            </TabsTrigger>
            <TabsTrigger value="schedule" className="font-bold text-base data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Calendar className="w-5 h-5 mr-2" />
              Schedule
            </TabsTrigger>
            <TabsTrigger value="documents" className="font-bold text-base data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <FileText className="w-5 h-5 mr-2" />
              Documents
            </TabsTrigger>
            <TabsTrigger value="materials" className="font-bold text-base data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Package className="w-5 h-5 mr-2" />
              Materials
            </TabsTrigger>
            <TabsTrigger value="photos" className="font-bold text-base data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Camera className="w-5 h-5 mr-2" />
              Photos
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Overview Tab - Includes Job Info */}
        <TabsContent value="overview" className="space-y-4 px-4">
          <Card>
            <CardHeader className="bg-gradient-to-r from-primary/10 to-primary/5 border-b">
              <CardTitle className="text-xl font-bold flex items-center gap-2">
                <Building2 className="w-6 h-6" />
                {job.name}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">Basic Information</h3>
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs text-muted-foreground">Job Number</label>
                        <p className="font-medium">{job.job_number || 'Not assigned'}</p>
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Client Name</label>
                        <p className="font-medium">{job.client_name}</p>
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Status</label>
                        <Badge className="mt-1" variant={job.status === 'active' ? 'default' : 'secondary'}>
                          {job.status}
                        </Badge>
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Internal Job</label>
                        <p className="font-medium">{job.is_internal ? 'Yes' : 'No'}</p>
                      </div>
                    </div>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">Location</h3>
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs text-muted-foreground flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          Address
                        </label>
                        <p className="font-medium">{job.address}</p>
                      </div>
                      {job.gps_lat && job.gps_lng && (
                        <div>
                          <label className="text-xs text-muted-foreground">GPS Coordinates</label>
                          <p className="font-mono text-sm">{job.gps_lat}, {job.gps_lng}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">Project Timeline</h3>
                    <div className="space-y-3">
                      {job.projected_start_date && (
                        <div>
                          <label className="text-xs text-muted-foreground">Projected Start Date</label>
                          <p className="font-medium">{new Date(job.projected_start_date).toLocaleDateString()}</p>
                        </div>
                      )}
                      {job.projected_end_date && (
                        <div>
                          <label className="text-xs text-muted-foreground">Projected End Date</label>
                          <p className="font-medium">{new Date(job.projected_end_date).toLocaleDateString()}</p>
                        </div>
                      )}
                      {firstWorkDate && (
                        <div>
                          <label className="text-xs text-muted-foreground">First Work Date</label>
                          <p className="font-medium">{new Date(firstWorkDate).toLocaleDateString()}</p>
                        </div>
                      )}
                      {lastWorkDate && (
                        <div>
                          <label className="text-xs text-muted-foreground">Last Work Date</label>
                          <p className="font-medium">{new Date(lastWorkDate).toLocaleDateString()}</p>
                        </div>
                      )}
                    </div>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">Estimated Hours</h3>
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs text-muted-foreground">Budget</label>
                        <p className="text-2xl font-bold text-primary">{estimatedHours.toFixed(2)} hrs</p>
                      </div>
                    </div>
                  </div>
                </div>
                {job.description && (
                  <div className="md:col-span-2">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">Description</h3>
                    <p className="text-sm whitespace-pre-wrap bg-muted/30 rounded-lg p-4">{job.description}</p>
                  </div>
                )}
                {job.notes && (
                  <div className="md:col-span-2">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">Notes</h3>
                    <p className="text-sm whitespace-pre-wrap bg-muted/30 rounded-lg p-4">{job.notes}</p>
                  </div>
                )}
                <div className="md:col-span-2 pt-4 border-t">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Created: {new Date(job.created_at).toLocaleString()}</span>
                    {job.updated_at && job.updated_at !== job.created_at && (
                      <span>Last Updated: {new Date(job.updated_at).toLocaleString()}</span>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
      
      {/* Key Metrics Dashboard */}
      {/* Key Metrics Dashboard */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Clock-In Hours</p>
                <p className="text-2xl font-bold">{totalClockInHours.toFixed(2)}</p>
                <p className="text-xs text-muted-foreground">Total Man-Hours</p>
              </div>
              <div className="p-2 bg-primary/10 rounded-lg">
                <Clock className="w-5 h-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Component Hours</p>
                <p className="text-2xl font-bold">{totalComponentHours.toFixed(2)}</p>
                <p className="text-xs text-muted-foreground">Task Breakdown</p>
              </div>
              <div className="p-2 bg-primary/10 rounded-lg">
                <Users className="w-5 h-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Days Active</p>
                <p className="text-2xl font-bold">{calculateDaysActive()}</p>
                <p className="text-xs text-muted-foreground">{dateGroups.length} logged</p>
              </div>
              <div className="p-2 bg-primary/10 rounded-lg">
                <Calendar className="w-5 h-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Crew Members</p>
                <p className="text-2xl font-bold">{crewMembers.length}</p>
                <p className="text-xs text-muted-foreground">Team Size</p>
              </div>
              <div className="p-2 bg-primary/10 rounded-lg">
                <Briefcase className="w-5 h-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Photos</p>
                <p className="text-2xl font-bold">{photoCount}</p>
                <p className="text-xs text-muted-foreground">Uploaded</p>
              </div>
              <div className="p-2 bg-primary/10 rounded-lg">
                <Camera className="w-5 h-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Components</p>
                <p className="text-2xl font-bold">{componentGroups.length}</p>
                <p className="text-xs text-muted-foreground">In Progress</p>
              </div>
              <div className="p-2 bg-primary/10 rounded-lg">
                <Activity className="w-5 h-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Materials</p>
                <p className="text-2xl font-bold">{materialCount}</p>
                <p className="text-xs text-muted-foreground">Items</p>
              </div>
              <div className="p-2 bg-primary/10 rounded-lg">
                <Package className="w-5 h-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Issues</p>
                <p className="text-2xl font-bold">{issueCount}</p>
                <p className="text-xs text-muted-foreground">Reported</p>
              </div>
              <div className="p-2 bg-primary/10 rounded-lg">
                <AlertCircle className="w-5 h-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Project Progress */}
      {estimatedHours > 0 && (
        <Card className="border-2 border-primary/20">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Target className="w-5 h-5 text-primary" />
              Project Progress
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="p-4 bg-primary/5 rounded-lg border">
                <div className="text-3xl font-bold text-primary">{estimatedHours.toFixed(2)}</div>
                <p className="text-xs text-muted-foreground mt-1 uppercase tracking-wide">Estimated Hours</p>
              </div>
              <div className="p-4 bg-muted/50 rounded-lg border">
                <div className="text-3xl font-bold">{totalClockInHours.toFixed(2)}</div>
                <p className="text-xs text-muted-foreground mt-1 uppercase tracking-wide">Clock-In Hours</p>
              </div>
              <div className={`p-4 rounded-lg border ${
                isOverBudget 
                  ? 'bg-destructive/10 border-destructive/30' 
                  : 'bg-success/10 border-success/30'
              }`}>
                <div className={`text-3xl font-bold ${
                  isOverBudget ? 'text-destructive' : 'text-success'
                }`}>
                  {isOverBudget ? '+' : ''}{(totalClockInHours - estimatedHours).toFixed(2)}
                </div>
                <p className="text-xs text-muted-foreground mt-1 uppercase tracking-wide">
                  {isOverBudget ? 'Over Budget' : 'Remaining'}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Progress (Clock-In Hours)</span>
                <span className={`font-bold ${
                  isOverBudget ? 'text-destructive' : 'text-primary'
                }`}>
                  {progressPercent.toFixed(2)}%
                </span>
              </div>
              <Progress 
                value={progressPercent} 
                className="h-4"
              />
              {isOverBudget && (
                <p className="text-xs text-destructive font-medium flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" />
                  Clock-in hours exceed estimate
                </p>
              )}
            </div>

            <div className="grid grid-cols-3 gap-3 pt-2 border-t">
              <div className="text-sm">
                <p className="text-muted-foreground">Days Logged</p>
                <p className="font-bold text-lg">{dateGroups.length}</p>
              </div>
              <div className="text-sm">
                <p className="text-muted-foreground">Avg Clock-In/Day</p>
                <p className="font-bold text-lg">
                  {dateGroups.length > 0 ? (totalClockInHours / dateGroups.length).toFixed(2) : '0.00'}
                </p>
              </div>
              <div className="text-sm">
                <p className="text-muted-foreground">Component Hours</p>
                <p className="font-bold text-lg">{totalComponentHours.toFixed(2)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Component Breakdown */}
      {componentGroups.filter(comp => comp.component_id !== null).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="w-5 h-5" />
              Component Breakdown
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Shows how component hours fit within total clock-in hours ({totalClockInHours.toFixed(2)} hrs)
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {componentGroups
              .filter(comp => comp.component_id !== null)
              .slice(0, 5)
              .map((comp) => {
                // Calculate percentage based on clock-in hours (100% baseline)
                const percentage = totalClockInHours > 0 ? (comp.total_man_hours / totalClockInHours) * 100 : 0;
                return (
                  <div key={comp.component_id} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{comp.component_name}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-muted-foreground">{comp.total_man_hours.toFixed(2)} hrs</span>
                        <span className="font-bold text-primary w-12 text-right">{percentage.toFixed(0)}%</span>
                      </div>
                    </div>
                    <Progress value={percentage} className="h-2" />
                  </div>
                );
              })}
          </CardContent>
        </Card>
      )}

      {/* Recent Activity */}
      {recentActivity.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="w-5 h-5" />
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentActivity.map((activity, index) => (
                <div key={index} className="flex items-start gap-3 pb-3 border-b last:border-b-0 last:pb-0">
                  <div className="p-2 bg-muted rounded-lg mt-0.5">
                    {activity.icon === 'clock' && <Clock className="w-4 h-4 text-muted-foreground" />}
                    {activity.icon === 'camera' && <Camera className="w-4 h-4 text-muted-foreground" />}
                    {activity.icon === 'file' && <FileText className="w-4 h-4 text-muted-foreground" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">{activity.description}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatTimeAgo(activity.timestamp)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

        </TabsContent>

        {/* Components Tab - Placeholder */}
        <TabsContent value="components" className="space-y-4 px-4">
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <Target className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p className="text-base">Component tracking coming soon</p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Schedule Tab - Placeholder */}
        <TabsContent value="schedule" className="space-y-4 px-4">
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <Calendar className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p className="text-base">Schedule view coming soon</p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Documents Tab - Placeholder */}
        <TabsContent value="documents" className="space-y-4 px-4">
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p className="text-base">Documents view coming soon</p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Photos Tab - Placeholder */}
        <TabsContent value="photos" className="space-y-4 px-4">
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <Camera className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p className="text-base">Photos gallery coming soon</p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Materials Tab */}
        <TabsContent value="materials" className="space-y-4 px-4">
          {user?.id && (
            <MaterialsManagement job={job} userId={user.id} />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-4">
              <CardTitle className="flex items-center gap-2">
                <Clock className="w-5 h-5" />
                Work History
              </CardTitle>
              <div className="flex items-center gap-3 text-sm">
                <div className="flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-primary" />
                  <span className="font-bold">{totalManHours.toFixed(1)}</span>
                  <span className="text-muted-foreground">man-hrs</span>
                </div>
                <span className="text-muted-foreground">•</span>
                <div className="flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-primary" />
                  <span className="font-bold">{dateGroups.length}</span>
                  <span className="text-muted-foreground">days</span>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant={viewMode === 'date' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('date')}
              >
                By Date
              </Button>
              <Button
                variant={viewMode === 'component' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('component')}
              >
                By Component
              </Button>
              <Button
                variant={viewMode === 'person' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('person')}
              >
                By Person
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={expandAllComponents}
                disabled={dateGroups.length === 0}
              >
                Expand All
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={collapseAllComponents}
                disabled={dateGroups.length === 0}
              >
                Collapse All
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {dateGroups.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No component work recorded yet
            </p>
          ) : viewMode === 'date' ? (
            <div className="space-y-3">
              {dateGroups.map((dateGroup, index) => {
                const isDateExpanded = expandedDates.has(dateGroup.date);
                const totalEntries = dateGroup.components.reduce((sum, c) => sum + c.entry_count, 0);
                
                return (
                  <Collapsible
                    key={dateGroup.date}
                    open={isDateExpanded}
                    onOpenChange={() => toggleDate(dateGroup.date)}
                  >
                    <div className="border-2 rounded-xl overflow-hidden shadow-md" style={{ borderColor: index % 2 === 0 ? '#2d5f3f' : '#4a7c59' }}>
                      <CollapsibleTrigger asChild>
                        <button className="w-full hover:opacity-90 transition-all">
                          <div className="flex items-center justify-between p-5 bg-gradient-to-r from-primary/10 to-primary/5 border-b-2" style={{ borderColor: index % 2 === 0 ? '#2d5f3f' : '#4a7c59' }}>
                            <div className="flex items-center gap-4">
                              {isDateExpanded ? (
                                <ChevronDown className="w-7 h-7 text-primary flex-shrink-0" />
                              ) : (
                                <ChevronRight className="w-7 h-7 text-primary flex-shrink-0" />
                              )}
                              <div className="text-left">
                                <div className="flex items-center gap-3 mb-1">
                                  <Calendar className="w-5 h-5 text-primary" />
                                  <h3 className="font-bold text-2xl text-primary">{formatDate(dateGroup.date)}</h3>
                                </div>
                                <div className="flex items-center gap-4 text-sm text-muted-foreground mt-2">
                                  <div className="flex items-center gap-1">
                                    <Clock className="w-4 h-4" />
                                    <span>{totalEntries} time {totalEntries === 1 ? 'entry' : 'entries'}</span>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <span>•</span>
                                    <span>{dateGroup.components.length} {dateGroup.components.length === 1 ? 'component' : 'components'}</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                            <div className="text-right bg-white dark:bg-gray-800 rounded-lg px-4 py-3 border-2" style={{ borderColor: index % 2 === 0 ? '#2d5f3f' : '#4a7c59' }}>
                              <p className="text-4xl font-bold" style={{ color: index % 2 === 0 ? '#2d5f3f' : '#4a7c59' }}>
                                {dateGroup.total_man_hours.toFixed(2)}
                              </p>
                              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mt-1">Total Man-Hours</p>
                            </div>
                          </div>
                        </button>
                      </CollapsibleTrigger>

                      <CollapsibleContent>
                        <div className="p-4 space-y-3 bg-gradient-to-b from-muted/10 to-muted/5">
                          {dateGroup.components.map((component) => {
                            const componentKey = `${dateGroup.date}-${component.component_id}`;
                            const isComponentExpanded = expandedComponents.has(componentKey);
                            return (
                              <Collapsible
                                key={componentKey}
                                open={isComponentExpanded}
                                onOpenChange={() => toggleComponent(componentKey)}
                              >
                                <div className="border-l-4 rounded-lg overflow-hidden bg-card shadow-sm border-l-primary">
                                  <CollapsibleTrigger asChild>
                                    <button className="w-full hover:bg-muted/50 transition-colors">
                                      <div className="flex items-center justify-between p-4 bg-muted/20">
                                        <div className="flex items-center gap-2">
                                          {isComponentExpanded ? (
                                            <ChevronDown className="w-4 h-4 text-muted-foreground" />
                                          ) : (
                                            <ChevronRight className="w-4 h-4 text-muted-foreground" />
                                          )}
                                          <div className="text-left">
                                            <h4 className="font-semibold">{component.component_name}</h4>
                                            <p className="text-xs text-muted-foreground">
                                              {component.entry_count} {component.entry_count === 1 ? 'entry' : 'entries'}
                                            </p>
                                          </div>
                                        </div>
                                        <div className="text-right">
                                          <p className="text-lg font-bold text-primary">
                                            {component.total_man_hours.toFixed(2)}
                                          </p>
                                          <p className="text-xs text-muted-foreground">man-hours</p>
                                        </div>
                                      </div>
                                    </button>
                                  </CollapsibleTrigger>

                                  <CollapsibleContent>
                                    <div className="p-3 space-y-2 bg-card">
                                      {component.entries.map(renderWorkEntry)}
                                    </div>
                                  </CollapsibleContent>
                                </div>
                              </Collapsible>
                            );
                          })}
                        </div>
                      </CollapsibleContent>
                    </div>
                  </Collapsible>
                );
              })}
            </div>
          ) : viewMode === 'component' ? (
            <div className="space-y-3">
              {componentGroups.map((componentGroup) => {
                const isExpanded = expandedDates.has(componentGroup.component_id);
                return (
                  <Collapsible
                    key={componentGroup.component_id}
                    open={isExpanded}
                    onOpenChange={() => toggleDate(componentGroup.component_id)}
                  >
                    <div className="border rounded-lg overflow-hidden">
                      <CollapsibleTrigger asChild>
                        <button className="w-full hover:bg-muted/50 transition-colors">
                          <div className="flex items-center justify-between p-4 bg-primary/5 border-b">
                            <div className="flex items-center gap-3">
                              {isExpanded ? (
                                <ChevronDown className="w-6 h-6 text-primary" />
                              ) : (
                                <ChevronRight className="w-6 h-6 text-primary" />
                              )}
                              <div className="text-left">
                                <h3 className="font-bold text-xl">{componentGroup.component_name}</h3>
                                <p className="text-sm text-muted-foreground">
                                  {componentGroup.entry_count} {componentGroup.entry_count === 1 ? 'entry' : 'entries'} across {componentGroup.dates.length} {componentGroup.dates.length === 1 ? 'day' : 'days'}
                                </p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-3xl font-bold text-primary">
                                {componentGroup.total_man_hours.toFixed(2)}
                              </p>
                              <p className="text-sm text-muted-foreground">man-hours</p>
                            </div>
                          </div>
                        </button>
                      </CollapsibleTrigger>

                      <CollapsibleContent>
                        <div className="p-4 space-y-3 bg-gradient-to-b from-muted/10 to-muted/5">
                          {componentGroup.dates.map((dateSummary) => {
                            const dateKey = `comp-${componentGroup.component_id}-${dateSummary.date}`;
                            const isDateExpanded = expandedComponents.has(dateKey);
                            return (
                              <Collapsible
                                key={dateKey}
                                open={isDateExpanded}
                                onOpenChange={() => toggleComponent(dateKey)}
                              >
                                <div className="border-l-4 rounded-lg overflow-hidden bg-card shadow-sm border-l-primary">
                                  <CollapsibleTrigger asChild>
                                    <button className="w-full hover:bg-muted/50 transition-colors">
                                      <div className="flex items-center justify-between p-4 bg-muted/20">
                                        <div className="flex items-center gap-2">
                                          {isDateExpanded ? (
                                            <ChevronDown className="w-4 h-4 text-muted-foreground" />
                                          ) : (
                                            <ChevronRight className="w-4 h-4 text-muted-foreground" />
                                          )}
                                          <div className="text-left">
                                            <h4 className="font-semibold">{formatDate(dateSummary.date)}</h4>
                                            <p className="text-xs text-muted-foreground">
                                              {dateSummary.entries.length} {dateSummary.entries.length === 1 ? 'entry' : 'entries'}
                                            </p>
                                          </div>
                                        </div>
                                        <div className="text-right">
                                          <p className="text-lg font-bold text-primary">
                                            {dateSummary.total_man_hours.toFixed(2)}
                                          </p>
                                          <p className="text-xs text-muted-foreground">man-hours</p>
                                        </div>
                                      </div>
                                    </button>
                                  </CollapsibleTrigger>

                                  <CollapsibleContent>
                                    <div className="p-3 space-y-2 bg-card">
                                      {dateSummary.entries.map(renderWorkEntry)}
                                    </div>
                                  </CollapsibleContent>
                                </div>
                              </Collapsible>
                            );
                          })}
                        </div>
                      </CollapsibleContent>
                    </div>
                  </Collapsible>
                );
              })}
            </div>
          ) : (
            <div className="space-y-3">
              {personGroups.map((personGroup) => {
                const isExpanded = expandedDates.has(personGroup.user_name);
                return (
                  <Collapsible
                    key={personGroup.user_name}
                    open={isExpanded}
                    onOpenChange={() => toggleDate(personGroup.user_name)}
                  >
                    <div className="border rounded-lg overflow-hidden">
                      <CollapsibleTrigger asChild>
                        <button className="w-full hover:bg-muted/50 transition-colors">
                          <div className="flex items-center justify-between p-4 bg-primary/5 border-b">
                            <div className="flex items-center gap-3">
                              {isExpanded ? (
                                <ChevronDown className="w-6 h-6 text-primary" />
                              ) : (
                                <ChevronRight className="w-6 h-6 text-primary" />
                              )}
                              <div className="text-left">
                                <h3 className="font-bold text-xl">{personGroup.user_name}</h3>
                                <p className="text-sm text-muted-foreground">
                                  {personGroup.entry_count} {personGroup.entry_count === 1 ? 'entry' : 'entries'} across {personGroup.dates.length} {personGroup.dates.length === 1 ? 'day' : 'days'}
                                </p>
                              </div>
                            </div>
                            <div className="text-right flex gap-6">
                              <div>
                                <p className="text-2xl font-bold text-success">
                                  {personGroup.clock_in_hours.toFixed(2)}
                                </p>
                                <p className="text-xs text-muted-foreground">clock-in hrs</p>
                              </div>
                              <div>
                                <p className="text-2xl font-bold text-primary">
                                  {personGroup.component_hours.toFixed(2)}
                                </p>
                                <p className="text-xs text-muted-foreground">component hrs</p>
                              </div>
                              <div className="border-l pl-4">
                                <p className="text-3xl font-bold text-foreground">
                                  {personGroup.total_man_hours.toFixed(2)}
                                </p>
                                <p className="text-xs text-muted-foreground">total hrs</p>
                              </div>
                            </div>
                          </div>
                        </button>
                      </CollapsibleTrigger>

                      <CollapsibleContent>
                        <div className="p-4 space-y-3 bg-gradient-to-b from-muted/10 to-muted/5">
                          {personGroup.dates.map((dateSummary) => {
                            const dateKey = `person-${personGroup.user_name}-${dateSummary.date}`;
                            const isDateExpanded = expandedComponents.has(dateKey);
                            return (
                              <Collapsible
                                key={dateKey}
                                open={isDateExpanded}
                                onOpenChange={() => toggleComponent(dateKey)}
                              >
                                <div className="border-l-4 rounded-lg overflow-hidden bg-card shadow-sm border-l-primary">
                                  <CollapsibleTrigger asChild>
                                    <button className="w-full hover:bg-muted/50 transition-colors">
                                      <div className="flex items-center justify-between p-4 bg-muted/20">
                                        <div className="flex items-center gap-2">
                                          {isDateExpanded ? (
                                            <ChevronDown className="w-4 h-4 text-muted-foreground" />
                                          ) : (
                                            <ChevronRight className="w-4 h-4 text-muted-foreground" />
                                          )}
                                          <div className="text-left">
                                            <h4 className="font-semibold">{formatDate(dateSummary.date)}</h4>
                                            <p className="text-xs text-muted-foreground">
                                              {dateSummary.entries.length} {dateSummary.entries.length === 1 ? 'entry' : 'entries'}
                                            </p>
                                          </div>
                                        </div>
                                        <div className="text-right">
                                          <p className="text-lg font-bold text-primary">
                                            {dateSummary.total_man_hours.toFixed(2)}
                                          </p>
                                          <p className="text-xs text-muted-foreground">man-hours</p>
                                        </div>
                                      </div>
                                    </button>
                                  </CollapsibleTrigger>

                                  <CollapsibleContent>
                                    <div className="p-3 space-y-2 bg-card">
                                      {dateSummary.entries.map(renderWorkEntry)}
                                    </div>
                                  </CollapsibleContent>
                                </div>
                              </Collapsible>
                            );
                          })}
                        </div>
                      </CollapsibleContent>
                    </div>
                  </Collapsible>
                );
              })}
            </div>
          )}  
        </CardContent>
      </Card>
