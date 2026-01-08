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
  Maximize2,
  ZoomIn,
  ZoomOut,
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

export function JobGanttChart({ onJobSelect }: JobGanttChartProps) {
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [jobs, setJobs] = useState<GanttJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingJob, setEditingJob] = useState<GanttJob | null>(null);
  const [zoomLevel, setZoomLevel] = useState<'week' | 'month'>('week');
  
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

  // Generate weeks/months for the year
  const getTimelineUnits = () => {
    if (zoomLevel === 'month') {
      return Array.from({ length: 12 }, (_, i) => {
        const date = new Date(currentYear, i, 1);
        return {
          label: date.toLocaleDateString('en-US', { month: 'short' }),
          startDate: new Date(currentYear, i, 1),
          endDate: new Date(currentYear, i + 1, 0),
        };
      });
    } else {
      const units = [];
      const startOfYear = new Date(currentYear, 0, 1);
      const endOfYear = new Date(currentYear, 11, 31);
      
      let currentDate = new Date(startOfYear);
      // Move to the first Sunday of the year
      currentDate.setDate(currentDate.getDate() - currentDate.getDay());
      
      let weekNum = 1;
      while (currentDate <= endOfYear) {
        const weekEnd = new Date(currentDate);
        weekEnd.setDate(weekEnd.getDate() + 6);
        
        units.push({
          label: `W${weekNum}`,
          startDate: new Date(currentDate),
          endDate: weekEnd,
        });
        
        currentDate.setDate(currentDate.getDate() + 7);
        weekNum++;
      }
      
      return units;
    }
  };

  const timelineUnits = getTimelineUnits();

  // Calculate position and width for a job bar
  const getJobBarStyle = (job: GanttJob) => {
    if (!job.projected_start_date || !job.projected_end_date) return null;

    const jobStart = new Date(job.projected_start_date);
    const jobEnd = new Date(job.projected_end_date);
    const yearStart = timelineUnits[0].startDate;
    const yearEnd = timelineUnits[timelineUnits.length - 1].endDate;

    // Skip if job is completely outside the current year
    if (jobEnd < yearStart || jobStart > yearEnd) return null;

    // Find which unit the job starts in
    let startUnitIndex = timelineUnits.findIndex(unit => 
      jobStart >= unit.startDate && jobStart <= unit.endDate
    );
    if (startUnitIndex === -1) {
      // Job starts before the year
      startUnitIndex = 0;
    }

    // Find which unit the job ends in
    let endUnitIndex = timelineUnits.findIndex(unit => 
      jobEnd >= unit.startDate && jobEnd <= unit.endDate
    );
    if (endUnitIndex === -1) {
      // Job ends after the year
      endUnitIndex = timelineUnits.length - 1;
    }

    const totalUnits = timelineUnits.length;
    const unitWidth = 100 / totalUnits;
    
    // Calculate more precise positioning within the units
    const startUnit = timelineUnits[startUnitIndex];
    const endUnit = timelineUnits[endUnitIndex];
    
    const startUnitDuration = endUnit.endDate.getTime() - startUnit.startDate.getTime();
    const startOffset = (Math.max(jobStart.getTime(), startUnit.startDate.getTime()) - startUnit.startDate.getTime()) / startUnitDuration;
    
    const endUnitDuration = endUnit.endDate.getTime() - endUnit.startDate.getTime();
    const endOffset = (Math.min(jobEnd.getTime(), endUnit.endDate.getTime()) - endUnit.startDate.getTime()) / endUnitDuration;

    const left = (startUnitIndex + startOffset) * unitWidth;
    const width = ((endUnitIndex - startUnitIndex) + (endOffset - startOffset)) * unitWidth;

    return {
      left: `${left}%`,
      width: `${Math.max(width, 0.5)}%`, // Minimum width for visibility
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
          <div className="w-80 border-r p-3 flex items-center justify-between gap-2">
            <div className="flex-1 min-w-0 flex items-center gap-2">
              <div className={`w-3 h-3 rounded flex-shrink-0 ${getStatusColor(job.status).replace('hover:', '')}`} />
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{job.name}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {job.client_name}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => openAddDialog(job)}
              className="opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Edit className="w-3 h-3" />
            </Button>
          </div>
          <div className="flex-1 relative py-3 px-1">
            <div className="relative h-8">
              {/* Grid lines */}
              <div className="absolute inset-0 flex">
                {timelineUnits.map((_, index) => (
                  <div
                    key={index}
                    className="flex-1 border-r border-dashed border-muted"
                    style={{ minWidth: `${100 / timelineUnits.length}%` }}
                  />
                ))}
              </div>
              
              {/* Job bar */}
              <div
                className={`absolute top-0 h-8 rounded cursor-pointer transition-all ${getStatusColor(job.status)} text-white text-xs flex items-center justify-center px-2 shadow-md`}
                style={barStyle}
                onClick={() => onJobSelect?.(job.id)}
                title={`${job.name}\n${job.client_name}\nStatus: ${job.status === 'on_hold' ? 'On Hold' : job.status.charAt(0).toUpperCase() + job.status.slice(1)}\n${new Date(job.projected_start_date!).toLocaleDateString()} - ${new Date(job.projected_end_date!).toLocaleDateString()}`}
              >
                <span className="truncate font-medium">
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
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <CalendarIcon className="w-5 h-5" />
              Job Schedule - {currentYear}
            </CardTitle>
            <div className="flex items-center gap-2">
              {/* Zoom Controls */}
              <div className="flex gap-1 border rounded-lg p-1">
                <Button
                  variant={zoomLevel === 'month' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setZoomLevel('month')}
                >
                  Month
                </Button>
                <Button
                  variant={zoomLevel === 'week' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setZoomLevel('week')}
                >
                  Week
                </Button>
              </div>
              
              {/* Year Navigation */}
              <Button variant="outline" size="icon" onClick={previousYear}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={goToCurrentYear}>
                Current Year
              </Button>
              <Button variant="outline" size="icon" onClick={nextYear}>
                <ChevronRight className="w-4 h-4" />
              </Button>
              
              <Button onClick={loadJobs} variant="outline" size="sm">
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Unified Gantt Chart */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              All Jobs Schedule
              <Badge variant="secondary">{jobsWithDates.length}</Badge>
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <div className="min-w-[1400px]">
              {/* Timeline Header */}
              <div className="border-b bg-muted/30 sticky top-0 z-10">
                <div className="flex">
                  <div className="w-80 border-r p-3 font-semibold bg-background text-sm">
                    <div className="flex items-center justify-between">
                      <span>Job Name</span>
                      <span className="text-xs text-muted-foreground font-normal">Status</span>
                    </div>
                  </div>
                  <div className="flex-1 flex bg-background">
                    {timelineUnits.map((unit, index) => (
                      <div
                        key={index}
                        className="flex-1 border-r text-center p-2 text-xs font-medium"
                        style={{ minWidth: `${100 / timelineUnits.length}%` }}
                      >
                        {unit.label}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Job Rows */}
              <div className="max-h-[600px] overflow-y-auto">
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
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <div className="w-3 h-3 rounded bg-green-500" />
                  Unscheduled Active Jobs ({unscheduledActive.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {unscheduledActive.map((job) => (
                  <div
                    key={job.id}
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/30 transition-colors"
                  >
                    <div>
                      <p className="font-medium">{job.name}</p>
                      <p className="text-sm text-muted-foreground">{job.client_name}</p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openAddDialog(job)}
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Add to Schedule
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Unscheduled Quoting */}
          {unscheduledQuoting.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <div className="w-3 h-3 rounded bg-blue-500" />
                  Unscheduled Quoting Jobs ({unscheduledQuoting.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {unscheduledQuoting.map((job) => (
                  <div
                    key={job.id}
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/30 transition-colors"
                  >
                    <div>
                      <p className="font-medium">{job.name}</p>
                      <p className="text-sm text-muted-foreground">{job.client_name}</p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openAddDialog(job)}
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Add to Schedule
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Unscheduled On Hold */}
          {unscheduledOnHold.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <div className="w-3 h-3 rounded bg-yellow-500" />
                  Unscheduled On Hold Jobs ({unscheduledOnHold.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {unscheduledOnHold.map((job) => (
                  <div
                    key={job.id}
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/30 transition-colors"
                  >
                    <div>
                      <p className="font-medium">{job.name}</p>
                      <p className="text-sm text-muted-foreground">{job.client_name}</p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openAddDialog(job)}
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Add to Schedule
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Legend */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-4 rounded bg-green-500" />
              <span className="text-sm">Active</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-4 rounded bg-blue-500" />
              <span className="text-sm">Quoting</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-4 rounded bg-yellow-500" />
              <span className="text-sm">On Hold</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-4 rounded bg-slate-500" />
              <span className="text-sm">Completed</span>
            </div>
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
