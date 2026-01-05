import { useState } from 'react';
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
import { toast } from 'sonner';
import { Building2 } from 'lucide-react';

interface CreateJobDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function CreateJobDialog({ open, onClose, onSuccess }: CreateJobDialogProps) {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    client_name: '',
    address: '',
    description: '',
    notes: '',
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    
    // Office role validation
    if (profile?.role !== 'office') {
      toast.error('Only office staff can create jobs');
      return;
    }

    setLoading(true);

    try {
      // Insert job with only valid columns
      const { data: job, error } = await supabase
        .from('jobs')
        .insert({
          name: formData.name.trim(),
          client_name: formData.client_name.trim(),
          address: formData.address.trim(),
          description: formData.description.trim() || null,
          notes: formData.notes.trim() || null,
          documents: [], // Empty array for custom folders
          components: [], // Empty array for job components
          status: 'active',
          created_by: profile.id,
        })
        .select()
        .single();

      if (error) {
        console.error('Job creation error:', error);
        throw new Error(error.message || 'Failed to create job');
      }

      toast.success(`Job "${formData.name}" created successfully`);
      
      // Reset form
      setFormData({
        name: '',
        client_name: '',
        address: '',
        description: '',
        notes: '',
      });
      
      // Close dialog and refresh
      onSuccess();
    } catch (error: any) {
      console.error('Job creation failed:', error);
      toast.error(error.message || 'Failed to create job');
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    if (!loading) {
      onClose();
      // Reset form on close
      setFormData({
        name: '',
        client_name: '',
        address: '',
        description: '',
        notes: '',
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5" />
            Create New Job
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Job Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Smith Barn Construction"
              required
              disabled={loading}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="client_name">Client Name</Label>
              <Input
                id="client_name"
                value={formData.client_name}
                onChange={(e) => setFormData({ ...formData, client_name: e.target.value })}
                placeholder="John Smith"
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="address">Job Address *</Label>
              <Input
                id="address"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                placeholder="123 Main St, City, State"
                required
                disabled={loading}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
              placeholder="Project details, scope, etc."
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
              placeholder="Internal notes, special instructions, etc."
              disabled={loading}
            />
          </div>

          <div className="bg-muted p-4 rounded-lg text-sm text-muted-foreground">
            <p className="font-medium mb-2">📁 Document Management</p>
            <p>After creating the job, you can add custom document folders (Drawings, Specs, POs, etc.) and upload files to organize job documents.</p>
          </div>

          <div className="flex gap-2 justify-end pt-4 border-t">
            <Button type="button" variant="outline" onClick={handleClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="gradient-primary">
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  Creating...
                </>
              ) : (
                'Create Job'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
