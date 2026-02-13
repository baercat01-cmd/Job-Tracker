import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Plus, 
  Trash2, 
  Edit, 
  Users, 
  Building2,
  Briefcase,
  Key,
  Settings
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

interface PortalUser {
  id: string;
  user_type: 'customer' | 'subcontractor';
  email: string;
  username: string;
  full_name: string;
  company_name: string | null;
  phone: string | null;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
}

interface JobAccess {
  id: string;
  portal_user_id: string;
  job_id: string;
  can_view_schedule: boolean;
  can_view_documents: boolean;
  can_view_photos: boolean;
  can_view_financials: boolean;
  notes: string | null;
  jobs: any;
}

export function PortalManagement() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [portalUsers, setPortalUsers] = useState<PortalUser[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showAccessDialog, setShowAccessDialog] = useState(false);
  const [selectedUser, setSelectedUser] = useState<PortalUser | null>(null);
  const [userJobAccess, setUserJobAccess] = useState<JobAccess[]>([]);

  // Create user form state
  const [userType, setUserType] = useState<'customer' | 'subcontractor'>('subcontractor');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [phone, setPhone] = useState('');

  // Job access form state
  const [selectedJobId, setSelectedJobId] = useState('');
  const [canViewSchedule, setCanViewSchedule] = useState(true);
  const [canViewDocuments, setCanViewDocuments] = useState(true);
  const [canViewPhotos, setCanViewPhotos] = useState(false);
  const [canViewFinancials, setCanViewFinancials] = useState(false);
  const [accessNotes, setAccessNotes] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      await Promise.all([
        loadPortalUsers(),
        loadJobs(),
      ]);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadPortalUsers() {
    const { data, error } = await supabase
      .from('portal_users')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    setPortalUsers(data || []);
  }

  async function loadJobs() {
    const { data, error } = await supabase
      .from('jobs')
      .select('id, name, client_name, address, status')
      .order('created_at', { ascending: false });

    if (error) throw error;
    setJobs(data || []);
  }

  async function loadUserJobAccess(userId: string) {
    const { data, error } = await supabase
      .from('portal_job_access')
      .select(`
        *,
        jobs(id, name, client_name, address)
      `)
      .eq('portal_user_id', userId);

    if (error) throw error;
    setUserJobAccess(data || []);
  }

  async function createPortalUser() {
    if (!email || !username || !password || !fullName) {
      toast.error('Please fill in all required fields');
      return;
    }

    try {
      const { data, error } = await supabase
        .from('portal_users')
        .insert([{
          user_type: userType,
          email,
          username,
          password_hash: password, // In production, hash this!
          full_name: fullName,
          company_name: companyName || null,
          phone: phone || null,
          created_by: profile?.id,
        }])
        .select()
        .single();

      if (error) throw error;

      toast.success(`${userType === 'customer' ? 'Customer' : 'Subcontractor'} portal user created successfully`);
      setShowCreateDialog(false);
      resetCreateForm();
      await loadPortalUsers();
    } catch (error: any) {
      console.error('Error creating portal user:', error);
      toast.error('Failed to create portal user: ' + error.message);
    }
  }

  async function grantJobAccess() {
    if (!selectedUser || !selectedJobId) {
      toast.error('Please select a job');
      return;
    }

    try {
      const { error } = await supabase
        .from('portal_job_access')
        .insert([{
          portal_user_id: selectedUser.id,
          job_id: selectedJobId,
          can_view_schedule: canViewSchedule,
          can_view_documents: canViewDocuments,
          can_view_photos: canViewPhotos,
          can_view_financials: canViewFinancials,
          notes: accessNotes || null,
          created_by: profile?.id,
        }]);

      if (error) throw error;

      toast.success('Job access granted successfully');
      resetAccessForm();
      await loadUserJobAccess(selectedUser.id);
    } catch (error: any) {
      console.error('Error granting job access:', error);
      toast.error('Failed to grant access: ' + error.message);
    }
  }

  async function revokeJobAccess(accessId: string) {
    if (!confirm('Remove access to this job?')) return;

    try {
      const { error } = await supabase
        .from('portal_job_access')
        .delete()
        .eq('id', accessId);

      if (error) throw error;

      toast.success('Job access revoked');
      if (selectedUser) {
        await loadUserJobAccess(selectedUser.id);
      }
    } catch (error: any) {
      console.error('Error revoking access:', error);
      toast.error('Failed to revoke access');
    }
  }

  async function toggleUserStatus(userId: string, currentStatus: boolean) {
    try {
      const { error } = await supabase
        .from('portal_users')
        .update({ is_active: !currentStatus })
        .eq('id', userId);

      if (error) throw error;

      toast.success(`User ${!currentStatus ? 'activated' : 'deactivated'}`);
      await loadPortalUsers();
    } catch (error: any) {
      console.error('Error toggling user status:', error);
      toast.error('Failed to update user status');
    }
  }

  async function deletePortalUser(userId: string) {
    if (!confirm('Delete this portal user? This will remove all their job access.')) return;

    try {
      const { error } = await supabase
        .from('portal_users')
        .delete()
        .eq('id', userId);

      if (error) throw error;

      toast.success('Portal user deleted');
      await loadPortalUsers();
      if (selectedUser?.id === userId) {
        setSelectedUser(null);
        setUserJobAccess([]);
      }
    } catch (error: any) {
      console.error('Error deleting user:', error);
      toast.error('Failed to delete user');
    }
  }

  function openAccessDialog(user: PortalUser) {
    setSelectedUser(user);
    loadUserJobAccess(user.id);
    setShowAccessDialog(true);
  }

  function resetCreateForm() {
    setUserType('subcontractor');
    setEmail('');
    setUsername('');
    setPassword('');
    setFullName('');
    setCompanyName('');
    setPhone('');
  }

  function resetAccessForm() {
    setSelectedJobId('');
    setCanViewSchedule(true);
    setCanViewDocuments(true);
    setCanViewPhotos(false);
    setCanViewFinancials(false);
    setAccessNotes('');
  }

  const customerUsers = portalUsers.filter(u => u.user_type === 'customer');
  const subcontractorUsers = portalUsers.filter(u => u.user_type === 'subcontractor');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Portal User Management</h3>
          <p className="text-sm text-muted-foreground">
            Manage customer and subcontractor portal access
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Create Portal User
        </Button>
      </div>

      <Tabs defaultValue="subcontractors">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="subcontractors">
            <Briefcase className="w-4 h-4 mr-2" />
            Subcontractors ({subcontractorUsers.length})
          </TabsTrigger>
          <TabsTrigger value="customers">
            <Users className="w-4 h-4 mr-2" />
            Customers ({customerUsers.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="subcontractors" className="space-y-4">
          {subcontractorUsers.length === 0 ? (
            <Card>
              <CardContent className="text-center py-12">
                <Briefcase className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground mb-4">No subcontractor portal users yet</p>
                <Button onClick={() => {
                  setUserType('subcontractor');
                  setShowCreateDialog(true);
                }}>
                  <Plus className="w-4 h-4 mr-2" />
                  Create First Subcontractor User
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {subcontractorUsers.map((user) => (
                <Card key={user.id}>
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <h3 className="font-bold text-lg">{user.full_name}</h3>
                        {user.company_name && (
                          <p className="text-sm text-muted-foreground">{user.company_name}</p>
                        )}
                        <p className="text-sm text-muted-foreground mt-1">{user.email}</p>
                        <p className="text-sm text-muted-foreground">{user.username}</p>
                      </div>
                      <Badge variant={user.is_active ? 'default' : 'secondary'}>
                        {user.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>

                    {user.last_login_at && (
                      <p className="text-xs text-muted-foreground mb-4">
                        Last login: {new Date(user.last_login_at).toLocaleString()}
                      </p>
                    )}

                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openAccessDialog(user)}
                        className="flex-1"
                      >
                        <Key className="w-4 h-4 mr-2" />
                        Manage Access
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => toggleUserStatus(user.id, user.is_active)}
                      >
                        {user.is_active ? 'Deactivate' : 'Activate'}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => deletePortalUser(user.id)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="customers" className="space-y-4">
          {customerUsers.length === 0 ? (
            <Card>
              <CardContent className="text-center py-12">
                <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground mb-4">No customer portal users yet</p>
                <Button onClick={() => {
                  setUserType('customer');
                  setShowCreateDialog(true);
                }}>
                  <Plus className="w-4 h-4 mr-2" />
                  Create First Customer User
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {customerUsers.map((user) => (
                <Card key={user.id}>
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <h3 className="font-bold text-lg">{user.full_name}</h3>
                        <p className="text-sm text-muted-foreground mt-1">{user.email}</p>
                        <p className="text-sm text-muted-foreground">{user.username}</p>
                      </div>
                      <Badge variant={user.is_active ? 'default' : 'secondary'}>
                        {user.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>

                    {user.last_login_at && (
                      <p className="text-xs text-muted-foreground mb-4">
                        Last login: {new Date(user.last_login_at).toLocaleString()}
                      </p>
                    )}

                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openAccessDialog(user)}
                        className="flex-1"
                      >
                        <Key className="w-4 h-4 mr-2" />
                        Manage Access
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => toggleUserStatus(user.id, user.is_active)}
                      >
                        {user.is_active ? 'Deactivate' : 'Activate'}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => deletePortalUser(user.id)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Create User Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create Portal User</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>User Type *</Label>
              <Select value={userType} onValueChange={(value: any) => setUserType(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="subcontractor">Subcontractor</SelectItem>
                  <SelectItem value="customer">Customer</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Full Name *</Label>
                <Input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="John Doe"
                />
              </div>
              <div>
                <Label>Company Name</Label>
                <Input
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="ABC Construction"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Email *</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="user@example.com"
                />
              </div>
              <div>
                <Label>Phone</Label>
                <Input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(555) 123-4567"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Username *</Label>
                <Input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="johndoe"
                />
              </div>
              <div>
                <Label>Password *</Label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-4 border-t">
              <Button onClick={createPortalUser} className="flex-1">
                Create User
              </Button>
              <Button variant="outline" onClick={() => {
                setShowCreateDialog(false);
                resetCreateForm();
              }}>
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Manage Job Access Dialog */}
      <Dialog open={showAccessDialog} onOpenChange={setShowAccessDialog}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Manage Job Access - {selectedUser?.full_name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-6">
            {/* Current Access */}
            <div>
              <h4 className="font-semibold mb-3">Current Job Access ({userJobAccess.length})</h4>
              {userJobAccess.length > 0 ? (
                <div className="space-y-2">
                  {userJobAccess.map((access) => (
                    <div key={access.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex-1">
                        <p className="font-medium">{access.jobs.name}</p>
                        <p className="text-sm text-muted-foreground">{access.jobs.address}</p>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {access.can_view_schedule && <Badge variant="outline" className="text-xs">Schedule</Badge>}
                          {access.can_view_documents && <Badge variant="outline" className="text-xs">Documents</Badge>}
                          {access.can_view_photos && <Badge variant="outline" className="text-xs">Photos</Badge>}
                          {access.can_view_financials && <Badge variant="outline" className="text-xs">Financials</Badge>}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => revokeJobAccess(access.id)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No jobs assigned yet</p>
              )}
            </div>

            {/* Grant New Access */}
            <div className="border-t pt-6">
              <h4 className="font-semibold mb-3">Grant Access to New Job</h4>
              <div className="space-y-4">
                <div>
                  <Label>Select Job *</Label>
                  <Select value={selectedJobId} onValueChange={setSelectedJobId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a job..." />
                    </SelectTrigger>
                    <SelectContent>
                      {jobs.map((job) => (
                        <SelectItem key={job.id} value={job.id}>
                          {job.name} - {job.client_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <Label>View Schedule</Label>
                    <Switch checked={canViewSchedule} onCheckedChange={setCanViewSchedule} />
                  </div>
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <Label>View Documents</Label>
                    <Switch checked={canViewDocuments} onCheckedChange={setCanViewDocuments} />
                  </div>
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <Label>View Photos</Label>
                    <Switch checked={canViewPhotos} onCheckedChange={setCanViewPhotos} />
                  </div>
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <Label>View Financials</Label>
                    <Switch checked={canViewFinancials} onCheckedChange={setCanViewFinancials} />
                  </div>
                </div>

                <div>
                  <Label>Notes (Optional)</Label>
                  <Textarea
                    value={accessNotes}
                    onChange={(e) => setAccessNotes(e.target.value)}
                    placeholder="Special instructions or notes for this user..."
                    rows={3}
                  />
                </div>

                <Button onClick={grantJobAccess} className="w-full">
                  <Plus className="w-4 h-4 mr-2" />
                  Grant Access
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
