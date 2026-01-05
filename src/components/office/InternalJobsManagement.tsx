import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
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
} from '@/components/ui/dialog';
import { Building2, Plus, Edit, Archive, Trash2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

interface InternalJob {
  id: string;
  name: string;
  status: string;
  created_at: string;
}

interface InternalJobsManagementProps {
  userId: string;
}

export function InternalJobsManagement({ userId }: InternalJobsManagementProps) {
  const [internalJobs, setInternalJobs] = useState<InternalJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editingJob, setEditingJob] = useState<InternalJob | null>(null);
  const [jobName, setJobName] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteJobId, setDeleteJobId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    loadInternalJobs();
  }, []);

  async function loadInternalJobs() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('jobs')
        .select('id, name, status, created_at')
        .eq('is_internal', true)
        .order('name');

      if (error) throw error;
      setInternalJobs(data || []);
    } catch (error: any) {
      console.error('Error loading internal jobs:', error);
      toast.error('Failed to load internal jobs');
    } finally {
      setLoading(false);
    }
  }

  function openCreateDialog() {
    setEditingJob(null);
    setJobName('');
    setShowDialog(true);
  }

  function openEditDialog(job: InternalJob) {
    setEditingJob(job);
    setJobName(job.name);
    setShowDialog(true);
  }

  function closeDialog() {
    setShowDialog(false);
    setEditingJob(null);
    setJobName('');
  }

  async function handleSave() {
    if (!jobName.trim()) {
      toast.error('Please enter a job name');
      return;
    }

    setSaving(true);
    try {
      if (editingJob) {
        // Update existing internal job
        const { error } = await supabase
          .from('jobs')
          .update({ name: jobName.trim() })
          .eq('id', editingJob.id);

        if (error) throw error;
        toast.success('Internal job updated');
      } else {
        // Create new internal job
        const { error } = await supabase
          .from('jobs')
          .insert({
            name: jobName.trim(),
            client_name: 'Internal',
            address: 'N/A',
            is_internal: true,
            status: 'active',
            created_by: userId,
          });

        if (error) throw error;
        toast.success('Internal job created');
      }

      await loadInternalJobs();
      closeDialog();
    } catch (error: any) {
      console.error('Error saving internal job:', error);
      toast.error('Failed to save internal job');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleStatus(job: InternalJob) {
    try {
      const newStatus = job.status === 'active' ? 'archived' : 'active';
      
      const { error } = await supabase
        .from('jobs')
        .update({ status: newStatus })
        .eq('id', job.id);

      if (error) throw error;

      toast.success(`Internal job ${newStatus === 'active' ? 'activated' : 'archived'}`);
      await loadInternalJobs();
    } catch (error: any) {
      console.error('Error updating status:', error);
      toast.error('Failed to update status');
    }
  }

  function startDeleteJob(jobId: string) {
    setDeleteJobId(jobId);
    setShowDeleteConfirm(true);
  }

  function cancelDelete() {
    setDeleteJobId(null);
    setShowDeleteConfirm(false);
  }

  async function confirmDeleteJob() {
    if (!deleteJobId) return;
    
    setDeleting(true);
    
    try {
      const { error } = await supabase
        .from('jobs')
        .delete()
        .eq('id', deleteJobId);
      
      if (error) throw error;
      
      toast.success('Internal job deleted');
      cancelDelete();
      await loadInternalJobs();
    } catch (error: any) {
      console.error('Error deleting internal job:', error);
      toast.error('Failed to delete internal job');
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">Loading internal jobs...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="w-5 h-5" />
                Internal Jobs
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Jobs for tracking internal time (Shop, Office, etc.) - not shown in job cards
              </p>
            </div>
            <Button onClick={openCreateDialog}>
              <Plus className="w-4 h-4 mr-2" />
              Add Internal Job
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {internalJobs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Building2 className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <p className="text-lg">No internal jobs yet</p>
              <p className="text-sm mt-1">Create internal jobs for time tracking (Shop, Office, etc.)</p>
            </div>
          ) : (
            <div className="space-y-3">
              {internalJobs.map((job) => (
                <div
                  key={job.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Building2 className="w-5 h-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium">{job.name}</p>
                      <p className="text-sm text-muted-foreground">
                        Created {new Date(job.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Badge variant={job.status === 'active' ? 'default' : 'secondary'}>
                      {job.status}
                    </Badge>
                    
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEditDialog(job)}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleToggleStatus(job)}
                    >
                      <Archive className="w-4 h-4" />
                    </Button>
                    
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => startDeleteJob(job.id)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={closeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingJob ? 'Edit Internal Job' : 'Add Internal Job'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="job-name">Job Name *</Label>
              <Input
                id="job-name"
                value={jobName}
                onChange={(e) => setJobName(e.target.value)}
                placeholder="e.g., Shop, Office, Warehouse"
                className="h-11"
              />
              <p className="text-xs text-muted-foreground">
                This job will appear in time tracking selectors but not in job cards
              </p>
            </div>

            <div className="flex gap-2 justify-end pt-4 border-t">
              <Button
                variant="outline"
                onClick={closeDialog}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving || !jobName.trim()}
              >
                {saving ? 'Saving...' : editingJob ? 'Update' : 'Create'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteConfirm} onOpenChange={cancelDelete}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              Confirm Deletion
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete this internal job? This will also delete all associated time entries. This action cannot be undone.
            </p>
            
            <div className="flex gap-2 justify-end pt-4 border-t">
              <Button
                variant="outline"
                onClick={cancelDelete}
                disabled={deleting}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={confirmDeleteJob}
                disabled={deleting}
              >
                {deleting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4 mr-2" />
                    Yes, Delete
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
