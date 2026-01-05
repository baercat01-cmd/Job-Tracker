import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { 
  Bell, 
  FileText, 
  Camera, 
  Package, 
  AlertTriangle, 
  StickyNote,
  ArrowUpDown,
  CheckCheck,
  Eye,
  Filter,
  Calendar
} from 'lucide-react';
import { toast } from 'sonner';

interface Notification {
  id: string;
  job_id: string;
  created_by: string;
  type: 'daily_log' | 'photos' | 'material_request' | 'issue' | 'note' | 'material_status' | 'document_revision' | 'time_entry';
  brief: string;
  reference_id: string | null;
  reference_data: any;
  is_read: boolean;
  created_at: string;
  jobs?: { name: string };
  user_profiles?: { username: string; email: string };
}

interface NotificationsCenterProps {
  onViewDetail?: (notification: Notification) => void;
  onNavigateToItem?: (notification: Notification) => void;
}

const TYPE_CONFIG = {
  daily_log: { 
    label: 'Daily Log', 
    icon: FileText, 
    color: 'bg-blue-500',
    textColor: 'text-blue-700',
    bgColor: 'bg-blue-50'
  },
  time_entry: { 
    label: 'Time Entry', 
    icon: ArrowUpDown, 
    color: 'bg-cyan-500',
    textColor: 'text-cyan-700',
    bgColor: 'bg-cyan-50'
  },
  photos: { 
    label: 'Photos', 
    icon: Camera, 
    color: 'bg-green-500',
    textColor: 'text-green-700',
    bgColor: 'bg-green-50'
  },
  material_request: { 
    label: 'Material Request', 
    icon: Package, 
    color: 'bg-orange-500',
    textColor: 'text-orange-700',
    bgColor: 'bg-orange-50'
  },
  issue: { 
    label: 'Issue', 
    icon: AlertTriangle, 
    color: 'bg-red-500',
    textColor: 'text-red-700',
    bgColor: 'bg-red-50'
  },
  note: { 
    label: 'Note', 
    icon: StickyNote, 
    color: 'bg-purple-500',
    textColor: 'text-purple-700',
    bgColor: 'bg-purple-50'
  },
  material_status: { 
    label: 'Material Status', 
    icon: ArrowUpDown, 
    color: 'bg-yellow-500',
    textColor: 'text-yellow-700',
    bgColor: 'bg-yellow-50'
  },
  document_revision: { 
    label: 'Document Update', 
    icon: FileText, 
    color: 'bg-indigo-500',
    textColor: 'text-indigo-700',
    bgColor: 'bg-indigo-50'
  },
};

