import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, FileText, Calendar, Clock, Camera, AlertTriangle, Package, Cloud, Users } from 'lucide-react';
import type { Job } from '@/types';
import { format } from 'date-fns';

interface JobLogsViewProps {
  job: Job;
  onBack: () => void;
  onViewLog: (date: string) => void;
}

interface DailyLogSummary {
  id: string;
  log_date: string;
  weather: string | null;
  crew_count: number;
  components_worked: any[];
  time_summary: any[];
  photos_logged: any[];
  issues: any[];
  material_requests_structured: any[];
  auto_summary_text: string | null;
  created_by: string;
  created_at: string;
  user_profiles: {
    username: string | null;
    email: string;
  };
}

export function JobLogsView({ job, onBack, onViewLog }: JobLogsViewProps) {
  const { profile } = useAuth();
  const [logs, setLogs] = useState<DailyLogSummary[]>([]);
  const [loading, setLoading] = useState(true);
  
  const isOffice = profile?.role === 'office';

  useEffect(() => {
    loadLogs();
  }, [job.id]);

  async function loadLogs() {
    try {
      let query = supabase
        .from('daily_logs')
        .select(`
          *,
          user_profiles(username, email)
        `)
        .eq('job_id', job.id)
        .order('log_date', { ascending: false });

      // Crew sees only their own logs
      if (!isOffice) {
        query = query.eq('created_by', profile?.id);
      }

      const { data, error } = await query;

      if (error) throw error;
      setLogs(data || []);
    } catch (error) {
      console.error('Error loading logs:', error);
    } finally {
      setLoading(false);
    }
  }

  function getTotalHours(log: DailyLogSummary): number {
    if (!log.time_summary || !Array.isArray(log.time_summary)) return 0;
    return log.time_summary.reduce((sum, entry) => sum + (entry.totalHours || 0), 0);
  }

  function getPhotoCount(log: DailyLogSummary): number {
    if (!log.photos_logged || !Array.isArray(log.photos_logged)) return 0;
    return log.photos_logged.length;
  }

  function getIssueCount(log: DailyLogSummary): number {
    if (!log.issues || !Array.isArray(log.issues)) return 0;
    return log.issues.length;
  }

  function getMaterialCount(log: DailyLogSummary): number {
    if (!log.material_requests_structured || !Array.isArray(log.material_requests_structured)) return 0;
    return log.material_requests_structured.length;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h2 className="text-xl font-bold">Daily Logs</h2>
          <p className="text-sm text-muted-foreground">{job.name}</p>
        </div>
      </div>

      {loading ? (
        <Card>
          <CardContent className="py-12 text-center">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-muted-foreground">Loading logs...</p>
          </CardContent>
        </Card>
      ) : logs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">No daily logs yet</p>
            <p className="text-sm text-muted-foreground mt-2">
              {isOffice ? 'Logs will appear here once created' : 'Create your first daily log'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {logs.map((log) => (
            <Card key={log.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => onViewLog(log.log_date)}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Calendar className="w-5 h-5" />
                      {format(new Date(log.log_date), 'MMMM dd, yyyy')}
                    </CardTitle>
                    {!isOffice && (
                      <p className="text-xs text-muted-foreground mt-1">Your log</p>
                    )}
                    {isOffice && log.user_profiles && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Created by: {log.user_profiles.username || log.user_profiles.email}
                      </p>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Weather - Office Only */}
                {isOffice && log.weather && (
                  <div className="flex items-center gap-2 text-sm">
                    <Cloud className="w-4 h-4 text-muted-foreground" />
                    <span>{log.weather}</span>
                  </div>
                )}

                {/* Hours Logged - Office Only */}
                {isOffice && (
                  <div className="flex items-center gap-2 text-sm">
                    <Clock className="w-4 h-4 text-muted-foreground" />
                    <span><strong>{getTotalHours(log).toFixed(1)}h</strong> logged</span>
                    {log.crew_count > 0 && (
                      <>
                        <span className="text-muted-foreground">•</span>
                        <Users className="w-4 h-4 text-muted-foreground" />
                        <span>{log.crew_count} crew</span>
                      </>
                    )}
                  </div>
                )}

                {/* Components Worked - Office Only */}
                {isOffice && log.components_worked && Array.isArray(log.components_worked) && log.components_worked.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {log.components_worked.map((comp: any, index: number) => (
                      <Badge key={index} variant="secondary" className="text-xs">
                        {comp.name}
                      </Badge>
                    ))}
                  </div>
                )}

                {/* Issues */}
                {getIssueCount(log) > 0 && (
                  <div className="flex items-center gap-2 text-sm">
                    <AlertTriangle className="w-4 h-4 text-destructive" />
                    <span>{getIssueCount(log)} issue{getIssueCount(log) > 1 ? 's' : ''}</span>
                  </div>
                )}

                {/* Material Requests */}
                {getMaterialCount(log) > 0 && (
                  <div className="flex items-center gap-2 text-sm">
                    <Package className="w-4 h-4 text-warning" />
                    <span>{getMaterialCount(log)} material request{getMaterialCount(log) > 1 ? 's' : ''}</span>
                  </div>
                )}

                {/* Photos - Office Only */}
                {isOffice && getPhotoCount(log) > 0 && (
                  <div className="flex items-center gap-2 text-sm">
                    <Camera className="w-4 h-4 text-muted-foreground" />
                    <span>{getPhotoCount(log)} photo{getPhotoCount(log) > 1 ? 's' : ''}</span>
                  </div>
                )}

                {/* Auto Summary Preview - Office Only */}
                {isOffice && log.auto_summary_text && (
                  <p className="text-sm text-muted-foreground line-clamp-2 pt-2 border-t">
                    {log.auto_summary_text}
                  </p>
                )}

                <Button variant="outline" size="sm" className="w-full mt-2">
                  View Full Log
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
