import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, User, Calendar } from 'lucide-react';
import { format } from 'date-fns';

interface JobTimeEntriesProps {
  jobId: string;
}

export function JobTimeEntries({ jobId }: JobTimeEntriesProps) {
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalHours, setTotalHours] = useState(0);

  useEffect(() => {
    loadEntries();
  }, [jobId]);

  async function loadEntries() {
    try {
      const { data, error } = await supabase
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

      if (error) throw error;

      setEntries(data || []);
      
      const total = (data || []).reduce((sum, entry) => sum + (entry.total_hours || 0), 0);
      setTotalHours(total);
    } catch (error) {
      console.error('Error loading time entries:', error);
    } finally {
      setLoading(false);
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
        <Badge variant="secondary">
          Total: {totalHours.toFixed(2)}h
        </Badge>
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
