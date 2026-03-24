import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Copy, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { insertPortalJobAccess, deletePortalJobAccess } from '@/lib/portalJobAccess';

interface SubcontractorRow {
  id: string;
  name: string;
  company_name: string | null;
  email: string | null;
  active: boolean;
}

interface JobRow {
  id: string;
  name: string;
  client_name: string | null;
}

interface AccessRow {
  id: string;
  portal_user_id: string;
  job_id: string;
  can_view_schedule: boolean;
  can_view_documents: boolean;
  can_view_photos: boolean;
  can_view_financials: boolean;
  can_view_proposal: boolean;
  can_view_materials: boolean;
  can_edit_schedule: boolean;
  notes: string | null;
  jobs?: JobRow | null;
}

function formatSupabaseErr(err: unknown): string {
  const e = err as { message?: string; details?: string; hint?: string };
  const parts = [e.message, e.details, e.hint].filter(Boolean);
  return parts.join(' — ') || 'Request failed';
}

/** Avoid treating generic "permission denied" as RLS — that hides RPC / wrong-project / schema-cache issues. */
function isLikelyPortalJobAccessRls(err: unknown): boolean {
  const code = (err as { code?: string })?.code;
  const msg = String((err as { message?: string })?.message ?? '');
  if (/row-level security|RLS policy|violates row-level/i.test(msg)) return true;
  if (code === '42501' && /row-level security|rls/i.test(msg)) return true;
  return false;
}

