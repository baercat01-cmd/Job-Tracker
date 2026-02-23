import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Plus, Archive, ArchiveRestore, Trash2, Edit, Download } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { Component } from '@/types';

export function ComponentsManagement() {
  const [components, setComponents] = useState<Component[]>([]);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [editingComponent, setEditingComponent] = useState<Component | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');

  useEffect(() => {
    loadComponents();
  }, []);

  async function loadComponents() {
    const { data, error } = await supabase
      .from('components')
      .select('*')
      .order('name');

    if (error) {
      console.error('Error loading components:', error);
      return;
    }

    setComponents(data || []);
  }

  async function createComponent(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;

    setLoading(true);
    try {
      const { error } = await supabase.from('components').insert({
        name: newName.trim(),
        description: newDescription.trim() || null,
      });

      if (error) throw error;

      toast.success('Component created');
      setNewName('');
      setNewDescription('');
      loadComponents();
    } catch (error: any) {
      toast.error('Failed to create component');
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  async function archiveComponent(id: string) {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('components')
        .update({ archived: true })
        .eq('id', id);

      if (error) throw error;

      toast.success('Component archived');
      loadComponents();
    } catch (error: any) {
      toast.error('Failed to archive component');
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  async function restoreComponent(id: string) {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('components')
        .update({ archived: false })
        .eq('id', id);

      if (error) throw error;

      toast.success('Component restored');
      loadComponents();
    } catch (error: any) {
      toast.error('Failed to restore component');
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  async function deleteComponent(id: string) {
    if (!confirm('Are you sure you want to permanently delete this component?')) {
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from('components')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success('Component deleted');
      loadComponents();
    } catch (error: any) {
      toast.error('Failed to delete component');
      console.error(error);
    } finally {
      setLoading(false);
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

    setLoading(true);
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
      loadComponents();
    } catch (error: any) {
      toast.error('Failed to update component');
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  async function exportComponentData(component: Component) {
    setLoading(true);
    try {
      // Fetch all time entries for this component
      const { data: timeEntries, error: timeError } = await supabase
        .from('time_entries')
        .select(`
          *,
          jobs(name, client_name, address),
          user_profiles(username)
        `)
        .eq('component_id', component.id)
        .order('start_time', { ascending: false });

      if (timeError) throw timeError;

      // Fetch all completed tasks for this component
      const { data: completedTasks, error: tasksError } = await supabase
        .from('completed_tasks')
        .select(`
          *,
          jobs(name, client_name, address),
          user_profiles(username)
        `)
        .eq('component_id', component.id)
        .order('completed_date', { ascending: false });

      if (tasksError) throw tasksError;

      // Fetch photos tagged to this component
      const { data: photos, error: photosError } = await supabase
        .from('photos')
        .select(`
          *,
          jobs(name, client_name, address),
          user_profiles(username)
        `)
        .eq('component_id', component.id)
        .order('photo_date', { ascending: false });

      if (photosError) throw photosError;

      // Calculate totals
      const totalHours = timeEntries?.reduce((sum, entry) => sum + (entry.total_hours || 0), 0) || 0;
      const totalCrewHours = timeEntries?.reduce((sum, entry) => sum + ((entry.total_hours || 0) * (entry.crew_count || 1)), 0) || 0;
      const jobsWorked = new Set(timeEntries?.map(e => e.job_id)).size;

      // Generate markdown report
      let markdown = `# Component Data Export: ${component.name}\n\n`;
      markdown += `**Export Date:** ${new Date().toLocaleDateString()}\n\n`;
      markdown += `**Description:** ${component.description || 'No description'}\n\n`;
      markdown += `---\n\n`;

      // Summary
      markdown += `## Summary\n\n`;
      markdown += `- **Total Time Entries:** ${timeEntries?.length || 0}\n`;
      markdown += `- **Total Hours Logged:** ${totalHours.toFixed(2)} hours\n`;
      markdown += `- **Total Crew Hours:** ${totalCrewHours.toFixed(2)} hours\n`;
      markdown += `- **Jobs Worked On:** ${jobsWorked}\n`;
      markdown += `- **Completed Tasks:** ${completedTasks?.length || 0}\n`;
      markdown += `- **Photos:** ${photos?.length || 0}\n\n`;

      // Time Entries by Job
      if (timeEntries && timeEntries.length > 0) {
        markdown += `## Time Entries by Job\n\n`;
        const entriesByJob = new Map<string, any[]>();
        timeEntries.forEach(entry => {
          const jobName = entry.jobs?.name || 'Unknown Job';
          if (!entriesByJob.has(jobName)) {
            entriesByJob.set(jobName, []);
          }
          entriesByJob.get(jobName)!.push(entry);
        });

        entriesByJob.forEach((entries, jobName) => {
          const jobHours = entries.reduce((sum, e) => sum + (e.total_hours || 0), 0);
          markdown += `### ${jobName}\n\n`;
          markdown += `**Total Hours:** ${jobHours.toFixed(2)}\n\n`;
          markdown += `| Date | Worker | Hours | Crew | Method | Notes |\n`;
          markdown += `|------|--------|-------|------|--------|-------|\n`;
          entries.forEach(entry => {
            const date = new Date(entry.start_time).toLocaleDateString();
            const worker = entry.user_profiles?.username || 'Unknown';
            const hours = (entry.total_hours || 0).toFixed(2);
            const crew = entry.crew_count || 1;
            const method = entry.is_manual ? 'Manual' : 'Timer';
            const notes = entry.notes ? entry.notes.replace(/\n/g, ' ') : '-';
            markdown += `| ${date} | ${worker} | ${hours} | ${crew} | ${method} | ${notes} |\n`;
          });
          markdown += `\n`;
        });
      }

      // Completed Tasks
      if (completedTasks && completedTasks.length > 0) {
        markdown += `## Completed Tasks\n\n`;
        markdown += `| Date | Job | Marked By | Notes |\n`;
        markdown += `|------|-----|-----------|-------|\n`;
        completedTasks.forEach(task => {
          const date = new Date(task.completed_date).toLocaleDateString();
          const job = task.jobs?.name || 'Unknown';
          const markedBy = task.user_profiles?.username || 'Unknown';
          const notes = task.notes ? task.notes.replace(/\n/g, ' ') : '-';
          markdown += `| ${date} | ${job} | ${markedBy} | ${notes} |\n`;
        });
        markdown += `\n`;
      }

      // Photos
      if (photos && photos.length > 0) {
        markdown += `## Photos\n\n`;
        markdown += `| Date | Job | Uploaded By | Caption | GPS |\n`;
        markdown += `|------|-----|-------------|---------|-----|\n`;
        photos.forEach(photo => {
          const date = new Date(photo.photo_date).toLocaleDateString();
          const job = photo.jobs?.name || 'Unknown';
          const uploader = photo.user_profiles?.username || 'Unknown';
          const caption = photo.caption || '-';
          const gps = photo.gps_lat && photo.gps_lng ? `${photo.gps_lat}, ${photo.gps_lng}` : '-';
          markdown += `| ${date} | ${job} | ${uploader} | ${caption} | ${gps} |\n`;
        });
        markdown += `\n`;
      }

      markdown += `---\n\n`;
      markdown += `*Report generated by FieldTrack Pro*\n`;

      // Download the file
      const blob = new Blob([markdown], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `component-${component.name.replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success('Component data exported');
    } catch (error: any) {
      toast.error('Failed to export component data');
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  const activeComponents = components.filter(c => !c.archived);
  const archivedComponents = components.filter(c => c.archived);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Components Management</h2>
        <p className="text-muted-foreground">
          Configure work categories for crew time tracking
        </p>
      </div>

      {/* Create New Component */}
      <Card>
        <CardHeader>
          <CardTitle>Create New Component</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={createComponent} className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="new-name">Component Name *</Label>
                <Input
                  id="new-name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g., Post Setting"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-description">Description</Label>
                <Input
                  id="new-description"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Optional description"
                />
              </div>
            </div>
            <Button type="submit" disabled={loading}>
              <Plus className="w-4 h-4 mr-2" />
              Add Component
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Active Components */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Active Components ({activeComponents.length})</CardTitle>
          {archivedComponents.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowArchived(!showArchived)}
            >
              {showArchived ? 'Hide' : 'Show'} Archived ({archivedComponents.length})
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {activeComponents.length === 0 ? (
            <p className="text-center text-muted-foreground py-4">
              No active components. Create your first one above.
            </p>
          ) : (
            <div className="space-y-3">
              {activeComponents.map((component) => (
                <div key={component.id} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <h3 className="font-semibold">{component.name}</h3>
                      {component.description && (
                        <p className="text-sm text-muted-foreground mt-1">{component.description}</p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEditDialog(component)}
                        disabled={loading}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => exportComponentData(component)}
                        disabled={loading}
                      >
                        <Download className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => archiveComponent(component.id)}
                        disabled={loading}
                      >
                        <Archive className="w-4 h-4 mr-2" />
                        Archive
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Archived Components */}
      {showArchived && archivedComponents.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Archive className="w-5 h-5" />
              Archived Components
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {archivedComponents.map((component) => (
                <div key={component.id} className="border rounded-lg p-4 bg-muted/30">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <h3 className="font-semibold">{component.name}</h3>
                      {component.description && (
                        <p className="text-sm text-muted-foreground mt-1">{component.description}</p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => restoreComponent(component.id)}
                        disabled={loading}
                      >
                        <ArchiveRestore className="w-4 h-4 mr-2" />
                        Restore
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => deleteComponent(component.id)}
                        disabled={loading}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Edit Component Dialog */}
      <Dialog open={!!editingComponent} onOpenChange={() => setEditingComponent(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Component</DialogTitle>
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
            <div className="flex justify-end gap-2">
              <Button 
                variant="outline" 
                onClick={() => setEditingComponent(null)}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button 
                onClick={saveComponentEdit}
                disabled={loading || !editName.trim()}
              >
                {loading ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
