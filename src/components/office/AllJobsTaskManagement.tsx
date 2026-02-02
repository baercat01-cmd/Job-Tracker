import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Plus, 
  Edit, 
  Trash2, 
  CheckCircle2, 
  Circle,
  PlayCircle,
  XCircle,
  AlertCircle,
  Calendar as CalendarIcon,
  User,
  ListTodo,
  Briefcase
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { formatDateLocal, parseDateLocal } from '@/lib/date-utils';

interface Job {
  id: string;
  name: string;
  client_name: string;
}

interface JobTask {
  id: string;
  job_id: string;
  title: string;
  description: string | null;
  task_type: 'field' | 'office' | 'shop' | 'general';
  assigned_to: string | null;
  due_date: string | null;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'pending' | 'in_progress' | 'completed' | 'blocked';
  completed_at: string | null;
  created_at: string;
  job?: Job;
  assigned_user?: {
    id: string;
    username: string;
    email: string;
  };
}

interface UserProfile {
  id: string;
  username: string | null;
  email: string | null;
  role: string;
}

interface TaskFormData {
  job_id: string;
  title: string;
  description: string;
  task_type: 'field' | 'office' | 'shop' | 'general';
  assigned_to: string;
  due_date: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
}

interface AllJobsTaskManagementProps {
  showCreateDialog?: boolean;
  onCloseCreateDialog?: () => void;
}

