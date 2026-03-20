/**
 * Per-job subcontractor portal: share link + grant/revoke/edit access for this job only.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Copy, Link2, Plus, Trash2, Pencil, Briefcase, Key } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';

interface PortalUserRow {
  id: string;
  user_type: string;
  email: string;
  username: string;
  full_name: string;
  company_name: string | null;
  is_active: boolean;
}

interface JobAccessRow {
  id: string;
  portal_user_id: string;
  job_id: string;
  can_view_schedule: boolean;
  can_view_documents: boolean;
  can_view_photos: boolean;
  can_view_financials: boolean;
  can_view_proposal?: boolean;
  can_view_materials?: boolean;
  can_edit_schedule?: boolean;
  notes: string | null;
  portal_users: PortalUserRow | null;
}

interface SubcontractorPortalJobPanelProps {
  jobId: string;
  jobName?: string;
}

function formatSupabaseError(err: unknown): string {
  const e = err as { message?: string; details?: string; hint?: string; code?: string };
  const parts = [e.message, e.details, e.hint].filter(Boolean);
  return parts.join(' — ') || 'Request failed';
}

export function SubcontractorPortalJobPanel({ jobId, jobName }: SubcontractorPortalJobPanelProps) {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [accessRows, setAccessRows] = useState<JobAccessRow[]>([]);
  const [allSubUsers, setAllSubUsers] = useState<PortalUserRow[]>([]);

  const [grantOpen, setGrantOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [canViewSchedule, setCanViewSchedule] = useState(true);
  const [canViewDocuments, setCanViewDocuments] = useState(true);
  const [canViewPhotos, setCanViewPhotos] = useState(false);
  const [canViewFinancials, setCanViewFinancials] = useState(false);
  const [canViewProposal, setCanViewProposal] = useState(true);
  const [canViewMaterials, setCanViewMaterials] = useState(true);
  const [canEditSchedule, setCanEditSchedule] = useState(false);
  const [accessNotes, setAccessNotes] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [creating, setCreating] = useState(false);

  const [editRow, setEditRow] = useState<JobAccessRow | null>(null);

  const load = useCallback(async () => {
    if (!jobId) return;
    setLoading(true);
    try {
      const { data: access, error: e1 } = await supabase.from('portal_job_access').select('*').eq('job_id', jobId);
      if (e1) throw e1;
      const userIds = [...new Set((access || []).map((a: { portal_user_id: string }) => a.portal_user_id))];
      let userMap = new Map<string, PortalUserRow>();
      if (userIds.length > 0) {
        const { data: pu, error: ePu } = await supabase
          .from('portal_users')
          .select('id, user_type, email, username, full_name, company_name, is_active')
          .in('id', userIds);
        if (ePu) throw ePu;
        (pu || []).forEach((u: PortalUserRow) => userMap.set(u.id, u));
      }
      const rows: JobAccessRow[] = (access || []).map((a: Record<string, unknown>) => ({
        ...a,
        portal_users: userMap.get(String(a.portal_user_id)) ?? null,
      })) as JobAccessRow[];
      setAccessRows(rows.filter((r) => r.portal_users?.user_type === 'subcontractor'));

      const { data: users, error: e2 } = await supabase
        .from('portal_users')
        .select('id, user_type, email, username, full_name, company_name, is_active')
        .eq('user_type', 'subcontractor')
        .order('created_at', { ascending: false });
      if (e2) throw e2;
      setAllSubUsers((users || []) as PortalUserRow[]);
    } catch (err: unknown) {
      console.error(err);
      toast.error('Could not load subcontractor portal access for this job');
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    load();
  }, [load]);

  const grantedIds = useMemo(() => new Set(accessRows.map((r) => r.portal_user_id)), [accessRows]);
  const availableToGrant = useMemo(
    () => allSubUsers.filter((u) => u.is_active && !grantedIds.has(u.id)),
    [allSubUsers, grantedIds]
  );

  async function copyPortalUrl() {
    const url = `${window.location.origin}/subcontractor-portal`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Subcontractor portal link copied');
    } catch {
      toast.error('Could not copy link');
    }
  }

  async function grantAccess() {
    if (!selectedUserId) {
      toast.error('Select a subcontractor portal user');
      return;
    }
    try {
      const { error } = await supabase.from('portal_job_access').insert([
        {
          portal_user_id: selectedUserId,
          job_id: jobId,
          can_view_schedule: canViewSchedule,
          can_view_documents: canViewDocuments,
          can_view_photos: canViewPhotos,
          can_view_financials: canViewFinancials,
          can_view_proposal: canViewProposal,
          can_view_materials: canViewMaterials,
          can_edit_schedule: canEditSchedule,
          notes: accessNotes || null,
          created_by: profile?.id,
        },
      ]);
      if (error) throw error;
      toast.success('Access granted for this job');
      setGrantOpen(false);
      setSelectedUserId('');
      setAccessNotes('');
      await load();
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message ?? 'Grant failed';
      if (/duplicate|unique/i.test(msg)) {
        toast.error('This user already has access to this job');
      } else {
        toast.error(msg);
      }
    }
  }

  async function createUserAndMaybeGrant() {
    const em = email.trim();
    const un = username.trim();
    const fn = fullName.trim();
    if (!em || !un || !password || !fn) {
      toast.error('Email, username, password, and full name are required');
      return;
    }
    setCreating(true);
    try {
      const payload = {
        user_type: 'subcontractor' as const,
        email: em,
        username: un,
        password_hash: password,
        full_name: fn,
        company_name: companyName.trim() || null,
        created_by: profile?.id ?? null,
      };

      // Avoid .single(): if RLS allows INSERT but blocks RETURNING, PostgREST returns 0 rows and .single() errors.
      const { data: insertedRows, error } = await supabase.from('portal_users').insert([payload]).select('id');
      if (error) {
        console.error('[SubcontractorPortalJobPanel] portal_users insert', error);
        throw error;
      }

      let newId = insertedRows?.[0]?.id as string | undefined;
      if (!newId) {
        const { data: lookup, error: lookupErr } = await supabase
          .from('portal_users')
          .select('id')
          .eq('email', em)
          .eq('user_type', 'subcontractor')
          .maybeSingle();
        if (!lookupErr && lookup?.id) newId = lookup.id;
      }

      if (!newId) {
        await load();
        toast.error(
          'Could not confirm the new user (insert may be blocked or RETURNING hidden by RLS). Run scripts/fix-portal-users-rls.sql in Supabase SQL Editor, then try again.',
          { duration: 14000 }
        );
        return;
      }

      toast.success('Subcontractor portal user created');
      setCreateOpen(false);
      setEmail('');
      setUsername('');
      setPassword('');
      setFullName('');
      setCompanyName('');
      await load();
      setSelectedUserId(newId);
      setGrantOpen(true);
    } catch (err: unknown) {
      console.error('[SubcontractorPortalJobPanel] create user', err);
      const msg = formatSupabaseError(err);
      const isRls =
        /42501|PGRST301|RLS|permission|denied|row-level security/i.test(msg) ||
        (err as { code?: string })?.code === '42501';
      toast.error(
        isRls
          ? `${msg}\n\nRun scripts/fix-portal-users-rls.sql in Supabase SQL Editor (same idea as customer portal RLS fix).`
          : msg,
        { duration: 12000 }
      );
    } finally {
      setCreating(false);
    }
  }

  async function saveEdit() {
    if (!editRow) return;
    try {
      const { error } = await supabase
        .from('portal_job_access')
        .update({
          can_view_schedule: editRow.can_view_schedule,
          can_view_documents: editRow.can_view_documents,
          can_view_photos: editRow.can_view_photos,
          can_view_financials: editRow.can_view_financials,
          can_view_proposal: editRow.can_view_proposal ?? false,
          can_view_materials: editRow.can_view_materials ?? false,
          can_edit_schedule: editRow.can_edit_schedule ?? false,
          notes: editRow.notes,
        })
        .eq('id', editRow.id);
      if (error) throw error;
      toast.success('Access updated');
      setEditRow(null);
      await load();
    } catch (err: unknown) {
      toast.error((err as { message?: string })?.message ?? 'Update failed');
    }
  }

  async function revoke(accessId: string) {
    if (!confirm('Remove this subcontractor’s access to this job?')) return;
    try {
      const { error } = await supabase.from('portal_job_access').delete().eq('id', accessId);
      if (error) throw error;
      toast.success('Access removed');
      await load();
    } catch (err: unknown) {
      toast.error((err as { message?: string })?.message ?? 'Remove failed');
    }
  }

  return (
    <div className="space-y-6">
      <Card className="border-yellow-600/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Link2 className="w-5 h-5" />
            Subcontractor portal link
          </CardTitle>
          <CardDescription>
            Same login page for every sub: they use the email and password you set, and only see jobs you grant
            {jobName ? ` (including ${jobName})` : ''}.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row sm:items-center gap-3">
          <code className="flex-1 text-sm bg-muted px-3 py-2 rounded-md break-all">
            {typeof window !== 'undefined' ? `${window.location.origin}/subcontractor-portal` : '/subcontractor-portal'}
          </code>
          <Button type="button" variant="outline" onClick={copyPortalUrl}>
            <Copy className="w-4 h-4 mr-2" />
            Copy link
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Briefcase className="w-5 h-5" />
              Who can access this job
            </CardTitle>
            <CardDescription>Grant or change portal permissions for this job only.</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)}>
              <Key className="w-4 h-4 mr-1" />
              New user
            </Button>
            <Button size="sm" onClick={() => setGrantOpen(true)} disabled={availableToGrant.length === 0}>
              <Plus className="w-4 h-4 mr-1" />
              Grant access
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : accessRows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              No subcontractor portal access for this job yet. Create a portal user if needed, then grant access.
            </p>
          ) : (
            <div className="space-y-3">
              {accessRows.map((row) => {
                const u = row.portal_users;
                if (!u) return null;
                return (
                  <div
                    key={row.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 border rounded-lg"
                  >
                    <div>
                      <p className="font-medium">{u.full_name}</p>
                      <p className="text-sm text-muted-foreground">{u.email}</p>
                      {u.company_name && <p className="text-xs text-muted-foreground">{u.company_name}</p>}
                      <div className="flex flex-wrap gap-1 mt-2">
                        {row.can_view_proposal && <Badge variant="outline">Proposal</Badge>}
                        {row.can_view_materials && <Badge variant="outline">Materials</Badge>}
                        {row.can_view_schedule && <Badge variant="outline">Schedule</Badge>}
                        {row.can_view_documents && <Badge variant="outline">Documents</Badge>}
                        {row.can_view_photos && <Badge variant="outline">Photos</Badge>}
                        {row.can_view_financials && <Badge variant="outline">Financials</Badge>}
                        {row.can_edit_schedule && <Badge variant="secondary">Edit schedule</Badge>}
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button size="sm" variant="outline" onClick={() => setEditRow({ ...row })}>
                        <Pencil className="w-4 h-4 mr-1" />
                        Edit
                      </Button>
                      <Button size="sm" variant="outline" className="text-destructive" onClick={() => revoke(row.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={grantOpen} onOpenChange={setGrantOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Grant subcontractor access — this job</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Subcontractor portal user</Label>
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose user…" />
                </SelectTrigger>
                <SelectContent>
                  {availableToGrant.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.full_name} ({u.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {availableToGrant.length === 0 && (
                <p className="text-xs text-muted-foreground mt-1">All active subs already have access, or create a new user.</p>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="flex items-center justify-between border rounded p-2">
                <Label className="text-sm">Schedule</Label>
                <Switch checked={canViewSchedule} onCheckedChange={setCanViewSchedule} />
              </div>
              <div className="flex items-center justify-between border rounded p-2">
                <Label className="text-sm">Documents</Label>
                <Switch checked={canViewDocuments} onCheckedChange={setCanViewDocuments} />
              </div>
              <div className="flex items-center justify-between border rounded p-2">
                <Label className="text-sm">Photos</Label>
                <Switch checked={canViewPhotos} onCheckedChange={setCanViewPhotos} />
              </div>
              <div className="flex items-center justify-between border rounded p-2">
                <Label className="text-sm">Financials</Label>
                <Switch checked={canViewFinancials} onCheckedChange={setCanViewFinancials} />
              </div>
              <div className="flex items-center justify-between border rounded p-2">
                <Label className="text-sm">Proposal</Label>
                <Switch checked={canViewProposal} onCheckedChange={setCanViewProposal} />
              </div>
              <div className="flex items-center justify-between border rounded p-2">
                <Label className="text-sm">Material sheets</Label>
                <Switch checked={canViewMaterials} onCheckedChange={setCanViewMaterials} />
              </div>
              <div className="flex items-center justify-between border rounded p-2 sm:col-span-2">
                <Label className="text-sm">Edit schedule</Label>
                <Switch checked={canEditSchedule} onCheckedChange={setCanEditSchedule} />
              </div>
            </div>
            <div>
              <Label>Notes (optional)</Label>
              <Textarea value={accessNotes} onChange={(e) => setAccessNotes(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGrantOpen(false)}>
              Cancel
            </Button>
            <Button onClick={grantAccess} disabled={!selectedUserId}>
              Grant
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New subcontractor portal user</DialogTitle>
            <DialogDescription>
              Creates a login for /subcontractor-portal. If save fails, run scripts/fix-portal-users-rls.sql in Supabase (RLS on portal_users).
            </DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-3 py-2"
            onSubmit={(e) => {
              e.preventDefault();
              e.stopPropagation();
              void createUserAndMaybeGrant();
            }}
          >
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="sub-portal-fullname">Full name *</Label>
                <Input
                  id="sub-portal-fullname"
                  name="fullName"
                  autoComplete="name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="sub-portal-company">Company</Label>
                <Input
                  id="sub-portal-company"
                  name="company"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="sub-portal-email">Email *</Label>
              <Input
                id="sub-portal-email"
                name="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="sub-portal-username">Username *</Label>
              <Input
                id="sub-portal-username"
                name="username"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="sub-portal-password">Password *</Label>
              <Input
                id="sub-portal-password"
                name="password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={creating}>
                {creating ? 'Creating…' : 'Create user'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editRow} onOpenChange={(o) => !o && setEditRow(null)}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit access — {editRow?.portal_users?.full_name}</DialogTitle>
          </DialogHeader>
          {editRow && (
            <div className="space-y-3 py-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {(
                  [
                    ['can_view_schedule', 'Schedule'],
                    ['can_view_documents', 'Documents'],
                    ['can_view_photos', 'Photos'],
                    ['can_view_financials', 'Financials'],
                    ['can_view_proposal', 'Proposal'],
                    ['can_view_materials', 'Material sheets'],
                    ['can_edit_schedule', 'Edit schedule'],
                  ] as const
                ).map(([key, label]) => (
                  <div key={key} className="flex items-center justify-between border rounded p-2">
                    <Label className="text-sm">{label}</Label>
                    <Switch
                      checked={!!(editRow as Record<string, unknown>)[key]}
                      onCheckedChange={(v) => setEditRow((r) => (r ? { ...r, [key]: v } : r))}
                    />
                  </div>
                ))}
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea
                  value={editRow.notes ?? ''}
                  onChange={(e) => setEditRow((r) => (r ? { ...r, notes: e.target.value } : r))}
                  rows={2}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditRow(null)}>
              Cancel
            </Button>
            <Button onClick={saveEdit}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
