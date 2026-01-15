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
import { Users, UserPlus, Edit, Trash2, Shield, Briefcase, Package, DollarSign } from 'lucide-react';
import { toast } from 'sonner';
import type { UserProfile } from '@/types';

export function UserManagement() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  
  const [formUsername, setFormUsername] = useState('');
  const [formRole, setFormRole] = useState<'crew' | 'foreman' | 'office' | 'shop' | 'payroll'>('crew');
  const [saving, setSaving] = useState(false);

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
    setShowDialog(true);
  }

  function openEditDialog(user: UserProfile) {
    setEditingUser(user);
    setFormUsername(user.username || '');
    setFormRole(user.role);
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
            role: formRole,
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
            email: null,
            role: formRole,
          });

        if (error) {
          console.error('Error saving user:', JSON.stringify(error));
          throw error;
        }
        toast.success('User added successfully');
      }

      setShowDialog(false);
      loadUsers();
    } catch (error: any) {
      console.error('Error saving user:', error);
      toast.error(error.message || 'Failed to save user');
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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Users className="w-6 h-6" />
            User Management
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Add and manage field crew and office staff
          </p>
        </div>
        <Button onClick={openAddDialog} className="gradient-primary">
          <UserPlus className="w-4 h-4 mr-2" />
          Add User
        </Button>
      </div>

      <div className="grid gap-3">
        {users.map((user) => (
          <Card key={user.id}>
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  {user.role === 'office' ? (
                    <Shield className="w-6 h-6 text-primary" />
                  ) : user.role === 'shop' ? (
                    <Package className="w-6 h-6 text-purple-600" />
                  ) : user.role === 'payroll' ? (
                    <DollarSign className="w-6 h-6 text-green-600" />
                  ) : (
                    <Briefcase className="w-6 h-6 text-primary" />
                  )}
                </div>
                <div className="flex-1">
                  <p className="font-semibold">{user.username || 'Unnamed User'}</p>
                  <p className="text-sm text-muted-foreground capitalize">
                    {user.role === 'crew' ? 'Field Crew' : 
                     user.role === 'foreman' ? 'Foreman' :
                     user.role === 'office' ? 'Office Staff' : 
                     user.role === 'shop' ? 'Shop User' : 
                     user.role === 'payroll' ? 'Payroll' : user.role}
                  </p>
                </div>
                <Badge variant={user.role === 'office' ? 'default' : 'secondary'} 
                  className={
                    user.role === 'foreman' ? 'bg-blue-100 text-blue-700 border-blue-300' :
                    user.role === 'shop' ? 'bg-purple-100 text-purple-700 border-purple-300' : 
                    user.role === 'payroll' ? 'bg-green-100 text-green-700 border-green-300' : ''
                  }>
                  {user.role === 'crew' ? 'Crew' : 
                   user.role === 'foreman' ? 'Foreman' :
                   user.role === 'office' ? 'Office' : 
                   user.role === 'shop' ? 'Shop' : 
                   user.role === 'payroll' ? 'Payroll' : user.role}
                </Badge>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openEditDialog(user)}
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(user.id)}
                    className="text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
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
              <Select value={formRole} onValueChange={(v: any) => setFormRole(v)}>
                <SelectTrigger id="role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="crew">Crew (Field Worker)</SelectItem>
                  <SelectItem value="foreman">Foreman (All Jobs + Components)</SelectItem>
                  <SelectItem value="office">Office Staff (Admin)</SelectItem>
                  <SelectItem value="shop">Shop (Materials Processing)</SelectItem>
                  <SelectItem value="payroll">Payroll (Time Tracking)</SelectItem>
                </SelectContent>
              </Select>
            </div>

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
