import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Download, FileDown, Calendar } from 'lucide-react';
import { toast } from 'sonner';
import type { Job } from '@/types';

interface TimeEntry {
  id: string;
  component_id: string;
  start_time: string;
  end_time: string;
  total_hours: number;
  crew_count: number;
  user_id: string;
  is_manual: boolean;
  notes: string;
  components: { name: string };
  user_profiles: { username: string };
}

interface DailyLog {
  id: string;
  log_date: string;
  weather: string;
  weather_details: any;
  components_worked: any[];
  time_summary: any[];
  issues: any[];
  material_requests_structured: any[];
  client_summary: string;
  final_notes: string;
  crew_count: number;
  created_by: string;
  photos_logged: any[];
  user_profiles: { username: string };
}

interface Photo {
  id: string;
  photo_date: string;
  photo_url: string;
  caption: string;
  gps_lat: number;
  gps_lng: number;
  uploaded_by: string;
  component_id: string;
  components: { name: string } | null;
  user_profiles: { username: string };
}

export function DataExport() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJob, setSelectedJob] = useState<string>('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [exportMode, setExportMode] = useState<'single' | 'all'>('single');

  useEffect(() => {
    loadJobs();
    
    // Set default date range to current month
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    
    setStartDate(firstDay.toISOString().split('T')[0]);
    setEndDate(lastDay.toISOString().split('T')[0]);
  }, []);

  async function loadJobs() {
    try {
      const { data, error } = await supabase
        .from('jobs')
        .select('*')
        .order('name');

      if (error) throw error;
      setJobs(data || []);
    } catch (error: any) {
      console.error('Error loading jobs:', error);
      toast.error('Failed to load jobs');
    }
  }

  async function exportSingleJob() {
    if (!selectedJob) {
      toast.error('Please select a job');
      return;
    }

    if (!startDate || !endDate) {
      toast.error('Please select date range');
      return;
    }

    setLoading(true);

    try {
      const job = jobs.find(j => j.id === selectedJob);
      if (!job) throw new Error('Job not found');

      // Fetch time entries
      const { data: timeEntries, error: timeError } = await supabase
        .from('time_entries')
        .select(`
          *,
          components(name),
          user_profiles(username)
        `)
        .eq('job_id', selectedJob)
        .gte('start_time', startDate)
        .lte('start_time', endDate + 'T23:59:59')
        .order('start_time');

      if (timeError) throw timeError;

      // Fetch daily logs
      const { data: dailyLogs, error: logsError } = await supabase
        .from('daily_logs')
        .select(`
          *,
          user_profiles(username)
        `)
        .eq('job_id', selectedJob)
        .gte('log_date', startDate)
        .lte('log_date', endDate)
        .order('log_date');

      if (logsError) throw logsError;

      // Fetch photos
      const { data: photos, error: photosError } = await supabase
        .from('photos')
        .select(`
          *,
          components(name),
          user_profiles(username)
        `)
        .eq('job_id', selectedJob)
        .gte('photo_date', startDate)
        .lte('photo_date', endDate)
        .order('photo_date');

      if (photosError) throw photosError;

      // Generate report
      const report = generateReport(job, timeEntries as TimeEntry[], dailyLogs as DailyLog[], photos as Photo[], startDate, endDate);

      // Download as text file
      const blob = new Blob([report], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${job.name.replace(/[^a-z0-9]/gi, '_')}_Report_${startDate}_to_${endDate}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success('Job report downloaded successfully');
    } catch (error: any) {
      console.error('Export error:', error);
      toast.error('Failed to export data');
    } finally {
      setLoading(false);
    }
  }

  async function exportAllJobs() {
    if (!startDate || !endDate) {
      toast.error('Please select date range');
      return;
    }

    setLoading(true);

    try {
      // Fetch all jobs
      const { data: allJobs, error: jobsError } = await supabase
        .from('jobs')
        .select('*')
        .order('name');

      if (jobsError) throw jobsError;

      // Fetch all time entries for the date range
      const { data: allTimeEntries, error: timeError } = await supabase
        .from('time_entries')
        .select(`
          *,
          components(name),
          user_profiles(username),
          jobs(name, client_name, job_number)
        `)
        .gte('start_time', startDate)
        .lte('start_time', endDate + 'T23:59:59')
        .order('start_time');

      if (timeError) throw timeError;

      // Fetch all daily logs for the date range
      const { data: allDailyLogs, error: logsError } = await supabase
        .from('daily_logs')
        .select(`
          *,
          user_profiles(username),
          jobs(name, client_name, job_number)
        `)
        .gte('log_date', startDate)
        .lte('log_date', endDate)
        .order('log_date');

      if (logsError) throw logsError;

      // Fetch all photos for the date range
      const { data: allPhotos, error: photosError } = await supabase
        .from('photos')
        .select(`
          *,
          components(name),
          user_profiles(username),
          jobs(name, client_name, job_number)
        `)
        .gte('photo_date', startDate)
        .lte('photo_date', endDate)
        .order('photo_date');

      if (photosError) throw photosError;

      // Generate comprehensive report
      const report = generateAllJobsReport(
        allJobs || [],
        allTimeEntries as any[] || [],
        allDailyLogs as any[] || [],
        allPhotos as any[] || [],
        startDate,
        endDate
      );

      // Download as text file
      const blob = new Blob([report], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `All_Jobs_Report_${startDate}_to_${endDate}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success('All jobs report downloaded successfully');
    } catch (error: any) {
      console.error('Export error:', error);
      toast.error('Failed to export data');
    } finally {
      setLoading(false);
    }
  }

  function generateAllJobsReport(
    allJobs: Job[],
    timeEntries: any[],
    dailyLogs: any[],
    photos: any[],
    startDate: string,
    endDate: string
  ): string {
    let report = '';

    // Header
    report += `# All Jobs Report\n\n`;
    report += `**Report Period:** ${formatDate(startDate)} to ${formatDate(endDate)}\n`;
    report += `**Generated:** ${new Date().toLocaleString()}\n`;
    report += `**Total Jobs:** ${allJobs.length}\n\n`;
    report += `---\n\n`;

    // Overall Summary
    report += `## Overall Summary\n\n`;

    const totalActualHours = timeEntries.reduce((sum, entry) => sum + (entry.total_hours || 0), 0);
    const totalCrewHours = timeEntries.reduce((sum, entry) => sum + ((entry.total_hours || 0) * (entry.crew_count || 1)), 0);

    report += `**Total Time Entries:** ${timeEntries.length}\n`;
    report += `**Total Actual Hours:** ${totalActualHours.toFixed(2)} hours\n`;
    report += `**Total Crew Hours:** ${totalCrewHours.toFixed(2)} hours\n`;
    report += `**Total Daily Logs:** ${dailyLogs.length}\n`;
    report += `**Total Photos:** ${photos.length}\n\n`;

    // Component breakdown across all jobs
    const componentTotals = new Map<string, { hours: number; crewHours: number }>();
    
    timeEntries.forEach(entry => {
      const componentName = entry.components?.name || 'Unknown Component';
      const existing = componentTotals.get(componentName) || { hours: 0, crewHours: 0 };
      const crewHours = (entry.total_hours || 0) * (entry.crew_count || 1);
      
      componentTotals.set(componentName, {
        hours: existing.hours + (entry.total_hours || 0),
        crewHours: existing.crewHours + crewHours
      });
    });

    report += `### Time by Component (All Jobs)\n\n`;
    report += `| Component | Actual Hours | Crew Hours |\n`;
    report += `|-----------|--------------|------------|\n`;
    
    Array.from(componentTotals.entries())
      .sort((a, b) => b[1].crewHours - a[1].crewHours)
      .forEach(([component, totals]) => {
        report += `| ${component} | ${totals.hours.toFixed(2)} | ${totals.crewHours.toFixed(2)} |\n`;
      });

    report += `\n---\n\n`;

    // Job-by-job breakdown
    report += `## Individual Job Summaries\n\n`;

    allJobs.forEach(job => {
      const jobTimeEntries = timeEntries.filter(e => e.job_id === job.id);
      const jobDailyLogs = dailyLogs.filter(l => l.job_id === job.id);
      const jobPhotos = photos.filter(p => p.job_id === job.id);

      if (jobTimeEntries.length === 0 && jobDailyLogs.length === 0 && jobPhotos.length === 0) {
        return; // Skip jobs with no activity
      }

      report += `### ${job.name}\n\n`;
      report += `**Client:** ${job.client_name}\n`;
      if (job.job_number) report += `**Job Number:** ${job.job_number}\n`;
      report += `**Address:** ${job.address}\n\n`;

      const jobActualHours = jobTimeEntries.reduce((sum, e) => sum + (e.total_hours || 0), 0);
      const jobCrewHours = jobTimeEntries.reduce((sum, e) => sum + ((e.total_hours || 0) * (e.crew_count || 1)), 0);

      report += `**Time Entries:** ${jobTimeEntries.length}\n`;
      report += `**Actual Hours:** ${jobActualHours.toFixed(2)}\n`;
      report += `**Crew Hours:** ${jobCrewHours.toFixed(2)}\n`;
      report += `**Daily Logs:** ${jobDailyLogs.length}\n`;
      report += `**Photos:** ${jobPhotos.length}\n\n`;

      // Component breakdown for this job
      const jobComponentTotals = new Map<string, { hours: number; crewHours: number }>();
      
      jobTimeEntries.forEach(entry => {
        const componentName = entry.components?.name || 'Unknown';
        const existing = jobComponentTotals.get(componentName) || { hours: 0, crewHours: 0 };
        const crewHours = (entry.total_hours || 0) * (entry.crew_count || 1);
        
        jobComponentTotals.set(componentName, {
          hours: existing.hours + (entry.total_hours || 0),
          crewHours: existing.crewHours + crewHours
        });
      });

      if (jobComponentTotals.size > 0) {
        report += `**Components:**\n`;
        Array.from(jobComponentTotals.entries())
          .sort((a, b) => b[1].crewHours - a[1].crewHours)
          .forEach(([component, totals]) => {
            report += `- ${component}: ${totals.hours.toFixed(2)} hrs (${totals.crewHours.toFixed(2)} crew hrs)\n`;
          });
        report += `\n`;
      }

      report += `---\n\n`;
    });

    // Detailed time entries by job
    report += `## Detailed Time Entries\n\n`;
    
    if (timeEntries.length === 0) {
      report += `*No time entries for this period.*\n\n`;
    } else {
      report += `| Date | Job | Component | User | Hours | Crew | Crew Hours | Method |\n`;
      report += `|------|-----|-----------|------|-------|------|------------|--------|\n`;
      
      timeEntries.forEach(entry => {
        const startTime = new Date(entry.start_time);
        const crewHours = (entry.total_hours || 0) * (entry.crew_count || 1);
        
        report += `| ${formatDate(entry.start_time)} `;
        report += `| ${entry.jobs?.name || 'Unknown'} `;
        report += `| ${entry.components?.name || 'Unknown'} `;
        report += `| ${entry.user_profiles?.username || 'Unknown'} `;
        report += `| ${(entry.total_hours || 0).toFixed(2)} `;
        report += `| ${entry.crew_count || 1} `;
        report += `| ${crewHours.toFixed(2)} `;
        report += `| ${entry.is_manual ? 'Manual' : 'Timer'} |\n`;
      });
      
      report += `\n`;
    }

    // Daily logs by job and date
    report += `---\n\n`;
    report += `## Daily Activity Logs\n\n`;

    if (dailyLogs.length === 0) {
      report += `*No daily logs for this period.*\n\n`;
    } else {
      // Group by job
      const logsByJob = new Map<string, any[]>();
      dailyLogs.forEach(log => {
        const jobId = log.job_id;
        if (!logsByJob.has(jobId)) {
          logsByJob.set(jobId, []);
        }
        logsByJob.get(jobId)?.push(log);
      });

      logsByJob.forEach((logs, jobId) => {
        const jobName = logs[0]?.jobs?.name || 'Unknown Job';
        report += `### ${jobName}\n\n`;

        logs.forEach((log, index) => {
          report += `**Day ${index + 1}: ${formatDate(log.log_date)}**\n`;
          report += `- Logged by: ${log.user_profiles?.username || 'Unknown'}\n`;
          report += `- Crew Count: ${log.crew_count || 'Not specified'}\n`;
          
          if (log.weather_details) {
            const weather = log.weather_details;
            report += `- Weather: ${weather.description || log.weather || 'Not recorded'}`;
            if (weather.temp_f) {
              report += ` (${weather.temp_f}°F)`;
            }
            report += `\n`;
          } else if (log.weather) {
            report += `- Weather: ${log.weather}\n`;
          }

          if (log.client_summary) {
            report += `- Work: ${log.client_summary}\n`;
          }

          if (log.issues && log.issues.length > 0) {
            report += `- Issues: ${log.issues.map((i: any) => i.description || i).join('; ')}\n`;
          }

          report += `\n`;
        });

        report += `---\n\n`;
      });
    }

    // Photos summary
    if (photos.length > 0) {
      report += `## Photo Documentation Summary\n\n`;
      report += `**Total Photos:** ${photos.length}\n\n`;

      // Group by job
      const photosByJob = new Map<string, any[]>();
      photos.forEach(photo => {
        const jobId = photo.job_id;
        if (!photosByJob.has(jobId)) {
          photosByJob.set(jobId, []);
        }
        photosByJob.get(jobId)?.push(photo);
      });

      photosByJob.forEach((jobPhotos, jobId) => {
        const jobName = jobPhotos[0]?.jobs?.name || 'Unknown Job';
        report += `### ${jobName} (${jobPhotos.length} photos)\n\n`;
        
        jobPhotos.forEach((photo, index) => {
          report += `${index + 1}. ${photo.caption || 'Untitled'}`;
          if (photo.components?.name) {
            report += ` (${photo.components.name})`;
          }
          report += ` - ${formatDate(photo.photo_date)}\n`;
        });
        
        report += `\n`;
      });
    }

    return report;
  }

  function generateReport(
    job: Job,
    timeEntries: TimeEntry[],
    dailyLogs: DailyLog[],
    photos: Photo[],
    startDate: string,
    endDate: string
  ): string {
    let report = '';

    // Header
    report += `# Job Report: ${job.name}\n\n`;
    report += `**Client:** ${job.client_name}\n`;
    report += `**Job Number:** ${job.job_number || 'N/A'}\n`;
    report += `**Address:** ${job.address}\n`;
    report += `**Report Period:** ${formatDate(startDate)} to ${formatDate(endDate)}\n`;
    report += `**Generated:** ${new Date().toLocaleString()}\n\n`;

    if (job.description) {
      report += `**Description:** ${job.description}\n\n`;
    }

    report += `---\n\n`;

    // Job Summary
    report += `## Job Summary\n\n`;

    // Calculate component totals
    const componentTotals = new Map<string, { hours: number; crewHours: number }>();
    
    timeEntries.forEach(entry => {
      const componentName = entry.components?.name || 'Unknown Component';
      const existing = componentTotals.get(componentName) || { hours: 0, crewHours: 0 };
      const crewHours = (entry.total_hours || 0) * (entry.crew_count || 1);
      
      componentTotals.set(componentName, {
        hours: existing.hours + (entry.total_hours || 0),
        crewHours: existing.crewHours + crewHours
      });
    });

    const totalActualHours = Array.from(componentTotals.values()).reduce((sum, val) => sum + val.hours, 0);
    const totalCrewHours = Array.from(componentTotals.values()).reduce((sum, val) => sum + val.crewHours, 0);

    report += `**Total Actual Hours:** ${totalActualHours.toFixed(2)} hours\n`;
    report += `**Total Crew Hours:** ${totalCrewHours.toFixed(2)} hours\n`;
    report += `**Total Photos:** ${photos.length}\n`;
    report += `**Daily Logs:** ${dailyLogs.length}\n\n`;

    // Component Breakdown
    report += `### Time by Component\n\n`;
    report += `| Component | Actual Hours | Crew Hours |\n`;
    report += `|-----------|--------------|------------|\n`;
    
    Array.from(componentTotals.entries())
      .sort((a, b) => b[1].crewHours - a[1].crewHours)
      .forEach(([component, totals]) => {
        report += `| ${component} | ${totals.hours.toFixed(2)} | ${totals.crewHours.toFixed(2)} |\n`;
      });

    report += `\n---\n\n`;

    // Daily Logs
    report += `## Daily Activity Logs\n\n`;

    if (dailyLogs.length === 0) {
      report += `*No daily logs for this period.*\n\n`;
    } else {
      dailyLogs.forEach((log, index) => {
        report += `### Day ${index + 1}: ${formatDate(log.log_date)}\n\n`;
        report += `**Logged by:** ${log.user_profiles?.username || 'Unknown'}\n`;
        report += `**Crew Count:** ${log.crew_count || 'Not specified'}\n`;
        
        if (log.weather_details) {
          const weather = log.weather_details;
          report += `**Weather:** ${weather.description || log.weather || 'Not recorded'}`;
          if (weather.temp_f) {
            report += ` (${weather.temp_f}°F)`;
          }
          report += `\n`;
        } else if (log.weather) {
          report += `**Weather:** ${log.weather}\n`;
        }
        
        report += `\n`;

        // Components worked
        if (log.components_worked && log.components_worked.length > 0) {
          report += `**Components Worked:**\n`;
          log.components_worked.forEach(comp => {
            report += `- ${comp.name || comp}\n`;
          });
          report += `\n`;
        }

        // Time summary
        if (log.time_summary && log.time_summary.length > 0) {
          report += `**Time Summary:**\n`;
          log.time_summary.forEach(entry => {
            report += `- ${entry.component}: ${entry.hours} hours (${entry.crew_count} crew)\n`;
          });
          report += `\n`;
        }

        // Work performed (client summary)
        if (log.client_summary) {
          report += `**Work Performed:**\n${log.client_summary}\n\n`;
        }

        // Issues
        if (log.issues && log.issues.length > 0) {
          report += `**Issues/Notes:**\n`;
          log.issues.forEach(issue => {
            report += `- ${issue.description || issue}\n`;
          });
          report += `\n`;
        }

        // Material requests
        if (log.material_requests_structured && log.material_requests_structured.length > 0) {
          report += `**Material Requests:**\n`;
          log.material_requests_structured.forEach(req => {
            report += `- ${req.item}: ${req.quantity}`;
            if (req.priority) report += ` (${req.priority})`;
            report += `\n`;
          });
          report += `\n`;
        }

        // Additional notes
        if (log.final_notes) {
          report += `**Additional Notes:**\n${log.final_notes}\n\n`;
        }

        // Photos for this day
        const dayPhotos = photos.filter(p => p.photo_date === log.log_date);
        if (dayPhotos.length > 0) {
          report += `**Photos (${dayPhotos.length}):**\n`;
          dayPhotos.forEach(photo => {
            report += `- ${photo.caption || 'Untitled'}`;
            if (photo.components?.name) {
              report += ` (${photo.components.name})`;
            }
            report += `\n  URL: ${photo.photo_url}\n`;
            if (photo.gps_lat && photo.gps_lng) {
              report += `  Location: ${photo.gps_lat}, ${photo.gps_lng}\n`;
            }
          });
          report += `\n`;
        }

        report += `---\n\n`;
      });
    }

    // Detailed Time Entries
    report += `## Detailed Time Entries\n\n`;
    
    if (timeEntries.length === 0) {
      report += `*No time entries for this period.*\n\n`;
    } else {
      report += `| Date | Component | User | Start Time | End Time | Hours | Crew | Crew Hours | Method |\n`;
      report += `|------|-----------|------|------------|----------|-------|------|------------|--------|\n`;
      
      timeEntries.forEach(entry => {
        const startTime = new Date(entry.start_time);
        const endTime = entry.end_time ? new Date(entry.end_time) : null;
        const crewHours = (entry.total_hours || 0) * (entry.crew_count || 1);
        
        report += `| ${formatDate(entry.start_time)} `;
        report += `| ${entry.components?.name || 'Unknown'} `;
        report += `| ${entry.user_profiles?.username || 'Unknown'} `;
        report += `| ${startTime.toLocaleTimeString()} `;
        report += `| ${endTime ? endTime.toLocaleTimeString() : 'N/A'} `;
        report += `| ${(entry.total_hours || 0).toFixed(2)} `;
        report += `| ${entry.crew_count || 1} `;
        report += `| ${crewHours.toFixed(2)} `;
        report += `| ${entry.is_manual ? 'Manual' : 'Timer'} |\n`;
      });
      
      report += `\n`;
    }

    // Photos Section
    if (photos.length > 0) {
      report += `---\n\n`;
      report += `## Photo Documentation\n\n`;
      
      const photosByDate = new Map<string, Photo[]>();
      photos.forEach(photo => {
        const date = photo.photo_date;
        if (!photosByDate.has(date)) {
          photosByDate.set(date, []);
        }
        photosByDate.get(date)?.push(photo);
      });

      Array.from(photosByDate.entries()).sort().forEach(([date, dayPhotos]) => {
        report += `### ${formatDate(date)} (${dayPhotos.length} photos)\n\n`;
        
        dayPhotos.forEach((photo, index) => {
          report += `**Photo ${index + 1}**\n`;
          report += `- Caption: ${photo.caption || 'Untitled'}\n`;
          if (photo.components?.name) {
            report += `- Component: ${photo.components.name}\n`;
          }
          report += `- Uploaded by: ${photo.user_profiles?.username || 'Unknown'}\n`;
          if (photo.gps_lat && photo.gps_lng) {
            report += `- GPS: ${photo.gps_lat}, ${photo.gps_lng}\n`;
          }
          report += `- URL: ${photo.photo_url}\n`;
          report += `\n`;
        });
      });
    }

    return report;
  }

  function formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Data Export</h2>
        <p className="text-muted-foreground">
          Export comprehensive job reports for NotebookLM integration
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileDown className="w-5 h-5" />
            Export Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Export Type</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={exportMode === 'single' ? 'default' : 'outline'}
                  onClick={() => setExportMode('single')}
                  className="flex-1"
                >
                  Single Job
                </Button>
                <Button
                  type="button"
                  variant={exportMode === 'all' ? 'default' : 'outline'}
                  onClick={() => setExportMode('all')}
                  className="flex-1"
                >
                  All Jobs
                </Button>
              </div>
            </div>

            {exportMode === 'single' && (
              <div className="space-y-2">
                <Label htmlFor="job-select">Select Job</Label>
                <Select value={selectedJob} onValueChange={setSelectedJob}>
                  <SelectTrigger id="job-select">
                    <SelectValue placeholder="Choose a job..." />
                  </SelectTrigger>
                  <SelectContent>
                    {jobs.map(job => (
                      <SelectItem key={job.id} value={job.id}>
                        {job.name} - {job.client_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="start-date">Start Date</Label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="start-date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="end-date">End Date</Label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="end-date"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
          </div>

          <div className="pt-4 border-t">
            <Button
              onClick={exportMode === 'single' ? exportSingleJob : exportAllJobs}
              disabled={
                loading ||
                !startDate ||
                !endDate ||
                (exportMode === 'single' && !selectedJob)
              }
              className="w-full"
              size="lg"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin mr-2" />
                  Generating Report...
                </>
              ) : (
                <>
                  <Download className="w-5 h-5 mr-2" />
                  {exportMode === 'single' ? 'Download Job Report' : 'Download All Jobs Report'}
                </>
              )}
            </Button>
          </div>

          <div className="bg-muted/50 rounded-lg p-4 space-y-2">
            <p className="text-sm font-medium">
              {exportMode === 'single' ? 'Single Job Export Includes:' : 'All Jobs Export Includes:'}
            </p>
            <ul className="text-sm text-muted-foreground space-y-1">
              {exportMode === 'single' ? (
                <>
                  <li>• Complete job summary with component breakdown</li>
                  <li>• Daily activity logs with weather and crew notes</li>
                  <li>• Detailed time entries by component and worker</li>
                  <li>• Photo documentation with GPS coordinates</li>
                  <li>• Material requests and issues reported</li>
                </>
              ) : (
                <>
                  <li>• Overall summary across all jobs</li>
                  <li>• Individual job summaries with time breakdown</li>
                  <li>• Complete time entries for all jobs</li>
                  <li>• All daily logs organized by job</li>
                  <li>• Photo documentation summary by job</li>
                </>
              )}
            </ul>
            <p className="text-xs text-muted-foreground pt-2 border-t mt-2">
              Report is generated in Markdown format, optimized for NotebookLM import
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
