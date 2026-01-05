import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { User, Briefcase, Shield, Settings, DollarSign } from 'lucide-react';
import type { UserProfile } from '@/types';
import { AdminSetup } from './AdminSetup';

interface UserSelectPageProps {
  onSelectUser: (user: UserProfile) => void;
}

export function UserSelectPage({ onSelectUser }: UserSelectPageProps) {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdmin, setShowAdmin] = useState(false);

  useEffect(() => {
    loadUsers();
  }, []);

  async function loadUsers() {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*');

      if (error) throw error;
      
      // Sort by role priority (crew -> office -> payroll) then by username
      const rolePriority = { crew: 1, office: 2, payroll: 3 };
      const sorted = (data || []).sort((a, b) => {
        const roleA = rolePriority[a.role as keyof typeof rolePriority] || 999;
        const roleB = rolePriority[b.role as keyof typeof rolePriority] || 999;
        
        if (roleA !== roleB) {
          return roleA - roleB;
        }
        
        return (a.username || '').localeCompare(b.username || '');
      });
      
      setUsers(sorted);
    } catch (error) {
      console.error('Error loading users:', error);
    } finally {
      setLoading(false);
    }
  }

  if (showAdmin) {
    return <AdminSetup onBack={() => {
      setShowAdmin(false);
      loadUsers();
    }} />;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading users...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-2xl shadow-xl">
        <CardHeader className="text-center space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex-1" />
            <div className="flex justify-center flex-1">
              <img 
                src="https://cdn-ai.onspace.ai/onspace/files/EvPiYskzE4vCidikEdjr5Z/MB_Logo_Green_192x64_12.9kb.png" 
                alt="Martin Builder" 
                className="h-16 w-auto"
              />
            </div>
            <div className="flex-1 flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAdmin(true)}
                className="text-muted-foreground hover:text-foreground"
              >
                <Settings className="w-4 h-4 mr-2" />
                Manage Users
              </Button>
            </div>
          </div>
          <div>
            <CardTitle className="text-2xl font-bold">FieldTrack Pro</CardTitle>
            <CardDescription>Select Your Name to Continue</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {users.length === 0 ? (
            <div className="text-center py-8">
              <User className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground mb-2">No users available</p>
              <p className="text-sm text-muted-foreground mb-4">
                Click the button below to add your first user
              </p>
              <Button onClick={() => setShowAdmin(true)} className="gradient-primary">
                <Settings className="w-4 h-4 mr-2" />
                Add Users
              </Button>
            </div>
          ) : (
            <div className="grid gap-3 max-h-96 overflow-y-auto">
              {users.map((user) => (
                <Button
                  key={user.id}
                  variant="outline"
                  className="h-auto p-4 justify-start hover:bg-primary/10 hover:border-primary transition-all"
                  onClick={() => onSelectUser(user)}
                >
                  <div className="flex items-center gap-3 w-full">
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                      {user.role === 'office' ? (
                        <Shield className="w-6 h-6 text-primary" />
                      ) : user.role === 'payroll' ? (
                        <DollarSign className="w-6 h-6 text-primary" />
                      ) : (
                        <Briefcase className="w-6 h-6 text-primary" />
                      )}
                    </div>
                    <div className="flex-1 text-left">
                      <p className="font-semibold text-lg">{user.username || 'Unnamed User'}</p>
                      <p className="text-sm text-muted-foreground capitalize">
                        {user.role === 'payroll' ? 'Payroll' : user.role === 'office' ? 'Office' : 'Crew'} Member
                      </p>
                    </div>
                    <Badge variant={user.role === 'office' ? 'default' : user.role === 'payroll' ? 'outline' : 'secondary'}>
                      {user.role === 'office' ? 'Office' : user.role === 'payroll' ? 'Payroll' : 'Crew'}
                    </Badge>
                  </div>
                </Button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