export function NotificationsCenter({ onViewDetail, onNavigateToItem }: NotificationsCenterProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<string>('all');
  const [filterJob, setFilterJob] = useState<string>('all');
  const [filterRead, setFilterRead] = useState<string>('all');
  const [jobs, setJobs] = useState<{ id: string; name: string }[]>([]);
  const [selectedNotification, setSelectedNotification] = useState<Notification | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    loadNotifications();
    loadJobs();
    
    // Auto-mark all unread notifications as read when the Alerts tab is opened
    markAllAsReadOnMount();
    
    // Subscribe to new notifications
    const channel = supabase
      .channel('notifications_changes')
      .on('postgres_changes', 
        { event: 'INSERT', schema: 'public', table: 'notifications' },
        () => {
          console.log('New notification received');
          loadNotifications();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function loadNotifications() {
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select(`
          *,
          jobs(name),
          user_profiles(username, email)
        `)
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) throw error;
      setNotifications(data || []);
    } catch (error: any) {
      console.error('Error loading notifications:', error);
      toast.error('Failed to load notifications');
    } finally {
      setLoading(false);
    }
  }

  async function loadJobs() {
    try {
      const { data, error } = await supabase
        .from('jobs')
        .select('id, name')
        .order('name');

      if (error) throw error;
      setJobs(data || []);
    } catch (error: any) {
      console.error('Error loading jobs:', error);
    }
  }

  async function markAllAsReadOnMount() {
    try {
      // Get all unread notification IDs
      const { data: unreadNotifs, error: fetchError } = await supabase
        .from('notifications')
        .select('id')
        .eq('is_read', false);

      if (fetchError) throw fetchError;
      
      const unreadIds = unreadNotifs?.map(n => n.id) || [];
      
      if (unreadIds.length === 0) return;

      // Mark them all as read
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .in('id', unreadIds);

      if (error) throw error;

      console.log(`Auto-marked ${unreadIds.length} notifications as read`);
    } catch (error: any) {
      console.error('Error auto-marking notifications as read:', error);
    }
  }

  async function markAsRead(notificationId: string, currentReadStatus: boolean) {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: !currentReadStatus })
        .eq('id', notificationId);

      if (error) throw error;
      
      setNotifications(prev => 
        prev.map(n => 
          n.id === notificationId 
            ? { ...n, is_read: !currentReadStatus }
            : n
        )
      );
      
      toast.success(currentReadStatus ? 'Marked as unread' : 'Marked as read');
    } catch (error: any) {
      toast.error('Failed to update notification');
      console.error(error);
    }
  }

  async function markAllAsRead() {
    try {
      const unreadIds = filteredNotifications
        .filter(n => !n.is_read)
        .map(n => n.id);

      if (unreadIds.length === 0) {
        toast.info('No unread notifications');
        return;
      }

      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .in('id', unreadIds);

      if (error) throw error;

      setNotifications(prev =>
        prev.map(n => 
          unreadIds.includes(n.id) ? { ...n, is_read: true } : n
        )
      );

      toast.success(`Marked ${unreadIds.length} notification(s) as read`);
    } catch (error: any) {
      toast.error('Failed to mark all as read');
      console.error(error);
    }
  }

  async function viewDetails(notification: Notification) {
    setSelectedNotification(notification);
    setShowDetails(true);
    
    // Auto-mark as read when viewing details
    if (!notification.is_read) {
      try {
        const { error } = await supabase
          .from('notifications')
          .update({ is_read: true })
          .eq('id', notification.id);

        if (error) throw error;
        
        // Update local state
        setNotifications(prev => 
          prev.map(n => n.id === notification.id ? { ...n, is_read: true } : n)
        );
      } catch (error) {
        console.error('Error marking notification as read:', error);
      }
    }

    // Call optional callback
    if (onViewDetail) {
      onViewDetail(notification);
    }
  }

  async function navigateToItem(notification: Notification) {
    // Mark as read when navigating to the item
    if (!notification.is_read) {
      try {
        const { error } = await supabase
          .from('notifications')
          .update({ is_read: true })
          .eq('id', notification.id);

        if (error) throw error;
        
        // Update local state
        setNotifications(prev => 
          prev.map(n => n.id === notification.id ? { ...n, is_read: true } : n)
        );
      } catch (error) {
        console.error('Error marking notification as read:', error);
      }
    }
    
    // Call navigation callback if provided
    if (onNavigateToItem) {
      onNavigateToItem(notification);
    }
  }

  const filteredNotifications = notifications.filter(n => {
    if (filterType !== 'all' && n.type !== filterType) return false;
    if (filterJob !== 'all' && n.job_id !== filterJob) return false;
    if (filterRead === 'unread' && n.is_read) return false;
    if (filterRead === 'read' && !n.is_read) return false;
    return true;
  });

  const unreadCount = notifications.filter(n => !n.is_read).length;

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-muted-foreground">Loading notifications...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with Filters */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Bell className="w-6 h-6 text-primary" />
          <div>
            <h2 className="text-2xl font-bold">Crew Activity Notifications</h2>
            <p className="text-sm text-muted-foreground">
              {unreadCount} unread • {filteredNotifications.length} showing
            </p>
          </div>
        </div>
        
        {unreadCount > 0 && (
          <Button onClick={markAllAsRead} variant="outline" size="sm">
            <CheckCheck className="w-4 h-4 mr-2" />
            Mark All Read
          </Button>
        )}
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Filter className="w-4 h-4" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Type</label>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {Object.entries(TYPE_CONFIG).map(([key, config]) => (
                  <SelectItem key={key} value={key}>
                    {config.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Job</label>
            <Select value={filterJob} onValueChange={setFilterJob}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Jobs</SelectItem>
                {jobs.map((job) => (
                  <SelectItem key={job.id} value={job.id}>
                    {job.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Status</label>
            <Select value={filterRead} onValueChange={setFilterRead}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="unread">Unread Only</SelectItem>
                <SelectItem value="read">Read Only</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Notifications List */}
      {filteredNotifications.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Bell className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg mb-1">No notifications</p>
            <p className="text-sm">Crew activity will appear here</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredNotifications.map((notification) => {
            const config = TYPE_CONFIG[notification.type];
            const Icon = config.icon;
            const userName = notification.user_profiles?.username || notification.user_profiles?.email || 'Unknown';
            const jobName = notification.jobs?.name || 'Unknown Job';

            return (
              <Card 
                key={notification.id}
                className={`${!notification.is_read ? 'border-l-4 border-l-primary shadow-md' : ''} 
                  hover:shadow-lg transition-shadow cursor-pointer`}
                onClick={() => viewDetails(notification)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    {/* Icon */}
                    <div className={`w-10 h-10 rounded-full ${config.bgColor} flex items-center justify-center flex-shrink-0`}>
                      <Icon className={`w-5 h-5 ${config.textColor}`} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <Badge variant="outline" className={config.textColor}>
                          {config.label}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{jobName}</span>
                        <span className="text-xs text-muted-foreground">•</span>
                        <span className="text-xs text-muted-foreground">{userName}</span>
                      </div>
                      
                      <p className="text-sm line-clamp-2 mb-2">
                        {notification.brief}
                      </p>

                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(notification.created_at).toLocaleString()}
                        </span>
                        {!notification.is_read && (
                          <Badge className="bg-orange text-orange-foreground text-xs font-semibold">
                            New
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          markAsRead(notification.id, notification.is_read);
                        }}
                        className="h-8 w-8 p-0"
                      >
                        {notification.is_read ? (
                          <Eye className="w-4 h-4 text-muted-foreground" />
                        ) : (
                          <CheckCheck className="w-4 h-4 text-primary" />
                        )}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Details Dialog */}
      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedNotification && (
                <>
                  {(() => {
                    const Icon = TYPE_CONFIG[selectedNotification.type].icon;
                    return <Icon className="w-5 h-5" />;
                  })()}
                  {TYPE_CONFIG[selectedNotification.type].label}
                </>
              )}
            </DialogTitle>
          </DialogHeader>
          
          {selectedNotification && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Job:</span>
                  <p className="font-medium">{selectedNotification.jobs?.name}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Crew Member:</span>
                  <p className="font-medium">
                    {selectedNotification.user_profiles?.username || selectedNotification.user_profiles?.email}
                  </p>
                </div>
                <div className="col-span-2">
                  <span className="text-muted-foreground">Time:</span>
                  <p className="font-medium">
                    {new Date(selectedNotification.created_at).toLocaleString()}
                  </p>
                </div>
              </div>

              <div className="border-t pt-4">
                <h4 className="font-semibold mb-2">Details:</h4>
                <p className="text-sm whitespace-pre-wrap">{selectedNotification.brief}</p>
              </div>

              {selectedNotification.reference_data && (
                <div className="border-t pt-4">
                  <h4 className="font-semibold mb-2">Additional Information:</h4>
                  <pre className="text-xs bg-muted p-3 rounded-lg overflow-auto">
                    {JSON.stringify(selectedNotification.reference_data, null, 2)}
                  </pre>
                </div>
              )}

              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  onClick={() => markAsRead(selectedNotification.id, selectedNotification.is_read)}
                >
                  Mark as {selectedNotification.is_read ? 'Unread' : 'Read'}
                </Button>
                <Button
                  onClick={() => {
                    setShowDetails(false);
                    navigateToItem(selectedNotification);
                  }}
                  className="gradient-primary"
                >
                  Go to Item
                </Button>
                <Button onClick={() => setShowDetails(false)} variant="outline">
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
