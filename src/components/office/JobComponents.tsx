import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import { ListChecks, Plus, Trash2, ToggleLeft, ToggleRight, Layers } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import type { Job, Component } from '@/types';

interface JobComponent {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
}

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
  const [selectedComponents, setSelectedComponents] = useState<string[]>([]);
  const [removingComponent, setRemovingComponent] = useState<string | null>(null);

  const jobComponents: JobComponent[] = Array.isArray(job.components) ? job.components : [];

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
          archived: false,
          created_by: profile.id,
        })
        .select()
        .single();

      if (error) throw error;

      toast.success('Component created');
      setNewComponentName('');
      setShowCreateGlobal(false);
      loadGlobalComponents();
    } catch (error: any) {
      toast.error('Failed to create component');
      console.error(error);
    }
  }

  async function saveJobComponents() {
    if (!isOffice) return;

    try {
      // Build job components array from selected global components
      const updatedComponents: JobComponent[] = selectedComponents.map(compId => {
        const existing = jobComponents.find(c => c.id === compId);
        const global = globalComponents.find(c => c.id === compId);
        
        return existing || {
          id: compId,
          name: global?.name || '',
          isActive: true,
          createdAt: new Date().toISOString(),
        };
      });

      const { error } = await supabase
        .from('jobs')
        .update({
          components: updatedComponents,
          updated_at: new Date().toISOString(),
        })
        .eq('id', job.id);

      if (error) throw error;

      toast.success('Job components updated');
      setShowManageDialog(false);
      onUpdate();
    } catch (error: any) {
      toast.error('Failed to update components');
      console.error(error);
    }
  }

  async function toggleComponentActive(componentId: string) {
    if (!isOffice) return;

    try {
      const updatedComponents = jobComponents.map(comp =>
        comp.id === componentId
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
          <Button onClick={() => setShowManageDialog(true)} size="sm" variant="outline">
            <ListChecks className="w-4 h-4 mr-2" />
            Manage Components
          </Button>
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
            <Card key={component.id}>
              <CardContent className="py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${component.isActive ? 'bg-success' : 'bg-muted-foreground'}`} />
                    <div>
                      <p className="font-medium">{component.name}</p>
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
            <DialogTitle>Manage Job Components</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-3 border-b">
              <p className="text-sm text-muted-foreground">
                Select components to assign to this job
              </p>
              <Button size="sm" variant="outline" onClick={() => setShowCreateGlobal(true)}>
                <Plus className="w-3 h-3 mr-2" />
                New Component
              </Button>
            </div>

            {globalComponents.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                <p>No global components available</p>
                <p className="text-sm mt-1">Create a component to get started</p>
              </div>
            ) : (
              <div className="space-y-2">
                {globalComponents.map((component) => (
                  <div
                    key={component.id}
                    className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-muted/50 cursor-pointer"
                    onClick={() => toggleSelection(component.id)}
                  >
                    <Checkbox
                      checked={selectedComponents.includes(component.id)}
                      onCheckedChange={() => toggleSelection(component.id)}
                    />
                    <div className="flex-1">
                      <p className="font-medium">{component.name}</p>
                      {component.description && (
                        <p className="text-sm text-muted-foreground">{component.description}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2 justify-end pt-4 border-t">
              <Button variant="outline" onClick={() => setShowManageDialog(false)}>
                Cancel
              </Button>
              <Button onClick={saveJobComponents}>
                Save Components
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
            <div className="space-y-2">
              <Label htmlFor="component-name">Component Name</Label>
              <Input
                id="component-name"
                value={newComponentName}
                onChange={(e) => setNewComponentName(e.target.value)}
                placeholder="e.g., Post Setting, Wall Framing, Roof Steel"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') createGlobalComponent();
                }}
              />
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

      {/* Remove Component Confirmation */}
      <AlertDialog open={!!removingComponent} onOpenChange={() => setRemovingComponent(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Component</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove this component from this job? Time entries will not be deleted, but the component will no longer be available for new entries.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => removingComponent && removeComponent(removingComponent)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
