import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { 
  Mail, 
  Send, 
  Reply, 
  Inbox, 
  Outbox, 
  Paperclip, 
  User,
  Calendar,
  ChevronDown,
  ChevronRight,
  RefreshCw
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import type { Job } from '@/types';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface JobCommunicationsProps {
  job: Job;
}

interface Email {
  id: string;
  message_id: string;
  in_reply_to: string | null;
  subject: string;
  from_email: string;
  from_name: string | null;
  to_emails: any[];
  cc_emails: any[];
  body_text: string | null;
  body_html: string | null;
  email_date: string;
  direction: 'inbound' | 'outbound';
  is_read: boolean;
  attachments: any[];
  references: string[];
}

interface EmailThread {
  threadId: string;
  subject: string;
  emails: Email[];
  lastEmailDate: string;
  unreadCount: number;
}

export function JobCommunications({ job }: JobCommunicationsProps) {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [emails, setEmails] = useState<Email[]>([]);
  const [threads, setThreads] = useState<EmailThread[]>([]);
  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(new Set());
  const [showComposer, setShowComposer] = useState(false);
  const [replyToEmail, setReplyToEmail] = useState<Email | null>(null);
  const [syncing, setSyncing] = useState(false);

  // Composer state
  const [composeSubject, setComposeSubject] = useState('');
  const [composeTo, setComposeTo] = useState('');
  const [composeCc, setComposeCc] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    loadEmails();
  }, [job.id]);

  useEffect(() => {
    if (emails.length > 0) {
      organizeIntoThreads();
    }
  }, [emails]);

  async function loadEmails() {
    try {
      const { data, error } = await supabase
        .from('job_emails')
        .select('*')
        .eq('job_id', job.id)
        .order('email_date', { ascending: false });

      if (error) throw error;
      setEmails(data || []);
    } catch (error: any) {
      console.error('Error loading emails:', error);
      toast.error('Failed to load emails');
    } finally {
      setLoading(false);
    }
  }

  function organizeIntoThreads() {
    const threadMap = new Map<string, Email[]>();

    // Group emails by thread
    emails.forEach((email) => {
      // Use in_reply_to or message_id as thread identifier
      const threadId = email.in_reply_to || email.message_id;
      
      if (!threadMap.has(threadId)) {
        threadMap.set(threadId, []);
      }
      threadMap.get(threadId)!.push(email);
    });

    // Convert to thread objects
    const threadList: EmailThread[] = Array.from(threadMap.entries()).map(([threadId, threadEmails]) => {
      // Sort emails in thread by date
      threadEmails.sort((a, b) => new Date(a.email_date).getTime() - new Date(b.email_date).getTime());
      
      const unreadCount = threadEmails.filter(e => !e.is_read && e.direction === 'inbound').length;
      const lastEmail = threadEmails[threadEmails.length - 1];

      return {
        threadId,
        subject: threadEmails[0].subject,
        emails: threadEmails,
        lastEmailDate: lastEmail.email_date,
        unreadCount,
      };
    });

    // Sort threads by last email date
    threadList.sort((a, b) => new Date(b.lastEmailDate).getTime() - new Date(a.lastEmailDate).getTime());
    setThreads(threadList);
  }

  function toggleThread(threadId: string) {
    setExpandedThreads((prev) => {
      const next = new Set(prev);
      if (next.has(threadId)) {
        next.delete(threadId);
      } else {
        next.add(threadId);
        // Mark all emails in thread as read
        markThreadAsRead(threadId);
      }
      return next;
    });
  }

  async function markThreadAsRead(threadId: string) {
    const thread = threads.find(t => t.threadId === threadId);
    if (!thread) return;

    const unreadEmailIds = thread.emails
      .filter(e => !e.is_read && e.direction === 'inbound')
      .map(e => e.id);

    if (unreadEmailIds.length === 0) return;

    try {
      await supabase
        .from('job_emails')
        .update({ is_read: true })
        .in('id', unreadEmailIds);

      await loadEmails();
    } catch (error: any) {
      console.error('Error marking emails as read:', error);
    }
  }

  async function handleSyncEmails() {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('sync-emails', {
        body: { action: 'fetch' },
      });

      if (error) throw error;

      toast.success(data.message || 'Emails synced successfully');
      await loadEmails();
    } catch (error: any) {
      console.error('Error syncing emails:', error);
      toast.error('Failed to sync emails: ' + error.message);
    } finally {
      setSyncing(false);
    }
  }

  function handleReply(email: Email) {
    setReplyToEmail(email);
    setComposeSubject(`Re: ${email.subject.replace(/^Re: /, '')}`);
    setComposeTo(email.from_email);
    setComposeBody(`\n\n--- On ${new Date(email.email_date).toLocaleString()}, ${email.from_name || email.from_email} wrote:\n${email.body_text || ''}`);
    setShowComposer(true);
  }

  function handleNewEmail() {
    setReplyToEmail(null);
    setComposeSubject(`Job ${job.job_number || job.name}: `);
    setComposeTo(job.client_name || '');
    setComposeCc('');
    setComposeBody('');
    setShowComposer(true);
  }

  async function handleSendEmail() {
    if (!composeTo || !composeSubject || !composeBody) {
      toast.error('Please fill in all required fields');
      return;
    }

    setSending(true);
    try {
      const emailData = {
        jobId: job.id,
        subject: composeSubject,
        to: composeTo.split(',').map(e => ({ email: e.trim() })),
        cc: composeCc ? composeCc.split(',').map(e => ({ email: e.trim() })) : [],
        bodyText: composeBody,
        bodyHtml: `<p>${composeBody.replace(/\n/g, '<br>')}</p>`,
        inReplyTo: replyToEmail?.message_id,
        references: replyToEmail?.references || [],
      };

      const { data, error } = await supabase.functions.invoke('sync-emails', {
        body: { action: 'send', emailData },
      });

      if (error) throw error;

      toast.success('Email sent successfully');
      setShowComposer(false);
      await loadEmails();
    } catch (error: any) {
      console.error('Error sending email:', error);
      toast.error('Failed to send email: ' + error.message);
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading communications...</p>
        </CardContent>
      </Card>
    );
  }

  const unreadCount = emails.filter(e => !e.is_read && e.direction === 'inbound').length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CardTitle className="flex items-center gap-2">
                <Mail className="w-6 h-6" />
                Email Communications
              </CardTitle>
              {unreadCount > 0 && (
                <Badge variant="destructive">{unreadCount} unread</Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={handleSyncEmails} variant="outline" disabled={syncing}>
                <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
                Sync
              </Button>
              <Button onClick={handleNewEmail}>
                <Send className="w-4 h-4 mr-2" />
                New Email
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Email Threads */}
      {threads.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <Mail className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground mb-4">No email communications for this job yet</p>
            <Button onClick={handleNewEmail}>
              <Send className="w-4 h-4 mr-2" />
              Send First Email
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {threads.map((thread) => {
            const isExpanded = expandedThreads.has(thread.threadId);
            const lastEmail = thread.emails[thread.emails.length - 1];

            return (
              <Card key={thread.threadId} className={thread.unreadCount > 0 ? 'border-2 border-blue-300 bg-blue-50' : ''}>
                <Collapsible open={isExpanded} onOpenChange={() => toggleThread(thread.threadId)}>
                  <CollapsibleTrigger className="w-full">
                    <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3 flex-1 text-left">
                          {isExpanded ? (
                            <ChevronDown className="w-5 h-5 mt-1 flex-shrink-0" />
                          ) : (
                            <ChevronRight className="w-5 h-5 mt-1 flex-shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <h3 className={`font-semibold ${thread.unreadCount > 0 ? 'text-blue-900' : ''}`}>
                              {thread.subject}
                            </h3>
                            <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <User className="w-3 h-3" />
                                {lastEmail.direction === 'inbound' ? lastEmail.from_name || lastEmail.from_email : 'You'}
                              </span>
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {new Date(lastEmail.email_date).toLocaleString()}
                              </span>
                              {lastEmail.direction === 'inbound' && (
                                <Badge variant="outline" className="bg-blue-100 text-blue-700">
                                  <Inbox className="w-3 h-3 mr-1" />
                                  Received
                                </Badge>
                              )}
                              {lastEmail.direction === 'outbound' && (
                                <Badge variant="outline" className="bg-green-100 text-green-700">
                                  <Outbox className="w-3 h-3 mr-1" />
                                  Sent
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 ml-4">
                          {thread.unreadCount > 0 && (
                            <Badge variant="destructive">{thread.unreadCount} new</Badge>
                          )}
                          <Badge variant="outline">{thread.emails.length} {thread.emails.length === 1 ? 'email' : 'emails'}</Badge>
                        </div>
                      </div>
                    </CardHeader>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CardContent className="pt-0">
                      <div className="space-y-4 border-l-2 border-slate-200 pl-4 ml-2">
                        {thread.emails.map((email, idx) => (
                          <div key={email.id} className="space-y-2">
                            <div className="flex items-start justify-between">
                              <div>
                                <div className="flex items-center gap-2">
                                  <p className="font-medium">
                                    {email.direction === 'inbound' 
                                      ? (email.from_name || email.from_email)
                                      : 'You'}
                                  </p>
                                  <Badge variant="outline" className="text-xs">
                                    {email.direction === 'inbound' ? <Inbox className="w-3 h-3" /> : <Outbox className="w-3 h-3" />}
                                  </Badge>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                  {new Date(email.email_date).toLocaleString()}
                                </p>
                              </div>
                              {email.direction === 'inbound' && (
                                <Button size="sm" variant="outline" onClick={() => handleReply(email)}>
                                  <Reply className="w-3 h-3 mr-1" />
                                  Reply
                                </Button>
                              )}
                            </div>
                            <div className="bg-muted/50 rounded-lg p-3">
                              <p className="whitespace-pre-wrap text-sm">{email.body_text}</p>
                            </div>
                            {email.attachments && email.attachments.length > 0 && (
                              <div className="flex items-center gap-2">
                                <Paperclip className="w-4 h-4 text-muted-foreground" />
                                <p className="text-sm text-muted-foreground">
                                  {email.attachments.length} attachment{email.attachments.length !== 1 ? 's' : ''}
                                </p>
                              </div>
                            )}
                            {idx < thread.emails.length - 1 && (
                              <div className="border-t pt-4" />
                            )}
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </CollapsibleContent>
                </Collapsible>
              </Card>
            );
          })}
        </div>
      )}

      {/* Email Composer Dialog */}
      <Dialog open={showComposer} onOpenChange={setShowComposer}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="w-5 h-5" />
              {replyToEmail ? 'Reply to Email' : 'Compose New Email'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>To *</Label>
              <Input
                value={composeTo}
                onChange={(e) => setComposeTo(e.target.value)}
                placeholder="recipient@example.com"
              />
            </div>
            <div>
              <Label>CC (optional)</Label>
              <Input
                value={composeCc}
                onChange={(e) => setComposeCc(e.target.value)}
                placeholder="cc@example.com"
              />
            </div>
            <div>
              <Label>Subject *</Label>
              <Input
                value={composeSubject}
                onChange={(e) => setComposeSubject(e.target.value)}
                placeholder="Email subject"
              />
            </div>
            <div>
              <Label>Message *</Label>
              <Textarea
                value={composeBody}
                onChange={(e) => setComposeBody(e.target.value)}
                placeholder="Type your message here..."
                rows={12}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowComposer(false)}>
                Cancel
              </Button>
              <Button onClick={handleSendEmail} disabled={sending}>
                <Send className="w-4 h-4 mr-2" />
                {sending ? 'Sending...' : 'Send Email'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
