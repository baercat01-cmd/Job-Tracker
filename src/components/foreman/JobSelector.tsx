
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Search, MapPin, ExternalLink, Target, Calendar as CalendarIcon, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import type { Job } from '@/types';

interface JobSelectorProps {
  onSelectJob: (job: Job) => void;
  userId: string;
  onShowJobCalendar?: (job: Job) => void;
}

interface JobWithProgress extends Job {
  totalManHours: number;
  progressPercent: number;
  actualProgressPercent: number;
  isOverBudget: boolean;
  ready_materials_count?: number;
}

export function JobSelector({ onSelectJob, userId, onShowJobCalendar }: JobSelectorProps) {
  const [jobs, setJobs] = useState<JobWithProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalReadyMaterials, setTotalReadyMaterials] = useState(0);

  useEffect(() => {
    loadJobs();
  }, [userId]);

  async function loadJobs() {
    try {
      // Get today's date in YYYY-MM-DD format (local timezone)
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

      // Only show active, non-internal jobs to crew members
      // If projected_start_date is set, only show jobs on or after that date
      const { data: jobsData, error: jobsError } = await supabase
        .from('jobs')
        .select('*')
        .eq('status', 'active') // Only active jobs - no quoting or on_hold
        .eq('is_internal', false)
        .or(`projected_start_date.is.null,projected_start_date.lte.${todayStr}`)
        .order('created_at', { ascending: false });

      if (jobsError) throw jobsError;

      // Load CLOCK-IN time entries only (component_id IS NULL) to calculate progress
      const { data: timeEntries, error: timeError } = await supabase
        .from('time_entries')
        .select('job_id, total_hours, crew_count, component_id')
        .is('component_id', null) // Only clock-in hours
        .not('total_hours', 'is', null);

      if (timeError) throw timeError;

      // Calculate total clock-in man-hours for each job
      const jobManHours = new Map<string, number>();
      (timeEntries || []).forEach((entry: any) => {
        const manHours = (entry.total_hours || 0) * (entry.crew_count || 1);
        const current = jobManHours.get(entry.job_id) || 0;
        jobManHours.set(entry.job_id, current + manHours);
      });

      // Filter out Misc Jobs (internal jobs already excluded from query)
      const filteredJobs = (jobsData || [])
        .filter(job => job.name !== 'Misc Jobs');

      // Load ready materials count for each job
      const jobsWithMaterials = await Promise.all(
        filteredJobs.map(async (job) => {
          const { count } = await supabase
            .from('materials')
            .select('id', { count: 'exact', head: true })
            .eq('job_id', job.id)
            .eq('status', 'at_shop');
          
          const totalManHours = jobManHours.get(job.id) || 0;
          const estimatedHours = job.estimated_hours || 0;
          const actualProgressPercent = estimatedHours > 0 
            ? (totalManHours / estimatedHours) * 100
            : 0;
          const progressPercent = Math.min(actualProgressPercent, 100);
          const isOverBudget = totalManHours > estimatedHours && estimatedHours > 0;

          return {
            ...job,
            totalManHours,
            progressPercent,
            actualProgressPercent,
            isOverBudget,
            ready_materials_count: count || 0,
          };
        })
      );
      
      const total = jobsWithMaterials.reduce((sum, job) => sum + (job.ready_materials_count || 0), 0);
      setTotalReadyMaterials(total);
      setJobs(jobsWithMaterials);
    } catch (error) {
      console.error('Error loading jobs:', error);
    } finally {
      setLoading(false);
    }
  }

  // Jobs are already filtered (no internal jobs)
  const filteredJobs = jobs;

  return (
    <div className="space-y-4">
      {/* Ready Materials Notification */}
      {totalReadyMaterials > 0 && (
        <Alert className="border-2 border-blue-500 bg-blue-50">
          <Package className="h-5 w-5 text-blue-600" />
          <AlertDescription className="ml-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-blue-900">
                {totalReadyMaterials} material{totalReadyMaterials > 1 ? 's' : ''} ready to go to job sites
              </span>
            </div>
            <p className="text-sm text-blue-700 mt-1">
              Select a job below to view and mark materials as delivered
            </p>
          </AlertDescription>
        </Alert>
      )}

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
                      <CardTitle className="text-xl mb-2 text-orange-700">{job.name}</CardTitle>
                      <p className="text-base font-medium text-muted-foreground">
                        {job.client_name}
                      </p>
                      {job.ready_materials_count && job.ready_materials_count > 0 && (
                        <Badge className="mt-2 bg-blue-100 text-blue-700 hover:bg-blue-200">
                          <Package className="w-3 h-3 mr-1" />
                          {job.ready_materials_count} ready for job
                        </Badge>
                      )}
                    </div>
                    {/* Calendar icon - prevent propagation to not trigger job selection */}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        onShowJobCalendar?.(job);
                      }}
                    >
                      <CalendarIcon className="w-4 h-4 text-muted-foreground" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 pb-4 space-y-3">
                  {job.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {job.description}
                    </p>
                  )}
                  
                  {/* Progress Bar */}
                  {job.estimated_hours && job.estimated_hours > 0 && (
                    <div className="space-y-2 pt-2">
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <Target className="w-4 h-4 text-primary" />
                          <span className="text-muted-foreground">Progress</span>
                        </div>
                        <span className={`font-bold ${
                          job.isOverBudget ? 'text-red-900 dark:text-red-400' : 'text-primary'
                        }`}>
                          {job.actualProgressPercent.toFixed(0)}%
                        </span>
                      </div>
                      
                      {/* First Progress Bar - Always shows up to 100% */}
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div 
                          className={`h-full transition-all ${
                            job.isOverBudget ? 'bg-red-900 dark:bg-red-700' : 'bg-primary'
                          }`}
                          style={{ width: `${job.progressPercent}%` }}
                        />
                      </div>
                      
                      {/* Second Progress Bar - Shows overflow when over 100% */}
                      {job.isOverBudget && job.actualProgressPercent > 100 && (
                        <div className="space-y-1">
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div 
                              className="h-full transition-all bg-red-900 dark:bg-red-700"
                              style={{ width: `${Math.min(job.actualProgressPercent - 100, 100)}%` }}
                            />
                          </div>
                          <div className="text-center">
                            <span className="text-xs font-bold text-red-900 dark:text-red-400">
                              {(job.actualProgressPercent - 100).toFixed(0)}% over budget
                            </span>
                          </div>
                        </div>
                      )}
                      

                    </div>
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
