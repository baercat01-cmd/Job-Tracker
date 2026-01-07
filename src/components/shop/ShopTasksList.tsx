import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import { ListTodo, CheckCircle2, Clock, AlertCircle, Play, X } from 'lucide-react';
import { toast } from 'sonner';

interface ShopTask {
  id: string;
  job_id: string;
  title: string;
  description: string | null;
  priority: 'low' | 'medium' | 'high';
  status: 'pending' | 'in_progress' | 'completed';
  assigned_to: string | null;
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
  created_by: string;
}

interface TaskWithDetails extends ShopTask {
  job_name: string;
  client_name: string;
  created_by_name: string;
}

interface ShopTasksListProps {
  userId: string;
}

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low', color: 'bg-gray-100 text-gray-700 border-gray-300', icon: Clock },
  { value: 'medium', label: 'Medium', color: 'bg-yellow-100 text-yellow-700 border-yellow-300', icon: AlertCircle },
  { value: 'high', label: 'High', color: 'bg-red-100 text-red-700 border-red-300', icon: AlertCircle },
];

function getPriorityColor(priority: string) {
  return PRIORITY_OPTIONS.find(p => p.value === priority)?.color || 'bg-gray-100 text-gray-700 border-gray-300';
}

function getPriorityLabel(priority: string) {
  return PRIORITY_OPTIONS.find(p => p.value === priority)?.label || priority;
}

