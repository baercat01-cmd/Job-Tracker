import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Clock, User, Calendar, Printer } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { FunctionsHttpError } from '@supabase/supabase-js';

interface JobTimeEntriesProps {
  jobId: string;
}

export function JobTimeEntries({ jobId }: JobTimeEntriesProps) {
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalHours, setTotalHours] = useState(0);
  const [allEntries, setAllEntries] = useState<any[]>([]);
  const [exporting, setExporting] = useState(false);
  const [jobInfo, setJobInfo] = useState<any>(null);

  useEffect(() => {
    loadEntries();
    loadJobInfo();
  }, [jobId]);

  async function loadJobInfo() {
    try {
      const { data, error } = await supabase
        .from('jobs')
        .select('name, client_name, address')
        .eq('id', jobId)
        .single();

      if (error) throw error;
      setJobInfo(data);
    } catch (error) {
      console.error('Error loading job info:', error);
    }
  }

  async function loadEntries() {
    try {
      // Load recent entries for display
      const { data: recentData, error: recentError } = await supabase
        .from('time_entries')
        .select(`
          *,
          components(name),
          user_profiles(username, email)
        `)
        .eq('job_id', jobId)
        .eq('is_active', false)
        .order('created_at', { ascending: false })
        .limit(10);

      if (recentError) throw recentError;
      setEntries(recentData || []);

      // Load ALL entries for printing and totals
      const { data: allData, error: allError } = await supabase
        .from('time_entries')
        .select(`
          *,
          components(name),
          user_profiles(username, email)
        `)
        .eq('job_id', jobId)
        .eq('is_active', false)
        .order('start_time', { ascending: true });

      if (allError) throw allError;
      setAllEntries(allData || []);
      
      const total = (allData || []).reduce((sum, entry) => sum + (entry.total_hours || 0), 0);
      setTotalHours(total);
    } catch (error) {
      console.error('Error loading time entries:', error);
    } finally {
      setLoading(false);
    }
  }

  async function printJobHours() {
    if (allEntries.length === 0 || !jobInfo) {
      toast.error('No time entries to print');
      return;
    }

    setExporting(true);

    try {
      // Group entries by user
      const userMap = new Map<string, any>();
      
      allEntries.forEach(entry => {
        const userId = entry.user_id;
        const userName = entry.user_profiles?.username || entry.user_profiles?.email || 'Unknown User';
        
        if (!userMap.has(userId)) {
          userMap.set(userId, {
            userId,
            userName,
            totalHours: 0,
            entries: [],
          });
        }
        
        const userData = userMap.get(userId)!;
        userData.totalHours += entry.total_hours || 0;
        userData.entries.push({
          date: format(new Date(entry.start_time), 'MMM d, yyyy'),
          component: entry.components?.name || 'Unknown',
          startTime: format(new Date(entry.start_time), 'h:mm a'),
          endTime: entry.end_time ? format(new Date(entry.end_time), 'h:mm a') : '-',
          hours: (entry.total_hours || 0).toFixed(2),
          crewCount: entry.crew_count || 1,
          notes: entry.notes || '',
          isManual: entry.is_manual,
        });
      });

      const users = Array.from(userMap.values()).sort((a, b) => 
        a.userName.localeCompare(b.userName)
      );

      const pdfData = {
        title: 'Job Hours Report',
        jobName: jobInfo.name,
        clientName: jobInfo.client_name,
        address: jobInfo.address,
        totalHours: totalHours.toFixed(2),
        users,
      };

      const { data, error } = await supabase.functions.invoke('generate-pdf', {
        body: {
          type: 'job-hours',
          data: pdfData,
        },
      });

      if (error) {
        if (error instanceof FunctionsHttpError) {
          const errorText = await error.context.text();
          throw new Error(errorText || error.message);
        }
        throw error;
      }

      // Open HTML in new window with print dialog
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(data);
        printWindow.document.close();
      } else {
        toast.error('Please allow popups to print');
      }

      toast.success('Print dialog opened');
    } catch (error: any) {
      console.error('Print error:', error);
      toast.error(error.message || 'Failed to generate print preview');
    } finally {
      setExporting(false);
    }
  }

  if (loading) {
    return <p className="text-center text-muted-foreground py-4">Loading time entries...</p>;
  }

  if (entries.length === 0) {
    return <p className="text-center text-muted-foreground py-4">No time entries recorded yet</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold flex items-center gap-2">
          <Clock className="w-4 h-4" />
          Recent Time Entries
        </h3>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">
            Total: {totalHours.toFixed(2)}h
          </Badge>
          <Button
            size="sm"
            variant="outline"
            onClick={printJobHours}
            disabled={exporting || allEntries.length === 0}
          >
            {exporting ? (
              <>
                <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                Preparing...
              </>
            ) : (
              <>
                <Printer className="w-3 h-3 mr-2" />
                Print All Hours
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        {entries.map((entry: any) => (
          <Card key={entry.id}>
            <CardContent className="py-3">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{entry.components?.name || 'Unknown'}</p>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1 flex-wrap">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {format(new Date(entry.created_at), 'MMM d, yyyy')}
                    </span>
                    <span className="flex items-center gap-1">
                      <User className="w-3 h-3" />
                      {entry.user_profiles?.username || entry.user_profiles?.email}
                    </span>
                    <span>{entry.crew_count} crew</span>
                    {entry.is_manual && (
                      <Badge variant="outline" className="text-xs">Manual</Badge>
                    )}
                  </div>
                  {entry.notes && (
                    <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{entry.notes}</p>
                  )}
                </div>
                <div className="text-right ml-3 flex-shrink-0">
                  <p className="text-lg font-bold">{entry.total_hours?.toFixed(2)}h</p>
                  <p className="text-xs text-muted-foreground">
                    {((entry.total_hours || 0) * (entry.crew_count || 1)).toFixed(2)} man-hours
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
