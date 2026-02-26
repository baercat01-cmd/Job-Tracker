import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Calendar, Clock, Users, CheckSquare, Camera, FileText, Briefcase, Package } from 'lucide-react';
import { format } from 'date-fns';

function getDayBounds(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const start = new Date(y, m - 1, d);
  const end = new Date(y, m - 1, d + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

export function DailyReportPage() {
  const navigate = useNavigate();
  const today = format(new Date(), 'yyyy-MM-dd');
  const [selectedDate, setSelectedDate] = useState(today);
  const [loading, setLoading] = useState(true);
  const [timeEntries, setTimeEntries] = useState<any[]>([]);
  const [completedJobTasks, setCompletedJobTasks] = useState<any[]>([]);
  const [completedShopTasks, setCompletedShopTasks] = useState<any[]>([]);
  const [photos, setPhotos] = useState<any[]>([]);
  const [dailyLogs, setDailyLogs] = useState<any[]>([]);

  const { start: dayStart, end: dayEnd } = getDayBounds(selectedDate);

  useEffect(() => {
    loadReport();
  }, [selectedDate]);

  async function loadReport() {
    setLoading(true);
    try {
      const [timeRes, jobTasksRes, shopTasksRes, photosRes, logsRes] = await Promise.all([
        supabase
          .from('time_entries')
          .select(`
            *,
            jobs(id, job_number, name, client_name),
            components(name),
            user_profiles(id, username, email)
          `)
          .eq('is_active', false)
          .gte('start_time', dayStart)
          .lt('start_time', dayEnd)
          .order('start_time', { ascending: true }),
        supabase
          .from('job_tasks')
          .select(`
            *,
            job:jobs(id, name, client_name),
            assigned_user:assigned_to(id, username, email)
          `)
          .eq('status', 'completed')
          .gte('completed_at', dayStart)
          .lt('completed_at', dayEnd)
          .order('completed_at', { ascending: false }),
        supabase
          .from('shop_tasks')
          .select(`
            *,
            jobs(id, name, client_name),
            user_profiles(id, username, email)
          `)
          .eq('status', 'completed')
          .gte('completed_at', dayStart)
          .lt('completed_at', dayEnd)
          .order('completed_at', { ascending: false }),
        supabase
          .from('photos')
          .select(`
            *,
            jobs(id, name, job_number, client_name),
            user_profiles(username, email)
          `)
          .eq('photo_date', selectedDate)
          .order('timestamp', { ascending: false }),
        supabase
          .from('daily_logs')
          .select(`
            *,
            jobs(id, name, client_name),
            user_profiles(username, email)
          `)
          .eq('log_date', selectedDate)
          .order('created_at', { ascending: false }),
      ]);

      setTimeEntries(timeRes.data || []);
      setCompletedJobTasks(jobTasksRes.data || []);
      setCompletedShopTasks(shopTasksRes.data || []);
      setPhotos(photosRes.data || []);
      setDailyLogs(logsRes.data || []);
    } catch (e) {
      console.error('Error loading daily report:', e);
    } finally {
      setLoading(false);
    }
  }

  const totalHours = timeEntries.reduce((sum, e) => sum + (e.total_hours || 0), 0);
  const uniqueWorkers = new Set(timeEntries.map((e) => e.user_id)).size;
  const uniqueJobs = new Set(timeEntries.map((e) => e.job_id).filter(Boolean)).size;

  // Jobs that had at least one task checked off today (office/job tasks or shop tasks)
  const jobIdsFromJobTasks = new Map<string, { name: string; count: number; tasks: any[] }>();
  completedJobTasks.forEach((t) => {
    const jid = t.job_id;
    const name = t.job?.name || t.job?.client_name || 'Unknown job';
    if (!jid) return;
    if (!jobIdsFromJobTasks.has(jid)) jobIdsFromJobTasks.set(jid, { name, count: 0, tasks: [] });
    const rec = jobIdsFromJobTasks.get(jid)!;
    rec.count += 1;
    rec.tasks.push(t);
  });
  const jobIdsFromShopTasks = new Map<string, { name: string; count: number; tasks: any[] }>();
  completedShopTasks.forEach((t) => {
    const jid = t.job_id;
    const name = t.jobs?.name || t.jobs?.client_name || 'Unknown job';
    if (!jid) return;
    if (!jobIdsFromShopTasks.has(jid)) jobIdsFromShopTasks.set(jid, { name, count: 0, tasks: [] });
    const rec = jobIdsFromShopTasks.get(jid)!;
    rec.count += 1;
    rec.tasks.push(t);
  });
  const allJobsCheckedOff = new Map<string, { name: string; officeCount: number; shopCount: number; officeTasks: any[]; shopTasks: any[] }>();
  jobIdsFromJobTasks.forEach((rec, jid) => {
    allJobsCheckedOff.set(jid, { name: rec.name, officeCount: rec.count, shopCount: 0, officeTasks: rec.tasks, shopTasks: [] });
  });
  jobIdsFromShopTasks.forEach((rec, jid) => {
    const existing = allJobsCheckedOff.get(jid);
    if (existing) {
      existing.shopCount = rec.count;
      existing.shopTasks = rec.tasks;
    } else {
      allJobsCheckedOff.set(jid, { name: rec.name, officeCount: 0, shopCount: rec.count, officeTasks: [], shopTasks: rec.tasks });
    }
  });
  const jobsCheckedOffList = Array.from(allJobsCheckedOff.entries()).sort((a, b) => a[1].name.localeCompare(b[1].name));

  const displayDate = format(new Date(selectedDate + 'T12:00:00'), 'EEEE, MMMM d, yyyy');

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b-4 border-yellow-500 shadow sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/office?tab=jobs')}
            className="rounded-none text-slate-700 hover:bg-slate-100"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Jobs
          </Button>
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-yellow-600" />
            <h1 className="text-lg font-bold text-slate-900">Daily Report</h1>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="report-date" className="text-sm font-medium text-slate-700 whitespace-nowrap">
              Date:
            </label>
            <input
              id="report-date"
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="rounded border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-5xl">
        <p className="text-slate-600 font-medium mb-6">{displayDate}</p>

        {loading ? (
          <Card>
            <CardContent className="py-12 text-center">
              <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p className="text-muted-foreground">Loading report...</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Clock className="w-4 h-4" />
                    <span className="text-sm font-medium">Total Hours</span>
                  </div>
                  <p className="text-2xl font-bold mt-1">{totalHours.toFixed(1)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Users className="w-4 h-4" />
                    <span className="text-sm font-medium">Workers</span>
                  </div>
                  <p className="text-2xl font-bold mt-1">{uniqueWorkers}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Briefcase className="w-4 h-4" />
                    <span className="text-sm font-medium">Jobs Worked</span>
                  </div>
                  <p className="text-2xl font-bold mt-1">{uniqueJobs}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Camera className="w-4 h-4" />
                    <span className="text-sm font-medium">Photos</span>
                  </div>
                  <p className="text-2xl font-bold mt-1">{photos.length}</p>
                </CardContent>
              </Card>
            </div>

            {/* Time clocked */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Clock className="w-5 h-5" />
                  Time Clocked
                </CardTitle>
              </CardHeader>
              <CardContent>
                {timeEntries.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No time entries for this day.</p>
                ) : (
                  <div className="space-y-3">
                    {timeEntries.map((entry) => (
                      <div
                        key={entry.id}
                        className="flex flex-wrap items-center justify-between gap-2 py-2 border-b border-slate-100 last:border-0"
                      >
                        <div>
                          <p className="font-medium">
                            {entry.user_profiles?.username || entry.user_profiles?.email || 'Unknown'}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {entry.jobs?.name || entry.jobs?.client_name || '—'} · {entry.components?.name || 'Clock'}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-mono">
                            {format(new Date(entry.start_time), 'h:mm a')}
                            {entry.end_time ? ` – ${format(new Date(entry.end_time), 'h:mm a')}` : ''}
                          </p>
                          <p className="text-sm font-semibold">{(entry.total_hours || 0).toFixed(1)} hrs</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Jobs that had tasks checked off today */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <CheckSquare className="w-5 h-5" />
                  Jobs with tasks checked off
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  All jobs that had at least one task completed this day
                </p>
              </CardHeader>
              <CardContent>
                {jobsCheckedOffList.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No tasks were checked off this day.</p>
                ) : (
                  <div className="space-y-4">
                    {jobsCheckedOffList.map(([jobId, { name, officeCount, shopCount, officeTasks, shopTasks }]) => (
                      <div key={jobId} className="border rounded-lg p-4 bg-slate-50/50">
                        <div className="flex items-center justify-between gap-2 mb-3">
                          <h3 className="font-semibold text-slate-900">{name}</h3>
                          <div className="flex gap-2">
                            {officeCount > 0 && (
                              <Badge variant="secondary" className="text-xs">
                                {officeCount} office task{officeCount !== 1 ? 's' : ''}
                              </Badge>
                            )}
                            {shopCount > 0 && (
                              <Badge variant="outline" className="text-xs">
                                {shopCount} shop task{shopCount !== 1 ? 's' : ''}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <ul className="space-y-1.5">
                          {officeTasks.map((t) => (
                            <li key={t.id} className="flex flex-wrap items-center gap-2 text-sm py-1.5 pl-2 border-l-2 border-green-500/50">
                              <CheckSquare className="w-4 h-4 text-green-600 shrink-0" />
                              <span className="font-medium">{t.title || 'Task'}</span>
                              {t.completed_at && (
                                <span className="text-muted-foreground text-xs">
                                  {format(new Date(t.completed_at), 'h:mm a')}
                                </span>
                              )}
                            </li>
                          ))}
                          {shopTasks.map((t) => (
                            <li key={t.id} className="flex flex-wrap items-center gap-2 text-sm py-1.5 pl-2 border-l-2 border-amber-500/50">
                              <Package className="w-4 h-4 text-amber-600 shrink-0" />
                              <span className="font-medium">{t.title || 'Task'}</span>
                              {t.completed_at && (
                                <span className="text-muted-foreground text-xs">
                                  {format(new Date(t.completed_at), 'h:mm a')}
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Photos */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Camera className="w-5 h-5" />
                  Photos ({photos.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {photos.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No photos uploaded this day.</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {photos.map((photo) => (
                      <a
                        key={photo.id}
                        href={photo.photo_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block rounded-lg overflow-hidden border bg-slate-100 hover:opacity-90"
                      >
                        <img
                          src={photo.photo_url}
                          alt={photo.caption || 'Job photo'}
                          className="w-full aspect-square object-cover"
                        />
                        <p className="p-2 text-xs text-muted-foreground truncate">
                          {photo.jobs?.name || photo.jobs?.client_name || '—'}
                          {photo.user_profiles?.username ? ` · ${photo.user_profiles.username}` : ''}
                        </p>
                      </a>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Daily logs */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <FileText className="w-5 h-5" />
                  Daily Logs
                </CardTitle>
              </CardHeader>
              <CardContent>
                {dailyLogs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No daily logs for this day.</p>
                ) : (
                  <div className="space-y-3">
                    {dailyLogs.map((log) => (
                      <div key={log.id} className="py-3 border-b border-slate-100 last:border-0">
                        <p className="font-medium">{log.jobs?.name || log.jobs?.client_name || '—'}</p>
                        <p className="text-sm text-muted-foreground mt-1">{log.notes || 'No notes'}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {log.user_profiles?.username || log.user_profiles?.email || 'Unknown'}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}
