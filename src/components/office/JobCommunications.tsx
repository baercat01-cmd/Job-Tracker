import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Mail, 
  Send, 
  Reply, 
  Inbox, 
  Paperclip, 
  User,
  Calendar,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Users,
  Package,
  Briefcase,
  ExternalLink
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import type { Job } from '@/types';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

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
  entity_category: 'customer' | 'vendor' | 'subcontractor' | null;
  contact_id: string | null;
  contacts?: any;
}

interface EmailThread {
  threadId: string;
  subject: string;
  emails: Email[];
  lastEmailDate: string;
  unreadCount: number;
  entityCategory: string | null;
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
  const [contacts, setContacts] = useState<any[]>([]);
  const [activeFilter, setActiveFilter] = useState<'all' | 'customer' | 'vendor' | 'subcontractor'>('all');

  // Composer state
  const [composeSubject, setComposeSubject] = useState('');
  const [composeTo, setComposeTo] = useState('');
  const [composeCc, setComposeCc] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [sending, setSending] = useState(false);
  const [selectedContactId, setSelectedContactId] = useState('');

  useEffect(() => {
    loadEmails();
    loadContacts();
  }, [job.id]);

  useEffect(() => {
    if (emails.length > 0) {
      organizeIntoThreads();
    }
  }, [emails, activeFilter]);

