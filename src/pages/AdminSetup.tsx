import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { User, Plus, Pencil, Trash2, ArrowLeft, Shield, Briefcase, DollarSign, Users, Package, Truck, Copy, HardHat } from 'lucide-react';
import { toast } from 'sonner';
import type { UserProfile } from '@/types';
import { useDriverRoleFixSql } from '@/hooks/useDriverRoleFixSql';
import { formatPostgrestError } from '@/lib/formatPostgrestError';

interface AdminSetupProps {
  onBack: () => void;
}

export function AdminSetup({ onBack }: AdminSetupProps) {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [formData, setFormData] = useState({
    username: '',
    role: 'crew' as any,
  });
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
    setDriverFixHint(false);
    setFormData({
      username: '',
      role: 'crew' as any,
    });
    setShowDialog(true);
  }

  function openEditDialog(user: UserProfile) {
    setEditingUser(user);
    setDriverFixHint(false);
    setFormData({
      username: user.username || '',
      role: user.role || 'crew',
    });
    setShowDialog(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!formData.username.trim()) {
      toast.error('Name is required');
      return;
    }

    try {
      if (editingUser) {
        // Update existing user
        const { error } = await supabase
          .from('user_profiles')
          .update({
            username: formData.username.trim(),
            role: formData.role as any,
          })
          .eq('id', editingUser.id);

        if (error) throw error;
        toast.success('User updated successfully');
      } else {
        // Create new user
        const { error } = await supabase
          .from('user_profiles')
          .insert({
            username: formData.username.trim(),
            email: '',
            role: formData.role as any,
          });

        if (error) throw error;
        toast.success('User created successfully');
      }

      setDriverFixHint(false);
      setShowDialog(false);
      loadUsers();
    } catch (error: any) {
      console.error('Error saving user:', error);
      const msg = formatPostgrestError(error);
      const code = typeof error === 'object' && error && 'code' in error ? String((error as { code?: string }).code) : '';
      const driverBlocked =
        formData.role === 'driver' &&
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
        toast.error(`${msg} — Try editing the existing user instead of creating a new one.`, { duration: 10_000 });
      } else {
        toast.error(msg, { duration: 10_000 });
      }
    }
  }

  async function handleDelete(user: UserProfile) {
    if (!confirm(`Delete user "${user.username}"? This cannot be undone.`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('user_profiles')
        .delete()
        .eq('id', user.id);

      if (error) throw error;
      toast.success('User deleted successfully');
      loadUsers();
    } catch (error: any) {
      console.error('Error deleting user:', error);
      toast.error(error.message || 'Failed to delete user');
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 p-4">
      <div className="container mx-auto max-w-4xl">
        <Card className="shadow-xl">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Button variant="ghost" size="sm" onClick={onBack}>
                  <ArrowLeft className="w-4 h-4" />
                </Button>
                <div className="flex justify-center">
                  <img 
                    src="https://cdn-ai.onspace.ai/onspace/files/EvPiYskzE4vCidikEdjr5Z/MB_Logo_Green_192x64_12.9kb.png" 
                    alt="Martin Builder" 
                    className="h-12 w-auto"
                  />
                </div>
              </div>
              <Button onClick={openAddDialog} className="gradient-primary">
                <Plus className="w-4 h-4 mr-2" />
                Add User
              </Button>
            </div>
            <div className="text-center">
              <CardTitle className="text-2xl font-bold">User Management</CardTitle>
              <CardDescription>Add and manage crew members and office staff</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {users.length === 0 ? (
              <div className="text-center py-12">
                <User className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
                <p className="text-lg font-medium mb-2">No users yet</p>
                <p className="text-sm text-muted-foreground mb-6">
                  Get started by adding your first user
                </p>
                <Button onClick={openAddDialog} className="gradient-primary">
                  <Plus className="w-4 h-4 mr-2" />
                  Add First User
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {users.map((user) => (
                  <div
                    key={user.id}
                    className="flex items-center gap-3 p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                      {user.role === 'office' ? (
                        <Shield className="w-6 h-6 text-primary" />
                      ) : user.role === 'payroll' ? (
                        <DollarSign className="w-6 h-6 text-primary" />
                      ) : user.role === 'shop' ? (
                        <Package className="w-6 h-6 text-primary" />
                      ) : user.role === 'driver' ? (
                        <Truck className="w-6 h-6 text-primary" />
                      ) : user.role === 'foreman' ? (
                        <HardHat className="w-6 h-6 text-primary" />
                      ) : (
                        <Briefcase className="w-6 h-6 text-primary" />
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold">{user.username || 'Unnamed User'}</p>
                      <p className="text-sm text-muted-foreground capitalize">
                        {user.role === 'driver'
                          ? 'Fleet driver'
                          : user.role === 'foreman'
                            ? 'Foreman'
                            : user.role === 'payroll'
                            ? 'Payroll Member'
                            : user.role === 'shop'
                              ? 'Shop Member'
                              : user.role === 'office'
                                ? 'Office Member'
                                : `${user.role} Member`}
                      </p>
                    </div>
                    <Badge variant={user.role === 'office' ? 'default' : user.role === 'payroll' ? 'outline' : 'secondary'}>
                      {user.role === 'office'
                        ? 'Office'
                        : user.role === 'payroll'
                          ? 'Payroll'
                          : user.role === 'shop'
                            ? 'Shop'
                            : user.role === 'driver'
                              ? 'Driver'
                              : user.role === 'foreman'
                                ? 'Foreman'
                              : 'Crew'}
                    </Badge>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEditDialog(user)}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(user)}
                        className="text-destructive hover:bg-destructive/10"
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
      </div>

      {/* Add/Edit User Dialog */}
      <Dialog
        open={showDialog}
        onOpenChange={(open) => {
          setShowDialog(open);
          if (!open) setDriverFixHint(false);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingUser ? 'Edit User' : 'Add New User'}
            </DialogTitle>
            <DialogDescription>
              {editingUser
                ? 'Update user name and role'
                : 'Create a new user with name and role'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Full Name *</Label>
              <Input
                id="username"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                placeholder="John Doe"
                required
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="role">Role *</Label>
              <Select
                value={formData.role}
                onValueChange={(value: 'crew' | 'foreman' | 'shop' | 'office' | 'payroll' | 'driver') =>
                  setFormData({ ...formData, role: value })
                }
              >
                <SelectTrigger id="role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="crew">
                    <div className="flex items-center gap-2">
                      <Briefcase className="w-4 h-4" />
                      <span>Crew (Field User)</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="foreman">
                    <div className="flex items-center gap-2">
                      <HardHat className="w-4 h-4" />
                      <span>Foreman</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="shop">
                    <div className="flex items-center gap-2">
                      <Package className="w-4 h-4" />
                      <span>Shop</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="office">
                    <div className="flex items-center gap-2">
                      <Shield className="w-4 h-4" />
                      <span>Office (Admin)</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="payroll">
                    <div className="flex items-center gap-2">
                      <DollarSign className="w-4 h-4" />
                      <span>Payroll</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="driver">
                    <div className="flex items-center gap-2">
                      <Truck className="w-4 h-4" />
                      <span>Driver (Fleet only)</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {formData.role === 'crew'
                  ? 'Crew users can track time, upload photos, and create daily logs'
                  : formData.role === 'foreman'
                    ? 'Foremen use the field app like crew, with crew oversight tools'
                  : formData.role === 'shop'
                  ? 'Shop users can process materials, manage packages, and prepare items for job sites'
                  : formData.role === 'payroll'
                  ? 'Payroll users can view and export time entries for payroll processing'
                  : formData.role === 'driver'
                  ? 'Drivers only see fleet management (all companies) and cannot open jobs, estimator, or office tools'
                  : 'Office users have full access to manage jobs, users, and view all data'}
              </p>
            </div>

            {driverFixHint && (
              <Alert variant="destructive" className="text-left">
                <AlertTitle>One-time database fix</AlertTitle>
                <AlertDescription className="space-y-2 mt-2">
                  <p className="text-sm">
                    Use <strong>Copy SQL</strong> (from <code className="text-xs">src/sql/user-profiles-driver-complete-fix.sql</code>
                    ). It removes brittle role <strong>CHECK</strong> constraints and adds a <strong>BEFORE INSERT trigger</strong> so{' '}
                    <code className="text-xs">driver</code> is allowed. Run it against the <strong>same Postgres database</strong> your app uses (any
                    SQL path works: hosted SQL editor, <code className="text-xs">psql</code> with the project connection string, or ask whoever manages
                    OnSpace to run the file once). After run: Results should show trigger <code className="text-xs">tr_mb_user_profiles_role_bi</code>;
                    Messages should show <code className="text-xs">driver insert test: SUCCESS</code>. Wait ~60s, then <strong>Create User</strong>{' '}
                    again.
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
              <Button type="submit" className="flex-1 gradient-primary">
                {editingUser ? 'Update User' : 'Create User'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowDialog(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
