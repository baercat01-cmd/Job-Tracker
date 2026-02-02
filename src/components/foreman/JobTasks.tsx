import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  CheckCircle2, 
  Circle,
  PlayCircle,
  AlertCircle,
  Calendar,
  ListTodo
} from 'lucide-react';
import { toast } from 'sonner';
import type { Job, JobTask, UserProfile } from '@/types';

interface JobTasksProps {
  job: Job;
  userId: string;
}

export function JobTasks({ job, userId }: JobTasksProps) {
  const [tasks, setTasks] = useState<(JobTask & { assigned_user?: UserProfile })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTasks();
    
    // Subscribe to real-time updates
    const channel = supabase
      .channel(`job_tasks:${job.id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'job_tasks', filter: `job_id=eq.${job.id}` },
        () => {
          loadTasks();
        }
      )
      .subscribe();
    
    return () => {
      supabase.removeChannel(channel);
    };
  }, [job.id]);

  async function loadTasks() {
    try {
      const { data, error } = await supabase
        .from('job_tasks')
        .select(`
          *,
          assigned_user:assigned_to(id, username, email, role)
        `)
        .eq('job_id', job.id)
        .neq('status', 'completed');

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
    } finally {
      setLoading(false);
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
        updateData.completed_by = userId;
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

  const getStatusIcon = (status: JobTask['status']) => {
    switch (status) {
      case 'in_progress':
        return <PlayCircle className="w-5 h-5 text-blue-600" />;
      case 'blocked':
        return <AlertCircle className="w-5 h-5 text-red-600" />;
      default:
        return <Circle className="w-5 h-5 text-muted-foreground" />;
    }
  };

  const getPriorityColor = (priority: JobTask['priority']) => {
    switch (priority) {
      case 'urgent':
        return 'bg-red-100 text-red-900 border-red-300';
      case 'high':
        return 'bg-orange-100 text-orange-900 border-orange-300';
      case 'medium':
        return 'bg-blue-100 text-blue-900 border-blue-300';
      default:
        return 'bg-gray-100 text-gray-900 border-gray-300';
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Loading tasks...
        </CardContent>
      </Card>
    );
  }

  if (tasks.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          <ListTodo className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>No active tasks for this job</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-4">
        <ListTodo className="w-5 h-5 text-primary" />
        <h3 className="text-lg font-semibold">Active Tasks</h3>
        <Badge variant="secondary">{tasks.length}</Badge>
      </div>

      {tasks.map((task) => {
        const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'completed';
        
        return (
          <Card 
            key={task.id}
            className={`${isOverdue ? 'border-destructive border-2' : ''}`}
          >
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className="pt-1">
                  {getStatusIcon(task.status)}
                </div>

                <div className="flex-1 min-w-0 space-y-2">
                  <h4 className="font-medium text-base">{task.title}</h4>
                  
                  {task.description && (
                    <p className="text-sm text-muted-foreground">
                      {task.description}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <Badge 
                      variant="outline" 
                      className={getPriorityColor(task.priority)}
                    >
                      {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)} Priority
                    </Badge>

                    {task.due_date && (
                      <Badge 
                        variant={isOverdue ? 'destructive' : 'outline'}
                        className="flex items-center gap-1"
                      >
                        <Calendar className="w-3 h-3" />
                        {isOverdue && <AlertCircle className="w-3 h-3" />}
                        Due {new Date(task.due_date).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </Badge>
                    )}
                  </div>

                  <div className="flex gap-2 pt-2">
                    {task.status === 'pending' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => updateTaskStatus(task.id, 'in_progress')}
                        className="flex-1"
                      >
                        <PlayCircle className="w-4 h-4 mr-2" />
                        Start Task
                      </Button>
                    )}
                    
                    {task.status === 'in_progress' && (
                      <Button
                        size="sm"
                        onClick={() => updateTaskStatus(task.id, 'completed')}
                        className="flex-1 bg-green-600 hover:bg-green-700"
                      >
                        <CheckCircle2 className="w-4 h-4 mr-2" />
                        Mark Complete
                      </Button>
                    )}
                    
                    {task.status === 'blocked' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => updateTaskStatus(task.id, 'in_progress')}
                        className="flex-1"
                      >
                        <PlayCircle className="w-4 h-4 mr-2" />
                        Resume Task
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