  async function loadEmails() {
    try {
      const { data, error } = await supabase
        .from('job_emails')
        .select(`
          *,
          contacts(id, name, email, category)
        `)
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

  async function loadContacts() {
    try {
      const { data, error } = await supabase
        .from('contacts')
        .select('*')
        .eq('is_active', true)
        .order('category, name');

      if (error) throw error;
      setContacts(data || []);
    } catch (error: any) {
      console.error('Error loading contacts:', error);
    }
  }

  function organizeIntoThreads() {
    const threadMap = new Map<string, Email[]>();

    // Filter emails based on active filter
    const filteredEmails = activeFilter === 'all' 
      ? emails 
      : emails.filter(e => e.entity_category === activeFilter);

    // Group emails by thread
    filteredEmails.forEach((email) => {
      const threadId = email.in_reply_to || email.message_id;
      
      if (!threadMap.has(threadId)) {
        threadMap.set(threadId, []);
      }
      threadMap.get(threadId)!.push(email);
    });

    // Convert to thread objects
    const threadList: EmailThread[] = Array.from(threadMap.entries()).map(([threadId, threadEmails]) => {
      threadEmails.sort((a, b) => new Date(a.email_date).getTime() - new Date(b.email_date).getTime());
      
      const unreadCount = threadEmails.filter(e => !e.is_read && e.direction === 'inbound').length;
      const lastEmail = threadEmails[threadEmails.length - 1];

      return {
        threadId,
        subject: threadEmails[0].subject,
        emails: threadEmails,
        lastEmailDate: lastEmail.email_date,
        unreadCount,
        entityCategory: lastEmail.entity_category,
      };
    });

    threadList.sort((a, b) => new Date(b.lastEmailDate).getTime() - new Date(a.lastEmailDate).getTime());
    setThreads(threadList);
  }

  function getEntityColor(category: string | null) {
    switch (category) {
      case 'customer': return 'bg-green-100 text-green-800 border-green-300';
      case 'vendor': return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'subcontractor': return 'bg-blue-100 text-blue-800 border-blue-300';
      default: return 'bg-gray-100 text-gray-800';
    }
  }

  function getEntityIcon(category: string | null) {
    switch (category) {
      case 'customer': return <Users className="w-3 h-3" />;
      case 'vendor': return <Package className="w-3 h-3" />;
      case 'subcontractor': return <Briefcase className="w-3 h-3" />;
      default: return <Mail className="w-3 h-3" />;
    }
  }

  function toggleThread(threadId: string) {
    setExpandedThreads((prev) => {
      const next = new Set(prev);
      if (next.has(threadId)) {
        next.delete(threadId);
      } else {
        next.add(threadId);
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
    setSelectedContactId(email.contact_id || '');
    setComposeBody(`\n\n--- On ${new Date(email.email_date).toLocaleString()}, ${email.from_name || email.from_email} wrote:\n${email.body_text || ''}`);
    setShowComposer(true);
  }

  function handleNewEmail() {
    setReplyToEmail(null);
    setComposeSubject(`#${job.job_number || ''} ${job.name}: `);
    setComposeTo('');
    setComposeCc('');
    setComposeBody('');
    setSelectedContactId('');
    setShowComposer(true);
  }

  function handleContactSelect(contactId: string) {
    const contact = contacts.find(c => c.id === contactId);
    if (contact) {
      setComposeTo(contact.email);
      setSelectedContactId(contactId);
    }
  }

  function openInThunderbird(email: string) {
    window.location.href = `mailto:${email}`;
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
        contactId: selectedContactId || null,
        subject: composeSubject,
        to: composeTo.split(',').map(e => ({ email: e.trim() })),
        cc: composeCc ? composeCc.split(',').map(e => ({ email: e.trim() })) : [],
        bodyText: composeBody,
        bodyHtml: `<p>${composeBody.replace(/\n/g, '<br>')}</p>`,
        inReplyTo: replyToEmail?.message_id,
      };

      const { data, error } = await supabase.functions.invoke('sync-emails', {
        body: { action: 'send', emailData },
      });

      if (error) throw error;

      toast.success('Email sent successfully and synced to Thunderbird');
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
  const customerCount = emails.filter(e => e.entity_category === 'customer').length;
  const vendorCount = emails.filter(e => e.entity_category === 'vendor').length;
  const subcontractorCount = emails.filter(e => e.entity_category === 'subcontractor').length;

  return (
    <div className="space-y-4">
      {/* Header with Entity Filters */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CardTitle className="flex items-center gap-2">
                <Mail className="w-6 h-6" />
                Multi-Entity Email Communications
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

      {/* Entity Filter Tabs */}
      <Tabs value={activeFilter} onValueChange={(value: any) => setActiveFilter(value)}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="all">
            All ({emails.length})
          </TabsTrigger>
          <TabsTrigger value="customer">
            <span className="flex items-center gap-2">
              <Users className="w-4 h-4 text-green-700" />
              Customers ({customerCount})
            </span>
          </TabsTrigger>
          <TabsTrigger value="vendor">
            <span className="flex items-center gap-2">
              <Package className="w-4 h-4 text-orange-700" />
              Vendors ({vendorCount})
            </span>
          </TabsTrigger>
          <TabsTrigger value="subcontractor">
            <span className="flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-blue-700" />
              Subs ({subcontractorCount})
            </span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeFilter} className="mt-4">
          {/* Email Threads */}
          {threads.length === 0 ? (
            <Card>
              <CardContent className="text-center py-12">
                <Mail className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground mb-4">
                  {activeFilter === 'all' 
                    ? 'No email communications for this job yet'
                    : `No ${activeFilter} communications yet`}
                </p>
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
                  <Card 
                    key={thread.threadId} 
                    className={`${thread.unreadCount > 0 ? 'border-2 border-blue-300' : ''} ${thread.entityCategory ? getEntityColor(thread.entityCategory) : ''}`}
                  >
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
                                <h3 className="font-semibold">
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
                                  {lastEmail.entity_category && (
                                    <Badge variant="outline" className={getEntityColor(lastEmail.entity_category)}>
                                      {getEntityIcon(lastEmail.entity_category)}
                                      <span className="ml-1 capitalize">{lastEmail.entity_category}</span>
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 ml-4">
                              {thread.unreadCount > 0 && (
                                <Badge variant="destructive">{thread.unreadCount} new</Badge>
                              )}
                              <Badge variant="outline">{thread.emails.length}</Badge>
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
                                      {email.entity_category && (
                                        <Badge variant="outline" className={`text-xs ${getEntityColor(email.entity_category)}`}>
                                          {getEntityIcon(email.entity_category)}
                                        </Badge>
                                      )}
                                    </div>
                                    <p className="text-sm text-muted-foreground">
                                      {new Date(email.email_date).toLocaleString()}
                                    </p>
                                  </div>
                                  {email.direction === 'inbound' && (
                                    <div className="flex gap-2">
                                      <Button size="sm" variant="outline" onClick={() => handleReply(email)}>
                                        <Reply className="w-3 h-3 mr-1" />
                                        Reply via App
                                      </Button>
                                      <Button 
                                        size="sm" 
                                        variant="outline" 
                                        onClick={() => openInThunderbird(email.from_email)}
                                      >
                                        <ExternalLink className="w-3 h-3 mr-1" />
                                        Thunderbird
                                      </Button>
                                    </div>
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
        </TabsContent>
      </Tabs>

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
              <Label>Select Contact (Optional)</Label>
              <Select value={selectedContactId} onValueChange={handleContactSelect}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose from contacts or enter manually..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Manual Entry</SelectItem>
                  {contacts.map((contact) => (
                    <SelectItem key={contact.id} value={contact.id}>
                      <div className="flex items-center gap-2">
                        {contact.category === 'customer' && <Users className="w-3 h-3 text-green-700" />}
                        {contact.category === 'vendor' && <Package className="w-3 h-3 text-orange-700" />}
                        {contact.category === 'subcontractor' && <Briefcase className="w-3 h-3 text-blue-700" />}
                        <span>{contact.name} ({contact.email})</span>
                        <Badge variant="outline" className="text-xs capitalize">{contact.category}</Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
              <Label>Subject * (Include #{job.job_number} for auto-categorization)</Label>
              <Input
                value={composeSubject}
                onChange={(e) => setComposeSubject(e.target.value)}
                placeholder={`#${job.job_number || ''} ${job.name}`}
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
