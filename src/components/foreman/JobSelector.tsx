
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, MapPin, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Job } from '@/types';

interface JobSelectorProps {
  onSelectJob: (job: Job) => void;
  userId: string;
}

export function JobSelector({ onSelectJob, userId }: JobSelectorProps) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadJobs();
  }, [userId]);

  async function loadJobs() {
    try {
      // Only show active jobs to crew members
      const { data, error } = await supabase
        .from('jobs')
        .select('*')
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setJobs(data || []);
    } catch (error) {
      console.error('Error loading jobs:', error);
    } finally {
      setLoading(false);
    }
  }

  const filteredJobs = jobs.filter(
    (job) =>
      job.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      job.client_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      job.address.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search jobs..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
      </div> {/* This closing div tag was missing */}

      {loading ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Loading jobs...
          </CardContent>
        </Card>
      ) : filteredJobs.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No active jobs found
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredJobs.map((job) => (
            <Card
              key={job.id}
              className="cursor-pointer hover:shadow-md hover:border-primary transition-all"
            >
              {/* Main clickable area for opening the job */}
              <div onClick={() => onSelectJob(job)}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-xl mb-2">{job.name}</CardTitle>
                      <p className="text-base font-medium text-muted-foreground">
                        {job.client_name}
                      </p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 pb-4">
                  {job.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {job.description}
                    </p>
                  )}
                </CardContent>
              </div>
              
              {/* Separate button for address link - requires deliberate action */}
              <CardContent className="pt-0 pb-3 border-t">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-xs h-auto py-2"
                  asChild
                  onClick={(e: React.MouseEvent) => e.stopPropagation()}
                >
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(job.address)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2"
                  >
                    <MapPin className="w-3 h-3 flex-shrink-0" />
                    <span className="flex-1 text-left line-clamp-2">{job.address}</span>
                    <ExternalLink className="w-3 h-3 flex-shrink-0" />
                  </a>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
