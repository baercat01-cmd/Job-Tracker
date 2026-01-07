import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Plus, Edit, Trash2, ListTodo, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Job } from '@/types';

interface ShopTask {
  id: string;
  job_id: string;
  title: string;
  description: string | null;
  priority: 'low' | 'medium' | 'high';
  status: 'pending' | 'in_progress' | 'completed';
  assigned_to: string | null;
  due_date: string | null;
  created_at: string;
  created_by: string;
}

interface TaskWithDetails extends ShopTask {
  job_name: string;
  assigned_to_name: string | null;
}

interface ShopTasksManagementProps {
  userId: string;
}

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low', color: 'bg-gray-100 text-gray-700 border-gray-300' },
  { value: 'medium', label: 'Medium', color: 'bg-yellow-100 text-yellow-700 border-yellow-300' },
  { value: 'high', label: 'High', color: 'bg-red-100 text-red-700 border-red-300' },
];

export function ShopTasksManagement({ userId }: ShopTasksManagementProps) {
  const [tasks, setTasks] = useState<TaskWithDetails[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [shopUsers, setShopUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTaskDialog, setShowTaskDialog] = useState(false);
  const [editingTask, setEditingTask] = useState<ShopTask | null>(null);
  
  const [taskJobId, setTaskJobId] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [taskPriority, setTaskPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [taskAssignedTo, setTaskAssignedTo] = useState('');
  const [taskDueDate, setTaskDueDate] = useState('');

  useEffect(() => {
    loadTasks();
    loadJobs();
    loadShopUsers();
  }, []);

  async function loadJobs() {
    try {
      const { data, error } = await supabase
        .from('jobs')
        .select('*')
        .eq('status', 'active')
        .order('name');

      if (error) throw error;
      setJobs(data || []);
    } catch (error: any) {
      console.error('Error loading jobs:', error);
    }
  }

  async function loadShopUsers() {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('id, username, email')
        .eq('role', 'shop')
        .order('username');

      if (error) throw error;
      setShopUsers(data || []);
    } catch (error: any) {
      console.error('Error loading shop users:', error);
    }
  }

  async function loadTasks() {
    try {
      setLoading(true);
      
      const { data: tasksData, error: tasksError } = await supabase
        .from('shop_tasks')
        .select(`
          *,
          jobs(name),
          user_profiles(username, email)
        `)
        .order('created_at', { ascending: false });

      if (tasksError) throw tasksError;

      const tasksWithDetails = (tasksData || []).map((t: any) => ({
        id: t.id,
        job_id: t.job_id,
        title: t.title,
        description: t.description,
        priority: t.priority,
        status: t.status,
        assigned_to: t.assigned_to,
        due_date: t.due_date,
        created_at: t.created_at,
        created_by: t.created_by,
        job_name: t.jobs?.name || 'Unknown Job',
        assigned_to_name: t.user_profiles?.username || t.user_profiles?.email || null,
      }));

      setTasks(tasksWithDetails);
    } catch (error: any) {
      console.error('Error loading tasks:', error);
      toast.error('Failed to load tasks');
    } finally {
      setLoading(false);
    }
  }

  function openAddTask() {
    setEditingTask(null);
    setTaskJobId('');
    setTaskTitle('');
    setTaskDescription('');
    setTaskPriority('medium');
    setTaskAssignedTo('');
    setTaskDueDate('');
    setShowTaskDialog(true);
  }

  function openEditTask(task: ShopTask) {
    setEditingTask(task);
    setTaskJobId(task.job_id);
    setTaskTitle(task.title);
    setTaskDescription(task.description || '');
    setTaskPriority(task.priority);
    setTaskAssignedTo(task.assigned_to || '');
    setTaskDueDate(task.due_date || '');
    setShowTaskDialog(true);
  }

  async function saveTask() {
    if (!taskJobId || !taskTitle.trim()) {
      toast.error('Please fill in job and title');
      return;
    }

    try {
      if (editingTask) {
        const { error } = await supabase
          .from('shop_tasks')
          .update({
            job_id: taskJobId,
            title: taskTitle.trim(),
            description: taskDescription.trim() || null,
            priority: taskPriority,
            assigned_to: taskAssignedTo || null,
            due_date: taskDueDate || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingTask.id);

        if (error) throw error;
        toast.success('Task updated');
      } else {
        const { error } = await supabase
          .from('shop_tasks')
          .insert({
            job_id: taskJobId,
            title: taskTitle.trim(),
            description: taskDescription.trim() || null,
            priority: taskPriority,
            assigned_to: taskAssignedTo || null,
            due_date: taskDueDate || null,
            status: 'pending',
            created_by: userId,
          });

        if (error) throw error;
        toast.success('Task created');
      }

      setShowTaskDialog(false);
      loadTasks();
    } catch (error: any) {
      toast.error('Failed to save task');
      console.error(error);
    }
  }

  async function deleteTask(taskId: string) {
    if (!confirm('Delete this task?')) return;

    try {
      const { error } = await supabase
        .from('shop_tasks')
        .delete()
        .eq('id', taskId);

      if (error) throw error;
      toast.success('Task deleted');
      loadTasks();
    } catch (error: any) {
      toast.error('Failed to delete task');
      console.error(error);
    }
  }

  const pendingTasks = tasks.filter(t => t.status === 'pending');
  const inProgressTasks = tasks.filter(t => t.status === 'in_progress');
  const completedTasks = tasks.filter(t => t.status === 'completed');

  if (loading) {
    return <div className="text-center py-8">Loading tasks...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl flex items-center gap-2">
                <ListTodo className="w-6 h-6 text-primary" />
                Shop Tasks Management
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Create and manage tasks for shop users
              </p>
            </div>
            <Button onClick={openAddTask} className="gradient-primary">
              <Plus className="w-4 h-4 mr-2" />
              Add Task
            </Button>
          </div>
        </CardHeader>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-3xl font-bold text-yellow-600">{pendingTasks.length}</p>
              <p className="text-sm text-muted-foreground mt-1">Pending</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-3xl font-bold text-blue-600">{inProgressTasks.length}</p>
              <p className="text-sm text-muted-foreground mt-1">In Progress</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-3xl font-bold text-green-600">{completedTasks.length}</p>
              <p className="text-sm text-muted-foreground mt-1">Completed</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tasks List */}
      <Card>
        <CardContent className="p-0">
          {tasks.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              No tasks yet. Create a task to get started.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/50 border-b">
                  <tr>
                    <th className="text-left p-3 font-semibold">Task</th>
                    <th className="text-left p-3 font-semibold">Job</th>
                    <th className="text-center p-3 font-semibold">Priority</th>
                    <th className="text-center p-3 font-semibold">Status</th>
                    <th className="text-left p-3 font-semibold">Assigned To</th>
                    <th className="text-center p-3 font-semibold">Due Date</th>
                    <th className="text-right p-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((task) => (
                    <tr key={task.id} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="p-3">
                        <div>
                          <p className="font-medium">{task.title}</p>
                          {task.description && (
                            <p className="text-sm text-muted-foreground line-clamp-1">
                              {task.description}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="p-3 text-sm">{task.job_name}</td>
                      <td className="p-3">
                        <div className="flex justify-center">
                          <Badge className={PRIORITY_OPTIONS.find(p => p.value === task.priority)?.color}>
                            {PRIORITY_OPTIONS.find(p => p.value === task.priority)?.label}
                          </Badge>
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="flex justify-center">
                          <Badge variant="outline" className={
                            task.status === 'completed' ? 'bg-green-50 text-green-700 border-green-300' :
                            task.status === 'in_progress' ? 'bg-blue-50 text-blue-700 border-blue-300' :
                            'bg-gray-50 text-gray-700 border-gray-300'
                          }>
                            {task.status === 'in_progress' ? 'In Progress' : 
                             task.status === 'completed' ? 'Completed' : 'Pending'}
                          </Badge>
                        </div>
                      </td>
                      <td className="p-3 text-sm">
                        {task.assigned_to_name || '-'}
                      </td>
                      <td className="p-3 text-center text-sm">
                        {task.due_date ? new Date(task.due_date).toLocaleDateString() : '-'}
                      </td>
                      <td className="p-3">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openEditTask(task)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => deleteTask(task.id)}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Task Dialog */}
      <Dialog open={showTaskDialog} onOpenChange={setShowTaskDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingTask ? 'Edit Task' : 'Create Task'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="task-job">Job *</Label>
              <Select value={taskJobId} onValueChange={setTaskJobId}>
                <SelectTrigger id="task-job">
                  <SelectValue placeholder="Select job" />
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
            
            <div>
              <Label htmlFor="task-title">Title *</Label>
              <Input
                id="task-title"
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                placeholder="e.g., Prepare lumber for delivery"
              />
            </div>
            
            <div>
              <Label htmlFor="task-description">Description</Label>
              <Textarea
                id="task-description"
                value={taskDescription}
                onChange={(e) => setTaskDescription(e.target.value)}
                placeholder="Additional details..."
                rows={3}
              />
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="task-priority">Priority</Label>
                <Select value={taskPriority} onValueChange={(value: any) => setTaskPriority(value)}>
                  <SelectTrigger id="task-priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITY_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label htmlFor="task-due-date">Due Date</Label>
                <Input
                  id="task-due-date"
                  type="date"
                  value={taskDueDate}
                  onChange={(e) => setTaskDueDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                />
              </div>
            </div>
            
            <div>
              <Label htmlFor="task-assigned-to">Assign To</Label>
              <Select value={taskAssignedTo} onValueChange={setTaskAssignedTo}>
                <SelectTrigger id="task-assigned-to">
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Unassigned</SelectItem>
                  {shopUsers.map(user => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.username || user.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex gap-2 pt-4">
              <Button onClick={saveTask} className="flex-1">
                {editingTask ? 'Update' : 'Create'}
              </Button>
              <Button variant="outline" onClick={() => setShowTaskDialog(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
