
import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

import { ArrowLeft, FileText, FolderOpen, MapPin, Package, Bell } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { MaterialsList } from './MaterialsList';
import { DocumentsView } from './DocumentsView';
import type { Job, DocumentFolder } from '@/types';

interface JobDetailsProps {
  job: Job;
  onBack: () => void;
  defaultTab?: string;
}

export function JobDetails({ job, onBack, defaultTab = 'documents' }: JobDetailsProps) {
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);

  useEffect(() => {
    loadNotifications();
    // Subscribe to new notifications
    const subscription = supabase
      .channel('job_notifications')
      .on('postgres_changes', 
        { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'notifications',
          filter: `job_id=eq.${job.id}`
        }, 
        () => {
          loadNotifications();
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [job.id]);

  async function loadNotifications() {
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('job_id', job.id)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      setNotifications(data || []);
      setUnreadCount((data || []).filter(n => !n.is_read).length);
    } catch (error) {
      console.error('Error loading notifications:', error);
    }
  }

  async function handleNotificationClick(notification: any) {
    // Mark as read
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notification.id);

    // Navigate based on notification type
    switch (notification.type) {
      case 'document_revision':
        setActiveTab('documents');
        break;
      case 'material_request':
      case 'material_status':
        setActiveTab('materials');
        break;
      default:
        break;
    }

    loadNotifications();
  }

  return (
    <div className="space-y-4">
      {/* Notifications Icon */}
      {notifications.length > 0 && (
        <div className="flex justify-end">
          <Popover open={showNotifications} onOpenChange={setShowNotifications}>
            <PopoverTrigger asChild>
              <Button 
                variant="outline" 
                size="sm" 
                className="relative h-9 w-9 p-0 rounded-none border-slate-300 bg-white hover:bg-slate-100"
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-destructive text-destructive-foreground text-xs font-bold flex items-center justify-center">
                    {unreadCount}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0 rounded-none border-slate-300" align="end">
              <div className="p-3 border-b bg-muted/30">
                <h4 className="font-semibold text-sm flex items-center gap-2">
                  <Bell className="w-4 h-4" />
                  Updates
                  {unreadCount > 0 && (
                    <Badge variant="destructive" className="ml-auto">
                      {unreadCount} new
                    </Badge>
                  )}
                </h4>
              </div>
              <div className="max-h-[400px] overflow-y-auto">
                <div className="p-2 space-y-1">
                  {notifications.map((notification) => (
                    <button
                      key={notification.id}
                      onClick={() => {
                        handleNotificationClick(notification);
                        setShowNotifications(false);
                      }}
                      className={`w-full text-left p-3 rounded-none border transition-colors ${
                        notification.is_read 
                          ? 'bg-card hover:bg-muted/50 border-border' 
                          : 'bg-primary/5 hover:bg-primary/10 border-primary/20'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm ${
                            notification.is_read ? 'font-normal' : 'font-semibold'
                          }`}>
                            {notification.brief}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {new Date(notification.created_at).toLocaleString()}
                          </p>
                        </div>
                        {!notification.is_read && (
                          <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0 mt-1" />
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      )}

      {profile?.id && <DocumentsView job={job} userId={profile.id} />}
    </div>
  );
}