export function SubcontractorHubManagement() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [subcontractors, setSubcontractors] = useState<SubcontractorRow[]>([]);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [selectedSubId, setSelectedSubId] = useState('');
  const [accessRows, setAccessRows] = useState<AccessRow[]>([]);
  const [grantOpen, setGrantOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newCompany, setNewCompany] = useState('');
  const [creating, setCreating] = useState(false);

  const [jobIdToGrant, setJobIdToGrant] = useState('');
  const [canViewSchedule, setCanViewSchedule] = useState(true);
  const [canViewDocuments, setCanViewDocuments] = useState(true);
  const [canViewPhotos, setCanViewPhotos] = useState(false);
  const [canViewFinancials, setCanViewFinancials] = useState(false);
  const [canViewProposal, setCanViewProposal] = useState(true);
  const [canViewMaterials, setCanViewMaterials] = useState(true);
  const [canEditSchedule, setCanEditSchedule] = useState(false);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    void loadBase();
  }, []);

  useEffect(() => {
    if (!selectedSubId) {
      setAccessRows([]);
      return;
    }
    void loadAccess(selectedSubId);
  }, [selectedSubId]);

  async function loadBase() {
    setLoading(true);
    try {
      const [{ data: subs, error: subsErr }, { data: jobsData, error: jobsErr }] = await Promise.all([
        supabase.from('subcontractors').select('id,name,company_name,email,active').order('name'),
        supabase.from('jobs').select('id,name,client_name').order('created_at', { ascending: false }),
      ]);
      if (subsErr) throw subsErr;
      if (jobsErr) throw jobsErr;
      setSubcontractors((subs || []) as SubcontractorRow[]);
      setJobs((jobsData || []) as JobRow[]);
      if (!selectedSubId && (subs || []).length > 0) {
        setSelectedSubId(String((subs || [])[0].id));
      }
    } catch (e: any) {
      toast.error(e?.message || 'Failed to load subcontractor hub');
    } finally {
      setLoading(false);
    }
  }

  async function loadAccess(subId: string) {
    try {
      const { data, error } = await supabase
        .from('portal_job_access')
        .select('*, jobs(id,name,client_name)')
        .eq('portal_user_id', subId);
      if (error) throw error;
      setAccessRows((data || []) as AccessRow[]);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to load job access');
    }
  }

  async function copySubLink() {
    if (!selectedSubId) return;
    const url = `${window.location.origin}/subcontractor-portal?sub=${encodeURIComponent(selectedSubId)}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Subcontractor hub link copied');
    } catch {
      toast.error('Could not copy link');
    }
  }

  async function createSubcontractor() {
    const name = newName.trim();
    if (!name) {
      toast.error('Name is required');
      return;
    }
    setCreating(true);
    try {
      const { data, error } = await supabase
        .from('subcontractors')
        .insert({
          name,
          company_name: newCompany.trim() || null,
          email: newEmail.trim() || null,
          active: true,
          trades: [],
          notes: null,
          created_by: profile?.id ?? null,
        })
        .select('id')
        .maybeSingle();
      if (error) throw error;
      toast.success('Subcontractor created');
      setCreateOpen(false);
      setNewName('');
      setNewEmail('');
      setNewCompany('');
      await loadBase();
      if (data?.id) setSelectedSubId(String(data.id));
    } catch (e: any) {
      toast.error(e?.message || 'Failed to create subcontractor');
    } finally {
      setCreating(false);
    }
  }

  const alreadyGrantedJobIds = useMemo(() => new Set(accessRows.map((r) => r.job_id)), [accessRows]);
  const grantableJobs = useMemo(() => jobs.filter((j) => !alreadyGrantedJobIds.has(j.id)), [jobs, alreadyGrantedJobIds]);

  async function grantAccess() {
    if (!selectedSubId || !jobIdToGrant) {
      toast.error('Choose a subcontractor and job');
      return;
    }
    try {
      const payload = {
        portal_user_id: selectedSubId,
        job_id: jobIdToGrant,
        can_view_schedule: canViewSchedule,
        can_view_documents: canViewDocuments,
        can_view_photos: canViewPhotos,
        can_view_financials: canViewFinancials,
        can_view_proposal: canViewProposal,
        can_view_materials: canViewMaterials,
        can_edit_schedule: canEditSchedule,
        notes: notes.trim() || null,
        created_by: profile?.id ?? null,
      };
      const { error } = await insertPortalJobAccess(supabase, payload);
      if (error) throw error;
      toast.success('Access granted');
      setGrantOpen(false);
      setJobIdToGrant('');
      setNotes('');
      await loadAccess(selectedSubId);
    } catch (e: any) {
      const detail = formatSupabaseErr(e);
      if (isLikelyPortalJobAccessRls(e)) {
        toast.error(
          `Could not save job access: ${detail}. Deploy Edge Function portal-job-access (see supabase/functions/portal-job-access/README.md), or run scripts/portal-job-access-emergency-rls-off.sql and NOTIFY pgrst, 'reload schema';.`,
          { duration: 18000 }
        );
      } else {
        toast.error(detail || 'Failed to grant access', { duration: 12000 });
      }
    }
  }

  async function revokeAccess(accessId: string) {
    if (!confirm('Remove access for this job?')) return;
    try {
      const { error } = await deletePortalJobAccess(supabase, accessId);
      if (error) throw error;
      toast.success('Access removed');
      await loadAccess(selectedSubId);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to revoke');
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Subcontractor Hub</CardTitle>
          <CardDescription>
            Manage all subcontractors, all job access, and what they can see from one place.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Select value={selectedSubId} onValueChange={setSelectedSubId}>
            <SelectTrigger className="w-[320px]">
              <SelectValue placeholder="Select subcontractor" />
            </SelectTrigger>
            <SelectContent>
              {subcontractors.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                  {s.company_name ? ` (${s.company_name})` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={copySubLink} disabled={!selectedSubId}>
            <Copy className="w-4 h-4 mr-2" />
            Copy Shared Link
          </Button>
          <Button onClick={() => setGrantOpen(true)} disabled={!selectedSubId}>
            <Plus className="w-4 h-4 mr-2" />
            Grant Job
          </Button>
          <Button variant="outline" onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            New Subcontractor
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Job Visibility</CardTitle>
          <CardDescription>
            This list controls the selected subcontractor globally. You can still tune permissions inside each job.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : !selectedSubId ? (
            <p className="text-sm text-muted-foreground">Select a subcontractor to manage access.</p>
          ) : accessRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No jobs granted yet.</p>
          ) : (
            <div className="space-y-2">
              {accessRows.map((a) => (
                <div key={a.id} className="border rounded p-3 flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{a.jobs?.name || a.job_id}</p>
                    <p className="text-xs text-muted-foreground">{a.jobs?.client_name || ''}</p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {a.can_view_proposal && <Badge variant="outline">Proposal</Badge>}
                      {a.can_view_materials && <Badge variant="outline">Materials</Badge>}
                      {a.can_view_schedule && <Badge variant="outline">Schedule</Badge>}
                      {a.can_view_documents && <Badge variant="outline">Documents</Badge>}
                      {a.can_view_photos && <Badge variant="outline">Photos</Badge>}
                      {a.can_edit_schedule && <Badge variant="secondary">Edit schedule</Badge>}
                    </div>
                  </div>
                  <Button variant="outline" size="sm" className="text-destructive" onClick={() => revokeAccess(a.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create subcontractor</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Full name *</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} />
            </div>
            <div>
              <Label>Company</Label>
              <Input value={newCompany} onChange={(e) => setNewCompany(e.target.value)} />
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={createSubcontractor} disabled={creating}>{creating ? 'Creating...' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={grantOpen} onOpenChange={setGrantOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Grant job access</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Job</Label>
              <Select value={jobIdToGrant} onValueChange={setJobIdToGrant}>
                <SelectTrigger><SelectValue placeholder="Choose job" /></SelectTrigger>
                <SelectContent>
                  {grantableJobs.map((j) => (
                    <SelectItem key={j.id} value={j.id}>
                      {j.name} {j.client_name ? `- ${j.client_name}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="flex items-center justify-between border rounded p-2"><Label>Schedule</Label><Switch checked={canViewSchedule} onCheckedChange={setCanViewSchedule} /></div>
              <div className="flex items-center justify-between border rounded p-2"><Label>Documents</Label><Switch checked={canViewDocuments} onCheckedChange={setCanViewDocuments} /></div>
              <div className="flex items-center justify-between border rounded p-2"><Label>Photos</Label><Switch checked={canViewPhotos} onCheckedChange={setCanViewPhotos} /></div>
              <div className="flex items-center justify-between border rounded p-2"><Label>Financials</Label><Switch checked={canViewFinancials} onCheckedChange={setCanViewFinancials} /></div>
              <div className="flex items-center justify-between border rounded p-2"><Label>Proposal</Label><Switch checked={canViewProposal} onCheckedChange={setCanViewProposal} /></div>
              <div className="flex items-center justify-between border rounded p-2"><Label>Materials</Label><Switch checked={canViewMaterials} onCheckedChange={setCanViewMaterials} /></div>
              <div className="flex items-center justify-between border rounded p-2 sm:col-span-2"><Label>Edit schedule</Label><Switch checked={canEditSchedule} onCheckedChange={setCanEditSchedule} /></div>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGrantOpen(false)}>Cancel</Button>
            <Button onClick={grantAccess} disabled={!jobIdToGrant}>Grant access</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

