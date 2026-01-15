import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  CalendarIcon, 
  ChevronLeft, 
  ChevronRight,
  Plus,
  Edit,
} from 'lucide-react';
import { toast } from 'sonner';
import type { Job } from '@/types';

interface GanttJob {
  id: string;
  name: string;
  client_name: string;
  status: string;
  projected_start_date: string | null;
  projected_end_date: string | null;
  is_internal: boolean;
}

interface JobGanttChartProps {
  onJobSelect?: (jobId: string) => void;
}

interface Week {
  startDate: Date;
  endDate: Date;
}

interface Month {
  name: string;
  startDate: Date;
  endDate: Date;
  weeks: Week[];
}

export function JobGanttChart({ onJobSelect }: JobGanttChartProps) {
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [jobs, setJobs] = useState<GanttJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingJob, setEditingJob] = useState<GanttJob | null>(null);
  
  // Form state for adding/editing job dates
  const [formData, setFormData] = useState({
    jobId: '',
    startDate: '',
    endDate: '',
  });

  useEffect(() => {
    loadJobs();
  }, [currentYear]);

  async function loadJobs() {
    try {
      setLoading(true);
      
      const { data, error } = await supabase
        .from('jobs')
        .select('id, name, client_name, status, projected_start_date, projected_end_date, is_internal')
        .in('status', ['active', 'quoting', 'on_hold'])
        .eq('is_internal', false)
        .order('projected_start_date', { ascending: true, nullsFirst: false });

      if (error) throw error;
      
      setJobs(data || []);
    } catch (error: any) {
      console.error('Error loading jobs:', error);
      toast.error('Failed to load jobs');
    } finally {
      setLoading(false);
    }
  }

  function previousYear() {
    setCurrentYear(currentYear - 1);
  }

  function nextYear() {
    setCurrentYear(currentYear + 1);
  }

  function goToCurrentYear() {
    setCurrentYear(new Date().getFullYear());
  }

  function openAddDialog(job?: GanttJob) {
    if (job) {
      setEditingJob(job);
      setFormData({
        jobId: job.id,
        startDate: job.projected_start_date || '',
        endDate: job.projected_end_date || '',
      });
    } else {
      setEditingJob(null);
      setFormData({
        jobId: '',
        startDate: '',
        endDate: '',
      });
    }
    setShowAddDialog(true);
  }

  async function handleSaveDates() {
    if (!formData.startDate || !formData.endDate) {
      toast.error('Please enter both start and end dates');
      return;
    }

    if (new Date(formData.startDate) > new Date(formData.endDate)) {
      toast.error('End date must be after start date');
      return;
    }

    try {
      const { error } = await supabase
        .from('jobs')
        .update({
          projected_start_date: formData.startDate,
          projected_end_date: formData.endDate,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingJob?.id || formData.jobId);

      if (error) throw error;

      toast.success('Job dates updated');
      setShowAddDialog(false);
      loadJobs();
    } catch (error: any) {
      console.error('Error updating job dates:', error);
      toast.error('Failed to update job dates');
    }
  }

  // Generate hierarchical timeline: months with weeks
  const getTimelineStructure = (): Month[] => {
    const months: Month[] = [];
    
    for (let monthIndex = 0; monthIndex < 12; monthIndex++) {
      const monthStart = new Date(currentYear, monthIndex, 1);
      const monthEnd = new Date(currentYear, monthIndex + 1, 0);
      
      // Generate weeks for this month
      const weeks: Week[] = [];
      let currentDate = new Date(monthStart);
      
      // Start from the first day of the month
      while (currentDate <= monthEnd) {
        const weekEnd = new Date(currentDate);
        weekEnd.setDate(weekEnd.getDate() + 6);
        
        // If week extends beyond month, cap it at month end
        const actualWeekEnd = weekEnd > monthEnd ? monthEnd : weekEnd;
        
        weeks.push({
          startDate: new Date(currentDate),
          endDate: actualWeekEnd,
        });
        
        currentDate.setDate(currentDate.getDate() + 7);
      }
      
      months.push({
        name: monthStart.toLocaleDateString('en-US', { month: 'short' }),
        startDate: monthStart,
        endDate: monthEnd,
        weeks: weeks,
      });
    }
    
    return months;
  };

  const timelineStructure = getTimelineStructure();
  const totalWeeks = timelineStructure.reduce((sum, month) => sum + month.weeks.length, 0);

  // Calculate current date position
  const getCurrentDatePosition = (): number | null => {
    const today = new Date();
    const todayYear = today.getFullYear();
    
    // Only show if viewing current year
    if (todayYear !== currentYear) return null;
    
    let currentWeekIndex = 0;
    let foundWeek: Week | null = null;
    
    for (const month of timelineStructure) {
      for (const week of month.weeks) {
        if (today >= week.startDate && today <= week.endDate) {
          foundWeek = week;
          break;
        }
        currentWeekIndex++;
      }
      if (foundWeek) break;
    }
    
    if (!foundWeek) return null;
    
    const weekWidth = 100 / totalWeeks;
    const weekDuration = foundWeek.endDate.getTime() - foundWeek.startDate.getTime();
    const offset = (today.getTime() - foundWeek.startDate.getTime()) / weekDuration;
    
    return (currentWeekIndex + offset) * weekWidth;
  };

  const currentDatePosition = getCurrentDatePosition();

  // Calculate position and width for a job bar based on week positions
  const getJobBarStyle = (job: GanttJob) => {
    if (!job.projected_start_date || !job.projected_end_date) return null;

    const jobStart = new Date(job.projected_start_date);
    const jobEnd = new Date(job.projected_end_date);
    const yearStart = new Date(currentYear, 0, 1);
    const yearEnd = new Date(currentYear, 11, 31);

    // Skip if job is completely outside the current year
    if (jobEnd < yearStart || jobStart > yearEnd) return null;

    // Find which week the job starts in
    let startWeekIndex = 0;
    let endWeekIndex = 0;
    let currentWeekIndex = 0;
    
    for (const month of timelineStructure) {
      for (const week of month.weeks) {
        if (jobStart >= week.startDate && jobStart <= week.endDate) {
          startWeekIndex = currentWeekIndex;
        }
        if (jobEnd >= week.startDate && jobEnd <= week.endDate) {
          endWeekIndex = currentWeekIndex;
        }
        currentWeekIndex++;
      }
    }

    const weekWidth = 100 / totalWeeks;
    
    // Calculate precise positioning
    let startWeek: Week | null = null;
    let endWeek: Week | null = null;
    currentWeekIndex = 0;
    
    for (const month of timelineStructure) {
      for (const week of month.weeks) {
        if (currentWeekIndex === startWeekIndex) startWeek = week;
        if (currentWeekIndex === endWeekIndex) endWeek = week;
        currentWeekIndex++;
      }
    }
    
    if (!startWeek || !endWeek) return null;
    
    const startDuration = startWeek.endDate.getTime() - startWeek.startDate.getTime();
    const startOffset = (Math.max(jobStart.getTime(), startWeek.startDate.getTime()) - startWeek.startDate.getTime()) / startDuration;
    
    const endDuration = endWeek.endDate.getTime() - endWeek.startDate.getTime();
    const endOffset = (Math.min(jobEnd.getTime(), endWeek.endDate.getTime()) - endWeek.startDate.getTime()) / endDuration;

    const left = (startWeekIndex + startOffset) * weekWidth;
    const width = ((endWeekIndex - startWeekIndex) + (endOffset - startOffset)) * weekWidth;

    return {
      left: `${left}%`,
      width: `${Math.max(width, 0.5)}%`,
    };
  };

  // Get status color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-500 hover:bg-green-600';
      case 'quoting':
        return 'bg-blue-500 hover:bg-blue-600';
      case 'on_hold':
        return 'bg-yellow-500 hover:bg-yellow-600';
      case 'completed':
        return 'bg-slate-500 hover:bg-slate-600';
      default:
        return 'bg-gray-500 hover:bg-gray-600';
    }
  };

  const jobsWithDates = jobs.filter(job => job.projected_start_date && job.projected_end_date);
  const jobsWithoutDates = jobs.filter(job => !job.projected_start_date || !job.projected_end_date);

  // Group unscheduled jobs by status
  const unscheduledActive = jobsWithoutDates.filter(job => job.status === 'active');
  const unscheduledQuoting = jobsWithoutDates.filter(job => job.status === 'quoting');
  const unscheduledOnHold = jobsWithoutDates.filter(job => job.status === 'on_hold');

  const renderJobRows = () => {
    if (jobsWithDates.length === 0) {
      return (
        <div className="py-12 text-center text-muted-foreground">
          <CalendarIcon className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>No jobs scheduled yet</p>
          <p className="text-sm mt-2">Jobs with dates will appear here</p>
        </div>
      );
    }

    return jobsWithDates.map((job) => {
      const barStyle = getJobBarStyle(job);
      if (!barStyle) return null;

      return (
        <div
          key={job.id}
          className="flex border-b hover:bg-muted/30 transition-colors group"
        >
          <div className="w-32 sm:w-48 md:w-64 border-r p-1.5 sm:p-2 flex items-center justify-between gap-1">
            <div className="flex-1 min-w-0 flex items-center gap-1">
              <div className={`w-2 h-2 sm:w-2.5 sm:h-2.5 rounded flex-shrink-0 ${getStatusColor(job.status).replace('hover:', '')}`} />
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate text-[11px] sm:text-xs md:text-sm">{job.name}</p>
                <p className="text-[9px] sm:text-[10px] text-muted-foreground truncate">
                  {job.client_name}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => openAddDialog(job)}
              className="opacity-0 group-hover:opacity-100 transition-opacity h-5 w-5 sm:h-6 sm:w-6 p-0"
            >
              <Edit className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
            </Button>
          </div>
          <div className="flex-1 relative py-2 px-1">
            <div className="relative h-7">
              {/* Grid lines for weeks */}
              <div className="absolute inset-0 flex">
                {timelineStructure.map((month, monthIndex) => (
                  month.weeks.map((week, weekIndex) => (
                    <div
                      key={`${monthIndex}-${weekIndex}`}
                      className="border-r border-dashed border-muted/40"
                      style={{ width: `${(1 / totalWeeks) * 100}%` }}
                    />
                  ))
                ))}
              </div>
              
              {/* Current date indicator line */}
              {currentDatePosition !== null && (
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-orange-500 z-10 pointer-events-none"
                  style={{ left: `${currentDatePosition}%` }}
                />
              )}
              
              {/* Job bar */}
              <div
                className={`absolute top-0 h-6 sm:h-7 rounded-none cursor-pointer transition-all ${getStatusColor(job.status)} text-white text-[9px] sm:text-[10px] flex items-center justify-center px-1 sm:px-1.5 shadow-md border border-slate-300`}
                style={barStyle}
                onClick={() => onJobSelect?.(job.id)}
                title={`${job.name}\n${job.client_name}\nStatus: ${job.status === 'on_hold' ? 'On Hold' : job.status.charAt(0).toUpperCase() + job.status.slice(1)}\n${new Date(job.projected_start_date!).toLocaleDateString()} - ${new Date(job.projected_end_date!).toLocaleDateString()}`}
              >
                <span className="truncate font-bold">
                  {job.name}
                </span>
              </div>
            </div>
          </div>
        </div>
      );
    });
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="text-center text-muted-foreground">
            <CalendarIcon className="w-12 h-12 mx-auto mb-4 opacity-50 animate-pulse" />
            <p>Loading Gantt chart...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header Controls */}
      <Card className="rounded-none border-slate-300">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <CardTitle className="text-base sm:text-lg flex items-center gap-2">
              <CalendarIcon className="w-4 h-4 sm:w-5 sm:h-5" />
              Job Schedule - {currentYear}
            </CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              {/* Year Navigation */}
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" onClick={previousYear} className="h-8 w-8 p-0 rounded-none border-slate-300">
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={goToCurrentYear} className="h-8 text-xs rounded-none border-slate-300">
                  Today
                </Button>
                <Button variant="outline" size="sm" onClick={nextYear} className="h-8 w-8 p-0 rounded-none border-slate-300">
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Unified Gantt Chart */}
      <Card className="rounded-none border-slate-300">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <CardTitle className="text-base sm:text-lg flex items-center gap-2">
              All Jobs Schedule
              <Badge variant="secondary" className="rounded-none">{jobsWithDates.length}</Badge>
            </CardTitle>
            {currentDatePosition !== null && (
              <div className="flex items-center gap-2 text-xs text-orange-500">
                <div className="w-3 h-3 bg-orange-500 rounded-full" />
                <span className="font-medium">Today</span>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {/* Mobile: Horizontal scrollable container */}
          <div className="w-full overflow-x-auto">
            <div className="min-w-[800px]">
              {/* Timeline Header - Two Rows */}
              <div className="border-b bg-muted/30 sticky top-0 z-10">
                {/* Month Headers */}
                <div className="flex border-b">
                  <div className="w-32 sm:w-48 md:w-64 border-r bg-background" />
                  <div className="flex-1 flex bg-background relative">
                    {timelineStructure.map((month, monthIndex) => (
                      <div
                        key={monthIndex}
                        className="border-r text-center py-1.5 text-xs font-bold bg-muted/50"
                        style={{ width: `${(month.weeks.length / totalWeeks) * 100}%` }}
                      >
                        {month.name}
                      </div>
                    ))}
                    {/* Today marker in header */}
                    {currentDatePosition !== null && (
                      <div
                        className="absolute top-0 bottom-0 w-0.5 bg-orange-500 z-20"
                        style={{ left: `${currentDatePosition}%` }}
                      >
                        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-orange-500" />
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Week Headers */}
                <div className="flex">
                  <div className="w-32 sm:w-48 md:w-64 border-r p-2 font-semibold bg-background text-[10px] sm:text-xs">
                    <div className="flex items-center justify-between">
                      <span>Job Name</span>
                      <span className="hidden sm:inline text-[10px] text-muted-foreground font-normal">Status</span>
                    </div>
                  </div>
                  <div className="flex-1 flex bg-background relative">
                    {timelineStructure.map((month, monthIndex) => (
                      month.weeks.map((week, weekIndex) => (
                        <div
                          key={`${monthIndex}-${weekIndex}`}
                          className="border-r text-center py-1 text-[9px] sm:text-[10px] font-medium text-muted-foreground"
                          style={{ width: `${(1 / totalWeeks) * 100}%` }}
                        >
                          W{weekIndex + 1}
                        </div>
                      ))
                    ))}
                    {/* Today marker line */}
                    {currentDatePosition !== null && (
                      <div
                        className="absolute top-0 bottom-0 w-0.5 bg-orange-500 z-20"
                        style={{ left: `${currentDatePosition}%` }}
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* Job Rows */}
              <div className="max-h-[400px] sm:max-h-[500px] md:max-h-[600px] overflow-y-auto">
                {renderJobRows()}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Unscheduled Jobs by Category */}
      {jobsWithoutDates.length > 0 && (
        <div className="space-y-4">
          {/* Unscheduled Active */}
          {unscheduledActive.length > 0 && (
            <Card className="rounded-none border-slate-300">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm sm:text-base flex items-center gap-2">
                  <div className="w-3 h-3 rounded-none bg-green-500 border border-slate-300" />
                  <span className="hidden sm:inline">Unscheduled Active Jobs ({unscheduledActive.length})</span>
                  <span className="sm:hidden">Active ({unscheduledActive.length})</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {unscheduledActive.map((job) => (
                  <div
                    key={job.id}
                    className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:justify-between p-3 border rounded-none border-slate-300 hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{job.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{job.client_name}</p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openAddDialog(job)}
                      className="w-full sm:w-auto rounded-none border-slate-300 shrink-0"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      <span className="hidden sm:inline">Add to Schedule</span>
                      <span className="sm:hidden">Add</span>
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Unscheduled Quoting */}
          {unscheduledQuoting.length > 0 && (
            <Card className="rounded-none border-slate-300">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm sm:text-base flex items-center gap-2">
                  <div className="w-3 h-3 rounded-none bg-blue-500 border border-slate-300" />
                  <span className="hidden sm:inline">Unscheduled Quoting Jobs ({unscheduledQuoting.length})</span>
                  <span className="sm:hidden">Quoting ({unscheduledQuoting.length})</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {unscheduledQuoting.map((job) => (
                  <div
                    key={job.id}
                    className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:justify-between p-3 border rounded-none border-slate-300 hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{job.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{job.client_name}</p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openAddDialog(job)}
                      className="w-full sm:w-auto rounded-none border-slate-300 shrink-0"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      <span className="hidden sm:inline">Add to Schedule</span>
                      <span className="sm:hidden">Add</span>
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Unscheduled On Hold */}
          {unscheduledOnHold.length > 0 && (
            <Card className="rounded-none border-slate-300">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm sm:text-base flex items-center gap-2">
                  <div className="w-3 h-3 rounded-none bg-yellow-500 border border-slate-300" />
                  <span className="hidden sm:inline">Unscheduled On Hold Jobs ({unscheduledOnHold.length})</span>
                  <span className="sm:hidden">On Hold ({unscheduledOnHold.length})</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {unscheduledOnHold.map((job) => (
                  <div
                    key={job.id}
                    className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:justify-between p-3 border rounded-none border-slate-300 hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{job.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{job.client_name}</p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openAddDialog(job)}
                      className="w-full sm:w-auto rounded-none border-slate-300 shrink-0"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      <span className="hidden sm:inline">Add to Schedule</span>
                      <span className="sm:hidden">Add</span>
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Legend */}
      <Card className="rounded-none border-slate-300">
        <CardContent className="py-3">
          <div className="flex flex-wrap gap-3 sm:gap-4">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <div className="w-6 h-3 sm:w-8 sm:h-4 rounded-none bg-green-500 border border-slate-300" />
              <span className="text-xs sm:text-sm">Active</span>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2">
              <div className="w-6 h-3 sm:w-8 sm:h-4 rounded-none bg-blue-500 border border-slate-300" />
              <span className="text-xs sm:text-sm">Quoting</span>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2">
              <div className="w-6 h-3 sm:w-8 sm:h-4 rounded-none bg-yellow-500 border border-slate-300" />
              <span className="text-xs sm:text-sm">On Hold</span>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2">
              <div className="w-6 h-3 sm:w-8 sm:h-4 rounded-none bg-slate-500 border border-slate-300" />
              <span className="text-xs sm:text-sm">Completed</span>
            </div>
            {currentDatePosition !== null && (
              <div className="flex items-center gap-1.5 sm:gap-2">
                <div className="w-0.5 h-4 bg-orange-500" />
                <span className="text-xs sm:text-sm text-orange-500 font-medium">Today</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Edit Dates Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingJob ? `Edit Schedule: ${editingJob.name}` : 'Add to Schedule'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {editingJob && (
              <div className="bg-muted p-3 rounded-lg">
                <p className="font-medium">{editingJob.name}</p>
                <p className="text-sm text-muted-foreground">{editingJob.client_name}</p>
              </div>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="start-date">Start Date *</Label>
              <Input
                id="start-date"
                type="date"
                value={formData.startDate}
                onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="end-date">End Date *</Label>
              <Input
                id="end-date"
                type="date"
                value={formData.endDate}
                onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                min={formData.startDate || undefined}
              />
            </div>

            {formData.startDate && formData.endDate && (
              <div className="bg-primary/5 p-3 rounded-lg text-sm">
                <p className="font-medium mb-1">Duration:</p>
                <p className="text-muted-foreground">
                  {Math.ceil((new Date(formData.endDate).getTime() - new Date(formData.startDate).getTime()) / (1000 * 60 * 60 * 24))} days
                </p>
              </div>
            )}

            <div className="flex gap-2 pt-4">
              <Button
                onClick={handleSaveDates}
                className="flex-1 gradient-primary"
              >
                Save Schedule
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowAddDialog(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
