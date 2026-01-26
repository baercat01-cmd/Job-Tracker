import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useFleetAuth } from '@/stores/fleetAuthStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Trash2, UserPlus } from 'lucide-react';
import { toast } from 'sonner';

interface User {
  id: string;
  username: string;
  created_at: string;
}

export function UserManagementTab() {
  const { user } = useFleetAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    loadUsers();
  }, []);

  async function loadUsers() {
    try {
      const { data, error } = await supabase
        .from('app_users')
        .select('id, username, created_at')
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

  async function handleAddUser(e: React.FormEvent) {
    e.preventDefault();

    if (!newUsername.trim() || !newPassword.trim()) {
      toast.error('Username and password are required');
      return;
    }

    if (newPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    setAdding(true);
    try {
      const { data, error } = await supabase.rpc('create_app_user', {
        p_username: newUsername,
        p_password: newPassword,
        p_created_by: user?.username || 'unknown',
      });

      if (error) {
        if (error.message.includes('duplicate') || error.message.includes('unique')) {
          toast.error('Username already exists');
        } else {
          throw error;
        }
        return;
      }

      toast.success('User created successfully');
      setNewUsername('');
      setNewPassword('');
      loadUsers();
    } catch (error: any) {
      console.error('Error creating user:', error);
      toast.error('Failed to create user');
    } finally {
      setAdding(false);
    }
  }

  async function handleDeleteUser(userId: string, username: string) {
    if (!confirm(`Delete user "${username}"?`)) return;

    try {
      const { error } = await supabase
        .from('app_users')
        .delete()
        .eq('id', userId);

      if (error) throw error;

      toast.success('User deleted');
      loadUsers();
    } catch (error: any) {
      console.error('Error deleting user:', error);
      toast.error('Failed to delete user');
    }
  }

  if (loading) {
    return (
      <div className="py-12 text-center">
        <div className="w-8 h-8 border-4 border-yellow-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
        <p className="text-sm text-slate-600">Loading users...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Add New User</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAddUser} className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Input
                placeholder="Username"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                disabled={adding}
              />
              <Input
                type="password"
                placeholder="Password (min 6 characters)"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={adding}
              />
            </div>
            <Button
              type="submit"
              disabled={adding}
              className="w-full bg-yellow-600 hover:bg-yellow-700 text-black"
            >
              <UserPlus className="w-4 h-4 mr-2" />
              {adding ? 'Creating...' : 'Create User'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">All Users ({users.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {users.map((u) => (
              <div
                key={u.id}
                className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border"
              >
                <div>
                  <p className="font-medium">{u.username}</p>
                  <p className="text-xs text-slate-500">
                    Created {new Date(u.created_at).toLocaleDateString()}
                  </p>
                </div>
                {u.username !== 'admin' && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDeleteUser(u.id, u.username)}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
