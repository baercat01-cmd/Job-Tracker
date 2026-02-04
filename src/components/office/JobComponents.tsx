import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import { ListChecks, Plus, Trash2, ToggleLeft, ToggleRight, Layers, Edit, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import type { Job, Component, JobComponent as JobComponentType } from '@/types';



interface JobComponentsProps {
  job: Job;
  onUpdate: () => void;
}

export function JobComponents({ job, onUpdate }: JobComponentsProps) {
  const { profile } = useAuth();
  const isOffice = profile?.role === 'office';
  
  const [globalComponents, setGlobalComponents] = useState<Component[]>([]);
  const [showManageDialog, setShowManageDialog] = useState(false);
  const [showCreateGlobal, setShowCreateGlobal] = useState(false);
  const [newComponentName, setNewComponentName] = useState('');
  const [newComponentDescription, setNewComponentDescription] = useState('');
  const [selectedComponents, setSelectedComponents] = useState<string[]>([]);
  const [removingComponent, setRemovingComponent] = useState<string | null>(null);
  const [editingComponent, setEditingComponent] = useState<Component | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [deletingComponent, setDeletingComponent] = useState<Component | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [componentUsageInfo, setComponentUsageInfo] = useState<{
    timeEntries: number;
    completedTasks: number;
    photos: number;
    jobs: number;
  } | null>(null);

  const jobComponents: JobComponentType[] = Array.isArray(job.components) ? job.components : [];

  useEffect(() => {
    if (showManageDialog) {
      loadGlobalComponents();
      // Pre-select existing components
      setSelectedComponents(jobComponents.map(c => c.id));
    }
  }, [showManageDialog]);

  async function loadGlobalComponents() {
    try {
      const { data, error } = await supabase
        .from('components')
        .select('*')
        .eq('archived', false)
        .order('name');

      if (error) throw error;
      setGlobalComponents(data || []);
    } catch (error: any) {
      console.error('Error loading global components:', error);
      toast.error('Failed to load components');
    }
  }

  async function createGlobalComponent() {
    if (!isOffice) {
      toast.error('Only office staff can create components');
      return;
    }

    if (!newComponentName.trim()) {
      toast.error('Please enter a component name');
      return;
    }

    try {
      const { data, error } = await supabase
        .from('components')
        .insert({
          name: newComponentName.trim(),
          description: newComponentDescription.trim() || null,
          archived: false,
          created_by: profile.id,
        })
        .select()
        .single();

      if (error) throw error;

      toast.success('Component created');
      setNewComponentName('');
      setNewComponentDescription('');
      setShowCreateGlobal(false);
      loadGlobalComponents();
    } catch (error: any) {
      toast.error('Failed to create component');
      console.error(error);
    }
  }

  function openEditDialog(component: Component) {
    setEditingComponent(component);
    setEditName(component.name);
    setEditDescription(component.description || '');
  }

  async function saveComponentEdit() {
    if (!editingComponent || !editName.trim()) {
      toast.error('Component name is required');
      return;
    }

    try {
      const { error } = await supabase
        .from('components')
        .update({
          name: editName.trim(),
          description: editDescription.trim() || null,
        })
        .eq('id', editingComponent.id);

      if (error) throw error;

      toast.success('Component updated');
      setEditingComponent(null);
      loadGlobalComponents();
      onUpdate(); // Refresh job data
    } catch (error: any) {
      toast.error('Failed to update component');
      console.error(error);
    }
  }

  async function initiateDelete(component: Component) {
    try {
      // Check if component is used in time entries
      const { data: timeEntries, error: timeError } = await supabase
        .from('time_entries')
        .select('id, job_id')
        .eq('component_id', component.id);

      if (timeError) throw timeError;

      // Check if component is used in completed tasks
      const { data: completedTasks, error: tasksError } = await supabase
        .from('completed_tasks')
        .select('id, job_id')
        .eq('component_id', component.id);

      if (tasksError) throw tasksError;

      // Check if component has photos
      const { data: photos, error: photosError } = await supabase
        .from('photos')
        .select('id, job_id')
        .eq('component_id', component.id);

      if (photosError) throw photosError;

      // Count unique jobs
      const allJobIds = new Set([
        ...(timeEntries?.map(e => e.job_id) || []),
        ...(completedTasks?.map(t => t.job_id) || []),
        ...(photos?.map(p => p.job_id) || [])
      ]);

      setComponentUsageInfo({
        timeEntries: timeEntries?.length || 0,
        completedTasks: completedTasks?.length || 0,
        photos: photos?.length || 0,
        jobs: allJobIds.size
      });

      setDeletingComponent(component);
      setDeleteConfirmation('');
    } catch (error: any) {
      toast.error('Failed to check component usage');
      console.error(error);
    }
  }

  async function confirmDelete() {
    if (!deletingComponent || deleteConfirmation !== deletingComponent.name) {
      toast.error('Please type the component name to confirm');
      return;
    }

    try {
      const { error } = await supabase
        .from('components')
        .delete()
        .eq('id', deletingComponent.id);

      if (error) throw error;

      toast.success('Component permanently deleted');
      setDeletingComponent(null);
      setDeleteConfirmation('');
      setComponentUsageInfo(null);
      loadGlobalComponents();
      onUpdate(); // Refresh job data
    } catch (error: any) {
      toast.error('Failed to delete component');
      console.error(error);
    }
  }

  function cancelDelete() {
    setDeletingComponent(null);
    setDeleteConfirmation('');
    setComponentUsageInfo(null);
  }

  async function saveJobComponents() {
    if (!isOffice) return;

    try {
      // Build job components array from selected global components
      const updatedComponents: JobComponentType[] = selectedComponents.map(compId => {
        const existing = jobComponents.find(c => c.id === compId);
        const global = globalComponents.find(c => c.id === compId);
        
        // @ts-ignore
        return existing || {
          id: compId,
          name: global?.name || '',
          // @ts-ignore
          isActive: true,
          // @ts-ignore
          isTask: false,
          // @ts-ignore
          createdAt: new Date().toISOString(),
        };
      });

      console.log('Saving job components:', updatedComponents);

      const { error } = await supabase
        .from('jobs')
        .update({
          components: updatedComponents,
          updated_at: new Date().toISOString(),
        })
        .eq('id', job.id);

      if (error) {
        console.error('Save error:', error);
        throw error;
      }

      toast.success(`${updatedComponents.length} component${updatedComponents.length !== 1 ? 's' : ''} assigned to job`);
      setShowManageDialog(false);
      onUpdate();
    } catch (error: any) {
      toast.error('Failed to update components: ' + (error.message || 'Unknown error'));
      console.error('Save components error:', error);
    }
  }

  async function toggleComponentActive(componentId: string) {
    if (!isOffice) return;

    try {
      // @ts-ignore
      const updatedComponents = jobComponents.map(comp =>
        comp.id === componentId
          // @ts-ignore
          ? { ...comp, isActive: !comp.isActive }
          : comp
      );

      const { error } = await supabase
        .from('jobs')
        .update({
          components: updatedComponents,
          updated_at: new Date().toISOString(),
        })
        .eq('id', job.id);

      if (error) throw error;

      toast.success('Component status updated');
      onUpdate();
    } catch (error: any) {
      toast.error('Failed to update component');
      console.error(error);
    }
  }

  async function toggleComponentTask(componentId: string) {
    if (!isOffice) return;

    try {
      const component = jobComponents.find(c => c.id === componentId);
      if (!component) return;

      // @ts-ignore
      const updatedComponents = jobComponents.map(comp =>
        comp.id === componentId
          // @ts-ignore
          ? { ...comp, isTask: !comp.isTask }
          : comp
      );

      const { error } = await supabase
        .from('jobs')
        .update({
          components: updatedComponents,
          updated_at: new Date().toISOString(),
        })
        .eq('id', job.id);

      if (error) throw error;

      toast.success(component.isTask ? 'Removed from tasks' : 'Marked as task for crew');
      onUpdate();
    } catch (error: any) {
      toast.error('Failed to update task status');
      console.error(error);
    }
  }

  async function removeComponent(componentId: string) {
    if (!isOffice) return;

    try {
      const updatedComponents = jobComponents.filter(c => c.id !== componentId);

      const { error } = await supabase
        .from('jobs')
        .update({
          components: updatedComponents,
          updated_at: new Date().toISOString(),
        })
        .eq('id', job.id);

      if (error) throw error;

      toast.success('Component removed from job');
      setRemovingComponent(null);
      onUpdate();
    } catch (error: any) {
      toast.error('Failed to remove component');
      console.error(error);
    }
  }

  function toggleSelection(componentId: string) {
    setSelectedComponents(prev =>
      prev.includes(componentId)
        ? prev.filter(id => id !== componentId)
        : [...prev, componentId]
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold flex items-center gap-2">
          <Layers className="w-4 h-4" />
          Job Components
        </h3>
        {isOffice && (
          <div className="flex gap-2">
            <Button onClick={() => setShowManageDialog(true)} size="sm" variant="outline">
              <Plus className="w-4 h-4 mr-2" />
              Add Components
            </Button>
          </div>
        )}
      </div>

      {jobComponents.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <Layers className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>No components assigned</p>
            {isOffice && <p className="text-sm mt-1">Add components to track time for different work categories</p>}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-2">
          {jobComponents.map((component) => (
            <Card key={component.id} className={component.isTask ? 'border-2 border-primary/40 bg-primary/5' : ''}>
              <CardContent className="py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${component.isActive ? 'bg-success' : 'bg-muted-foreground'}`} />
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{component.name}</p>
                        {component.isTask && (
                          <Badge variant="default" className="text-xs bg-primary">
                            Task
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Added {new Date(component.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={component.isActive ? 'default' : 'secondary'}>
                      {component.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                    {isOffice && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleComponentTask(component.id)}
                          className={component.isTask ? 'text-primary' : ''}
                          title={component.isTask ? 'Remove from tasks' : 'Mark as task for crew'}
                        >
                          <ListChecks className={`w-4 h-4 ${component.isTask ? 'text-primary' : 'text-muted-foreground'}`} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleComponentActive(component.id)}
                        >
                          {component.isActive ? (
                            <ToggleRight className="w-4 h-4 text-success" />
                          ) : (
                            <ToggleLeft className="w-4 h-4 text-muted-foreground" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setRemovingComponent(component.id)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Manage Components Dialog */}
      <Dialog open={showManageDialog} onOpenChange={setShowManageDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Components to Job</DialogTitle>
            <DialogDescription>
              Select existing components or create new ones to assign to this job
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-3 border-b">
              <p className="text-sm font-medium">
                {selectedComponents.length} of {globalComponents.length} selected
              </p>
              <Button size="sm" variant="default" onClick={() => setShowCreateGlobal(true)}>
                <Plus className="w-3 h-3 mr-2" />
                Create New Component
              </Button>
            </div>

            {globalComponents.length === 0 ? (
              <Alert>
                <Layers className="w-4 h-4" />
                <AlertTitle>No components available</AlertTitle>
                <AlertDescription>
                  Create your first component to start tracking work categories for this job.
                  <div className="mt-3">
                    <Button size="sm" onClick={() => setShowCreateGlobal(true)}>
                      <Plus className="w-3 h-3 mr-2" />
                      Create First Component
                    </Button>
                  </div>
                </AlertDescription>
              </Alert>
            ) : (
              <div className="space-y-2">
                {globalComponents.map((component) => (
                  <div
                    key={component.id}
                    className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-muted/50"
                  >
                    <Checkbox
                      checked={selectedComponents.includes(component.id)}
                      onCheckedChange={() => toggleSelection(component.id)}
                    />
                    <div
                      className="flex-1 cursor-pointer"
                      onClick={() => toggleSelection(component.id)}
                    >
                      <p className="font-medium">{component.name}</p>
                      {component.description && (
                        <p className="text-sm text-muted-foreground">{component.description}</p>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          openEditDialog(component);
                        }}
                        className="h-8 w-8 p-0"
                      >
                        <Edit className="w-3 h-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          initiateDelete(component);
                        }}
                        className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2 justify-end pt-4 border-t">
              <Button variant="outline" onClick={() => setShowManageDialog(false)}>
                Cancel
              </Button>
              <Button 
                onClick={saveJobComponents}
                disabled={selectedComponents.length === 0}
              >
                Save {selectedComponents.length > 0 ? `(${selectedComponents.length})` : ''}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Global Component Dialog */}
      <Dialog open={showCreateGlobal} onOpenChange={setShowCreateGlobal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Component</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="component-name">Component Name *</Label>
                <Input
                  id="component-name"
                  value={newComponentName}
                  onChange={(e) => setNewComponentName(e.target.value)}
                  placeholder="e.g., Post Setting, Wall Framing, Roof Steel"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) createGlobalComponent();
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="component-description">Description</Label>
                <Textarea
                  id="component-description"
                  value={newComponentDescription}
                  onChange={(e) => setNewComponentDescription(e.target.value)}
                  placeholder="Optional description"
                  rows={2}
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowCreateGlobal(false)}>
                Cancel
              </Button>
              <Button onClick={createGlobalComponent}>Create</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Component Dialog */}
      <Dialog open={!!editingComponent} onOpenChange={() => setEditingComponent(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Component</DialogTitle>
            <DialogDescription>
              Update the name and description for this component
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Component Name *</Label>
              <Input
                id="edit-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="e.g., Post Setting"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                id="edit-description"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Optional description"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setEditingComponent(null)}
            >
              Cancel
            </Button>
            <Button 
              onClick={saveComponentEdit}
              disabled={!editName.trim()}
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Component Confirmation Dialog */}
      <Dialog open={!!deletingComponent} onOpenChange={() => cancelDelete()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Permanently Delete Component?
            </DialogTitle>
            <DialogDescription>
              This action cannot be undone. This will permanently delete the component from the global library.
            </DialogDescription>
          </DialogHeader>
          
          {componentUsageInfo && (componentUsageInfo.timeEntries > 0 || componentUsageInfo.completedTasks > 0 || componentUsageInfo.photos > 0) && (
            <Alert variant="destructive" className="border-2">
              <AlertTriangle className="h-5 w-5" />
              <AlertTitle className="font-bold">Warning: Component is in use!</AlertTitle>
              <AlertDescription className="mt-2 space-y-1">
                <p className="font-semibold">This component is being used in:</p>
                <ul className="list-disc list-inside space-y-1 mt-2">
                  {componentUsageInfo.jobs > 0 && (
                    <li><strong>{componentUsageInfo.jobs}</strong> job{componentUsageInfo.jobs !== 1 ? 's' : ''}</li>
                  )}
                  {componentUsageInfo.timeEntries > 0 && (
                    <li><strong>{componentUsageInfo.timeEntries}</strong> time {componentUsageInfo.timeEntries !== 1 ? 'entries' : 'entry'}</li>
                  )}
                  {componentUsageInfo.completedTasks > 0 && (
                    <li><strong>{componentUsageInfo.completedTasks}</strong> completed {componentUsageInfo.completedTasks !== 1 ? 'tasks' : 'task'}</li>
                  )}
                  {componentUsageInfo.photos > 0 && (
                    <li><strong>{componentUsageInfo.photos}</strong> {componentUsageInfo.photos !== 1 ? 'photos' : 'photo'}</li>
                  )}
                </ul>
                <p className="mt-3 text-sm font-semibold text-destructive">
                  ⚠️ Deleting this component will also delete all associated time entries, completed tasks, and photo associations!
                </p>
              </AlertDescription>
            </Alert>
          )}

          {componentUsageInfo && componentUsageInfo.timeEntries === 0 && componentUsageInfo.completedTasks === 0 && componentUsageInfo.photos === 0 && (
            <Alert>
              <AlertDescription>
                This component has not been used in any jobs yet. It is safe to delete.
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="delete-confirmation">
                Type <span className="font-mono font-bold">{deletingComponent?.name}</span> to confirm deletion:
              </Label>
              <Input
                id="delete-confirmation"
                value={deleteConfirmation}
                onChange={(e) => setDeleteConfirmation(e.target.value)}
                placeholder={`Type "${deletingComponent?.name}" here`}
                className="font-mono"
              />
            </div>
          </div>

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={cancelDelete}
            >
              Cancel
            </Button>
            <Button 
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleteConfirmation !== deletingComponent?.name}
            >
              Permanently Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Component from Job Confirmation */}
      <AlertDialog open={!!removingComponent} onOpenChange={() => setRemovingComponent(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Component from Job</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>Are you sure you want to remove this component from this job?</p>
              <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded p-3 text-sm">
                <p className="font-semibold mb-1">📌 Important:</p>
                <ul className="space-y-1 ml-4 list-disc">
                  <li>This only removes the component from THIS job</li>
                  <li>The component will remain in your global component bank</li>
                  <li>Existing time entries will NOT be deleted</li>
                  <li>The component will no longer be available for new entries on this job</li>
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => removingComponent && removeComponent(removingComponent)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove from Job
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
