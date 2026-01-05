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
import { Users, Plus, Edit, Trash2, Archive, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';

interface Worker {
  id: string;
  name: string;
  active: boolean;
  created_at: string;
}

export function WorkerManagement() {
  const { profile } = useAuth();
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editingWorker, setEditingWorker] = useState<Worker | null>(null);
  const [workerName, setWorkerName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadWorkers();
  }, []);

  async function loadWorkers() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('workers')
        .select('*')
        .order('active', { ascending: false })
        .order('name');

      if (error) throw error;
      setWorkers(data || []);
    } catch (error: any) {
      console.error('Error loading workers:', error);
      toast.error('Failed to load workers');
    } finally {
      setLoading(false);
    }
  }

  function openCreateDialog() {
    setEditingWorker(null);
    setWorkerName('');
    setShowDialog(true);
  }

  function openEditDialog(worker: Worker) {
    setEditingWorker(worker);
    setWorkerName(worker.name);
    setShowDialog(true);
  }

  function closeDialog() {
    setShowDialog(false);
    setEditingWorker(null);
    setWorkerName('');
  }

  async function saveWorker() {
    if (!workerName.trim()) {
      toast.error('Please enter a worker name');
      return;
    }

    setSaving(true);
    try {
      if (editingWorker) {
        // Update existing worker
        const { error } = await supabase
          .from('workers')
          .update({ name: workerName.trim() })
          .eq('id', editingWorker.id);

        if (error) throw error;
        toast.success('Worker updated');
      } else {
        // Create new worker
        const { error } = await supabase
          .from('workers')
          .insert({
            name: workerName.trim(),
            active: true,
            created_by: profile?.id,
          });

        if (error) throw error;
        toast.success('Worker added');
      }

      loadWorkers();
      closeDialog();
    } catch (error: any) {
      console.error('Error saving worker:', error);
      toast.error('Failed to save worker');
    } finally {
      setSaving(false);
    }
  }

  async function toggleWorkerStatus(worker: Worker) {
    try {
      const { error } = await supabase
        .from('workers')
        .update({ active: !worker.active })
        .eq('id', worker.id);

      if (error) throw error;

      toast.success(worker.active ? 'Worker archived' : 'Worker activated');
      loadWorkers();
    } catch (error: any) {
      console.error('Error toggling worker status:', error);
      toast.error('Failed to update worker');
    }
  }

  async function deleteWorker(workerId: string) {
    if (!confirm('Are you sure you want to delete this worker? This cannot be undone.')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('workers')
        .delete()
        .eq('id', workerId);

      if (error) throw error;

      toast.success('Worker deleted');
      loadWorkers();
    } catch (error: any) {
      console.error('Error deleting worker:', error);
      toast.error('Failed to delete worker');
    }
  }

  const activeWorkers = workers.filter(w => w.active);
  const archivedWorkers = workers.filter(w => !w.active);

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Loading workers...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Worker Management</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Manage the list of workers for time tracking
          </p>
        </div>
        <Button onClick={openCreateDialog} className="gradient-primary">
          <Plus className="w-4 h-4 mr-2" />
          Add Worker
        </Button>
      </div>

      {/* Active Workers */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Active Workers ({activeWorkers.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {activeWorkers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>No active workers</p>
              <p className="text-xs mt-1">Click "Add Worker" to create your first worker</p>
            </div>
          ) : (
            <div className="space-y-2">
              {activeWorkers.map((worker) => (
                <div
                  key={worker.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <CheckCircle className="w-5 h-5 text-success" />
                    <div>
                      <p className="font-medium">{worker.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Added {new Date(worker.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEditDialog(worker)}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleWorkerStatus(worker)}
                    >
                      <Archive className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteWorker(worker.id)}
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

      {/* Archived Workers */}
      {archivedWorkers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Archive className="w-5 h-5" />
              Archived Workers ({archivedWorkers.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {archivedWorkers.map((worker) => (
                <div
                  key={worker.id}
                  className="flex items-center justify-between p-4 border rounded-lg bg-muted/30 opacity-60"
                >
                  <div className="flex items-center gap-3">
                    <Archive className="w-5 h-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium">{worker.name}</p>
                      <Badge variant="secondary" className="text-xs">Archived</Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleWorkerStatus(worker)}
                    >
                      <CheckCircle className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteWorker(worker.id)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={closeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingWorker ? 'Edit Worker' : 'Add Worker'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="worker-name">Worker Name *</Label>
              <Input
                id="worker-name"
                value={workerName}
                onChange={(e) => setWorkerName(e.target.value)}
                placeholder="e.g., John Smith"
                autoFocus
              />
            </div>

            <div className="flex gap-2 justify-end pt-4 border-t">
              <Button variant="outline" onClick={closeDialog} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={saveWorker} disabled={saving || !workerName.trim()}>
                {saving ? 'Saving...' : editingWorker ? 'Update' : 'Add Worker'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
