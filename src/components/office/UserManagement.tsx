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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Users, UserPlus, Edit, Trash2, Shield, Briefcase, Package, DollarSign, HardHat, Truck, Copy } from 'lucide-react';
import { toast } from 'sonner';
import type { UserProfile, UserRole } from '@/types';
import { useDriverRoleFixSql } from '@/hooks/useDriverRoleFixSql';
import { formatPostgrestError } from '@/lib/formatPostgrestError';

export function UserManagement() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  
  const [formUsername, setFormUsername] = useState('');
  const [formRole, setFormRole] = useState<UserRole>('crew');
  const [saving, setSaving] = useState(false);
  const [driverFixHint, setDriverFixHint] = useState(false);
  const { sql: driverFixSql } = useDriverRoleFixSql(driverFixHint);

  useEffect(() => {
    loadUsers();
  }, []);

  async function loadUsers() {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .order('username');

      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      console.error('Error loading users:', error);
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  }

  function openAddDialog() {
    setEditingUser(null);
    setFormUsername('');
    setFormRole('crew');
    setDriverFixHint(false);
    setShowDialog(true);
  }

  function openEditDialog(user: UserProfile) {
    setEditingUser(user);
    setFormUsername(user.username || '');
    setFormRole(user.role);
    setDriverFixHint(false);
    setShowDialog(true);
  }

  async function handleSave() {
    if (!formUsername.trim()) {
      toast.error('Name is required');
      return;
    }

    setSaving(true);

    try {
      if (editingUser) {
        // Update existing user
        const { error } = await supabase
          .from('user_profiles')
          .update({
            username: formUsername.trim(),
            role: formRole as any,
          })
          .eq('id', editingUser.id);

        if (error) throw error;
        toast.success('User updated successfully');
      } else {
        // Insert new user - id will auto-generate
        const { error } = await supabase
          .from('user_profiles')
          .insert({
            username: formUsername.trim(),
            email: '',
            role: formRole as any,
          });

        if (error) {
          console.error('Error saving user:', JSON.stringify(error));
          throw error;
        }
        toast.success('User added successfully');
      }

      setDriverFixHint(false);
      setShowDialog(false);
      loadUsers();
    } catch (error: any) {
      console.error('Error saving user:', error);
      const msg = formatPostgrestError(error);
      const code = typeof error === 'object' && error && 'code' in error ? String((error as { code?: string }).code) : '';
      const driverBlocked =
        formRole === 'driver' &&
        (code === '23514' ||
          (typeof msg === 'string' &&
            (msg.includes('user_profiles_role_check') ||
              msg.includes('violates check constraint') ||
              msg.includes('role_check'))));
      if (driverBlocked) {
        setDriverFixHint(true);
        let dbHost = '';
        try {
          const u = import.meta.env.VITE_SUPABASE_URL;
          if (u) dbHost = new URL(u).hostname;
        } catch {
          /* ignore */
        }
        const onspace =
          dbHost.includes('onspace.ai') || dbHost.includes('onspace')
            ? '\n\nOnSpace: run the SQL in this environment’s database console (the project tied to this API host). A generic supabase.com SQL editor will not fix a different database.'
            : '';
        toast.error('Could not save Driver — run the bundled SQL in your project’s SQL console, then try again.', {
          description: `${msg}${dbHost ? `\n\nApp is using API host: ${dbHost}` : ''}${onspace}\n\nIf that host does not match where you ran the SQL, fix VITE_SUPABASE_URL and restart.`,
          duration: 22_000,
        });
      } else if (code === '23505' || msg.toLowerCase().includes('duplicate') || msg.toLowerCase().includes('unique')) {
        toast.error(`${msg} — Edit the existing user instead of creating a new one.`, { duration: 10_000 });
      } else {
        toast.error(msg, { duration: 10_000 });
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(userId: string) {
    if (!confirm('Are you sure you want to delete this user?')) return;

    try {
      const { error } = await supabase
        .from('user_profiles')
        .delete()
        .eq('id', userId);

      if (error) throw error;
      toast.success('User deleted successfully');
      loadUsers();
    } catch (error: any) {
      console.error('Error deleting user:', error);
      toast.error('Failed to delete user');
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading users...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2 md:text-2xl">
            <Users className="w-6 h-6 shrink-0" />
            User Management
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Add and manage field crew and office staff
          </p>
        </div>
        <Button onClick={openAddDialog} className="gradient-primary w-full md:w-auto min-h-[44px] md:min-h-0">
          <UserPlus className="w-4 h-4 mr-2" />
          Add User
        </Button>
      </div>

      <div className="grid gap-3">
        {users.map((user) => (
          <Card key={user.id}>
            <CardContent className="p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-4">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-12 h-12 shrink-0 rounded-full bg-primary/10 flex items-center justify-center">
                    {user.role === 'office' ? (
                      <Shield className="w-6 h-6 text-primary" />
                    ) : user.role === 'shop' ? (
                      <Package className="w-6 h-6 text-purple-600" />
                    ) : user.role === 'payroll' ? (
                      <DollarSign className="w-6 h-6 text-green-600" />
                    ) : user.role === 'driver' ? (
                      <Truck className="w-6 h-6 text-amber-800" />
                    ) : user.role === 'foreman' ? (
                      <HardHat className="w-6 h-6 text-amber-700" />
                    ) : (
                      <Briefcase className="w-6 h-6 text-primary" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{user.username || 'Unnamed User'}</p>
                    <p className="text-sm text-muted-foreground capitalize">
                      {user.role === 'crew' ? 'Field Crew' : 
                       user.role === 'foreman' ? 'Foreman' : 
                       user.role === 'office' ? 'Office Staff' : 
                       user.role === 'shop' ? 'Shop User' : 
                       user.role === 'payroll' ? 'Payroll' : 
                       user.role === 'driver' ? 'Fleet driver' : user.role}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Badge variant={user.role === 'office' ? 'default' : 'secondary'} 
                    className={
                      user.role === 'shop' ? 'bg-purple-100 text-purple-700 border-purple-300' : 
                      user.role === 'payroll' ? 'bg-green-100 text-green-700 border-green-300' : 
                      user.role === 'foreman' ? 'bg-amber-100 text-amber-900 border-amber-300' : 
                      user.role === 'driver' ? 'bg-yellow-100 text-yellow-900 border-yellow-400' : ''
                    }>
                    {user.role === 'crew' ? 'Crew' : 
                     user.role === 'foreman' ? 'Foreman' : 
                     user.role === 'office' ? 'Office' : 
                     user.role === 'shop' ? 'Shop' : 
                     user.role === 'payroll' ? 'Payroll' : 
                     user.role === 'driver' ? 'Driver' : user.role}
                  </Badge>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openEditDialog(user)}
                      className="min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 p-0 md:px-3"
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(user.id)}
                      className="text-destructive hover:bg-destructive/10 min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 p-0 md:px-3"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog
        open={showDialog}
        onOpenChange={(open) => {
          setShowDialog(open);
          if (!open) setDriverFixHint(false);
        }}
      >
        <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingUser ? 'Edit User' : 'Add New User'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Full Name *</Label>
              <Input
                id="username"
                value={formUsername}
                onChange={(e) => setFormUsername(e.target.value)}
                placeholder="John Doe"
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="role">Role *</Label>
              <Select value={formRole} onValueChange={(v: UserRole) => setFormRole(v)}>
                <SelectTrigger id="role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="crew">Crew (Field Worker)</SelectItem>
                  <SelectItem value="foreman">Foreman</SelectItem>
                  <SelectItem value="office">Office Staff (Admin)</SelectItem>
                  <SelectItem value="shop">Shop (Materials Processing)</SelectItem>
                  <SelectItem value="payroll">Payroll (Time Tracking)</SelectItem>
                  <SelectItem value="driver">Driver (Fleet only)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {driverFixHint && (
              <Alert variant="destructive" className="text-left">
                <AlertTitle>One-time database fix</AlertTitle>
                <AlertDescription className="space-y-2 mt-2">
                  <p className="text-sm">
                    Use <strong>Copy SQL</strong> (from <code className="text-xs">src/sql/user-profiles-driver-complete-fix.sql</code>
                    ). It removes brittle role <strong>CHECK</strong> constraints and adds a <strong>BEFORE INSERT trigger</strong> so{' '}
                    <code className="text-xs">driver</code> is allowed. Run it on the <strong>same Postgres</strong> your app uses (SQL editor,{' '}
                    <code className="text-xs">psql</code> with the connection string, or your host). Confirm trigger{' '}
                    <code className="text-xs">tr_mb_user_profiles_role_bi</code> and <code className="text-xs">driver insert test: SUCCESS</code>. Wait
                    ~60s, then save again.
                  </p>
                  <pre className="text-[11px] leading-snug whitespace-pre-wrap break-all max-h-72 overflow-auto rounded-md bg-muted p-2 border">
                    {driverFixSql ||
                      '(SQL bundle missing — open src/sql/user-profiles-driver-complete-fix.sql in the repo.)'}
                  </pre>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="w-full"
                    disabled={!driverFixSql}
                    onClick={() => {
                      void navigator.clipboard.writeText(driverFixSql);
                      toast.success('SQL copied to clipboard');
                    }}
                  >
                    <Copy className="w-4 h-4 mr-2" />
                    Copy SQL to clipboard
                  </Button>
                </AlertDescription>
              </Alert>
            )}

            <div className="flex gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => setShowDialog(false)}
                disabled={saving}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 gradient-primary"
              >
                {saving ? 'Saving...' : editingUser ? 'Update' : 'Add User'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
