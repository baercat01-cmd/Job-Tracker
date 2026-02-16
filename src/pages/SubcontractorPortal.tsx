import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { 
  FileText, 
  Calendar, 
  Image, 
  Download, 
  LogOut,
  MapPin,
  Building2,
  ChevronRight,
  Briefcase,
  User,
  Lock
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { PWAInstallButton } from '@/components/ui/pwa-install-button';

interface PortalUser {
  id: string;
  email: string;
  username: string;
  full_name: string;
  company_name: string | null;
}

interface JobAccess {
  id: string;
  job_id: string;
  can_view_schedule: boolean;
  can_view_documents: boolean;
  can_view_photos: boolean;
  can_view_financials: boolean;
  notes: string | null;
}

export function SubcontractorPortal() {
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState<PortalUser | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Login form state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);
  
  // Job data
  const [jobs, setJobs] = useState<any[]>([]);
  const [selectedJob, setSelectedJob] = useState<any>(null);

  useEffect(() => {
    checkAuthStatus();
  }, []);

  async function checkAuthStatus() {
    // Check if user is logged in via localStorage
    const storedUser = localStorage.getItem('subcontractor_portal_user');
    if (storedUser) {
      try {
        const user = JSON.parse(storedUser);
        setCurrentUser(user);
        setIsAuthenticated(true);
        await loadUserJobs(user.id);
      } catch (error) {
        localStorage.removeItem('subcontractor_portal_user');
      }
    }
    setLoading(false);
  }

  async function handleLogin() {
    if (!loginEmail || !loginPassword) {
      toast.error('Please enter email and password');
      return;
    }

    setLoggingIn(true);
    try {
      // Verify credentials
      const { data: users, error } = await supabase
        .from('portal_users')
        .select('*')
        .eq('email', loginEmail)
        .eq('user_type', 'subcontractor')
        .eq('is_active', true)
        .maybeSingle();

      if (error || !users) {
        toast.error('Invalid email or password');
        setLoggingIn(false);
        return;
      }

      // In production, verify password hash here
      // For now, simple comparison (NEVER DO THIS IN PRODUCTION!)
      if (users.password_hash !== loginPassword) {
        toast.error('Invalid email or password');
        setLoggingIn(false);
        return;
      }

      // Update last login
      await supabase
        .from('portal_users')
        .update({ last_login_at: new Date().toISOString() })
        .eq('id', users.id);

      // Store user data
      const userData = {
        id: users.id,
        email: users.email,
        username: users.username,
        full_name: users.full_name,
        company_name: users.company_name,
      };

      localStorage.setItem('subcontractor_portal_user', JSON.stringify(userData));
      setCurrentUser(userData);
      setIsAuthenticated(true);
      
      await loadUserJobs(users.id);
      toast.success(`Welcome back, ${users.full_name}!`);
    } catch (error: any) {
      console.error('Login error:', error);
      toast.error('Login failed. Please try again.');
    } finally {
      setLoggingIn(false);
    }
  }

  async function loadUserJobs(userId: string) {
    try {
      // Get job access records
      const { data: accessData, error: accessError } = await supabase
        .from('portal_job_access')
        .select(`
          *,
          jobs(*)
        `)
        .eq('portal_user_id', userId);

      if (accessError) throw accessError;

      // Load additional data for each job
      const jobsWithData = await Promise.all(
        (accessData || []).map(async (access) => {
          const job = access.jobs;
          
          // Load documents if allowed
          let documents = [];
          if (access.can_view_documents) {
            const { data: docsData } = await supabase
              .from('job_documents')
              .select(`
                *,
                job_document_revisions(*)
              `)
              .eq('job_id', job.id)
              .eq('visible_to_crew', true);
            documents = docsData || [];
          }

          // Load schedule events if allowed
          let scheduleEvents = [];
          if (access.can_view_schedule) {
            const { data: scheduleData } = await supabase
              .from('calendar_events')
              .select('*')
              .eq('job_id', job.id)
              .order('event_date', { ascending: true });
            scheduleEvents = scheduleData || [];
          }

          // Load photos if allowed
          let photos = [];
          if (access.can_view_photos) {
            const { data: photosData } = await supabase
              .from('photos')
              .select('*')
              .eq('job_id', job.id)
              .order('created_at', { ascending: false })
              .limit(50);
            photos = photosData || [];
          }

          return {
            ...job,
            access,
            documents,
            scheduleEvents,
            photos,
          };
        })
      );

      setJobs(jobsWithData);
    } catch (error: any) {
      console.error('Error loading jobs:', error);
      toast.error('Failed to load your projects');
    }
  }

  function handleLogout() {
    localStorage.removeItem('subcontractor_portal_user');
    setCurrentUser(null);
    setIsAuthenticated(false);
    setJobs([]);
    setSelectedJob(null);
    toast.success('Logged out successfully');
  }

  // Login Screen
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <Briefcase className="w-8 h-8 text-white" />
            </div>
            <CardTitle className="text-2xl">Subcontractor Portal</CardTitle>
            <p className="text-muted-foreground mt-2">Sign in to access your projects</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Email Address</Label>
              <div className="relative">
                <User className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                <Input
                  type="email"
                  placeholder="your@email.com"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                  className="pl-10"
                />
              </div>
            </div>
            <div>
              <Label>Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                <Input
                  type="password"
                  placeholder="Enter your password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                  className="pl-10"
                />
              </div>
            </div>
            <Button onClick={handleLogin} disabled={loggingIn} className="w-full">
              {loggingIn ? 'Signing in...' : 'Sign In'}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-lg text-slate-600">Loading your projects...</p>
        </div>
      </div>
    );
  }

  // Job Detail View
  if (selectedJob) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-900 to-slate-900 text-white shadow-lg">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Button variant="ghost" size="sm" onClick={() => setSelectedJob(null)} className="text-white hover:bg-white/10">
                  ← Back to Projects
                </Button>
                <div>
                  <h1 className="text-3xl font-bold">{selectedJob.name}</h1>
                  <p className="text-blue-100 mt-1">{selectedJob.client_name}</p>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={handleLogout} className="text-white hover:bg-white/10">
                <LogOut className="w-4 h-4 mr-2" />
                Sign Out
              </Button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Tabs defaultValue="overview">
            <TabsList className="grid w-full grid-cols-4 mb-6">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              {selectedJob.access.can_view_schedule && <TabsTrigger value="schedule">Schedule</TabsTrigger>}
              {selectedJob.access.can_view_documents && <TabsTrigger value="documents">Documents</TabsTrigger>}
              {selectedJob.access.can_view_photos && <TabsTrigger value="photos">Photos</TabsTrigger>}
            </TabsList>

            {/* Overview Tab */}
            <TabsContent value="overview">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="w-5 h-5" />
                    Project Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground flex items-center gap-2">
                        <MapPin className="w-4 h-4" />
                        Address
                      </p>
                      <p className="font-medium mt-1">{selectedJob.address}</p>
                    </div>
                    {selectedJob.description && (
                      <div>
                        <p className="text-sm text-muted-foreground">Description</p>
                        <p className="font-medium mt-1">{selectedJob.description}</p>
                      </div>
                    )}
                  </div>
                  {selectedJob.access.notes && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <p className="text-sm font-medium text-blue-900 mb-2">Notes for Subcontractor:</p>
                      <p className="text-blue-800">{selectedJob.access.notes}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Schedule Tab */}
            {selectedJob.access.can_view_schedule && (
              <TabsContent value="schedule">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Calendar className="w-5 h-5" />
                      Project Schedule
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {selectedJob.scheduleEvents.length > 0 ? (
                      <div className="space-y-3">
                        {selectedJob.scheduleEvents.map((event: any) => (
                          <div key={event.id} className="flex items-start gap-4 p-4 border rounded-lg">
                            <div className="text-center bg-blue-50 rounded-lg p-3 min-w-[80px]">
                              <p className="text-sm text-muted-foreground">
                                {new Date(event.event_date).toLocaleDateString('en-US', { month: 'short' })}
                              </p>
                              <p className="text-2xl font-bold text-blue-600">
                                {new Date(event.event_date).getDate()}
                              </p>
                            </div>
                            <div className="flex-1">
                              <h3 className="font-bold text-lg">{event.title}</h3>
                              {event.description && (
                                <p className="text-muted-foreground mt-1">{event.description}</p>
                              )}
                              <Badge variant="outline" className="mt-2">
                                {event.event_type}
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-center text-muted-foreground py-8">No scheduled events</p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            )}

            {/* Documents Tab */}
            {selectedJob.access.can_view_documents && (
              <TabsContent value="documents">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="w-5 h-5" />
                      Project Documents & Drawings
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {selectedJob.documents.length > 0 ? (
                      <div className="space-y-3">
                        {selectedJob.documents.map((doc: any) => {
                          const latestRevision = doc.job_document_revisions?.[doc.job_document_revisions.length - 1];
                          return (
                            <div key={doc.id} className="flex items-center justify-between p-4 border rounded-lg">
                              <div className="flex items-center gap-3">
                                <FileText className="w-8 h-8 text-blue-600" />
                                <div>
                                  <p className="font-medium">{doc.name}</p>
                                  <p className="text-sm text-muted-foreground">
                                    {doc.category} • Version {doc.current_version}
                                  </p>
                                </div>
                              </div>
                              {latestRevision && (
                                <Button
                                  onClick={() => window.open(latestRevision.file_url, '_blank')}
                                  variant="outline"
                                >
                                  <Download className="w-4 h-4 mr-2" />
                                  Download
                                </Button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-center text-muted-foreground py-8">No documents available</p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            )}

            {/* Photos Tab */}
            {selectedJob.access.can_view_photos && (
              <TabsContent value="photos">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Image className="w-5 h-5" />
                      Project Photos
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {selectedJob.photos.length > 0 ? (
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {selectedJob.photos.map((photo: any) => (
                          <div key={photo.id} className="group relative">
                            <img
                              src={photo.photo_url}
                              alt={photo.caption || 'Project photo'}
                              className="w-full h-48 object-cover rounded-lg cursor-pointer hover:opacity-90 transition"
                              onClick={() => window.open(photo.photo_url, '_blank')}
                            />
                            {photo.caption && (
                              <p className="text-sm text-muted-foreground mt-2">{photo.caption}</p>
                            )}
                            <p className="text-xs text-muted-foreground">
                              {new Date(photo.created_at).toLocaleDateString()}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-center text-muted-foreground py-8">No photos available</p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            )}
          </Tabs>
        </div>
      </div>
    );
  }

  // Job List View
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-900 to-slate-900 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">Your Projects</h1>
              <p className="text-blue-100 mt-1">
                Welcome, {currentUser?.full_name}
                {currentUser?.company_name && ` • ${currentUser.company_name}`}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <PWAInstallButton />
              <Button variant="outline" onClick={handleLogout} className="bg-white/10 hover:bg-white/20 text-white border-white/30">
                <LogOut className="w-4 h-4 mr-2" />
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {jobs.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12">
              <Briefcase className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
              <h2 className="text-xl font-semibold mb-2">No Projects Assigned</h2>
              <p className="text-muted-foreground">
                You don't have access to any projects yet. Please contact the project manager.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold mb-4">Assigned Projects ({jobs.length})</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {jobs.map((job) => (
                <Card 
                  key={job.id} 
                  className="hover:shadow-lg transition-shadow cursor-pointer border-2"
                  onClick={() => setSelectedJob(job)}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="flex items-center gap-2">
                          <Building2 className="w-5 h-5 text-blue-600" />
                          {job.name}
                        </CardTitle>
                        <p className="text-sm text-muted-foreground mt-1">
                          <MapPin className="w-3 h-3 inline mr-1" />
                          {job.address}
                        </p>
                      </div>
                      <Badge variant={job.status === 'active' ? 'default' : 'secondary'}>
                        {job.status}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Access Summary */}
                    <div className="flex flex-wrap gap-2">
                      {job.access.can_view_schedule && (
                        <Badge variant="outline" className="bg-blue-50 text-blue-700">
                          <Calendar className="w-3 h-3 mr-1" />
                          Schedule
                        </Badge>
                      )}
                      {job.access.can_view_documents && (
                        <Badge variant="outline" className="bg-green-50 text-green-700">
                          <FileText className="w-3 h-3 mr-1" />
                          {job.documents.length} Documents
                        </Badge>
                      )}
                      {job.access.can_view_photos && (
                        <Badge variant="outline" className="bg-purple-50 text-purple-700">
                          <Image className="w-3 h-3 mr-1" />
                          {job.photos.length} Photos
                        </Badge>
                      )}
                    </div>

                    <Button variant="outline" className="w-full">
                      View Details
                      <ChevronRight className="w-4 h-4 ml-2" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
