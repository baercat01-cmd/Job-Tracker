import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { Bell, ExternalLink, Clock } from 'lucide-react';
import { toast } from 'sonner';

interface Notification {
  id: string;
  job_id: string;
  created_by: string;
  type: string;
  brief: string;
  is_read: boolean;
  created_at: string;
  jobs?: { name: string };
  user_profiles?: { username: string; email: string };
}

interface NotificationBellProps {
  onNotificationClick: (notification: Notification) => void;
  onViewAll: () => void;
}

const TYPE_ICONS = {
  daily_log: '📋',
  time_entry: '⏱️',
  photos: '📸',
  material_request: '📦',
  issue: '⚠️',
  note: '📝',
  material_status: '🔄',
  document_revision: '📄',
};

export function NotificationBell({ onNotificationClick, onViewAll }: NotificationBellProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [lastNotificationTime, setLastNotificationTime] = useState<number>(Date.now());

  useEffect(() => {
    loadRecentNotifications();
    
    // Subscribe to new notifications
    const channel = supabase
      .channel('notification_bell')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications' },
        (payload) => {
          console.log('🔔 New notification received:', payload);
          const newNotification = payload.new as Notification;
          
          // Show toast for new notification
          toast.info(
            <div className="flex items-start gap-3">
              <span className="text-2xl">{TYPE_ICONS[newNotification.type as keyof typeof TYPE_ICONS] || '🔔'}</span>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm">New Activity</p>
                <p className="text-xs line-clamp-2">{newNotification.brief}</p>
              </div>
            </div>,
            {
              duration: 5000,
              action: {
                label: 'View',
                onClick: () => {
                  loadRecentNotifications();
                  onNotificationClick(newNotification);
                },
              },
            }
          );
          
          // Play notification sound (if browser allows)
          try {
            const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBjWM0/LPeCQhBCx7w/DdkEIKE1yw6OykVxQKRJjd8MF4KQYZ');
            audio.volume = 0.3;
            audio.play().catch(() => {}); // Ignore errors if autoplay is blocked
          } catch (e) {
            // Ignore audio errors
          }
          
          loadRecentNotifications();
          setLastNotificationTime(Date.now());
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function loadRecentNotifications() {
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select(`
          *,
          jobs(name),
          user_profiles(username, email)
        `)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      
      const notifs = data || [];
      setNotifications(notifs);
      setUnreadCount(notifs.filter(n => !n.is_read).length);
    } catch (error) {
      console.error('Error loading notifications:', error);
    }
  }

  async function handleNotificationClick(notification: Notification) {
    // Mark as read when clicked
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
        setUnreadCount(prev => Math.max(0, prev - 1));
      } catch (error) {
        console.error('Error marking notification as read:', error);
      }
    }
    
    setOpen(false);
    onNotificationClick(notification);
  }

  function getTimeAgo(timestamp: string) {
    const now = Date.now();
    const time = new Date(timestamp).getTime();
    const diff = now - time;
    
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="relative h-10 w-10 p-0"
        >
          <Bell className={`w-5 h-5 ${unreadCount > 0 ? 'text-primary animate-pulse' : ''}`} />
          {unreadCount > 0 && (
            <Badge 
              className="absolute -top-1 -right-1 h-5 w-5 rounded-full p-0 flex items-center justify-center bg-destructive text-destructive-foreground text-xs font-bold border-2 border-background animate-pulse shadow-lg"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="end">
        <div className="border-b p-4 bg-muted/30">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm">Notifications</h3>
            {unreadCount > 0 && (
              <Badge className="text-xs bg-destructive text-destructive-foreground">
                {unreadCount} new
              </Badge>
            )}
          </div>
        </div>
        
        <div className="max-h-[400px] overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              <Bell className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>No notifications yet</p>
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((notification) => (
                <button
                  key={notification.id}
                  onClick={() => handleNotificationClick(notification)}
                  className={`w-full p-3 text-left hover:bg-muted/50 transition-colors ${
                    !notification.is_read ? 'bg-primary/5 border-l-2 border-l-primary' : ''
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-xl flex-shrink-0">
                      {TYPE_ICONS[notification.type as keyof typeof TYPE_ICONS] || '🔔'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <p className="text-xs font-medium line-clamp-1">
                          {notification.jobs?.name || 'Unknown Job'}
                        </p>
                        {!notification.is_read && (
                          <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
                        )}
                      </div>
                      <p className="text-sm line-clamp-2 mb-1">
                        {notification.brief}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{notification.user_profiles?.username || 'Unknown'}</span>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {getTimeAgo(notification.created_at)}
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        
        {notifications.length > 0 && (
          <div className="border-t p-2 bg-muted/30">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setOpen(false);
                onViewAll();
              }}
              className="w-full text-xs"
            >
              <ExternalLink className="w-3 h-3 mr-2" />
              View All Notifications
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
