import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FileText, Calendar, User, Cloud, Clock, Camera, AlertTriangle, Package, ChevronRight } from 'lucide-react';
import { Label } from '@/components/ui/label';
import type { DailyLog } from '@/types';
import { formatShortDate, formatDisplayDate } from '@/lib/utils';

export function DailyLogsView() {
  const { profile } = useAuth();
  const isOffice = profile?.role === 'office';
  
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState<any | null>(null);

  useEffect(() => {
    loadLogs();
  }, []);

  async function loadLogs() {
    try {
      let query = supabase
        .from('daily_logs')
        .select(`
          *,
          jobs(name, client_name),
          user_profiles(username, email)
        `)
        .order('log_date', { ascending: false })
        .limit(50);

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

  function getSeverityColor(severity: string) {
    switch (severity) {
      case 'high': return 'destructive';
      case 'medium': return 'default';
      case 'low': return 'secondary';
      default: return 'secondary';
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold">Daily Logs</h2>
        <p className="text-sm text-muted-foreground">
          {isOffice ? 'All daily logs from field crews' : 'Your daily logs'}
        </p>
      </div>

      {loading ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Loading logs...
          </CardContent>
        </Card>
      ) : logs.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No daily logs found
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {logs.map((log: any) => {
            const componentsWorked = log.components_worked || [];
            const totalHours = componentsWorked.reduce((sum: number, c: any) => sum + (c.hours || 0), 0);
            const photosCount = (log.photos_logged || []).length;
            const issuesCount = (log.issues || []).length;
            const materialsCount = (log.material_requests_structured || []).length;

            return (
              <Card
                key={log.id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => setSelectedLog(log)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-base">{log.jobs?.name || 'Unknown Job'}</CardTitle>
                      <p className="text-sm text-muted-foreground">{log.jobs?.client_name}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">{formatShortDate(log.log_date)}</p>
                      {isOffice && log.user_profiles && (
                        <p className="text-xs text-muted-foreground">
                          {log.user_profiles.username || log.user_profiles.email}
                        </p>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-4 gap-3 mb-3">
                    <div className="text-center">
                      <div className="flex items-center justify-center text-primary mb-1">
                        <Clock className="w-4 h-4" />
                      </div>
                      <p className="text-lg font-bold">{totalHours.toFixed(1)}</p>
                      <p className="text-xs text-muted-foreground">Hours</p>
                    </div>
                    <div className="text-center">
                      <div className="flex items-center justify-center text-primary mb-1">
                        <Camera className="w-4 h-4" />
                      </div>
                      <p className="text-lg font-bold">{photosCount}</p>
                      <p className="text-xs text-muted-foreground">Photos</p>
                    </div>
                    <div className="text-center">
                      <div className="flex items-center justify-center text-primary mb-1">
                        <AlertTriangle className="w-4 h-4" />
                      </div>
                      <p className="text-lg font-bold">{issuesCount}</p>
                      <p className="text-xs text-muted-foreground">Issues</p>
                    </div>
                    <div className="text-center">
                      <div className="flex items-center justify-center text-primary mb-1">
                        <Package className="w-4 h-4" />
                      </div>
                      <p className="text-lg font-bold">{materialsCount}</p>
                      <p className="text-xs text-muted-foreground">Materials</p>
                    </div>
                  </div>
                  {log.auto_summary_text && (
                    <p className="text-sm text-muted-foreground line-clamp-2 border-t pt-2">
                      {log.auto_summary_text}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Log Detail Dialog */}
      <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Daily Log - {selectedLog?.jobs?.name}
            </DialogTitle>
          </DialogHeader>
          {selectedLog && (
            <div className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4 pb-4 border-b">
                <div>
                  <Label className="text-muted-foreground">Date</Label>
                  <p className="font-medium flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    {formatDisplayDate(selectedLog.log_date)}
                  </p>
                </div>
                {isOffice && selectedLog.user_profiles && (
                  <div>
                    <Label className="text-muted-foreground">Submitted By</Label>
                    <p className="font-medium flex items-center gap-2">
                      <User className="w-4 h-4" />
                      {selectedLog.user_profiles.username || selectedLog.user_profiles.email}
                    </p>
                  </div>
                )}
                <div>
                  <Label className="text-muted-foreground">Crew Count</Label>
                  <p className="font-medium">{selectedLog.crew_count || 'N/A'}</p>
                </div>
                {selectedLog.weather_details && (
                  <div>
                    <Label className="text-muted-foreground">Weather</Label>
                    <p className="font-medium flex items-center gap-2">
                      <Cloud className="w-4 h-4" />
                      {selectedLog.weather_details.conditions}, {selectedLog.weather_details.temp}°F
                    </p>
                  </div>
                )}
              </div>

              {/* Components Worked */}
              {selectedLog.components_worked && selectedLog.components_worked.length > 0 && (
                <div>
                  <Label className="text-muted-foreground mb-2 block">Components Worked</Label>
                  <div className="space-y-2">
                    {selectedLog.components_worked.map((comp: any, index: number) => (
                      <div key={index} className="flex items-center justify-between p-2 border rounded-lg">
                        <span className="font-medium">{comp.name}</span>
                        <Badge>{comp.hours.toFixed(2)}h</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Auto Summary */}
              {selectedLog.auto_summary_text && (
                <div>
                  <Label className="text-muted-foreground mb-2 block">Summary</Label>
                  <p className="text-sm bg-muted p-3 rounded-lg">{selectedLog.auto_summary_text}</p>
                </div>
              )}

              {/* Issues */}
              {selectedLog.issues && selectedLog.issues.length > 0 && (
                <div>
                  <Label className="text-muted-foreground mb-2 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    Issues ({selectedLog.issues.length})
                  </Label>
                  <div className="space-y-2">
                    {selectedLog.issues.map((issue: any, index: number) => (
                      <div key={index} className="p-3 border rounded-lg">
                        <div className="flex items-start justify-between mb-1">
                          <p className="text-sm flex-1">{issue.description}</p>
                          <Badge variant={getSeverityColor(issue.severity) as any}>
                            {issue.severity}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Reported by {issue.reportedBy}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Material Requests */}
              {selectedLog.material_requests_structured && selectedLog.material_requests_structured.length > 0 && (
                <div>
                  <Label className="text-muted-foreground mb-2 flex items-center gap-2">
                    <Package className="w-4 h-4" />
                    Material Requests ({selectedLog.material_requests_structured.length})
                  </Label>
                  <div className="space-y-2">
                    {selectedLog.material_requests_structured.map((request: any, index: number) => (
                      <div key={index} className="p-3 border rounded-lg">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <p className="font-medium">{request.item}</p>
                            <p className="text-sm text-muted-foreground">Quantity: {request.quantity}</p>
                          </div>
                          <Badge variant={getSeverityColor(request.priority) as any}>
                            {request.priority}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Photos */}
              {selectedLog.photos_logged && selectedLog.photos_logged.length > 0 && (
                <div>
                  <Label className="text-muted-foreground mb-2 flex items-center gap-2">
                    <Camera className="w-4 h-4" />
                    Photos ({selectedLog.photos_logged.length})
                  </Label>
                  <div className="grid grid-cols-3 gap-2">
                    {selectedLog.photos_logged.map((photo: any, index: number) => (
                      <a
                        key={index}
                        href={photo.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="relative aspect-square group"
                      >
                        <img
                          src={photo.url}
                          alt={`Photo ${index + 1}`}
                          className="w-full h-full object-cover rounded-lg"
                        />
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                          <ChevronRight className="w-6 h-6 text-white" />
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Final Notes */}
              {selectedLog.final_notes && (
                <div>
                  <Label className="text-muted-foreground mb-2 block">Additional Notes</Label>
                  <p className="text-sm bg-muted p-3 rounded-lg">{selectedLog.final_notes}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
