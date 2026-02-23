import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, Users, FileText, Calendar, MapPin, ThermometerSun } from 'lucide-react';
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
}

interface ComponentSummary {
  component_id: string;
  component_name: string;
  total_duration: number;
  total_man_hours: number;
  entry_count: number;
  entries: ComponentWorkEntry[];
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
  const [loading, setLoading] = useState(true);
  const [componentSummaries, setComponentSummaries] = useState<ComponentSummary[]>([]);
  const [dailyLogs, setDailyLogs] = useState<DailyLog[]>([]);
  const [totalDuration, setTotalDuration] = useState(0);
  const [totalManHours, setTotalManHours] = useState(0);

  useEffect(() => {
    loadData();
  }, [job.id]);

  async function loadData() {
    setLoading(true);
    try {
      await Promise.all([
        loadComponentWork(),
        loadDailyLogs(),
      ]);
    } catch (error) {
      console.error('Error loading job details:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadComponentWork() {
    try {
      const { data, error } = await supabase
        .from('time_entries')
        .select(`
          *,
          components(name),
          user_profiles(username)
        `)
        .eq('job_id', job.id)
        .order('start_time', { ascending: false });

      if (error) throw error;

      // Group by component
      const componentMap = new Map<string, ComponentSummary>();

      (data || []).forEach((entry: any) => {
        const componentId = entry.component_id;
        const componentName = entry.components?.name || 'Unknown Component';
        const duration = entry.total_hours || 0;
        const crewCount = entry.crew_count || 1;
        const manHours = duration * crewCount;

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
          user_name: entry.user_profiles?.username || 'Unknown',
        };

        if (componentMap.has(componentId)) {
          const existing = componentMap.get(componentId)!;
          existing.total_duration += duration;
          existing.total_man_hours += manHours;
          existing.entry_count += 1;
          existing.entries.push(workEntry);
        } else {
          componentMap.set(componentId, {
            component_id: componentId,
            component_name: componentName,
            total_duration: duration,
            total_man_hours: manHours,
            entry_count: 1,
            entries: [workEntry],
          });
        }
      });

      const summaries = Array.from(componentMap.values()).sort(
        (a, b) => b.total_man_hours - a.total_man_hours
      );

      setComponentSummaries(summaries);
      
      const totalDur = summaries.reduce((sum, s) => sum + s.total_duration, 0);
      const totalMan = summaries.reduce((sum, s) => sum + s.total_man_hours, 0);
      
      setTotalDuration(totalDur);
      setTotalManHours(totalMan);
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
    const date = new Date(dateString);
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

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading job details...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Overall Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6 text-center">
            <Users className="w-8 h-8 mx-auto mb-2 text-primary" />
            <p className="text-3xl font-bold">{totalManHours.toFixed(1)}</p>
            <p className="text-sm text-muted-foreground">Total Man-Hours</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <FileText className="w-8 h-8 mx-auto mb-2 text-primary" />
            <p className="text-3xl font-bold">{componentSummaries.length}</p>
            <p className="text-sm text-muted-foreground">Components</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <Calendar className="w-8 h-8 mx-auto mb-2 text-primary" />
            <p className="text-3xl font-bold">{dailyLogs.length}</p>
            <p className="text-sm text-muted-foreground">Daily Logs</p>
          </CardContent>
        </Card>
      </div>

      {/* Component Work Details */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Component Work History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {componentSummaries.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No component work recorded yet
            </p>
          ) : (
            <div className="space-y-6">
              {componentSummaries.map((summary) => (
                <div key={summary.component_id} className="border rounded-lg p-4 space-y-3">
                  {/* Component Header */}
                  <div className="flex items-center justify-between pb-3 border-b">
                    <div>
                      <h3 className="font-bold text-lg">{summary.component_name}</h3>
                      <p className="text-sm text-muted-foreground">
                        {summary.entry_count} {summary.entry_count === 1 ? 'entry' : 'entries'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-primary">
                        {summary.total_man_hours.toFixed(1)}
                      </p>
                      <p className="text-sm text-muted-foreground">man-hours</p>
                    </div>
                  </div>

                  {/* Component Entries */}
                  <div className="space-y-2">
                    {summary.entries.map((entry) => (
                      <div
                        key={entry.id}
                        className="bg-muted/50 rounded-md p-3 space-y-2"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium">
                                {formatDate(entry.start_time)}
                              </span>
                              {entry.is_manual && (
                                <Badge variant="outline" className="text-xs">
                                  Manual
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {formatTime(entry.start_time)} - {formatTime(entry.end_time)}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              By {entry.user_name}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold">{entry.total_hours.toFixed(2)}h</p>
                            <p className="text-xs text-muted-foreground">
                              {entry.crew_count} crew = {(entry.total_hours * entry.crew_count).toFixed(2)} man-hours
                            </p>
                          </div>
                        </div>

                        {/* Worker Names */}
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

                        {/* Notes */}
                        {entry.notes && (
                          <div className="pt-2 border-t">
                            <p className="text-xs font-medium text-muted-foreground mb-1">Notes:</p>
                            <p className="text-sm">{entry.notes}</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Daily Logs */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Daily Logs
          </CardTitle>
        </CardHeader>
        <CardContent>
          {dailyLogs.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No daily logs recorded yet
            </p>
          ) : (
            <div className="space-y-4">
              {dailyLogs.map((log) => (
                <div key={log.id} className="border rounded-lg p-4 space-y-3">
                  {/* Log Header */}
                  <div className="flex items-start justify-between pb-3 border-b">
                    <div>
                      <h3 className="font-bold text-lg">
                        {formatDate(log.log_date)}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        Logged by {log.user_name}
                      </p>
                    </div>
                    <div className="text-right">
                      {log.weather_details && (
                        <div className="flex items-center gap-1 text-sm">
                          <ThermometerSun className="w-4 h-4" />
                          <span>{log.weather_details.temp}°F</span>
                        </div>
                      )}
                      {log.crew_count && (
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Users className="w-4 h-4" />
                          <span>{log.crew_count} crew</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Weather */}
                  {log.weather && (
                    <div className="bg-muted/50 rounded-md p-3">
                      <p className="text-xs font-medium text-muted-foreground mb-1">Weather:</p>
                      <p className="text-sm">{log.weather}</p>
                    </div>
                  )}

                  {/* Components Worked */}
                  {log.components_worked.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-2">Components Worked:</p>
                      <div className="flex flex-wrap gap-2">
                        {log.components_worked.map((comp: any, idx: number) => (
                          <Badge key={idx} variant="secondary">
                            {comp.name || comp.component_name || 'Unknown'}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Time Summary */}
                  {log.time_summary.length > 0 && (
                    <div className="bg-muted/50 rounded-md p-3">
                      <p className="text-xs font-medium text-muted-foreground mb-2">Time Summary:</p>
                      <div className="space-y-1">
                        {log.time_summary.map((time: any, idx: number) => (
                          <div key={idx} className="flex items-center justify-between text-sm">
                            <span>{time.component_name || time.name}</span>
                            <span className="font-medium">
                              {time.hours}h ({time.crew_count} crew = {(parseFloat(time.hours) * time.crew_count).toFixed(1)} man-hours)
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Issues */}
                  {log.issues.length > 0 && (
                    <div className="bg-destructive/10 rounded-md p-3">
                      <p className="text-xs font-medium text-destructive mb-2">Issues:</p>
                      <ul className="space-y-1">
                        {log.issues.map((issue: any, idx: number) => (
                          <li key={idx} className="text-sm">
                            • {issue.description || issue}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Material Requests */}
                  {log.material_requests_structured.length > 0 && (
                    <div className="bg-warning/10 rounded-md p-3">
                      <p className="text-xs font-medium text-warning mb-2">Material Requests:</p>
                      <ul className="space-y-1">
                        {log.material_requests_structured.map((req: any, idx: number) => (
                          <li key={idx} className="text-sm">
                            • {req.item} (Qty: {req.quantity})
                            {req.priority && ` - Priority: ${req.priority}`}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Client Summary */}
                  {log.client_summary && (
                    <div className="bg-primary/10 rounded-md p-3">
                      <p className="text-xs font-medium text-primary mb-1">Client Summary:</p>
                      <p className="text-sm">{log.client_summary}</p>
                    </div>
                  )}

                  {/* Final Notes */}
                  {log.final_notes && (
                    <div className="bg-muted/50 rounded-md p-3">
                      <p className="text-xs font-medium text-muted-foreground mb-1">Final Notes:</p>
                      <p className="text-sm">{log.final_notes}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
