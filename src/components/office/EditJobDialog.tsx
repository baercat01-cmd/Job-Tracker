import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Building2 } from 'lucide-react';
import type { Job } from '@/types';

interface EditJobDialogProps {
  open: boolean;
  job: Job | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function EditJobDialog({ open, job, onClose, onSuccess }: EditJobDialogProps) {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    client_name: '',
    address: '',
    description: '',
    notes: '',
    status: 'active',
    job_number: '',
  });

  useEffect(() => {
    if (job) {
      setFormData({
        name: job.name || '',
        client_name: job.client_name || '',
        address: job.address || '',
        description: job.description || '',
        notes: job.notes || '',
        status: job.status || 'active',
        job_number: job.job_number || '',
      });
    }
  }, [job]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    
    if (!job) return;

    // Office role validation
    if (profile?.role !== 'office') {
      toast.error('Only office staff can edit jobs');
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase
        .from('jobs')
        .update({
          name: formData.name.trim(),
          client_name: formData.client_name.trim(),
          address: formData.address.trim(),
          description: formData.description.trim() || null,
          notes: formData.notes.trim() || null,
          status: formData.status,
          job_number: formData.job_number.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', job.id);

      if (error) {
        console.error('Job update error:', error);
        throw new Error(error.message || 'Failed to update job');
      }

      toast.success('Job updated successfully');
      onSuccess();
    } catch (error: any) {
      console.error('Job update failed:', error);
      toast.error(error.message || 'Failed to update job');
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    if (!loading) {
      onClose();
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5" />
            Edit Job
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-name">Job Name *</Label>
            <Input
              id="edit-name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Smith Barn Construction"
              required
              disabled={loading}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-client">Client Name *</Label>
              <Input
                id="edit-client"
                value={formData.client_name}
                onChange={(e) => setFormData({ ...formData, client_name: e.target.value })}
                placeholder="John Smith"
                required
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-job-number">Job Number</Label>
              <Input
                id="edit-job-number"
                value={formData.job_number}
                onChange={(e) => setFormData({ ...formData, job_number: e.target.value })}
                placeholder="JOB-2024-001"
                disabled={loading}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-address">Job Address *</Label>
            <Input
              id="edit-address"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              placeholder="123 Main St, City, State"
              required
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-status">Status</Label>
            <Select value={formData.status} onValueChange={(value) => setFormData({ ...formData, status: value })}>
              <SelectTrigger id="edit-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="on_hold">On Hold</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-description">Description</Label>
            <Textarea
              id="edit-description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
              placeholder="Project details, scope, etc."
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-notes">Notes</Label>
            <Textarea
              id="edit-notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
              placeholder="Internal notes, special instructions, etc."
              disabled={loading}
            />
          </div>

          <div className="flex gap-2 justify-end pt-4 border-t">
            <Button type="button" variant="outline" onClick={handleClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="gradient-primary">
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  Updating...
                </>
              ) : (
                'Update Job'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
