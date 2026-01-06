import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Calendar, Plus, Edit, Trash2, CheckCircle2, XCircle } from 'lucide-react';
import { toast } from 'sonner';

interface Subcontractor {
  id: string;
  name: string;
  company_name: string | null;
  trade: string | null;
  phone: string | null;
}

interface Job {
  id: string;
  name: string;
  client_name: string;
}

interface Schedule {
  id: string;
  subcontractor_id: string;
  job_id: string;
  scheduled_date: string;
  start_time: string | null;
  end_time: string | null;
  work_description: string | null;
  notes: string | null;
  status: string;
  subcontractors: Subcontractor;
  jobs: Job;
}

interface ScheduleFormData {
  subcontractor_id: string;
  job_id: string;
  scheduled_date: string;
  start_time: string;
  end_time: string;
  work_description: string;
  notes: string;
  status: string;
}

export function SubcontractorScheduling() {
  const { profile } = useAuth();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [subcontractors, setSubcontractors] = useState<Subcontractor[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filterJob, setFilterJob] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('scheduled');
  const [formData, setFormData] = useState<ScheduleFormData>({
    subcontractor_id: '',
    job_id: '',
    scheduled_date: '',
    start_time: '',
    end_time: '',
    work_description: '',
    notes: '',
    status: 'scheduled',
  });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      await Promise.all([
        loadSchedules(),
        loadSubcontractors(),
        loadJobs(),
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function loadSchedules() {
    const { data, error } = await supabase
      .from('subcontractor_schedules')
      .select(`
        *,
        subcontractors(id, name, company_name, trade, phone),
        jobs(id, name, client_name)
      `)
      .order('scheduled_date', { ascending: true });

    if (error) {
      console.error('Error loading schedules:', error);
      toast.error('Failed to load schedules');
      return;
    }

    setSchedules(data || []);
  }

  async function loadSubcontractors() {
    const { data, error } = await supabase
      .from('subcontractors')
      .select('id, name, company_name, trade, phone')
      .eq('active', true)
      .order('name');

    if (error) {
      console.error('Error loading subcontractors:', error);
      return;
    }

    setSubcontractors(data || []);
  }

  async function loadJobs() {
    const { data, error } = await supabase
      .from('jobs')
      .select('id, name, client_name')
      .eq('status', 'active')
      .order('name');

    if (error) {
      console.error('Error loading jobs:', error);
      return;
    }

    setJobs(data || []);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!formData.subcontractor_id || !formData.job_id || !formData.scheduled_date) {
      toast.error('Please fill in all required fields');
      return;
    }

    try {
      const scheduleData = {
        subcontractor_id: formData.subcontractor_id,
        job_id: formData.job_id,
        scheduled_date: formData.scheduled_date,
        start_time: formData.start_time || null,
        end_time: formData.end_time || null,
        work_description: formData.work_description || null,
        notes: formData.notes || null,
        status: formData.status,
        created_by: profile?.id,
      };

      if (editingId) {
        const { error } = await supabase
          .from('subcontractor_schedules')
          .update(scheduleData)
          .eq('id', editingId);

        if (error) throw error;
        toast.success('Schedule updated successfully');
      } else {
        const { error } = await supabase
          .from('subcontractor_schedules')
          .insert(scheduleData);

        if (error) throw error;
        toast.success('Schedule created successfully');
      }

      setShowDialog(false);
      resetForm();
      loadSchedules();
    } catch (error: any) {
      console.error('Error saving schedule:', error);
      toast.error('Failed to save schedule');
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Are you sure you want to delete this schedule?')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('subcontractor_schedules')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('Schedule deleted successfully');
      loadSchedules();
    } catch (error: any) {
      console.error('Error deleting schedule:', error);
      toast.error('Failed to delete schedule');
    }
  }

  async function updateStatus(id: string, newStatus: string) {
    try {
      const { error } = await supabase
        .from('subcontractor_schedules')
        .update({ status: newStatus })
        .eq('id', id);

      if (error) throw error;
      toast.success(`Schedule marked as ${newStatus}`);
      loadSchedules();
    } catch (error: any) {
      console.error('Error updating status:', error);
      toast.error('Failed to update status');
    }
  }

  function openEditDialog(schedule: Schedule) {
    setEditingId(schedule.id);
    setFormData({
      subcontractor_id: schedule.subcontractor_id,
      job_id: schedule.job_id,
      scheduled_date: schedule.scheduled_date,
      start_time: schedule.start_time || '',
      end_time: schedule.end_time || '',
      work_description: schedule.work_description || '',
      notes: schedule.notes || '',
      status: schedule.status,
    });
    setShowDialog(true);
  }

  function resetForm() {
    setEditingId(null);
    setFormData({
      subcontractor_id: '',
      job_id: '',
      scheduled_date: '',
      start_time: '',
      end_time: '',
      work_description: '',
      notes: '',
      status: 'scheduled',
    });
  }

  const filteredSchedules = schedules.filter(schedule => {
    if (filterJob !== 'all' && schedule.job_id !== filterJob) return false;
    if (filterStatus !== 'all' && schedule.status !== filterStatus) return false;
    return true;
  });

  const upcomingSchedules = filteredSchedules.filter(s => {
    const scheduleDate = new Date(s.scheduled_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return scheduleDate >= today && s.status === 'scheduled';
  });

  const pastSchedules = filteredSchedules.filter(s => {
    const scheduleDate = new Date(s.scheduled_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return scheduleDate < today || s.status !== 'scheduled';
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold">Subcontractor Schedule</h2>
          <p className="text-muted-foreground">Schedule and manage subcontractor work</p>
        </div>
        <Button onClick={() => setShowDialog(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Schedule Work
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <Select value={filterJob} onValueChange={setFilterJob}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Filter by Job" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Jobs</SelectItem>
            {jobs.map(job => (
              <SelectItem key={job.id} value={job.id}>
                {job.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Filter by Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="scheduled">Scheduled</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Upcoming Schedules */}
      {upcomingSchedules.length > 0 && (
        <div>
          <h3 className="text-xl font-bold mb-4">Upcoming Work</h3>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {upcomingSchedules.map(schedule => (
              <ScheduleCard
                key={schedule.id}
                schedule={schedule}
                onEdit={openEditDialog}
                onDelete={handleDelete}
                onUpdateStatus={updateStatus}
              />
            ))}
          </div>
        </div>
      )}

      {/* Past Schedules */}
      {pastSchedules.length > 0 && (
        <div>
          <h3 className="text-xl font-bold mb-4">Past & Completed</h3>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {pastSchedules.map(schedule => (
              <ScheduleCard
                key={schedule.id}
                schedule={schedule}
                onEdit={openEditDialog}
                onDelete={handleDelete}
                onUpdateStatus={updateStatus}
              />
            ))}
          </div>
        </div>
      )}

      {filteredSchedules.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Calendar className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No schedules found</p>
            <Button onClick={() => setShowDialog(true)} variant="outline" className="mt-4">
              <Plus className="w-4 h-4 mr-2" />
              Schedule First Work
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={(open) => {
        setShowDialog(open);
        if (!open) resetForm();
      }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingId ? 'Edit Schedule' : 'Schedule Subcontractor Work'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="subcontractor">Subcontractor *</Label>
                <Select
                  value={formData.subcontractor_id}
                  onValueChange={(value) => setFormData({ ...formData, subcontractor_id: value })}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select subcontractor" />
                  </SelectTrigger>
                  <SelectContent>
                    {subcontractors.map(sub => (
                      <SelectItem key={sub.id} value={sub.id}>
                        {sub.name} {sub.trade && `- ${sub.trade}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="job">Job *</Label>
                <Select
                  value={formData.job_id}
                  onValueChange={(value) => setFormData({ ...formData, job_id: value })}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select job" />
                  </SelectTrigger>
                  <SelectContent>
                    {jobs.map(job => (
                      <SelectItem key={job.id} value={job.id}>
                        {job.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="scheduled_date">Date *</Label>
                <Input
                  id="scheduled_date"
                  type="date"
                  value={formData.scheduled_date}
                  onChange={(e) => setFormData({ ...formData, scheduled_date: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value) => setFormData({ ...formData, status: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="scheduled">Scheduled</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="start_time">Start Time</Label>
                <Input
                  id="start_time"
                  type="time"
                  value={formData.start_time}
                  onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="end_time">End Time</Label>
                <Input
                  id="end_time"
                  type="time"
                  value={formData.end_time}
                  onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="work_description">Work Description</Label>
              <Input
                id="work_description"
                value={formData.work_description}
                onChange={(e) => setFormData({ ...formData, work_description: e.target.value })}
                placeholder="What work will be performed?"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Additional notes or instructions..."
                rows={3}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowDialog(false)}>
                Cancel
              </Button>
              <Button type="submit">
                {editingId ? 'Update' : 'Schedule'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ScheduleCard({ 
  schedule, 
  onEdit, 
  onDelete, 
  onUpdateStatus 
}: { 
  schedule: Schedule;
  onEdit: (schedule: Schedule) => void;
  onDelete: (id: string) => void;
  onUpdateStatus: (id: string, status: string) => void;
}) {
  const scheduleDate = new Date(schedule.scheduled_date);
  const isPast = scheduleDate < new Date();
  const timeStr = schedule.start_time
    ? ` at ${schedule.start_time.substring(0, 5)}${schedule.end_time ? ` - ${schedule.end_time.substring(0, 5)}` : ''}`
    : '';

  return (
    <Card className={schedule.status === 'cancelled' ? 'opacity-60' : ''}>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-lg">{schedule.subcontractors.name}</CardTitle>
            {schedule.subcontractors.trade && (
              <p className="text-sm text-muted-foreground">{schedule.subcontractors.trade}</p>
            )}
          </div>
          <Badge variant={
            schedule.status === 'completed' ? 'default' :
            schedule.status === 'cancelled' ? 'secondary' :
            isPast ? 'destructive' : 'outline'
          }>
            {schedule.status === 'completed' ? 'Completed' :
             schedule.status === 'cancelled' ? 'Cancelled' :
             isPast ? 'Overdue' : 'Scheduled'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div>
            <p className="text-xs text-muted-foreground">Job</p>
            <p className="font-medium">{schedule.jobs.name}</p>
          </div>

          <div>
            <p className="text-xs text-muted-foreground">Date & Time</p>
            <p className="font-medium">
              {scheduleDate.toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
              {timeStr}
            </p>
          </div>

          {schedule.work_description && (
            <div>
              <p className="text-xs text-muted-foreground">Work</p>
              <p className="text-sm">{schedule.work_description}</p>
            </div>
          )}

          {schedule.notes && (
            <div>
              <p className="text-xs text-muted-foreground">Notes</p>
              <p className="text-sm">{schedule.notes}</p>
            </div>
          )}

          {schedule.subcontractors.phone && (
            <div>
              <p className="text-xs text-muted-foreground">Contact</p>
              <a href={`tel:${schedule.subcontractors.phone}`} className="text-sm hover:underline">
                {schedule.subcontractors.phone}
              </a>
            </div>
          )}

          <div className="flex gap-2 pt-3 border-t">
            {schedule.status === 'scheduled' && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => onUpdateStatus(schedule.id, 'completed')}
                >
                  <CheckCircle2 className="w-4 h-4 mr-1" />
                  Complete
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onUpdateStatus(schedule.id, 'cancelled')}
                >
                  <XCircle className="w-4 h-4" />
                </Button>
              </>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onEdit(schedule)}
            >
              <Edit className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDelete(schedule.id)}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
