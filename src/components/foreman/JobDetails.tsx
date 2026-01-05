
import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, FileText, FolderOpen, MapPin, Package, Bell } from 'lucide-react';
import { Label } from '@/components/ui/label';
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
      {/* Notifications Section */}
      {notifications.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Bell className="w-4 h-4" />
              Updates {unreadCount > 0 && <Badge variant="destructive" className="ml-auto">{unreadCount}</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {notifications.map((notification) => (
              <button
                key={notification.id}
                onClick={() => handleNotificationClick(notification)}
                className={`w-full text-left p-3 rounded-lg border transition-colors ${
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
          </CardContent>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="documents" className="flex items-center gap-2">
            <FolderOpen className="w-4 h-4" />
            Documents
          </TabsTrigger>
          <TabsTrigger value="materials" className="flex items-center gap-2">
            <Package className="w-4 h-4" />
            Materials
          </TabsTrigger>
        </TabsList>

        <TabsContent value="documents">
          {profile?.id && <DocumentsView job={job} userId={profile.id} />}
        </TabsContent>

        <TabsContent value="materials">
          {profile?.id && <MaterialsList job={job} userId={profile.id} />}
        </TabsContent>
      </Tabs>
    </div>
  );
}