export function AllJobsTaskManagement({ showCreateDialog: externalShowDialog, onCloseCreateDialog }: AllJobsTaskManagementProps = {}) {
  const { profile } = useAuth();
  const [tasks, setTasks] = useState<JobTask[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [internalShowDialog, setInternalShowDialog] = useState(false);
  const showDialog = externalShowDialog !== undefined ? externalShowDialog : internalShowDialog;
  const setShowDialog = onCloseCreateDialog || setInternalShowDialog;
  const [editingTask, setEditingTask] = useState<JobTask | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('pending');
  const [filterJob, setFilterJob] = useState<string>('all');
  const [formData, setFormData] = useState<TaskFormData>({
    job_id: '',
    title: '',
    description: '',
    task_type: 'field',
    assigned_to: '',
    due_date: '',
    priority: 'medium',
  });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      await Promise.all([
        loadTasks(),
        loadJobs(),
        loadUsers(),
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function loadTasks() {
    try {
      const { data, error } = await supabase
        .from('job_tasks')
        .select(`
          *,
          job:jobs(id, name, client_name),
          assigned_user:assigned_to(id, username, email)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Sort tasks by priority (high → medium → low)
      const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
      const sortedTasks = (data || []).sort((a, b) => {
        // First, sort by priority
        const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
        if (priorityDiff !== 0) return priorityDiff;
        
        // Then by due date (overdue first, then by date)
        if (a.due_date && b.due_date) {
          return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
        }
        if (a.due_date) return -1;
        if (b.due_date) return 1;
        
        // Finally by creation date (newest first)
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
      
      setTasks(sortedTasks);
    } catch (error: any) {
      console.error('Error loading tasks:', error);
      toast.error('Failed to load tasks');
    }
  }

  async function loadJobs() {
    try {
      const { data, error } = await supabase
        .from('jobs')
        .select('id, name, client_name')
        .in('status', ['active', 'quoting'])
        .order('name');

      if (error) throw error;
      setJobs(data || []);
    } catch (error: any) {
      console.error('Error loading jobs:', error);
    }
  }

  async function loadUsers() {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .order('username', { ascending: true });

      if (error) throw error;
      setUsers(data || []);
    } catch (error: any) {
      console.error('Error loading users:', error);
    }
  }

  function openCreateDialog() {
    setEditingTask(null);
    setFormData({
      job_id: '',
      title: '',
      description: '',
      task_type: 'field',
      assigned_to: '',
      due_date: '',
      priority: 'medium',
    });
    setShowDialog(true);
  }

  function openEditDialog(task: JobTask) {
    setEditingTask(task);
    setFormData({
      job_id: task.job_id,
      title: task.title,
      description: task.description || '',
      task_type: task.task_type,
      assigned_to: task.assigned_to || '',
      due_date: task.due_date || '',
      priority: task.priority,
    });
    setShowDialog(true);
  }

  async function handleSave() {
    if (!formData.job_id) {
      toast.error('Please select a job');
      return;
    }

    if (!formData.title.trim()) {
      toast.error('Please enter a task title');
      return;
    }

    if (!formData.due_date) {
      toast.error('Please select a due date');
      return;
    }

    try {
      const taskData = {
        job_id: formData.job_id,
        title: formData.title.trim(),
        description: formData.description.trim() || null,
        task_type: formData.task_type,
        assigned_to: formData.assigned_to || null,
        due_date: formData.due_date,
        priority: formData.priority,
        created_by: profile?.id,
        updated_at: new Date().toISOString(),
      };

      if (editingTask) {
        const { error } = await supabase
          .from('job_tasks')
          .update(taskData)
          .eq('id', editingTask.id);

        if (error) throw error;

        // Update calendar event
        await syncTaskToCalendar(editingTask.id, taskData);
        
        toast.success('Task updated');
      } else {
        const { data: newTask, error } = await supabase
          .from('job_tasks')
          .insert(taskData)
          .select()
          .single();

        if (error) throw error;

        // Create calendar event
        if (newTask) {
          await syncTaskToCalendar(newTask.id, taskData);
        }
        
        toast.success('Task created');
      }

      setShowDialog(false);
      loadTasks();
    } catch (error: any) {
      console.error('Error saving task:', error);
      toast.error('Failed to save task');
    }
  }

  async function syncTaskToCalendar(taskId: string, taskData: any) {
    try {
      const { data: existingEvent } = await supabase
        .from('calendar_events')
        .select('id')
        .eq('job_id', taskData.job_id)
        .eq('title', taskData.title)
        .eq('event_type', 'task')
        .maybeSingle();

      const calendarEventData = {
        job_id: taskData.job_id,
        title: taskData.title,
        description: taskData.description,
        event_date: taskData.due_date,
        event_type: 'task',
        all_day: true,
        created_by: taskData.created_by || profile?.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      if (existingEvent) {
        await supabase
          .from('calendar_events')
          .update(calendarEventData)
          .eq('id', existingEvent.id);
      } else {
        await supabase
          .from('calendar_events')
          .insert(calendarEventData);
      }
    } catch (error: any) {
      console.error('Error syncing task to calendar:', error);
    }
  }

  async function updateTaskStatus(taskId: string, status: JobTask['status']) {
    try {
      const updateData: any = {
        status,
        updated_at: new Date().toISOString(),
      };

      if (status === 'completed') {
        updateData.completed_at = new Date().toISOString();
        updateData.completed_by = profile?.id;
      } else {
        updateData.completed_at = null;
        updateData.completed_by = null;
      }

      const { error } = await supabase
        .from('job_tasks')
        .update(updateData)
        .eq('id', taskId);

      if (error) throw error;

      toast.success(`Task marked as ${status}`);
      loadTasks();
    } catch (error: any) {
      console.error('Error updating task status:', error);
      toast.error('Failed to update task status');
    }
  }

  async function deleteTask(taskId: string) {
    if (!confirm('Are you sure you want to delete this task?')) return;

    try {
      const { data: task } = await supabase
        .from('job_tasks')
        .select('title, job_id')
        .eq('id', taskId)
        .single();

      const { error } = await supabase
        .from('job_tasks')
        .delete()
        .eq('id', taskId);

      if (error) throw error;

      // Delete calendar event
      if (task) {
        await supabase
          .from('calendar_events')
          .delete()
          .eq('job_id', task.job_id)
          .eq('title', task.title)
          .eq('event_type', 'task');
      }

      toast.success('Task deleted');
      loadTasks();
    } catch (error: any) {
      console.error('Error deleting task:', error);
      toast.error('Failed to delete task');
    }
  }

  const getStatusIcon = (status: JobTask['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="w-4 h-4 text-green-600" />;
      case 'in_progress':
        return <PlayCircle className="w-4 h-4 text-blue-600" />;
      case 'blocked':
        return <XCircle className="w-4 h-4 text-red-600" />;
      default:
        return <Circle className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: JobTask['status']) => {
    const variants: Record<JobTask['status'], any> = {
      pending: { variant: 'secondary', label: 'Pending' },
      in_progress: { variant: 'default', label: 'In Progress' },
      completed: { variant: 'outline', label: 'Completed', className: 'bg-green-50 text-green-700 border-green-200' },
      blocked: { variant: 'destructive', label: 'Blocked' },
    };
    const config = variants[status];
    return (
      <Badge variant={config.variant} className={config.className}>
        {config.label}
      </Badge>
    );
  };

  const getPriorityBadge = (priority: JobTask['priority']) => {
    const configs: Record<JobTask['priority'], any> = {
      urgent: { className: 'bg-red-800 text-red-100 border-2 border-red-900', label: 'Urgent' },
      high: { className: 'bg-orange-700 text-orange-100 border-2 border-orange-800', label: 'High' },
      medium: { className: 'bg-blue-700 text-blue-100 border-2 border-blue-800', label: 'Medium' },
      low: { className: 'bg-slate-600 text-slate-100 border-2 border-slate-700', label: 'Low' },
    };
    const config = configs[priority];
    return (
      <Badge variant="outline" className={config.className}>
        {config.label}
      </Badge>
    );
  };

  const filteredTasks = tasks.filter(task => {
    if (task.status !== filterStatus) return false;
    if (filterJob !== 'all' && task.job_id !== filterJob) return false;
    return true;
  });
  // Tasks are already sorted by priority in loadTasks()

  const tasksByStatus = {
    pending: tasks.filter(t => t.status === 'pending'),
    blocked: tasks.filter(t => t.status === 'blocked'),
    completed: tasks.filter(t => t.status === 'completed'),
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">Loading tasks...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-4">
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

        <div className="flex gap-2 flex-wrap">
          <Button
            variant={filterStatus === 'pending' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterStatus('pending')}
            className={filterStatus === 'pending' ? "bg-gradient-to-r from-blue-700 to-blue-800 hover:from-blue-800 hover:to-blue-900 text-white font-semibold" : "border-2 border-slate-400 text-slate-700 hover:bg-slate-100"}
          >
            Pending ({tasksByStatus.pending.length})
          </Button>
          {tasksByStatus.blocked.length > 0 && (
            <Button
              variant={filterStatus === 'blocked' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilterStatus('blocked')}
              className={filterStatus === 'blocked' ? "bg-gradient-to-r from-red-700 to-red-800 hover:from-red-800 hover:to-red-900 text-white font-semibold" : "border-2 border-slate-400 text-slate-700 hover:bg-slate-100"}
            >
              Blocked ({tasksByStatus.blocked.length})
            </Button>
          )}
          <Button
            variant={filterStatus === 'completed' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterStatus('completed')}
            className={filterStatus === 'completed' ? "bg-gradient-to-r from-green-700 to-green-800 hover:from-green-800 hover:to-green-900 text-white font-semibold" : "border-2 border-slate-400 text-slate-700 hover:bg-slate-100"}
          >
            Completed ({tasksByStatus.completed.length})
          </Button>
        </div>
      </div>

      {/* Tasks List */}
      {filteredTasks.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <ListTodo className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No tasks found</p>
            <Button onClick={openCreateDialog} variant="outline" className="mt-4">
              <Plus className="w-4 h-4 mr-2" />
              Create First Task
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredTasks.map((task) => {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const isOverdue = task.due_date && parseDateLocal(task.due_date) < today && task.status !== 'completed';
            
            return (
              <Card 
                key={task.id} 
                className={isOverdue 
                  ? 'border-[3px] border-red-900 bg-red-50 shadow-lg' 
                  : 'border-slate-300'
                }
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="pt-0.5">
                      {getStatusIcon(task.status)}
                    </div>

                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          {/* Job Name - Prominent Display */}
                          {task.job && (
                            <div className="flex items-center gap-2 mb-2">
                              <Briefcase className={`w-4 h-4 flex-shrink-0 ${isOverdue ? 'text-red-900' : 'text-green-800'}`} />
                              <span className={`font-bold text-sm ${isOverdue ? 'text-red-900' : 'text-green-900'}`}>
                                {task.job.name}
                              </span>
                              {isOverdue && (
                                <Badge variant="destructive" className="bg-red-900 text-white font-bold border-2 border-red-950">
                                  <AlertCircle className="w-3 h-3 mr-1" />
                                  OVERDUE
                                </Badge>
                              )}
                            </div>
                          )}
                          <h4 className={`font-medium ${isOverdue ? 'text-red-900' : ''}`}>{task.title}</h4>
                          {task.description && (
                            <p className={`text-sm mt-1 ${isOverdue ? 'text-red-800' : 'text-muted-foreground'}`}>
                              {task.description}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditDialog(task)}
                          >
                            <Edit className="w-3 h-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteTask(task.id)}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 text-xs">
                        {getStatusBadge(task.status)}
                        {getPriorityBadge(task.priority)}
                        <Badge variant="outline" className="capitalize">
                          {task.task_type}
                        </Badge>
                        {task.assigned_to && task.assigned_user && (
                          <Badge variant="outline" className="flex items-center gap-1">
                            <User className="w-3 h-3" />
                            {task.assigned_user.username || task.assigned_user.email}
                          </Badge>
                        )}
                        {task.due_date && (
                          <Badge 
                            variant={isOverdue ? 'destructive' : 'outline'}
                            className={isOverdue 
                              ? "flex items-center gap-1 bg-red-900 text-white font-bold border-2 border-red-950" 
                              : "flex items-center gap-1"
                            }
                          >
                            <CalendarIcon className="w-3 h-3" />
                            {isOverdue && <AlertCircle className="w-3 h-3" />}
                            {parseDateLocal(task.due_date).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                            })}
                            {isOverdue && ' - LATE'}
                          </Badge>
                        )}
                      </div>

                      {task.status !== 'completed' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => updateTaskStatus(task.id, 'completed')}
                          className="text-green-600 hover:text-green-700"
                        >
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          Mark Complete
                        </Button>
                      )}

                      {task.status === 'completed' && task.completed_at && (
                        <p className="text-xs text-muted-foreground">
                          Completed {new Date(task.completed_at).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                          })}
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingTask ? 'Edit Task' : 'Create New Task'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="job">Job *</Label>
              <Select
                value={formData.job_id}
                onValueChange={(value) => setFormData({ ...formData, job_id: value })}
                disabled={!!editingTask}
              >
                <SelectTrigger id="job">
                  <SelectValue placeholder="Select job..." />
                </SelectTrigger>
                <SelectContent>
                  {jobs.map((job) => (
                    <SelectItem key={job.id} value={job.id}>
                      {job.name} - {job.client_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="title">Task Title *</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="e.g., Install temporary power"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Additional details about this task..."
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="task_type">Type</Label>
                <Select
                  value={formData.task_type}
                  onValueChange={(value: any) => setFormData({ ...formData, task_type: value })}
                >
                  <SelectTrigger id="task_type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="field">Field</SelectItem>
                    <SelectItem value="office">Office</SelectItem>
                    <SelectItem value="shop">Shop</SelectItem>
                    <SelectItem value="general">General</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="priority">Priority</Label>
                <Select
                  value={formData.priority}
                  onValueChange={(value: any) => setFormData({ ...formData, priority: value })}
                >
                  <SelectTrigger id="priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="assigned_to">Assign To</Label>
                <Select
                  value={formData.assigned_to || 'unassigned'}
                  onValueChange={(value) => setFormData({ ...formData, assigned_to: value === 'unassigned' ? '' : value })}
                >
                  <SelectTrigger id="assigned_to">
                    <SelectValue placeholder="Select user..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {users.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.username || user.email} ({user.role})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="due_date">Due Date *</Label>
                <Input
                  id="due_date"
                  type="date"
                  value={formData.due_date}
                  onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                  required
                />
                <p className="text-xs text-muted-foreground">Task will be added to calendar</p>
              </div>
            </div>

            <div className="flex gap-2 pt-4">
              <Button onClick={handleSave} className="flex-1">
                {editingTask ? 'Update Task' : 'Create Task'}
              </Button>
              <Button variant="outline" onClick={() => setShowDialog(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
