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

interface DateEntryData {
  date: string;
  entries: {
    jobName: string;
    clientName: string;
    startTime: string;
    endTime: string | null;
    totalHours: number;
    isManual: boolean;
    notes: string | null;
  }[];
  totalHours: number;
}

interface UserTimeData {
  userId: string;
  userName: string;
  totalHours: number;
  dateEntries: DateEntryData[];
}

interface WeekData {
  weekStart: string;
  weekEnd: string;
  users: UserTimeData[];
}

export function PayrollDashboard() {
  const { profile, clearUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [selectedWeek, setSelectedWeek] = useState<string>('');
  const [weekOptions, setWeekOptions] = useState<{ value: string; label: string }[]>([]);
  const [weekData, setWeekData] = useState<WeekData | null>(null);
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());
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

      // Group entries by user, then by date
      const userMap = new Map<string, UserTimeData>();
      
      users.forEach(user => {
        userMap.set(user.id, {
          userId: user.id,
          userName: user.username || 'Unknown User',
          totalHours: 0,
          dateEntries: [],
        });
      });

      (timeEntries || []).forEach((entry: any) => {
        const userData = userMap.get(entry.user_id);
        if (userData) {
          // Get date string (YYYY-MM-DD)
          const dateStr = new Date(entry.start_time).toISOString().split('T')[0];
          
          // Find or create date entry
          let dateData = userData.dateEntries.find(d => d.date === dateStr);
          if (!dateData) {
            dateData = {
              date: dateStr,
              entries: [],
              totalHours: 0,
            };
            userData.dateEntries.push(dateData);
          }
          
          // Add entry to date
          dateData.entries.push({
            jobName: entry.jobs?.name || 'Unknown Job',
            clientName: entry.jobs?.client_name || '',
            startTime: entry.start_time,
            endTime: entry.end_time,
            totalHours: entry.total_hours || 0,
            isManual: entry.is_manual,
            notes: entry.notes,
          });
          
          dateData.totalHours += entry.total_hours || 0;
          userData.totalHours += entry.total_hours || 0;
        }
      });

      // Convert to array and filter out users with no hours, sort dates within each user
      const usersWithTime = Array.from(userMap.values())
        .filter(u => u.totalHours > 0)
        .map(u => ({
          ...u,
          dateEntries: u.dateEntries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()), // Most recent first
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
          dates: user.dateEntries.map(dateEntry => ({
            date: new Date(dateEntry.date).toLocaleDateString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            }),
            totalHours: dateEntry.totalHours,
            entries: dateEntry.entries.map(entry => ({
              job: entry.jobName,
              client: entry.clientName,
              startTime: new Date(entry.startTime).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              }),
              endTime: entry.endTime 
                ? new Date(entry.endTime).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : '-',
              hours: entry.totalHours.toFixed(2),
              type: entry.isManual ? 'Manual' : 'Timer',
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
    sum + u.dateEntries.reduce((dateSum, d) => dateSum + d.entries.length, 0), 0
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
              clearUser();
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
                        {user.userName} - {user.totalHours.toFixed(2)}h across {user.dateEntries.length} day{user.dateEntries.length !== 1 ? 's' : ''}
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
                          {user.dateEntries.length} day{user.dateEntries.length !== 1 ? 's' : ''} worked
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
                    <div className="border-t pt-4">
                      {/* Spreadsheet Table */}
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b bg-muted/30">
                              <th className="text-left p-2 font-semibold">Date</th>
                              <th className="text-left p-2 font-semibold">Job</th>
                              <th className="text-left p-2 font-semibold">Client</th>
                              <th className="text-left p-2 font-semibold">Start</th>
                              <th className="text-left p-2 font-semibold">End</th>
                              <th className="text-right p-2 font-semibold">Hours</th>
                              <th className="text-center p-2 font-semibold">Type</th>
                              <th className="text-left p-2 font-semibold">Notes</th>
                            </tr>
                          </thead>
                          <tbody>
                            {user.dateEntries.map((dateEntry, dateIdx) => (
                              dateEntry.entries.map((entry, entryIdx) => (
                                <tr 
                                  key={`${dateIdx}-${entryIdx}`}
                                  className="border-b hover:bg-muted/20 transition-colors"
                                >
                                  <td className="p-2 font-medium">
                                    {new Date(dateEntry.date).toLocaleDateString('en-US', {
                                      month: 'short',
                                      day: 'numeric',
                                      year: 'numeric',
                                    })}
                                  </td>
                                  <td className="p-2">{entry.jobName}</td>
                                  <td className="p-2 text-muted-foreground">{entry.clientName || '-'}</td>
                                  <td className="p-2 font-mono text-xs">
                                    {new Date(entry.startTime).toLocaleTimeString([], {
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })}
                                  </td>
                                  <td className="p-2 font-mono text-xs">
                                    {entry.endTime 
                                      ? new Date(entry.endTime).toLocaleTimeString([], {
                                          hour: '2-digit',
                                          minute: '2-digit',
                                        })
                                      : '-'
                                    }
                                  </td>
                                  <td className="p-2 text-right font-bold text-primary">
                                    {entry.totalHours.toFixed(2)}
                                  </td>
                                  <td className="p-2 text-center">
                                    <Badge 
                                      variant={entry.isManual ? 'secondary' : 'default'} 
                                      className="text-xs"
                                    >
                                      {entry.isManual ? 'Manual' : 'Timer'}
                                    </Badge>
                                  </td>
                                  <td className="p-2 text-xs text-muted-foreground max-w-[200px] truncate">
                                    {entry.notes || '-'}
                                  </td>
                                </tr>
                              ))
                            ))}
                            {/* Total Row */}
                            <tr className="bg-muted/50 font-bold">
                              <td className="p-2" colSpan={5}>Total</td>
                              <td className="p-2 text-right text-primary text-lg">
                                {user.totalHours.toFixed(2)}
                              </td>
                              <td className="p-2" colSpan={2}></td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
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
