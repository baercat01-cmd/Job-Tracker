import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Download, 
  Calendar, 
  Users, 
  Clock, 
  LogOut,
  ChevronDown,
  ChevronRight,
  DollarSign
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';

interface TimeEntryData {
  id: string;
  job_id: string;
  component_id: string | null;
  user_id: string;
  start_time: string;
  end_time: string | null;
  total_hours: number | null;
  crew_count: number;
  is_manual: boolean;
  notes: string | null;
  worker_names: string[];
  jobs?: { name: string; client_name: string };
  components?: { name: string } | null;
}

interface JobTimeData {
  jobId: string;
  jobName: string;
  clientName: string;
  totalHours: number;
  entries: TimeEntryData[];
}

interface UserTimeData {
  userId: string;
  userName: string;
  totalHours: number;
  jobs: JobTimeData[];
}

interface WeekData {
  weekStart: string;
  weekEnd: string;
  users: UserTimeData[];
}

export function PayrollDashboard() {
  const { profile, logout } = useAuth();
  const [loading, setLoading] = useState(false);
  const [selectedWeek, setSelectedWeek] = useState<string>('');
  const [weekOptions, setWeekOptions] = useState<{ value: string; label: string }[]>([]);
  const [weekData, setWeekData] = useState<WeekData | null>(null);
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());
  const [expandedJobs, setExpandedJobs] = useState<Set<string>>(new Set());
  const [selectedUser, setSelectedUser] = useState<string>('all');

  useEffect(() => {
    generateWeekOptions();
  }, []);

  useEffect(() => {
    if (selectedWeek) {
      loadWeekData();
    }
  }, [selectedWeek]);

  function generateWeekOptions() {
    const weeks: { value: string; label: string }[] = [];
    const today = new Date();
    
    // Generate last 12 weeks
    for (let i = 0; i < 12; i++) {
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - today.getDay() - (i * 7)); // Sunday
      weekStart.setHours(0, 0, 0, 0);
      
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6); // Saturday
      weekEnd.setHours(23, 59, 59, 999);
      
      const value = weekStart.toISOString().split('T')[0];
      const label = `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
      
      weeks.push({ value, label });
    }
    
    setWeekOptions(weeks);
    setSelectedWeek(weeks[0].value); // Default to current week
  }

  async function loadWeekData() {
    if (!selectedWeek) return;
    
    setLoading(true);
    
    try {
      const weekStart = new Date(selectedWeek);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);
      
      // Load ONLY clock-in time entries (component_id IS NULL) for payroll
      const { data: timeEntries, error: timeError } = await supabase
        .from('time_entries')
        .select(`
          *,
          jobs(name, client_name),
          components(name)
        `)
        .gte('start_time', weekStart.toISOString())
        .lte('start_time', weekEnd.toISOString())
        .is('component_id', null) // Only clock-in entries, no component time
        .not('total_hours', 'is', null)
        .order('start_time', { ascending: true });

      if (timeError) throw timeError;

      // Load all users
      const { data: users, error: usersError } = await supabase
        .from('user_profiles')
        .select('id, username')
        .order('username');

      if (usersError) throw usersError;

      // Group entries by user, then by job
      const userMap = new Map<string, UserTimeData>();
      
      users.forEach(user => {
        userMap.set(user.id, {
          userId: user.id,
          userName: user.username || 'Unknown User',
          totalHours: 0,
          jobs: [],
        });
      });

      (timeEntries || []).forEach((entry: any) => {
        const userData = userMap.get(entry.user_id);
        if (userData) {
          // Find or create job entry
          let jobData = userData.jobs.find(j => j.jobId === entry.job_id);
          if (!jobData) {
            jobData = {
              jobId: entry.job_id,
              jobName: entry.jobs?.name || 'Unknown Job',
              clientName: entry.jobs?.client_name || '',
              totalHours: 0,
              entries: [],
            };
            userData.jobs.push(jobData);
          }
          
          jobData.entries.push(entry);
          jobData.totalHours += entry.total_hours || 0;
          userData.totalHours += entry.total_hours || 0;
        }
      });

      // Convert to array and filter out users with no hours, sort jobs within each user
      const usersWithTime = Array.from(userMap.values())
        .filter(u => u.totalHours > 0)
        .map(u => ({
          ...u,
          jobs: u.jobs.sort((a, b) => a.jobName.localeCompare(b.jobName)),
        }))
        .sort((a, b) => a.userName.localeCompare(b.userName));

      setWeekData({
        weekStart: weekStart.toISOString(),
        weekEnd: weekEnd.toISOString(),
        users: usersWithTime,
      });
    } catch (error: any) {
      console.error('Error loading week data:', error);
      toast.error('Failed to load time data');
    } finally {
      setLoading(false);
    }
  }

  function toggleUserExpanded(userId: string) {
    const newExpanded = new Set(expandedUsers);
    if (newExpanded.has(userId)) {
      newExpanded.delete(userId);
    } else {
      newExpanded.add(userId);
    }
    setExpandedUsers(newExpanded);
  }

  function toggleJobExpanded(jobKey: string) {
    const newExpanded = new Set(expandedJobs);
    if (newExpanded.has(jobKey)) {
      newExpanded.delete(jobKey);
    } else {
      newExpanded.add(jobKey);
    }
    setExpandedJobs(newExpanded);
  }

  async function exportWeekToPDF() {
    if (!weekData) return;

    setLoading(true);
    
    try {
      // Filter users based on selection
      const usersToExport = selectedUser === 'all' 
        ? weekData.users 
        : weekData.users.filter(u => u.userId === selectedUser);

      const weekLabel = weekOptions.find(w => w.value === selectedWeek)?.label || 'week';
      
      // Prepare data for PDF
      const pdfData = {
        title: `Payroll Report - ${weekLabel}`,
        users: usersToExport.map(user => ({
          name: user.userName,
          totalHours: user.totalHours,
          jobs: user.jobs.map(job => ({
            name: job.jobName,
            client: job.clientName,
            totalHours: job.totalHours,
            entries: job.entries.map(entry => ({
              date: new Date(entry.start_time).toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
              }),
              startTime: new Date(entry.start_time).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              }),
              endTime: entry.end_time 
                ? new Date(entry.end_time).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : '-',
              hours: (entry.total_hours || 0).toFixed(2),
              type: entry.is_manual ? 'Manual' : 'Timer',
            })),
          })),
        })),
      };

      // Call the edge function to generate PDF
      const { data, error } = await supabase.functions.invoke('generate-pdf', {
        body: { 
          type: 'payroll',
          data: pdfData,
        },
      });

      if (error) throw error;

      // Download the PDF
      const pdfBlob = new Blob(
        [Uint8Array.from(atob(data.pdf), c => c.charCodeAt(0))],
        { type: 'application/pdf' }
      );
      
      const url = URL.createObjectURL(pdfBlob);
      const link = document.createElement('a');
      link.href = url;
      
      const userLabel = selectedUser === 'all' ? 'All' : usersToExport[0]?.userName || 'User';
      link.download = `Payroll_${userLabel}_${weekLabel.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '')}.pdf`;
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      toast.success('PDF exported successfully');
    } catch (error: any) {
      console.error('PDF export error:', error);
      toast.error('Failed to export PDF');
    } finally {
      setLoading(false);
    }
  }

  const filteredUsers = selectedUser === 'all' 
    ? (weekData?.users || []) 
    : (weekData?.users.filter(u => u.userId === selectedUser) || []);

  const totalWeekHours = filteredUsers.reduce((sum, u) => sum + u.totalHours, 0);
  const totalEntries = filteredUsers.reduce((sum, u) => 
    sum + u.jobs.reduce((jobSum, j) => jobSum + j.entries.length, 0), 0
  );

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <header className="border-b bg-card sticky top-0 z-10 shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <DollarSign className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h1 className="text-xl font-bold">Payroll Dashboard</h1>
                <p className="text-sm text-muted-foreground">{profile?.username}</p>
              </div>
            </div>
            <Button variant="outline" onClick={() => {
              logout();
              window.location.reload();
            }}>
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Week Selector & Summary */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-4">
              <CardTitle className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-primary" />
                Time Entries by Week
              </CardTitle>
              <div className="flex items-center gap-3">
                <Select value={selectedWeek} onValueChange={setSelectedWeek}>
                  <SelectTrigger className="w-[280px]">
                    <SelectValue placeholder="Select week" />
                  </SelectTrigger>
                  <SelectContent>
                    {weekOptions.map(week => (
                      <SelectItem key={week.value} value={week.value}>
                        {week.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 bg-muted/30 rounded-lg">
                <div className="flex items-center gap-2 text-muted-foreground mb-2">
                  <Users className="w-4 h-4" />
                  <span className="text-sm">Employees</span>
                </div>
                <p className="text-3xl font-bold">
                  {loading ? '-' : filteredUsers.length}
                </p>
              </div>
              <div className="p-4 bg-muted/30 rounded-lg">
                <div className="flex items-center gap-2 text-muted-foreground mb-2">
                  <Clock className="w-4 h-4" />
                  <span className="text-sm">Total Hours</span>
                </div>
                <p className="text-3xl font-bold">
                  {loading ? '-' : totalWeekHours.toFixed(2)}
                </p>
              </div>
              <div className="p-4 bg-muted/30 rounded-lg">
                <div className="flex items-center gap-2 text-muted-foreground mb-2">
                  <Calendar className="w-4 h-4" />
                  <span className="text-sm">Entries</span>
                </div>
                <p className="text-3xl font-bold">
                  {loading ? '-' : totalEntries}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Filter & Export */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row gap-4 items-end">
              <div className="flex-1">
                <Label htmlFor="user-filter">Filter by Employee</Label>
                <Select value={selectedUser} onValueChange={setSelectedUser}>
                  <SelectTrigger id="user-filter">
                    <SelectValue placeholder="All employees" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Employees</SelectItem>
                    {(weekData?.users || []).map(user => (
                      <SelectItem key={user.userId} value={user.userId}>
                        {user.userName} - {user.totalHours.toFixed(2)}h across {user.jobs.length} job{user.jobs.length !== 1 ? 's' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={exportWeekToPDF}
                disabled={loading || !weekData || filteredUsers.length === 0}
                className="gradient-primary"
              >
                <Download className="w-4 h-4 mr-2" />
                Export to PDF
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Time Entries List */}
        {loading ? (
          <Card>
            <CardContent className="py-12 text-center">
              <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-muted-foreground">Loading time entries...</p>
            </CardContent>
          </Card>
        ) : !weekData || filteredUsers.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Clock className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">
                No time entries found for this week
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {filteredUsers.map(user => (
              <Card key={user.userId}>
                <CardHeader
                  className="cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => toggleUserExpanded(user.userId)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {expandedUsers.has(user.userId) ? (
                        <ChevronDown className="w-5 h-5 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="w-5 h-5 text-muted-foreground" />
                      )}
                      <div>
                        <CardTitle className="text-xl font-bold">{user.userName}</CardTitle>
                        <p className="text-sm text-muted-foreground mt-1">
                          {user.jobs.length} job{user.jobs.length !== 1 ? 's' : ''}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-3xl font-bold text-primary">{user.totalHours.toFixed(2)}h</p>
                      <p className="text-xs text-muted-foreground">Total Hours</p>
                    </div>
                  </div>
                </CardHeader>
                
                {expandedUsers.has(user.userId) && (
                  <CardContent className="pt-0">
                    <div className="border-t pt-4 space-y-3">
                      {user.jobs.map(job => {
                        const jobKey = `${user.userId}-${job.jobId}`;
                        return (
                          <Card key={jobKey} className="border-primary/20">
                            <CardHeader
                              className="cursor-pointer hover:bg-muted/30 transition-colors py-3"
                              onClick={() => toggleJobExpanded(jobKey)}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 flex-1">
                                  {expandedJobs.has(jobKey) ? (
                                    <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                                  ) : (
                                    <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                                  )}
                                  <div className="flex-1">
                                    <p className="font-bold text-base">{job.jobName}</p>
                                    {job.clientName && (
                                      <p className="text-xs text-muted-foreground mt-0.5">
                                        {job.clientName}
                                      </p>
                                    )}
                                  </div>
                                </div>
                                <div className="text-right ml-4">
                                  <p className="text-xl font-bold">{job.totalHours.toFixed(2)}h</p>
                                  <p className="text-xs text-muted-foreground">
                                    {job.entries.length} entr{job.entries.length !== 1 ? 'ies' : 'y'}
                                  </p>
                                </div>
                              </div>
                            </CardHeader>
                            
                            {expandedJobs.has(jobKey) && (
                              <CardContent className="pt-0 pb-3">
                                <div className="space-y-2">
                                  {job.entries.map(entry => (
                                    <div
                                      key={entry.id}
                                      className="p-3 bg-muted/30 rounded-lg border"
                                    >
                                      <div className="flex items-center justify-between mb-2">
                                        <span className="font-medium text-sm">
                                          {new Date(entry.start_time).toLocaleDateString('en-US', {
                                            weekday: 'short',
                                            month: 'short',
                                            day: 'numeric',
                                          })}
                                        </span>
                                        <Badge variant={entry.is_manual ? 'secondary' : 'default'} className="text-xs">
                                          {entry.is_manual ? 'Manual' : 'Timer'}
                                        </Badge>
                                      </div>
                                      
                                      <div className="grid grid-cols-2 gap-2 text-sm">
                                        <div>
                                          <span className="text-muted-foreground">Start:</span>
                                          <span className="ml-2 font-medium">
                                            {new Date(entry.start_time).toLocaleTimeString([], {
                                              hour: '2-digit',
                                              minute: '2-digit',
                                            })}
                                          </span>
                                        </div>
                                        <div>
                                          <span className="text-muted-foreground">End:</span>
                                          <span className="ml-2 font-medium">
                                            {entry.end_time 
                                              ? new Date(entry.end_time).toLocaleTimeString([], {
                                                  hour: '2-digit',
                                                  minute: '2-digit',
                                                })
                                              : '-'
                                            }
                                          </span>
                                        </div>
                                      </div>
                                      
                                      <div className="mt-2 pt-2 border-t flex items-center justify-between">
                                        <span className="text-xs text-muted-foreground">
                                          {entry.components?.name || 'Job-level time'}
                                        </span>
                                        <span className="text-lg font-bold text-primary">
                                          {(entry.total_hours || 0).toFixed(2)}h
                                        </span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </CardContent>
                            )}
                          </Card>
                        );
                      })}
                    </div>
                  </CardContent>
                )}
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