export function ShopTasksList({ userId }: ShopTasksListProps) {
  const [tasks, setTasks] = useState<TaskWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'in_progress' | 'completed'>('pending');
  const [selectedTask, setSelectedTask] = useState<TaskWithDetails | null>(null);
  const [showTaskDialog, setShowTaskDialog] = useState(false);

  useEffect(() => {
    loadTasks();
    
    // Subscribe to task changes
    const channel = supabase
      .channel('shop_tasks_changes')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'shop_tasks' },
        () => {
          loadTasks();
        }
      )
      .subscribe();
    
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function loadTasks() {
    try {
      setLoading(true);
      
      const { data: tasksData, error: tasksError } = await supabase
        .from('shop_tasks')
        .select(`
          *,
          jobs!inner(
            name,
            client_name,
            status
          ),
          user_profiles!shop_tasks_created_by_fkey(
            username,
            email
          )
        `)
        .eq('jobs.status', 'active')
        .order('due_date', { ascending: true, nullsFirst: false })
        .order('priority', { ascending: false });

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
        completed_at: t.completed_at,
        created_at: t.created_at,
        created_by: t.created_by,
        job_name: t.jobs.name,
        client_name: t.jobs.client_name,
        created_by_name: t.user_profiles?.username || t.user_profiles?.email || 'Unknown',
      }));

      setTasks(tasksWithDetails);
    } catch (error: any) {
      console.error('Error loading tasks:', error);
      toast.error('Failed to load tasks');
    } finally {
      setLoading(false);
    }
  }

  async function updateTaskStatus(taskId: string, newStatus: 'pending' | 'in_progress' | 'completed') {
    try {
      const updateData: any = {
        status: newStatus,
        updated_at: new Date().toISOString(),
      };

      if (newStatus === 'completed') {
        updateData.completed_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from('shop_tasks')
        .update(updateData)
        .eq('id', taskId);

      if (error) throw error;

      toast.success(`Task marked as ${newStatus.replace('_', ' ')}`);
      loadTasks();
    } catch (error: any) {
      console.error('Error updating task:', error);
      toast.error('Failed to update task');
    }
  }

  const filteredTasks = filterStatus === 'all' 
    ? tasks 
    : tasks.filter(task => task.status === filterStatus);

  const pendingCount = tasks.filter(t => t.status === 'pending').length;
  const inProgressCount = tasks.filter(t => t.status === 'in_progress').length;
  const completedCount = tasks.filter(t => t.status === 'completed').length;

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
                Shop Tasks
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Tasks assigned by office staff
              </p>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Status Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b">
        <Button
          variant={filterStatus === 'all' ? 'default' : 'outline'}
          onClick={() => setFilterStatus('all')}
          className={filterStatus === 'all' ? 'gradient-primary' : ''}
        >
          All Tasks
          <Badge variant="secondary" className="ml-2">
            {tasks.length}
          </Badge>
        </Button>
        <Button
          variant={filterStatus === 'pending' ? 'default' : 'outline'}
          onClick={() => setFilterStatus('pending')}
          className={filterStatus === 'pending' ? 'gradient-primary' : ''}
        >
          <Clock className="w-4 h-4 mr-2" />
          Pending
          <Badge variant="secondary" className="ml-2">
            {pendingCount}
          </Badge>
        </Button>
        <Button
          variant={filterStatus === 'in_progress' ? 'default' : 'outline'}
          onClick={() => setFilterStatus('in_progress')}
          className={filterStatus === 'in_progress' ? 'gradient-primary' : ''}
        >
          <Play className="w-4 h-4 mr-2" />
          In Progress
          <Badge variant="secondary" className="ml-2">
            {inProgressCount}
          </Badge>
        </Button>
        <Button
          variant={filterStatus === 'completed' ? 'default' : 'outline'}
          onClick={() => setFilterStatus('completed')}
          className={filterStatus === 'completed' ? 'gradient-primary' : ''}
        >
          <CheckCircle2 className="w-4 h-4 mr-2" />
          Completed
          <Badge variant="secondary" className="ml-2">
            {completedCount}
          </Badge>
        </Button>
      </div>

      {/* Tasks List */}
      {filteredTasks.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <ListTodo className="w-16 h-16 mx-auto text-muted-foreground/50 mb-4" />
            <p className="text-lg font-medium text-muted-foreground">
              No {filterStatus === 'all' ? '' : filterStatus.replace('_', ' ')} tasks
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredTasks.map((task) => {
            const PriorityIcon = PRIORITY_OPTIONS.find(p => p.value === task.priority)?.icon || Clock;
            const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'completed';
            
            return (
              <Card 
                key={task.id} 
                className={`cursor-pointer hover:shadow-md transition-shadow ${isOverdue ? 'border-red-300 bg-red-50/30' : ''}`}
                onClick={() => {
                  setSelectedTask(task);
                  setShowTaskDialog(true);
                }}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-start gap-3">
                        <PriorityIcon className={`w-5 h-5 mt-0.5 ${
                          task.priority === 'high' ? 'text-red-600' : 
                          task.priority === 'medium' ? 'text-yellow-600' : 
                          'text-gray-600'
                        }`} />
                        <div className="flex-1">
                          <h3 className="font-semibold text-base">{task.title}</h3>
                          {task.description && (
                            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                              {task.description}
                            </p>
                          )}
                          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                            <span className="font-medium">{task.job_name}</span>
                            <span>•</span>
                            <span>{task.client_name}</span>
                            {task.due_date && (
                              <>
                                <span>•</span>
                                <span className={isOverdue ? 'text-red-600 font-medium' : ''}>
                                  Due: {new Date(task.due_date).toLocaleDateString()}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex flex-col items-end gap-2">
                      <Badge className={getPriorityColor(task.priority)}>
                        {getPriorityLabel(task.priority)}
                      </Badge>
                      
                      {task.status === 'pending' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            updateTaskStatus(task.id, 'in_progress');
                          }}
                          className="whitespace-nowrap"
                        >
                          <Play className="w-3 h-3 mr-1" />
                          Start
                        </Button>
                      )}
                      
                      {task.status === 'in_progress' && (
                        <Button
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            updateTaskStatus(task.id, 'completed');
                          }}
                          className="gradient-primary whitespace-nowrap"
                        >
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          Complete
                        </Button>
                      )}
                      
                      {task.status === 'completed' && (
                        <Badge className="bg-green-100 text-green-700 border-green-300">
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          Done
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Task Details Dialog */}
      <Dialog open={showTaskDialog} onOpenChange={setShowTaskDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Task Details</DialogTitle>
          </DialogHeader>
          
          {selectedTask && (
            <div className="space-y-4">
              <div>
                <Label className="text-xs text-muted-foreground">Title</Label>
                <p className="font-semibold text-lg">{selectedTask.title}</p>
              </div>
              
              {selectedTask.description && (
                <div>
                  <Label className="text-xs text-muted-foreground">Description</Label>
                  <p className="text-sm mt-1">{selectedTask.description}</p>
                </div>
              )}
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground">Job</Label>
                  <p className="font-medium">{selectedTask.job_name}</p>
                  <p className="text-sm text-muted-foreground">{selectedTask.client_name}</p>
                </div>
                
                <div>
                  <Label className="text-xs text-muted-foreground">Priority</Label>
                  <div className="mt-1">
                    <Badge className={getPriorityColor(selectedTask.priority)}>
                      {getPriorityLabel(selectedTask.priority)}
                    </Badge>
                  </div>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                {selectedTask.due_date && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Due Date</Label>
                    <p className="font-medium">
                      {new Date(selectedTask.due_date).toLocaleDateString()}
                    </p>
                  </div>
                )}
                
                <div>
                  <Label className="text-xs text-muted-foreground">Created By</Label>
                  <p className="font-medium">{selectedTask.created_by_name}</p>
                </div>
              </div>
              
              {selectedTask.completed_at && (
                <div>
                  <Label className="text-xs text-muted-foreground">Completed At</Label>
                  <p className="font-medium">
                    {new Date(selectedTask.completed_at).toLocaleString()}
                  </p>
                </div>
              )}
              
              <div className="flex gap-2 pt-4 border-t">
                {selectedTask.status === 'pending' && (
                  <Button
                    onClick={() => {
                      updateTaskStatus(selectedTask.id, 'in_progress');
                      setShowTaskDialog(false);
                    }}
                    className="flex-1"
                  >
                    <Play className="w-4 h-4 mr-2" />
                    Start Task
                  </Button>
                )}
                
                {selectedTask.status === 'in_progress' && (
                  <Button
                    onClick={() => {
                      updateTaskStatus(selectedTask.id, 'completed');
                      setShowTaskDialog(false);
                    }}
                    className="flex-1 gradient-primary"
                  >
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    Mark Complete
                  </Button>
                )}
                
                <Button
                  variant="outline"
                  onClick={() => setShowTaskDialog(false)}
                  className="flex-1"
                >
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
