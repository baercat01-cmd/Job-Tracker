import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, User, Calendar } from 'lucide-react';
import { format } from 'date-fns';

export function TimeEntriesView() {
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTimeEntries();
  }, []);

  async function loadTimeEntries() {
    try {
      const { data, error } = await supabase
        .from('time_entries')
        .select(`
          *,
          jobs(job_number, client_name),
          components(name),
          user_profiles(username, email)
        `)
        .order('start_time', { ascending: false })
        .limit(50);

      if (error) throw error;
      setEntries(data || []);
    } catch (error) {
      console.error('Error loading time entries:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Loading time entries...
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">Time Entries</h2>

      {entries.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No time entries found
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {entries.map((entry) => (
            <Card key={entry.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">
                      {entry.jobs?.job_number} - {entry.components?.name}
                    </CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">
                      {entry.jobs?.client_name}
                    </p>
                  </div>
                  <Badge variant={entry.is_active ? 'default' : 'secondary'}>
                    {entry.is_active ? 'Active' : 'Completed'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <div className="flex items-center text-muted-foreground mb-1">
                      <Calendar className="w-3 h-3 mr-1" />
                      <span className="text-xs">Date</span>
                    </div>
                    <p className="font-medium">
                      {format(new Date(entry.start_time), 'MMM d, yyyy')}
                    </p>
                  </div>
                  <div>
                    <div className="flex items-center text-muted-foreground mb-1">
                      <Clock className="w-3 h-3 mr-1" />
                      <span className="text-xs">Hours</span>
                    </div>
                    <p className="font-medium">
                      {entry.total_hours ? `${entry.total_hours} hrs` : 'In Progress'}
                    </p>
                  </div>
                  <div>
                    <div className="flex items-center text-muted-foreground mb-1">
                      <User className="w-3 h-3 mr-1" />
                      <span className="text-xs">Crew</span>
                    </div>
                    <p className="font-medium">{entry.crew_count} workers</p>
                  </div>
                  <div>
                    <div className="flex items-center text-muted-foreground mb-1">
                      <User className="w-3 h-3 mr-1" />
                      <span className="text-xs">By</span>
                    </div>
                    <p className="font-medium text-xs">
                      {entry.user_profiles?.username || entry.user_profiles?.email}
                    </p>
                  </div>
                </div>
                {entry.is_manual && (
                  <Badge variant="outline" className="text-xs">
                    Manual Entry
                  </Badge>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
